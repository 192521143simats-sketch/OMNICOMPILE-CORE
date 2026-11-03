# Phase7 functional v1 — Windows native worker acceptance

Status: **SEALED — functional v1, 2026-10-15**, under the explicit user scope override.
This document is not a production certificate.

## Authoritative scope

The explicit 2026-10-15 user override accepts an installable Windows application
that genuinely joins as a native node and performs its supported functions,
without production-only installations or additional platform development. See
USER_REQUIREMENT_OVERRIDES.md. The existing 0.1.1 application is retained; only
functional acceptance tests and their cleanup handling are extended in this turn.

| Functional requirement | Acceptance evidence |
| --- | --- |
| Install and launch without user CMD/Node/npm setup | Actual per-user NSIS installer and bundled private Node runtime |
| Explicit join, protected identity and native registration | Actual consent, NODE-A001 registration, DPAPI restart/upgrade identity |
| Authorized execution and real results | Five independently verified persisted workloads; native C/Python/Java attempts and authorized artifact downloads |
| Heartbeat, resource monitoring and controls | Actual coordinator state/counters and queried Windows CPU/memory limits; pause/resume/disconnect |
| Failure recovery and revocation | Actual coordinator restart, recovered computation, revoke/re-enroll/leave |
| Diagnostics and upgrade | Persisted status logs; actual 0.1.0-to-0.1.1 upgrade preserving identity |
| Uninstall and reinstall | App/shortcuts/registration removed; encrypted settings and cleared-after-leave enrollment preserved without automatic contribution |

The live acceptance uses an isolated MySQL fixture and coordinator. Developer
records and Docker volumes are not reset or deleted. A clean private profile on
this host is not represented as a clean-OS certification.

## Actual user workflow

1. Start the existing project with `START-OMNICOMPILE.bat`.
2. Create/open an active network as admin and copy its reachable join link.
3. Install `OMNICOMPILE-Worker-0.1.1-Windows-x64-Setup.exe` on a compatible Windows PC.
4. Open OMNICOMPILE Worker, paste the link, explicitly consent and choose Become a Worker.
5. The coordinator registers the native node and receives its heartbeat. Supported
   assignments execute in the actual native worker and results return to MySQL.
6. Pause/Resume controls contribution; Leave revokes enrollment. Closing the app
   stops contribution; reopening requires an explicit Connect.

Installation alone never silently enrolls a device. The coordinator must be
reachable. Native C/Python/Java workloads require actual compatible installed
toolchains and the existing trusted-development option; portable computation
does not require those compilers. Unavailable capabilities are not fabricated.

## Explicitly outside this functional acceptance

Production signatures, fresh-OS/VM certification, private compiler distributions,
public deployment and full filesystem/network containment for arbitrary untrusted
programs are not claimed. The installer remains unsigned. Existing resource
limits, credential protection, authorization and disabled-by-default native
compiler consent remain unchanged. This acceptance is not permission to expose
trusted-host native execution as a secure public arbitrary-code sandbox.

## Review and test record

Fresh install/upgrade/native compilation/uninstall/reinstall passed in fixture
`f5592dc029138ad3`. Review found two acceptance-harness cleanup defects: installer
failure after writing its target, and unbounded graceful desktop close. Added
failing helper tests, implemented failure cleanup with both errors preserved and
bounded close with actual owned-process termination; all three tests passed.
The reinstall wording was narrowed to the actual cleared-after-leave scenario;
it does not claim a retained revoked credential was tested during reinstall.

Final functional rerun: `npm run verify:windows-install`, fixture
`cb241f55ee0a452e`, exit 0, including actual uninstall/reinstall and final cleanup.
Full regression: `$env:OMNICOMPILE_SANDBOX_TEST='1'; npm run verify`, exit 0: all
327/327 tests, 15/15 script/settings checks, and all nine workspace builds and
typechecks passed. No application/runtime source change was needed after the
verified 80090d2 baseline. Installer SHA-256 remains
`f100aa1b2e15789bf281bd0b7601b2e77f277c1ca3733eb7721e8ab6e7e57882`.

Engineering assessment: **9/10 for the accepted functional native-worker build**.
This is a subjective quality assessment, not measured performance, universal
Windows certification or a claim that the entire platform is complete.

Next dependency-ordered phase: Phase8, native Android worker and APK. It is not
substituted by the already-existing browser worker and is not claimed complete.
