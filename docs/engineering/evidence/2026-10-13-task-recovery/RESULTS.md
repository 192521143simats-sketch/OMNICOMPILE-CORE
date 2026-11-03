# Phase 4 — durable task leases and failure recovery

Date: 2026-10-13. Baseline: `2228cf93aee7bf0805a9d75809ae577658ef1576`.
Branch: `engineering/omnicompile-release-foundation`.

Implementation committed/pushed as `73396b963a6206f879e096ee30cbec4126441a49`
(`feat: persist task leases and recover interrupted work`). GitHub origin was
the configured Git origin; remote branch
hash matched local HEAD and tracked tree was clean after the non-force push.

## Implemented scope

1. Migration `0004_task_attempt_leases` adds an indexed nullable millisecond UTC
   deadline to each attempt. Assignment persists it atomically using MySQL time.
   Earlier migration definitions/checksums and terminal history are unchanged.
2. RUNNING and result publication require the live matching attempt. Scope locks
   precede fresh time checks; expired/superseded/replayed results cannot insert a
   result or release another attempt's node. A final lease check guards publication.
3. Startup interrupts assignments whose socket ownership died with the process;
   periodic recovery expires persisted leases even after a MySQL interruption.
   Recovery transactions lock at most 100 attempts. History remains append-only;
   three attempts are the existing retry maximum. Stale executors are quarantined.
4. Native/browser reconnect registration waits for prior local execution to settle.
   Completed compiler tasks resume artifact publication after coordinator crashes.
   Transient database loss does not falsely declare C/native compilation failed.
5. Real fault and compiler regression commands are recorded below. No developer
   database records, volumes, secrets, source samples or compiler pipelines reset.

## Real isolated evidence

Commands use bundled Node `24.21.0`, MySQL `8.4`, existing GCC `15.2`, CPython
`3.14.7`, JDK `21.0.12.1` and the existing Docker sandbox image. Runner creates a
random labelled MySQL fixture, isolated database/ports and fresh credentials.
Faults target only its owned coordinator PID/container/SQL connection. MySQL
pause/unpause preserves tmpfs data; stop/start would not. No production fault API.

| Command | Result and fixture |
|---|---|
| `node scripts/Run-Isolated-Integration.mjs leases` | PASS `8f26fefebd5c359a`: real persisted expiry, stale/superseded/duplicate rejection, stored deadlines across Store restart, expired RUNNING, real InnoDB lock wait across expiry, transaction rollback, preserved history, NULL legacy interruption, 3-attempt bound, 101-task batches of 100/1/0 |
| `node scripts/Run-Isolated-Integration.mjs recovery` | PASS `5b01817117ecf690`: actual coordinator crash/restart, actual MySQL pause/resume and readiness 503, lease recovery, socket disconnect during healthy DB and paused DB with a controlled real row lock, same-identity reconnect, compatible different-worker reassignment, one verified result per task, completed history survives restart |
| Recovery fixture, native/compilation boundaries | PASS: actual native Node executor computing a bounded hash chain across coordinator restart cannot consume retries while busy; stored real CPython output publishes after process death; real C IR aggregation/GCC executable publishes after killing the owned coordinator SQL connection during an actual blocked artifact-stage update |
| `npm run verify` (default sandbox opt-out) | PASS: 165 tests passed, 10 explicitly skipped; 3 script tests; 8 workspace typechecks/builds. This is not the Docker-enabled final gate |
| `$env:OMNICOMPILE_SANDBOX_TEST='1'; npm run verify` | Final PASS: 175/175 tests in 31 files, including all 10 real sandbox tests; 3/3 script tests, 8/8 workspace typechecks and builds. Full command exit 0; detailed log `full-docker-final.log` |
| `node scripts/Run-Isolated-Integration.mjs all` | PASS `0bb0ca2cdfa2fe3b`: 6 scripts—append-only/interrupted migration recovery, real MySQL contention, protocol, independent portable result acceptance, platform, C/Python/Java artifacts |
| `node scripts/Run-Isolated-Integration.mjs execution` | PASS `b8230884098da4bc`: all 6 easy/tough samples, 3 invalid industrial samples and repaired variants, actual execution outcomes/warnings/errors/report counts, timeout/heartbeat, ownership-protected downloads and 36 language/extension mismatch checks |
| `node scripts/Run-Isolated-Integration.mjs enrollment` | PASS `1b94b87003a53ca2`: migrations and real isolated consent/identity/capacity/revocation |
| `node scripts/Run-Isolated-Integration.mjs reusable` | PASS `2263b22b988e9f88`: reusable default links/admission toggle and stable node identity |

Post-implementation-commit repetitions also passed: leases
`6833f69429b8e0aa` and recovery `079f6be2f75ffa19`. Their machine-readable script
summaries include the actual lock-wait rejection, 100/1/0 batches, paused-DB
disconnect intersection, native busy reconnect and both compiler-publication
crash boundaries. The stage completion ledger records the exact BASE-to-commit
range and successful commands, not merely a presumed baseline.
The post-commit full `OMNICOMPILE_SANDBOX_TEST=1 npm run verify` repetition also passed
all 175 tests, 3 script tests and all eight workspace checks/builds (exit 0).

Execution outcomes are not forced to success. Existing C samples return 1 and are
reported as unsuccessful execution despite valid compilation; runtime errors and
timeouts remain real outcomes. Artifact regressions also test thirteen real
language programs, three invalid programs, warnings/optimization evidence,
library JAR behavior, Unicode/long filenames, authorization and missing artifacts.

Local detailed logs: `.runtime/integration/<fixture>/summary.json`, script logs
and coordinator logs. They are intentionally ignored, not committed credential
material. Assertions and portable evidence reside in the tracked scripts.
The completed plan's local verification/review/RED→GREEN logs are preserved under
`.runtime/task-recovery-evidence-2026-10-13/` after scratch-workspace archival.

## Behavioral RED → GREEN and review

One fresh read-only review found five Important findings and no Critical findings.
One fix pass followed, not repeated review loops:

| Finding | Reproduction / fix / acceptance |
|---|---|
| Expired result was accepted | RED `e5505b07d8493948`; persisted/fresh transactional lease checks; GREEN lease fixtures |
| Crash erased task timeout authority | RED `a385142c8c762160`; startup/periodic MySQL recovery; GREEN recovery fixtures |
| Completed compiler task stranded job after crash | RED `b6d054650e7871cd`; idempotent persisted-result publication; GREEN recovery fixture |
| MySQL UTC time is fixed before a blocked statement's row lock | RED `d2e6e4f9cf61cb22`; lock scope first, then fresh checks and publication rollback; GREEN `e0b1fcfab3763a46` and final leases |
| Native busy reconnect exhausted retries | RED `4d56f40280f28938`; defer reconnect until executor idle (also browser); GREEN final recovery |
| C publication SQL connection loss became compiler failure | RED `5256f6ec6d18fdfd`; classified transient persistence failures retry; GREEN final recovery |
| Recovery locked unbounded backlog | RED `c98432239cec6c6d`; bounded transactions + startup drain; GREEN final leases |
| Disconnect/MySQL interruption intersection lacked coverage | Real pause/socket termination/row lock/reconnect test added; GREEN final recovery. Existing transactional retries preserved; no speculative protocol replacement |

Test harness failures were not counted as software acceptance: initial direct
service fixture used an API-only `joinUrl`; a periodic recovery pass raced a
manual assertion; `1e14ef3533dc6257` looked for the later cleanup statement rather
than the actually blocked joined-attempt update, causing a connect timeout.
Fixtures now assert durable outcomes, detect the actual SQL, handle outstanding
connection rejection, and release the blocker in `finally`.

The Docker-enabled full suite initially failed one real-JDK test at Vitest's
implicit 5-second deadline (174 passed/1 timed out). Repeating the full suite
without parallel integration commands reproduced it. Standalone Java regression
passed all three tests, with the same javac/bytecode assertion completing in
2111 ms; this localized the failure to the test deadline under suite load, not
compiler correctness. Only that test now has an explicit 30000 ms bound, matching
the adjacent real-JDK regression. Production compiler limits and every assertion
are unchanged. Both failed runs are retained; final full verification passed
175/175 and all builds, with no skipped sandbox tests.

## Scope and remaining gates

Completion percentage applies to the **five requested durable-recovery items**,
not an invented global percentage. The full master Phase 4 also requires job/task
cancellation propagation, broader policy/backoff/mobile-aware scheduling and the
portable workload catalogue. Those gates remain open and are not claimed complete.

Single active coordinator only: this is restart recovery, not multi-active HA.
No exactly-once arbitrary program execution claim; restart can repeat bounded
execution before artifact publication. No forceful remote cancellation claim.
Browser changes are build/regression checked, not physical phone acceptance.
Native process evidence is not an installable Windows package or Android APK.
Host compiler containment and physical/packaging/release gates remain separate.

Next task: cancellation contract, persisted cancellation state, worker propagation
and verified result/publication guards. Do not advance to web/packaging as though
the entire task-engine phase were accepted.
