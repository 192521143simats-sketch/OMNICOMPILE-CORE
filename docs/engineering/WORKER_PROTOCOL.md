# OmniCompile Core worker protocol v1

Transport: authenticated `/ws/worker`. Browser enrollment uses a scoped HttpOnly cookie and validated Origin; native clients send `Authorization: Bearer <scoped credential>` over WSS outside local development. No credentials in URLs. `/version` advertises application/protocol version. Every envelope includes integer `protocolVersion: 1`; unsupported/missing versions receive `PROTOCOL_INCOMPATIBLE` then close 1008. Old pages/agents must reload/update, not silently send legacy messages.

Worker → coordinator:

- `register`: capability `profile` (worker/device type, real toolchain availability/version, supported operations, CPU/core/memory descriptions).
- `heartbeat`: bounded `resources`, observation timestamp and measurement availability.
- `task_state`: assigned `taskId`, positive `attempt`, `RUNNING` or `FAILED`, optional bounded error.
- `task_result`: matching `taskId`/`attempt`, result, actual nonnegative execution time and resources.
- `disconnect`: explicit departure from transport. Leave-network API revokes enrollment.

Coordinator → worker:

- `registered`: stable `nodeId`, heartbeat interval 1–60 seconds (currently 5 s).
- `task_assignment`: `taskId`, `attempt`, `taskKind`, schema-validated matching allow-listed payload.
- `error`: stable code and bounded message; policy violation closes 1008, which stops blind credential/protocol reconnect loops.

Kinds/operations: TEST_COMPUTE → SHA-256, prime count, bounded SHA chain; C_OPTIMIZE_IR → C IR function optimization; C_COMPILE → actual native GCC source compilation; PYTHON_COMPILE/ JAVA_COMPILE → corresponding native pipeline only. Shell commands are never an operation. Browser performs portable compute/IR, not native toolchains. Android/Windows implementations must use this contract as it evolves, not fork the coordinator.

The additive v1 full-source C operation is capability-gated: only a node advertising
`runtimes.c=true` AND `operations.nativeCSource=true` receives `C_COMPILE`.
Absent flag means unsupported, including older native v1 clients. Existing IR and
other tasks remain compatible. Native compiler payloads carry optional `sourceName`
(safe basename) and actual `source`; older callers retain compiler defaults.
`task_state` may carry at most 100 located error/warning diagnostics (2000 characters
per message). Compiler diagnostics are terminal for that attempt/job; transport
loss/timeouts retain existing retries. Native result envelopes carry actual output
bytes as base64, generated source, diagnostics and truthful transformation evidence.
The coordinator checks language/operation, file names, bounds, bytecode/executable
headers and nonempty bytes before committing artifacts. WebSocket payload limit is
32 MB to accommodate bounded class/JAR outputs; source HTTP limits are unchanged.
Native final artifacts are now rebuilt independently from stored source on the
coordinator; C/Java generated source must match stored source and Python must match
the authoritative optimizer. C IR results are independently rederived and checked,
and transformation counts are coordinator-derived. Final execution evidence comes
from the owned Docker controller, never a worker-supplied success claim. These
checks do not independently validate every task kind or failed worker diagnostic.

Authority: coordinator validates schema/version, enrollment on registration and each subsequent message, and task/node/attempt/network ownership through persistence. Revocation closes scope. Native and browser clients validate coordinator envelopes. Atomic task completion rejects stale/replayed/expired attempts; asynchronous final publication does not block worker heartbeat handling. Broad result semantic verification, cancel/pause/resource policy and additional portable catalogue remain open requirements; v1 does not falsely claim those implemented.

Compatibility policy: coordinated development upgrade from unversioned legacy to v1; no indefinite legacy admission or duplicate protocol. Future incompatible changes require a new version, explicit negotiation/upgrade path and fixture tests across all worker applications.

## Portable result acceptance (Phase 4 subset)

Protocol v1 envelopes and operation fields are unchanged. For TEST_COMPUTE,
the coordinator independently recomputes sha256, sha256_chain and prime_count
from its stored bounded input. Result fields must match the operation exactly;
worker-supplied verification metadata is rejected. Accepted results retain the
operation fields plus coordinator-generated verification status/method/version,
timestamp and measured verification time. Worker execution time/resources remain
reported observations, not an independent performance proof.

RESULT_VERIFICATION_FAILED means schema/value verification failed. The existing
attempt is failed and requeued up to the existing three-attempt limit; no forged
result is saved. STALE_TASK_RESULT means the node/attempt is no longer authorized
or a concurrent/completed submission is duplicated; it does not fail a newer
attempt. Publication atomically rechecks task, attempt, node and active network.
Portable verification runs outside the ordered socket heartbeat queue.

These checks do not claim cancellation or global recomputation admission control.
See TASK_ENGINE_PHASE.md and its evidence; durable recovery is documented below.

## Durable attempt leases and recovery

Protocol v1 remains unchanged. The coordinator's MySQL `task_attempts` row owns
an immutable `lease_expires_at` UTC deadline, set atomically on assignment from
database time using `TASK_TIMEOUT_MS` (default 30000). Heartbeats establish worker
health; they do not renew task leases. Authorized admin attempt detail exposes
`leaseExpiresAt`. Worker-reported time cannot extend execution authorization.

RUNNING transitions require a live matching lease. Publication locks the current
task/attempt/node/network scope before evaluating fresh database time, rejects
expired/superseded/replayed results, and rolls back result insertion if the lease
expires during publication writes. Independent portable/IR checks remain intact.

This is a **single-active-coordinator** deployment. Startup interrupts outstanding
ASSIGNED/RUNNING attempts before accepting sockets; completed history remains.
Recovery drains transactions of at most 100 attempts. Every second, a serialized
maintenance pass expires persisted leases, quarantines old workers, closes their
connections and dispatches eligible work. MySQL outages fail readiness and defer
recovery until a later successful pass, not erase timers/history. Tasks requeue
until the existing maximum of three attempts; the third failure is terminal.
Attempt status/error/deadline history is retained. Historical NULL deadlines are
not fabricated or renewed: active legacy attempts are interrupted on startup.

An expired worker must re-register using its existing scoped credential and stable
node identity. Native/browser executors postpone reconnect registration while old
local work is still running, so that a stale executor cannot burn retries by
accepting a second assignment. Its stale result is not published. Updated workers
now cancel local execution on socket loss; see the cancellation extension below
for capability negotiation and legacy-client limitations.

Completed, durably stored compiler results whose artifact publication was
interrupted are retried from coordinator state. Transient MySQL connection loss
does not become a false compiler failure. Actual compiler failures still fail the
job. This can repeat bounded program execution after a crash; it is not an
exactly-once execution or multi-active/HA guarantee.

Run `npm run verify:recovery` for isolated lease/restart/database/disconnect
fixtures; no production fault-injection endpoints exist. See TASK_RECOVERY_PHASE.md
and evidence/2026-10-13-task-recovery/RESULTS.md for measured acceptance and limits.

## Cancellation extension (v1, capability negotiated)

An updated native/browser worker advertises `operations.taskCancellation=true`.
Only such workers receive `{protocolVersion:1,type:"task_cancel",taskId,attempt}`.
The worker validates both identity fields before aborting. The coordinator first
commits terminal CANCELLED task/job/active-attempt state and an audit event, then
quarantines the node and closes transport with 1012. Reconnect requires actual
local termination/cleanup, not merely a new heartbeat. Older clients receive
connection closure without an unknown envelope; durable result/publication guards
still apply, but instant local cancellation is not claimed for older executors.

Native task execution uses an owned child process and per-task temporary tree,
with only system/toolchain settings in its environment. Windows uses the explicit
System32 taskkill executable with /T; Unix uses its owned process group. Failure
to establish tree termination or cleanup stops the worker instead of reconnecting
as available. This is process lifecycle control, NOT an OS security sandbox.
Browser workers terminate their dedicated Web Worker and replace it before
reconnecting; physical-browser lifecycle acceptance remains Phase 6 work.

Owner/admin `POST /api/compilations/:jobId/cancel` is idempotent for CANCELLED,
returns 404 for absent/foreign jobs and 409 for completed/failed jobs. Admin-only
`POST /api/admin/tasks/:taskId/cancel` cancels standalone portable tasks, not a
single constituent of a compilation. Completed attempt history is preserved.
Late results, failure messages, restart recovery, task creation and final artifact
publication cannot revive cancelled jobs. The compiler screen stops polling and
allows a new submission. Owned Docker execution is abortable; coordinator native
verification/code generation remains bounded but not yet process-abortable.

Run `npm run verify:cancellation` against an owned isolated MySQL fixture.

## Admission endpoints

Admin creates a network with `POST /api/admin/networks`, which supplies its reusable default `joinUrl`, enabled by default. `GET /api/admin/networks/:networkId/join-link` retrieves it; `POST` to that endpoint with `{enabled:true|false}` invokes/revokes admission without revoking enrolled workers. These endpoints are admin-only and audited without tokens. The default token is stored recoverably so the admin can retrieve the same link; it is a public admission token, never a worker/admin credential. Never log URLs or persist them in analytics. Network expiration/disable overrides admission. This explicitly supersedes master M2 R03 per USER_REQUIREMENT_OVERRIDES.md.

`GET /api/join/:token` inspects without admission. `POST /api/join/:token/accept` requires `consent:true`, `workerType` and `deviceIdentity`. The same invoked default token admits multiple separate enrollments atomically under network capacity. Revoked/expired links return 410; occupied/reserved capacity returns 409. A ten-minute registration deadline prevents pending enrollments from holding slots indefinitely. Migration 0003 supplies a fresh default link to existing hashed-only networks, without rotating private worker credentials or node IDs. Retrieve the new default link after startup.

Legacy explicit single-use invitation endpoints remain compatible, including type/expiry/replay checks, but cannot bypass the network admission toggle. They are not the ordinary admin UI workflow.

Browser admission sets only a scoped HttpOnly cookie. Native and Android admission returns `workerCredential` for secure client storage and subsequent bearer authentication, never a URL parameter. `ANDROID` is a distinct identity limited to portable capabilities; protocol support is not an APK or device-test claim. `POST /api/worker/leave` accepts either mechanism, revokes the enrollment/current node atomically, closes its socket and requeues eligible work. Reconnect cannot evade revocation/capacity or renumber nodes.
