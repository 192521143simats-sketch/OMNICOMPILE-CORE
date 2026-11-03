# OmniCompile Core

**OmniCompile Core: A Zero-Trust, Fault-Tolerant Distributed Compiler Pipeline for Heterogeneous Edge-to-Cloud Orchestration.**

All maintained application, package and worker identifiers now use OmniCompile. Protocol v2 and new Windows/Android app identities require rebuilt workers and fresh enrollment. Historical acceptance records predate this identity reset; current results must be read from the latest engineering acceptance report.

OmniCompile Core provides authenticated administrator and user roles, reusable isolated distributed networks, consent-based browser and native workers, capability-aware scheduling, failure/retry history, and real C, Python, and Java artifact pipelines backed by one Docker-managed MySQL database.

## Start

Requirements: Node.js 22+, npm 10+, Docker Desktop, GCC, CPython 3, and JDK 21 for native Java workers. The browser-worker path requires only a modern browser and cannot provide native compiler toolchains.

```bat
START-OMNICOMPILE.bat
```

Open `http://localhost:5173`. On the first start, the ignored `.env` receives a random `ADMIN_PASSWORD`; sign in with `ADMIN_USERNAME` and that password. Production deployments should replace the plaintext development fallback with an Argon2id `ADMIN_PASSWORD_HASH` and remove `ADMIN_PASSWORD`.

For a phone or another computer on the same Wi-Fi/LAN, use the `Mobile/LAN` URL printed by `START-OMNICOMPILE.bat` (for example, `http://192.168.0.5:5173`). Never replace its host with `localhost`: on a phone, `localhost` means the phone itself. The startup process uses the active LAN address when it generates worker invitation links.

Users select only the language and supply a source filename plus pasted or uploaded source. OmniCompile Core chooses an active compatible network using the same resource-aware score and measured execution history used for worker scheduling. Network choice and compilation history are administrative concerns and are shown in the Admin dashboard. New worker identities are network-scoped (`NODE-A001`, `NODE-A002`, `NODE-B001`, and so on).

```bat
STOP-OMNICOMPILE.bat
```

Shutdown preserves the project `OMNICOMPILE-DATA` volume and leaves general MYSQL running. Never use `docker compose down -v` during normal operation.

### Docker layout

`START-OMNICOMPILE.bat` starts Docker if needed, reuses/starts the independent
`MYSQL` database, builds the genuine service images, and waits for the complete
application. No Windows/Android application is replaced by a Docker container.

| Docker entry | Container(s) | Published endpoint | Persistent storage |
|---|---|---|---|
| General database | `MYSQL` | `127.0.0.1:3306` | `mysql-data` |
| `omnicompile` Compose group | `OMNICOMPILE-BACKEND` | `4100` | MySQL-backed state |
| Same group | `OMNICOMPILE-FRONTEND` | `5173` | Built static application |
| Same group | `OMNICOMPILE-DATA` | `127.0.0.1:3307` | `OMNICOMPILE-DATA` |

The project database is `omnicompile`. Both local databases use root and the same
password configured only in ignored `.env`. General MYSQL does not initialize the
project database. The backend uses internal `database:3306`, not host3307. There
are exactly three steady-state application containers plus general MYSQL.
Docker requires lowercase project/image names; container/volume names retain
uppercase. MySQL tags share actual upstream8.4 bytes, not a second database engine.

```powershell
docker compose config --quiet
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/Start-Containers.ps1 -ProjectRoot .
node scripts/Verify-Compose.mjs
```

Images are `be-omnicompile-coordinator:local`, `fe-omnicompile-frontend:local`, and
`db-omnicompile-database:8.4` (actual shared MySQL8.4). Optional genuine sandbox
image `oa-omnicompile-execution:local` supports the existing isolated execution
workflow. Browser workers run in browsers; Windows workers are native apps and
Android workers are native APKs. No decorative worker images are created.

The three-service local profile compiles/distributes real jobs but explicitly
does not run arbitrary submitted programs inside the coordinator. No privileged
Docker socket is exposed. The optional host Docker sandbox and Kubernetes Job
executor remain separate genuine execution options, with bounded transient task
containers/Jobs rather than additional steady-state services. Reports disclose
when execution was not performed. See [operations](docs/OPERATIONS.md) and
[Kubernetes preparation](infra/kubernetes/DEPLOYMENT.md). Do not deploy Kubernetes
resources until separately authorized and validated on the intended cluster.

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

See [production architecture](./docs/PRODUCTION_PLATFORM.md), [security](./docs/SECURITY.md), [operations](./docs/OPERATIONS.md), and the authoritative [master build specification](./OMNICOMPILE_MASTER_BUILD_SPEC.md).
