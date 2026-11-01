# OmniCompile Core

**OmniCompile Core: A Zero-Trust, Fault-Tolerant Distributed Compiler Pipeline for Heterogeneous Edge-to-Cloud Orchestration.**

OmniCompile Core is the current product and research title. GRID-X and C-OptiForge are historical names. Existing package scopes, database identities, protocol identifiers, installed-app IDs, credential-storage keys and script/artifact filenames remain stable for compatibility; these engineering identifiers are not alternate product names.

OmniCompile Core provides authenticated administrator and user roles, reusable isolated distributed networks, consent-based browser and native workers, capability-aware scheduling, failure/retry history, and real C, Python, and Java artifact pipelines backed by one Docker-managed MySQL database.

## Start

Requirements: Node.js 22+, npm 10+, Docker Desktop, GCC, CPython 3, and JDK 21 for native Java workers. The browser-worker path requires only a modern browser and cannot provide native compiler toolchains.

```bat
START-C-OPTIFORGE.bat
```

Open `http://localhost:5173`. On the first start, the ignored `.env` receives a random `ADMIN_PASSWORD`; sign in with `ADMIN_USERNAME` and that password. Production deployments should replace the plaintext development fallback with an Argon2id `ADMIN_PASSWORD_HASH` and remove `ADMIN_PASSWORD`.

For a phone or another computer on the same Wi-Fi/LAN, use the `Mobile/LAN` URL printed by `START-C-OPTIFORGE.bat` (for example, `http://192.168.0.5:5173`). Never replace its host with `localhost`: on a phone, `localhost` means the phone itself. The startup process uses the active LAN address when it generates worker invitation links.

Users select only the language and supply a source filename plus pasted or uploaded source. OmniCompile Core chooses an active compatible network using the same resource-aware score and measured execution history used for worker scheduling. Network choice and compilation history are administrative concerns and are shown in the Admin dashboard. New worker identities are network-scoped (`NODE-A001`, `NODE-A002`, `NODE-B001`, and so on).

```bat
STOP-C-OPTIFORGE.bat
```

Shutdown preserves the `c-optiforge_mysql_data` named volume. Never use `docker compose down -v` during normal operation.

## Workflows

Administrator: sign in → create a distributed network → copy its default reusable link → share the same link with multiple devices → inspect/revoke workers → monitor paginated tasks/jobs/audit events. Admission is invoked by default. Use **Revoke link / Invoke link** to close/reopen admission without disconnecting existing workers; **Show / copy link** retrieves the same URL after refresh or restart.

Worker: open `/join/<network-token>` → inspect network and browser permissions → click **Become a Worker** → remain on the worker console. Multiple devices can use the same invoked link, each receiving its own enrollment and stable node ID. Revoked/expired links show an unavailable page and cannot enroll. No command prompt is needed for browser workers. Pending enrollment reserves capacity for ten minutes; leaving revokes only that worker's credential. Existing networks receive a fresh default link once during migration 0003; retrieve it from Admin rather than reusing an old information URL.

User: sign up/sign in → submit C, Python, or Java source → follow persisted progress → download the owned artifact. The coordinator selects a compatible network. C IR optimization can use browser workers. Python bytecode and Java compilation require compatible native workers.

## Verification

```powershell
npm run verify
npm run verify:integration # owned isolated Docker/MySQL fixtures; developer data untouched
npm audit
```

See [production architecture](./docs/PRODUCTION_PLATFORM.md), [security](./docs/SECURITY.md), [operations](./docs/OPERATIONS.md), and the authoritative [master build specification](./C-OptiForge_MASTER_BUILD_SPEC.md).
