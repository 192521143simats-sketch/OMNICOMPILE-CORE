# Native Android verification — 15 October 2026

## Final functional acceptance and theme correction

All nine B:20 Phase8 implementation/functional exit obligations passed on the
available Xiaomi API29 device. This is functional v1 acceptance, not a production
signature or universal Android certification.

The app now automatically selects light/dark Material palettes using the device
configuration. Native launch/status/navigation colors follow night resources;
Android force-dark is disabled on API29+ to prevent double inversion. API-specific
attributes live in versioned resource folders. No manual app theme setup needed.

Fresh verification of the final APK:

- `:app:testDebugUnitTest`: 25 tests, zero failures.
- `:app:assembleDebug :app:assembleDebugAndroidTest :app:assembleRelease
  :app:bundleRelease :app:lintDebug`: passed. Lint has warnings, zero errors;
  pinned dependency updates and wider platform checks are not silently claimed.
- Both APKs updated successfully using `adb install -r`, retaining app data.
- Physical instrumentation: 5 tests passed. Actual dark-mode screen rendering,
  controlled light-mode composition rendering, Keystore, compute and consent.
  Xiaomi reports night-mode locked; a shell request did not switch the system
  theme. Light rendering was therefore tested with an isolated configuration,
  not falsely reported as a successful global theme switch. Device remains dark.
- Exact rebuilt APK end-to-end acceptance passed: fixture `6f90f70b244a9fa2`,
  five real portable results, verified C IR optimization, coordinator restart,
  cancellation/reconnect, pause/recreation/resume/disconnect/leave and downloads.
- Fresh `OMNICOMPILE_SANDBOX_TEST=1 npm run verify`: 327 tests, 16 script checks,
  nine workspace typechecks and builds passed.
- Debug `apksigner verify --print-certs` passed; debug certificate only.

Final debug APK SHA256:
`974493bf8c88231e9b74957260cbb77508cf3340f4192ae7fd242aedd47c4f8f`.
Instrumentation APK SHA256:
`2126bc2fc517532751ec199974372c0ddab2fb70f3ab15679a4712d040a362ef`.

Failures retained: initial theme test exposed absent automatic palette selection;
the first palette implementation missed the stronger foreground brightness check;
initial lint rejected unversioned API27/29 attributes. All were corrected and the
full Android command rerun successfully, without suppressing lint errors.

Next: Phase9 heterogeneous integration (browser-only, Windows-only, Android-only,
pairwise and all-worker combinations, failure/reassignment, database interruption,
cancellation, capability filtering and final artifact verification). No Phase9
seal is inferred from this Android-only acceptance.

## Verified checkpoint

Native Kotlin/Compose worker, not a WebView. Uses existing coordinator protocol v1
and MySQL. No coordinator/compiler schema replacement.

- JDK 21.0.12.1, Gradle 8.13, SDK 36, build tools 36.0.0.
- Android JVM tests: 23 passed.
- Debug APK, instrumentation APK, unsigned release APK and release AAB built.
- Root `OMNICOMPILE_SANDBOX_TEST=1 npm run verify`: 327 Vitest tests, 16 script tests,
  all nine workspace typechecks and builds passed.
- Xiaomi M2004J19C, Android 10/API 29: both APKs manually installed after Xiaomi
  rejected ADB installation. Installed APK hashes matched local build outputs.
- Physical Keystore, native compute and initial consent tests: 3 passed.
- `npm run verify:artifacts`: passed, isolated fixture `06de8dee7a4aa7b2`;
  migrations, MySQL concurrency, protocol and real C/Python/Java artifact regressions.
- `OMNICOMPILE_ANDROID_PREINSTALLED=1 npm run verify:android-native`: passed, isolated
  fixture `bfabc9540fc3388b`. Five real portable task results accepted; C IR
  optimization persisted and verified; coordinator restart; cancellation/reconnect;
  pause/activity recreation/resume; disconnect; leave; authorized artifact downloads.

The initial end-to-end verifier failed because it incorrectly joined IR tasks
directly to job_id. Existing IR tasks are related through optimization batches.
The corrected verifier checks that authoritative relationship and actual phone
attempt ownership; no runtime/compiler behavior was weakened to pass the test.

## Capability and release boundaries

Allowlisted SHA-256, prime counting, hash chains, integer matrix multiplication,
portable benchmark and compatible C IR optimization execute on Android. Desktop
GCC, CPython and JDK are not advertised. Host toolchains generate final artifacts.
Memory/input bounds and cooperative deadlines/cancellation are not a hard OS
heap or CPU sandbox. OS-wide CPU utilization is unavailable and explicitly marked
unavailable; own-process CPU is measured separately.

Release APK/AAB are unsigned; production signing and store approval were not
performed. Physical acceptance covers API 29, not every Android release. Internet
deployment/TLS hosting was not provisioned; device integration used an owned ADB
reverse mapping. No developer database or Docker volume was reset.

## Artifact locations

Under `apps/android-worker/app/build/outputs/`:

- `apk/debug/app-debug.apk`
- `apk/androidTest/debug/app-debug-androidTest.apk`
- `apk/release/app-release-unsigned.apk`
- `bundle/release/app-release.aab`

These generated files are intentionally ignored by Git. Regression test sources
are retained; only the isolated integration runner cleans its owned fixtures.
