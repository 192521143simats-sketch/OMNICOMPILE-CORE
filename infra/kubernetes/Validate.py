"""Read-only local manifest/contract validation; does not contact a cluster.
Requires kubectl and PyYAML. This is not Kubernetes server schema validation.
"""
from pathlib import Path
import json
import argparse
import copy
import sys
import re
import subprocess
import yaml

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--kustomization", type=Path, help="Reviewed overlay to render; defaults to this base")
parser.add_argument("--openapi", type=Path, help="Optional official Kubernetes swagger.json for offline schema checks (requires jsonschema)")
parser.add_argument("--render-bootstrap", action="store_true", help="Emit the same resources with app replicas zero for an approved migration-first rollout")
args = parser.parse_args()
root = Path(__file__).resolve().parent
render = subprocess.run(["kubectl", "kustomize", str(args.kustomization or root)], check=True, capture_output=True, text=True).stdout
docs = list(yaml.safe_load_all(render))
index = {(d["kind"], d["metadata"]["name"]): d for d in docs}
checks = []

def image_named(reference, name, local_tag):
    return reference == name + ":" + local_tag or bool(re.fullmatch(r"(?:[^\s]+/)?" + re.escape(name) + r"@sha256:[a-f0-9]{64}", reference))


def check(name, condition):
    checks.append({"check": name, "status": "PASS" if condition else "FAIL"})

check("Unique resource identities", len(index) == len(docs))
config = index[("ConfigMap", "omnicompile-config")]["data"]
check("MySQL service DNS and database", config["DB_HOST"] == "omnicompile-mysql" and config["DB_PORT"] == "3306" and config["DB_NAME"] == "omnicompile")
check("Controlled migrations and real executor", config["OMNICOMPILE_MIGRATION_MODE"] == "check" and config["OMNICOMPILE_EXECUTION_MODE"] == "kubernetes")
mysql = index[("StatefulSet", "omnicompile-mysql")]["spec"]
check("MySQL 8.4 build image reference", image_named(mysql["template"]["spec"]["containers"][0]["image"], "omnicompile-mysql", "8.4"))
check("Retained persistent database storage", mysql["volumeClaimTemplates"][0]["metadata"]["name"] == "omnicompile-data" and mysql["persistentVolumeClaimRetentionPolicy"] == {"whenDeleted": "Retain", "whenScaled": "Retain"})
for name in ["omnicompile-coordinator", "omnicompile-frontend"]:
    deployment = index[("Deployment", name)]["spec"]
    service = index[("Service", name)]["spec"]
    template = deployment["template"]
    check(name + " service selector", all(template["metadata"]["labels"].get(k) == v for k,v in service["selector"].items()))
    container = template["spec"]["containers"][0]
    check(name + " probes and bounded resources", all(k in container for k in ["readinessProbe", "livenessProbe", "resources"]))
    named_ports = {p["name"] for p in container["ports"]}
    check(name + " service target port", all(p["targetPort"] in named_ports for p in service["ports"]))
coordinator = index[("Deployment", "omnicompile-coordinator")]["spec"]
check("Coordinator bypasses local automatic migration entrypoint", coordinator["template"]["spec"]["containers"][0]["command"] == ["node", "--import", "tsx", "apps/coordinator/src/server.ts"])
check("Single coordinator socket owner", coordinator["replicas"] == 1 and coordinator["strategy"]["type"] == "Recreate")
check("No embedded Secret objects", not any(d["kind"] == "Secret" for d in docs))
check("No root credential in coordinator", not any(e["name"] == "MYSQL_ROOT_PASSWORD" for e in coordinator["template"]["spec"]["containers"][0]["env"]))
ingress = index[("Ingress", "omnicompile")]["spec"]
paths = {p["path"]:p["backend"]["service"]["name"] for p in ingress["rules"][0]["http"]["paths"]}
check("Same-origin API WebSocket and SPA routes", paths == {"/api":"omnicompile-coordinator", "/ws":"omnicompile-coordinator", "/":"omnicompile-frontend"})
check("TLS ingress", bool(ingress["tls"]))
policy = index[("NetworkPolicy", "execution-deny-all")]["spec"]
check("Execution network isolation", set(policy["policyTypes"]) == {"Ingress", "Egress"} and policy["ingress"] == [] and policy["egress"] == [])
role = index[("Role", "omnicompile-executor")]["rules"]
check("Executor no Secret read or pod exec RBAC", all("secrets" not in r["resources"] and "pods/exec" not in r["resources"] and "*" not in r["verbs"] for r in role))
migration = yaml.safe_load((root/"migration-job.yaml").read_text())
check("Explicit bounded separate migration Job", migration["spec"]["backoffLimit"] == 0 and migration["spec"]["activeDeadlineSeconds"] == 300 and migration["spec"]["template"]["spec"]["containers"][0]["command"][-1] == "apps/coordinator/src/migrate.ts")
bootstrap = copy.deepcopy(docs)
for resource in bootstrap:
    if resource["kind"] == "Deployment":
        resource["spec"]["replicas"] = 0
check("Bootstrap cannot start application before migrations", all(d["spec"]["replicas"] == 0 for d in bootstrap if d["kind"] == "Deployment"))
for name, resource in [("omnicompile-coordinator", coordinator), ("migration", migration["spec"])]:
    pod = resource["template"]["spec"]
    container = pod["containers"][0]
    check(name + " read-only root and bounded ephemeral workspace", container["securityContext"].get("readOnlyRootFilesystem") is True and any(v.get("emptyDir", {}).get("medium") == "Memory" and "sizeLimit" in v["emptyDir"] for v in pod.get("volumes", [])))
source = (root.parent.parent/"apps/coordinator/src/kubernetes-execution.ts").read_text()
check("Renamed execution environment contract", all("process.env." + key in source for key in ["OMNICOMPILE_SANDBOX_RUNTIME_CLASS", "OMNICOMPILE_EXECUTION_NAMESPACE"]) and config["OMNICOMPILE_EXECUTION_NAMESPACE"] == "omnicompile-execution")
check("App image names match rebuilt packages or immutable release references", image_named(coordinator["template"]["spec"]["containers"][0]["image"], "omnicompile-coordinator", "local") and image_named(index[("Deployment", "omnicompile-frontend")]["spec"]["template"]["spec"]["containers"][0]["image"], "omnicompile-frontend", "local") and migration["spec"]["template"]["spec"]["containers"][0]["image"] == coordinator["template"]["spec"]["containers"][0]["image"])
check("Database-independent coordinator liveness", coordinator["template"]["spec"]["containers"][0]["livenessProbe"]["httpGet"]["path"] == "/live")
for language in ["c", "python", "java"]:
    name = "omnicompile-" + language + "-worker"
    worker = index[("Deployment", name)]["spec"]
    pod = worker["template"]["spec"]
    container = pod["containers"][0]
    env = {item["name"]: item.get("value") for item in container["env"]}
    check(name + " remote compilation routing", config["OMNICOMPILE_" + language.upper() + "_COMPILER_URL"] == "http://" + name + ":4101" and env["OMNICOMPILE_COMPILER_LANGUAGE"] == language)
    check(name + " language image and port", image_named(container["image"], name, "local") and index[("Service", name)]["spec"]["ports"][0]["targetPort"] == "compiler")
    check(name + " isolated non-root bounded workspace", pod["automountServiceAccountToken"] is False and pod["securityContext"]["runAsNonRoot"] is True and container["securityContext"]["readOnlyRootFilesystem"] is True and container["resources"]["limits"]["memory"] == "1Gi")
    check(name + " secret references and no embedded credential", env["OMNICOMPILE_COMPILER_TOKEN_FILE"] == "/run/secrets/compiler-token" and all(item["name"] != "WORKER_CREDENTIAL" for item in container["env"]) and any(v.get("secret", {}).get("secretName") == "omnicompile-compiler" for v in pod["volumes"]))

if args.openapi:
    import jsonschema
    schema = json.loads(args.openapi.read_text(encoding="utf-8"))
    definitions = schema["definitions"]
    # OpenAPI v2 describes Kubernetes IntOrString as string + a custom format.
    # JSON Schema cannot infer that custom union, so represent the documented
    # Kubernetes primitive explicitly rather than reject valid numeric ports.
    for body in definitions.values():
        if body.get("format") == "int-or-string":
            body.pop("type", None)
            body["oneOf"] = [{"type": "string"}, {"type": "integer"}]

    schemas = {(v["group"] + "/" if v["group"] else "") + v["version"] + ":" + v["kind"]: name for name, body in definitions.items() for v in body.get("x-kubernetes-group-version-kind", [])}
    for resource in [*docs, migration, *bootstrap]:
        name = schemas.get(resource["apiVersion"] + ":" + resource["kind"])
        if not name:
            raise SystemExit("No official schema for " + resource["kind"])
        validator = jsonschema.Draft4Validator({"$ref": "#/definitions/" + name, "definitions": definitions})
        errors = sorted(validator.iter_errors(resource), key=lambda e: str(list(e.path)))
        check("Official OpenAPI schema " + resource["kind"] + "/" + resource["metadata"]["name"], not errors)
        for error in errors:
            print("Schema failure:", list(error.path), error.message, file=sys.stderr)
if args.render_bootstrap:
    if any(c["status"] == "FAIL" for c in checks):
        raise SystemExit("Bootstrap validation failed")
    print(yaml.safe_dump_all(bootstrap, sort_keys=False))
    raise SystemExit(0)
print(json.dumps({"validation":"local-render-and-contracts-only", "resourceCount":len(docs), "checks":checks, "liveDeployment":"NOT VERIFIED"}, indent=2))
raise SystemExit(1 if any(c["status"] == "FAIL" for c in checks) else 0)
