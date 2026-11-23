# OmniCompile Core — development and OCI launch handoff


## Pending user factory reset — 23 November 2026

The user requested clearing all OmniCompile data again and resetting network
lettering to A. The guarded factory script and stronger verifier are prepared;
execution was blocked by automatic approval review before any deletion. Do not
claim the new baseline exists, and do not bypass the blocked operation with another
API or deletion method. The user must run scripts/Reset-Fresh-Application.ps1
-FactoryReset locally, then provide its result for verification. See FRESH_LAUNCH.md.
The separate MYSQL database remains protected. Ordinary startup must preserve data.



## Current override — 23 November 2026

The current laptop-backed Vercel deployment is running with eight healthy services
and three online compiler workers. The existing user master link remains valid.
One network/master-link creation flow replaces scoped invitations; device consent,
individual protected credentials, admission approval and revocation remain.
Windows and Android v0.1.2 fix canonical-origin connection discovery. Windows
package acceptance and 36 Android JVM tests passed; a current physical Android
phone and release signing remain unverified. Users must install the new packages.
The repaired batch launcher preserves data, refreshes public transport, checks real
worker registration, logs errors and pauses on failure. A disabled old managed pool
was replaced by explicit repair; old records and unrelated MYSQL were preserved.
Full repair, test evidence and operating instructions: [MASTER_LINK_REPAIR.md](MASTER_LINK_REPAIR.md).
The historical handoff below remains context, not the current public deployment status.


Updated 2026-11-22, Asia/Calcutta. This is a consolidated engineering handoff reconstructed from the accessible conversation, actual repository, verification ledger and local/remote checks. It is **not a verbatim export of the entire chat**. Historical results are identified as such; no credentials are included. Read this before resuming development in another chat.

## 1. Current status in five quotes

> **1 — Working local product:** The eight-service Docker application is running and healthy. Real C, Python and Java compilation/execution, authenticated artifact downloads, UI/login and recovery checks passed in the latest recorded local acceptance. Actual Web, Windows and physical API-25 Android workers completed a mixed-worker run with 1,858 ms of three-way execution overlap. This proves portable peer work, not native GCC/Python/JDK execution on a browser or phone.

> **2 — ARM64 and GHCR:** All eight ARM64 validation images were built, scanned and published. On 2026-11-22, every remote digest and linux/arm64 manifest was rechecked. Their unused laptop-local copies were removed to recover space. OCI pulls directly from GHCR, so those local copies are **not required** for deployment. Keep the registry packages and source; do not rebuild or repull all eight merely to populate the laptop cache.

> **3 — Security boundary:** Public hostile-code execution is **not cleared for launch**. Mandatory Landlock works in the recorded native local Docker tests, but the configured gVisor/Landlock combination remains unresolved. Emulated ARM execution failed closed rather than bypassing protection. Native A1 kernel/runtime execution, network-policy enforcement and node PID controls still need target evidence.

> **4 — OCI sizing:** The configured seven resident Kubernetes containers plus two runners request 1.25 CPU and 2,464 MiB and have summed limits of 8.25 CPU and 7,808 MiB. These are manifest totals, not measured consumption. A single 2-OCPU/12-GB A1 is plausible for small sequential demonstrations with prewarming off, conditional on account/region eligibility, actual allocatable capacity, compatible isolation and benchmarking. OKE entitlement remains unverified even though the user has now registered for OCI.

> **5 — Release and cleanup:** Latest audited main is 28895a9, with successful GitHub CI; latest runtime/test fix is 84d044f. The final manual generated-file cleanup is verified, including 82,685,948 measured bytes removed in its completed step. MySQL/artifacts remain protected. A frontend was historically published to Vercel, but there is no completed OCI backend deployment or development-PC-independent system acceptance. No cloud deployment was performed during this handoff.

## 2. Resume context, scope and non-negotiable decisions

- Actual project root: `C:\Users\mahen\OneDrive\Desktop\SARVESH\simats\SIMATS PROJECT\COMPILER DESIGN\OMNICOMPILE`.
- Some desktop chats start in an obsolete workspace. Always set the real project working directory explicitly.
- Git remote: `https://github.com/192521143simats-sketch/OMNICOMPILE-CORE.git`.
- Main before this documentation change: `28895a9e8d79e679f6d99bc355f1498e078f3792`. Runtime/test fix: `84d044fd54c0ef5c1949335651edf8a7a8b75763`.
- Current instruction: preserve data, finish local verification and preparation; **no cloud deployment**. Do not silently create paid OCI resources. User has signed up, but account type, home region, usable regional services and quotas have not been supplied.
- Product name is OmniCompile Core; proposed public naming `omnicompilecore` was approved without domain purchase. Do not purchase a domain. Existing public frontend alias is `https://omnicompile-core-platform.vercel.app`; its historical publication is not proof of a working public backend today.
- User explicitly removed the multi-file compiler feature. This later instruction overrides older multi-file requirements in EXPECTED.docx/master text. Do not reintroduce it as an unfinished mandatory deliverable without reconciling that override.
- Public compiler languages are **C, Python and Java**. Installed G++ is not proof that C++ is exposed; C uses C11 compilation. Do not promise C++ demonstrations.
- Low-Disk behavior was reverted at the user's request. Preserve that decision; do not add automatic idle cleanup again.
- Keep the existing authentication, MySQL records, worker protocol and monorepo. Extend the working implementation, do not replace it with a new architecture.
- Follow AGENTS.md: read ARCHITECTURE, IMPLEMENTATION_PLAN, EXPECTED_CROSSCHECK and the master specification; use a dedicated branch, isolated test databases/ports, regression evidence and ordinary non-forced Git integration.
- `EXPECTED.docx` is an untouched **untracked user input**. Do not delete, stage or publish it automatically. Its full text was inspected in the preceding audit, not just its title.
- No secrets, tokens, source submissions, signing keys, runtime databases, dependency trees or generated release binaries belong in Git. Matching repository/directory architecture means matching maintained source, not committing a runtime installation.

## 3. Repository architecture and real execution paths

| Area | Location | Responsibility / boundary |
|---|---|---|
| React/Vite frontend | `apps/web` | Cinematic landing, existing login/signup, compiler UI, reports, admin, enrollment and browser worker |
| Coordinator | `apps/coordinator` | Fastify API/WSS, RBAC, MySQL persistence, scheduler, leases/recovery, verification and artifact authorization |
| Native agent | `apps/worker` | Capability discovery, authenticated protocol and optional supported host-native work |
| Windows application | `apps/windows-worker` | Packaged Electron/native worker lifecycle and enrollment |
| Android application | `apps/android-worker` | Native Kotlin/Compose, API 25+, device identity, lifecycle and portable tasks |
| Contracts/orchestration | `packages/contracts`, `packages/orchestration` | Schemas, identities, state guards and resource/capability-aware assignment |
| Language packages | `packages/compiler-c`, `packages/compiler-python`, `packages/compiler-java` | Analysis, supported optimization, diagnostics and output generation |
| Docker | `docker-compose.yml`, `infra/docker/images`, `infra/docker/operations`, `infra/docker/verification` | Eight purpose-built services, normal startup, isolated verification |
| Kubernetes | `infra/kubernetes*` | Shared baseline, Desktop/runtime/native/prewarming overlays, bounded execution Jobs |
| Frontend hosting/gateway | `infra/vercel`, `infra/web` | Frontend hosting and proxy inputs; do not host persistent compilers in unsuitable serverless functions |
| Engineering automation | `scripts`, `.github` | Packaging, isolated integration, real scanning and CI |
| Maintained evidence/reference | `docs`, `samples` | Requirement ledger, operations, security, regression sample inputs |
| Local state only | `.runtime`, ignored env/local properties, build/dependency directories | Credentials, provisioned releases, security reports, toolchains and generated outputs |

Normal local URLs: frontend `http://localhost:5173`, API readiness `http://localhost:4100/ready`, project MySQL loopback port **3307**. General-purpose `MYSQL` on **3306** is separate. Do not change its state or data to fix the project.

Cloud/Hybrid labels currently select **execution policy**, not a geographic location. When started on this laptop, cloud workers/broker can be local Docker/Kubernetes services. Real installed compiler tools are used, but that does not mean OCI has been deployed. Cloud-only execution can use the local container infrastructure. Optional native execution requires discovered toolchains and consent; host-native workers do not automatically have equivalent container isolation.

The coordinator remains authoritative. Enrolled workers never receive unrestricted Docker/Kubernetes credentials. The private Compose executor has Docker access to launch restricted disposable containers; Kubernetes-native execution uses bounded Jobs and scoped service permissions. A shared image is acceptable; mutable per-job workspaces must remain independent.

## 4. Development history and important corrections

This sequence consolidates the conversation; commit IDs below identify inspectable checkpoints, not claims that every old requirement was finished.

1. Preserved the existing monorepo and mapped services, toolchains, ports and persistent data before containerization. Approved names include `omnicompile-coordinator`, `omnicompile-frontend`, `omnicompile-c-worker`, `omnicompile-python-worker`, `omnicompile-java-worker`, `omnicompile-mysql`, `omnicompile-executor`, `omnicompile-artifacts`, project/private networks and persistent artifact storage. General MySQL remains independently managed.
2. Separated C/Python/Java workers, routed compiler work by actual capabilities, introduced private execution isolation and durable artifact handling. MySQL data and existing application accounts were preserved. The user later authorized only narrowly scoped copied-Kubernetes DB credential recovery/additional administrator, not replacement of existing account passwords.
3. Implemented durable Kubernetes execution identity, bounded admission, provisioning versus running states, cancellation, receipt replay/acknowledgment, artifact publication ordering and recovery. Historical checkpoints include 8a01b8d, 49bd939, 306ef98, 224fd5a and d34f6ea. Existing receipt evidence must not be mistaken for a fresh secure A1 pass.
4. Docker storage exhausted C:/D: and repeatedly stalled/read-only. Docker Desktop's application stayed on C:, while its WSL storage was moved to K:. A SHA-verified working copy was retained during recovery, inspected read-only, detached and later deleted only after data checks. Never reset/format a RAW WSL VHDX: RAW in Windows does not mean an empty or corrupt Linux filesystem.
5. Docker Desktop Kubernetes became the local cluster target. Older disposable Kind resources were not all deleted because some retain PVC data. Current Desktop node readiness does not imply application workloads are deployed there now.
6. Android minSdk/API compatibility was extended to API 25 with conditional APIs and native tests. Xiaomi USB install restrictions and OneKeyClean termination initially blocked device tests; authorized retries/manual consent resolved them. Historical Android correction 98645fa fixed branding assertions and API-26-only screenshot capture. Do not bypass device consent.
7. UI redesign introduced the coral/carbon cinematic landing, shared motion and responsive/reduced-motion behavior. GET STARTED routes to the existing login, with no redundant top-right Login on login/signup. 6a57473/f68b817 are historical UI checkpoints. The existing Vercel alias was explicitly promoted and browser-verified historically; current OCI remains absent.
8. Multi-file compiler functionality was removed at explicit user request. Maintained single-file samples and source tests remain useful and were retained.
9. Replaced a fabricated scanner stub with fail-closed real Trivy execution (11b975b), then remediated HIGH/CRITICAL image findings (29ef3b6). Do not restore a stub or suppress findings merely to get a green result.
10. Added actual optimization evidence (64bdac0), then dead-code elimination/report integration (c125357). No invented runtime speedup or CPU reduction is displayed.
11. Added ELF architecture validation and fixed ARM MySQL helper cross-compilation (a3130dd). Native and ARM image metadata inherited inappropriate upstream GitHub source labels; be1f901 corrected frontend/artifact ownership labels without changing package access controls.
12. All eight ARM images were published, inspected and scanned; recovery/publication evidence recorded in f68ec3a. No A1 deployment occurred.
13. Whole-system verification identified genuine Linux CI failures after Windows-local success: non-executable fixture ELF, zombie descendant liveness assumptions, and a private 0600 credential owned by Linux UID 1001 but read by image UID 1000. 84d044f fixed the fixtures/tests without loosening production permissions. Container diagnostics now retain stderr. Independent review and actual Linux CI passed.
14. Audited source organization/dead code, repaired misleading documentation, ran the full mixed physical-device test, verified every existing authenticated artifact, removed safely disposable Docker data and merged stale local branches. 28895a9 records this acceptance. Final manual Android-intermediate/log cleanup is recorded below.

Older plans use different numbering (original phases 0–9, later conversation parts including 6/7 and a 13-part objective). The old `docs/engineering/IMPLEMENTATION_LEDGER_PARTS_1_9.md` was explicitly discarded. Do not fabricate a 13/13 completion statement or restore obsolete duplicate ledgers. `docs/EXPECTED_CROSSCHECK.md` is the current requirement/evidence ledger; map unresolved capabilities to it.

## 5. Acceptance evidence and remaining verification boundaries

Unless explicitly marked fresh in this handoff, these are completed results recorded in the latest preceding audit, not tests rerun merely to write this document.

| Check | Observed result | Boundary |
|---|---|---|
| `npm run verify` | 587 Vitest passed, 12 opt-in skipped; 65 script checks; nine workspace builds/typechecks passed | Default run intentionally does not enable all external integrations |
| Enabled broker/prewarm suites | Latest run: 32 passed, one Windows symlink-privilege skip | All 12 real broker tests ran; actual AtomicWriter symlink behavior separately passed in restricted Linux |
| Earlier user-supplied broker run | 33/33 passed, exit 0 | Historical user terminal result; do not conflate with latest Windows skip count |
| Hardened eight-image regression | Exit 0; actual C/Python/Java, concurrent C, syntax/runtime failures, time/output/security limits, ELF checks and cancellation | Native local Docker acceptance, not native A1 |
| Browser web regression | Exit 0; actual Edge, landing/login/signup/admin/enrollment, C/Python/Java upload/results/reports, responsive/reduced-motion checks | Isolated test settings; not a public OCI flow |
| Physical mixed-worker regression | Exit 0; Web + packaged Windows + physical Redmi Y1 Lite API 25 | Actual portable tasks; not phone-native compiler execution |
| Recovery/phase4 | Final serial run exit 0; restart persistence, delayed cancellation, stale-result rejection, artifact rollback and fixture backup/restore | Owned isolated databases, not destructive production restore |
| Android | Both APKs built/signatures verified for API 25; historical 33 JVM tests and five API-25 device tests passed | Modern API-26+ release/device matrix and production signing still require closure |
| Image security | Eight native and eight ARM immutable images: zero HIGH/CRITICAL, 16 CycloneDX SBOMs | Scanner/database time-specific; not proof of no vulnerabilities forever |
| Source secrets | Committed-source Trivy scan passed | Ignored credentials intentionally excluded from Git; never print them |
| Existing project artifacts | 57 authenticated downloads matched stored SHA-256 and size, total 155,592 bytes | Existing artifacts were read, not rewritten |
| Existing project database | 27 tables, three accounts, one admin with nonempty password hash, 57 artifact records | Latest read-only acceptance; no account reset |
| Linux remote CI, runtime/test commit | All three jobs successful, run 44993570481 for 84d044f | Actual Linux application/manifests/Docker checks, including security/SBOM |
| Linux remote CI, latest audited main | Run 44995358269 for 28895a9: completed/success, freshly queried | This handoff's subsequent docs commit is a separate commit |
| Fresh handoff checks | Eight Compose services healthy; frontend/API HTTP 200; all eight GHCR digests match and advertise linux/arm64 | No container rebuild, data mutation or cloud deploy performed |

CI links:

- https://github.com/192521143simats-sketch/OMNICOMPILE-CORE/actions/runs/44993570481
- https://github.com/192521143simats-sketch/OMNICOMPILE-CORE/actions/runs/44995358269

Mixed run details retained in the ledger after scratch cleanup: browser Node A001 ran 05:59:35.878–05:59:40.067 UTC; Windows A002 05:59:37.111–05:59:38.969; Android A003 05:59:36.365–05:59:41.308. Their shared interval was **1,858 ms**. Enrollment consent/admin approval, credential rotation, pause/resume, burst work, browser-to-Windows reassignment, coordinator restart, fresh work after reconnect and leave/revocation passed. Test-only enrollments were revoked and test applications/mappings cleaned; ordinary identities were not reset.

Historical local Kubernetes receipt evidence survives separately in `.runtime/live-receipt-evidence.md` (ignored, preserve until reconciled). C JOB-ONSTR and Java JOB-FY78B completed with genuine artifacts and authenticated downloads after receipt mode was enabled. Receipt chunks became zero and receipt payload fields were cleared before expiry while request digests remained. In JOB-J79A0 the coordinator was replaced after broker persistence but before artifact publication; the same execution ID `72e1989f-5029-43ab-9b3c-2f42b5f29644` recovered and published verified output, then acknowledgment cleared receipt data. Initial runs with NULL receipt IDs were correctly treated as insufficient evidence and repeated. This is useful recovery evidence, **not a certificate for the currently incompatible runtime or OCI**.

Part 6 therefore has substantial implementation and historical local acceptance, but its current target-runtime/security/recovery gates are not universally closed. Part 7 has capacity configuration, optional prewarming machinery and tests; target sizing, prewarming benefit and five-run benchmark acceptance remain open. Keep prewarming off for the initial small VM.

## 6. Optimization: what is real and what is not measured

Actual compiler/transformation paths execute; successful output is not simulated. DCE is integrated into supported language optimization/reporting. C includes compiler DCE/optimization options and baseline/artifact comparison; Python/Java use supported structural transformations. Do not describe these as arbitrary whole-program semantic equivalence or guaranteed runtime acceleration. Language limitations and side-effect preservation matter.

The user compiler page now has **six**, not five, cards (`apps/web/src/compiler-metrics.tsx:54`):

1. Task execution success rate.
2. End-to-end task completion time.
3. Optimization evidence.
4. Worker availability.
5. Measured resource utilization.
6. Result verification rate.

Optimization evidence reports actual method, before/after measurement and unit, reduction where measured, transformations, actual compiler/version/options, artifact bytes, DCE status/method/removed statements/instructions. Reports and downloadable artifacts carry consistent evidence. Unknowns are not zeros. **Runtime speedup remains Not measured**; structural reduction or smaller output is not proof of a faster program. Missing browser-wide CPU/RAM telemetry is not fabricated. Original syntax diagnostics include source line/column where available, including tested line-3 failures.

A submission may entail more than one task/environment: analysis/partition tasks where supported, worker compilation, independent verification, optional execution, and a C baseline build. This does not bypass the global two-slot broker admission. Independent environments and distributed orchestration are real; do not claim that every tiny single-file program benefits from parallelism or that cloud CPU belongs to the physical peer.

## 7. ARM64 images, local cleanup and OCI pulls

GHCR means **GitHub Container Registry**. Git stores source/commit history; GHCR stores runnable image manifests/layers. Ampere A1 uses Arm64, while this laptop's native Docker engine is x86-64. Matching ARM images avoid treating amd64 machine code as native A1 code.

Approved namespace: `ghcr.io/192521143simats-sketch/omnicompile-<service>`. Version tag: `be1f901-arm64-validation`. All eight immutable references were remotely rechecked during this handoff, without pulling layers:

| Service | Published digest |
|---|---|
| coordinator | `sha256:92edb22ab2700cb876c56e7c2ce59bce2dcb55d49888663c22b92eeae86c0be0` |
| frontend | `sha256:f94f22ee3ad5c9bc68efe9a863d3226dfa21423d4df410ee8e3d0456e8d78e93` |
| c-worker | `sha256:30cb1defd7f7648665dc12431bc55ded7c5d3ed17d1418362c4e2e0c6afd2253` |
| python-worker | `sha256:38b458ea66023eaa1466bfc17c8c069afc242c2340d239180c156ed8adcd28b7` |
| java-worker | `sha256:8e25185e83ac135733f0b3acf7aab35f3e8409e2c9bdd0028458f46bb047204b` |
| executor | `sha256:bc8a4035a1db4952282bd3709d6d75efa03cb92aefa3036cc2887f891d661bd2` |
| artifacts | `sha256:1af77c376e2e55fea16308b60c9c7e9de3c8aa711e012647a61b567ae16f32a9` |
| mysql | `sha256:69970b1dbf2eda96d5c8295ead966163ebae5d3e9796dcf998a755ea4b2c89b5` |

Reference format: `ghcr.io/192521143simats-sketch/omnicompile-SERVICE@DIGEST`. Record is `.runtime/security-evidence/arm64-publication.json`. The extra unknown/unknown platform in an image index is an attestation, not a second executable architecture.

**Local ARM copies: removed. GHCR copies: present and verified. OCI needs local laptop copies: no.** A private package requires scoped read access/imagePullSecret, reachable registry egress and the pinned digest. Do not paste tokens into chat or commit Docker auth. Package visibility was not changed. Laptop cache is only useful for offline testing/rebuild convenience. If needed later, pull just the required image:

```powershell
docker pull --platform linux/arm64 ghcr.io/192521143simats-sketch/omnicompile-c-worker@sha256:30cb1defd7f7648665dc12431bc55ded7c5d3ed17d1418362c4e2e0c6afd2253
```

Build/runtime distinctions:

- All eight ARM builds completed; base manifests and custom helpers support aarch64. The sandbox source has explicit aarch64 handling.
- MySQL's gosu helper initially failed during emulated Go network/TLS build. Its Dockerfile now builds on `$BUILDPLATFORM`, sets target GOOS/GOARCH with CGO disabled, and copies the resulting target executable. ARM MySQL 8.4.13/gosu 1.19 validation passed; this does not replace an A1 migration/restore test.
- Coordinator ELF validation (`apps/coordinator/src/executable-architecture.ts`, `compiler-job.ts`) checks architecture before writing/chmod/execution. amd64 EM62 and ARM64 EM183 must match the runner. Foreign ELF rejection and matching native execution were exercised; actual ARM helper headers and the ARM guard were checked. Non-ELF/Windows fallback behavior was preserved.
- Actual secure C/Python/Java compilation/execution on a native A1 VM is **NOT VERIFIED**. QEMU builds/emulation are insufficient evidence.

## 8. OCI executive verdict and account evidence

| Area | Verdict | Reason |
|---|---|---|
| Resource feasibility | DEPLOYABLE AFTER SPECIFIC FIXES | Small sequential capstone workload plausibly fits; ingress/system reserve and actual peak consumption still need validation |
| Kubernetes/OCI feasibility | DEPLOYABLE AFTER SPECIFIC FIXES | Account/region quotas, storage/image/port integration, endpoints, registry access and target validation remain |
| Sandbox/execution safety | DEPLOYABLE AFTER SPECIFIC FIXES — launch blocked | Mandatory isolation is not demonstrated on the selected runtime/A1 target |

There is no justified positive SAFE TO DEPLOY verdict yet. “NOT FEASIBLE WITH ALWAYS FREE” is also not established: compute capacity appears plausible, while specific entitlement/runtime constraints remain unresolved.

Current official sources checked on 2026-11-22:

- [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm): published A1 allowance 1,500 OCPU-hours/9,000 GB-hours monthly, equivalent to 2 OCPUs/12 GB for Always Free tenancies; eligible compute is home-region bound. Combined boot/block allowance is 200 GB; minimum VM boot volume is 47 GB. Object storage is 20 GB combined for an expired-trial Always-Free-only account, with 50,000 API requests monthly. The page also describes qualifying load balancing/network allowances, idle-resource reclamation and an Always Free HeatWave option. These entitlements still require actual region/account checks; no managed-database migration has been assessed or performed.
- [OCI pricing](https://www.oracle.com/cloud/price-list/): distinguish a free Basic control plane from chargeable workers, storage and networking. Trial credits and paid-tenancy usage offers do not prove a permanent Always-Free-only entitlement.
- [Service limits](https://docs.oracle.com/en-us/iaas/Content/General/service-limits/default.htm): Kubernetes Engine table lists one Basic cluster per region for PAYG/trial and 15 for Universal Credits. It does not establish this user's post-trial Always-Free-only access. Console limits are authoritative for this account.
- [OKE prerequisites](https://docs.oracle.com/en-us/iaas/Content/ContEng/Concepts/contengprerequisites.htm): requires subscribed region, sufficient compute/block/LB quotas, appropriate IAM/networking; block-volume PVC minimum 50 GB.
- [OKE Arm nodes](https://docs.oracle.com/en-us/iaas/Content/ContEng/Tasks/contengrunningarmnodes.htm): managed Arm node pools are supported; application images must be appropriate for Arm.

User requested Chennai (`ap-chennai-1`). Existence in a region catalog is not proof that ordinary A1, OKE, required storage and Always Free eligibility are available to this tenancy there. **Actual home region, account state, OKE Basic available count, A1 OCPU/RAM availability, block/LB quotas and regional capacity: NOT VERIFIED.** Ask for these Console values, not passwords/private keys. A PAYG upgrade may be required for a specific service entitlement, but it has not been established as necessary for this workload. Never upgrade or provision paid resources implicitly.

For a 31-day month, 2 × 744 = **1,488 OCPU-hours** and 12 × 744 = **8,928 GB-hours**. That fits the stated allocation without additional A1 resources. Keep the distinction between an allowance and a guarantee of capacity. E2.1 Micro is not the recommended full compiler-stack host.

## 9. Configured project resources — not measured consumption

Native Kubernetes overlay, prewarming off. Seven resident containers are counted; artifact object storage is external. Compose has eight services because it includes local artifact storage. This is not a missing eighth Kubernetes Pod.

| Component | Replicas / maximum | CPU request / limit | RAM request / limit (MiB) |
|---|---:|---:|---:|
| MySQL | 1 | 100m / 1 | 512 / 1,024 |
| Coordinator | 1 | 200m / 1 | 512 / 2,048 |
| Frontend | 1 | 50m / 250m | 32 / 128 |
| C worker service | 1 | 100m / 1 | 256 / 1,024 |
| Python worker service | 1 | 100m / 1 | 256 / 1,024 |
| Java worker service | 1 | 100m / 1 | 256 / 1,024 |
| Native execution broker | 1 | 100m / 1 | 128 / 512 |
| Ephemeral runner | 2 active maximum | 250m / 1 each | 256 / 512 each |
| Migration Job | temporary | 100m / 1 | 128 / 512 |
| Ingress controller | deployment not supplied | NOT VERIFIED | NOT VERIFIED |
| Separate monitoring stack | not configured | not counted | not counted |
| External object storage | external service | not counted | not counted |

Evidence: `infra/kubernetes/resources.yaml:81` (MySQL), `:141` (coordinator), `:208` (frontend); `infra/kubernetes/compiler-workers.yaml:60`, `:190`, `:320`; `infra/kubernetes-native/execution.yaml:16`, `:86`; `apps/coordinator/src/kubernetes-manifests.ts:8`, `:27`.

| Envelope | CPU requests | CPU limits | RAM requests | RAM limits |
|---|---:|---:|---:|---:|
| Residents | 750m | 6.25 | 1,952 MiB | 6,784 MiB |
| Residents + one runner | 1,000m | 7.25 | 2,208 MiB | 7,296 MiB |
| Residents + two runners | 1,250m | 8.25 | 2,464 MiB | 7,808 MiB |
| Residents + migration, no runner | 850m | 7.25 | 2,080 MiB | 7,296 MiB |

Summed CPU limits oversubscribe a two-CPU machine; they do not mean continuous usage of 8.25 CPUs. Bursts contend/throttle. Requests determine admission, not performance guarantees. Builds must run outside the small presentation VM unless build peaks are separately measured.

Storage/scheduling:

- MySQL currently requests 20Gi, with no OCI-specific StorageClass. Prepare a compatible minimum-size claim before provisioning; do not mutate a live database claim destructively.
- Coordinator memory-backed `/tmp`: 512Mi; each language service 256Mi; runner 128Mi; migration 128Mi. tmpfs consumes container memory and is not added a second time to the memory-limit sum.
- Broker scratch: 64Mi disk-backed. Each runner requests/limits ephemeral storage 128/256Mi; language-service limits include 256Mi. Some resident components still lack explicit ephemeral requests/limits.
- Execution namespace quotas cap two active Jobs/Pods with 500m/512Mi requested and 2 CPU/1Gi limited. No equivalent complete application-wide ResourceQuota/LimitRange was supplied.
- RuntimeClass installation, enforcement-capable CNI, node PID policy, ingress controller and actual node allocatable capacity remain deployment work.
- One coordinator replica is deliberate; process-local connection ownership is not made highly available merely by increasing replicas.

### Workload and headroom calculation

Engineering assumptions, **not benchmarks**: reserve 0.5 CPU and 2 GiB for the node/system, plus 0.1 CPU/256Mi for ingress. Validate these against actual OKE/self-managed node allocatable capacity and installed CNI/CSI components; self-managed control plane may need different reserves.

| Scenario | Active runners | App CPU/RAM requests | Planning memory envelope including assumed system/ingress |
|---|---:|---|---:|
| A: deploy/migrate existing images | 0 + migration | 850m / 2,080Mi | 9.375 GiB |
| B: home tests | up to 2 | 1,250m / 2,464Mi | 9.875 GiB |
| C: five presentation submissions sequentially | 1 | 1,000m / 2,208Mi | 9.375 GiB |

The last column uses summed application memory **limits**, not predicted usage. Five sequential runs do not require five times peak RAM. CPU/RSS/queue/startup/compile/run/network/cleanup measurements on A1 remain **NOT VERIFIED**.

Two-runner CPU request headroom: `2 - 0.5 - 0.1 - 1.25 = 0.15 CPU`. CPU is the tighter scheduling constraint. Two slots are sufficient as an initial concurrency cap; demonstrate sequentially until target measurements justify overlap.

Do not silently equate 12 GB and 12 GiB. If the node really exposes 12 GiB, memory headroom against these limits is `12 - 2 - 0.25 - 7.625 = 2.125 GiB`. If 12 GB is decimal, it is about 11.176 GiB, leaving about **1.301 GiB** under the same assumptions. Actual visible/allocatable RAM: **NOT VERIFIED**.

Indicative storage budget using a rounded 50-GB boot allocation: one VM + 50-GB DB consumes 100 GB, leaving 100 GB from the 200-GB combined allowance; two such boot volumes + DB consume 150 GB, leaving 50 GB. Images/logs/maintenance occupy those disks. Additional block artifact storage reduces the remainder. Two 1-OCPU/6-GB VMs duplicate node/boot overhead without increasing total compute; one VM is the simpler default if eligible. A separate managed MySQL offering could change this budget, but is not assumed in current calculations.

If frontend is eventually Vercel-only, its Kubernetes Pod could be omitted after routing validation, saving 50m/32Mi requests and 250m/128Mi limits. That is an architectural option, not a change already applied.

## 10. Sandbox and exact deployment gaps

### Mandatory isolation gate

`infra/docker/images/workers/compiler-sandbox.c` requires Landlock and applies no-new-privileges/seccomp restrictions. Native local Docker probes reported Landlock ABI 1. ARM user-emulation probes returned ENOSYS (errno 38); all three ARM wrappers refused execution, exit 126. That is fail-closed behavior, not successful ARM program execution. QEMU's missing syscall does **not** prove the native A1 kernel lacks it.

The selected gVisor configuration cannot currently satisfy the mandatory Landlock path. Resolve by a tested compatible runtime/policy architecture preserving filesystem, process and network restrictions, not by skipping Landlock or turning off the guard. A native runtime offering the syscall alone is not automatically equivalent to a hardened sandbox for hostile public code. Document threat model and prove the complete boundary. Do not expose arbitrary public host-native execution while claiming the container restrictions protect it.

Configured defenses include non-root, read-only root, dropped capabilities, seccomp, no service-account token for runners, isolated workspaces, deny-all runner network policy, CPU/memory/temp bounds, deadlines and independent cleanup. Enforcement on OCI is not proven by manifest presence. Runtime program limit is 10 seconds; combined output bound 64KiB; Java uses Xmx256m. Kubernetes Job deadline is 105 seconds, distinct from controller lifecycle timing; TTL/backoff/cleanup controls do not replace receipt settlement.

### Concrete integration changes still required

| Finding | Necessary action / acceptance |
|---|---|
| Runtime incompatibility | Reproduce on selected target runtime; retain isolation and pass positive/negative C/Python/Java suites |
| Native A1 execution absent | Run actual ARM compiler + verifier + execution + ELF rejection, cancellation and receipt cleanup on native hardware |
| Cloud images/settings placeholders | Use the eight pinned digests, real HTTPS/WSS/object endpoint, secret references and registry read access; never commit secrets |
| Kubernetes MySQL image mismatch | Baseline points to upstream digest a0225d1… on 3306; remediated published custom MySQL uses 3307. Coordinate image, Service/targetPort, DB_PORT, probes and NetworkPolicy; merely swapping image is wrong |
| OCI claim sizing/class | Create a valid OCI claim/storage class; preserve existing PVC data and verify migration/readback/restore |
| OCI object API untested | Verify S3-compatible endpoint/region/signing/auth, upload/download, owner isolation, hash checks and recovery |
| Ingress resource/PID policy missing | Size controller, verify WSS/SPA/API/login/download routing, set/test node PID limits and network enforcement |
| Host-native public work | Enforce validated isolated execution for hostile workloads or implement equivalent OS/VM isolation; optional consent is not itself a sandbox |
| Release signing incomplete | Windows setup currently NotSigned; Android production signing not configured. Build signed release packages and test clean installs/API-25+ matrix |
| Target performance absent | Five sequential genuine submissions, measured CPU/RSS/queue/provision/compile/execute/cleanup and timeout margins |
| End-to-end independent hosting absent | External client enrollment + authenticated artifact download with development PC off |

Kubernetes baseline image/port evidence: `infra/kubernetes/resources.yaml:28`, `:52`, `:72`, `:73`, `:93`, `:263`. Current runtime source and the actual rendered overlay must be compared again when changing these files.

## 11. Cleanup, data protection and local environment

Active Docker storage is **not** the deleted working copy:

```text
K:\1. SARVESH SIMATS PROJECT FILES\Docker\DockerDesktopWSL\disk\docker_data.vhdx
```

Keep K: connected while Docker runs. Docker Desktop application remains on C:. Do not detach/compact a live disk, reset Kubernetes/Docker, prune volumes or delete anonymous volumes based on names. The old `DockerDesktopWSL-Working` copy was detached, verified unused and user-deleted after acceptance: **41,657,827,328 bytes**, active disk remained present. No replacement backup is being created.

Protected volumes: `OMNICOMPILE-MYSQL`, `OMNICOMPILE-ARTIFACTS`, general `mysql`; five anonymous volumes remain because unique historical data has not been ruled out. Old stopped `omni-accept-e7d52fe` Kind nodes retain possible PVC data and are deliberately protected pending an actual contents/uniqueness audit. One volume contains local-path-provisioner data. “Stopped” does not mean disposable.

Completed Docker cleanup stages reported about 8.89 GB and later 7.40 GB reclaimed internally (images/cache). These are Docker's figures, not evidence that the Windows VHDX shrank. All required native images remained referenced by retained healthy containers. Final prior accounting: 13 images, zero reclaimable images; 4.581 GB shared cache, zero reclaimable cache. Do not repeatedly prune required shared layers or repull ARM layers to undo reclaimed space.

Historical user cleanup included duplicate scanner/Windows staging (329,930,224 bytes), generated test outputs and the detached disk copy. These occurred across separate attempts; do not sum overlapping/partially failed runs into a fabricated disk-space total.

Final cleanup during this handoff:

1. First PowerShell 5.1 attempt removed `.superpowers` and `.runtime/integration/b061b507bc93d903`, then stopped at Android long paths. Their byte total was not returned and is **unknown**.
2. Corrected command explicitly used installed PowerShell 7. It removed only Android generated/intermediates/kotlin/tmp/reports/test-results under normal and acceptance builds, plus completed non-final root `.runtime/*.log` files.
3. User output: **GENERATED_BYTES_REMOVED=82685948**, about **78.86 MiB**. Every listed target reported absent.
4. Independent fresh verification: zero listed remaining targets and zero non-final root logs; all eight services healthy; frontend and API HTTP200; protected volumes present. Four normal/acceptance APK outputs remain (roughly 1MB test and 11.9MB app each). Security evidence and live receipt evidence remain.

The deletion required the user's terminal because automatic approval review rejected it as “blocked by policy” without more detail. Do not evade that rejection with a different API/shell/container mount. This specific cleanup is now complete; no further blanket deletion is required. The 82,685,948-byte figure excludes the unmeasured earlier partial step and does not certify physical SSD/VHD compaction.

Environment at last audit: Docker executable `C:\Program Files\Docker\Docker\resources\bin\docker.exe`; Android SDK `D:\Android\SDK`; ADB its `platform-tools\adb.exe`; JDK `C:\Program Files\Java\jdk-21.0.12.1`; GCC `D:\GnuWin32\MinGW\bin\gcc.exe`; Python `C:\Users\mahen\AppData\Local\Programs\Python\Python314\python.exe`. Historical SDK moves mentioned C:\Android; the actual D: SDK was verified and stale user variables corrected. Probe actual locations before changing them again.

The source audit covered 462 files, with nine strict TypeScript unused-local/parameter checks reporting no candidates. Exact duplicate tsconfigs were retained because workspace-relative behavior makes them required. This is not proof every public export is dead-code-free. Tests/samples/docs that define behavior are not garbage merely because production imports do not reference them. Six merged local branches were removed without rewriting history; keep branches understandable, not history erased.

## 12. Repeatable local commands and verification discipline

Run from the real root, keep K: connected, and prepend Docker to PATH when Node scripts spawn it:

```powershell
Set-Location 'C:\Users\mahen\OneDrive\Desktop\SARVESH\simats\SIMATS PROJECT\COMPILER DESIGN\OMNICOMPILE'
$env:PATH='C:\Program Files\Docker\Docker\resources\bin;'+$env:PATH
git status --short
docker info
docker ps --format '{{.Names}} {{.Status}}'
kubectl --context docker-desktop get nodes
```

Normal user entrypoint is `START-OMNICOMPILE.bat`. To reuse already validated unchanged runtime images rather than rebuild them:

```powershell
& ./infra/docker/operations/Start-Containers.ps1 -ProjectRoot (Get-Location).Path -SkipBuild
Invoke-WebRequest http://localhost:4100/ready -UseBasicParsing
Invoke-WebRequest http://localhost:5173 -UseBasicParsing
```

Only rerun expensive suites when code/runtime changes justify them; these were just completed before the handoff:

```powershell
npm run verify
node infra/docker/verification/Verify-Remediated-Images.mjs
node scripts/Run-Isolated-Integration.mjs web
node scripts/Run-Isolated-Integration.mjs phase4
$env:OMNICOMPILE_ADB='D:\Android\SDK\platform-tools\adb.exe'
$env:OMNICOMPILE_ANDROID_ACCEPTANCE='1'
$env:OMNICOMPILE_MIXED_ANDROID='1'
$env:OMNICOMPILE_TEST_ANDROID='1'
node scripts/Run-Isolated-Integration.mjs mixed
```

Read each runner's isolation/preflight before execution; do not supply main DB credentials to a fixture. Mixed testing needs an unlocked consenting phone and acceptance APKs. Clear test-only environment flags after use. `phase4` is the integration runner's fixture name, not proof that an old numbered delivery phase is complete.

Broker opt-in tests require a separate private fixture broker with a fresh token, owned container label, loopback random port and final cleanup. The prior user run used `OMNICOMPILE_SANDBOX_TEST=1`, `OMNICOMPILE_EXECUTOR_URL`, `OMNICOMPILE_EXECUTOR_TOKEN_FILE` and:

```powershell
npx vitest run apps/coordinator/src/isolated-execution.test.ts apps/coordinator/src/prewarmed-input.test.ts
```

Do not point these at an unisolated developer executor. Windows symlink privilege may skip one AtomicWriter case; retain equivalent real Linux coverage rather than enabling administrator privileges or weakening assertions solely to eliminate a skip.

Remote ARM availability can be checked without consuming local image storage:

```powershell
docker buildx imagetools inspect ghcr.io/192521143simats-sketch/omnicompile-mysql@sha256:69970b1dbf2eda96d5c8295ead966163ebae5d3e9796dcf998a755ea4b2c89b5
```

## 13. Ordered remaining work and definition of finished

| Order | Work | Dependency / evidence needed |
|---:|---|---|
| 1 | Confirm OCI account/home region/Basic OKE/A1/storage/LB eligibility | Console non-secret values; cost review before provisioning |
| 2 | Select security-preserving runtime and test native A1 sandbox | Real native kernel/runtime; filesystem/network/proc denial, limits, foreign ELF rejection and positive C/Python/Java flow |
| 3 | Close current Part 6 target acceptance | Real Kubernetes jobs, verified UI/artifacts, receipt acknowledgment after publication, cancellation and broker/coordinator/node failure recovery with no orphan/duplicate artifacts |
| 4 | Close Part 7 capacity acceptance | Keep prewarming off; five sequential target submissions and optional bounded-two-task test; record actual CPU/RSS/timings and clean idle state |
| 5 | Prepare reviewed OCI overlay | Exact digests, consistent MySQL image/port/probes, valid PVC/storage class, private secrets/object-storage config, registry pull rights, ingress/PID limits and quotas |
| 6 | Complete release package gates | Windows signing, Android release signing, clean Windows install and API25 plus modern Android install/enrollment/reconnect tests |
| 7 | Validate public integration after explicit deployment authorization | HTTPS/WSS/login/CORS/session/SPA routes, admin and ordinary permissions, mobile/native enrollment and owned downloads |
| 8 | Final acceptance and operational handoff | External-device/PC-off run, durable storage, restore/restart/revoke tests, scan exact deployed digests, documented metrics/limitations |

Some preparation/signing documentation and source review can proceed independently, but do not skip the runtime gate to make the deployment appear complete. Do not build enterprise HA, multiple paid environments or unnecessary services for five capstone demonstrations. A one-node A1 deployment is the default sizing proposal, not an availability guarantee.

Direct answers: compute resources are plausibly sufficient; two slots are an appropriate initial bound; exact target runtime consumption is unknown; OKE's free control-plane price does not prove this tenancy's eligibility; PAYG necessity is not established; native A1 secure execution remains unverified. **Potentially free after specific fixes and entitlement checks, not safe to promise a free working OKE/Chennai launch today.**

There is no defensible percentage completion across conflicting historical specifications. The working local product, heterogeneous protocol, compiler execution, evidence-based optimization, persistence, image security and ARM publication have substantial real acceptance. The remaining gap is chiefly **target isolation/OCI integration, signed release validation and independent public operation**, not rebuilding the platform from scratch. It is not a completely finished deployed product until those gates pass.


## Temporary online faculty demonstration — 22 November 2026

The user explicitly authorized making the existing application accessible online while OCI A1 host capacity is unavailable. This is an HTTPS ngrok tunnel to the existing laptop-hosted Docker application, not an independent cloud deployment. OCI resources and protected MySQL/artifact volumes were retained.

- The frontend was built with the actual HTTPS API/WSS origin and copied into the existing frontend container. The coordinator uses production authentication, Argon2id bootstrap hash, secure HttpOnly cookies, and an exact-origin demo exception limited to an explicitly configured HTTPS `*.ngrok-free.app` origin. Default production policy continues rejecting temporary domains. The executor/compiler isolation settings were not relaxed.
- Runtime configuration, hash, URL, screenshots, and evidence are ignored under `.runtime/online-demo`; never commit that directory or SSH keys. No passwords were printed. ngrok traffic inspection was disabled.
- `scripts/Start-Online-Demo.ps1` (PowerShell 7) reuses or starts the tunnel, builds frontend endpoints, and recreates only the coordinator. Existing Docker services must already be running. Launch with `pwsh -NoProfile -File scripts/Start-Online-Demo.ps1` from the project directory. Current URL is in `.runtime/online-demo/url.txt`; do not assume it persists across restarts.
- Verified through the public HTTPS endpoint using headless Edge: landing/login pages, existing administrator login HTTP 200, Secure/HttpOnly session cookie, authenticated admin WebSocket receiving data, foreign-origin mutation rejection HTTP 403, no browser exceptions. Admin UI showed three available compiler workers and two free execution slots. All eight services healthy. No new user/compiler jobs were inserted into the main database for integration testing.
- Runtime-policy regression first failed, then all seven tests passed after implementation. Coordinator TypeScript check and frontend TypeScript/build passed. Public compiler submission/artifact download from an ordinary-user session still needs the faculty rehearsal; prior local compiler acceptance does not establish that new public-path result.
- Keep laptop powered and awake, K: attached, Docker running, and internet connected. Browser visitors may see ngrok's Visit Site interstitial. Free-plan transfer/request limits apply. This does not close native A1 runtime, OCI, signed-release, or PC-off operation gates.

## Vercel entry point connected to laptop backend — 22 November 2026

The user explicitly authorized connecting the existing `https://omnicompile-core-platform.vercel.app` frontend to the temporary backend and publishing page/API wiring. Work is on `engineering/vercel-backend-demo`; no paid subscription was activated and OCI was retained.

- Canonical public origin: `https://omnicompile-core-platform.vercel.app`. Landing, auth, admin, dashboard, enrollment and artifact HTTP APIs use this origin. API routing forwards to the current ngrok backend with `ngrok-skip-browser-warning` inserted upstream and private/no-store caching. Self-rewrites and conflicting legacy Vercel route declarations were replaced. Only `.vercel/output` static assets and routing metadata were uploaded, not the repository, local environment, private keys, database, or runtime secrets.
- Added `/worker` platform directory, `/web-worker`, `/browser-worker` alias, `/windows-worker`, and `/android-worker`. Platform pages accept `?token=...`, preserve existing `/join/:token[/platform]` links/API routes, and require explicit consent. Generated admin participation URLs now use the Vercel origin.
- External rewrite WebSocket acceptance FAILED in a real browser. It is not treated as supported. Browser realtime instead obtains a 30-second, single-use, role-and-Origin-bound ticket through authenticated same-origin `/api/realtime/ticket`, then opens WSS directly to the backend. Vercel Secure/HttpOnly cookies remain on Vercel; persistent worker/session credentials are never returned to JavaScript. Backend revalidates session or enrollment on socket use. Tickets are kept hashed in bounded memory and omitted from request logs. Native installation instructions obtain the backend-native participation origin from invitation inspection so existing native applications do not incorrectly attempt WebSocket connections through Vercel. Their physical remote-device acceptance remains outstanding.
- Actual public Edge checks without any special browser headers passed: existing admin login HTTP200, Secure/HttpOnly session, authenticated ticket WSS receiving snapshot, foreign-origin mutation403, no browser exceptions. Direct page loading passed for `/`, `/login`, `/signup`, `/dashboard` (unauthenticated login guard), `/worker`, `/web-worker`, `/browser-worker`, `/windows-worker`, `/android-worker`. Unauthenticated `/api/auth/me` correctly returns401 JSON, not an HTML warning or SPA. All eight Docker services remain healthy; three compiler workers were available in the admin view.
- Initial new worker-route/ticket tests failed before implementation. Focused regression after implementation: 34 tests across nine files passed, including ticket expiry/role/origin/replay and cancellation of pending worker socket authorization. Coordinator typecheck/build and frontend typecheck/build passed. The first frontend build failed on an unused React test import and was fixed; its intermediate publication used the previous frontend output and was superseded by the successful final build. No failed check is claimed as passing.
- Restart with `pwsh -NoProfile -File scripts/Start-Online-Demo.ps1` while Docker/K: are available. If the tunnel origin changes, run `node scripts/Publish-Vercel-Demo.mjs` to rebuild and republish the backend API target; a Vercel landing page alone cannot detect a changed tunnel automatically. Build script `Build-Vercel-Frontend.mjs` explicitly sets remote frontend mode and ticket transport so a later build does not silently revert to offline.
- Runtime-only screenshots, actual public evidence and current tunnel origin are in ignored `.runtime/online-demo`. Existing secrets in `.env`, `.env.local`, SSH keys, hashes, and credentials must not be committed. Keep laptop awake, Docker running, K: attached and internet active. This remains a temporary, laptop-dependent demonstration, not independently hosted cloud compute or full release acceptance.

### Final verification for the Vercel demonstration

- Final production deployment: `dpl_8Anisbe3QiWxNgJMsAHHzDP223DG`, aliased to the existing Vercel entry point. Static response security headers are preserved. No paid service was enabled.
- Isolated web run `63dd5a6eeed07918` passed browser/mobile enrollment, portable work and C/Python/Java positive compilation/report/download flows, then FAILED on the immediately displayed Python error location. Root cause was a race: `failTask` initially persisted the raw worker message before detailed failure reports, allowing UI polling/broadcast to retain an unlocated message. The task failure now persists the supplied structured diagnostic location before exposing FAILED. Positions are not inferred or invented.
- Corrected full isolated web run `c73dee930d3697e3` PASSED. Its owned temporary MySQL/coordinator and cleanup remained separate from the developer database. Real C/Python/Java positive compilation, reports/downloads, all three line-3 failure displays, reusable enrollment/approval/revocation and browser/mobile portable work passed. Evidence: `.runtime/integration/c73dee930d3697e3/summary.json` and `Verify-Web-Product.mjs.log`.
- Additional diagnostic/runtime regression17/17 passed; coordinator typecheck passed. Final live Vercel Edge smoke at 14:10:03 UTC passed: login200, Secure/HttpOnly cookie, ticket WSS snapshot, unauthorized-origin403, no browser exceptions; generated Vercel participation links and native transport metadata verified. A smoke attempt during coordinator restart briefly received HTML/502; after readiness, the final check passed. No uptime guarantee is implied.
- Remaining limits: no physical remote Windows/Android test in this turn; no ordinary-user compiler submission was inserted into the main database for public-path testing. The isolated compiler flow and live public transport smoke are separate evidence. Native package signing and OCI/native-A1 sandbox gates are still open. Existing native applications must use the backend invitation shown on their Vercel installation page; browser pages and HTTP APIs use Vercel, while realtime/native transport is direct to the laptop backend.

### Complete public route audit — 22 November 2026

User requested consistent page names and backend wiring for every page. Added named page metadata, browser titles, canonical trailing-slash/browser aliases, and explicit Page not found UI. The Vercel SPA fallback now matches supported page paths and invitation shapes; unknown pages return404, while `/api` and unknown `/api/*` remain backend JSON404. Auth/admin/compiler/invitation endpoint behavior was preserved. `docs/PUBLIC_ROUTES.md` records each page and its backend/access boundary.

Read-only production audit passed 21 page-route cases and10 backend API cases, including guards, titles, legacy redirects, invitation paths, unknown-page404 and JSON401/404 without special browser headers. Live authenticated Vercel login/ticket-WSS/foreign-origin checks passed again. Route/auth/navigation focused regression48/48 passed and frontend typecheck/build passed. New route tests initially failed before implementation.

An initial publication build rejected a Windows-encoded middle-dot character in the new not-found markup; source encoding was corrected to valid UTF8 and the guarded publisher uploaded only after a successful build. Isolated run `228cccf0b45bb894` was interrupted by that source edit/Vite hot reload during signup/login, despite server login returning200; its failure is retained rather than described as a product pass. A clean isolated web rerun follows without concurrent source edits. Current published deployment: `dpl_7S7G3rdusq8iYruPxb4VZ71DCbnr`.

Final clean isolated web run `8dbcf806ec5b65e1` PASSED after the routing changes, covering authentication/role navigation, browser/mobile enrollment, portable work, real C/Python/Java compilation, reports/downloads and compiler error locations. Source line endings were normalized after the test runner exited (whitespace only); `git diff --check` is clean. No runtime/main database or physical worker acceptance is inferred from the isolated fixture. The live route audit remains21 page cases plus10 backend cases, and the existing Vercel hostname is the canonical entry point.

## User-authorized fresh launch — 22 November 2026

Current data baseline is now `docs/FRESH_LAUNCH.md`; historical data-preservation statements above describe pre-reset state, not records to restore. The user requested a fresh product and explicitly preserved the separate MYSQL3306 database. Pre-cleanup code was committed/pushed as `0af10c0` before cleanup. Only OmniCompile's old application DB/artifact volumes were replaced, internal secrets rotated and managed worker registrations recreated.

Read-only factory verification: one configured administrator, zero ordinary users, one production compiler pool, three approved available compiler workers, zero jobs/tasks/results/artifact metadata/optimization batches/invitations/legacy sessions, and zero stored artifact objects. Existing configured admin credentials still match. General MYSQL container ID and its `mysql` volume were preserved. Public frontend remained stopped while the fresh baseline was verified and the second source commit prepared.

Cleanup: retired acceptance Kubernetes containers, their two volumes, the orphaned historical OmniCompile PVC volume and old node image were removed. An initially suspected empty orphan was found to belong to Docker Desktop's cloud provider and was correctly retained. Unused Desktop Kubernetes was stopped with no application PVCs; three managed infrastructure containers/images/volumes remain for future development. No broad system/volume prune, Docker reset or K: VHD operation occurred.

Automatic approval review rejected the generated-file deletion command as blocked by policy. The agent did not retry it through another API/shell/container. The reviewed PowerShell cleanup script was provided; subsequent inspection verified generated integration outputs, unpacked Windows bundle, acceptance Android outputs and old root key files absent, with both OCI keys preserved under ignored `.runtime/oci-credentials`. Actual worker installers, credentials/toolchains, regression sources/fixtures and security evidence remain. Launch images exclude project tests/fixtures and no longer use source-file patch mounts.

Validation: isolated empty-editor regression `16879252d722aec0` passed real web/enrollment/portable/C/Python/Java/report/error-location flows. Source596 passed/12 opt-in skips; an obsolete handoff identity path failed one operational assertion, was corrected, then65/65 script checks and workspace builds passed. Same-origin frontend configuration initially failed its new test, was fixed and10 focused tests passed. All8 rebuilt-image scans reported0 HIGH/CRITICAL findings. Exact-image isolated acceptance passed migrations, non-root/proxy/auth/roles, compiler secret-read denial, real sandboxed execution, two concurrent jobs and12 verified outcomes with developerDataModified=false.

Startup now uses built runtime images. `Start-Online-Demo.ps1` prepares the secure backend/tunnel without source or frontend file patches. `Publish-Vercel-Demo.mjs --prepare-only` prepares the exact routes/assets without publishing, allowing the requested second commit before launch. `Verify-Fresh-Launch.mjs` checks factory counts/object storage/worker readiness read-only; `--public` adds HTTP checks without creating sample data. New backend transport origin was generated on restart and the Vercel route was updated accordingly. Existing published ARM digests are the previous source checkpoint and require rebuilding before future OCI deployment. Signed-release/native-device/OCI gates are unchanged.


## Network UI override — 23 November 2026

Configurable network scheduling policies and Network details are removed, including backend enforcement and persisted settings (migration 0025). Do not restore them from older specification clauses. Named links use /join-network-a/<token>; Show / copy link reveals and copies within the network row, never under creation. See docs/NETWORK_JOIN_LINKS.md (repository root relative). This change does not execute the separately blocked factory reset.
