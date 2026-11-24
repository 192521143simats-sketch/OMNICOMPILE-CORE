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


## Explicit fresh-application request â€” 23 November 2026

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


## Network UI override â€” 23 November 2026

Configurable network scheduling policies and Network details are removed, including backend enforcement and persisted settings (migration 0025). Do not restore them from older specification clauses. Named links use /join-network-a/<token>; Show / copy link reveals and copies within the network row, never under creation. See docs/NETWORK_JOIN_LINKS.md (repository root relative). This change does not execute the separately blocked factory reset.


## Launch and compilation overrides â€” 24 November 2026

Fresh reset baseline is now one administrator, zero networks/enrollments/workers,
next system letter A. Do not automatically create a managed pool on ordinary
startup with no saved pool metadata. Existing records remain preserved. Network
names entered by administrators are primary; system letters are secondary and
reused after disable while immutable history and unique node identities remain.
Allow one eligible worker without adding a "not distributed" UI label. User
artifact downloads are final .c/.py/.java source and PDF, not binaries or JSON.
Compiler/run outcomes, full job turnaround and program runtime are distinct.
Only the selected compilation belongs in its user-facing metrics.

Dependency-aware distributed partitioning is currently limited to supported C IR;
whole-file native Python/Java compilation must not be described as fully partitioned.
The broader partitioning requirement remains open. See docs/LAUNCH_CORRECTNESS_20261124.md.


## Latest user clarification â€” 24 November 2026

Cloud is a tool/storage/hosting provider, never a worker platform. Worker platforms
are Web, Windows and Android. Do not report remotely executed native tools as local
browser/Android compilation. Device tool delivery and general dependency-safe
partitioning remain implementation work, not a label change. User explicitly chose
compiled output plus PDF in the follow-up answer; this supersedes source downloads.


The user explicitly authorizes all three device platforms to call server compiler
tools when native tools are unavailable. Label this server-assisted compilation,
attribute the leased task to the device, and never register/count the server as a
worker. This supersedes the earlier pending architecture question.

Python now distributes bounded lexical units and validates ordered whole-module
assembly. C IR functions remain supported; broad C and Java partitioning remain
open. See the latest scoped launch correctness evidence.

Java method-unit planning and verified assembly are implemented and passed isolated
two-device-identity integration runs. Keep constructors/initializers/declarations
intact; do not execute submitted code during planning. Broad C splitting outside
IR remains open. The startup partial-readiness edit was blocked by automatic
approval review before execution; do not retry an equivalent edit.

Broader native C function-context planning is prepared behind
OMNICOMPILE_C_FUNCTION_UNITS=1, disabled by default pending Docker integration.
Local GCC tests pass; do not enable or claim distributed acceptance until
c-native-distribution and assisted regressions pass after Docker recovery.

Final scoped device-tool regression 701593b4b2408646 passed all nine language/platform
identity cases plus runtime and pre-dispatch validation failures. Broader C function
contexts are now default-on after 0230019f988cf785 distribution acceptance; explicit
OMNICOMPILE_C_FUNCTION_UNITS=0 rolls back. Preserve atomic fallback where dependency
or preprocessor context requires it. Java atomic jobs avoid redundant full compiler
runs while retaining independent verification. Keep Cloudflare operator transport
manual and pinned; public authenticated WSS and 25 page / 10 API smoke checks passed.
Physical-device and signed-installer gates remain separate from these scoped tests.
