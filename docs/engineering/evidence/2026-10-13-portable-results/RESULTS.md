# Phase 4 — portable result integrity evidence (13 October 2026)

Scope: coordinator-independent verification of the existing SHA-256, SHA-256 chain and inclusive prime-count operations. Existing protocol v1, MySQL model, compiler architecture, authentication and UI are preserved. No developer database reset, credential rotation, volume deletion, or production publication.

## Behavioral failures reproduced before fixes

- Fixture `7425d0a53550ff8f`: the unchanged coordinator accepted a forged SHA-256 digest as COMPLETED. Migration verification passed; the new result assertion failed as intended.
- Fixture `752c36933262cd9a`: a controlled boundary around real MySQL calls made heartbeat read BUSY, then genuine task completion commit AVAILABLE, then heartbeat write its cached BUSY value. The idle node was incorrectly BUSY. Fixed with a single atomic heartbeat update deriving status from the current row.
- Fixture `0ebe5a324e77d623`: after the heartbeat fix passed, an interrupted attempt's in-flight verification rejected the matching active second attempt as STALE_TASK_RESULT. Fixed by reserving verification per task/attempt; an old finalizer cannot delete a newer reservation.

## Live regression evidence

`node scripts/Run-Isolated-Integration.mjs all`, fixture `a77840909d2a5d72`: exit 0. All six scripts passed: migrations, actual InnoDB contention, versioned protocol/auth/revocation, portable results, platform flow and C/Python/Java artifacts.

The expanded portable suite verified:

- Correct answers from the actual native worker portable executor are independently recomputed; accepted result JSON contains coordinator-owned VERIFIED evidence, method/version/time.
- All three forged answer types are rejected through the existing three-attempt terminal failure policy, with no result rows; a subsequent correct attempt recovers.
- Forged verification metadata is rejected. Valid field ordering remains accepted.
- Completed replay, wrong attempt and a different network's node cannot publish. Concurrent duplicate submissions publish exactly once.
- A heartbeat following a costly result is processed while the task is still RUNNING, not stuck behind verification in the socket queue.
- Heartbeat/completion interleaving preserves AVAILABLE. A new authorized attempt completes while the interrupted old verification becomes stale.
- A real temporary MySQL CHECK failure after completion UPDATE rolls back task, attempt, result and node changes together; retry after removing the CHECK succeeds.
- Revocation during correct recomputation prevents publication and preserves INTERRUPTED history.
- Success/rejection audit events are persisted without payloads, credentials or tokens.

Clients are labelled logical protocol fixtures using the actual portable worker executor, not physical browser/Windows/Android acceptance. Synthetic overlap nodes enroll/register through the existing network service and real MySQL; only a query-boundary wrapper controls the heartbeat interleaving, without substituting fake database outcomes.

## Test-harness failures and corrections

- `377b8fc0f88de325`: the original 15-second observation window expired during three retries; existing periodic scheduler dispatch can add up to five seconds between attempts. Bounded observation is 20 seconds and prints final fixture state on failure, rather than hiding a red run.
- `b9d6e0e4f8e5d79a`: MySQL binary logging required SUPER to create a test trigger. Replaced the isolated rollback probe with a task-specific temporary CHECK; no privileges, global settings or production schema were changed.
- `0cfa4b7c58f22b67`: a periodic fixture heartbeat overwrote the marker before it was observed. Suspend that fixture timer during the explicit heartbeat probe; production heartbeat handling is not weakened.
- Initial typecheck failures: RowDataPacket spread inference and cross-workspace test import outside coordinator rootDir. Explicit task fields and in-workspace vectors fixed them; the isolated script separately tests the actual worker executor.
- Docker Desktop was closed after a session interruption. It was relaunched; readiness was checked by the isolated runner before further tests. Completed fixture `ae260604f1ddd2b1` was recovered from its exit-0 summary, not represented as a still-running command.

## Final verification

After both concurrency fixes, portable Node 24.21.0 was prepended to PATH and
`$env:OMNICOMPILE_SANDBOX_TEST='1'; npm run verify` exited 0: 175 tests in 31 files
(including real Docker tests), three script tests, all eight workspace type
checks and builds. Full output: ignored
`.superpowers/sdd/TASK_ENGINE_PHASE/final-verify.log`.

Additional completed commands, all exit 0:

| Command | Isolated fixture | Verified scope |
| --- | --- | --- |
| `node scripts/Run-Isolated-Integration.mjs all` | a77840909d2a5d72 | Six scripts: migrations, contention, protocol, expanded result integrity, platform and all-language artifacts |
| `node scripts/Run-Isolated-Integration.mjs execution` | 20045cccf084a6c9 | All six original easy/tough samples, three invalid and three in-memory repaired industrial samples, real runtime failures/warnings/timeouts, actual report counts, 36 mismatch rejections and authorized artifacts |
| `node scripts/Run-Isolated-Integration.mjs enrollment` | 909fd8c05b2e8806 | Concurrent consent/registration/capacity, scoped credentials, leave/reconnect/revocation |
| `node scripts/Run-Isolated-Integration.mjs reusable` | 9d496bc66898337d | Reusable default links, admission toggle, multiple devices and no bypass |

All owned temporary fixtures were cleaned. Actual developer MySQL volumes,
records and secrets are untouched; original sample files are unchanged. No APK,
installer, device installation, public deployment or physical-device test was
performed or claimed in this stage.

Fresh read-only review found the two Important races recorded above. Both fixes
passed reproducing real-MySQL tests and the full suite; no Critical or Minor
findings were reported. Broader acceptance gates were explicitly retained.

## Deliberate boundaries / next work

Phase 4 is not wholly complete. Next: durable attempt leases and coordinator restart/MySQL interruption recovery, then cancellation and policy/catalogue extensions. Verification currently performs bounded cooperative recomputation; global admission control for hostile many-worker load remains open. Worker-reported execution time/resource metrics are not independently proved. Checks are practical reference recomputation, not Byzantine tolerance, proof of computation or universal program equivalence.

Other retained gates: physical browser/Windows/Android acceptance, actual Windows installer and native Kotlin APK, compiler containment, broader language semantic coverage, critical-task redundant execution and crash-atomic audit/result persistence. These remain explicit backlog items; omission from this bounded stage does not remove requirements.
