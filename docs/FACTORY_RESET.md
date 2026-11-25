# Explicit fresh application reset

`scripts/Reset-Fresh-Application.ps1` is an operator-run destructive reset. Normal
startup never invokes it. The current revision was syntax checked and its
`-FactoryReset -WhatIf` preflight passed against the existing Docker setup.
The operator subsequently executed the saved script successfully. Its persisted
fresh-launch report at `2026-11-24T21:04:52.887Z` verifies one administrator, zero
application records/networks/workers/artifact objects, next network A, healthy
core services and successful public route checks. This is a point-in-time reset
baseline; later user activity must be preserved.

Preview from the repository root:

```powershell
pwsh -NoProfile -File scripts/Reset-Fresh-Application.ps1 -FactoryReset -WhatIf
```

To intentionally erase application data, run that command without `-WhatIf`.
It removes only the two validated application data volumes and retired managed
enrollment files, rotates four internal service secrets, starts the application,
clears bootstrap auth sessions and runs `Verify-Fresh-Launch.mjs --public`.
Failures stop the operation. If startup/verification fails after deletion, fix
the reported issue and use normal startup; do not repeatedly reset.

Expected verified baseline: one configured administrator, zero ordinary users,
networks, enrollments, workers, jobs, results, artifacts and sessions; next network
letter A. Compiler tool containers remain available but are not worker nodes.

Preserved: `.env` and administrator credentials, saved Tailscale transport URL,
Tailscale configuration, unrelated `MYSQL`/`mysql` identities if present, source,
samples, packages and test evidence. Broad generated-file cleanup is deliberately
not invoked because it can remove saved transport state. The script validates
factory file paths, volume consumers, mounts and Compose project before mutation.
No Docker pruning, unrelated-container removal or Windows power changes occur.

While resetting, keep clients closed: fresh-baseline verification intentionally
fails if another client creates users, networks or jobs during the operation.
The reset requires Docker, PowerShell 7, Node.js, available local images/build
tools, the saved transport, and internet for public verification. It does not
provide a rollback or data backup; volume deletion is permanent.
