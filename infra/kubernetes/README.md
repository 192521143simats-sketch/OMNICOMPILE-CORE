## Language service baseline - 2026-11-05

Preparation only. This revision has not been applied to a cluster.

The coordinator routes compiler verification and source processing through three
internal authenticated services on port4101. Their Deployments and Services are
`omnicompile-c-worker`, `omnicompile-python-worker` and `omnicompile-java-worker`.
Build their corresponding targets from `infra/containers/worker.Dockerfile` and
replace local image tags with verified registry digests before deployment.

Create `omnicompile-compiler` out of band with the key `token`. The same token is
projected as `/run/secrets/compiler-token` for the coordinator and each compiler
service. It is a backend compiler-service credential, never a browser secret.
Each language worker may additionally receive a separate Secret named
`omnicompile-<language>-worker-identity`, key `credential`. Issue that identity
through the existing scoped enrollment and administrator approval flow. Missing
optional identity leaves the compiler service available but does not enroll a
peer worker. Compiler service authentication and peer enrollment are separate.

The compiler pods run as UID1000 with read-only root filesystems, bounded memory
and temporary storage, dropped capabilities and no Kubernetes token. The ingress
policy allows compiler HTTP traffic only from coordinator pods and restricts
egress to coordinator port4100 and kube-system DNS. Adapt DNS selectors only
after inspecting the target cluster DNS deployment. This baseline does
not assert kernel-grade isolation for hostile source code or a deployed cluster.
One active coordinator remains required because socket ownership is process-local.
The MySQL PVC template retains data and uses the approved omnicompile-data name;
this does not move any local Docker volume or general-purpose database.

# Kubernetes preparation (not a running deployment)

Read-only local validation: `python infra/kubernetes/Validate.py` (kubectl + PyYAML).
Add `--openapi PATH_TO_OFFICIAL_SWAGGER_JSON` for offline upstream structural
schema validation (jsonschema required). `--render-bootstrap` emits the same
resources with app replicas zero for an explicitly approved migration-first rollout.
This renders resources and verifies cross-component contracts; it is not server-side
schema validation or a live deployment test.

Current detailed procedure: [DEPLOYMENT.md](DEPLOYMENT.md). Container recipes,
the API execution adapter and controlled migration Job/check-only startup now exist;
actual image builds and cluster acceptance must be recorded separately. The older
gate list below is retained with its pending implementation statements corrected.

This template is not launch-ready. No cluster/account/domain has been approved.
Placeholder images are deliberately not real release references. There are no
credentials in the manifests. Do not apply them unmodified.

## Required release gates before deployment

1. Build and test coordinator/web OCI images and replace both placeholder image
   references with verified registry digests. Root-context recipes are in
   infra/containers; package builds alone do not establish container compatibility.
2. Test the Kubernetes API execution adapter in a real authorized cluster.
   Existing Docker finalization cannot run just because these pods exist. No host
   Docker socket or privileged pod is supplied; execution is not secretly disabled.
3. Confirm ingress controller, its supported version and WebSocket behavior. The
   supplied annotations are nginx-specific, not universal Kubernetes behavior.
4. Replace example.invalid in ConfigMap and Ingress with approved DNS; configure
   explicit trusted ingress source CIDRs, not universal proxy trust.
5. Provision a storage class with retained persistent volumes and a tested backup
   destination. MySQL is internal-only. Verify the CNI enforces NetworkPolicy.
6. Configure omnicompile-runtime using a protected local env file or provider secret
   facility with DB_PASSWORD, MYSQL_ROOT_PASSWORD, ADMIN_USERNAME and an Argon2id
   ADMIN_PASSWORD_HASH. Do not include plaintext ADMIN_PASSWORD. Never commit the
   file or echo secret values. The coordinator receives explicit application
   keys only, not MYSQL_ROOT_PASSWORD. Limit secret-read RBAC and enable provider
   encryption at rest; Kubernetes Secrets alone are not a vault.
7. Configure TLS secret omnicompile-tls using provider/cert-manager procedures after DNS
   ownership validation. Never bypass certificate verification in deployed clients.

## Safe validation and rollout procedure

Local rendering, requiring no cluster and creating no resources:

```powershell
kubectl kustomize infra/kubernetes
```

After separate deployment approval and completion of the gates above:

```powershell
kubectl config current-context
kubectl apply --dry-run=server -k infra/kubernetes
kubectl diff -k infra/kubernetes
python infra/kubernetes/Validate.py --kustomization PATH_TO_REVIEWED_OVERLAY --render-bootstrap | kubectl apply -f -
kubectl -n omnicompile rollout status statefulset/omnicompile-mysql --timeout=300s
# Provision migration credentials/grants, then apply the reviewed migration Job.
kubectl apply -f PATH_TO_VERSIONED_MIGRATION_JOB
kubectl -n omnicompile wait --for=condition=complete job/REVIEWED_JOB_NAME --timeout=300s
kubectl apply -k infra/kubernetes
kubectl -n omnicompile rollout status deployment/omnicompile-coordinator --timeout=300s
kubectl -n omnicompile rollout status deployment/omnicompile-frontend --timeout=300s
kubectl -n omnicompile get pods,services,ingress,pvc
kubectl -n omnicompile logs deployment/omnicompile-coordinator --tail=100
```

Do not paste logs without reviewing for sensitive operational information. Verify
HTTPS API/session, browser WSS, native enrollment/task/results and remote devices
against the approved domain. Power off the development laptop during a separately
observed remote test; a local cluster or ADB reverse cannot pass that gate.

## Migration and upgrade boundaries

Exactly one active coordinator; Recreate intentionally trades availability for
correct process-local socket ownership. Existing migration ledger/advisory lock
serializes actual DDL; startup verifies frozen migration checksums. Do not increase
replicas or run competing migration controllers. The separate versioned migration
Job and check-only startup require actual cluster acceptance. Take a
verified backup before rollout. Never edit historical adopted migrations.

MySQL backups must include users, enrollments, task attempts, jobs, artifact bytes
and migration ledger. Create a consistent mysqldump using protected secret/env
delivery; store encrypted outside the pod/PVC. Restore into a separate database,
verify row counts and artifact digests, then test enrollment/task/readiness before
approving recovery. Existing isolated backup/restore tests do not prove a provider
backup schedule. Do not delete PVCs, run down -v or reset live data.

For an application rollback, retain prior image digests and run:

```powershell
kubectl -n omnicompile rollout undo deployment/omnicompile-coordinator
kubectl -n omnicompile rollout undo deployment/omnicompile-frontend
```

This does not roll back schema/data. If an older image is incompatible with the
adopted migration ledger, stop and use the tested recovery plan rather than edit
ledger rows. Release signing, downloads and cloud costs are separate gates.
