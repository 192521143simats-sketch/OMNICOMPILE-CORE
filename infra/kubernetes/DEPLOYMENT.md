# Controlled Kubernetes foundation

No cluster/account/domain is configured or approved. Placeholder references cannot
be applied as a release. Local rendering and fake-API tests do not establish live
execution, containment, ingress, storage durability or public availability.

## Images

From repository root, build sequentially. `db-omnicompile-database:8.4` is the
approved local alias of official MySQL8.4; no native Windows/Android worker Docker
images exist or are implied. Native workers remain actual installable packages.

```powershell
docker pull mysql:8.4
docker tag mysql:8.4 db-omnicompile-database:8.4
docker build -f infra/containers/coordinator.Dockerfile -t be-omnicompile-coordinator:local .
docker build -f infra/containers/web.Dockerfile -t fe-omnicompile-frontend:local .
docker build -t oa-omnicompile-execution:local infra/sandbox
node infra/containers/Verify-Images.mjs
kubectl kustomize infra/kubernetes
```

Coordinator retains tsx because shared packages export TypeScript source. GCC,
Python and JDK support existing coordinator artifact verification, a separate
trusted-native boundary: the execution Job does not sandbox all compilation.
Web serves the built SPA on8080 as UID101. Ingress sends /api and /ws directly to
coordinator; relative same-origin client URLs need no build secret. No Docker
socket/executable, hostPath or privileged Pod is supplied.

Base tags are build inputs. Record build platform, base digests, scan results,
output image digests and compiler versions. Replace all runtime references with
verified registry digests in a protected local overlay. ARM requires actual ARM
builds/tests. Publishing requires separate approval; local build does not publish.

## Execution prerequisites and boundaries

Use Kubernetes>=1.30 for the supplied ValidatingAdmissionPolicy API. Install and
verify a sandbox RuntimeClass named `gvisor`, or change BOTH admission policy and
OMNICOMPILE_SANDBOX_RUNTIME_CLASS to the verified class. Inspect the handler and runtime
configuration and run actual containment probes; a name does not prove a sandbox.
Require a CNI enforcing deny-all ingress AND egress in omnicompile-execution; verify
DNS, services, metadata, internet and node-network denial from a submitted program.
Require kubelet podPidsLimit<=64, or an equally bounded verified runtime setting,
and verify node memory/CPU admission/swap policy. Kubernetes has no per-Pod PID
limit field. These are deployment blockers until measured.

Standard HTTPS API access verifies the projected service-account CA. Coordinator
can create/get/delete Jobs, create ConfigMaps and list Pods/read logs in a separate
namespace containing no app secrets. No Secret read or Pod exec permission exists.
Job-create RBAC alone cannot constrain Pod specs; admission requires the sandbox
class, no token mount, CPU/memory limits and only emptyDir/projected ConfigMaps.
Pod Security baseline rejects privileged, host-network and hostPath workloads.
Review RBAC and admission together; protect cluster-admin/policy mutation.

Payloads are bounded to24MB, chunked into <=400KB binary ConfigMap values and
projected only into the trusted init container. Init assembles an ephemeral memory
workspace. The trusted entry opens and unlinks the request before calling the
existing runner. Programs execute as UID65534; trusted controller remains UID0
with only SETUID/SETGID/CHOWN/KILL, read-only root and RuntimeDefault seccomp.
Programs receive no application secret or API token. ConfigMaps contain user code
and artifact bytes: restrict operator access and audit accordingly.

Existing backpressure permits two active executions/eight queued callers. Each
Job has no retry,45-second active deadline,512MiB/one CPU,memory workspace bounds,
60-second controller deadline and12MB API response bound. Runner enforces20-second
compilation,10-second program lifetime and64KiB combined output. Logs transport
trusted JSON evidence/optional ELF bytes, validated before publication. Abort
deletes only the created Job UID with foreground propagation; ConfigMaps are Job
dependents. TTL120 seconds collects finished Jobs after controller loss. Failed
cleanup is logged. Before untrusted execution, test actual cancellation/controller
death,quota/payload failure,output flood,fork/CPU/memory exhaustion,network denial
and artifact byte integrity in the target cluster.

## Secrets, migrations and rollout

1. Verify context/server version, runtime handler,CNI,admission,PID limit,ingress,
   TLS,retained storage class and external backup destination. Replace DNS,image
   placeholders and exact trusted ingress source CIDRs. Never bypass TLS checks.
2. Create protected `omnicompile-runtime` with DB_PASSWORD,MYSQL_ROOT_PASSWORD,
   ADMIN_USERNAME and Argon2id ADMIN_PASSWORD_HASH. No plaintext admin password.
   Create separate `omnicompile-migrations` with DB_USER/DB_PASSWORD for an explicitly
   provisioned schema-migration principal. App principal should have needed DML;
   migrator has needed DDL. Initial MySQL image setup creates only its configured
   user: provision/verify grants with a protected DBA procedure. Neither Job nor
   coordinator receives MySQL root credentials. Require provider encryption at
   rest and restrictive Secret RBAC; Kubernetes Secrets alone are no vault.
3. Take a consistent encrypted backup outside the PVC. Restore into a separate
   database; verify row counts,artifact digests,ledger,enrollment and task flow.
   Confirm PV Retain reclaim policy. Never reset databases/delete existing PVCs.
4. Render reviewed overlays; server dry-run/diff only after deployment approval.
   Apply namespace/config,protected secrets,policies and MySQL first. Do not start
   the new coordinator before migration completes. Stop the prior single active
   coordinator for schema changes.
5. Copy migration-job.yaml into the protected overlay; replace the release suffix with a
   DNS-safe version and use the EXACT coordinator image digest planned for rollout.
   Run one Job with OMNICOMPILE_MIGRATION_MODE=apply,wait for Complete,review safe logs.
   migrate.ts starts no server/sockets. Existing advisory lock serializes DDL;
   frozen checksums reject changed,newer or holey history. DDL failure has no
   automatic retry; inspect and explicitly rerun the idempotent procedure.
6. Start one coordinator with OMNICOMPILE_MIGRATION_MODE=check. It validates the exact
   ledger without CREATE/ALTER/INSERT migrations. Missing ledger,pending,changed
   or newer history fails startup. Recreate preserves process-local socket
   ownership. Never scale replicas until HA exists.

After approved overlays/prerequisites:

```powershell
kubectl config current-context
kubectl apply --dry-run=server -k PATH_TO_REVIEWED_OVERLAY
kubectl diff -k PATH_TO_REVIEWED_OVERLAY
python infra/kubernetes/Validate.py --kustomization PATH_TO_REVIEWED_OVERLAY --render-bootstrap | kubectl apply -f -
kubectl -n omnicompile rollout status statefulset/mysql --timeout=300s
kubectl apply -f PATH_TO_VERSIONED_MIGRATION_JOB
kubectl -n omnicompile wait --for=condition=complete job/REVIEWED_JOB_NAME --timeout=300s
kubectl apply -k PATH_TO_REVIEWED_OVERLAY
kubectl -n omnicompile rollout status deployment/coordinator --timeout=300s
kubectl -n omnicompile rollout status deployment/web --timeout=300s
```

The local image verifier creates only labelled disposable containers, an owned
Docker bridge network and tmpfs MySQL data. Only API/web ports are published on
loopback; MySQL has no host port. It does not read `.env`, mount developer data,
or publish anything. It checks separate migration apply/check processes,
coordinator readiness, admin login, network/pending enrollment and non-root SPA
serving. It is development-mode local container evidence, not production TLS or
Kubernetes evidence.

Local kustomize rendering is not schema/admission validation. No current context
exists; cluster server checks and all-language Kubernetes execution are blocked.
Readiness uses /ready; database-independent HTTP /live prevents database faults
from causing liveness restart loops.
Verify authenticated API/session,browser WSS,Windows/Android enrollment/tasks and
artifact download against approved public DNS. A separately observed external
test with the development laptop off is required for independent availability.

## CI build handoff (no automatic deployment)

Use an approved Linux runner with Docker, Node24 and the documented native
toolchains. Run `npm ci`, `npm run verify`, `npm run verify:artifacts`, and the
three image builds above sequentially. Run `node infra/containers/Verify-Images.mjs`
against disposable fixtures, render `kubectl kustomize infra/kubernetes`, and retain
logs, image IDs, dependency audit results and checksums as restricted CI artifacts.
Windows packaging requires a Windows runner; Android packaging requires the
pinned SDK/JDK/Gradle and separate authorized signing configuration.

This is a build procedure, not evidence that a remote CI pipeline ran. Registry
push, cluster credentials, protected environment approval and an actual deployment
job belong to a separately approved release. Do not attach production secrets to
untrusted pull-request jobs. A local image tag is not an immutable registry digest.
After approval, use a protected runner to execute the migration/check/rollout and
acceptance sequence in this document, recording actual target-cluster results.

## Rollback procedure

Retain prior digests,reviewed overlays,backup and migration evidence. `kubectl -n
omnicompile rollout undo deployment/coordinator` and web undo restore app revisions only.
Check schema compatibility first: older code rejects unknown/newer ledger entries.
Rollout undo does not roll back schema/data. Restore verified backup into a
separate database and validate before an explicitly approved cutover. Never edit
ledger rows/delete PVCs to force old code to start. Signatures,provider costs,
distribution hosting and public publishing remain separate gates.


## 2026-11-02 rebuild verification and database contract

The existing Kubernetes execution adapter remains authoritative. The rebuilt
manifests use the approved renamed namespace, ServiceAccount, bounded Job and
payload contracts. Existing enrolled devices must be re-enrolled after the
approved identity reset; old credential identities are not silently preserved.
MySQL is `db-omnicompile-database:8.4` (official MySQL8.4 base), database `omnicompile`, internal DNS `mysql:3306`, persistent
claim template `omnicompile-data` (actual StatefulSet PVC `omnicompile-data-mysql-0`). PVCs are
retained on scale-down and StatefulSet deletion. StorageClass/PV reclaim policy
must also be verified; this does not establish backup or high availability.
The separate general local Docker `MYSQL` server on loopback3306 and the app
container `OMNICOMPILE-DATA` on loopback3307 do not translate to public Kubernetes
ports or production root access. MySQL is internal
only; separate app/migration principals are intentional least privilege. The
user-supplied local password is never embedded in tracked manifests.

`migration-job.yaml` uses the valid DNS name `omnicompile-migrate-release`; replace its
release suffix with a reviewed lowercase release identifier before each rollout.
The Job is deliberately excluded from the application kustomization, so repeated
app applies cannot silently rerun migrations. Admission additionally checks init
container resource limits and rejects ephemeral debug containers. This policy
requires actual server dry-run and target-cluster containment verification.

Local commands:

```powershell
python infra/kubernetes/Validate.py
kubectl kustomize infra/kubernetes
kubectl config current-context
```

Verified locally: kubectl1.36.1/Kustomize5.8.1 rendering; PyYAML6.0.3 parsing and
local service/port/storage/migration/security contract checks. No current context
is configured. Kubernetes schema/admission checks, PVC durability, runtime/CNI
containment, HTTPS/WSS and remote access remain NOT VERIFIED. No resources were
created or published. Before deployment, run `kubectl apply --dry-run=server -k
PATH_TO_REVIEWED_OVERLAY` only after supplying an authorized cluster, real image
digests, domain/TLS, storage class, Secrets and verified sandbox RuntimeClass.


## Independent configuration re-review

`Validate.py --render-bootstrap` renders the same authoritative resources and
patches only coordinator/web replicas to zero in memory. First replace the base
DNS, image and configuration placeholders with the approved reviewed settings.
Apply the bootstrap render first, wait for MySQL, provision the protected
DB principals/Secrets, run the versioned migration Job to completion, then apply
the reviewed normal overlay to start one coordinator and the frontend. Applying
the normal template first may create failed check-only startup attempts; it is
not the controlled rollout sequence. Never apply bootstrap to an existing live
release without an approved maintenance window: it stops application pods.

Ingress `/api` and `/ws` go directly to coordinator, so TLS forwarding must be
configured on the selected ingress controller and its exact source CIDRs placed
in TRUSTED_PROXIES. Do not trust arbitrary client-supplied forwarding headers.
Nginx annotations assume an ingress-nginx-compatible controller; verify its
supported release/security status or substitute an approved controller and its
annotations. The web container reverse proxy is used for local Compose; it is
not a second required ingress hop. Same-origin browser WebSocket cookies and
Origin policy must pass actual TLS/WSS acceptance after provisioning.

Optional offline schema validation uses the official upstream Kubernetes
v1.34.0 `api/openapi-spec/swagger.json` (download to OS temp, not source):

```powershell
$schemaPath = Join-Path $env:TEMP 'omnicompile-kubernetes-v1.34.0-openapi.json'
Invoke-WebRequest 'https://raw.githubusercontent.com/kubernetes/kubernetes/v1.34.0/api/openapi-spec/swagger.json' -OutFile $schemaPath
if ((Get-FileHash -LiteralPath $schemaPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'd3b0cdc2fda15c753206d25ab459dc7c12df64e2fd652b6809687471ea751c37') { throw 'Unexpected schema bytes' }
python infra/kubernetes/Validate.py --openapi $schemaPath
Remove-Item -LiteralPath $schemaPath
```

JSON Schema validation checks manifest structure against upstream definitions;
it does not evaluate CEL admission expressions, cluster defaults, installed
RuntimeClasses, storage drivers, RBAC authorizations, Ingress implementation,
network policies or live readiness. Server dry-run and runtime acceptance remain
mandatory once an authorized cluster exists.


Re-review validation performed: official upstream v1.34.0 Swagger bytes SHA256
`d3b0cdc2fda15c753206d25ab459dc7c12df64e2fd652b6809687471ea751c37`;
63 contract/schema checks passed including rollout18 resources, migration Job,
and bootstrap18 resources. The first raw JSON Schema run rejected numeric ports
because Swagger v2 encodes Kubernetes IntOrString using a custom format; the
validator now explicitly translates only that documented primitive to string OR
integer. No manifest ports were falsified to satisfy the validator. Bootstrap
stdout was independently parsed and coordinator/web replicas were both0. No
schema files or temporary rendered test manifests are stored in the repository.
Web health probes now use its actual `/healthz` endpoint; coordinator liveness
uses `/live`, independently of MySQL readiness. Historical prior image names in
this active guide were updated to the rebuilt role-prefixed `be-`, `fe-`, `db-` and `oa-` image names.


## Approved full identity reset and deployment image contract

The maintained tree now uses `OMNICOMPILE_*` runtime keys, `@omnicompile/*`
workspace IDs, database `omnicompile`, application namespace `omnicompile` and
sandbox namespace `omnicompile-execution`. These are actual coordinated contract
changes, not branding-only aliases. Re-enroll worker devices against the renamed
coordinator. This does not migrate or certify old credentials automatically.

Local image names are `be-omnicompile-coordinator:local`,
`fe-omnicompile-frontend:local`, `db-omnicompile-database:8.4` and
`oa-omnicompile-execution:local`. Before deployment, push only with separate
approval and replace local tags with verified registry digests; the execution
adapter requires a digest and deliberately rejects the unresolved placeholder.
Database PVC names must be lowercase Kubernetes DNS labels. Thus Kubernetes uses
`omnicompile-data` (StatefulSet claim `omnicompile-data-mysql-0`), while Docker's
application container may be named `OMNICOMPILE-DATA`. Do not attempt an uppercase
Kubernetes object or volume name.

The image's default command performs local Compose startup migrations. The
Kubernetes coordinator explicitly overrides that command with the server process,
so it cannot independently run DDL. Its ConfigMap remains check-only. Only the
separate migration Job applies DDL. Both coordinator and migration Job use
read-only roots with bounded memory-backed temporary workspaces. Source compiler
verification still runs in this trusted coordinator boundary; the execution Job
is a distinct final-program isolation boundary and is not a claim that every
compilation subprocess is fully contained.
