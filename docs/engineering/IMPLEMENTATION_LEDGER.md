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
| 6. Kubernetes execution | Ephemeral Kubernetes Jobs, capacity, cancellation, leases and orphan reconciliation | Native broker overlay persists execution IDs and bounds admission. Docker Desktop Kubernetes ran real C, Python and Java jobs, authenticated artifact downloads, UI cancellation and broker recovery. Separate kind verified node-loss cleanup and a fresh successful submission. The gVisor compiler gate remains open because its Landlock calls return ENOSYS. |
| 7. Performance and scaling | Capacity-aware queues, provisioning telemetry, prewarm and measured scaling | The Docker broker bounds concurrency. Measure queue, provision and execution stages before selecting a safe prewarm or autoscaling policy. |
| 8. Project input and dependency analysis | Multi-file C, Python and Java, dependency validation and resource limits | The working compiler accepts single-source jobs, with distributed C function-level IR. Add project manifests and language-specific graph validation before introducing partition scheduling. |
| 9. Distributed reconstruction | Independent partitions, linking or packaging, verification and owned outputs | Existing result verification, bounded leases and object-backed artifacts are in place. Validate project reconstruction against trusted builds and verify retry under a worker interruption. |
| 10. OCI infrastructure | OKE capacity, registry, private networking, supported ingress, MySQL and backups | Manifests render offline. Cost and capacity need account confirmation. Validate arm64 and the supported ingress before creating resources. See [OCI readiness](OCI_DECTA_READINESS.md). |
| 11. Vercel and public routing | Static frontend, authenticated HTTPS API, WSS and public domain | Local gateway routing and Vercel schema checks passed. Hosted login, WSS, downloads and reconnect need staging. |
| 12. Release engineering and security | Signed packages, image and secret scans, SBOM, CI and approval gates | Current CI verifies the workspace and Docker stack. Track scanner results, release signatures, registry digests and approval evidence before publication. |
| 13. System validation | Functional, failure, load, security, and deployment acceptance | Rerun all three platforms and C/Python/Java on the exact release. Prove external operation while the development PC is off, plus MySQL restore and node failure recovery. |

## Active implementation ownership

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
