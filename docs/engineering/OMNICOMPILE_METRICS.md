# OmniCompile Core — live compilation indicators

The existing application is retained. Official title: **OmniCompile Core: A
Zero-Trust, Fault-Tolerant Distributed Compiler Pipeline for Heterogeneous
Edge-to-Cloud Orchestration**. See the preserved source vision and November user
override for scope; the source's differing metric list is superseded explicitly.

## Ownership and compatibility

`GET /api/user/compiler-metrics` accepts optional `jobId`, `language` (c/python/
java) and `platform` (WEB/WINDOWS/ANDROID). Only authenticated USER sessions may
call it. Administrators receive403, unauthenticated callers401, foreign/unknown
jobs404 and invalid filters400. Every query follows the job's `user_id`, including
C optimization tasks linked through `optimization_batch_tasks`. No global-network
metric or another user's telemetry is returned. Responses use `Cache-Control:
no-store`; no token is put in a URL or browser storage.

The new display is below the compile action. It polls every3seconds without
overlapping requests, aborts on scope changes/unmount, discards late responses,
and labels errors/stale snapshots. Language/platform/current-job/history filters
do not alter compilation or scheduling. Administrators have no compilation-metric
panel. System indicators are not inserted into build reports/artifacts.

Polling is limited to40requests/minute per authenticated user, not per shared
Wi-Fi/NAT address. Unauthenticated attempts retain an IP budget. Legacy UUID job
IDs remain valid alongside the newer short IDs. A live socket-ownership snapshot
prevents a fresh-looking old registry row from implying connectivity after restart.

Legacy technical names remain deliberate compatibility identifiers: npm scopes,
MySQL database configuration, application IDs, session/Keystore/DPAPI keys,
protocol/IR kinds, GRID_X environment settings, START/STOP filenames, and existing
installer/executable paths. Visible UI, report, installer/window, APK label,
notification and current product documentation use OmniCompile Core. No user data
or installed worker identity is reset to accomplish the rename.

## Definitions and recorded evidence

| Indicator | Definition and safeguards |
|---|---|
| Task success | Unique completed tasks / (completed + terminal failed + terminal timed-out tasks). Cancellation is separate; queued/assigned/requeued/running tasks are excluded. Retries do not multiply tasks. Final attempt failure reason classifies terminal timeouts. Daily trend uses UTC completion dates. |
| End-to-end completion | Successful task's accepted attempt dispatch timestamp to actual WebSocket result receipt, captured before queueing/verification. Never worker-reported execution time. Successful tasks without recorded timing remain successful but have no invented duration. Native authoritative recompile time is separate from transport completion. |
| Worker availability | Scheduler-eligible AVAILABLE workers / active, approved, unexpired, non-revoked registrations that participated in selected own jobs. Workers are de-duplicated across tasks. Connected, busy, unavailable/unhealthy and disconnected remain distinct. Expired/disabled networks do not count as active registrations. Historical samples are explicitly job-labelled, not a summed whole-network percentage. |
| CPU/RAM | Separate averages of valid worker-reported observations during selected tasks. Current utilization uses a30second freshness window; last observation time remains visible even when current averages are unavailable. Browser device-wide readings are unavailable, not zero; Android currently reports actual RAM but no unsupported device CPU estimate. Future/invalid source timestamps are excluded. Resource readings are reports, not independently attested hardware measurements. |
| Verification | VERIFIED / (VERIFIED + REJECTED + FAILED checks). PENDING is separate. Every submitted known task/network result has an identity/attempt check record; stale/duplicate output is rejected. Portable work is recomputed; C IR is compared to the authoritative transformation. Native format checks and later independent source recompilation are distinct named checks. A format/hash match is not proof of arbitrary computational correctness. |

Native task success is provisional until independent source verification accepts
it. Format-only acceptance contributes to pending work, not successful task counts;
a rejected independent check contributes to failed tasks. This is a metric view
over existing task/job/verification state, not a replacement task engine. Old jobs
accepted before the new ledger are not assigned invented verification records.

Migration0011 adds `result_verifications`, `worker_telemetry` and
`job_worker_availability` with foreign keys and lookup indexes. The accepted
result and its initial verification outcome commit together. Coordinator restart
marks interrupted pending checks FAILED, without changing task-attempt history.
SQL aggregates all selected task/check counts; only displayed verification
history50 and availability history100 are bounded. No hidden front-end record
filtering is used to calculate totals. Availability snapshots also occur at RUNNING,
accepted completion, disconnect and heartbeat-loss transitions; periodic sampling
does not block the recovery loop.

Telemetry writes also run outside the serialized worker heartbeat queue, with at
most four in-flight writes and at most one per node. Sampling is best effort
during database interruption; missing observations are not backfilled or counted
as zero. Completed-result telemetry remains bound to its accepted task/node.

Historical telemetry and verification never existed before this migration. The
system does not backfill imagined readings, verification checks or receipt times
for old jobs. Old genuine accepted tasks still contribute to task totals.

## Verification and remaining boundaries

See current project status for final fixture IDs/results. Core commands:

```powershell
npm run verify
npm run verify:metrics
npm run verify:web
npm run verify:artifacts
npm run verify:recovery
npm run package:windows
```

Use an actual installed GCC on PATH (this host: D:/GnuWin32/MinGW/bin), CPython and
JDK for compiler regressions. Initial full verification without GCC produced14
genuine failures; adding the existing compiler to the test environment fixes the
prerequisite rather than weakening or skipping compiler tests. No .env, database,
volume or system credential was modified.

These changes do not claim full ISO C parsing in the custom frontend, arbitrary
multi-file dependencies, universal parallelization, browser/Android GCC/CPython/
JDK execution, universal malicious-worker proof, production signing or public
Kubernetes deployment. Genuine GCC/CPython/JDK paths and safe supported IR
optimizations are preserved. Phase9 remote/three-device gates and Phase10–11
operations/release gates remain separate and must be tested before sealing.
