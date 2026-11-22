# OmniCompile Core architecture

The product and research title is OmniCompile Core: A Zero-Trust, Fault-Tolerant Distributed Compiler Pipeline for Heterogeneous Edge-to-Cloud Orchestration.

## Components

- `apps/web`: React/Vite landing, authentication, user compiler dashboard, administration console, join/consent flow, and real browser worker.
- `apps/coordinator`: Fastify HTTP/WebSocket control plane, server-side RBAC, MySQL repositories/migrations, network enrollment, scheduling, failure recovery, aggregation, and artifact delivery.
- `apps/worker`: native Node worker with host resource/toolchain profiling and scoped authenticated WebSocket transport.
- `apps/windows-worker`: packaged Windows application and native-agent lifecycle.
- `apps/android-worker`: native Kotlin/Jetpack Compose application, API 25 compatibility and device tests.
- `packages/contracts`: bounded worker protocol schemas and lifecycle types.
- `packages/orchestration`: resource/capability/history-aware node scoring.
- `packages/compiler-c`, `compiler-python`, `compiler-java`: language-specific frontends, representations, optimization, diagnostics, and artifact generation.
- `infra/docker`: image definitions, startup/provisioning operations and isolated container verification. The root `docker-compose.yml` connects eight project services; general-purpose `MYSQL` is independent.
- `infra/kubernetes*`: shared manifests and explicit local/runtime/prewarming overlays. These are deployment inputs, not evidence of cloud deployment.
- `infra/vercel` and `infra/web`: frontend hosting/gateway configuration.
- `scripts`: packaging, environment initialization, release scanning and isolated end-to-end acceptance runners.
- `samples`: maintained compiler regression inputs. These are test assets, not disposable build output.
- `docs`: architecture, operations and requirement/verification ledger. `.github` contains CI workflows.

## Source and local state

Git tracks the same source layout used on this laptop. `node_modules`, generated `dist`/Android build directories, `.runtime`, local SDK/signing configuration, deployment-link metadata and environment secrets are intentionally excluded. They must not be committed to make Git resemble a runtime installation. Worker packages, credentials, toolchains and current security reports have distinct purposes under `.runtime`; generated test profiles and completed scratch runs can be removed after recording their results.

Each workspace needs its own `tsconfig.json`, even when its contents match another workspace: relative source/output paths resolve within that workspace. Identical configuration text is not evidence that the file is redundant.

## End-to-end flow

An ADMIN creates a distributed network and receives one reusable public join link. Each consenting device creates a separate enrollment and node attached to that network. Browser workers connect using an HttpOnly scoped credential and execute browser-compatible operations in a Web Worker; native workers use a scoped Authorization header and advertise real toolchains.

An authenticated USER creates a single-source job for an active network. The coordinator creates network-scoped compiler/optimization tasks. SQL eligibility queries and transactional assignment enforce network equality, availability, revocation, and capability. Workers return node/task/attempt-bound results. Browser and Android workers perform supported portable operations; their participation does not imply native GCC, CPython or JDK execution on those devices.

Cloud-mode toolchain operations use the authenticated execution broker and separate C, Python and Java images. Compose launches restricted disposable containers; the optional Kubernetes provider creates bounded Jobs with persisted execution IDs, cancellation and cleanup. Native ELF architecture is checked before execution. Compiler/runtime versions, diagnostics and supported optimization evidence are obtained from actual execution, not fabricated progress.

The coordinator verifies results before publishing artifacts. Durable artifact bytes use the configured private S3-compatible object store; MySQL retains ownership, job state and artifact metadata/references. Local artifact content remains supported where explicitly configured. Downloads enforce owner/admin authorization.

Heartbeat loss/disconnect records the attempt, requeues work up to three attempts, and allows another compatible same-network worker to finish it. The admin receives live WebSocket overview updates and can force a fresh read without restarting any service.

## Trust boundaries

User/admin browser authentication is independent from worker identity. Workers receive no admin, user, or database credentials. Network join tokens are public enrollment identifiers; enrollment credentials are per-device and revocable. Workers do not receive Docker sockets or Kubernetes administration access. The broker is the trusted provisioning boundary; broker-isolated compiler/execution workloads have filesystem/network restrictions and bounded CPU, memory, processes, output and lifetime. Host-native workers do not automatically receive those container restrictions: hostile local compilation requires independently validated OS/VM isolation and must not be presented as equivalent to the broker sandbox.

Native local execution is an explicit capability/policy choice. Cloud containers run on infrastructure CPU, not the enrolling device's CPU. ARM64 builds and registry publication do not establish runtime safety: the selected native ARM kernel/container runtime must pass the sandbox tests. Current local ARM emulation fails closed on missing Landlock; the gVisor/Landlock compatibility gate remains open. Public cloud execution must not be enabled by disabling those protections.

MySQL is the sole runtime database. No SQLite dependency or runtime file exists.
