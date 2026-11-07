# OmniCompile Core operations

Run `START-OMNICOMPILE.bat` from the repository root. It starts Docker Desktop when necessary, polls the engine, starts the existing MySQL Compose service, waits for its healthcheck, applies idempotent coordinator migrations, and starts OmniCompile Core. Repeated starts reuse healthy services.

Run `STOP-OMNICOMPILE.bat` to stop application processes and containers without deleting `OMNICOMPILE-MYSQL` and `OMNICOMPILE-ARTIFACTS` or stopping general-purpose `MYSQL`.

## Environment

- `PUBLIC_BASE_URL`, `COORDINATOR_PUBLIC_URL`, `HOST`, `PORT`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (preferred), `ADMIN_PASSWORD` (development fallback)
- `SESSION_TTL_HOURS`, `RESET_TTL_MINUTES`
- `HEARTBEAT_STALE_MS`, `HEARTBEAT_OFFLINE_MS`, `TASK_TIMEOUT_MS`

Host processes connect to the project MySQL at `127.0.0.1:3307`. The Compose coordinator uses `omnicompile-mysql:3307`. Project container `omnicompile-mysql` stores schema `omnicompile` in volume `OMNICOMPILE-MYSQL`. General-purpose `MYSQL` uses `127.0.0.1:3306` and volume `mysql`. Keep secrets in the ignored local environment.

## Full container startup and verification

```powershell
docker compose config --quiet
docker compose build
docker compose up -d --wait
node infra/docker/verification/Verify-Compose.mjs
docker compose ps
docker compose stop
```

`Verify-Compose.mjs` explicitly restarts the project MySQL to verify persistence using only a
new random temporary database. It deletes that fixture database in finally and
does not write application records. Run it during an agreed local test window.
Normal stop/start never deletes the volume. The migration service runs the
immutable ledger once; the API checks it at startup. `/live` is process liveness,
while `/ready` and compatibility `/health` require database connectivity.

The private execution broker runs permitted C, Python and Java work in disposable, restricted containers. See the [Docker guide](../infra/docker/README.md) for the service boundaries and verification commands.

## Troubleshooting

- Docker: `docker info`, then `docker compose ps` and `docker compose logs omnicompile-mysql`.
- Coordinator/dashboard: `.runtime/application.log` and `.runtime/application-error.log`.
- No eligible worker: verify network match and required capability. Browser workers can optimize IR but cannot compile Python/Java or run GCC/JDK.
- JDK: set `OMNICOMPILE_JDK_HOME` or `JAVA_HOME` to JDK 21 before starting a native worker.
- Security/build gate: `npm run verify`, `npm run verify:platform`, `npm audit`.

Do not use `docker compose down -v` unless permanent database deletion is explicitly intended.
