# Phase 6 — browser core v1 acceptance

**Browser core v1 sealed: verified, 7/7 B20 obligations, with physical Android
acceptance passed.** Public-internet deployment acceptance remains open; this
document does not claim a complete production release. Phase 4/5 evidence
remains authoritative, with fresh regressions recorded in the evidence report.

| B20 obligation | Implementation and evidence |
| --- | --- |
| Enrollment | Existing explicit consent/HttpOnly cookie; authenticated scope restores same-network enrollment after refresh |
| Protocol compatibility | Existing version 1 schemas; invalid protocol stops contribution, native payload rejected, no URL credentials |
| Bounded execution | Schema-bounded pure workloads, one per-attempt Web Worker, catalogue wall deadlines, yielded checkpoints; OS memory/CPU readings unavailable |
| Lifecycle/cancellation | Pause/resume, visibility/freeze/resume, offline, cancellation, matching-attempt fences and teardown; tab pause preference survives remount |
| Progress/results | Actual work-unit progress, RUNNING protocol state, real results recorded and independently checked by coordinator; C IR constant folding verified |
| Closure/reconnect | Stable node ID on reload/reopen, bounded reconnect/registration wait, takeover suppression, real renderer suspension/heartbeat fallback and coordinator restart |
| Eligibility/limits | All five portable operations and C IR exercised; browser-only network rejects native compilation, network isolation and administrator revocation verified |

Actual desktop Edge and Android-emulated Chromium over loopback HTTPS/WSS
passed the expanded suite. Tests use real Web Workers, cookies, WebSockets,
coordinator and isolated MySQL; no injected successful worker results. Independent
review found a coordinator cleanup/registration race and incorrect cancellation
close-code handling; both received failing tests and fixes. Registration and
cleanup serialize only for the same enrollment; other workers remain independent.
The task engine, durable lease model, MySQL architecture and compiler pipelines
were not replaced. This narrow coordinator fix was necessary to prevent a live
reconnected browser from being overwritten as OFFLINE by its old connection.

## Acceptance boundaries

- Physical M2004J19C (Android 10, Chrome 155) passed fixture 836139ed765adc44,
  exit 0. Because MIUI blocks automated input, the user performed native Chrome
  consent/pause/reload/resume/HOME/leave taps. The verifier independently checked
  five real computation results in MySQL, identity, cancellation and revocation.
  USB loopback is not a public-internet test; no APK build is inferred.
- HTTPS/WSS was genuinely exercised through a local test certificate, accepted
  only by the isolated test browser. The supplied Caddy configuration validated,
  but no DNS/public host/trusted certificate/public deployment was authorized or
  tested. A reachable approved host is required for other Wi-Fi/cellular users.
- Headless CDP Page.freeze did not reliably suspend this browser's heartbeats.
  That failed probe is recorded, not called a pass. Actual Debugger renderer pause
  tested heartbeat expiry/reconnect; component tests exercise freeze/resume events.
  Physical HOME background/foreground passed. Lock/discard across every mobile
  OS/browser version was not tested and is not inferred.
- Browser memory figures are unavailable and workload figures are estimates;
  schema bounds and worker termination are not an OS-level RAM/CPU sandbox quota.
- No universal browser/platform guarantee or guarantee of defect-free future use.

Run `npm run verify:browser`, or PowerShell
`$env:OMNICOMPILE_TEST_TLS='1'; npm run verify:browser` with Docker, Microsoft Edge and
Git OpenSSL available. Normal startup remains `START-OMNICOMPILE.bat`.
Deployment/lifecycle details: BROWSER_WORKER.md. Exact commands, failures and
fixture identities: evidence/2026-10-14-phase6-browser/RESULTS.md.

Next external acceptance action: choose and approve a reachable HTTPS host for
real cross-network testing. Next implementation phase is Phase 7,
the installable Windows worker; Phase 8 remains the actual native Android APK.
