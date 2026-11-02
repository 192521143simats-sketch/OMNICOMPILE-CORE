# Cleanup inventory and review — 2026-11-02

## Scope and decision

Inspected the actual repository, Docker images/containers/mounts and both local MySQL endpoints. No database, table, volume, source, migration, package, Kubernetes manifest or verification document was deleted. The user requested an inventory before confirming unidentified data deletion. Empty tables are not evidence of obsolescence.

## Docker

| Resource | Purpose | Decision |
|---|---|---|
| mysql:8.4 / c-optiforge-mysql / localhost:3307 | Current Compose database | Keep; started existing container without recreating its volume |
| c-optiforge_mysql_data | Persistent application data (about 256 MB) | Keep |
| mysql:latest / MYSQL / localhost:3306 | Six unrelated project databases in external bind mount | Keep pending explicit schema-level review |
| gridx-coordinator:phase9 | Current verified coordinator image | Keep |
| gridx-web:phase9 | Current verified frontend image | Keep |
| gridx-execution:1 and :phase9 | Same sandbox filesystem; startup and verification references | Consolidated identical layers to image ae7ebbd536b9, retaining both tags |

Removed redundant image configuration 6d64a6c5aaff. Distinct image count reduced from six to five. The filesystem layers were already shared, so no substantial disk-space saving is claimed. No dangling images or build cache were present. A single image cannot replace these separate services.

## Current database

MySQL c_optiforge on port 3307 has 22 application tables. Approximate InnoDB row counts below are not exact counts or a basis for deletion.

| Table | Estimated rows | Purpose |
|---|---:|---|
| artifacts | 9 | Downloadable source, executable/JAR and build-report bytes and ownership metadata. |
| audit_events | 48 | Security and administrative event history. |
| auth_sessions | 6 | Revocable browser login sessions; distinct from legacy distributed sessions. |
| compilation_jobs | 4 | User-owned compiler jobs and lifecycle/progress. |
| distributed_networks | 2 | Reusable network admission policy and identity. |
| invitations | 0 | Legacy distributed-session invitations; retained for schema compatibility. |
| job_worker_availability | 0 | Own-job worker availability history. |
| network_enrollments | 3 | Device consent, enrollment and approval records. |
| network_identity_sequence | 0 | Stable network identity allocation; empty does not mean disposable. |
| nodes | 3 | Worker identity, capability, connection and credential state. |
| optimization_batch_tasks | 5 | C optimization batch/task relationships. |
| optimization_batches | 2 | Distributed optimization aggregation state. |
| password_reset_tokens | 1 | Hashed expiring reset-token state. |
| result_verifications | 0 | Result verification outcomes and audit history. |
| results | 5 | Accepted task outputs. |
| schema_migrations | 10 | Applied migration checksums/version ledger; never delete for cleanup. |
| sessions | 0 | Legacy distributed sessions, distinct from auth_sessions. |
| task_attempts | 5 | Durable leases, retries and execution attempt history. |
| tasks | 5 | Scheduled distributed tasks and requirements. |
| users | 2 | Accounts and password hashes. |
| worker_invitations | 0 | Current network invitation/admission controls. |
| worker_telemetry | 0 | Supported CPU/RAM measurements and timestamps. |

## Other databases requiring owner review

Port 3306: ticket_system, netsys, threatview, intrusion_detection_db, property_legacy and aegis_domain_db; 104 tables total. Detailed metadata and cautious name-based purpose descriptions are in ignored local `.runtime/DATABASE-REVIEW-2026-11-02.md`. No record contents or secrets were exported. The threatview.threat_feeds table alone occupies approximately 1.9 GB including indexes. Their source applications were not audited, so exact semantics and obsolescence are unverified. Keep MySQL system schemas mysql, sys, information_schema and performance_schema.

## Current files and packages to preserve

- apps/: coordinator, web, browser/native worker logic, Windows desktop app and native Android app.
- packages/: shared contracts/orchestration and existing C, Python and Java compiler implementations.
- package.json/package-lock.json and Gradle wrapper/configuration: reproducible dependency/build definitions.
- apps/coordinator/src/migrations/: immutable schema history, including 0011 compiler metrics; retain every migration.
- compose.yaml: current persistent MySQL infrastructure.
- infra/kubernetes/: resources.yaml (hosted services/config/storage), execution.yaml (isolated execution resources), migration-job.yaml (controlled schema upgrade), kustomization.yaml and deployment instructions. These are deployment templates, not evidence of a live cluster.
- docs/engineering/: active architecture, requirement ledger, decisions, overrides, protocol, acceptance and historical evidence. Earlier names/dates are provenance, not trash. docs/engineering/specification/ retains authoritative supplied requirements.
- Current Windows 0.1.1 installer/unpacked app and Android debug/unsigned release APK/AAB: retain generated deliverables in ignored build directories. Windows 0.1.0 baseline remains pending review because upgrade/install verification may need it.
- .runtime/toolchains, dependencies, signing/identity state, .env, backups and database dumps: preserve; never stage secrets or dumps.

## Deferred filesystem cleanup

Historical isolated fixture directories (~189 MB), report previews and older logs were identified. Automatic command review rejected recursive removal, including a second narrowly scoped preview-directory attempt; no workaround was used. No project filesystem deletion succeeded. Application logs/pid files were not treated as stale without verifying ownership. Unrelated personal documents were not scanned or deleted.

## Verification

Results are appended after fresh regression and isolated integration complete.

## Workspace packages

- apps/coordinator: @c-optiforge/coordinator, version 0.1.0.
- apps/web: @c-optiforge/web, version 0.1.0.
- apps/windows-worker: @c-optiforge/windows-worker, version 0.1.1.
- apps/worker: @c-optiforge/worker, version 0.1.0.
- packages/compiler-c: @c-optiforge/compiler-c, version 0.1.0.
- packages/compiler-java: @c-optiforge/compiler-java, version 0.1.0.
- packages/compiler-python: @c-optiforge/compiler-python, version 0.1.0.
- packages/contracts: @c-optiforge/contracts, version 0.1.0.
- packages/orchestration: @c-optiforge/orchestration, version 0.1.0.

Native Android: apps/android-worker (Gradle/Kotlin application). Current generated files: apps/android-worker/app/build/outputs/apk/debug/app-debug.apk; apps/android-worker/app/build/outputs/apk/release/app-release-unsigned.apk; apps/android-worker/app/build/outputs/bundle/release/app-release.aab. Current Windows installer: .runtime/windows-worker/releases/GRID-X-Worker-0.1.1-Windows-x64-Setup.exe. Unsigned/development artifacts are not certified production releases.

## Migration files

- 0001-existing-schema.mjs
- 0002-worker-invitations.mjs
- 0003-reusable-network-links.mjs
- 0004-task-attempt-leases.mjs
- 0005-task-cancellation.mjs
- 0006-task-policy-integrity.mjs
- 0007-attempt-failure-reasons.mjs
- 0008-compute-ownership.mjs
- 0009-user-preferences.mjs
- 0010-worker-approval.mjs
- 0011-compiler-metrics.mjs

Kubernetes client is installed, but `kubectl config current-context` reports no current context. No cluster resources were listed or deleted; manifests are retained. Current application database volume and the external MYSQL bind mount were inspected without changing contents.

## Directory scan

Recursive file-size inventory: .runtime approximately 1102 MiB; node_modules 241 MiB; apps (including generated Android/web builds) 207 MiB; docs 2.4 MiB; .git 2.3 MiB; packages 0.5 MiB; scripts 0.3 MiB. No source/dependency directory was classified as trash solely by age or size. .runtime/windows-worker contains current packaging and an older 0.1.0 upgrade baseline; .runtime/backups and the SQL snapshot are preserved.

## Fresh verification results

- Initial npm run verify: typechecks passed; 362 tests passed, two process-tree fixture cleanup failures (Windows EPERM unlink program.exe); build phase did not run in this chained command. Failure log retained locally.
- npx vitest run apps/worker/src/task-process.test.ts: 7/7 passed on isolated rerun without code changes.
- npm run build: passed; node --test scripts/*.test.mjs apps/windows-worker/*.test.mjs: 25/25 passed.
- npm run verify:metrics: passed against disposable isolated MySQL/coordinator fixture 1560eda2154cd93e; developer data untouched.
- Full npm run verify rerun: 364 tests passed, 11 opt-in Docker tests skipped; 25 script checks passed. Final build result recorded after process completion.
- Existing project MySQL is healthy; both original containers and all original persistent storage remain. No temporary fixture container remains. Git diff whitespace check passed.

Local logs: .runtime/cleanup-regression.log, cleanup-process-retest.log, cleanup-regression-retest.log, cleanup-build.log, cleanup-script-tests.log and cleanup-metrics.log. Logs are ignored; no secret files or database dumps are staged.

Full npm run verify rerun exited 0: all workspace typechecks and builds passed. No application source changes were required.

