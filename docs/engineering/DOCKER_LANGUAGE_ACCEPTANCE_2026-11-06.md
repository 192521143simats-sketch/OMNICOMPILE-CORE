# Docker language worker acceptance — 6 November 2026

## Delivered configuration

`docker-compose.yml` replaces the former Compose filename. Six project services use the approved names and matching image tags.

| Service | Actual runtime responsibility |
|---|---|
| omnicompile-coordinator | Fastify, authentication, scheduling, MySQL state, compiler verification routing |
| omnicompile-frontend | Built React application, API reverse proxy |
| omnicompile-mysql | MySQL 8.4.13, host loopback port 3307 |
| omnicompile-c-worker | GCC 12.2.0, G++, native C tasks and C verification |
| omnicompile-python-worker | CPython 3.14.8, Python tasks and verification |
| omnicompile-java-worker | javac 21.0.13, Java tasks and verification |

The network is `omnicompile-network`; the active persistent volume is `omnicompile-data`. C++, although its compiler is installed in the C image, has no separately advertised application language pipeline.

The general-purpose `MYSQL` container was left stopped in its original state. Its existing `mysql-data` volume and `db-omnicompile-database:8.4` image reference were retained. That tag and `mysql:8.4` share the upstream bytes used by the project image alias. Startup/shutdown now operate on project services only.

## Architecture and security

Existing worker enrollment, administrator approval, network identity, protocol v2, task attempts and result verification remain authoritative. The three cloud peers use independent scoped credentials. Startup provisions through existing authenticated APIs, persists private state in ignored `.runtime/cloud-workers`, and reuses the saved enrollments. Revoked identities require explicit replacement.

The coordinator image contains no GCC, G++, Python or Java toolchain. It sends native verification and final C IR compilation to authenticated internal language endpoints. Compiler services validate source/IR schemas, language, filenames, payload size and admission limits. Busy responses are retried within a shared cancellation/timeout bound. An unavailable configured service fails rather than silently compiling on the coordinator.

Language containers run non-root with read-only roots, bounded temporary storage, CPU/memory/process limits and dropped capabilities. Compiler subprocess environments exclude coordinator, administrator, database and worker credentials. A fail-closed Linux Landlock wrapper restricts subprocess filesystem access to installed toolchains, application code, limited runtime information and the newly created task workspace. `/run/secrets` and parent-process data are excluded.

The compiler service is trusted infrastructure. Recompilation there is an independent source check, not proof against compromise of that service. Landlock supplies filesystem restrictions, not VM isolation or complete network isolation. Submitted-program execution remains disabled in this Compose profile; build reports accurately state that execution was not performed. This change provides actual compilation and artifacts, not a new unrestricted program execution service.

## Data preservation

The migration stopped only known old project writers, mounted `OMNICOMPILE-DATA` read-only, copied it into `omnicompile-data` and compared SHA-256 manifests. The original volume remains available for rollback. The destination was never overwritten after starting the revised database.

The persistence check created and removed an owned random test schema, restarted only project MySQL, recovered the marker, and confirmed that existing administrator identity/password-hash fingerprints were unchanged. The project retains one administrator, three enrolled available cloud workers and its migration ledger. No application reset was performed.

## Actual test evidence

| Command or check | Result |
|---|---|
| `npm run verify` using Node 24.21.0 and host GCC on D drive | PASS, all workspace typechecks/builds, 368 tests and 29 script checks; 11 opt-in execution tests skipped |
| `vitest run apps/coordinator/src/compiler-service.test.ts` after final admission retry | PASS, three behavioral tests including actual HTTP transport, metadata stripping and concurrent busy handling |
| Coordinator typecheck after final retry | PASS |
| `docker compose build` and final four changed-image rebuild | PASS |
| `Start-Containers.ps1` and saved enrollment reuse | PASS, six healthy services |
| `node scripts/Verify-Docker-Compilers.mjs` | PASS, fixture `08cc034adaeb5817`, nine sequential cases plus two concurrent C jobs |
| `node infra/docker/Verify-Images.mjs` | PASS, fixture `adba05d72bb5cc11`, controlled migration apply/check, auth, user metrics/RBAC, proxy and SPA routing, non-root, toolchains absent on coordinator |
| `node scripts/Verify-Compose.mjs` | PASS, MySQL persistence, preserved admin credentials, DNS, six services, API/frontend recovery |
| `python infra/kubernetes/Validate.py --openapi <official v1.34 schema>` | PASS, 89 schema/contract checks across 25 rendered resources |
| CI YAML parsing and `git diff --check` | PASS |

The full workspace run preceded the final bounded admission retry. The retry then passed its targeted behavioral test, coordinator typecheck, rebuilt Docker images and the final Docker end-to-end run.

### Docker job cases

| Submitted file | Expected and observed result |
|---|---|
| Ledger.c | COMPLETED, real ELF executable, source and reports downloadable |
| loop.c | COMPLETED, existing C IR/distributed aggregation path and final executable |
| ledger.py | COMPLETED, generated Python source and reports downloadable |
| Ledger.java | COMPLETED, actual JAR and reports downloadable |
| broken.c | FAILED with compiler diagnostics and no fabricated executable |
| broken.py | FAILED with compiler diagnostics and no fabricated bytecode |
| Broken.java | FAILED with compiler diagnostics and no fabricated JAR |
| secret.c | FAILED, protected worker credential read denied |
| parent.c | FAILED, parent-process environment read denied |
| Concurrent Ledger.c and loop.c submissions | Both COMPLETED |

The test confirmed language-specific profiles and node assignments, accepted result rows, 12 VERIFIED verification records, successful artifact downloads and rejection of another user's download attempts. A direct authenticated compiler-service probe also denied reading its own service token and found no token in the response. The coordinator had no native compiler commands available. No submitted program was executed by these tests.

## Failures corrected

- An early fixture was interrupted by a simultaneous persistence restart. Cleanup now reconnects independently and preserves the original test failure when reporting cleanup problems. The abandoned fixture schema was removed by its exact known name.
- The first secured routing run rejected `createdAt` from a stored source object. A failing behavioral test reproduced this; verification now serializes only the required source fields.
- A concurrent verification was rejected when the service was busy. A failing actual HTTP test reproduced this; bounded retry/cancellation now handles the service's admission response.
- Compiler secrets were initially readable to compiler children. The Linux filesystem allowlist now denies those reads; actual compilation and malicious include probes passed against rebuilt images.

## Cleanup and delivery boundaries

Removed the three stopped superseded uppercase project containers, the known abandoned disposable MySQL container, and the old backend/frontend image tags. The final Docker tests removed their owned containers, temporary schemas, private temporary credential directories and isolated networks. No dangling images remained at inspection. The original project volume, active project volume and general MySQL volume were retained.

Runtime credentials, `.env`, generated packages, compiled test outputs and dependency directories remain ignored. Source regression checks are maintained with the implementation.

Kubernetes manifests now describe the language services, secret references, coordinator routing, resource constraints and network policy. They passed static validation only. No Kubernetes deployment, Vercel action, registry publication or public internet acceptance occurred. CI was updated to reproduce image and Docker compiler checks; a hosted GitHub Actions run is not claimed here.

## Commands

```bat
START-OMNICOMPILE.bat
STOP-OMNICOMPILE.bat
```

Open `http://localhost:5173`. Existing administrator credentials still apply. Hash-only administrator environments require a process-scoped `OMNICOMPILE_PROVISION_ADMIN_PASSWORD` for local worker provisioning. For exact migration and runtime boundaries, see `infra/docker/README.md`.
