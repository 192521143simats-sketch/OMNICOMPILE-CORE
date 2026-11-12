# Three-worker engineering assessment

Baseline: Git `929a6a4`, local Windows Docker Desktop. The working tree was clean.
All eight Compose services reported healthy at inspection. The API 25 phone
was attached. The previous API 37 attempt installed and opened the app, but
the mixed fixture never observed its pending enrollment.

## Inventory and dependency map

| Area | Source and execution boundary | Baseline assessment |
|---|---|---|
| Android | `apps/android-worker/app/src/main/java/org/omnicompile/worker/` contains MainActivity, WorkerService, AndroidRuntime, WorkerConnection, DeviceResources and the portable executor. Gradle and AndroidX build the native APK. | API 25 three-worker lifecycle previously verified. API 37 installation verified, enrollment incomplete. |
| Web | `apps/web/src/main.tsx` and `api.ts` provide the React frontend and API client. `browser-node.tsx` manages participation and `browser-worker.ts` runs portable operations. | Enrollment and portable execution verified. Browser capabilities constrain available metrics. |
| Windows | `apps/windows-worker/main.cjs`, `preload.cjs`, `renderer.js`, `worker-bridge.ts`, and `JobGuard.cs` provide the Electron app, native agent bridge and Windows process control. | Enrollment, portable execution and reconnect verified. Portable workers are distinct from cloud compiler containers. |
| Coordinator | `apps/coordinator/src/server.ts` owns HTTP and WebSocket admission. `networks.ts`, `worker-connections.ts`, `database.ts`, `task-recovery.ts` and `task-cancellation.ts` manage identity, ownership, leases and recovery. `packages/contracts/src/index.ts` defines messages. `packages/orchestration/src/scheduler.ts` evaluates capability, policy and resource eligibility. | Lifecycle, retry, isolation and attribution have integration coverage. Three-way execution overlap was not yet proven by the mixed fixture. |
| Compiler | `apps/coordinator/src/compiler-job.ts`, `compiler-service.ts`, `compilation-verification.ts` and `distribution.ts` dispatch language work, verify results and assemble outputs. `packages/compiler-c/src/`, `packages/compiler-python/src/pipeline.ts` and `packages/compiler-java/src/pipeline.ts` implement language-specific analysis, transformations and toolchain output. | Prior real C, Python and Java jobs passed. Existing correctness tests cover selected semantics; arbitrary input equivalence and benchmark improvements are not established. |
| Integrity and storage | `database.ts` stores attempts and results in MySQL. `portable-verification.ts` independently verifies portable operations. `execution-evidence.ts`, `compiler-artifacts.ts` and `artifact-storage.ts` collect execution information, hash artifacts and store bytes. | Existing digest and verification checks cover the main pipeline. A uniform execution record with every requested provenance field is incomplete. |
| Infrastructure | `docker-compose.yml`, `infra/docker/images/`, `infra/docker/operations/` and `infra/docker/verification/` build and run eight services. `apps/coordinator/src/docker-executor.ts` owns the private Docker broker. `infra/kubernetes/` and `infra/vercel/` contain deployment templates. | Local stack operational. Hosted routing, cluster recovery, rolling updates and rollback require staging. |
| Gates | `.github/workflows/verify.yml`, `package.json` and `scripts/Verify-*.mjs` cover type checks, tests, builds, dependency checks, Docker and isolated integration. | Local and CI gates exist. Physical-device and hosted tests are environment-dependent. |

Execution flow: client login or worker enrollment → authenticated WebSocket
registration and heartbeat → MySQL task → eligibility and lease assignment →
worker execution → attempt-bound result → independent verification → persisted
result or compiler aggregation → authorized artifact download. Compiler
toolchains run through language containers and the isolated execution broker.

## Initial defects and test order

1. High, Android acceptance diagnostics. `scripts/Android-Fixture.mjs` captures
   instrumentation output but the enrollment poll can time out before reporting
   a failed or stalled activity launch. Make failure observable and exercise a
   bounded foreground launch for the disposable package, then retest API 37 and
   the physical API 25 phone.
2. High, missing concurrency proof. `scripts/Verify-Mixed-Workers.mjs` runs the
   Android workload separately from its browser/Windows burst. Add a three-way
   workload with persisted attempt timestamps, distinct identities, and a
   verified result per task. Preserve recovery, cancellation and provenance checks.
3. Medium, information gaps. `DeviceResources.kt` has no OS-wide CPU measurement
   and pre-29 devices lack thermal readings. `browser-node.tsx` uses browser
   feature detection. `worker-bridge.ts` exposes native capabilities subject to
   local tooling. Platform-specific metrics and build internals need explicit
   source labels before expanding the Android monitoring UI.
4. Medium, release evidence. Run compiler and broker integration checks, rebuild
   Compose images and verify readiness. Render Kubernetes offline. Keep hosted
   acceptance separate until authorized staging is available.

This assessment covers source boundaries and the current failure. Exhaustive
field inventories, the Android dashboard redesign, arbitrary-program equivalence,
and production load characterization remain open.

## Worker information inventory

| Field | Owner and collection | Validation and unavailable reason |
|---|---|---|
| Android release, API, model and architecture | Android Build constants and supported ABI list in MainActivity and DeviceResources | Compare with ADB properties. Android release and ABI are visible in the UI. API level is used internally by service and thermal guards. |
| Android cores, free memory, battery and network | Runtime processor count, ActivityManager.MemoryInfo, battery broadcast and ConnectivityManager in DeviceResources | Compare with device diagnostics and registered resource snapshots. Battery can be absent, and telemetry is populated after contribution starts. |
| Android CPU and thermal | Process CPU divided by elapsed time and available cores, plus PowerManager thermal status on API 29+ | Process CPU is app-scoped. OS-wide CPU is unmeasured and thermal state is unavailable on older Android. |
| Browser platform and capabilities | Browser worker enrollment profile and feature detection in browser-node.tsx | Browser integration and protocol tests. Engine, exact OS build, system CPU, free memory and disk can be withheld by browser APIs. |
| Windows runtime and toolchain capabilities | Electron main process and worker bridge, Node OS and local toolchain probes | Packaged Windows integration and runtime checksum. Native compiler availability depends on configured local toolchains and contribution policy. |
| Worker status, active task and heartbeat | Client connection state, authenticated heartbeat and MySQL node/attempt rows | Inspect persisted state and submit work after reconnect. Freshly enrolled or disconnected workers may have no heartbeat. |
| Completed, failed and verified work | Coordinator worker-status.ts and attempt/result records | Compare UI or API to persisted tasks. No reliability percentage exists before completed samples. |
| Compiler diagnostics, toolchain and artifacts | Language pipeline and coordinator build reports, independent validation and artifact storage | Inspect the compiler workspace and downloaded reports. Portable Android and browser workers do not own desktop compiler diagnostics or artifact storage. |

The test matrix separates role and protocol checks, compiler correctness,
artifact integrity, worker concurrency and recovery, Docker health, and offline
configuration validation. Release evidence still needs a hosted environment,
sustained load, and a uniform per-attempt provenance record. Android worker
device statistics are useful independently of desktop compiler outputs.

## Verification and disposition

| Test | Objective and expected result | Actual result | Status and evidence |
|---|---|---|---|
| AND-37 | Android enrolls, runs and rejoins with browser and Windows | Initial instrumentation failed before enrollment with Espresso's reflective InputManager call. Espresso 3.7.0 resolved the API incompatibility. Final run completed all mixed checks. | PASS. Fixture 0cf661f30fd25e2a, mixed runner exit 0, Android instrumentation OK (1 test). |
| AND-25 | Repeat three-worker acceptance with updated instrumentation | Physical API 25 was detected. The handset canceled USB installation and neither acceptance package was installed at the final check. The prior application build passed on this phone. | BLOCKED for the current test APK. Both packages were copied to Downloads. |
| CO-01 | Three distinct workers overlap and return verified results | Three 100,000-iteration hash chains each produced one completed, independently verified attempt. The initial million-iteration run exceeded the wait on the constrained emulator. | PASS. The mixed fixture asserted the measured overlap below. |
| CO-02 | An interrupted browser task moves to Windows, then all platforms reconnect after coordinator restart | The mixed suite checks failed attempt preservation, result attribution, stable identities and fresh work after restart. | PASS. Same mixed fixture. |
| AND-UNIT | Build instrumentation and run Android unit tests | Gradle resolved Espresso 3.7.0, built the test APK and completed the unit-test target. | PASS. Gradle dependencyInsight and assembleDebugAndroidTest. |
| FIXTURE | Verify isolation checks in the Android fixture helper | Three Node tests passed. | PASS. node --test scripts/android-fixture.test.mjs. |
| COMP-01 | Run real compiler work and verify published artifacts | C, Python and Java pipeline checks passed with 12 verified outcomes and two concurrent compilation jobs. | PASS. Verify-Docker-Compilers.mjs. |
| EXEC-01 | Exercise broker execution, bounds, cancellation and isolation | Program execution and restriction checks passed, with no residual job containers. | PASS. Verify-Docker-Execution.mjs. |
| DOCKER-01 | Build and start the eight services | All eight images built locally and all eight services reported healthy. | PASS. docker compose build and docker compose up --wait. |
| SEC-01 | Check production npm dependencies for known advisories | npm audit reported zero vulnerabilities at execution time. | PASS. npm audit --omit=dev --audit-level=high. |
| CLOUD-01 | Render deployment configuration offline | Kustomize rendered 17 objects. The standalone migration Job is separate. | PASS for render. Hosted execution and ingress remain unverified. |
| LOAD-01 | Establish sustained throughput, resource usage and saturation limits | The overlap and two-job tests cover small, bounded workloads. | NOT TESTED for sustained load and saturation. |

Actual coordinator timestamps for the three overlapping attempts, all UTC on
2026-11-12. The interval includes the coordinator's result handling.

| Platform | Node | Task ID | Attempt | Started | Completed |
|---|---|---|---:|---|---|
| Browser | NODE-A001 | TASK-06fb55f2-6839-48d9-b5d9-0f83e3f0fd32 | 1 | 13:18:42.756 | 13:18:46.172 |
| Windows | NODE-A002 | TASK-391c1b87-5244-463d-bf7a-2e4dba70a109 | 1 | 13:18:43.742 | 13:18:45.675 |
| Android API 37 | NODE-A003 | TASK-0f09192c-5d17-42f5-8187-dcf4aecfe554 | 1 | 13:18:43.559 | 13:18:52.645 |

Shared attempt interval: 1,933 ms. This measures overlapping task lifecycle
intervals. CPU-level simultaneity, host-independent speedup and throughput
under sustained load require separate measurements.

**NOT READY FOR DEPLOYMENT.** Local workload verification and offline rendering
passed. Hosted security and recovery acceptance, the current physical API 25
rerun, exhaustive compiler equivalence and provenance, and the requested
Android monitoring expansion remain open.
