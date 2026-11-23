# OmniCompile Core engineering rules

The existing MySQL-backed workspace is authoritative. Read `docs/EXPECTED_CROSSCHECK.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/ARCHITECTURE.md`, and `OMNICOMPILE_MASTER_BUILD_SPEC.md` before continuing implementation. Explicit later user overrides take precedence over conflicting master clauses.

- Implement the cumulative A/B specification using M2 conflict resolutions and B:20 phase order. Do not replace working compiler, auth, worker or persistence systems.
- Preserve `.env`, databases, backups and Docker volumes. No destructive cleanup, production publishing, real email or paid account changes without explicit approval.
- Work on the dedicated engineering branch, never force-push. Never commit secrets, runtime data, signing keys, binaries or dependencies.
- Use failing behavioral tests before implementation; run type checks, tests and builds after meaningful changes. Record failures as well as passes.
- Integration tests must use a proven isolated MySQL database and isolated coordinator ports, never the developer database by default.
- Distinguish measured execution, estimates, mocks and unverified claims. Browser/Android workers cannot claim native GCC/CPython/JDK execution.
- Update the granular requirement ledger and evidence after each milestone. Historical `docs/MILESTONES.md` is not acceptance evidence for the new master specification.
- Release requires actual signed Windows/Android packages, clean Windows installation and physical Android/heterogeneous evidence. Missing hardware/credentials are blocked gates, not successes.
- Persist exact next actionable work at session boundaries; never label the platform complete while required gates remain open.

## Current data baseline

The user-authorized fresh launch on 22 November 2026 permanently replaced old
OmniCompile database/artifact volumes and removed historical acceptance resources.
See `docs/FRESH_LAUNCH.md`. Preserve the new application data going forward; do not
restore old test records or repeat the reset during routine startup. The separate
`MYSQL` container and `mysql` volume were explicitly preserved by the user.


## Explicit fresh-application request — 23 November 2026

When the user explicitly requests a fresh application/factory relaunch, the requested
baseline includes resetting network allocation: compiler pool Network A, workers
NODE-A001 through NODE-A003, next new network B; one administrator and zero ordinary
users/jobs/results/artifacts/sessions. Preserve the separate MYSQL/mysql resources.
This is separate from ordinary startup, which must never erase data.

The latest requested factory operation has NOT run: automatic approval review
rejected the database/artifact volume deletion and generated cleanup as blocked by
policy before execution. Do not retry equivalent deletion through other tools.
The reviewable scripts/Reset-Fresh-Application.ps1 -FactoryReset is prepared for the
user to run locally. Only report success after Verify-Fresh-Launch.mjs passes;
current historical launch reports do not establish this new reset.


## Network UI override — 23 November 2026

Configurable network scheduling policies and Network details are removed, including backend enforcement and persisted settings (migration 0025). Do not restore them from older specification clauses. Named links use /join-network-a/<token>; Show / copy link reveals and copies within the network row, never under creation. See docs/NETWORK_JOIN_LINKS.md (repository root relative). This change does not execute the separately blocked factory reset.
