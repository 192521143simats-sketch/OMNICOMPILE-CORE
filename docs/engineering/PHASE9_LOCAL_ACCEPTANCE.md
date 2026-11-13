# Phase 9 local integration acceptance — 17 October 2026

This record distinguishes local behavior from an authorized public release. No
account, paid resource, domain, registry publication or public deployment was
created. Existing MySQL records and Docker volumes are preserved.

## Implemented increment

- One existing `/join/:token` page offers browser consent and Windows/Android
  installation instructions for the same network. Local prerelease downloads are
  labelled separately from published releases.
- Append-only migration `0010_worker_approval` preserves existing authorizations.
  New dashboard-created networks require approval; pending workers cannot
  register or execute. Decisions are serialized, audited and SQL-paginated ten
  records per page.
- Existing admission toggles remain. Administrators can replace links, approve /
  reject enrollments, revoke workers and rotate native credentials. Self-rotation
  and protected replacement import preserve enrollment identity. Contribution
  stops until protected persistence succeeds and the peer explicitly resumes.
- Local installer/APK bytes are size/SHA-256 checked before download. Fixed paths,
  canonical containment and symlink rejection prevent arbitrary file downloads.
  Request budgets and four concurrent checksum slots bound verification work.
- Existing React, Electron and native Material3 views use the permanent terminal
  palette (#FF4D2E, #0C0D10, #FFFFFF, #D9D9D9), responsive layout, visible focus and
  explicit status text. No replacement UI framework was added.
- Coordinator/web image recipes, controlled migration CLI/Job, check-only startup
  and Kubernetes Job execution adapter extend the existing architecture. See
  `infra/kubernetes/DEPLOYMENT.md` for mandatory execution-runtime controls.

## Verification log

| Check | Actual result |
|---|---|
| First full repository verification | PASS: 348 Vitest tests, 19 script checks, workspace typechecks/builds; 11 Docker execution tests skipped, not counted as passing |
| Admission / migration / rotation API | PASS: isolated fixture `6cb42bf579317c47`, pending approval, decision race, rotation, old-link invalidation and check-only migration behavior |
| Scoped web UI | PASS: four files / eleven tests |
| Android JVM tests after import | PASS: 27 tests |
| Windows review regression | RED missing persisted enrollment ID; GREEN three credential tests including restart/import |
| Package concurrency regression | RED twenty verifications accepted; GREEN four accepted with busy responses and reusable slots |
| First three-platform fixture | FAILED: `3ba48d47c5c684a5`, Android registered but first task stayed queued; not accepted as a three-platform pass |
| Artifact first rerun | FAILED: stale verifier expected nine migrations; updated for append-only approval migration |
| Artifact second rerun | FAILED: `46853162b40e7946`, two C cases passed, Python submission had no eligible native network during concurrent packaging; unloaded-host rerun required |
| Container image smoke | PASS: `e81df023f17269ef`, actual MySQL service hostname, migration apply/check, API readiness/login/enrollment, SPA deep links and non-root UIDs; owned fixtures cleaned |
| API and actual local downloads | PASS: `4d5841b02c45c09a`, approval/races/rotation/link replacement/migration checks and actual installer/APK byte hashes, authorization and download throttling |
| Compiler artifacts unloaded-host rerun | PASS: `f1a85f72e523731c`, 13 genuine program cases, three invalid programs, actual outputs and authorized downloads |
| Execution/report integration | PASS: `72efe6b512060d43`, real Docker C/Python/Java execution, runtime failures/timeouts, accurate partial-success reports and authorization |
| Docker execution unit gate | PASS: eleven actual Docker tests with `OMNICOMPILE_SANDBOX_TEST=1`, image `oa-omnicompile-execution:local`; not merely the default skipped tests |
| Polished web product acceptance | PASS: `690dd0a356b83756`, real browser authentication/reset, administrator approval, browser enrollment, native language compilation/report/download and compact compiler form assertions; screenshots retained in the owned fixture directory |
| Android full build | PASS: unit tests, debug APK/test APK, unsigned release APK, AAB and lint; 27 JVM tests |
| Physical Android isolated UI/compute | PASS: five tests on Xiaomi/API29 using side-by-side `org.omnicompile.worker.acceptance`, preserving the ordinary installed application's identity. Keystore, bounded native computation/cancellation, consent and dark/light-configuration contrast tested |
| Updated Android network acceptance test | APK rebuilt after adding credential-rotation lifecycle assertions; not installed/rerun because ADB now detects no device. User explicitly requested continuing without the phone |
| Windows polished package | PASS: `npm run package:windows`, actual NSIS installer rebuilt with final layout-preserving styles; unsigned development package |
| Final two-platform acceptance | PASS: `d5d8f191c2def565`, actual browser Web Worker and packaged Windows worker, same coordinator/network, distinct identities, protected credential rotation, persisted results, browser-to-native reassignment and coordinator restart; Android explicitly excluded |
| Final full repository verification | PASS: `npm run verify`, 351 Vitest tests, 24 Node/script tests, all workspace typechecks/builds; eleven Docker tests skipped by default and separately executed as recorded above |
| Durable lease/recovery regressions | PASS: `npm run verify:recovery`, leases `2e7f90b18428a23a`, recovery `0717d3a94cb99de2`; actual coordinator crash/restart and MySQL interruption, stale leases, reassignment, preserved attempts and resumed compiler publication |
| Final rebuilt package download acceptance | PASS: `86b4c6a67ca8f9da`, `OMNICOMPILE_TEST_LOCAL_DISTRIBUTION=1 npm run verify:phase9`; actual final installer/APK bytes, hashes and API negative cases |
| Final polished container smoke | PASS: `5335e7581a7b2db9`, `node infra/docker/Verify-Images.mjs`; actual isolated MySQL, controlled migrations, coordinator readiness/login/approval gate, SPA deep links and non-root containers |

Primary commands executed for this increment: `npm run verify`,
`npm run verify:web`, `npm run verify:mixed`, `npm run verify:recovery`,
`npm run verify:phase9` (with local-distribution flag), `npm run verify:artifacts`,
`npm run verify:execution`, `npm run package:windows`, the Android Gradle command
below, `docker build -f infra/docker/web.Dockerfile -t omnicompile-web:phase9 .`,
`node infra/docker/Verify-Images.mjs`, and `kubectl kustomize infra/kubernetes`.
Captured logs and screenshots are retained under ignored `.runtime`; fixtures
clean up only their own temporary resources. Regression tests are retained in Git.

Independent review corrected missing Windows enrollment persistence and unbounded
package-verification requests; recheck found no further concrete P1/P2 findings in
that scoped patch. This is not penetration-test or universal sandbox certification.

## Local packages

From the root:

```powershell
npm run package:windows
node scripts/Local-Distribution.mjs
$env:OMNICOMPILE_LOCAL_DISTRIBUTION_MANIFEST = Get-Content -Raw .runtime/distribution/manifest.json
```

Start the coordinator with that environment to offer the actual local packages.
The generated manifest contains server-only paths, is Git-ignored and invents no
public URL. Windows is unsigned development software; Android debug is signed
with a development key. Hashes establish bytes, not release publisher trust.

Android build from `apps/android-worker`:

```powershell
$env:ANDROID_HOME = 'C:/Android/SDK'
$env:JAVA_HOME = 'C:/Program Files/Java/jdk-21.0.12.1'
./gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleDebugAndroidTest :app:assembleRelease :app:bundleRelease :app:lintDebug --no-daemon --console=plain
```

Output locations (verify existence/build success before claiming acceptance):

- `.runtime/windows-worker/releases/OMNICOMPILE-Worker-0.1.1-Windows-x64-Setup.exe`
- `apps/android-worker/app/build/outputs/apk/debug/app-debug.apk`
- `apps/android-worker/app/build/outputs/apk/release/app-release-unsigned.apk`
- `apps/android-worker/app/build/outputs/bundle/release/app-release.aab`
- `apps/web/dist/`

Final polished Windows installer SHA-256:
`b9a55e73ee57cc85e1c4d9c0926a8d0df039cce362f5c7183009617beeb81d41`.
Normal Android debug APK SHA-256:
`2801f2eacb50f91a1968875ccb21324781f0e83a81b2b37b20b62f81a2ce014c`.
Keep the generated local manifest synchronized by rerunning
`node scripts/Local-Distribution.mjs` after rebuilding either package.

## External gates

Public-internet enrollment, development-PC-off independence, live Kubernetes
admission/execution/containment, production signatures and centrally published
downloads remain unverified. No cluster/domain is approved. ADB reverse is local
test transport, not public internet connectivity.

Figma authentication/file creation succeeded at
https://www.figma.com/design/Vn2IJFKxmmYgUh9Ahx7dJ1 . Canvas execution returned
`Unknown tool` twice; the file is blank, not a completed design deliverable. Actual
interface builds and browser/device checks remain the acceptance evidence.

The final UI direction was explicitly approved as **keep the current layout;
polish it only**. Typography, spacing, table hierarchy, controls, focus, mobile
spacing and compiler-form sizing changed; navigation and product behavior were
not replaced. The first final typecheck exposed missing `@types/jsdom` for the
computed-style regression; that development dependency was added before retest.

Phase 9 cannot be globally sealed until its external/device gates pass. Phase 10
is security/CI/operations; Phase 11 is release certification and separately approved
publication. The source-qualified implementation plan defines these phases.
