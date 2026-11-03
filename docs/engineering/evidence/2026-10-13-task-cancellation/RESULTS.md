# Durable cancellation — verification evidence

Date: 2026-10-13. Base: e85bae581d67c860677c83e362d98351c92dd0f2.
Branch: engineering/omnicompile-release-foundation. MySQL remains authoritative.

## Implemented scope

Append-only migration 0005 adds CANCELLED to existing task/job/batch states.
Cancellation locks the owning job, preserves completed attempts and immutable
leases, cancels active work, quarantines executors, and audits atomically.
Late decomposition, retries, failure reports and final artifact publication
cannot revive a cancelled job. Owner/admin APIs are scoped and idempotent.

Protocol v1 has additive capability-negotiated task_cancel. Native workers run
the existing executor in an owned, cancellable process tree with stripped
credentials and per-task temporary storage; browser workers terminate their
dedicated Web Worker. Reconnect waits for local termination/cleanup. An
unconfirmed termination stops the native worker, not advertises availability.
The compiler screen can cancel work and recognizes the terminal state.

## Fresh verification

Node 24.21.0, real GCC/CPython/JDK and Docker Linux execution environment.
Commands ran serially because available physical RAM was below 1 GB.

- `npm run typecheck`: all eight workspace checks passed.
- `OMNICOMPILE_SANDBOX_TEST=1 npm test -- --run --maxWorkers=1`: 182/182 tests,
  32 files passed, including real Docker execution and all three toolchains.
- `node --test scripts/*.test.mjs`: 3/3 passed.
- `npm run build`: all eight workspace builds passed, including web production
  assets, worker child/controller and packaged coordinator migration files.
- `npx vitest run apps/worker/src/task-process.test.ts --maxWorkers=1`:
  4/4 passed; actual GCC-built child/descendant termination and failed-command
  fail-closed behavior, not only an in-process AbortSignal mock.
- `node scripts/Run-Isolated-Integration.mjs cancellation`: fixture
  1db187539f7974f0 passed owner/foreign/anonymous/admin cases, queued/running/
  terminal/idempotent cancellation, immutable history, Store reopen persistence,
  late-result/retry/decomposition/publication guards, real InnoDB cancellation vs
  publication contention, logical browser WebSocket delivery and real Windows
  Node worker cancellation/reconnect/independently verified prime-count follow-up.
- `node scripts/Run-Isolated-Integration.mjs leases`: fixture
  2cd29206c9b50449 passed.
- Initial all-integration fixture c4fb35819d766064 passed migrations,
  concurrency, protocol, results, platform and actual C/Python/Java artifacts.

## Failures and corrections retained

Initial RED fixture f9f3a39104d068a9 failed because cancellation did not exist.
Direct GREEN e17ad13cba99b331 and expanded GREEN 7463daf4089f5855 followed.
Type checks caught missing migration declarations and CANCELLED transitions;
both were corrected. Concurrent heavy verification caused two genuine timeouts
(177/179 tests passed); serial reruns passed 179 and finally 182 tests without
weakening production limits or assertions.

Fresh review found PATH-based taskkill could leave compiler descendants running.
A real process-tree test reproduced the living descendant (RED); explicit
System32 taskkill plus fail-closed quarantine passed (GREEN). The missing-command
test initially changed SystemRoot before child startup and tested the wrong
failure; changing it only after the child starts correctly exercises termination.

Recovery fixture 148710ca6a758019 failed an old expectation that a disconnected
native task would run to completion without reconnecting. This conflicts with
the new explicit socket-loss termination behavior. The revised regression requires
an immutable interrupted attempt, safe second RUNNING attempt, no busy overlap,
no stale result, terminal cancellation and successful follow-up work. The rerun
passed as fixture 7c1f746235af1f41, including real coordinator restart, database
pause/resume, disconnect/database-lock intersection, second-worker reassignment,
native cancellation/reconnect and durable C/Python finalization recovery.

## Honest acceptance boundary and cleanup

This is NOT full master Phase 4 completion. Coordinator native verification/code
generation is still bounded, not immediately process-abortable. Physical browser
lifecycle and cancellation during a MySQL outage remain unverified. Store reopen
is not coordinator crash evidence; MySQL pause/resume is not database restart.
Broader resource/network/mobile policy, durable backoff/jitter, portable workload
catalogue and further integrity/fault gates remain open. No Windows installer,
Android APK, device test or public deployment is claimed here.

User limited cleanup to project residue. Reproducible preview PDF/PNG removal was
blocked by execution policy; none were deleted and no disk saving is claimed.
Source tests/samples, credentials, developer records, backups and MySQL volumes
were preserved. Isolated fixture cleanup removes only newly created owned,
label-verified temporary containers; it never uses the developer volume.

## Integration and Git handoff

- `node scripts/Run-Isolated-Integration.mjs all`: 7fd2180401c9e0ea passed
  all six verifiers. Migration 0005 partial enum-DDL interruption and concurrent
  resumption passed, preserving legacy source/artifact data. Thirteen genuine
  language programs, three invalid programs and authorized artifacts passed.
- `node scripts/Run-Isolated-Integration.mjs execution`: 9ccefdb9c97557c5
  passed actual bounded execution, original/repaired/invalid sample reports,
  diagnostic counts, runtime failure distinctions and foreign-language rejection.
- `node --check scripts/Verify-Migrations.mjs` and
  `node --check scripts/Verify-Task-Recovery.mjs`: passed; fresh script tests 3/3.
- `node scripts/Run-Isolated-Integration.mjs enrollment`: 67bd6ee716661c90
  passed migration/admission/identity/capacity/revocation acceptance.
- `node scripts/Run-Isolated-Integration.mjs reusable`: b660357ae68cd68b
  passed same-link multi-device admission and invoke/revoke regressions.
- All serial runner commands exited 0; owned fixtures were removed. Final
  Docker inventory contains only the two pre-existing developer containers.
- Git handoff: stage only reviewed source/tests/docs, commit this verified subset,
  push the existing engineering branch without force, compare remote/local HEAD
  and inspect tracked/untracked status. Record the resulting hash after push.

Implementation commit 7600330851d132384819467011fc3cca82a01b23:
`feat: add durable task cancellation and worker termination` (28 files).
Push to the requested GitHub origin succeeded. `git ls-remote origin
refs/heads/engineering/omnicompile-release-foundation` matched local HEAD exactly;
`git status --porcelain=v1 --untracked-files=all` was empty after that push.
No merge, reset, force push, release publication or credential change occurred.
