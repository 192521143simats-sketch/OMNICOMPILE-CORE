# OmniCompile Core engineering rules

The existing MySQL-backed workspace is authoritative. Read `docs/engineering/PROJECT_STATUS.md`, `IMPLEMENTATION_PLAN.md`, `DECISIONS.md`, `USER_REQUIREMENT_OVERRIDES.md`, and the preserved master specification before continuing implementation. Explicit later user overrides take precedence over conflicting master clauses.

- Implement the cumulative A/B specification using M2 conflict resolutions and B:20 phase order. Do not replace working compiler, auth, worker or persistence systems.
- Preserve `.env`, databases, backups and Docker volumes. No destructive cleanup, production publishing, real email or paid account changes without explicit approval.
- Work on the dedicated engineering branch, never force-push. Never commit secrets, runtime data, signing keys, binaries or dependencies.
- Use failing behavioral tests before implementation; run type checks, tests and builds after meaningful changes. Record failures as well as passes.
- Integration tests must use a proven isolated MySQL database and isolated coordinator ports, never the developer database by default.
- Distinguish measured execution, estimates, mocks and unverified claims. Browser/Android workers cannot claim native GCC/CPython/JDK execution.
- Update the granular requirement ledger and evidence after each milestone. Historical `docs/MILESTONES.md` is not acceptance evidence for the new master specification.
- Release requires actual signed Windows/Android packages, clean Windows installation and physical Android/heterogeneous evidence. Missing hardware/credentials are blocked gates, not successes.
- Persist exact next actionable work at session boundaries; never label the platform complete while required gates remain open.
