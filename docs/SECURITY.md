# OmniCompile Core security model

- Passwords use Argon2id; session, reset, join, and worker credentials are random and stored as hashes.
- Browser sessions and browser-worker enrollment use HttpOnly, SameSite cookies; production enables `Secure`.
- Admin secrets are absent from client source, local storage, request URLs, and WebSocket URLs.
- Server-side RBAC protects every administration, job, and artifact operation. Users can access only their own jobs/artifacts.
- Mutating browser requests enforce the configured application origin; CORS is restricted to that origin.
- Login, signup, reset, and enrollment routes are rate limited. Helmet supplies security headers.
- API failures use stable error codes/messages and do not return SQL, paths, stack traces, or secrets.
- Administrative/security lifecycle events are persisted without credentials or source bodies.
- Worker messages and workloads are schema/size bounded. There is no arbitrary shell task.
- Network, node, task, and attempt identity are checked before assignment or result acceptance.

Compiler processes have 30-second timeouts, diagnostic-output ceilings, unique temporary workspaces, and guaranteed cleanup. Python compilation uses isolated mode without `site` initialization. Submitted programs are compiled, not executed, by production routes.

Native Windows workers remain trusted development/deployment agents rather than kernel-grade hostile-code sandboxes. For untrusted multi-tenant native compilation, deploy workers as non-root disposable containers/VMs with CPU/memory limits, read-only base filesystem, isolated temporary volume, network denial, and process-tree termination. OmniCompile Core does not claim this external isolation is already provided by a native host process.

The public `/join/<token>` value identifies and authorizes enrollment into one network; it is intentionally reusable until the network is disabled, expired, or full. It is not an admin, database, node, or task credential. Each consenting device receives its own revocable enrollment credential via an HttpOnly cookie.
