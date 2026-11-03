# Phase 9 execution — 16 October 2026

## Scope and decisions

Execute the supplied Phase9 master and A–F addendum in the requested workstream
order; preserve the existing compiler, MySQL model, worker protocol and source.
The exact palette is #FF4D2E / #0C0D10 / #FFFFFF / #D9D9D9. New explicit dark-only
requirements supersede Phase8 automatic appearance and are now implemented.
Reusable network admission remains controlled and revocable; add administrator
approval as a separate enrollment authorization gate, not a separate identity system.
Publishing, chargeable infrastructure and secret creation require explicit approval.

## Audit

| Area | Status | Evidence / next action |
|---|---|---|
| Git baseline | Verified | e3b2b67, clean engineering/omnicompile-release-foundation, requested origin |
| Existing implementation | Verified | Fastify/MySQL, React/Vite, Electron/native core, Kotlin/Compose, protocol1 |
| Dependency audit | Verified | npm audit: 0 advisories; shell-quote1.12.0 through concurrently |
| Public endpoint configuration | Defect Found | HTTPS localhost/private URLs passed production validation; regression reproduced |
| Docker | Verified | Desktop launched hidden; Docker29.8.2 ready; isolated MySQL tests passed |
| Physical Android | Verified | Authorized M2004J19C/API29; live native acceptance passed fixture 4c051425541b8c41 |
| Kubernetes deployment | Blocked | kubectl installed, no cluster context; no deployment/account access supplied |
| Public distribution | Defect Found | Local packages exist, no verified centrally hosted download release |
| Unified joining page | Defect Found | Existing /join supports browser consent, not all three distribution choices |
| Approval / rotation | Defect Found | Existing consent/revocation present; new approval and rotation flow not accepted |
| Cross-platform simultaneous run | Blocked | Needs actual Android plus real coordinator; not inferred from individual tests |
| Independent public service | Blocked | No hosted infrastructure or public URL verified; laptop-off test cannot pass yet |

## Ordered checklist

- [x] Inspect baseline and reproduce production endpoint validation defect.
- [x] Harden public endpoint validation; run targeted red/green and full regressions.
- [ ] Build simultaneous genuine browser/Windows/Android fixture using existing isolated runner.
- [ ] Audit security controls with threat-to-control-to-test mapping; remediate verified gaps.
- [x] Apply terminal design system across existing web, Windows and native Android views; physical acceptance remains separate.
- [x] Extend same /join page with three options and secure approval/rotation; isolated API acceptance passed.
- [x] Add checksum-verified registry and real local prerelease downloads; public distribution remains unpublished.
- [ ] Build minimal single-active-coordinator Kubernetes deployment, MySQL PVC, HTTPS ingress,
  resource limits, controlled migration job, probes, secrets, backup/restore and rollback instructions.
- [x] Render manifests locally; server-side schema/live validation still blocked without a cluster.
- [ ] Rebuild actual APK/installer/web, run complete regressions and device acceptance.
- [ ] Review, commit, push; record exact hashes/results and unresolved gates.
- [ ] With separately approved infrastructure, verify independent internet joins and laptop-off service.

Source document preserved in specification/PHASE9_MASTER_PROMPT.txt (704 lines).

Current evidence supersedes historical pending notes below:
PHASE9_LOCAL_ACCEPTANCE.md and PHASE9_DEPLOYMENT_EVIDENCE.md. No global Phase9
seal or public independence claim is established by local build success.
Original attachment SHA256: 7a7d5bff2b1f6836fdc1f59b8dd53240f7d9df42fcd71c498c63c789993dca25.

## Additional integration increment

`npm run verify:mixed` is an actual packaged Windows Electron/private native
worker plus Chromium/Edge Web Worker scenario on the same isolated coordinator,
MySQL and network. It verifies distinct identities, real persisted results,
simultaneous registration, an assigned browser task interrupted/reassigned to
Windows, preserved attempt history, and fresh platform-specific post-restart
results using existing administrator scheduling policy. It explicitly reports
androidIncluded=false and publicInternet=false; never count it as three-platform
acceptance. The safe-target test failed before implementation and passes now.

Initial live fixture 10dcf6077ee3666e passed. Review correctly strengthened the
restart assertions: stale AVAILABLE labels are not reconnect evidence. Rerun
4941314ebdccf3f6 then failed a harness expectation because native resume moved
directly to BUSY with recovered work. That transient expectation was corrected;
actual result/ownership/history assertions remain mandatory. The final rerun
result: 217c46fafff87fe4 passed with fresh individually attributed post-restart
results and exact original identities. Independent targeted review found no
remaining Critical/Important findings for this increment.

Individual current-session passes: browser e7ad5129f4e7223b; Windows packaged
native 247e167611a5e63e; Android physical 4c051425541b8c41. These separate fixtures
do not satisfy simultaneous three-platform acceptance.

Full review-driven regression initially failed three HTTP tests using now-invalid
reserved .example production origins. Updated the fixture names only, retaining
authorization/readiness assertions. Fresh complete verification then passed 328
tests, 17 script checks and all nine workspace typechecks/builds. Reviewer found
and verified corrections for obsolete IPv6/reserved-DNS bypasses. Final mixed
restart/cleanup changes passed the actual rerun and independent recheck.

## Verified first increment

Production HTTPS localhost/private/development endpoints now fail closed in
PUBLIC_BASE_URL, COORDINATOR_PUBLIC_URL and allowed origins. Regression failed
against the baseline, then passed (5 runtime-policy tests). This is lexical URL
validation, not DNS-rebinding prevention or proof of a publicly routed service.
Fresh full verification passed 328 tests, 16 script tests and all nine workspace
typechecks/builds. Isolated migration, concurrency, protocol and all-language
artifact suite passed in a8047397ef4768ac. No user records/volumes changed.

Kubernetes preparation templates now render with kubectl kustomize. Rendering is
not server-side schema or deployment validation. Container recipes/images,
Kubernetes-safe execution adapter, controlled migration Job and real cluster
acceptance remain open; README lists these gates explicitly. Provider/account/
domain/publication remain unapproved per the user's subsequent explicit answer.

## Hosted architecture constraint

The existing coordinator owns connected worker sockets in process memory. Start
with one active replica and Recreate upgrades; do not claim multi-replica HA.
MySQL must retain persistent storage. Compiler execution currently relies on a
local Docker execution controller; a Kubernetes pod must not receive a host Docker
socket to conceal that dependency. A least-privilege remote/container job adapter
was required before claiming deployed execution. The current increment implements
and locally tests the Kubernetes Job adapter (see PHASE9_DEPLOYMENT_EVIDENCE.md);
actual cluster containment/execution remains unverified. Merely disabling
execution is not completion of this requirement.

## Remaining external inputs

Authorized cluster context/account, DNS domain, certificate/ingress choice,
storage class and backup destination, protected secrets, distribution hosting,
signing identity if a signed release is required, explicit publishing approval,
connected Android device and a separate-internet acceptance device. Never place
credentials in this file or Git.
