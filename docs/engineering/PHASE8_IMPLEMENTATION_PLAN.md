# Phase 8 — native Android implementation

Authorization: 2026-10-15 explicit user instruction permits technical self-review and direct execution without another confirmation.

## Design and review

Native Kotlin/Compose application in apps/android-worker. Existing coordinator,
MySQL schema and protocol v1 remain authoritative. HTTPS enrollment and bearer
WebSocket authentication; Android Keystore AES-GCM protects scoped identity.
Release rejects cleartext; debug permits explicit local development connections.
No shell/script execution, downloaded code, WebView, desktop toolchain claims or
new database. minSdk 26, compile/target 36, AGP 8.13.2, Gradle 8.13,
Kotlin/Compose plugin 2.2.21, JDK 21 (JVM target 17).

Portable task allowlist: sha256, prime_count, sha256_chain, matrix_multiply,
portable_benchmark. Match shared catalogue bounds and independent reference
results. C IR optimization must not be advertised until compatible implementation
and differential verification pass. Compiler regressions retain real host pipelines.

Dedicated single executor, cooperative cancellation/deadline checks, bounded input
and allocations; do not claim a hard OS heap/CPU sandbox. User-initiated foreground
service with visible notification; no boot auto-contribution. Battery/network/
thermal policy gates connection and work. Process death cancels local attempts;
coordinator durable leases recover work. Reopening requires explicit resume.
WorkManager may notify recovery availability, not bypass foreground-start policy.

Review: preserves API/schema; protocol capability negotiation prevents incompatible
assignments; tokens never in URLs/logs; redirect rejection avoids credential leaks;
leave retains credentials until revocation acknowledgement. Signing credentials
are external configuration, never generated as a false production identity.

## Ordered execution checklist

- [x] Inspect repository, device, installed SDK/JDK, disk and integration contracts.
- [x] Configure pinned wrapper/build and native app; prove deterministic computation
  with failing-then-passing Kotlin tests (known digest/count/matrix/LCG literals,
  malformed/oversize/unsupported/cancelled/deadline inputs).
- [x] Implement Keystore identity, enrollment, native UI, versioned session,
  heartbeat, scoped statistics, resource policy and cancellation/reconnect fencing.
- [x] Add physical-device instrumentation and isolated coordinator/MySQL verifier;
  validate consent, task results, pause/resume, disconnect/reconnect, revocation,
  leave and lifecycle recovery. Never mutate developer records.
- [x] Build debug APK and release APK/AAB, inspect signing; install/test actual phone.
- [x] Run existing tests/typechecks/builds/compiler regressions, review changes,
  record evidence, commit verified stages. Seal only gates actually passed.

Baseline physical checkpoint: PHASE8_VERIFICATION.md, implementation 5a831c3.
Follow-up: automatic device light/dark palette, OEM force-dark protection, contrast
and actual rendered theme tests. Rebuilt APK must be installed and tested before
claiming the theme correction is physically accepted. This follow-up passed:
25 JVM tests, 5 physical tests, build/lint and isolated acceptance 6f90f70b244a9fa2.
Production signing remains
a separate unfulfilled release gate, not part of a functional debug APK claim.

## Risk-focused tests

Malformed/foreign assignments reject before allocation; stale callbacks cannot
submit after disconnect; offline leave must not erase revocable identity; thermal
or low-battery transitions cancel contribution; unsigned release and debug device
tests cannot substitute for distribution signing or newer-API acceptance.

## Pre-flight evidence

Clean engineering/omnicompile-release-foundation; Xiaomi M2004J19C API29 authorized.
JDK21.0.12.1; SDK platform37, build tools36/37 and platform-tools37.0.1 installed.
SDK36 required by pinned AGP is being installed. No existing Gradle wrapper.
Docker initially stopped; Desktop launched. C free25GB, D free14GB (approximate).
No production signing identity has been inspected or assumed.
