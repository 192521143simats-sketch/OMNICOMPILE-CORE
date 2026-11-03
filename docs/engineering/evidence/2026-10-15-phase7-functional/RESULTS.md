# Phase7 functional acceptance — 2026-10-15

Baseline: 80090d23a8f93b4aa17f1c4b80f7b85c535d6c37.
User override: functional installable Windows native node, no production-only
installations or development. See USER_REQUIREMENT_OVERRIDES.md.

## Changes

- Extended real installer acceptance with uninstall/reinstall, encrypted-settings
  preservation, cleared-after-leave enrollment and no automatic contribution.
- Read-only review found installer-failure cleanup could be skipped after a
  partial write, and an unbounded close could prevent final uninstall. Added
  failing helper tests, then failure cleanup with original/cleanup errors retained
  and a bounded close using the retained owned process. Three helper tests passed.
- Narrowed the reinstall claim: it tests a cleared-after-leave identity, not a
  retained revoked credential. Revocation is tested separately in the native flow.
- No application, compiler, database, worker-protocol, dependency or package-build
  source differs from the verified 80090d2 baseline. Existing installer unchanged.
- Stopped optional compiler bundling after the user's scope revision; removed
  only this turn's four uncommitted experimental files and 5603328-byte partial
  download. No new compiler, VM, OS feature or signing service was installed.

## Actual verification

| Command | Result |
| --- | --- |
| `node --test scripts/windows-install-lifecycle.test.mjs` | RED missing helper exports, then GREEN 3/3; actual owned-process termination and real filesystem cleanup |
| `npm run verify:windows-install` | PASS, f5592dc029138ad3, initial real reinstall acceptance |
| `npm run verify:windows-install` | PASS, cb241f55ee0a452e, final reviewed/cleanup-corrected flow, exit 0 |
| `$env:OMNICOMPILE_SANDBOX_TEST='1'; npm run verify` | PASS, exit 0; 327/327 tests, 15/15 script/settings checks, all nine builds/typechecks |
| `git diff --check` | PASS |
| `Get-FileHash ...Setup.exe -Algorithm SHA256` | f100aa1b2e15789bf281bd0b7601b2e77f277c1ca3733eb7721e8ab6e7e57882 |
| `Get-AuthenticodeSignature ...Setup.exe` | NotSigned, explicitly not represented as production-signed |

The final installed application registered as a real native worker, submitted five
independently checked persisted task results, survived actual coordinator restart
and completed a recovered prime task, and completed actual native C/Python/Java
compilation attempts with authorized artifact downloads. Pause/resume, encrypted
identity through upgrade/restart, revocation/re-enrollment/leave, persisted logs,
queried Windows quotas and scoped coordinator counters passed. Uninstall removed
application/shortcuts/registration; reinstall retained encrypted settings and the
cleared enrollment without auto-starting; final uninstall also passed.

MySQL used guarded random tmpfs fixtures, not developer records or volumes. No
public publishing, physical-device certification or clean-OS verification occurred.
The review declined to judge runtime installation outcomes and production claims;
actual fixture results establish the former, and the user excludes the latter.

## Acceptance

Phase7 **functional v1 sealed**, solely within PHASE7_FUNCTIONAL_ACCEPTANCE.md and
the explicit user override. Production signatures, native compiler distributions,
fresh Windows certification and arbitrary-untrusted-code filesystem/network
containment remain unclaimed, not falsely passed. Supported compiler workloads
still require actual compatible installed tools and explicit trusted-host consent.
