#!/bin/sh
set -eu
# This Compose deployment deliberately has one coordinator. Migrations run under
# the database's existing advisory lock before HTTP/WebSocket admission opens.
# Kubernetes overrides command and uses its separate controlled migration Job.
OMNICOMPILE_MIGRATION_MODE=apply node --import tsx apps/coordinator/src/migrate.ts
export OMNICOMPILE_MIGRATION_MODE=check
if [ -r /app/.runtime/distribution/manifest.json ]; then
    export OMNICOMPILE_LOCAL_DISTRIBUTION_MANIFEST="$(cat /app/.runtime/distribution/manifest.json)"
fi
exec node --import tsx apps/coordinator/src/server.ts
