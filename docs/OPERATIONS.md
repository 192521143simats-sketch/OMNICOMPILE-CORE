# OmniCompile Core operations

Run `START-OMNICOMPILE.bat` from the repository root. It starts Docker Desktop when necessary, polls the engine, starts the existing MySQL Compose service, waits for its healthcheck, applies idempotent coordinator migrations, and starts OmniCompile Core. Repeated starts reuse healthy services.

Run `STOP-OMNICOMPILE.bat` to stop application processes and containers without deleting `omnicompile-data` or stopping general-purpose `MYSQL`.

## Environment

- `PUBLIC_BASE_URL`, `COORDINATOR_PUBLIC_URL`, `HOST`, `PORT`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (preferred), `ADMIN_PASSWORD` (development fallback)
- `SESSION_TTL_HOURS`, `RESET_TTL_MINUTES`
- `HEARTBEAT_STALE_MS`, `HEARTBEAT_OFFLINE_MS`, `TASK_TIMEOUT_MS`

Host processes connect to the project MySQL at `127.0.0.1:3307`. The Compose coordinator uses `omnicompile-mysql:3306`. Project container `omnicompile-mysql` stores schema `omnicompile` in volume `omnicompile-data`. General-purpose `MYSQL` uses `127.0.0.1:3306` and volume `mysql-data`. Keep secrets in the ignored local environment or Kubernetes Secret references.

## Full container startup and verification

```powershell
docker compose config --quiet
docker compose build
docker compose up -d --wait
node scripts/Verify-Compose.mjs
docker compose ps
docker compose stop
```

`Verify-Compose.mjs` explicitly restarts the project MySQL to verify persistence using only a
new random temporary database. It deletes that fixture database in finally and
does not write application records. Run it during an agreed local test window.
Normal stop/start never deletes the volume. The migration service runs the
immutable ledger once; the API checks it at startup. `/live` is process liveness,
while `/ready` and compatibility `/health` require database connectivity.

The local container coordinator sets `OMNICOMPILE_EXECUTION_MODE=disabled` explicitly.
Native workers still produce real C/Python/Java artifacts; reports must say program
execution was not performed. For final program execution use the existing host
coordinator Docker sandbox or the approved Kubernetes sandbox deployment. Never
mount the Docker socket into the coordinator to hide this boundary. The container
verification image uses CPython3.14 and JDK21 with distribution GCC; actual GCC
version and Java21/Python type-alias compilation are checked by the image smoke.
Workers using newer source-level features still need a matching verifier. Host development
uses the installed toolchains (this Windows host has JDK21).

Kubernetes rendering and official-schema checks are described in
[Kubernetes README](../infra/kubernetes/README.md). They are not proof of a live cluster deployment.

## Troubleshooting

- Docker: `docker info`, then `docker compose ps` and `docker compose logs database`.
- Coordinator/dashboard: `.runtime/application.log` and `.runtime/application-error.log`.
- No eligible worker: verify network match and required capability. Browser workers can optimize IR but cannot compile Python/Java or run GCC/JDK.
- JDK: set `OMNICOMPILE_JDK_HOME` or `JAVA_HOME` to JDK 21 before starting a native worker.
- Security/build gate: `npm run verify`, `npm run verify:platform`, `npm audit`.

Do not use `docker compose down -v` unless permanent database deletion is explicitly intended.

## Separate Docker language workers

See [Docker deployment](../infra/containers/README.md) for the approved six services, retained-volume migration, scoped enrollment and compiler filesystem restrictions. General MYSQL is independently managed. The coordinator routes native verification to the matching internal language service. Run node scripts/Verify-Docker-Compilers.mjs for isolated schema and actual three-language Docker acceptance.
