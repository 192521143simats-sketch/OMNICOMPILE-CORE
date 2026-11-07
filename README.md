# OmniCompile Core

**OmniCompile Core: A Zero-Trust, Fault-Tolerant Distributed Compiler Pipeline for Heterogeneous Edge-to-Cloud Orchestration.**

OmniCompile Core combines real C, Python, and Java compiler pipelines with a coordinator that assigns eligible optimization and compute tasks to heterogeneous workers. It is designed to adapt scheduling to device capabilities and recover from worker failures while keeping compilation outputs and task history traceable.

## How it works

1. An administrator creates an isolated network and shares its enrollment link. Peers explicitly consent to join through a browser, Windows application, or native Android app.
2. Workers advertise supported operations and available resources through the versioned worker protocol. Heartbeats inform the coordinator which workers are eligible for assignment.
3. A compilation user selects a language and submits source. The language-specific pipeline analyzes the program and decomposes supported independent work into bounded tasks. Scheduling considers network membership, capabilities, resource information, and recorded performance.
4. Workers execute authorized tasks. The coordinator checks task, worker, and attempt identity and applies task-specific result verification before aggregation. Expired or interrupted attempts can be retried within policy.
5. The compiler produces language-specific artifacts and diagnostics. The compiler workspace presents job-scoped operational metrics separately from the downloadable build report.

Browser and Android workers handle supported portable workloads. Native toolchain work requires a compatible environment. Distribution applies to eligible tasks, while dependent work and final artifact generation follow the language pipeline. Public hosting and stronger isolation for hostile workloads have separate acceptance gates.

Workers built for older protocol versions must be rebuilt and re-enrolled. See the [master build specification](OMNICOMPILE_MASTER_BUILD_SPEC.md), [security policy](SECURITY.md), and [engineering status](docs/engineering/PROJECT_STATUS.md) for requirements, operating limits, and verification evidence.

## Start

Requirements for Docker startup are Docker Desktop and Node.js 22+ for environment preparation and scoped worker provisioning. The language containers provide GCC/G++, Python and JDK 21. Clients need no installed compiler to submit jobs. Optional native execution on a Windows peer still requires its advertised local toolchain.

```bat
START-OMNICOMPILE.bat
```

Open `http://localhost:5173`. On the first start, the ignored `.env` receives a random `ADMIN_PASSWORD`; sign in with `ADMIN_USERNAME` and that password. Production deployments should replace the plaintext development fallback with an Argon2id `ADMIN_PASSWORD_HASH` and remove `ADMIN_PASSWORD`.

For a phone or another computer on the same Wi-Fi/LAN, use the `Mobile/LAN` URL printed by `START-OMNICOMPILE.bat` (for example, `http://192.168.0.5:5173`). Never replace its host with `localhost`: on a phone, `localhost` means the phone itself. The startup process uses the active LAN address when it generates worker invitation links.

Users select a language and execution preference and supply a source filename plus pasted or uploaded source. OmniCompile Core chooses an active compatible network using the same resource-aware score and measured execution history used for worker scheduling. Network choice and compilation history are administrative concerns and are shown in the Admin dashboard. New worker identities are network-scoped (`NODE-A001`, `NODE-A002`, `NODE-B001`, and so on).

```bat
STOP-OMNICOMPILE.bat
```

Shutdown preserves the project database and artifact volumes and leaves general MYSQL untouched. Never use `docker compose down -v` during normal operation.

### Docker layout

The root `docker-compose.yml` manages eight project services. The frontend is available on port 5173 and the coordinator on port 4100. Project MySQL uses loopback port 3307 and volume `OMNICOMPILE-MYSQL`. Private artifact storage uses `OMNICOMPILE-ARTIFACTS`. The separate general-purpose `MYSQL` instance uses port 3306 and volume `mysql`.

See [Docker operations](infra/docker/README.md) for the service inventory, execution boundaries, credentials and verification commands.

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
