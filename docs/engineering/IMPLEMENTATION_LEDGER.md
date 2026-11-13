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
| 6. Kubernetes execution | Ephemeral Kubernetes Jobs, capacity, cancellation, leases and orphan reconciliation | Optional native broker overlay, persisted execution IDs, two-slot admission, cancellation and reconciliation implemented. Isolated MySQL and simulated Kubernetes lifecycle passed. Live RuntimeClass, node-loss and real Job acceptance remain open. |
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
