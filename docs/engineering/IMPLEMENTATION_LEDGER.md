# OmniCompile Core implementation ledger

This ledger follows the two product directives in delivery order. Earlier
commits preserve the previous ledger and acceptance records. A part advances
only when its named gate has run against the relevant revision.

## Baseline and architecture

The implementation started from the existing TypeScript monorepo. Commit
`177a54f` records Android API 25 and API 37 worker evidence. Commit
`c04ba9c` adds the unified platform chooser, platform routes and administrator
invitation controls. The same coordinator owns enrollment, jobs and
verification. MySQL persists identities, attempts and artifact metadata.
The browser, Electron Windows app and Kotlin Android app use worker protocol v2.
The Docker broker runs disposable language jobs on a trusted execution host.

| Boundary | Existing owner | Contract and dependency |
| --- | --- | --- |
| Invitation and consent | Coordinator network service and React enrollment | Invitation or network join token, platform choice, explicit consent, scoped enrollment, admin approval |
| Native package delivery | Coordinator distribution service | Verified manifest, platform compatibility check and installer digest, followed separately by native enrollment |
| Worker lifecycle | Coordinator WebSocket handlers and shared contracts | Authenticated registration, heartbeat, task attempt, verification, cancellation and reconnect |
| Job planning | Compiler packages and coordinator scheduler | Capability and network eligibility, persisted attempt lease, one authoritative job |
| Execution | Compiler services, orchestration client and Docker broker | Bounded requests, fixed language images, isolated filesystem, results and cancellation |
| Artifact publication | Coordinator and private object storage | Verified result, SHA-256, job authorization, SQL metadata and private object bytes |
| Public routing | Kubernetes coordinator and same-origin gateway with Vercel static origin | HTTPS/WSS at the gateway, coordinator-owned cookies and API, no session credentials forwarded to the static origin |

## Ordered implementation parts

| Part | Scope | Evidence and next gate |
| --- | --- | --- |
| 1. Audit and alignment | Repository inventory, contracts, agent ownership and dependency map | Reviewed the existing web, native, MySQL, compiler, execution, artifact and deployment paths. Keep this ledger current as tests establish more coverage. |
| 2. Invitation lifecycle | Admin generation, expiry, revoke, copy, three-platform chooser and usage limits | The existing chooser and one-time invitation inventory passed local browser and SQL fixture tests. Configurable limits and concurrent redemption passed with migration 0015. Invitation inventory pagination remains open. |
| 3. Platform onboarding | Separate web, Windows and Android flows, compatibility checks, download grants and verified packages | Browser consent uses the existing admission endpoint. Migration 0014 and guarded downloads passed the isolated MySQL integration with actual local packages. Browser platform signals can be spoofed and do not establish native identity. |
| 4. Native enrollment and releases | Windows installer, Android APK, secure storage, credentials, recovery and device evidence | Native acceptance covers the common protocol, physical API 25 and the API 37 emulator. Verify signed packages through the new guarded download flow and test clean installation. |
| 5. Toolchains and connector | Versioned GCC, Python and JDK images, provider abstraction, capabilities and health | The local Docker broker has three real language images and isolated execution tests. Immutable image selection and authenticated capability discovery passed locally. A provider contract with persisted job identity remains open. |
| 6. Kubernetes execution | Ephemeral Kubernetes Jobs, capacity, cancellation, leases and orphan reconciliation | Native broker overlay persists execution IDs, bounds admission and records separate scheduling and startup timings. Docker Desktop Kubernetes ran real C, Python and Java jobs, authenticated artifact downloads, UI cancellation and broker recovery. Separate kind verified node-loss cleanup and a fresh successful submission. Audit the remaining lifecycle and failure reporting gates before closure. |
| 7. Performance and scaling | Capacity-aware queues, provisioning telemetry, prewarm and measured scaling | The Docker broker bounds concurrency. Measure queue, provision and execution stages before selecting a safe prewarm or autoscaling policy. |
| 8. Project input and dependency analysis | Multi-file C, Python and Java, dependency validation and resource limits | The working compiler accepts single-source jobs, with distributed C function-level IR. Add project manifests and language-specific graph validation before introducing partition scheduling. |
| 9. Distributed reconstruction | Independent partitions, linking or packaging, verification and owned outputs | Existing result verification, bounded leases and object-backed artifacts are in place. Validate project reconstruction against trusted builds and verify retry under a worker interruption. |
| 10. OCI infrastructure | OKE capacity, registry, private networking, supported ingress, MySQL and backups | Manifests render offline. Cost and capacity need account confirmation. Validate arm64, supported ingress, and the execution RuntimeClass before deploying. The configured gVisor release returned ENOSYS for Landlock in a local fixture. See [OCI readiness](OCI_DECTA_READINESS.md). |
| 11. Vercel and public routing | Static frontend, authenticated HTTPS API, WSS and public domain | Local gateway routing and Vercel schema checks passed. Hosted login, WSS, downloads and reconnect need staging. |
| 12. Release engineering and security | Signed packages, image and secret scans, SBOM, CI and approval gates | Current CI verifies the workspace and Docker stack. Track scanner results, release signatures, registry digests and approval evidence before publication. |
| 13. System validation | Functional, failure, load, security, and deployment acceptance | Rerun all three platforms and C/Python/Java on the exact release. Prove external operation while the development PC is off, plus MySQL restore and node failure recovery. |

## Active implementation ownership

Docker Desktop stays installed on C: per the latest instruction. Its WSL
data disk is on K: under `1. SARVESH SIMATS PROJECT FILES/Docker/DockerDesktopWSL`. The Part 6 local runtime is Docker Desktop's runc
with the compiler's fail-closed filesystem and network policy. Section
18.3 of the master development directive treats gVisor and Kata as OCI
options. Part 10 must validate the selected OCI runtime and CNI before
staging. The local runtime evidence does not authorize public workloads.

- Two concurrently submitted Python Jobs used the same temporary filename. Each
  started with no marker and read only its own value after a delay.
  A third Job also started with no marker. Kubernetes removed all
  per-execution resources after the checks.
- Migration 0021 persists Job creation to PodScheduled and PodScheduled to
  runner start independently, retaining the existing provisioning total.
  Missing or inconsistent scheduling evidence leaves both new durations
  unavailable. Isolated fixture `06345b8d5cbeaaf2` reproduced the missing
  fields. Fixture `9e89dfed3f43bc23`, coordinator typecheck and frontend
  build passed. The local migration and three image rollouts completed.
  A real Python execution returned 42. Admin API and Edge showed 0 ms to
  schedule and 1,000 ms startup at Kubernetes timestamp resolution.
  Anonymous history access returned 401.

### Part 6 execution security and artifact transport

- Live authorization checks confirmed that the broker service account can
  manage execution Jobs, list runner Pods, read their logs and create input
  ConfigMaps in the execution namespace. It cannot exec into Pods, read
  Secrets, create application-namespace Jobs or patch deployments. A
  server-side dry run rejected a root Pod under restricted Pod Security.
- The local Kubernetes broker transferred and validated C ELF outputs
  of 4,013,576 and 7,966,216 bytes. An oversized source produced no
  executable and returned UNAVAILABLE. No per-execution resources remained.
- A broker restart after marking an execution successful can still lose
  the result before delivery to a caller. The result needs a bounded,
  durable receipt keyed to an execution request and its payload. Retain
  the receipt until a trusted caller has committed the verified result.

### Part 6 broker failure reporting

- Migration 0022 adds a nullable failure reason without changing existing
  execution states. The broker distinguishes provisioning, execution,
  result collection, deadline and cancellation failures. Cleanup pending
  is shown separately and preserves the original reason. Capacity rejection
  before admission remains a retry response.
- Isolated MySQL fixture `efc39371100d3b51`, coordinator typecheck, frontend
  build and both Docker builds passed. The initial fixture attempt timed out
  on the Docker engine check and did not reach the assertions.
- Applied migration 0022 in Docker Desktop Kubernetes and rolled out the
  broker, coordinator and frontend. A real C compile failure recorded
  EXECUTION_FAILED. A Python program returned its ZeroDivisionError
  diagnostic successfully, so the broker history had no transport failure.
  Edge and the admin API agreed. Anonymous history access returned 401.

### Part 6 durable broker receipts

- Migration 0023 adds opt-in request IDs and stores bounded, checksummed
  result chunks atomically with execution success. A repeated request
  with matching input can replay the receipt for five minutes. Reusing a
  key with different input is rejected. Delivery is capped at eight stored
  receipts, and reconciliation removes expired chunks.
- Isolated MySQL fixture `d46694e451dd3903` passed replay, pending and
  conflicting keys, expiry and cleanup. Coordinator typecheck, image build
  and 30 orchestration tests passed. Applied migration 0023 locally.
- A real keyed Python execution returned 42. Replaced the broker Pod and
  repeated the request. The output digest and execution history were
  identical, and no new Job or per-job resources remained. All eight
  Compose services were healthy.
- Production callers have yet to opt in with stable task/attempt IDs and
  acknowledge receipts after committing accepted results or artifacts.

- Added authenticated acknowledgement. It frees the receipt bytes and
  storage slot atomically and retains the key against duplicate execution.
  Isolated MySQL fixture `7c6fd15e670319c9` verified concurrent ACKs, expired
  and pending receipts, authorization, and reconciliation during cleanup.
  Coordinator typecheck and all 31 orchestration tests passed. Live
  Docker Desktop Kubernetes accepted two concurrent ACKs for a Python
  result, then returned 410 for replay without creating a new Job. No
  execution resources remained. Normal compiler and worker paths still
  need to invoke acknowledgement after their durable commit.

- Kubernetes compilation finalization now keys program execution by its
  persisted compilation job ID. Pending receipts defer publication to
  periodic recovery. The coordinator acknowledges validated results after
  committing the artifacts and report. A failed commit leaves the receipt
  readable until expiry. Docker Compose leaves receipt mode disabled.
- JAR packaging uses a fixed timestamp so a repeat compilation can produce
  identical request bytes. All 21 Java tests passed, including the new
  byte-for-byte regression. Nine targeted coordinator tests, typecheck and
  build passed. Eleven opt-in cases were skipped by that targeted run.
- On Docker Desktop Kubernetes, normal Python submission JOB-7Q2A2
  completed, printed 42 and delivered authenticated bytecode. MySQL showed
  the stable request ID, committed receipt marker, released receipt slot,
  and zero retained chunks. Worker compilation receipts and an end-to-end
  forced restart during normal finalization remain open.

- Cloud compiler workers now bind receipt IDs to the task, attempt and
  operation. After independent verification and artifact commit, the
  coordinator acknowledges the receipt for the accepted result from the
  enrolled cloud worker. Failed or rejected attempts leave receipts to expire.
  The native Kubernetes overlay enables the feature.
- Sixty targeted tests and typechecks for coordinator, worker, Windows
  worker and orchestration passed. On Docker Desktop Kubernetes, Python
  job JOB-NDKJG returned 42 and delivered authenticated bytecode. MySQL
  confirmed the accepted cloud attempt's receipt was acknowledged and
  its stored chunks removed. At that point C and Java worker rollouts and the forced
  restart during normal finalization still required live coverage.

- On 2026-11-16, the two receipt and finalization unit suites passed all
  four tests. The Docker Desktop data VHDX was detached and DiskPart
  compaction exited successfully. The VHDX remained 41,406,169,088 bytes,
  and D: remained at 10,317,824 bytes free. Docker remained stopped after
  earlier startup attempts stalled under disk pressure. The live C and
  Java worker receipt checks and the forced restart test were pending.

- Enrollment owns download grants, invitation revalidation and the platform download UI.
- Execution owns immutable toolchain selection and broker readiness.
- Deployment owns non-deploying CI verification and OCI release gates.
- The lead owns cross-component integration, object storage and release evidence.
- Work on the provider, project planner and hosted rollout follows the dependent gates above.

## Verified changes in this increment

- The S3-compatible artifact client accepts an explicit signing region through
  `OMNICOMPILE_ARTIFACT_REGION`. A local HTTP fixture verified that real signed
  requests use the configured region and reject an invalid region. All six
  artifact-storage tests passed.
- Existing evidence remains scoped to its recorded revision. No OCI tenancy,
  signed production installer, or Vercel staging deployment has been verified.

- Enrollment verification passed all 15 migrations, one-use and bounded
  multi-use invitations, concurrent redemption, duplicate-device prevention,
  partial revocation and admin-only history. Native download acceptance checked
  compatibility hints, short-lived grants, expiry, replay, revocation and
  actual installer digests against isolated MySQL.
- Broker tests passed authenticated image discovery and immutable digest
  configuration. The live administrator API reported the three actual Docker
  image IDs. The Docker rebuild passed, with all eight services healthy.
- The workspace gate passed type checking, builds, 403 Vitest cases and 31
  script tests. Eleven opt-in broker tests were skipped in this run.
- Non-deploying CI now renders and validates Kubernetes manifests with pinned
  tool and schema versions. Local strict validation accepted 18 objects
  including the separate migration Job. Hosted CI execution remains pending.

- The broker opt-in rerun passed all 12 cases in its test file, including the
  11 skipped by the default workspace gate. The rebuilt Docker compiler
  acceptance passed C, Python and Java and recorded 12 verified worker
  results. Its fixtures were removed.

### Kubernetes execution provider

- Migrations 0016 and 0017 persist execution identity, capacity reservations,
  terminal outcomes and pending cleanup. The private broker checks MySQL and
  Kubernetes API access for readiness. The execution namespace caps Job
  provisioning and denies workload network traffic.
- Isolated MySQL with a simulated Kubernetes API verified persisted IDs,
  two-slot admission, cancellation, failed deletion retry and expired work
  recovery. The administrator execution history and cancel action passed
  Edge verification using simulated Kubernetes responses. Edge also verified
  sign-in and the execution history view against the live Docker stack.
- The optional overlay renders 26 resources. CI now validates the base and the
  overlay. No cluster was modified. Next gate is disposable-cluster acceptance
  of the sandbox RuntimeClass, image pulls, real C/Python/Java Jobs, log
  transfer, and cleanup after broker and node interruption.

- Post-build Docker regressions passed C, Python and Java compilation and
  artifact delivery, with 12 verified worker results. Runtime checks passed
  cancellation, timeout, output limits and isolation, with zero remaining
  execution containers. All eight Compose services were healthy, and project
  MySQL was reachable on port 3307. The workspace gate passed 403 Vitest cases
  and 31 script tests, with 11 opt-in cases skipped by the default gate.

### Local Kubernetes acceptance attempt

- Created a disposable kind cluster with its own kubeconfig. The default
  Kubernetes v1.37.0 control plane failed to bootstrap. The digest-pinned
  v1.34.0 retry reached Ready and admitted the native overlay resources.
- The local fixture used a runc RuntimeClass, loopback frontend routing,
  and database-backed artifacts. It did not exercise gVisor, production
  ingress, or object storage. The project Docker database was separate.
- Loading the six existing Docker images into the kind node drove host C:
  free space below 1 GB. The kind cluster was deleted to stop the import.
  The import exited 137 after teardown. No compiler Job, browser acceptance,
  download, or broker/node failure recovery test ran on this cluster.
- All eight project Compose services remained healthy. Resume part 6 with
  adequate free space on the drive that holds Docker Desktop's Linux disk.
  First create the digest-pinned kind v1.34.0 cluster, then load images one at
  a time and verify each in the node before applying the overlay. Keep parts
  7–13 open at their documented gates. No cloud resources were deployed.

### Docker storage preflight for the Part 6 rerun

- The active WSL data VHDX on C: was 25,995,247,616 bytes and was not sparse.
  D: had 21,556,916,224 bytes free, a shortfall of 4,438,331,392 bytes
  before allowing space for kind and the toolchain images. Docker Desktop
  stayed running on C: with all eight Compose services healthy.
- Clearing the regenerable npm download cache increased C: free space by
  1,269,370,880 bytes at measurement. The expired local fixture password file
  was removed. Docker volumes and project data were preserved.
- Free capacity on D: for the current VHDX and the Kubernetes test workload.
  Then use Docker Desktop Settings, Resources, Advanced, Disk image location
  to move the disk. After Docker restarts, compare the container and volume
  inventory and check the project database and artifact endpoints before
  retrying the pinned kind test. Part 6 stays open and no cloud resources
  were deployed.

### Docker storage recheck

- D: still had 21,556,916,224 bytes free. Its large directories held
  user files, installed software, or development toolchains. The Android
  SDK temporary download directories contained no files.
- Removed the unused kind v1.37.0 test image (1.34 GB of Docker-reported
  image usage). Builder pruning reclaimed 0 bytes. The pinned v1.34.0
  test image, all three volumes, and the stopped general-purpose MYSQL
  container were preserved. All eight project services stayed healthy.
- Guest filesystem trim discarded 1,072,750,592 bytes, but the Windows
  VHDX remained 25,995,247,616 bytes. This did not close the D: capacity
  gap. The disk was not moved and the Part 6 runtime gate was not rerun.

### Docker relocation and real local Kubernetes retest

- Docker Desktop moved its WSL disks to D:/Docker/DockerDesktopWSL.
  The old data disk path on C: is absent. All nine container IDs and all three
  named volumes survived, including the stopped general-purpose MySQL
  container. Project MySQL row counts matched before and after relocation.
  Docker Desktop application files and Windows integration remain on C:.
- Docker compiler and execution regressions passed after the move, including
  12 verified worker results and zero remaining Docker job containers.
- On disposable kind v1.34.0, real C, Python and Java compilation Jobs ran
  successfully twice. The fixture used runc. The full Kubernetes Service DNS
  name resolved the frontend proxy login failure. Edge then verified admin
  login and persisted execution history against the live cluster.
- The broker now sends explicit JSON Content-Length, including for Kubernetes
  DELETE options. Old Pods and ConfigMaps from the first run were still
  present during inspection. The second run passed all three languages with
  the fix. Artifact and failure-recovery acceptance remain open. The browser
  artifact run hit the fixture origin check after a port-forward change.
  No cloud deployment was performed.

### Live Part 6 acceptance follow-up

- On the local kind v1.34 cluster, enrolled all three language workers,
  submitted jobs through the authenticated frontend origin, and downloaded
  nonempty C executable, Python bytecode and Java JAR artifacts.
- Edge cancelled a running Kubernetes execution through the administrator
  UI. MySQL retained CANCELLED with its slot released, and Kubernetes had
  no Job, Pod or input ConfigMap for that execution.
- Forced replacement of the broker Pod during a separate live execution.
  The replacement reached Ready. The interrupted execution persisted as
  CANCELLED with a released slot and no Kubernetes resources for its ID.
- Removed four orphaned Pods and their input ConfigMaps from earlier
  runs. The execution namespace then had zero execution-labeled resources.
  All eight project Docker Compose services were healthy.
- Local evidence covers broker failure on kind using runc and database-backed
  artifacts. It does not cover loss of a Kubernetes node, the production
  sandbox RuntimeClass, or deployed object storage. Those gates stay open.
  Docker data is on D:. The installed Docker Desktop application and Windows
  integration are still on C:. No cloud deployment was performed.

- On the single-node kind fixture, cordoned the node and stopped kubelet.
  The control plane reported the node Ready condition as Unknown. After
  restarting kubelet and uncordoning, the node returned to Ready, the
  broker was available, and a fresh Python compilation returned HTTP 200.
  This confirms service restoration. Cross-node recovery of an in-flight
  execution still needs a multi-node fixture.

### Kubernetes S3-compatible artifact verification

- Ran the three language cases again on local kind with a dedicated
  SeaweedFS S3 service, a fixture bucket, and newly generated credentials.
  Authenticated frontend-origin requests downloaded the C executable,
  Python bytecode, and Java JAR. MySQL recorded 15 object-backed artifacts
  and zero inline content bytes for those records. The execution namespace
  had no labeled Jobs, Pods or input ConfigMaps after completion.
- This fixture used disposable object storage. Persistent object-store
  recovery and production gVisor remain separate acceptance gates.
- All eight Docker Compose services were healthy. The supported Docker
  Desktop installer offers a custom application path, but relocating the
  existing all-users install requires elevation and a verified recovery
  copy of the WSL disk. The disk itself is already on D:.

- Repeated C, Python and Java compilation and authenticated artifact
  downloads after binding SeaweedFS to a 1 GiB ReadWriteOnce claim in kind.
  Replaced the storage Pod using a Recreate rollout and downloaded all
  three artifacts again through the same authenticated endpoints. The C
  executable, Python bytecode and Java JAR matched byte for byte. This
  validates Pod replacement on a retained local volume. Node-level storage
  failover and off-node backups remain separate checks.

- With the only kind node cordoned, a real Python Job was admitted but its
  Pod remained Pending. The broker returned HTTP 422 after the scheduling
  deadline, removed the Job, Pod, and input ConfigMap, and the node was
  uncordoned and confirmed Ready. This verifies cleanup when no eligible
  node can schedule the work.
- The non-sparse Docker data disk measured 28,142,731,264 bytes. Neither
  drive had enough free space for a full recovery copy on this host at
  preflight. The working Desktop application was kept installed on C:.

- Installed checksum-verified gVisor release-20261109.0 in the disposable
  kind node and tested the gvisor RuntimeClass through the real broker.
  The C runner never started. containerd reported a cgroup path error
  while creating the sandbox on the cgroup v1 Docker Desktop host
  (cannot set up cgroup for root relative to /kubelet.slice). The
  broker failed the request without returning an artifact. Restored the
  fixture's acceptance-runc setting. The repository overlay still
  specifies gvisor. Retry on a cgroup v2 local fixture and verify all
  three toolchains before closing the sandbox gate.

- Added a regression for the Kubernetes Job DeadlineExceeded condition.
  It reproduced a generic failure before the fix. The broker now persists
  TIMED_OUT, returns a deadline diagnostic, and releases the slot after
  cleanup. The isolated MySQL provider regression and coordinator type
  check passed. This test simulates the Kubernetes API response.

- Applied the deadline fix to the disposable kind broker and repeated the
  cordoned-node test against the real Kubernetes API. The request returned
  HTTP 422 with the execution-deadline diagnostic. MySQL recorded TIMED_OUT
  with a NULL slot, and the execution namespace contained no matching Job,
  Pod, or input ConfigMap. The node was uncordoned afterward.

- Enabled unified cgroup v2 in the host WSL configuration and restarted
  Docker Desktop. The engine reported cgroup version 2, and the existing
  kind node restarted on cgroup2fs. All eight Compose services were healthy.
- With gVisor enabled on the fixture, the real C Job's sandbox and runner
  started. The compiler child failed closed. A direct probe in the same
  RuntimeClass confirmed the compiler wrapper's Landlock syscall returned
  Function not implemented. Restored the fixture to acceptance-runc and
  kept the repository's gVisor configuration and Landlock wrapper intact.
  The gVisor compiler gate requires a compatible isolation design or runtime.

- Re-ran the Docker execution suite after the cgroup v2 switch. C, Python
  and Java runtime checks, cancellation, timeouts and isolation passed,
  with zero remaining job containers. Added an explicit diagnostic for
  exit 126 from the configured filesystem wrapper. The wrapper continues
  to fail closed. Orchestration type checks and all 15 targeted process
  and broker tests passed.

- Joined a second worker to the disposable kind cluster, loaded the pinned
  Python image on it, and cordoned the control-plane node for scheduling.
  The broker on the control plane completed a Python runtime Job on the
  worker over the real Kubernetes API (HTTP 200). The control plane was
  uncordoned and both nodes returned Ready. The intended in-flight stop
  command was rejected before execution, so cross-node loss recovery
  remains unverified.

- Stopped the disposable second worker after observing a Running Python
  execution Pod assigned to it. The in-flight request returned HTTP 422
  without a result and persisted TIMED_OUT. A fresh submission on the
  surviving node returned the expected stdout (42) and persisted SUCCEEDED.
  After the worker restarted and became Ready, Kubernetes removed the
  original Job and Pod. Both SQL slots were released and no execution
  resources remained. This validates a fresh submission after node loss.

- Ran the documented Landlock preflight on the same cgroup v2 kind node
  using the same digest-pinned C image and restricted Pod settings.
  The runc Pod succeeded. The gVisor Pod failed with "Function not
  implemented" from Landlock. Both probe Pods were removed. This isolates
  the remaining compatibility issue to the selected runtime environment.

- Added the Docker Desktop Kubernetes overlay over the existing native
  manifests and rendered it locally. It uses loopback access, local runc,
  and a separate MySQL claim. The native overlay remains the cloud
  preparation path. The installed Desktop CLI reported Kubernetes
  disabled, so deployment on the managed context is pending activation.

- Docker Desktop kind v1.36.1 reached Running with a Ready control-plane
  node. Applied the desktop overlay on the docker-desktop context and
  confirmed the separate 1 GiB MySQL claim bound. The frontend, C and
  Python Pods reached Ready. Host D: free space fell below 400 MB during
  image imports. Scaled the initializing coordinator, broker, Java worker
  and MySQL to zero to protect the Docker data disk. The migration and
  managed-cluster acceptance remain pending. All eight Compose services
  stayed healthy. No cloud deployment occurred.

- D: subsequently fell to 23,220,224 bytes free. Docker engine calls
  stalled and the managed Kubernetes API timed out. A graceful Docker
  Desktop stop timed out after 60 seconds and left Desktop reporting
  stopping. Preserve the WSL disk and persistent volumes. Once host
  space is available, recover the engine, check Compose and the managed
  context, and resume the scaled-down workloads and database migration.

- After the user freed space, D: had 6,049,480,704 bytes available.
  Docker Desktop startup still timed out listing WSL distributions, and
  wsl --shutdown did not return during observation. A Windows restart
  is pending. After restart, check docker info and docker volume ls
  before starting workloads. Verify Compose with docker compose ps
  and the managed node with kubectl --context docker-desktop get nodes.
  Resume MySQL first, run the migration Job, then resume the coordinator,
  broker and Java deployment. Keep the existing Docker disk and PVCs.

- Windows restarted and Docker recovered from the WSL stall. The project
  MySQL and artifact volumes are present, and all eight Compose services
  are healthy. Docker Desktop Kubernetes reports its node Ready. The
  Kubernetes MySQL image's mysqld --version probe exited 139, while the
  Compose binary reported MySQL 8.4.13. Scaled the Kubernetes database
  back down with its claim retained. The migration still needs a working
  Kubernetes MySQL process.
- Updated user Android SDK and MinGW paths and Android Studio's SDK
  settings for the relocation to C:. ADB 37.0.1 ran from the new path.
  The SDK's build-tools and command-line tools directories were absent.
  All 13 C code-generation tests passed with the relocated GCC and its
  bin directory on PATH. Machine PATH still needs an elevated update.

- Compared the managed Kubernetes MySQL probe with a fresh Compose-engine
  container using the same OCI image digest. The MySQL binary SHA-256
  matched. The fresh Docker container returned the version successfully;
  the Kubernetes Pod reported exit 135 from ldd and did not start MySQL.
  This narrows the problem to the managed node environment or its unpacked
  image dependencies. Removed the probes and retained the database claim.

- Compared SHA-256 hashes for all 75 libraries resolved by the working
  Docker MySQL image. The Kubernetes probe read the same bytes. On the
  managed node, the MySQL binary still exited 139 after copying it to
  /tmp, and direct invocation through the loader exited 135 even with
  the loader cache disabled. The probes did not mount the MySQL claim.
  These checks found no byte mismatch in the executable or its linked
  libraries. The managed-node startup failure remains open.

- On Docker Desktop Kubernetes, the MySQL 8.4.13 binary failed even
  with its linked libraries copied to writable storage. The standalone
  kind fixture ran that version successfully. MySQL 8.4.9 passed a
  no-volume probe on Docker Desktop. A read-only inventory confirmed
  the managed PVC was empty before switching the local overlay to the
  verified 8.4.9 digest. MySQL then became Ready on the same claim and
  the recovery migration Job completed. Coordinator, broker, and Java
  rollouts completed. Compose and native cloud manifests still use
  their existing image versions. The Desktop compiler flow is next.

- On Docker Desktop's managed cluster, enrolled the C, Python and Java
  workers, then compiled all three languages and downloaded nonempty
  artifacts through authenticated browser-origin requests. Repeated
  the three-language check after mounting the current broker source
  because the available coordinator image predated the DELETE framing
  fix. Removed seven older orphaned runner Pods and input ConfigMaps.
- The managed Edge administrator UI cancelled a live Python execution.
  The broker returned a non-success response and persisted CANCELLED.
  The execution namespace had no labeled resources after the repeated
  compiler and cancellation checks. A rebuilt broker image and a managed
  cluster recovery rerun remain open.

- Rebuilt the coordinator image from the repository and rolled out the
  managed broker using omnicompile-coordinator:desktop-27547b8. Verified
  the deadline fix was present inside the image, removed the temporary
  source mount and deleted its ConfigMap. Replaced the broker Pod during
  a Running Python execution. The replacement became Ready, MySQL
  recorded CANCELLED and released the slot, and the Job, Pod, and input
  ConfigMap were gone. Compose services remained healthy.

- Repeated authenticated C, Python and Java downloads on the managed
  cluster with the rebuilt broker image and without a source mount.
  The executable, bytecode, and JAR were all nonempty. The execution
  namespace had no labeled Jobs, Pods or input ConfigMaps after the run.

- Repeated live Python cancellation from the Edge administrator UI against
  the packaged broker. The original request returned a non-success status.
  MySQL recorded CANCELLED with a NULL slot for execution
  a22caf7f-348d-4dcc-b4b0-249c0049ced7. No labeled Jobs, Pods, ConfigMaps,
  or NetworkPolicies remained. All eight Docker Compose services were healthy.

- Repeated the Docker compiler regression in disposable fixture 903b7f22651b9593.
  Four valid submissions produced native C executables, Python bytecode and a
  Java JAR. Two concurrent jobs and 12 verification outcomes were verified.
  Invalid sources failed, the secret-read probe was denied, and the fixture
  reported no developer-data changes. The fixture containers were removed.
  With the relocated MinGW bin directory on PATH, npm run verify passed
  403 Vitest tests, 31 Node tests and the workspace build. Eleven opt-in
  Vitest tests were skipped by this command.

- Compacted the detached Docker WSL data disk with Windows DiskPart. The
  VHDX fell from 37,623,955,456 to 31,930,187,776 bytes, returning 5.30 GiB
  to D: before startup. Docker Desktop restarted with all eight Compose
  services healthy and all six local Kubernetes deployments Available.
  The same MySQL PVC remained bound and retained the known CANCELLED
  execution with its slot released. No compiler execution resources remained.

- After compaction, Verify-Compose.mjs passed against MySQL 8.4.13 on port
  3307. The fixture marker survived a project MySQL restart and the admin
  identity and password hash were unchanged. The check also passed service
  DNS, coordinator readiness, liveness, the frontend API proxy, and SPA
  routing. The separate MYSQL instance was outside the verification scope.

- After the disk compaction and restart, reran authenticated execution
  through the packaged broker on Docker Desktop Kubernetes. The C
  executable and Python program each printed 42. The Java compile Job
  returned a runnable JAR, and a separate execution Job printed 42.
  No execution Jobs, Pods, ConfigMaps, or NetworkPolicies remained.

- Reran Verify-Docker-Execution.mjs after the disk move and compaction.
  All ten checks passed, including real C/Python/Java execution, expected
  runtime failure, timeout, output limits, cancellation, and the configured
  filesystem, identity, environment and network restrictions. The verifier
  reported no database modifications and no remaining runner containers.

- Checked the upstream runtime before attempting another gVisor rollout.
  The installed runsc matches the latest upstream release, release-20261109.0.
  The guest Landlock implementation is still open and unmerged in
  [gVisor PR 15222](https://github.com/google/gvisor/pull/15222).
  The next runtime check is the restricted compiler-wrapper probe on a
  published release that includes guest Landlock enforcement.

- Enabled OMNICOMPILE_SANDBOX_TEST against the packaged broker on Docker
  Desktop Kubernetes. Eleven of twelve tests passed. The isolation case
  failed, and an independent repeat returned "network allowed" after
  passing its non-root and filesystem assertions. The Desktop kindnet
  cluster did not enforce the runner's expected egress restriction in
  this test. Treat this overlay as trusted-local-only until egress
  denial passes on the actual runner. No execution resources remained.

- Added a fail-closed seccomp filter to the compiler launcher to deny socket
  creation, connect, and io_uring setup independently of NetworkPolicy.
  Built all three worker images. The packaged Python launcher returned EPERM
  and the Docker execution suite passed all ten checks. The Desktop cluster
  attempt with the new image digests hit its Job deadline before returning
  a probe result. Restored the known working local digest configuration.
  Kubernetes verification of the hardened images remains open.

- Pulled the three hardened toolchain images into the Docker Desktop kind
  node under unique local tags, checked the resulting image IDs, then set
  the broker ConfigMap to those immutable digests. This avoided the node's
  stale local tag and the prior Job provisioning deadline. The rebuilt
  Python launcher denied socket creation with EPERM inside a local Pod.
  Through the packaged broker, the full opt-in sandbox file passed 12/12,
  including the runner's non-root, filesystem and network checks. No
  execution Jobs, Pods, ConfigMaps or NetworkPolicies remained. This was
  verified on the Desktop runc RuntimeClass. The gVisor gate remains open.

- Recreated only the three Docker Compose language workers after confirming
  no broker runner was active. Verified their running image IDs match the
  hardened C, Python and Java build digests. All eight Compose services,
  including the Java worker, reported healthy after the update.

- The isolated Compose compiler regression passed after the hardened worker
  rollout (fixture f1d1a2cd33197506). Four valid submissions completed
  across C, Python and Java with executable, bytecode and JAR artifacts.
  The invalid inputs and forbidden reads failed as expected. The report
  confirmed two concurrent jobs, 12 verified results and no developer-data
  changes. Verified the fixture containers were removed.

- Tested Kata Containers 4.3.1 with QEMU as an alternative VM-backed
  runtime in the disposable kind fixture. KVM API 12 created a VM
  descriptor, but the Kata Pod failed before guest startup because the
  Docker Desktop WSL kernel exposes neither /dev/vhost-vsock nor its
  module. Removed the probe, RuntimeClass and temporary runtime files
  and restored the fixture's containerd configuration. No compiler
  acceptance is claimed for Kata.

### Part 7 initial local timing baseline

- Queried existing successful broker records on Docker Desktop Kubernetes.
  Creation-to-completion elapsed time for execute requests was 6,700 ms
  mean for C (10 samples, 4,669–9,762 ms), 9,536 ms for Python (19 samples,
  4,661–26,195 ms), and 4,634 ms for Java (6 samples, 3,182–5,629 ms).
  These historical samples mix acceptance runs and image revisions.
  Java execution used a prebuilt JAR. Java task requests measured
  16,781 ms mean (8 samples, 7,768–56,775 ms).
- The current schema records creation and completion. It cannot separate
  queueing, provisioning, and toolchain execution from these timestamps.
  Use explicit stage timestamps and a controlled workload before sizing
  capacity or judging prewarming. This baseline does not close Part 6 or 7.

- Added nullable runner lifetime to Kubernetes execution history and
  the administrator view. Successful jobs measure the runner container's
  start-to-termination interval using Kubernetes timestamps. Historical rows
  and jobs without those timestamps have no duration. Workspace typecheck
  and the provider integration against isolated MySQL passed. The test
  verified that a three-second runner interval survives provider recreation.
  Live rollout and separate provisioning and queue measurements remain open.

- Rolled migration 0018 out with a dedicated Job on Docker Desktop
  Kubernetes and rebuilt the broker, coordinator and frontend images.
  A live Python execution returned stdout 42 and persisted a 3,000 ms
  runner lifetime. The first Edge check found that the coordinator
  response schema stripped the timing field. Extended the schema and
  verified the same record in the authenticated admin API and UI after
  coordinator rollout. Anonymous access returned 401. No runner
  resources remained, and all eight Compose services stayed healthy.

- Added nullable Kubernetes provisioning duration (Job creation to runner
  start) to the broker, admin response and execution history display.
  Migration 0019 preserves existing records. The isolated MySQL provider test
  verified 2,000 ms of provisioning independently of 3,000 ms of runner
  lifetime. Workspace typecheck passed. Live rollout and queue instrumentation
  remain open.

- Applied migration 0019 with a dedicated Job and rolled out the rebuilt broker,
  coordinator and frontend on Docker Desktop Kubernetes. A live Python job
  printed 42. The broker, authenticated admin API and Edge UI agreed on a
  3,000 ms provisioning interval and a 7,000 ms runner lifetime for the same
  execution. Anonymous history access returned 401. The runner resources
  were cleaned up. Capacity retry wait remains open.

### 2026-11-15 capacity retry timing and local regression

- Added nullable `capacityRetryWaitMs` through the authenticated executor client,
  migration 0020, broker history, coordinator schema and administrator UI. It
  measures client-observed first-429-to-admitted-request-dispatch time with a
  monotonic clock. Initial instrumented requests report zero; legacy callers and
  invalid values remain unknown. Values are bounded to 125,000 ms and do not
  control admission or represent an authoritative broker queue.
- Focused client and isolated MySQL provider tests passed, including persistence
  and invalid header handling (fixture `3e8f34590d089545`). Workspace typechecks,
  coordinator/web builds and both Docker image builds passed. The first full
  unit run exposed a profiler test that assumed an unconfigured GCC path. Its
  fixture now explicitly tests configured C/Python paths. The rerun passed 404
  tests with 11 opt-in skips across 68 files.
- Applied migration 0020 through a dedicated local Kubernetes Job and rolled
  out coordinator, broker and frontend images tagged `desktop-capacity-0020`.
  Three real Python requests returned 41, 42 and 43. Two recorded zero retry
  wait; execution `eb4ccdcb-966d-4cac-851c-af0cc6ae00c0` recorded 20,659 ms of
  retry wait, 2,000 ms provisioning and 7,000 ms runner lifetime. Authenticated
  API and Edge admin UI agreed. Anonymous history access returned 401. No
  execution Jobs, Pods or per-job configuration/policies remained.
- Docker execution regression passed all ten checks, including C/Python/Java,
  expected runtime failure, timeout, output limits, cancellation and isolation.
  It reported no database modifications and no remaining runner containers.
- Rechecked upstream gVisor: release-20261109.0 remains latest and guest
  Landlock PR 15222 remains open/unmerged. Part 6 stays open at that gate.
  Docker data remains on D; application binary relocation still needs a safe
  preservation path. No cloud deployment occurred. Part 7 still needs workload
  sizing, capacity policy and prewarm/scaling acceptance.
- Final inspection found the existing Compose containers stopped after the
  earlier regression. Restarted the same eight containers and verified healthy
  status, including Java and coordinator. Kubernetes retained six available
  deployments. Temporary fixture evidence cleanup was blocked by tool policy;
  the ignored evidence directory is not included in the commit.

### Kubernetes runner status verification

- The broker keeps an execution in PROVISIONING until the Kubernetes Pod
  owned by its Job reports a runner start timestamp. An unrelated Pod
  cannot advance the state. Cancellation still works while provisioning.
- Isolated MySQL fixture `c4b32fdf305a4a02` reproduced the premature RUNNING
  state. Fixture `cb6bc817d0b6ad3d` passed after the fix, including
  cancellation and deadline handling while waiting. Coordinator typecheck
  and both transport tests passed, including cancellation during a capacity
  retry without another submission.
- Restarted Docker Desktop and rolled out the rebuilt broker on the existing
  local cluster. The MySQL claim remained bound. Real C and Python executions
  and compilation and execution of a Java JAR each returned 42. No execution
  Jobs or Pods remained, and all eight Compose services reported healthy.
  The gVisor and Docker application relocation gates remain open.
- On the rebuilt broker, signed in through Edge and cancelled a real Python
  execution while the admin history showed PROVISIONING. The cancel endpoint
  returned 202, Edge displayed CANCELLED, and MySQL confirmed the cancelled
  execution no longer held an admission slot. A fresh Python job returned 42.
  The execution namespace held only its baseline ConfigMap and NetworkPolicy
  after cleanup, and all six Kubernetes deployments were ready.
- Repeated the three-language compilation and download flow via the local
  frontend with a dedicated acceptance account on the rebuilt broker.
  All three programs printed 42. Authenticated downloads returned a
  15,960-byte C ELF executable (JOB-IMEJV), 139-byte Python bytecode
  (JOB-0BPAW), and 669-byte Java JAR (JOB-VTL5L). Anonymous download attempts
  returned 401. The account and job records are retained only in local MySQL.
  No per-execution resources remained, the MySQL claim was bound, and all
  eight Compose services were healthy.

### Broker replacement on the runner-status build

- Replaced the local broker Pod after observing the owned Python runner in
  Kubernetes Running state. The interrupted request failed and MySQL recorded
  execution `e50b02ce-8202-4afb-89bb-5cc7be79e5b6` as CANCELLED with a released
  slot. The replacement became Ready and a new Python execution returned 42.
  No per-execution Jobs, Pods, ConfigMaps or policies remained. All eight
  Compose services reported healthy.

### Job status polling

- After observing the owned runner start, the broker follows Job status and
  reads the Pod again on success to collect final timings and output. The
  regression test reproduced two unnecessary Pod lists before the change
  (fixture `d77fd44c16a8abd0`). After the change, isolated MySQL fixture
  `ca027b21a10ca0cc` passed with zero Pod lists during those same active
  polls. It also verified final runner timing, cancellation and cleanup.
- Coordinator typecheck and image build passed. Rolled out the broker image
  `desktop-job-poll` to Docker Desktop Kubernetes. Real C, Python and Java
  jobs returned 42 and persisted runner lifetimes of 3,000, 5,000 and
  1,000 ms respectively. Per-job resources were removed. All eight Compose
  services were healthy.

### Controlled two-slot capacity baseline

- On `desktop-job-poll`, ran four sequential and four simultaneously
  submitted Python jobs with identical two-second sleeps. All printed 42.
  The sequential batch took 26,736 ms and the concurrent batch took
  20,365 ms. Individual client latencies were 6,214–7,117 ms sequentially
  and 8,266–20,363 ms concurrently.
- All sequential jobs reported zero capacity retry wait. The concurrent
  batch reported 0, 2,316, 12,311 and 12,261 ms in admission order.
  Provisioning measured 0–2,000 ms and runner lifetime 2,000–3,000 ms
  across the eight jobs, using whole-second Kubernetes timestamps.
  This single-node run shows a batch throughput versus per-job latency
  tradeoff for this workload. It does not establish a scaling policy.
- The first attempt lost its interactive Kubernetes exec stream and did
  not produce samples. The successful rerun used noninteractive exec.
- Replaced fixed 250 ms retries with jittered delays of 250–499 ms,
  500–999 ms and then 1,000–1,999 ms while keeping the 125-second deadline
  and cancellation. The regression reproduced fixed retries before the
  change. All 30 orchestration tests and the workspace package typecheck
  passed. The rebuilt local coordinator admitted four simultaneous
  Python jobs through the two-slot broker and all returned 42. Two
  reported zero capacity wait and two reported 9,318 and 10,026 ms.
- The admin task inspector now shows elapsed time from task creation to
  the first worker assignment. It uses persisted task and attempt timestamps,
  stays unavailable before assignment, and is separate from broker retry wait.
  Isolated fixture `4c5fcb21e4da57c8` reproduced the missing API field.
  Fixture `d19be1348b83a4e4` passed for assigned and queued tasks, plus
  cancellation. Coordinator typecheck and the frontend build passed.
  In Edge on Docker Desktop, the admin API and task inspector agreed on
  21 ms for a previously assigned task, and anonymous access returned 401.
- The broker now confirms Job removal after requesting foreground deletion.
  MySQL releases the admission slot immediately if the Job is gone and keeps
  it reserved while Kubernetes is still terminating it. Isolated fixture
  `728909fca39e6bf1` reproduced an unnecessarily retained slot.
  Fixture `90188fb3ba7b1a40` passed both deletion paths and the existing
  deadline, cancellation and recovery checks. Typecheck and image build
  passed. On local broker image `desktop-slot-release`, a real Python job
  returned 42, persisted SUCCEEDED with a released slot, and left no
  per-job resources.

### Local execution regression after slot reclamation

- The current Kubernetes broker passed real C, Python and Java execution from
  the coordinator Pod. It also returned the expected timeout, bounded
  output, and ZeroDivisionError diagnostic. The runner used UID 1000 and
  the submitted program did not receive the database password variable.
  These in-cluster checks covered a subset of the opt-in suite. The host-side
  command to copy a broker credential to a temporary file was blocked before
  it ran. The in-cluster checks used the existing credential mount.
- The Compose broker passed all ten checks in
  `infra/docker/verification/Verify-Docker-Execution.mjs`, including
  cancellation, network and filesystem isolation, and output integrity.
  The verifier reported zero remaining runner containers and no database
  modifications.

### Repeatable local RuntimeClass preflight

- Added a loopback-only preflight that runs the compiler wrapper in a
  restricted Job with each digest-pinned toolchain image. All three passed
  on Docker Desktop's runc RuntimeClass. An absent gVisor RuntimeClass
  failed before creating a probe. No probe Jobs or Pods remained, and
  all eight Compose services stayed healthy. Production gVisor acceptance
  still requires compatible guest Landlock support and the full suite.

### 2026-11-18 local storage and cluster recovery

- Both original and working VHDX copies on K: passed SHA-256 comparison.
- Docker Desktop uses the original relocated K: directory; eight Compose services passed health inspection.
- The managed Kubernetes API server lacked its serving certificate. Regenerated only that certificate with the retained cluster CA and existing kubeadm configuration, then restarted kubelet. The local node returned Ready and all seven application Pods became ready.
- Built the Java receipt derivative and imported both C and Java receipt images into the managed node. Both worker Deployments completed rollout. At that point live receipt and finalization recovery acceptance were pending.
- Hardened Docker execution regression passed all ten checks, including real C/Python/Java, expected runtime failure, timeout, output ceiling, cancellation and isolation. It reported no SQL changes and zero remaining execution containers.
- Live C JOB-ONSTR accepted C_COMPILE attempt 1 and Java JOB-FY78B accepted JAVA_COMPILE attempt 1 after enabling the manifest-intended worker receipt flag. All ten authenticated downloads matched metadata sizes; native downloads rejected anonymous requests with 401. Both worker compilation receipts and both program receipts retained their SUCCEEDED request records and had NULL receipt slots/digests/bytes and zero chunks before expiry. C printed C_RECEIPT_OK and Java printed JAVA_RECEIPT_OK. Coordinator interruption during normal finalization remains open.

- Normal finalization recovery passed for JOB-J79A0. Its broker execution 72e1989f-5029-43ab-9b3c-2f42b5f29644 held a completed receipt with one chunk and zero published artifacts while the test held only its job row. After replacing only the coordinator Pod and releasing the row lock, the same execution completed the job and delivered its authorized ELF. Receipt fields became NULL and chunks zero before expiry. Tests created new uniquely named user records; existing records were preserved.

### 2026-11-18 bounded capacity probe

- Added an explicit local opt-in capacity probe with bounded logical concurrency (1-8) and repetitions (1-10), deterministic C/Python/Java output checks, sequential/concurrent throughput and actual execution durations. Java compilation round trip is reported separately. Missing CPU/RAM and broker stage measurements remain unavailable.
- Independent review found reflected stdout/error fields could leak sensitive broker content. The regression reproduced that issue; unexpected stdout is now suppressed and error fields constrained. All eight targeted tests passed and scoped re-review approved.
- Live capacity execution did not run: automatic approval rejected broker credential retrieval into a temporary file with the message blocked by policy. Part 7 remains open for real capacity, saturation/cancellation, resource and prewarm/scaling acceptance. All eight Compose services and seven Kubernetes application Pods passed health checks.

### 2026-11-18 user-executed local capacity evidence

- The operator ran the committed probe against the local Kubernetes broker at concurrency 3 and repeat 2. The supplied PowerShell transcript reports measuredAt 2026-11-18T05:04:55.902Z. Parsed all 12 samples: expected output, exit code zero, no failures.
- Six sequential workloads took 67,992.8472 ms (0.088245 successful workloads/s; mean 11,331.8227 ms). Six concurrent workloads took 52,727.9800 ms (0.113792 workloads/s; mean 20,464.2098 ms). Throughput improved about 28.95 percent on this sample while individual latency increased. This is a single mixed-language sample and does not establish a universal concurrency policy.
- Post-run inspection found no labeled execution Jobs, Pods, ConfigMaps or NetworkPolicies; all eight Compose services remained healthy. Saturation/cancellation, actual resource readings, and prewarm/scaling acceptance remain open.

### Opt-in capacity rejection and cancellation probe

- Added --saturation to observe only a uniquely marked contender request. It requires two real matching HTTP 429 responses while the two bounded Python blocker requests remain pending, then checks client cancellation and both expected outputs. Missing evidence returns inconclusive and a nonzero CLI exit. It does not assert server-side cancellation or broker slot ownership.
- Review found overlapping exported probes could corrupt fetch restoration. A synchronous active-probe guard and regression close that issue. All 13 focused tests passed; scoped re-review approved the intended Node CLI.
- Live saturation remains unverified. Kubelet node statistics are available through the authenticated node proxy despite metrics-server being absent. All eight Compose services remain healthy and no labeled runner Jobs/Pods remain.

- Full workspace verification after the saturation change exited zero: typechecks and builds passed, Vitest 412 passed with 11 opt-in skips across 71 files, Node tests 44/44 passed. These are offline regressions and do not establish live saturation or prewarm behavior.

### Optional kubelet resource sampling

- Added --kubernetes-stats to sample real node-wide CPU nanocores and memory working-set bytes plus container readings restricted to omnicompile-execution. Node peaks are explicitly labeled; unavailable measurements remain NULL with valid/error counts. Samples retain source timestamp precision and reject impossible dates/times.
- Kubectl reads have timeout/output bounds and run serially, with phase cleanup and failure isolation. Phase timing excludes draining an already-started resource read. Independent review approved after timestamp fixes; all 19 focused tests passed.
- The actual local kubelet endpoint was inspected successfully; workload-correlated sampling and live saturation remain pending, along with prewarm/scaling policy acceptance.

### Actual admission capacity in administration

- The existing authenticated executions response now includes busy/limit from active Docker requests or all non-NULL Kubernetes SQL slots, including pending cleanup. One fixed limit drives admission and validation. Missing legacy readings remain unavailable and database failures return sanitized 503 responses.
- The existing toolchain view refreshes capacity immediately and every ten seconds while visible, prevents overlapping reads and removes timers/listeners on unmount. Eleven focused broker/UI tests and workspace typechecks passed. Independent review found no blocking defects; a failed cancellation temporarily hides the last reading until the next successful poll.
- Added assertions to the existing isolated SQL provider verifier for idle/full/cleanup-held occupancy and unauthorized access. Those fixture assertions have not yet run; live rollout and rendered UI verification of the new field remain pending.

- Resumption reran the 11 focused broker/UI tests and coordinator/web typechecks successfully. The interrupted three-job resource report was not present, so no completion is asserted. A fresh Docker container-list call returned HTTP 500; service health requires recovery and revalidation before live acceptance.

### Post-reboot Docker recovery

- Restarted existing Compose services using existing images and persistent volumes. Compose wait completed successfully and all eight services reported healthy.
- Managed desktop-control-plane is dead/marked for removal; start is refused and read-only docker cp fails with RWLayer unexpectedly nil. The retained /var volume contains the etcd database (16,801,792 bytes), local-path storage and kubelet PKI. A read-only helper inspected existence only. No persistent volumes or dead node were removed.
- Cluster control-plane filesystem recovery is unresolved. Existing K: verified disk copy remains available. Local Kubernetes acceptance and live capacity rollout remain blocked; no cloud action occurred.

### Live Compose capacity rollout and cancellation

- Built and rolled out coordinator, executor and frontend images successfully. All eight services became healthy. Frontend returned HTTP 200, anonymous admin executions returned 401, and authenticated private broker capacity returned busy 0 / limit 2.
- Ran the committed probe inside the Compose executor with its existing mounted credential, without exporting the credential. At 2026-11-18T12:00:47.599Z all six baseline C/Python/Java workloads passed. Sequential batch was 50,956.38003 ms and concurrent batch 14,241.235105 ms. These are Docker-specific single-run measurements with cold/warm ordering and do not establish a universal speedup.
- Live saturation passed: observed two matching HTTP 429 responses and client AbortError cancellation (388.294 ms); both bounded Python blockers completed expected output (7,605.265 and 7,630.292 ms end-to-end). This proves client retry/cancellation, not server-side cancellation of an admitted job. No matching temporary job containers remained and all eight services stayed healthy. Kubernetes and prewarm/scaling acceptance remain open.

### Prewarmed runner handoff prerequisite

- Added internal --prewarmed language pod-id mode to the existing compiler-job entry point. It waits up to 60 seconds on fixed projected chunk paths and a strict commit envelope, validates bounded byte count/digest/pod/language/job schema, then invokes the existing runner once. Default stdin behavior remains covered.
- Independent review identified payload text leakage in parse errors and cancellation during readiness cleanup. Regression tests reproduced both; fixed messages and post-cleanup abort checks passed scoped re-review.
- Focused suites passed 29 tests; one AtomicWriter-style symlink test skipped because Windows denied symlink creation. Coordinator typecheck/build and diff checks passed. Automatic approval rejected the live restricted Docker fixture command with blocked by policy, so live CLI dispatch is unverified.
- This is the connected runner prerequisite only. Durable pool claims, Pod provisioning/reconciliation, resource-aware scaling, and live pool acceptance remain incomplete. No runtime feature was enabled or deployed.

- Headless Edge verified actual Compose admin login and rendered capacity on /admin: 0 / 2 busy, 2 available. The authenticated /api/admin/executions response agreed with HTTP 200 and busy 0 / limit 2. The first browser probe incorrectly navigated to the public root; correcting its route resolved that probe without application changes.

- Live Docker occupancy test observed busy 0 -> 2 -> 0 while two bounded Python requests executed. Both returned SUCCEEDED with stdout 42 and capacity retained limit 2. The verification used the executor's existing in-container credential and did not export it.

### Opt-in durable prewarm pool implementation

- Added migration 0024 and provider-integrated pristine bare-Pod provisioning, unique durable claims, immutable input commit publication, UID-bound cleanup, expiry/orphan reconciliation and disabled draining. Default cold execution remains the configured path. The active execution limit remains two.
- Review-driven fixes cover warm input lifetime, ambiguous claim lease retention, drain permissions, bounded ConfigMap pagination including empty continued pages, and paginated orphan inventories. Warm container lifetime is not reported as execution time. Native enable/drain overlays render; documentation scopes them to matching native environments and calls out the separate Desktop composition requirement.
- Final focused verification passed 42 tests with one Windows symlink skip; coordinator typecheck passed. Isolated fixture 20587cb7219b0387 exited zero using real MySQL and simulated Kubernetes, covering concurrency, ambiguous commit and disabled drain. No project DB was reset.
- Live Kubernetes pool acceptance, Desktop-specific pool composition, resource-aware autoscaling and end-to-end pool timing remain incomplete. Managed cluster filesystem recovery still needs the administrator disk inspection. The pool has not been enabled or deployed.

### Desktop prewarm composition and continuous validation

- Shared the existing pool patches through one Kustomize component, adding Desktop-specific enable/drain overlays that retain runc, development origins, absent Ingress and pinned MySQL with 1Gi storage. Native rendered warm/drain output stayed byte-identical.
- Persisted three machine regression tests comparing full rendered resources with only expected quota/RBAC/flag differences; all passed with actual Docker Desktop kubectl. All seven overlays rendered. CI now validates all seven and runs the regression with its checksum-verified tool. Workflow YAML and Bash syntax checks passed locally; GitHub execution remains unverified.
- Full unit regression after pool integration passed 448 tests with 12 skips across 74 files. Additional workspace typechecks passed; a separately started verify run remained active without a final result and is not counted as complete.
- These are non-deploying configuration changes. Local cluster recovery, live prewarm acceptance, actual resource-correlated pool measurements and resource-aware autoscaling remain incomplete.

- The previously pending full verify session completed with exit 0: workspace typechecks/builds passed, Vitest 448 passed with 12 skips across 74 files, and Node script tests 50/50 passed. This evidence precedes the optional demand-policy changes. All eight Compose services remained healthy on reinspection.

### Demand-based, quota-bounded prewarm policy

- Added opt-in demand policy using persisted executions from the preceding five minutes and active reservations. Standard overlays still disable prewarming; existing enabled deployments without the policy retain fixed targets. New enable/drain overlays select demand mode.
- Provisioning requires validated namespace ResourceQuota headroom for Pod count, requested CPU and requested memory. Each pass budgets additions together; Kubernetes admission remains authoritative. Unknown quota readings prevent new warm Pods. This is allocation headroom, not measured device utilization or proof of schedulability.
- Idle scale-down uses conditional retirement protecting concurrent claims and in-flight provisioning. Only named execution-capacity ResourceQuota GET permission was added. No runtime rollout or deployment occurred.
- Independent review approved the eight changed files with no actionable findings. Implementer and reviewer each passed 25 focused prewarm tests; three rendered-overlay regressions and coordinator typecheck passed. Lead reran prewarm/input suites: 45 passed, one Windows symlink test skipped. Diff whitespace checks passed.
- Rechecked all eight Compose services healthy. Preserved working VHDX still reports Attached=False; administrator mount output remains required. Live managed-cluster recovery, prewarm execution, demand scale-up/down, failure cleanup and timing acceptance remain unverified. Parts 6 and 7 are not sealed.

### Real MySQL demand-policy regression

- Extended the existing isolated Kubernetes-provider fixture with real SQL demand history, quota-limited provisioning and aged-history idle retirement while a warm claim is held behind a controlled commit gate. Missing/full quota and zero-demand behavior also passed. Kubernetes responses remain simulated; no live cluster claim is made.
- Command: node scripts/Run-Isolated-Integration.mjs kubernetes-provider. Fixture f3ae017495b24b38 completed with exit 0 on 2026-11-18, including all existing persistence, admission, cancellation, expiry, ambiguous-commit and disabled-drain checks. Its owned temporary MySQL container was removed; project volumes and database were untouched. All eight Compose services remained healthy.
- Independent review approved the fixture and cleanup. Coverage limit: preservation of an aged claimed Pod proves claim protection, not independently the active-demand UNION branch, because claimed Pods are excluded from idle retirement. Unit coverage and live verification retain their separate scopes.
- Read-only recovery recheck: preserved working disk Attached=False, managed desktop-control-plane Dead, and the current kubeconfig has no contexts. Docker logs report failure restarting the existing control plane. Administrator mount result remains pending. No disk reset, cloud action or data deletion occurred.
