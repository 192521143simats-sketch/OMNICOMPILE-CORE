# OmniCompile Core operations

Run `START-C-OPTIFORGE.bat` from the repository root. It starts Docker Desktop when necessary, polls the engine, starts the existing MySQL Compose service, waits for its healthcheck, applies idempotent coordinator migrations, and starts OmniCompile Core. Repeated starts reuse healthy services.

Run `STOP-C-OPTIFORGE.bat` to stop application processes and containers without deleting `c-optiforge_mysql_data`.

## Environment

- `PUBLIC_BASE_URL`, `COORDINATOR_PUBLIC_URL`, `HOST`, `PORT`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `MYSQL_ROOT_PASSWORD`
- `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` (preferred), `ADMIN_PASSWORD` (development fallback)
- `SESSION_TTL_HOURS`, `RESET_TTL_MINUTES`
- `HEARTBEAT_STALE_MS`, `HEARTBEAT_OFFLINE_MS`, `TASK_TIMEOUT_MS`

Host processes use `127.0.0.1:3307` by default. A future containerized coordinator must use Compose hostname `mysql:3306`. Secrets stay in ignored `.env`; production should use a secret manager.

## Troubleshooting

- Docker: `docker info`, then `docker compose ps` and `docker compose logs mysql`.
- Coordinator/dashboard: `.runtime/application.log` and `.runtime/application-error.log`.
- No eligible worker: verify network match and required capability. Browser workers can optimize IR but cannot compile Python/Java or run GCC/JDK.
- JDK: set `COPTIFORGE_JDK_HOME` or `JAVA_HOME` to JDK 21 before starting a native worker.
- Security/build gate: `npm run verify`, `npm run verify:platform`, `npm audit`.

Do not use `docker compose down -v` unless permanent database deletion is explicitly intended.
