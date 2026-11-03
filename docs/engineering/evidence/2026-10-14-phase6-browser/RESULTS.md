# Phase 6 browser evidence — 2026-10-14

Base 48fa618b307ad29a6f01e79411672357b7de5d90. Existing engineering branch,
repository Node 24.21.0, Windows/installed Edge, Docker Linux/MySQL 8.4.
Developer .env, records and named volumes were not modified. No public deployment,
real provider request or signing key creation is claimed. Physical browser
acceptance is recorded below, independently from emulator evidence.

## Test-first and review evidence

- Browser controller: initial missing module, then seven missing-behavior failures;
  implemented connection/attempt lifecycle, all seven passed. Added cancellation
  reconnect regression: RED on 1012 service restart, then GREEN.
- Worker execution: missing digest-round progress RED; checkpoint/deadline GREEN.
  Hand-derived SHA, matrix and uint32 fixtures and rejection of native/malformed
  workloads remain green. Progress is actual rounds/rows, not fabricated time.
- Connection serialization: RED showed registration before old cleanup finished;
  keyed queue GREEN, independent identities proceed, rejected operations release.
- Component: freeze/resume and unavailable measurements passed; pause-remount RED
  CONNECTING instead of PAUSED, then GREEN with nonsecret tab preference.
- Independent read-only review: two P1 findings fixed (old cleanup overwrites
  replacement node, 1012 cancellation mistaken for takeover); expanded actual
  integration coverage addresses the reviewed C IR/lifecycle/revocation gaps.
- React best-practices review retained one owned effect/listener cleanup, worker
  progress throttling and functional state updates; no new UI framework/refactor.
  Context7 official Playwright documentation informed offline/mobile/TLS tests.

## Failed live runs retained honestly

- 27cefb6df4960456/c9a905a84c0d4d61: verifier POST lacked Origin, correctly 403;
  fixed test transport, not server authorization.
- 1e86ced18d920611: worker scope endpoint 404 before implementation (RED).
- 9beaf8704c5893c7/a7b189b9f1971195: actual QUEUED task with live browser and
  persisted OFFLINE node; diagnosed old-close/new-register race, fixed ordering.
- 791c0ab36ccc86db: verifier asserted leave completion before asynchronous POST;
  now waits for actual scope revocation.
- 5c9c39fdf8027db7/978c6391db911a47/9945fa3dd033c4e4: headless CDP Page.freeze
  did not withdraw heartbeats, including after freeze listeners were added. Not
  marked as OS freeze acceptance. Real renderer Debugger pause plus heartbeat
  timeout now exercised; DOM event handling tested separately.
- 1346909f662f7d4a/7654bda5d3806905/d4d8e5ee7c43f76c: eligibility verifier used
  admin-only identity (403), then incorrect expected status/message for existing
  compiler admission (409 with native-worker guidance). Corrected test contract.
- a5e037e0411a2209: verifier attempted JSON parse on successful 204 revocation;
  fixed test response handling.
- d0a82ddb1cd8e6f0: native execution regression denied invoice submission while
  other browser/unit fixtures ran concurrently. Serial rerun is recorded below;
  production resource thresholds and timeouts were not relaxed.

## Fresh verified results

| Command | Result |
| --- | --- |
| PowerShell `$env:OMNICOMPILE_SANDBOX_TEST='1'; npm test -- --maxWorkers=1` | 317/317 tests, 48 files, no skips |
| `node --test scripts/*.test.mjs` | 5/5 passed |
| `npm run typecheck` | Eight workspaces passed |
| `npm run build` | Eight workspaces passed; actual Web Worker asset generated |
| `npm audit --json` | Zero advisories |
| `node scripts/Run-Isolated-Integration.mjs all` | Passed, 35dda557149d0dcb |
| `node scripts/Run-Isolated-Integration.mjs browser` | Initial core passed, a73681867b6f880d |
| PowerShell `$env:OMNICOMPILE_TEST_TLS='1'; node scripts/Run-Isolated-Integration.mjs browser` | Expanded HTTPS/WSS passed, a91c7851e54f8df9 |
| Caddy 2.10-alpine isolated `caddy validate --config /etc/caddy/Caddyfile` | Passed after formatting; no serving/publishing/certificate issuance |
| `adb devices -l` | No devices; physical acceptance BLOCKED |

Expanded browser suite: desktop/Pixel 7-emulated contexts; actual Web Workers for
five portable operations and C IR, independent digest/matrix/checksum expectations
and persisted attempts/results; task progress/cancel; pause/remount; renderer
suspension/heartbeat timeout; duplicate-tab takeover; offline/reload/reopen with
stable identity; interrupted active work retries; coordinator restart followed by
completed work; native eligibility denial, cross-network isolation, leave/revoke.
Local TLS uses ignored one-day fixture keys and context-only self-signed trust;
actual secure context and WSS URL asserted. Not a public/trusted TLS deployment.

## Serial regression closure

- `node scripts/Run-Isolated-Integration.mjs execution`: passed,
  7155539f97427726. Real C/Python/Java execution, runtime failure/timeout, diagnostic
  reports and artifact authorization; no resource threshold relaxation.
- `node scripts/Run-Isolated-Integration.mjs phase4`: passed, 5ef4ebc083c5bc12.
  Actual database/coordinator interruption, leases/cancellation/retry/history.
- `node scripts/Run-Isolated-Integration.mjs web`: passed, 6d01d593be4093d9.
  Existing full user/admin journeys, all three native compiler uploads/downloads,
  consent, settings, password reset/session revocation and responsive keyboard UX.

## Physical device attempts

### Final physical acceptance — PASS

After the device pass, the user reported a reachability error on the test tab.
The fixture log confirms leave HTTP 204 before owned server shutdown; retrying
the now-unreachable temporary endpoint is not a live-production connection test.
Also reproduced a standalone worker UX defect: successful leave left Resume/Leave
buttons visible. Added a failing React-DOM test, then a terminal LEFT confirmation
without those credentialless controls; four component tests passed. This follow-up
UI correction is separately tested in actual desktop/mobile-emulated browser
integration, not falsely described as part of the earlier physical screenshot.
The HTTPS/WSS full-browser rerun **5f1f7ee02da0cdec** passed, exit 0, including
visible successful-leave confirmation and absence of stale Leave controls in
both desktop Edge and Android-emulated Chromium. All eight workspace
typechecks/builds also passed after this UI correction.
Final full `OMNICOMPILE_SANDBOX_TEST=1 npm test -- --maxWorkers=1`: **318/318**,
48 files, no skips, 115.06 seconds. Final script guard tests: **5/5**. Disposable
TLS files from this last fixture were also removed (2,839 additional bytes).
One background ER_LOCK_DEADLOCK was logged during that device fixture's leave;
the leave transaction returned 204 and persisted revocation assertions passed.
This is disclosed rather than claiming an entirely error-free log.

`$env:OMNICOMPILE_ANDROID_MANUAL='1'; node scripts/Run-Isolated-Integration.mjs android-browser`
passed fixture **836139ed765adc44**, both runner and verifier exit **0**.
Physical M2004J19C, Android 10, installed Chrome 155.0.8059.39; normal native
Chrome UI with human taps, not WebView/emulation/CDP-injected success.
Five actual Web Worker results (SHA-256, prime count, matrix multiplication,
portable benchmark, digest chain) matched independent literal MySQL assertions.
Explicit consent, pause, user-confirmed paused state after reload, resume,
background/foreground, stable node ID, cancellation and leave/revocation passed.
ADB reverse/forward lists were empty afterward, USB sleep preference remained
0, owned XML was absent, and disposable fixture containers were removed.
No browser data, helper APK or native Android package was created/cleared.
Ignored screenshot: .runtime/integration/836139ed765adc44/physical-android-worker.png.
USB loopback does not establish public internet reachability.

Previous 7432e3378347b9f4 passed every application assertion but failed cleanup:
manual mode had never created its optional XML file. Fixed exact-owned-file
cleanup to tolerate absence; removed its owned reverse rule; the final full
rerun above passed including cleanup. Manual verifier prompts are streamed and
its overall deadline is bounded at 15 minutes (each action remains 2 minutes).

Additional attempts: d2742713f41fe518/e4a7eb63fee49323 observed the phone asleep
and locked; after user unlock, 9a1b655028cb9699 still failed MIUI INJECT_EVENTS.
User chose manual taps. 82b9cc845e22e942 exposed the same MIUI restriction on
sleep-setting writes; manual mode now avoids input and sleep-setting changes.
Fixture 1457fb1343e285c5 genuinely passed all five computations and their literal
MySQL assertions, pause/resume, actual background/foreground and cancellation.
Its final leave assertion timed out: the phone remained on HOME, so this is
partial device evidence, NOT a whole-suite pass. Console manual prompts now
stream from the otherwise captured verifier output for guided acceptance.

Cleanup removed twelve disposable one-day TLS test key/certificate files from
six exact owned fixture directories (17,034 bytes). Evidence logs, regression
tests, samples, developer data, toolchains and build outputs were preserved.

Phone was subsequently connected and authorized: M2004J19C, Android 10,
installed Chrome 155.0.8059.39. Initial Playwright Android launch did not honor
its custom debug socket (75f813a632a713cd); the owned temporary command-line file
and reverse rule were removed. Standard CDP attach succeeded once but an initial
verifier fetch-contract bug interrupted it (6876dbb59831954e); the subsequent
normal Chrome launch had no attachable socket (cf78950eb4ffdc74).

Native Chrome/UI-based test (68b2c70d12f3b408) loaded the OMNICOMPILE application but
MIUI rejected ADB input with INJECT_EVENTS. No physical computation pass is
inferred from page rendering. The user initially offered to enable USB debugging
(Security settings), then chose manual taps as recorded above. No browser data
was cleared, helper APK installed, persistent debug
setting bypassed or arbitrary personal file removed. Only owned XML/ADB rules
and the proven owned temporary debug file were cleaned.
