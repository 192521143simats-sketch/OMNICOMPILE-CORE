# Initial threat model — open remediation backlog

Assets: account/password hashes and cookies, enrollment/node credentials, source/IP, MySQL/backup contents, coordinator availability, worker host/device, artifacts and release signatures.

Trust boundaries: untrusted web requests ↔ coordinator; untrusted participant ↔ scoped WebSocket; worker output ↔ coordinator verifier; submitted source ↔ native toolchain/execution sandbox; DB ↔ migrations/restore; release build ↔ signing/publishing.

Threats requiring tests/remediation: cross-origin cookie actions/WebSocket hijacking, spoofed proxy IP/rate-limit bypass, reusable enrollment/racing capacity, revoked or mismatched capabilities, stale/duplicate attempts, fabricated semantically incorrect results, malicious source/process/resource escape, artifact tampering/cross-owner download, sensitive logs/analytics, unsafe reset/restore, unsigned/tampered updates.

Current protections to preserve: Argon2id, hashed session/reset/enrollment tokens, HttpOnly cookies, role and job-owner checks, network-qualified assignment/results, schema/payload bounds, temporary compiler directories/time/output bounds. These do not constitute full native sandboxing or independent correctness validation.

Mitigation gates: explicit production origins/trusted proxies, validated WS/session scope; atomic invitations; versioned bounded protocol; independent task verification and durable leases; native container/OS containment; artifact digests; minimal logs and provider consent; protected migrations/backups/actual restore; verified signing/update chain. Record residual risk, never claim native workers are fully sandboxed today.

## Native downloads and toolchain selection

An invitation authorizes an attempt to enroll on one network. Native download
authorization adds a short-lived check tied to the invitation and selected
platform. Browser platform information remains spoofable. Use it as a
compatibility signal and require native registration, explicit consent and
administrator approval wherever the network policy requires it.

Installer hashes detect mismatched bytes. Hosted release packages still
require verified Authenticode or Android signatures and trusted distribution.
An installer URL at an external public origin has that origin's access policy.

The private execution broker selects an administrator-configured language image
for each workload. Hosted execution requires a complete digest-pinned image set
that passes scanning and toolchain acceptance. Docker access stays with the
dedicated broker host. Review the stronger isolation boundary and job cleanup
under node failure before accepting hostile workloads on shared infrastructure.
