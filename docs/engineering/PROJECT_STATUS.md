# OmniCompile Core master implementation status

## 2026-11-01 — product identity and own-job live metrics

Faculty title: **OmniCompile Core: A Zero-Trust, Fault-Tolerant Distributed Compiler
Pipeline for Heterogeneous Edge-to-Cloud Orchestration**. Existing architecture,
MySQL data, auth, compiler/worker contracts and installed identities are retained.
Technical legacy names remain for compatibility, not as alternate product names.

Five live user compiler indicators now use MySQL-backed owner-only aggregates,
raw coordinator receipt times, scheduler-qualified participant availability,
separate supported CPU/RAM observations, and durable named verification records.
The USER-only endpoint rejects administrators and other owners. Indicators are
below Compile and optimize, not in artifacts. See OMNICOMPILE_METRICS.md and
OMNICOMPILE_ACCEPTANCE.md for formulas, scope, evidence and failed/retest history.

Final full verification:364 tests and25 script checks pass, all workspace
typechecks/builds pass. Actual web all-language workflow `4d86c82d4cd2c0c9`,
artifact/migration regression `11f9c112a7d6bedb`, expanded metrics
`f6e1da1b2fd71643`, leases `77ad922198a783d8` and recovery
`0ec301f6eb8c4d0d` pass. Windows installer and Android debug/unsigned release
APK/AAB/lint are built;27 Android JVM tests pass. Current phone absent, so no new
physical installation or three-platform acceptance is claimed. Public hosting,
production signing, universal host compiler containment and Phase9–11 external/
operations/release gates remain open. No database reset or public publication.

Final follow-ups: full suite364/25 again passes; current API fixture
`0aac12a004c05870` additionally proves verification-gated native success, live
socket qualification, shared-IP independent owner quotas and legacy ID syntax.
Final web `5de7ef1b62d6540a`, packaged browser/Windows mixed
`0fafabff7393e2ff`, all11 actual Docker execution unit tests, and final real-image
smoke `c9b48d803078e719` pass. Read the acceptance record for failures and fixes;
no phone/public Kubernetes acceptance is implied.

The dated status sections below are historical evidence, not current branding.

## Phase9 local integration increment — 2026-10-17 (not globally sealed)

Approval-gated reusable enrollment, credential rotation/import, real local package
downloads, permanent terminal UI, image recipes, controlled migration startup and
Kubernetes execution templates are implemented without replacing the existing
compiler or MySQL architecture. See PHASE9_LOCAL_ACCEPTANCE.md and
PHASE9_DEPLOYMENT_EVIDENCE.md for current evidence and failed/retest history.
Latest repository verification: 351 Vitest passes, 24 script passes and all
workspace typechecks/builds. Eleven default-skipped Docker execution tests passed
separately with the actual sandbox image. Android 27 JVM tests and full APK/AAB/
lint build passed; five isolated physical UI/compute tests passed before the phone
was disconnected. Updated network-rotation instrumentation is built, not device-
accepted. User requested continuing without the absent phone.

Actual web fixture `690dd0a356b83756`, mixed browser/packaged-Windows fixture
`d5d8f191c2def565`, compiler artifacts `f1a85f72e523731c`, Docker execution/report
fixture `72efe6b512060d43`, durable leases `2e7f90b18428a23a` and recovery
`0717d3a94cb99de2` passed. The final UI keeps the approved existing layout and
polishes typography, forms, tables and mobile spacing; it is not a replacement
navigation design. Three-platform acceptance, public hosting, live Kubernetes,
signing and laptop-off independence remain open. No public resource was provisioned.

The initial status below is historical; it is not the current implementation map.

## Phase9 initial implementation — 2026-10-16 (not sealed)

Current request expands Phase9 with public independence, unified platform joining,
administrator approval, terminal dark-only UI, Kubernetes and practical security.
See PHASE9_EXECUTION.md, PHASE9_THREAT_MODEL.md and the preserved Phase9 master.
Existing Phase8 functionality is preserved. Production endpoint guards now reject
known local/private/development destinations, with reviewer-driven IPv6/reserved
DNS regressions. Full verification: 328 tests, 17 script checks, nine workspace
builds/typechecks. Fresh individual compiler/browser/Windows/physical-Android
acceptance passed. Actual browser/Windows mixed fixture 217c46fafff87fe4 passed,
including independently attributed post-restart work and original identity checks.

Kubernetes templates render locally but are not deployed or launch-ready. No
provider, cluster or domain is configured/approved; no public resource was created.
Container images/recipes, Kubernetes-safe compiler execution, controlled migration
Job, public downloads, approval/rotation flow, terminal UI overhaul, three-platform
simultaneous acceptance and public laptop-off verification remain open. Do not
infer that prior individual device tests close these new Phase9 requirements.

## Phase8 native Android functional checkpoint — 2026-10-15

Implementation 5a831c3 is pushed to origin. Native Kotlin/Compose debug APK is
installed on Xiaomi M2004J19C/API29. Physical Keystore/compute/consent tests and
isolated MySQL/coordinator acceptance passed: real portable results, C IR work,
restart recovery, cancellation, pause/recreation/resume/disconnect/leave and
authorized final artifact downloads. Compiler artifact regressions also passed.
See PHASE8_VERIFICATION.md for exact scope and unclaimed release boundaries.

Final theme follow-up passed: automatic paired light/dark palettes, native system
bars and OEM force-dark opt-out; 25 JVM tests, 5 physical tests, build/lint and
fresh isolated Android integration `6f90f70b244a9fa2`. Phase8 functional v1 is
accepted against all nine B20 exit obligations. Production signatures/newer-Android certification are not
claimed. Next dependency-ordered phase is Phase9 cross-platform integration,
not another compiler rewrite.

## Phase7 functional v1 sealed — 2026-10-15

The user explicitly accepts the functional Windows native-node scope and excludes
production-only installations/development. PHASE7_FUNCTIONAL_ACCEPTANCE.md is the
current acceptance record; USER_REQUIREMENT_OVERRIDES.md preserves the exact scope.
Fresh actual install/upgrade, native tasks and C/Python/Java compiler attempts,
coordinator restart/recovery, revoke/leave, uninstall/reinstall and final uninstall
passed (`cb241f55ee0a452e`). Reinstall preserved encrypted settings and the cleared
enrollment without automatic contribution. Review-driven failure-cleanup and
bounded-close tests passed. Fresh full verification: 327/327 tests, 15/15 script/
settings checks and all nine builds/typechecks passed. The application remains
the verified 0.1.1 build; no new OS software or compiler distributions were installed.

This is a functional seal, not a production certificate: unsigned installer,
compatible host-toolchain requirements and trusted-native-execution boundaries
remain truthful. Original stricter production entries below are historical, not
failed functional gates under the later user override. Next is Phase8 native Android.

## Phase 7 Windows worker — in progress, 2026-10-15

Added a real Electron desktop consuming the existing native protocol/session,
DPAPI-protected identity, explicit controls, measured monitoring, scoped persisted
coordinator statistics, Windows Job Object CPU/memory/lifetime enforcement and
an unsigned NSIS package with a checksum-pinned private Node runtime. Actual
packaged desktop/MySQL acceptance passed in fixture `6e34af04f6be459d`.
Final Docker-enabled verification passed all nine workspace builds/typechecks,
327 tests with none skipped, and twelve script/settings tests. Installation/upgrade/
uninstall passed, including coordinator-restart recovery and C/Python/Java
compilation on the installed worker. Compiler-artifact, Phase4 recovery and
desktop/Android-emulated browser regressions passed; all eleven Docker isolation
cases also passed separately.
See evidence/2026-10-15-phase7-windows/RESULTS.md. This entry does not seal Phase 7:
clean supported-Windows evidence, bundled compiler toolchains, full untrusted
native containment and production signatures are not inferred from developer tests.

## Phase 6 browser core sealed v1 — 2026-10-14

Seven B20 browser-core obligations passed real desktop and mobile-emulated
HTTPS/WSS integration with isolated MySQL. Fresh verification: 318 tests, five
script tests, eight workspace builds/typechecks and compiler/Phase 4/web
regressions. See PHASE6_ACCEPTANCE.md and its linked evidence. Physical Android
acceptance passed (836139ed765adc44, exit 0), using manual taps and independent
persisted-result assertions. Public-internet deployment is not configured or
claimed. This external deployment gate
is not hidden by the browser-core acceptance; native packages remain later phases.

## Phase 5 web product sealed v1 — 2026-10-14

Eleven B20 web obligations and its actual browser-to-backend exit gate passed.
Authoritative scope: PHASE5_ACCEPTANCE.md and evidence/2026-10-14-phase5-seal/RESULTS.md.
302 tests, five script tests, eight builds/typechecks, isolated compiler and
Phase 4 failure regressions passed. Optional provider live delivery, physical
devices and native packages are not inferred from this seal. Next is Phase 6.
The foundation entry below is historical, superseded by this acceptance.

## Phase 5 web foundation — 2026-10-14

Phase 4 v1 remains sealed; its isolated closure fixture passed again in instance
`01a5f49cbddc11a0` (real MySQL/coordinator restarts, pause/cancellation,
backoff/deadline/history, native catalogue execution and isolated backup restore).

Phase 5 is **IN PROGRESS, not sealed**. Repaired empty/large table pagination,
accessible feedback and malformed/unavailable HTTP response handling. Independent
review found stale owning page state after totals shrink; an actual React-DOM
regression failed before the fix and passed afterward. Existing route targets,
authorization, MySQL model, compiler and worker behavior are preserved. Removed
only the two unused legacy admin/user dashboard components.

Fresh verification: 269/269 tests in 40 files with Docker tests enabled,
3/3 script checks, all eight workspace typechecks/builds and zero npm advisories.
Details and red/green failures: evidence/2026-10-14-phase5-web-foundation/RESULTS.md.

Exact next task: complete auth pending/error behavior and keyboard onboarding,
then existing-engine owner-scoped Compute Tasks UI/API, administrator detail/live
state, settings and configurable privacy-safe Resend/PostHog adapters. Actual
browser-to-MySQL user/admin acceptance must pass before a Phase 5 seal. See
PHASE5_IMPLEMENTATION_PLAN.md. No physical device, provider delivery, package or
public deployment acceptance is claimed.

## Current authoritative milestone — 2026-10-14

**Phase 4 v1 is SEALED: 8/8 master Phase 4 exit obligations, 6/6 closure gates (100% of defined Phase 4 acceptance).** Prior incomplete-Phase-4 paragraphs below are historical snapshots superseded by this section, not the current backlog.

Implementation commit `01f3bd4397613b37e9e894106691113e7dd0ea4d` is pushed to the requested origin on `engineering/omnicompile-release-foundation`, with matching remote hash. Added durable task admission/priority/retry policy, jitter/backoff, policy/reliability eligibility, matrix/benchmark catalogue, cancellable coordinator native finalization and parent-loss cleanup, artifact digests/rollback and failure attribution. Fixed actual network-expiry assignment and result-publication races using post-lock MySQL time. Migrations 0001–0005 remain unchanged; appended 0006/0007.

Fresh final checks: 252/252 Docker-enabled tests in 36 files, 3/3 script safety tests, all eight workspace type checks/builds; isolated all-language artifact/protocol/InnoDB, durable leases, real coordinator/MySQL restart/outage, cancellation, execution, enrollment and reusable-admission suites passed. Actual native worker execution and isolated dump/restore passed. No developer records/volumes/secrets reset or changed. Details, failures and exact commands: PHASE4_ACCEPTANCE.md and evidence/2026-10-14-phase4-seal/RESULTS.md.

**Exact next phase: Phase 5 — web product.** Inspect and finish real landing/auth/user/admin/Compute Tasks journeys, details/history/downloads/pagination/live state, accessibility and responsive behavior; verify browser-to-API-to-MySQL flows. Preserve explicit user UI overrides. **Phase 6 — browser worker** then verifies actual bounded execution, pause/background/reconnect/tab closure and cancellation in real browsers/mobile where available. Windows packaging, native Android APK, physical-device/heterogeneous and release/security gates remain later; this Phase 4 seal does not claim them.

## Verified baseline — 2026-10-12

Repository: existing OMNICOMPILE workspace, origin shown by `git remote -v`. Baseline `c099807a384a036deebc6f8a4f99963ba52710c4`, clean `main`; implementation branch `engineering/omnicompile-release-foundation`.

Both attached texts fully read. Preserved master and SHA-256-backed line ledger retain M0–M4 and both full source bodies. This record supersedes historical completion claims for the new cumulative requirements, without deleting historical evidence.

Eight npm workspaces: Fastify coordinator, React/Vite web, Node worker, contracts, orchestration, C, Python and Java compiler packages. Existing features include Argon2id/MySQL sessions, signup/reset, scoped networks/nodes/tasks/attempts, heartbeat/retries, adaptive historical scoring, real language artifacts and authorized downloads. These are foundations, not full release verification.

Checks before source modification:

- `npm audit --json`: zero advisories.
- `npm ls --depth=0`: dependencies installed without reported invalid workspace dependencies.
- `docker compose config --quiet`: valid existing configuration.
- `npm run verify`: typechecks passed; 45/46 tests passed, Java analysis test exceeded 5 seconds under unrestricted concurrency; build not reached.
- `npm run build`: all eight workspace builds passed separately.
- `npx vitest run --maxWorkers=2`: all 46 tests in 16 files passed, 14.25 seconds. Tests run genuine local GCC/CPython/JDK fixtures, not arbitrary user programs.

Environment: Windows, Node 26.8.1 (not LTS), npm 11.19.0, GCC 15.2.0, CPython 3.14.7, JDK 21.0.12.1. Docker Desktop 29.8.2 installed, Linux engine stopped at baseline. Android Studio/JBR installed; SDK `D:\Android\Sdk`, platforms android-37.0, build-tools 36/37, adb available, no connected device. Roughly 8 GB physical RAM with under 1 GB free during audit; build concurrency must be bounded. No Android module, Windows installer or signing evidence exists.

## Data protection

Existing `.env` remains private and unchanged. Existing Compose MySQL 8.4 service and named `omnicompile_mysql_data` volume are preserved. After starting Docker Desktop, a read-only inventory found 16 tables: users 2, networks 2, enrollments 3, nodes 3, tasks 5, jobs 4, artifacts 8. An unrelated existing `MYSQL` container on port 3306 was observed and left untouched. Neither existing database was reset. Live verifiers now require an isolated database/port and an instance identity from `/ready` before writes.

Ignored historical SQLite files exist under `apps/coordinator/data/` (database/WAL/SHM), alongside an ignored historical MySQL backup in `.runtime/`. No active SQLite dependency was found. Files may contain valuable data; deletion is NOT authorized by routine cleanup. Inspect/backup and request exact deletion approval later.

## Highest-priority audit findings

1. Broad private-LAN CORS is also active in production; all proxy headers trusted; worker/admin WebSocket origin/session checks incomplete.
2. Enrollment uses a reusable join token as admission credential; required single-use atomic invitations are absent (M2 R03).
3. Schema evolution has no version ledger; network code allocation/index and max-node admission have concurrency risks.
4. Worker result validation is shape/identity based, not independent correctness verification. Arbitrary native compiler invocations lack production sandbox containment.
5. C logical operators eagerly lower both operands, contrary to short-circuit semantics; Python safe folding and optimization semantics need adversarial verification.
6. Task leases, cancellation, durable recovery, diagnostics/stage histories and artifact digests need strengthening.
7. Windows desktop installer, Kotlin/Compose Android, generic Compute Tasks UI, configurable Resend/PostHog, release CI/signing/restore/physical-device gates remain open.

## Exact next iteration

Phase 1 implemented and committed as `4988f0f`: bounded test concurrency; strict production HTTPS/origin/hash policy and explicit trusted proxies; HTTP/cookie-WebSocket origin guards; sanitized request URLs; dependency-backed health/readiness; startup readiness and lockfile install; isolated temporary MySQL verifiers; real deadlock retry and background crash fix. Node 24.21.0 portable binary fetched from official nodejs.org and SHA-256 verified, without changing global installation. Clean archive of that commit passed npm ci, all 57 unit/3 script tests, typechecks and builds under LTS.

Phase 2 v1 protocol foundation now implemented and integration-tested: required protocolVersion on worker messages, validated coordinator envelopes and kind/operation pairing, browser/native coherent send/receive, `/version`, graceful incompatible-version close, credential revalidation per message, no endless policy-violation reconnect. Full 60 unit + 3 script tests/build/typechecks passed; isolated InnoDB, protocol, platform and all-language artifact suites passed. Actual result correctness/lease/cancellation gates still open.

Migration foundation implemented: connection-owned MySQL advisory lock, complete frozen artifact checksum/ledger, ordered history validation, rejection of unknown/newer/changed/holey histories, failed migration not marked applied, idempotent existing schema adoption on the lock-owning connection. Full 63 unit + 3 script tests/typechecks/builds and five isolated live suites passed (`70afb29499df1a83`), including concurrent startup and deliberately interrupted actual baseline DDL recovery with data/backfill preservation. Independent review findings fixed and re-reviewed. This is not automatic schema drift detection or transactional DDL rollback; every historical missing-column upgrade path is not yet covered. Developer schema was not migrated; protected 481776-byte dump is retained in `.runtime/backups/omnicompile-before-domain-migrations-20261012-093442.sql`; restore verification remains open.

Invitation admission foundation implemented: append-only 0002 migration, hashed expiring revocable atomic single-use tokens, explicit consent, information-only old links, per-device scoped cookies/bearers, serialized network/node allocation and capacity reservations. Register/reconnect/leave/revoke share lock order and preserve identity/BUSY state. Review found a real pending-leave/register race; deterministic red/green test and re-review verified the fix. Full 64 unit + 3 script tests, all workspace typechecks/builds and two isolated integration fixtures passed (`1efc1ebdd4df9960`, `6b126f249c94502a`). See `evidence/2026-10-12-invitations/RESULTS.md` for exact scope and limitations. Developer schema/data/secrets remain untouched. Web build is not physical browser acceptance.

Explicit user override subsequently implemented: reusable default link per network, invoked by default, admin revoke/invoke on the same URL, distinct consenting device enrollment and atomic capacity. Revocation closes admission, not private worker authentication. Append-only 0003 fills previously hashed-only networks once without changing worker identities/credentials/data. Full verification and three isolated suites passed; enhanced same-link registration and interrupted token-backfill recovery passed. Admin/join UI built; physical UI/mobile acceptance not claimed. See USER_REQUIREMENT_OVERRIDES.md and evidence/2026-10-12-reusable-links/RESULTS.md. Developer schema was not migrated this turn; normal startup applies 0003.

Phase 3 compiler correctness iteration implemented with separate C/Python/Java agents. Existing C IR optimization remains; unsupported custom-frontend constructs use actual GCC on explicitly capable native workers. CPython transformations preserve assertions, binding and annotations; Java uses actual javac/javap/jar with real entry-point detection. Reports contain program-specific diagnostics and genuine output artifacts; failed jobs expose reports only. Full verification passed 115 unit tests, three script tests and all eight workspace typechecks/builds. Isolated artifact verification includes real downloaded fixture execution, invalid programs and authorization checks. See evidence/2026-10-12-compiler/RESULTS.md for acceptance scope and remaining limitations.

Exact next task: Phase 4 task leases/cancellation/independent result verification and durable recovery, followed by Windows/Android implementations in dependency order. Append new migration IDs; do not edit adopted artifacts. ADB last detected no device (2026-10-12); earlier Redmi detection does not establish availability now. No APK/package/device installation test or public deployment has occurred. Full platform/release gates remain incomplete.

## Compiler execution extension - 2026-10-13

Implemented and verified genuine bounded Docker Linux execution for final C,
Python and Java output; standard input, stdout/stderr, actual exit/time/peak child
RSS, runtime-specific advice and honest partial-success reports. Windows C output
is retained alongside the real Linux output used for execution. Java libraries
remain explicitly not run. Native final publication is independently rebuilt from
stored source; C distributed transformations/counts are checked and rederived.
Finalization runs outside the worker-message queue so heartbeats remain responsive.
No schema migration, developer DB reset, secret rotation or volume deletion.

Final `npm run verify` under portable Node 24.21.0 with Docker tests enabled passed
all eight typechecks/builds, 133 tests and three script safety tests. Final isolated
execution fixture `4e3d70a892bdde8e` passed successful language execution/input,
C IR aggregation, runtime errors, timeout/heartbeat, library handling, compiler
errors, artifact identity and download ownership. General isolated regressions
passed `3d83ebf810c47858`, `f6f6f786ca4ab9bb`, `1dc66ce5179939c2`. Read-only review
findings and real red/green failures are recorded in
`evidence/2026-10-13-execution/RESULTS.md`; actual PDFs were rendered/inspected.

Next remains Phase 4: immutable leases/cancellation/durable recovery and independent
verification of other task kinds/failed worker diagnostics. Full host compiler
containment is still required; Docker execution is not a universal sandbox or
correctness guarantee. Windows installer/native Android APK and physical acceptance
are not built/tested. ADB found no device on 2026-10-13. Web was built; physical
browser/mobile UI acceptance and public deployment are not claimed.

## Report and language-admission correction - 2026-10-13

Corrected the overall report, actual warning/error counts and execution source
locations; compilation success no longer implies execution success. Failed
execution retains genuine outputs with PARTIAL_SUCCESS. The compiler screen
renders persisted diagnostics, clears rejected/stale submissions and fetches
failed-job reports. Clear foreign-language declarations/extensions are rejected
before scheduling; ambiguous source remains the selected real compiler's job.

Fresh Docker-enabled full verification passed all 156 tests, three script checks
and all eight workspace typechecks/builds. Sample execution fixture
`8048bde042cf8403` passed all six original easy/tough samples, three invalid
industrial samples, three in-memory repaired industrial variants, runtime/compiler
warnings and errors, source locations, timeout/heartbeat, authorized downloads
and 36 language/extension rejection checks. Original C easy/tough return 1, so
their real execution is correctly unsuccessful despite successful compilation.
Fresh downloaded success/failure PDFs were rendered and visually reviewed.

General isolated regressions also passed: `7b5a2c26310637c7` (migrations,
concurrency, protocol, platform, artifacts), `d6bfe6b0543e3964` (enrollment),
`5adb62ce246ba167` (reusable links). All owned test fixtures were cleaned.

See `evidence/2026-10-13-report-diagnostics/RESULTS.md` for commands, actual counts,
the transient C test timeout/retry and remaining boundaries. No developer data,
volumes, sample files, secrets or migrations were reset/changed. Historical saved
reports are not rewritten; resubmit to generate corrected reports. Next remains
Phase 4 and the separately tracked native packaging/device/release gates.

## 2026-10-13 — Phase 4 portable result-integrity subset

The prior report/language stage was completed and pushed as 825e595. Continued
with independent reference recomputation of the existing SHA-256, SHA-256 chain
and prime-count results. Incorrect/malformed results cannot create result rows;
retries preserve attempts and verification outcomes are persisted/audited.
Stale/foreign/concurrent submissions cannot overwrite newer attempts.

Fresh review found two genuine concurrency defects. Both were reproduced against
isolated MySQL before fixing: heartbeat cached BUSY after completion; a task-wide
verification lock rejected the next authorized attempt. Atomic heartbeat updates
and per-attempt reservations now pass those same regressions, including real
transaction rollback, in-flight heartbeat and revocation tests.

Full Docker-enabled npm run verify passed 175 tests in 31 files, three script
tests and all eight workspace type checks/builds. Fixture a77840909d2a5d72 passed
migrations, real InnoDB contention, protocol, expanded portable results, platform
and C/Python/Java artifacts. Further regressions passed: execution
20045cccf084a6c9 (original/repaired/invalid samples and actual report/execution
evidence), enrollment 909fd8c05b2e8806 and reusable links 9d496bc66898337d.
All owned fixtures were cleaned. See evidence/2026-10-13-portable-results/RESULTS.md.

This does not complete all Phase 4 or release gates. Exact next task: durable
attempt leases and restart/MySQL-interruption recovery, proved with isolated
fault-injection tests. No developer records, volumes, credentials or compiler
pipelines were reset/replaced. Windows installer, native Android APK and physical
device acceptance remain pending, not achieved by logical protocol fixtures.

## 2026-10-13 — Phase 4 durable task leases and failure recovery

Implemented and pushed `73396b9` (`feat: persist task leases and recover interrupted
work`) to the existing engineering branch at the requested GitHub origin. Remote
hash matched local HEAD and the tracked tree was clean after push. Migration 0004
adds immutable MySQL attempt deadlines without changing prior migration checksums,
terminal history, node identity, credentials or developer records/volumes.

MySQL time now governs expiry, including real lock waits and final publication
checks. Startup/serialized periodic maintenance recovers interrupted attempts in
100-row transactions, preserves history and the three-attempt retry budget, and
quarantines stale executors. Native/browser reconnect waits until prior execution
settles. Persisted completed compiler results resume artifact generation after a
crash; transient persistence loss is not mislabeled as compiler failure.

Real isolated fault tests passed: process crash/restart, MySQL pause/resume and
readiness 503, disconnect during normal DB and an actual paused-DB/row-lock
intersection, stable reconnect, second compatible worker reassignment, native
executor busy reconnect, CPython publication after process death and C publication
after killing the owned coordinator SQL connection. Existing lease, history,
replay, expiry, terminal retry and 101-task bounded-batch checks passed.

Full Docker-enabled verification passed 175/175 tests in 31 files, 3/3 script
tests and all 8 workspace typechecks/builds. All six integration scripts and
original/repaired/invalid C/Python/Java execution/artifact cases, enrollment and
reusable-link regressions passed. Two initial suite runs exposed an implicit
five-second real-JDK test timeout; standalone Java tests passed and only that
test's bound was aligned to the existing adjacent 30-second real-JDK test.
Production limits/assertions are unchanged. Failures and fixes are recorded in
`evidence/2026-10-13-task-recovery/RESULTS.md`.

The requested five-item recovery scope is 5/5 (100%), not an invented global
completion score. **Full master Phase 4 remains incomplete:** cancellation,
broader scheduling/backoff/mobile policies and portable workload catalogue remain.
Exact next task is cancellation contract + persisted cancellation + worker
propagation + late-result/publication guards. Single-active restart recovery is
not HA or exactly-once execution. No Windows installer, native Android APK or
physical-device acceptance is claimed by these logical/native-process fixtures.

## 2026-10-13 — Phase 4 durable cancellation subset

Append-only migration 0005 and owner/admin cancellation APIs preserve MySQL task
attempt history and block late results, decomposition, retry resurrection and
artifact publication. Capability-negotiated protocol v1 task_cancel reaches
updated native/browser workers; native execution is an owned process tree with
restricted environment and cancellation/cleanup before reconnect. Unconfirmed
Windows tree termination stops the worker instead of advertising availability.
The compiler UI has a real cancel control and recognizes cancelled jobs.

Fresh review's important descendant-termination finding was reproduced with an
actual GCC-built process tree and fixed. All 182 tests in 32 files, three script
tests, eight workspace type checks and builds passed. Isolated cancellation and
lease fixtures passed. Recovery initially failed an obsolete run-to-completion
expectation after disconnect; updated cancellation-aware recovery passed actual
coordinator crash/restart, MySQL pause/resume, disconnect/outage intersection,
safe native reconnect/reassignment and C/Python publication recovery.
See TASK_CANCELLATION_PHASE.md and its evidence report for final integration/Git
results and every failed run, rather than treating this paragraph as release proof.

Full master Phase 4 is NOT complete. Immediate coordinator-native finalization
abort, cancellation/DB-outage intersections, actual database restart, durable
retry backoff/jitter, broader policy and portable catalogue/integrity gates remain.
Exact next stage: extend existing native finalization process control, test
cancellation there and during actual isolated database faults, then durable retry
policy. Phase 5 is web product acceptance; Phase 6 is browser lifecycle acceptance.
Physical devices and Windows/Android packages are separate unachieved gates.

Cleanup is project-only per user scope. Reproducible preview removal was blocked
by execution policy; no such files were deleted or disk saving claimed. Keep all
tests, samples, credentials, backups, developer records and MySQL volumes.
