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
