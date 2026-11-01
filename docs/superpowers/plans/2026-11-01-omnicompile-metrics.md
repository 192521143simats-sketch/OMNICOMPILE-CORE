# OmniCompile Core implementation plan

Goal: retain the existing product while renaming its presentation and implementing five measured, owner-scoped compiler indicators.

Approved scope: users see only their own compilation jobs; administrators do not have job metrics. Existing MySQL, protocol, worker identities, credentials and compiler paths remain compatible. No data reset or public deployment.

Architecture: append-only measurement migration; durable verification receipt ledger, execution telemetry and worker availability samples. Aggregate only tasks joined to the authenticated user's jobs (including C optimization batch tasks). Poll an authenticated, no-store API on the compiler screen. Unknown measurements remain null. Existing reports retain compilation details but do not embed these system indicators.

Review focus: cross-owner access, retries versus task totals, zero denominators, stale/unavailable telemetry, and received time versus verification time.

- [x] Product rename: test visible names, preserve technical identifiers and upgrade paths, rebuild web/native deliverables where possible.
- [x] Persist metrics: migration 0011, coordinator verification/heartbeat hooks, deterministic aggregation tests including nulls, retries, terminal states and stale readings.
- [x] Owner-only API: USER-only route, strict filters, SQL ownership boundary for direct and batch tasks; isolated MySQL tests with two owners and an administrator.
- [x] Compiler screen: five live indicators under compile action, filters, histories, platform comparisons, loading/error states; UI regression tests.
- [x] Verify: full typechecks/tests/builds; isolated live metrics, web/compiler/recovery regressions; record actual blockers and remaining phase gates. Evidence: docs/engineering/OMNICOMPILE_ACCEPTANCE.md.

Compiler hardening remains evidence-driven: this increment does not claim full ISO C custom parsing, arbitrary dependency/project support, universal optimization or browser/Android native desktop toolchains. Existing genuine GCC/CPython/JDK pipelines and their regressions are preserved.
