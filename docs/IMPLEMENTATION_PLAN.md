# OmniCompile Core Incremental Implementation Plan

## Phase 0 — Assessment (complete)

- Read the authoritative specification.
- Confirm the repository is specification-only.
- Inventory the available runtime and compiler toolchain.
- Record architecture, constraints, and deferred decisions.

## Phase 1 — Bootable foundation

- Create npm workspace layout and strict TypeScript configuration.
- Add shared identifiers, enums, schemas, and state transition guards.
- Add MySQL schema initialization and persistence repositories.
- Boot coordinator health endpoint and minimal React application.
- Add unit tests and repeatable development commands.

Exit check: clean install, type-check, tests, and production builds succeed.

## Phase 2 — Sessions and consent

- Add admin boundary and distributed-session lifecycle.
- Generate expiring participation links using hashed random tokens.
- Build disclosure, accept, and decline flows.
- Issue short-lived single-use enrollment credentials only after acceptance.

Exit check: tests prove opening a link does not create a node and declined/expired/reused enrollments cannot register.

## Phase 3 — Worker registration and monitoring

- Implement worker WebSocket protocol and Node ID allocation.
- Build the native worker agent and real capability/resource profiler.
- Persist nodes and heartbeats with explicit lifecycle transitions.
- Add stale-node detection and live admin events.
- Display only backend-derived node data.

Exit check: a separately launched agent registers through accepted enrollment, appears online, heartbeats, and becomes offline after timeout.

## Phase 4 — Real test task vertical slice

- Add persistent tasks, attempts, and results.
- Implement capability-aware eligibility and transparent weighted scoring.
- Add allow-listed bounded test executors.
- Implement assignment, acknowledgement, running, completion, timeout, and requeue transitions.
- Show task/result state in the admin UI.

Exit check: Admin → link → accept → agent → node → heartbeat → real task → measured result works end to end. A worker failure causes an eligible retry, not a fabricated completion.

## Phase 5 — Compiler platform foundation

- Add compilation users/jobs and source/file validation.
- Define shared orchestration ports and separate language pipeline interfaces.
- Add artifact storage/download and measured performance records.
- Implement the strict zero-node behavior first; any later local fallback must be explicitly labelled local.

## Phase 6 — C pipeline, then distributed C optimization

- Implement real lexical, syntax, semantic, IR, optimization, code-generation, and linking stages.
- Validate local C artifacts before distributing any pass.
- Decompose only technically independent IR analysis/optimization work.
- Aggregate validated worker results and generate a native artifact.

## Phase 7 — Python pipeline

- Use Python-specific parsing, static analysis, AST/bytecode representation, optimizations, and artifact generation.
- Distribute only valid Python analysis/optimization workloads.

## Phase 8 — Java pipeline

- Provision and verify a JDK.
- Implement Java-specific parsing, type analysis, IR/optimization, and real class/JAR generation.
- Distribute only valid Java analysis/optimization workloads.

## Phase 9 — Adaptive scheduling and hardening

- Feed actual historical task performance into explainable scheduler scoring.
- Add container sandboxing, quotas, network restrictions, cleanup, and artifact validation.
- Test multi-job concurrency, failures, reassignment, invalid results, expiration, and recovery.
- Finish the admin/user/worker UI only after the workflows and measurements are real.

## Proposed repository structure

```text
apps/
  coordinator/
  web/
  worker/
packages/
  contracts/
  database/
  orchestration/
  compiler-c/
  compiler-python/
  compiler-java/
tests/
  integration/
  e2e/
docs/
infra/
  containers/
  compose/
```

## Immediate files

- Root workspace/build configuration and environment example.
- `packages/contracts`: role, session, node, task, result, and event contracts.
- `packages/database`: migration runner, schema, and repositories.
- `apps/coordinator`: configuration, server, health route, services, APIs, WebSocket gateway.
- `apps/worker`: configuration, enrollment client, profiler, heartbeat, executor.
- `apps/web`: route shells for admin, join/consent, and user interfaces.
- Tests covering state transitions and the first vertical slice.

