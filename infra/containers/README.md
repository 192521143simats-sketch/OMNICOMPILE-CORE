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

Images use the `local` tag during development, with MySQL tagged `8.4`. The language targets share dependency construction and install separate toolchains. Actual versions are detected at runtime. Browser and native clients submit work without installing the cloud toolchains on their devices.

The network is `omnicompile-network`. Persistent MySQL data resides in `omnicompile-data`. General-purpose `MYSQL` and its storage are outside this Compose application and its startup/shutdown scripts.

## Existing data

Before switching from the former uppercase project volume, run the following once with Docker ready.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Migrate-Project-Volume.ps1
```

The script stops known project writers, copies the original volume read-only, compares file checksums, and retains the original. It refuses to overwrite an existing destination. Startup refuses to silently initialize a replacement when the legacy volume exists without a migrated destination. Retain the original until SQL persistence checks pass. Never delete volumes to resolve a migration error.

## Enrollment and credentials

Startup creates a random compiler-service token in ignored `.runtime/compiler-service.token`. Compiler endpoints accept authenticated, bounded language operations over the internal Docker network. They have no published host port.

`scripts/Provision-Cloud-Workers.mjs` uses an administrator login to create a network and enroll and approve three native identities through existing APIs. The administrator authorizes these owned containers to contribute. Each native worker receives only its own enrollment credential. Private files stay in ignored `.runtime/cloud-workers`. Existing identities are reused. Revoked enrollments require an explicit replacement and are never silently re-enabled.

For hash-only administrator configuration, set `OMNICOMPILE_PROVISION_ADMIN_PASSWORD` in the invoking process before first provisioning. No administrator secret is placed in a language-worker image or credential file. Rotate/revoke worker identities through the existing admin controls.

## Execution boundaries

Compilation and verification run in language containers with a non-root account, read-only root, bounded temporary storage, process limits, memory/CPU limits and dropped capabilities. The coordinator has no native compiler toolchains or Docker socket. Linux compiler children additionally enter a Landlock filesystem allowlist. They can read installed application/toolchain files and write only their new task workspace. Mounted secrets and parent-process data are excluded. The wrapper fails closed when Linux Landlock is unavailable.

The native peer executes existing allow-listed task operations through protocol v2. Browser and Android workers retain their existing portable task capabilities. Language services independently rebuild submitted sources before artifacts are accepted. The service is trusted infrastructure. Rebuilding inside that service does not prove correctness against compromise of the service itself.

This profile compiles programs and produces artifacts. Submitted-program execution remains disabled under the existing execution policy. Landlock is an additional filesystem restriction and does not supply full VM or network isolation. Hostile-code production deployments require further isolation review, network restriction at the workload boundary, and provider-supported execution sandboxes. No per-job VM isolation or public deployment is claimed.

## Verification

```powershell
docker compose -f docker-compose.yml config --quiet
node scripts/Verify-Compose.mjs
node scripts/Verify-Docker-Compilers.mjs
npm run verify
```

The Compose verifier checks project SQL readiness, actual persistence after restart, service networking and frontend/API connectivity. Language job acceptance results are recorded in the engineering evidence report. Kubernetes preparation lives in `infra/kubernetes`; nothing here applies resources or invokes Vercel.
