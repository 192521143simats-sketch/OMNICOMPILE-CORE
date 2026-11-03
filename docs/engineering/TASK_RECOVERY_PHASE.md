# Phase 4 — durable task leases and failure recovery

> Execution: superpowers:executing-plans, inline implementation with behavioral RED→GREEN tests and one fresh review.

Goal: complete the five user-requested recovery requirements without replacing the existing task engine, MySQL, compiler pipelines or protocol v1.

Architecture: append migration 0004 for immutable attempt deadlines; assignment persists deadlines transactionally. RUNNING/result transitions reject expired attempts, with final result checks in the publication transaction. Startup interrupts outstanding assignments; recurring recovery expires leases even after a failed timer or MySQL outage. Quarantine/close affected workers before reassignment; three attempts remain the maximum. This remains a single-active-coordinator architecture, not HA failover.

Spec: preserved MASTER_PROMPT.txt B:6.5–6.7 and the 2026-10-13 user five-item recovery request. No database reset, credential rotation, protocol duplication or invented platform evidence.

## Ordered checklist

### Task 1: Persist and enforce attempt leases

- [x] Add isolated real-MySQL regression: correct result after persisted expiry must be rejected without a result record; run against unchanged code and observe failure.
- [x] Add immutable/idempotent `0004_task_attempt_leases` migration with indexed `task_attempts.lease_expires_at`. Existing active attempts without a provable deadline are interrupted, not given renewed execution permission. Preserve terminal history.
- [x] Extend `Store.assignTask(..., timeoutMs=30000)` to persist an immutable UTC deadline; reject allocation beyond three attempts. Check deadlines in RUNNING transitions and before/inside result publication. Expose deadlines in authorized attempt detail.
- [x] Add `Store.recoverTaskAttempts(restart=false)` to atomically mark interrupted/expired attempts, bounded requeue or terminal failure and quarantine affected nodes. Never clear another task's node slot or alter terminal attempts.
- [x] Update migration verifier for append-only fourth migration, interrupted DDL/idempotence and preservation.

### Task 2: Recovery across real process/database/worker failures

- [x] Add runner-controlled isolated coordinator crash/restart and MySQL pause/resume (owned labelled tmpfs fixture only). Preserve storage during outage; never stop/restart tmpfs MySQL or touch developer containers.
- [x] Replace in-memory timeout authority with startup/periodic persisted recovery, pass configured timeout to assignment, catch transient recovery errors and retry on later ticks. Clear the recovery interval on shutdown.
- [x] Verify restart preserves deadlines/history; old/expired/foreign results cannot publish; disconnect/reassignment completes on a second compatible worker; three interrupted attempts fail permanently; outage/readiness returns 503 and recovery resumes without coordinator crash.
- [x] Verify recovery is idempotent, completed history unchanged, publication rollback/replay regressions still pass. Record red and green fixture IDs and outputs.

### Task 3: Regression, review and handoff

- [x] Run `npm run verify` (Docker-enabled), isolated recovery, all integration/compiler artifacts, execution, enrollment and reusable-link regressions. Expected all pass; report every actual failure/retry.
- [x] Fresh review of lease expiry/publication race, crash-after-result, outage, duplicate recovery, reconnect and immutable migration behavior; fix important findings with reproducing tests.
- [x] Update project status, requirement ledger and evidence. Report recovery checklist as 5/5 only after verified; broader Phase 4 remains incomplete if policies/cancellation/catalogue gates remain.
- [x] Commit coherent verified changes and push engineering/omnicompile-release-foundation without force; verify remote hash and clean tree. Implementation commit `73396b963a6206f879e096ee30cbec4126441a49` matched the requested origin branch; tracked tree was clean after push.

Requested recovery acceptance: 5/5 (100%). This percentage is limited to the five
2026-10-13 user requirements above. The full master Phase 4 is NOT complete:
cancellation propagation, broader scheduling policies/backoff and portable
catalogue still need their own implementation/acceptance gates.

Interfaces: existing Store assignment/result/failure transactions, immutable `(task_id,attempt)`, existing worker auth/network scope and protocol-v1 identity. No external side effects inside retried database transactions. Runner IPC controls exist only in test scripts, never coordinator endpoints.

Review focus: result verified before deadline but committed after it; newer assignment while stale recovery runs; worker work surviving timeout; database outage during disconnect; coordinator restart between result persistence and compiler finalization.
