# Phase 4 v1 — coordinator / MySQL / fault-tolerance acceptance

Status: **SEALED — Phase 4 v1 acceptance, 14 October 2026. 8/8 master exit obligations and 6/6 closure gates verified (100% of this phase's acceptance).** Implementation commit `01f3bd4397613b37e9e894106691113e7dd0ea4d` was pushed to the requested origin on `engineering/omnicompile-release-foundation`; the remote branch hash matched. Full evidence: [RESULTS.md](evidence/2026-10-14-phase4-seal/RESULTS.md).

Scope: preserved master B:20 Phase 4, lines 5474–5483, plus the six closure gates in PHASE4_CLOSURE_PLAN.md. This closes the existing task engine, not Windows/Android packaging or physical browser acceptance. Later phases retain their own requirements.

## Acceptance matrix

| Requirement | Implementation | Behavioral evidence |
|---|---|---|
| Persistent orchestration | Existing MySQL tasks, attempts, results, jobs; append-only 0004–0007 migrations | Migration adoption/recovery, durable leases, restart and database-fault fixtures |
| Secure enrollment | Existing scoped credentials, explicit consent, reusable admission override, stable identities, atomic capacity | Enrollment, reusable-link and protocol integration suites |
| Eligibility and selection | Network/capability/toolchain/OS/architecture, fresh telemetry, contribution/network policies, bounded observed reliability, persisted explanations; transactional recheck | Scheduler/policy tests, live busy-network policy rejection, actual node-lock/network-expiry contention |
| Leases and recovery | Immutable database-clock attempt expiry, absolute task admission deadlines, max attempts, persisted exponential jitter/backoff; quarantine and re-registration | Leases, recovery, cancellation and persistent-MySQL closure suites |
| Result validation | Independent portable reference answers, C IR rederivation, authoritative native source compilation before artifact publication | Forged/replayed/foreign/stale result tests; actual native portable tasks; compiler regressions |
| Artifact integrity | SHA-256 + byte length, controlled authorized download, transactional publication | Corruption rejection, interrupted two-artifact publication rollback, real downloaded output and ownership checks |
| Process/database restarts | Owned test coordinator restart, actual MySQL restart with retained data, pause/resume, interrupted publication resume | Recovery and closure suites; actual isolated dump/restore comparisons |
| Ownership/RBAC | Existing authenticated owner/admin cancellation, admin-only policy management, network/node/attempt scoping | Protocol, task-results, cancellation, platform and artifact authorization regressions |

## Runtime rules

- One active coordinator. Recovery is durable, bounded and idempotent; it is not multi-coordinator HA or exactly-once execution. Terminal attempts stay unchanged; each retry gets a separate attempt row.
- Initial production tasks have a 300-second absolute admission deadline. Retry eligibility is stored in MySQL, starts at 500–625 ms, doubles by attempt and caps at 30 seconds. Default maximum attempts is three; stored per-task timeout survives retry/restart. An expired or superseded attempt cannot publish.
- Native worker and coordinator compilation run in owned, credential-restricted child processes. Cancellation stops descendants before reuse. Parent IPC loss triggers owned descendant cleanup. A missing Windows tree-termination command fails closed rather than advertising availability. These controls are not a complete host security sandbox.
- Network policy is stored in existing configuration_json, changed by authenticated `PATCH /api/admin/networks/:networkId/policy`. Unknown measurements fail restrictive policies. Resource estimates are labelled; scheduler admission is not an OS CPU/memory quota. Android eligibility defaults are conservative, but do not establish an Android app/device implementation.
- User-requested disconnect/leave/cancellation and observed server interruption are not counted as attributable worker failures. Failure classification is server-owned, separate from worker error text. Cold-start reliability remains unknown rather than an invented score.
- The authenticated catalogue endpoint describes five bounded portable operations: SHA-256, prime count, hash chain, integer matrix multiplication and a deterministic uint32 benchmark. New operations require explicit capability flags. The benchmark is real computation, not a fabricated acceleration measurement. Existing C IR and native language compiler tasks remain separate existing workloads.
- Actual artifact bytes are stored in the existing MySQL model. A corrupt/truncated/missing-digest artifact is not served. No placeholder executable, JAR or success result is introduced.

## Repeat verification

From the project root with the bundled Node 24.21.0 directory on PATH:

```powershell
$env:OMNICOMPILE_SANDBOX_TEST='1'
npm test -- --maxWorkers=1
npm run typecheck
node --test scripts/*.test.mjs
npm run build
node scripts/Run-Isolated-Integration.mjs all
foreach ($mode in @('phase4','leases','recovery','cancellation','execution','enrollment','reusable')) {
  node scripts/Run-Isolated-Integration.mjs $mode
  if ($LASTEXITCODE -ne 0) { throw "Verification failed: $mode" }
}
```

`npm run verify:phase4` runs the dedicated closure fixture. Docker must be ready; execution tests use the existing `oa-omnicompile-execution:local` image. Verifiers reject developer/remote targets and own labelled temporary containers. The restart fixture retains its data inside its own container writable layer; it creates no developer volume. No reset, volume deletion or production deployment is required.

## Next phases

Phase 5 — web product: audit and finish actual landing/auth/user/admin/Compute Tasks journeys, details/history/pagination, downloads, live state, accessibility and responsive layouts. Preserve explicit user UI/history overrides. Exit only after browser end-to-end journeys pass against the real coordinator/MySQL; no decorative-only acceptance.

Phase 6 — browser worker: actual browser enrollment, bounded execution/cancellation, visibility/pause/reconnect/tab closure, eligibility and truthful resource reporting. Exercise supported portable tasks through real browsers, including mobile where available. Browser workers do not claim native GCC/CPython/JDK execution.

Windows installer, native Kotlin/Compose Android APK, physical devices, heterogeneous acceptance, host isolation and release/signing/deployment remain their later gates. This Phase 4 record cannot be used as evidence they passed.
