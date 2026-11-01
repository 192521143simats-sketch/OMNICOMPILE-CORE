# Authoritative conflict resolutions

2026-11-01: OmniCompile Core is the new presentation/research identity; preserve
existing installed application IDs, credential stores, database/package/protocol
names and distribution filenames for compatibility. No second platform or schema
reset is introduced. Migration0011 appends verification, execution telemetry and
availability history. Metric SQL joins both direct compilation tasks and C batch
tasks to the authenticated USER owner. ADMIN is explicitly forbidden from this
endpoint. Task totals count tasks once, not attempts; verification totals count
each check separately. Native artifact-format acceptance and independent source
recompilation are separately named checks. Coordinator receipt time is captured
before the worker message queue, never inferred from worker execution claims.
Sampling runs outside the recovery loop and on lifecycle transitions. Future
source-clock telemetry is excluded; stale source observations cannot become fresh
just because they were recently received. No new compiler/toolchain capability is
claimed by adding product branding or metrics.

2026-10-16 Phase9: reuse the existing network/enrollment/node and protocol-v1
systems. Add a separate approval attribute through append-only migration0010;
preserve old enrollments. Credential replacement retains the same identity and
requires protected save before explicit resume. Build a separate Android
acceptance application ID/storage only for safe testing; it uses the same source
and protocol and never resets the installed normal app's enrollment.

Hosted architecture starts with one active coordinator (in-process socket owner),
persistent MySQL, controlled migration Job/check-only startup and a separate
ephemeral execution namespace. A real sandbox RuntimeClass, admission enforcement,
CNI denial and PID controls are external runtime prerequisites, not proven by YAML.

M2 in the preserved master is authoritative; this table indexes all 18 resolutions, not replacement wording.

| Resolution | Applied decision |
|---|---|
| R01 | GRID-X visible product; academic C-OptiForge technical identity retained. |
| R02 | Node/internal engineering details restricted to authorized engineering views; user reports abstract private participation. |
| R03 | Superseded by the explicit 2026-10-12 user instruction: reusable default network link, invoked by default, admin revoke/invoke toggle; explicit consent and atomic capacity preserved. See USER_REQUIREMENT_OVERRIDES.md. |
| R04 | Windows desktop/core installer and uninstaller mandatory; portable package intermediate only. |
| R05 | Native Kotlin and Jetpack Compose Android, with verified compatible toolchain. |
| R06 | Genuine C/GCC, Python .py/.pyc, Java source/class and eligible runnable JAR plus javap; honest subsets and failures. |
| R07 | MySQL sole authority; no silent substitute/fallback. |
| R08 | Inspect/protect stale SQLite data; explicit destructive approval before deletion. |
| R09 | Debug APK, production-signed release APK/AAB and Windows signing gates; no fake signatures. |
| R10 | Physical Android and clean Windows evidence mandatory, emulator/logical clients insufficient. |
| R11 | Browser product/full acceptance mandatory; count only actual joined workers. |
| R12 | Configurable Resend/PostHog required, privacy-safe, no core dependency; real email needs approval. |
| R13 | Prepare deployment/releases, obtain concrete final publishing authorization. |
| R14 | B:20 dependency order incorporates every A:86 sprint, bounded resumable iterations. |
| R15 | Union of both sources' release gates. |
| R16 | Generic portable Compute Tasks required alongside compiler. |
| R17 | Actual measurements and labelled estimates/test clients; hashes not semantic correctness. |
| R18 | Document newly conflicting quotations and narrow resolution; ask only material unresolved decisions. |

2026-10-12: Keep existing architecture and volume. Dedicated branch in the actual project (not replacement Codex workspace). Restrict verification concurrency based on observed baseline timeout and low free RAM, without changing production compiler timeouts or assertions. Existing historical completion docs remain historical, not current release acceptance.

2026-10-13: User requests genuine compilation/analysis/optimization/execution.
Extend existing finalization and MySQL artifact bytes, without a second database or
worker protocol. `COMPLETED` remains the existing compilation terminal state;
report/metrics distinguish `SUCCESS` and `PARTIAL_SUCCESS` when execution fails or
is unavailable. Preserve native Windows C output and expose a separately rebuilt
Linux executable for actual Linux execution. No relabelled binary or host execution
fallback. Coordinator rebuilds native output and rederives C IR before publication;
this additional compilation cost is real, not claimed distributed acceleration.
Docker execution uses bounded nonprivileged children with a separate trusted
controller identity. Host compiler containment and broad task verification remain
incomplete; Docker shared-kernel controls are not a universal security guarantee.
