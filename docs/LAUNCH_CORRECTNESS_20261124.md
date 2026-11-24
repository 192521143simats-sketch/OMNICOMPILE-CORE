# Launch and result integrity — 24 November 2026

This is a scoped source/validation record, not completion of all requested compiler
partitioning or release gates. No database reset was run.

Implemented source changes:
- Public API readiness retries for up to 120 seconds after route publication;
  failed public connectivity leaves local services intact and reports the boundary.
- Fresh startup without managed metadata creates no network or workers. A revoked
  optional managed pool does not prevent the main application from starting.
- Fresh verification expects administrator=1, networks/workers/enrollments=0, next
  system letter A. The guarded factory-reset script itself was not executed.
- Network allocation serializes through its existing sequence lock, chooses the
  first free active letter, retains disabled network history, and continues node
  numbering to avoid collisions. Migration 0026 changes uniqueness to active codes.
- Administrator-entered names are primary. Network selection ranks measured
  eligible-worker score before local/cloud preference. One worker is permitted.
- Job/task display names include network and assigned node identities. Immutable
  IDs, foreign keys and authorization paths stay unchanged; pending labels change
  when assignment is known. Optimization evidence uses the same job display name.
- User metrics require a selected job, report the final job outcome, distinguish
  full job turnaround from program runtime, and retain known task timing even if
  the later program run fails. Availability counts active registrations in that
  network; live eligibility still uses real capabilities/resources and consent.
- Completed jobs retain recorded task telemetry, while active live values expire.
  Unknown CPU/RAM measurements remain unavailable rather than zero.
- Metric tables override the more specific workspace minimum width. Evidence
  labels wrap on words, have interior padding, and no history panels are exposed.
- Admin inspections use a centered native dialog with Close, Escape and backdrop
  dismissal. Refresh generation guards discard older responses after newer ones.
- Successful jobs publish exactly final source plus PDF. Failed compilation
  publishes PDF only. Structured diagnostic data is in the owner-authorized job
  record, with legacy JSON-reading compatibility retained in the frontend.
- PDFs include verified compiler evidence, program execution, source/corrected
  output, warnings/errors and cumulative measured job snapshots. Exact source,
  PDF and total download bytes come from persisted artifact metadata. Compiled
  binary/bytecode size is labelled separately and is not a download total.
- Maintained easy/tough C examples now return zero for their intended correct
  result, instead of deliberately returning a nonzero success predicate.

Validation evidence:
- Web run 419752a830529e15 passed actual C/Python/Java uploads, PDF and source
  downloads, located failures, dialogs, refresh and responsive pages. Execution
  was disabled in that web run; it is not program-run evidence.
- Metrics run 78fb060d3b4b00c9 passed owner boundaries, genuine IR computation,
  timing, runtime-failure classification, active-network worker counts and
  network-letter reuse. Later validation is appended below.
- Full initial suite: 601 passed, 12 opt-in skips, two failures from changed
  Java source ordering and startup probe budget. Both were corrected; focused
  rerun passed 50 tests. Subsequent metric regression run passed 23 tests.
- Workspace type checks and builds passed. Operations suite passed 70 tests;
  expanded startup tests additionally passed both configured and empty cases.
- The execution integration initially had no private broker configured. The runner
  now owns a random-port broker with a generated fixture credential and scoped
  sandbox labels, and tears it down without using developer database/credentials.

Outstanding requirements:
- Arbitrary Python/Java dependency-aware compilation splitting is NOT implemented.
  They still use whole-file native compilation. Supported C IR splits functions
  and verifies/aggregates transformations, retaining source semantics. Do not
  claim universal distributed compilation from a green single-worker job.
- Earlier automatic review rejected changes to the ngrok agent-start/reconnection
  block. Its original 20-second startup wait remains; the separate public-route
  propagation retry is implemented. No universal internet availability guarantee.
- Signed native releases, physical Android verification and OCI capacity are
  unchanged release gates. Laptop-hosted services still require laptop/internet.


Latest verified follow-up (24 November):
- User clarified that one eligible worker is allowed, without a "not distributed"
  label. Source downloads are final .c/.py/.java plus PDF. Placement and artifact
  regression tests passed (35 tests); metrics/report/UI regressions passed (37).
- Latest web integration dce8a6381b35e4f8 and execution integration
  22ff43676137b540 exited zero. Full execution/sample run 25ba7677531f01f5
  passed real C, Python and Java execution and intentional failure cases.
- Web/coordinator type checks and builds passed after correcting two follow-up
  TypeScript errors (unreachable optional access and duplicate execution property).
- Public transport is currently blocked by ngrok ERR_NGROK_727 (monthly request
  quota), confirmed through an actual HTTP 403 response. A manual operator
  Cloudflare tunnel URL is pending. Configuration accepts a validated operator URL;
  no automatic replacement tunnel helper was installed. Automatic approval review
  rejected helper creation and its mock process test as blocked by policy.
- No factory reset ran and no developer database or artifact volume was removed.


## Compiled downloads and cloud boundary follow-up

The latest explicit answer supersedes source downloads: compiled output plus PDF.
C publishes executable artifacts, Python CPython bytecode, Java the complete JAR.
Original/generated source remains in the report, not a separate download. Actual
persisted compiled/PDF byte lengths define the download total.

Cloud is not a worker. Tool services no longer start worker sessions, startup no
longer provisions managed node credentials, and compose no longer mounts those
credentials. Scheduler rejects historical CLOUD nodes; approval only accepts LOCAL.
Legacy identifiers/container image names are retained to preserve deployment and
image references; their services are authenticated tools, not node identities.
Metric platform rows are Web, Windows and Android; infrastructure cannot inflate
worker counts or telemetry. Historical records are preserved, not deleted.

The new samples/case-studies manifest has 19 original industry-inspired programs,
including exact outputs, compile failures, runtime failures and a five-function C
IR manufacturing case. All 19 passed isolated actual compiler/execution smoke
checks. Initial C execution checks failed because the test tmpfs omitted exec;
the harness was corrected and all passed. No production database was used.

Remaining architectural work is explicit: browser/Android native tool delivery and
arbitrary dependency-aware Python/Java partitioning are not implemented. A cloud
compiler HTTP request is remote execution and must not be labeled device-local
compilation. Do not claim these gates satisfied by tool-only service startup or
by passing native fixture tests. Public ngrok quota remains unresolved.


Latest scoped acceptance evidence:
- 7d6e2c61c9675cbf: compiled-output/PDF-only application integration passed,
  including intentional runtime failures and timeout with honest final metrics.
- bc5c7a35ecf5ab10: real browser UI compilation/download, compact metric tables,
  dialog and refresh checks passed after compiled-output policy change.
- 19f5a2f2c80dd049: five manufacturing C IR function units actually computed over
  two authenticated logical protocol workers in one network, verified aggregation
  and compiled artifact. Not physical-device evidence.
- 828c73e2823a581d: all successful/runtime-failure case-study submissions passed,
  then compiler-error regression exposed a race losing structured positions.
  Terminal task failure now atomically saves compilerDiagnostics on its parent;
  background reports reuse that evidence rather than replacing it with plain text.
- f4bcec397e7f1d6a: all six baseline/case-study compile-error checks passed after
  the race fix, including precise positions and accurate error/warning counts.
- 2808eaf3b747f569: metrics isolation, arithmetic, honest worker platform counts,
  network identity reuse and genuine IR computation passed. The preceding run
  b6df17cd0ba5ea82 correctly failed an obsolete fixture expecting Linux/unknown
  native platforms in worker totals; fixture now requires recognized devices only.
- Focused regressions passed 66 tests, later 54 tests after final metric/placement
  labels. Slow Java compilation-verification passed all 11 tests in isolation.
  A broader concurrent unit run hit its Java test timeout and was interrupted;
  do not report the entire unit suite green from that run.
- Workspace builds/typechecks and both startup-order tests passed. No factory reset
  ran. Pending user question determines server-assisted versus device-local tools.

- b32435466363565e: repeated compiler-error regression passed with the explicit
  atomic compilerDiagnostics assertion enabled for all six failures.

- b2b408ef19a2fb3f: metrics and cloud credential rejection passed. The legacy
  provisioning entrypoint now exits without changing any records. Worker
  authentication rejects CLOUD-designated credentials before registration.
- Actual local startup completed with eight healthy application/tool services,
  no enrollment provisioning, and the separate MYSQL preserved. Latest frontend
  published as dpl_DpRgHXyruPGvVYFxmx6PnFQUSuCW. Public API still depends on
  replacing the quota-exhausted ngrok transport; frontend READY is not API readiness.


## Authorized server-assisted device compilation

The user explicitly approved server compiler tools for Web, Windows and Android
when native tools are absent. Only the assigned device is a worker. New negotiated
serverAssistedCompilation capability does not invent native runtimes/toolchains.
The tool endpoint accepts only taskId/attempt, authenticates an active device,
checks its current network/lease, reads canonical source from the server, and
runs the pinned isolated compiler broker. It checks cancellation/lease expiry and
records the assistance method itself for final job metrics and reports.

Implementation includes all three clients, scheduler and
assignment revalidation, metric availability, endpoint and report wiring. Source
unit tests and typechecks passed. Android testDebugUnitTest passed after correcting
a new test's Kotlin declaration syntax. Initial assisted integration 257651d228fe886e
exposed a nested broker-result wrapper; fixed to forward the actual compiler result.
Subsequent ea3469b7a4ff1f71 passed real C/Python/Java compile+run under Web, Windows
and Android logical identities, counting one device only. ce466630e5e31260 passed
an actual Edge browser requesting all three compiler tools and executing outputs.
These are scoped tests, not physical Android or installed Windows acceptance.

Assisted failure/native lifecycle tests and development package builds passed.
Services were rebuilt and all eight are healthy. General dependency-safe
Python/Java and broad C partitioning is still open and must not be represented
as complete.


Further assistance verification:
- edeb675956ca1d30 passed all nine language/platform combinations plus assisted
  Python compiler-error and runtime-failure cases; failures yielded final success 0%.
- 46591264d2daafcc passed the real native session with local compiler capabilities
  deliberately disabled: C/Python/Java success, warnings, runtime errors, timeout,
  Java library and located compiler failures. Its earlier outer 300-second run
  86152118e52eb776 exhausted the test harness budget after most cases; the expanded
  assisted suite now has a 600-second harness budget, without raising task leases.
- 79e3c0a6110e7309 passed actual Edge C/Python/Java compilation after receipt-based
  handoff: binaries remain server-side, and devices return identity-bound short
  receipts. Wrong device/attempt and lease-withdrawal regressions passed.
- c4ef5696d8248df6 passed worker metrics and excludes archived tool providers from
  active device inventory as well as credentials, scheduling and counts.
- Android testDebugUnitTest and assembleDebug passed, including a WebSocket-to-tool
  HTTP-to-device-result lifecycle test. Windows installer rebuild completed;
  packages remain development builds, with no new signing or physical acceptance.
- Targeted source tests passed (50, then 54 scoped checks); affected workspace
  typechecks/builds passed. No entire-suite acceptance claim is made.

- 56959091a5ea1dee: final receipt-based nine logical platform/language combinations
  and failure cases passed (isolated summary exitCode 0). Local services are healthy.
  Public access is still blocked by exhausted ngrok quota; a replacement operator
  transport URL is pending. No physical-device acceptance is implied.

## Python lexical-unit compilation

Python now plans bounded top-level lexical units using CPython AST parsing without
executing imports, decorators or submitted statements. Nested scopes and same-line
statements stay atomic; future flags and docstrings are preserved. All child tasks
belong to the one parent job/network. Compiled candidates are independently checked,
assembled in original order, and compared against authoritative whole-module
optimization before final bytecode publication. An assembly mismatch retains the
authoritative module and is explicitly reported; it is never silently accepted.

- 59c09b01743f920f and a3bcbbd176a65393: four actual Python compiler tasks across
  two authenticated logical Web worker identities using server tools. Function
  dependencies preserved, output 21; second run verifies PDF task totals 4/4, 100%.
- 28 focused unit tests passed, including source tampering, nested closure binding,
  future annotations, later string expressions, declaration context, migration
  safety and compiler service authentication. Coordinator typecheck/build passed.
- This expands Python beyond whole-file dispatch, but does not establish arbitrary
  C or Java method-level partitioning, physical-device acceptance or public uptime.

## Java method-unit compilation — 25 November follow-up

Javac parses method boundaries without executing submitted classes. Compilation
units keep the complete declaration/type context and selected original method
bodies; other method bodies are compile-only stubs. Constructors, initializers,
fields, signatures, annotations and nested local scopes stay intact. Every
original method is validated before masking. Unit output is independently checked,
selected bodies are assembled, and whole-program validation precedes final JAR
publication. A mismatched assembly uses the authoritative source with an explicit
report field, never an unverified candidate. Unit byte counts are intermediate;
user artifact totals count only the final JAR and PDF.

- a2c4bda36c6678f0 and 74863fbf227b5406: three real Java compilation tasks across
  two authenticated logical Web identities in one network, output 21, final PDF
  task totals 3/3 successful. These are protocol fixtures, not physical devices.
- 23 focused tests passed, including Java plan/aggregation, altered result rejection,
  constructor/nested-scope preservation and invalid original method detection.
  Eight network-placement/assistance tests and coordinator typecheck also passed.
- Python/Java admission now re-ranks using the actual planned unit count before
  atomically binding the network and creating tasks. After tasks exist, network
  changes are rejected. Aggregation transports candidate source, not duplicate
  intermediate binaries, keeping payload size bounded.
- e8320e35e7873b00: new all-platform regression did not run because Docker Engine
  did not respond within 30 seconds. This is not an application-test pass or fail.
- Automatic approval review blocked the proposed startup partial-readiness edit;
  it did not execute. Do not retry an equivalent edit through another mechanism.

Broad C partitioning outside supported IR remains open. Public access remains
blocked by ngrok quota and requires an operator-provided replacement transport.

## Guarded native C function contexts — 25 November

A broader C planner is prepared behind OMNICOMPILE_C_FUNCTION_UNITS=1. Default
production behavior remains unchanged until the Docker integration passes.
GCC validates the original source and every proposed function context; declarations,
headers, pointers and arrays remain intact. Newline counts stay stable. Conditional
preprocessing, body-local macro directives or a context that cannot compile cause
an atomic-source fallback. The final executable is rebuilt from authoritative
original bodies, never from compile-only stubs or untrusted worker binaries.

- Four C planner tests passed on actual local GCC: factory pointer/array/function
  dependencies, braces in literals, altered result rejection, invalid original
  source and a macro defined inside a function that affects later declarations.
- Coordinator/frontend builds passed; 26 focused C/service/placement/assistance
  checks passed. An additional coordinator typecheck passed after the rollout gate.
- Verify-C-Native-Distribution.mjs and isolated mode c-native-distribution are
  prepared, but not run: Docker Engine is unresponsive. The supported Docker Desktop
  restart command also timed out. Manual tray-menu quit/reopen was requested;
  no force termination, factory reset or developer-data deletion was attempted.
- Next: restore Docker, rebuild coordinator/C/Python/Java tool images, run native-C
  distribution and all-platform assisted regressions, then enable the new C path
  only after those pass. Apply/restart local services and recheck public access
  after an operator provides a functioning transport URL.
