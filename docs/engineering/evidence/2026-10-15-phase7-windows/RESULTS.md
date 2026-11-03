# Phase 7 Windows engineering evidence — in progress

Base: 693cd579e54a87f060114de75bfe2d92f8859749, existing engineering branch.
Developer MySQL volume, .env, credentials and source samples are preserved.
No phase seal or clean-machine/signing claim is made by this working record.

## Actual checks so far

- Native session tests: initial missing-module RED, then fixture protocol errors
  corrected (`taskKind`, heartbeat minimum 1000 ms), actual owned-process test
  bound raised to 20 seconds without changing production limits; seven pass.
- Encrypted-store/settings/renderer tests: five pass. Corrupt-store overwrite and
  disabled-save button reproduced RED before fixes. Store crypto double is only
  a unit boundary; actual Electron DPAPI must pass independently.
- Windows native job guard: missing executable RED, then actual Windows API
  configuration/query and kill-on-close process test GREEN. CPU 50% (5000/10000),
  committed-memory 80 MB (83886080 bytes); unrelated processes not targeted.
- All nine workspace typechecks pass on 2026-10-15.
- Actual NSIS installer 0.1.0 built, including private Node 24.21.0, Electron and
  worker bundle. Actual Get-AuthenticodeSignature returns NotSigned. Builder's
  informational 'signing with signtool.exe' line is NOT signature evidence.
- Newest builder initially introduced eight moderate advisories. Trying 26.5.0
  introduced high/critical historical advisories; reverted to 26.15.3 and pinned
  its @electron/get dependency to 5.1.0. npm install/audit then reported zero.
  Actual packaging with that override built successfully after correcting Arch
  enum usage (not an Electron/get API mismatch).

## Independent review and fixes

- Default maxCpuPercent capability policy made tasks ineligible because the
  existing scheduler requires explicit per-task CPU budgets. Kept scheduler
  fail-closed semantics; desktop policy no longer advertises that incompatible
  task budget. Windows kernel job CPU cap is a separate process control.
- Unconfirmed descendant termination was swallowed by stop/pause: failing test
  then fatal-state persistence, rejected control acknowledgements, no safe-stop
  claim. Revoked identity clearing accepts already-invalid (401) leave responses.
- Corrupt encrypted identity is preserved and further ordinary writes rejected.
- Stale profiling rejection and permanently disabled Save controls each received
  failing behavioral tests, then fixes. Header/backoff/local-admission tests added.
- Execution filesystem/network containment, clean VM, signed release, bundled
  native toolchains and installation/upgrade/uninstall remain explicit gates.

## Failed isolated runs

- 30ba6e00e22ce31c: fixture-generated link used historical localhost:5173 default;
  desktop never registered in the fixture. Native test mode now sets its public
  origin to the isolated coordinator and verifier refuses any differing origin.
  The random fixture invitation was not valid for the developer database; no
  successful developer enrollment is inferred or claimed.
- c7421b424c5508b0: actual packaged registration succeeded but task stayed QUEUED;
  reproduced review's incompatible CPU policy before rebuilding the package.
- 616746d1962f9afe: rebuilt package registered but task failed three attempts;
  collecting actual persisted diagnostics before changing execution behavior.

Docker Desktop was stopped on continuation; launched its installed executable
hidden and waited through bounded readiness before isolated MySQL tests. No
developer database reset or Docker volume deletion was performed.

## Fresh verification and subsequent fixes

- `npm run verify`: PASS, all nine workspace typechecks/builds, 316 Vitest
  tests passed and 11 skipped, seven script-level tests passed. Native Windows
  Job test compiles its helper in a fresh owned temporary directory and verifies
  queried 50% CPU/80 MiB limits and actual child termination on guard closure.
- `node --test apps/windows-worker/settings.test.mjs`: PASS, 5 tests.
- `npx vitest run apps/worker/src/session.test.ts apps/coordinator/src/worker-status.test.ts`:
  PASS, 9 tests. An attempted Node-test invocation of the Vitest session file
  failed because it uses Vitest hooks; corrected the runner, not product code.
- `npm audit --omit=dev`: PASS, zero advisories. Dependency installation also
  reported zero total advisories after the compatible builder dependency override.
- `npm run package:windows`: PASS, actual unsigned 0.1.1 NSIS executable.
  `Get-AuthenticodeSignature`: NotSigned, explicitly not production-signed.
- `npm run verify:windows`: PASS, fixture `6e34af04f6be459d`, actual packaged
  Electron/private Node/coordinator/MySQL, five independently checked real task
  results, queried Windows limits, database-accepted counts, persisted logs,
  pause/resume, encrypted restart identity, revoke/re-enroll/leave.
- Desktop kernel CPU quota replaces redundant host-wide CPU admission; a busy
  host must not consume retry attempts merely because the configured kernel
  quota is already enforcing contribution limits. Shared optional admission
  behavior remains separately tested for callers that intentionally request it.
- Close now serializes behind pending controls; owned-process cleanup captures
  its handle before Electron disposal. Fixtures `85b263e2c065682e` and
  `db89cac372ab9f42` exposed the product close race and harness disposal bug.
  Fixture `a51e7e3cfe1d3485` correctly required renewed explicit consent; the
  harness now checks consent again instead of weakening admission. Corrected
  full 0.1.0 packaged flow passed in `dbbeb2c43a6e0bd7`.
- Installer fixture `21b4f3ee2e06cfbd` installed/uninstalled but registry
  assertion used the wrong display name: NSIS includes the version. Recognition
  now uses that exact product convention and derives location from its quoted
  uninstaller when the uninstall registry entry omits InstallLocation.
- Fixture `dcff6d53fa74577d` reached real upgrade but upgraded Electron launch
  timed out; its cause is not established. Do not infer automatic contribution
  or a completed upgrade from this failure. Cleanup removed owned registration.
- Fixture `c0c1f679e6291ca5` incorrectly expected new 0.1.1 monitoring fields
  from baseline 0.1.0. Version-aware checks now validate those fields after the
  upgrade and directly for 0.1.1. This is a harness correction, not a product pass.
- Independent read-only review of job guard, guarded lifecycle, runtime checksum,
  installer ownership and scoped status query established no important finding;
  that review did not claim runtime installation evidence.

Runtime lock SHA-256 is the official Node 24.21.0 win-x64/node.exe digest,
verified against the existing local bytes before use. Corrupt bytes are refused,
not executed. Package output remains ignored and includes redistribution licenses.
Default root builds remain cross-platform TypeScript/web builds; Windows package
generation is an explicit Windows-only command, not an accidental Linux CI gate.

## Integration regression results

- `npm run verify:windows-install`: PASS, fixture `ecec3d0efbce3266`, actual
  fresh per-user install, five computations, encrypted-identity-preserving
  0.1.0-to-0.1.1 upgrade, controls/revocation/re-enrollment and uninstall.
- `npm run verify:phase4`: PASS, `cc54595997e26c78`, real MySQL restart,
  coordinator restart, reassignment, persisted deadlines/backoff/history,
  superseded-result rejection, publication rollback, cancellation during MySQL
  pause and isolated backup restore.
- `npm run verify:artifacts`: PASS, `b25d4ed066247d00`, migrations/concurrency/
  protocol plus thirteen genuine language programs and three invalid programs,
  real executable/bytecode/JAR outputs, authorized downloads, report diagnostics,
  Unicode/filename limits, actual output execution and absent-artifact rejection.
- `npm run verify:browser`: PASS, `5ccd63b118e2184d`, actual desktop Edge and
  Android-emulated Chromium Web Workers with five workloads, progress/cancel,
  pause/reload/offline/reconnect/close/leave. Not a fresh physical-phone test.
- `node --test scripts/*.test.mjs apps/windows-worker/settings.test.mjs`: PASS,
  12/12 checks, including requirement-ledger preservation and actual Windows job.
- `OMNICOMPILE_SANDBOX_TEST=1 npx vitest run apps/coordinator/src/isolated-execution.test.ts`:
  PASS, all 11 previously skipped Docker isolation cases. These are Linux Docker
  execution tests, not Windows filesystem/network compiler containment.
- Extended installer fixture `94b36916816548ac` reproduced the historical 0.1.0
  host-CPU admission failure. The retained baseline is immutable; its test now
  explicitly configures 100% admission before contribution. The 0.1.1 bridge uses
  the kernel cap instead and does not advertise the obsolete admission threshold.
- Extended fixture `6d27bd56e148b1ed` verified actual coordinator restart and
  post-restart computation, then correctly rejected an ADMIN compiler submission
  with 403. The harness now uses a separately authenticated USER, preserving RBAC.
- Extended fixture `5af44c706fc3ce37` compiled valid C successfully but its query
  incorrectly expected C_COMPILE for the existing supported-IR route. A structure
  program now deliberately exercises the general-C native route; the existing
  compiler architecture was not changed to satisfy the test.

No device is currently listed by `adb devices -l`. No native Android package,
new physical Android test or public Internet deployment is claimed in this phase.

## Extended installed-worker acceptance

`npm run verify:windows-install`: PASS, fixture `7494431320b61efe`, exit 0.
In addition to install/upgrade/identity/controls/revocation/leave, this run
restarted the actual isolated coordinator, independently checked the recovered
prime result, enabled trusted-development native compilation through desktop
settings, submitted jobs using a separate USER session, and verified completed
C_COMPILE/PYTHON_COMPILE/JAVA_COMPILE attempts belonged to the installed worker.
Real C executable, generated Python and Java JAR downloads passed. The test
uninstalled application, desktop/start-menu shortcuts and registration, preserving
protected configuration. This is not a clean-OS or bundled-compiler certification.

Generated installer:
`.runtime/windows-worker/releases/OMNICOMPILE-Worker-0.1.1-Windows-x64-Setup.exe`

- Size: 135936136 bytes.
- SHA-256: `f100aa1b2e15789bf281bd0b7601b2e77f277c1ca3733eb7721e8ab6e7e57882`.
- Actual Authenticode status: `NotSigned`.
- Not committed or published; installer and all generated runtime data are ignored.

## Final verification sweep

`$env:OMNICOMPILE_SANDBOX_TEST='1'; npm run verify`: PASS, exit 0.
All nine workspace typechecks/builds, **327/327 tests in 50 files with none
skipped**, and **12/12 script/settings tests** passed. Full `npm audit` returned
zero vulnerabilities. `git diff --check` passed. `.env` and generated installer
are confirmed ignored. The engineering branch and requested GitHub origin were
verified; fetch showed no divergent remote commits before committing this stage.

Phase7 remains IN_PROGRESS, not a production seal. Exact remaining work is
listed in PHASE7_IMPLEMENTATION_PLAN.md: standalone compiler distributions,
untrusted native filesystem/network containment, clean Windows acceptance and
real production signing. No source tests or legitimate samples are removed.

Cleanup of eight explicitly owned, ignored test-uninstaller remnants was blocked
by the environment's execution policy before execution. They remain preserved;
no project/user data, database, volume or release installer was deleted.
