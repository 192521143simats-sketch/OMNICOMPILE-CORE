# OmniCompile Core — rename and live-metrics acceptance

Date: 1 November 2026. This is acceptance of this local increment, not a seal of
public deployment, universal compiler support, all security properties or Phase9–11.

## Implemented

Compatibility-safe product rename across web, Windows, Android, build reports,
email copy, startup/shutdown messaging and active docs. Existing data, runtime
architecture, authentication and language/worker contracts retained. New migration
0011 preserves existing records and appends measurement tables.

Five own-job indicators appear beneath Compile and optimize. USER-only API,
ownership SQL including C batch tasks, automatic updates, exact terminal-task
denominators, coordinator-receipt durations, platform/language filters, active
participant eligibility/history, independent CPU/RAM freshness, and named result
verification checks. Administrative users have no own-job metrics.

## Executed checks

| Command/check | Actual result |
|---|---|
| First `npm run verify` | FAILED14 genuine compiler/process tests because the session PATH had no GCC. No tests were weakened/skipped to fix this. |
| Existing compiler environment | `D:/GnuWin32/MinGW/bin/gcc.exe --version`: GCC6.3.0; added its directory to test-process PATH only. |
| Final full verification with compiler | PASS: 364 Vitest tests,25 script checks, all nine workspace typechecks/builds. Eleven Docker-only unit tests were skipped by default, not counted as passes. Reliability, resource eligibility and unavailable-state regressions were separately observed RED→GREEN. |
| Metric tests | Empty/null cases, exact terminal arithmetic, source timestamps, unavailable/eligibility distinction, and persisted reliability; all scoped tests pass. |
| Metrics UI | Six browser-DOM tests pass: real response rendering, missing measurements, polling overlap/abort/stale-response protection, filters and errors. Not physical-device proof. |
| `npm run verify:metrics` | PASS: final fixture `61f277b7cb3d712e`; real MySQL/coordinator and authenticated versioned WebSocket fixture executing the actual IR optimizer. Owner isolation, admin403, foreign404, malformed filters, duplicate rejection, coordinate timing independent of a false worker-duration claim, five measurements and histories. Exact arithmetic uses explicitly labelled synthetic persisted fixtures, not fake execution evidence. |
| Expanded metrics cases | PASS: `df9bf099df0358d7`: expired enrollment/disabled network excluded; Linux/unknown not Windows; UNAVAILABLE not connected; stale/future source telemetry; busy/completion/disconnect history. Included in final metrics command above. |
| Final metrics after bounded background telemetry | PASS: `f6e1da1b2fd71643`, including live persisted reliability policy and the expanded edge cases. Sampling is bounded to four in-flight writes and cannot hold the serialized heartbeat queue. |
| Final API acceptance | PASS: `0aac12a004c05870`. Also verifies native format-only results are not compilation successes, rejected independent compilation counts as failure, one user's exhausted quota does not throttle another user sharing the IP, and legacy UUID job filters retain404 rather than invalid-syntax400. These cases were first observed failing and then passing. |
| `npm run verify:web` | PASS: `4d86c82d4cd2c0c9`, actual Edge workflows including all five panels for C/Python/Java, genuine native compilation/report/download, login/reset/settings/RBAC and browser/mobile-layout enrollment. Screenshots inspected; no new physical phone claim. |
| First artifact verifier | FAILED: `88c76a68ba896f27`, probe migration plan omitted0011. Updated the verifier's append-only plan, not frozen migrations or validation. |
| `npm run verify:artifacts` retest | PASS: `11f9c112a7d6bedb`, migration adoption/interrupted DDL/concurrency, real MySQL contention/protocol and13 genuine output cases plus invalid-source/missing-artifact/authorization checks across three languages. |
| Durable leases | PASS: `77ad922198a783d8`, actual persisted deadlines, stale result fencing and attempt history. |
| Recovery failure/retest | `4b559e4ec42957ff` and `e78890f17c07641f` failed at a forced-lock disconnect setup. Telemetry was moved out of the heartbeat critical path. The fixture's unrelated periodic heartbeat was stopped before deliberately holding its node lock, avoiding a queue-order race that prevented its target disconnect statement from starting. No fault/assertion was removed. Retest `0ec301f6eb8c4d0d` PASS: actual coordinator crash, MySQL pause/resume, disconnect/reconnect under database outage, reassignment, accepted-result uniqueness, preserved history, real native busy reconnect and recovered Python/C publication. |
| `npm run package:windows` | PASS: actual installer, PE ProductName/FileDescription verified OmniCompile Core Worker; eight Windows tests and old/new product-recognition guard pass. Unsigned development package. |
| Android Gradle | PASS: `:app:testDebugUnitTest :app:assembleDebug :app:assembleRelease :app:bundleRelease :app:lintDebug --no-daemon --console=plain`;27 JVM tests, actual debug/release APK/AAB and lint. aapt verified new label and unchanged org.omnicompile.worker. No connected phone was available for a new installation/test. |
| Final web regression | PASS: `5de7ef1b62d6540a`, genuine C/Python/Java output/download and all five metric panels after native verification gating. Live socket ownership has an additional RED→GREEN unit regression. |
| Packaged browser/Windows | First fixture `e199bad6a0cb152e` failed at Electron launch timeout before enrollment. Unloaded rerun `0fafabff7393e2ff` PASS with unchanged assertions: actual Web Worker and packaged native Windows worker, distinct identities, same coordinator/network, rotation, verified results, reassignment, restart/reconnect and leave. No Android included. |
| Actual Docker execution gate | PASS:11/11 tests in `isolated-execution.test.ts` with `OMNICOMPILE_SANDBOX_TEST=1`, Docker mode and actual `oa-omnicompile-execution:local` image; not merely default skips. |
| Containers | Coordinator and web images rebuilt. Final smoke `c9b48d803078e719` PASS: real isolated MySQL, migration apply/check, authenticated own metrics, admin403, current product name, approval gate, non-root UIDs and SPA deep links. No public deployment. |

Final local image IDs: coordinator
`sha256:1f153f9df448b78014ef063ebccf6ec290549c205679d2aa2b07c2266dca0c8a`,
web `sha256:cad6329814c46fddf9a536c8cfe6db819867c114cc877e8c95711b19a60dbdd1`.
Earlier local image smokes39f52659c2694b04/3c076d5dee5d77a2 passed before the final
socket/filter/quotas; the final smoke above is authoritative for this delivery.

## Actual packages

- Windows: `.runtime/windows-worker/releases/OMNICOMPILE-Worker-0.1.1-Windows-x64-Setup.exe`
  SHA256 `5898aed12ed3940c5465e1f4f588abbadde445f62a6fc8f4394260c1062dde22`.
- Android debug: `apps/android-worker/app/build/outputs/apk/debug/app-debug.apk`
  SHA256 `f0fcd40a6eddac3234617a49279d2473b9959e33d168f0d359ff4cc31ee2e3d6`.
- Android unsigned release: `apps/android-worker/app/build/outputs/apk/release/app-release-unsigned.apk`.
- Android AAB: `apps/android-worker/app/build/outputs/bundle/release/app-release.aab`.
- Web: `apps/web/dist/`.

Legacy file names are deliberate upgrade compatibility, not old product labels.
Packages are generated/ignored, not committed or publicly published. Local
manifest regenerated from actual bytes. Hashes identify bytes, not publisher trust.

## Limitations and next acceptance

No phone currently detected; no new Android physical or simultaneous three-worker
pass is claimed. No authorized public cluster/domain, public distribution,
production signatures, unrelated-internet join or development-PC-off acceptance.
Custom C grammar remains a documented subset; broad single-unit C goes through
real GCC. Python/Java retain genuine language-appropriate pipelines. Multi-file
dependency builds, universal optimization and arbitrary native code on mobile/web
are not inferred. Existing task leases/retries/verification remain active; a new
name or percentage is not a security certification. Phase9 external gates and
Phase10–11 operations/release work remain open.

No developer records, databases, Docker volumes, credentials or installed worker
identities were reset. Test fixtures remove only their own labelled temporary
resources. Source regression tests and evidence are retained.
