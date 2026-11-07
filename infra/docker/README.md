# Docker deployment

Run `START-OMNICOMPILE.bat` from the repository root. The authoritative Compose file is `docker-compose.yml`.

| Service and image | Responsibility | Host endpoint |
|---|---|---|
| omnicompile-coordinator | Authentication, jobs, scheduling, verification routing, persistent artifacts | 4100 |
| omnicompile-frontend | React application and same-origin API proxy | 5173 |
| omnicompile-mysql | MySQL 8.4, project database | 127.0.0.1:3307 |
| omnicompile-c-worker | GCC/G++, C task execution and authoritative C compilation | Internal 4101 |
| omnicompile-python-worker | CPython, Python task execution and authoritative Python processing | Internal 4101 |
| omnicompile-java-worker | JDK, Java task execution and authoritative Java compilation | Internal 4101 |
| omnicompile-executor | Private broker for disposable language containers | Internal 4102 |
| omnicompile-artifacts | Private S3-compatible artifact storage | Internal 9000 |

Images use the `local` tag during development, with MySQL tagged `8.4`. The language targets share dependency construction and install separate toolchains. Actual versions are detected at runtime. Browser and native clients submit work without installing the cloud toolchains on their devices.

Dockerfiles and image-specific files are grouped under `images/`. Startup, provisioning and database operator tools are in `operations/`. Docker acceptance checks are in `verification/`.

Language workers and the broker use `omnicompile-network`. The coordinator also uses `omnicompile-storage-network` to reach MySQL and artifact storage. MySQL listens on port 3307 and persists in `OMNICOMPILE-MYSQL`. Object storage persists in `OMNICOMPILE-ARTIFACTS` and has no published port. General-purpose `MYSQL` is outside this Compose project.

## Enrollment and credentials

Startup creates a random compiler-service token in ignored `.runtime/docker/secrets`. Compiler endpoints accept authenticated, bounded language operations over the internal Docker network. They have no published host port.

`infra/docker/operations/Provision-Cloud-Workers.mjs` uses an administrator login to create a network and enroll and approve three native identities through existing APIs. The administrator authorizes these owned containers to contribute. Each native worker receives only its own enrollment credential. Private files stay in ignored `.runtime/docker/cloud-workers`. Existing identities are reused. Revoked enrollments require an explicit replacement and are never silently re-enabled.

For hash-only administrator configuration, set `OMNICOMPILE_PROVISION_ADMIN_PASSWORD` in the invoking process before first provisioning. No administrator secret is placed in a language-worker image or credential file. Rotate/revoke worker identities through the existing admin controls.

## Execution boundaries

Compilation and verification run in language containers with a non-root account, read-only root, bounded temporary storage, process limits, memory/CPU limits and dropped capabilities. The coordinator has no native compiler toolchains or Docker socket. Linux compiler children additionally enter a Landlock filesystem allowlist. They can read installed application/toolchain files and write only their new task workspace. Mounted secrets and parent-process data are excluded. The wrapper fails closed when Linux Landlock is unavailable.

The native peer executes existing allow-listed task operations through protocol v2. Browser and Android workers retain their existing portable task capabilities. Language services independently rebuild submitted sources before artifacts are accepted. The service is trusted infrastructure. Rebuilding inside that service does not prove correctness against compromise of the service itself.

The private broker launches disposable language containers for eligible compilation and program execution. Each job runs without network access or host mounts, with a non-root user, a read-only root filesystem, and bounded resources, output and runtime. The broker alone has Docker daemon access and is a privileged trust boundary. These controls provide container isolation. Public hostile-code workloads require a separate isolation review.

## Verification

```powershell
docker compose -f docker-compose.yml config --quiet
node infra/docker/verification/Verify-Compose.mjs
node infra/docker/verification/Verify-Docker-Compilers.mjs
node infra/docker/verification/Verify-Docker-Execution.mjs
npm run verify
```

The Compose verifier checks project SQL readiness, actual persistence after restart, service networking and frontend/API connectivity. Language job acceptance results are recorded in the engineering evidence report. Kubernetes preparation lives in `infra/kubernetes`; nothing here applies resources or invokes Vercel.
