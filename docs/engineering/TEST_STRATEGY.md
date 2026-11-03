# Verification strategy

1. Preserve pre-change commands/results in PROJECT_STATUS and dated evidence. Use real compiler fixtures with bounded process output/time; do not execute arbitrary submitted programs on the host.
2. Unit tests: schemas, transitions, identity, invitation atomicity, scheduler eligibility, result correctness, semantics and cancellation.
3. Isolated MySQL/API integration: dedicated database/credentials/coordinator ports, target guard before writes, transaction races, login/reset/RBAC, joins/revocation, cross-network scheduling, reconnect/timeouts, restart and DB fault recovery, pagination boundaries, artifact existence/digest/download ownership.
4. Browser E2E: root startup, auth, password eye controls, signup/reset redirect, admin/network/task details and visible refresh, worker lifecycle, compilation stages/history/downloads, responsive/mobile and accessibility. Logical clients must be labelled, not physical hardware evidence.
5. Differential compiler tests: original versus processed supported programs under contained execution, invalid programs, unsupported language features/toolchains, resource limits and malicious inputs. Hashes prove transport integrity only.
6. Windows/Android: unit/native instrumentation, real installer upgrade/uninstall/signature verification, APK/AAB verification, physical hardware and heterogeneous demonstration. Missing devices/keys block release, not independent development.
7. CI/release: clean lockfile install, supported runtime matrix, tests/build/audits/SBOM/container scans, actual backup restore, migration rollback, compatibility, signatures and approved TLS deployment.

Each ledger status requires evidence. No default integration script may write to `omnicompile`. Do not weaken assertions or enlarge limits to disguise defects; diagnose resource contention separately from behavior.
