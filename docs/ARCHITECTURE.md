# OmniCompile Core architecture

The product and research title is OmniCompile Core: A Zero-Trust, Fault-Tolerant Distributed Compiler Pipeline for Heterogeneous Edge-to-Cloud Orchestration. OmniCompile Core and OMNICOMPILE remain historical and compatibility-sensitive engineering identifiers only.

## Components

- `apps/web`: React/Vite landing, authentication, user compiler dashboard, administration console, join/consent flow, and real browser worker.
- `apps/coordinator`: Fastify HTTP/WebSocket control plane, server-side RBAC, MySQL repositories/migrations, network enrollment, scheduling, failure recovery, aggregation, and artifact delivery.
- `apps/worker`: native Node worker with host resource/toolchain profiling and scoped authenticated WebSocket transport.
- `packages/contracts`: bounded worker protocol schemas and lifecycle types.
- `packages/orchestration`: resource/capability/history-aware node scoring.
- `packages/compiler-c`, `compiler-python`, `compiler-java`: language-specific frontends, representations, optimization, diagnostics, and artifact generation.

## End-to-end flow

An ADMIN creates a distributed network and receives one reusable public join link. Each consenting device creates a separate enrollment and node attached to that network. Browser workers connect using an HttpOnly scoped credential and execute browser-compatible operations in a Web Worker; native workers use a scoped Authorization header and advertise real toolchains.

An authenticated USER creates a job for an active network. The coordinator creates network-scoped meaningful compiler tasks. SQL eligibility queries and transactional assignment enforce network equality, availability, revocation, and capability. Workers return node/task/attempt-bound results. The coordinator validates/aggregates results, creates the language artifact, persists it in MySQL, and permits only its owner or an admin to download it.

Heartbeat loss/disconnect records the attempt, requeues work up to three attempts, and allows another compatible same-network worker to finish it. The admin receives live WebSocket overview updates and can force a fresh read without restarting any service.

## Trust boundaries

User/admin browser authentication is independent from worker identity. Workers receive no admin, user, or database credentials. Network join tokens are public enrollment identifiers; enrollment credentials are per-device and revocable. Browser workers cannot access native OS toolchains. Native compilation has process/time/workspace controls but requires external container/VM isolation for hostile multi-tenant operation.

MySQL is the sole runtime database. No SQLite dependency or runtime file exists.
