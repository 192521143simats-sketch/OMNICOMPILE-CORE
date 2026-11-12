# OmniCompile Core implementation ledger — Parts 1–9

This ledger tracks the nine ordered milestones in the unified enrollment, DECTA
and OCI directive. Parts 10 and 11 remain outside this ledger. The earlier
requirements ledger and acceptance records remain the evidence for their
original scope.

## Repository baseline

The baseline is commit `177a54f`. The monorepo has a Vite/React frontend,
Fastify/MySQL coordinator, TypeScript worker and orchestration packages,
Electron Windows app, native Kotlin/Compose Android app, and independent
C/Python/Java compiler packages. Existing Docker runs use a private broker and
artifact storage. The Kubernetes render and Vercel gateway are preparation for
a hosted environment. See [OCI readiness](OCI_DECTA_READINESS.md), [worker protocol](WORKER_PROTOCOL.md),
[three-worker audit](THREE_WORKER_AUDIT_2026-11-12.md), and
[release readiness](RELEASE_READINESS.md).

| Part | Baseline and implementation state | Next acceptance gate |
| --- | --- | --- |
| 1. Audit and alignment | Audited enrollment, native workers, coordinator, MySQL, broker, compiler, artifacts, infrastructure and CI. File ownership and reuse decisions are below. | Update the ledger after every verified change and retain evidence for each gate. |
| 2. Unified invitation | Existing reusable network links and expiring single-use invitations use the same join contract. Existing transaction tests cover single-use consumption and network capacity. The platform chooser, administrator inventory, expiry controls, copy feedback and revocation are implemented. | Generation, copy, route selection, revocation, one-time consumption and node association have local evidence. Configurable multi-use scoped invitations and inventory pagination remain open. |
| 3. Platform onboarding | Existing browser consent and native installation guidance are reusable. Separate Web, Android and Windows routes are implemented. Existing native package metadata and local download integrity checks are reused. | Add durable platform-selection sessions and short-lived download grants. Browser hints are compatibility signals. Native proof and private package delivery need separate verification. |
| 4. Native integration | Windows and native Android have existing installer/APK build paths, scoped credentials and shared coordinator protocol. Prior mixed-worker evidence covers Windows and physical Android API 25. | Rerun current one-link acceptance with signed installers on representative devices. Verify version, platform and enrollment evidence without weakening consent. |
| 5. DECTA foundation | Existing fixed C/Python/Java images and authenticated Docker broker run real bounded ephemeral jobs. The broker client is already shared by compiler and execution callers. | Extend this contract with provider capabilities and health, versioned image registry, job identity and lifecycle records. Keep the Docker path covered by integration tests. |
| 6. Dynamic execution | Docker creates isolated child containers and has concurrency limits, cancellation and cleanup on normal process exit. Kubernetes currently calls a private external Docker broker. | Implement the Kubernetes provider, durable leases and reconciliation, per-job quotas, environment monitoring, and test cancellation and node loss. Prewarming requires an isolation and measured overhead gate. |
| 7. Distributed compiler | C supports distributed function-level IR work. Native fallback C, Python and Java use one source per compilation task. Coordinator verification and owned artifact publication are operational. | Add project-level source contracts and dependency-aware partitions, then validate linking, module/classpath semantics and reconstruction against trusted baselines. Record measured costs and throughput. |
| 8. OCI and Vercel | Static manifests and same-origin gateway are present. CI builds and tests the local stack. OCI capacity, registry, staging DNS, TLS and the target provider require verification. | Validate the tenancy and cost estimate, publish approved signed/digested artifacts, and verify staging reachability and backup/restore after authorization. |
| 9. System validation | Existing suites cover unit tests, isolated MySQL, authentication, mixed-worker recovery and disposable Docker execution. They do not establish hosted acceptance. | Run all platform, security, failure, performance and hosted checks against the release candidate. Record exact results and remaining limits. |

## Interfaces and ownership

- Enrollment frontend owns the chooser and the platform routes in `apps/web/src`.
  All routes retain the original invitation URL for native apps. Browser consent
  reuses `POST /api/join/:token/accept`; opening or selecting a page never
  consumes an invitation.
- The coordinator owns invitation status and admission. Extend
  `apps/coordinator/src/networks.ts` and `server.ts` using the existing
  `worker_invitations`, `network_enrollments` and `nodes` relations. The
  inventory returns lifecycle state and enrollment/node IDs. Raw single-use
  tokens are only returned at creation.
- Native Windows and Android keep their existing invitation parsers, credential
  stores and lifecycle. Package delivery authorization belongs in the
  coordinator distribution service. Both native apps continue using protocol v2.
- Execution engineering starts from `docker-executor.ts` and the existing
  orchestration client. Workload APIs and worker capabilities stay independent
  of the execution provider. Keep the Docker socket on the trusted broker host.
- Compiler engineering owns project manifests and graph scheduling in the
  compiler packages and coordinator task pipeline. Artifact storage and
  verification remain authoritative at the coordinator.
- Deployment engineering owns nested route parity in `infra/vercel` and OCI
  readiness evidence. The current deployment files cannot prove hosted behavior.
- Verification owns isolated MySQL and browser fixtures under `scripts`.
  Validate application contracts with production-style traffic, then exercise
  fault cases and validate the exact release artifacts.

## Release boundaries

Native install provenance and browser platform hints are separate. Existing
package hashes check integrity. They do not attest to the browser OS or replace
platform signing. The local Docker broker uses a privileged trust boundary and
requires a dedicated host. The OCI Kubernetes Jobs provider and public
Vercel/OCI acceptance remain open.

## Verified increment

- Chooser and installer unit tests cover all three choices, invitation scope,
  inactive links, selected-platform content and original invitation handoff.
- Admin invitation UI tests cover generation, copy, lifecycle status and revoke.
- The isolated enrollment run passed all 13 migrations and verified that the
  inventory is admin-only, contains no raw invitation token, and links a consumed
  invitation to its registered node. The first run exposed an outdated
  11-migration assertion, which was corrected.
- The isolated browser run passed the one-link chooser, browser consent,
  invitation revocation, admin and user access, and compiler uploads/downloads.
- The local Caddy route fixture and Vercel schema validation passed for the new
  nested routes. No hosted environment was exercised.

Next implementation entry point is the coordinator distribution service and its
existing file integrity registry. Add durable, invitation-bound platform
selection and expiring package authorization before any native download gate is
reported complete.

The workspace gate passed type checking, builds, 389 default Vitest cases
and 31 script tests. The separate broker suite enabled the 11 opt-in cases
and passed all 12 cases in its file. The browser and packaged Windows worker
also passed the mixed-worker suite through the new chooser. All eight local
Docker services were healthy after fixture cleanup. Android native enrollment
was unchanged and was outside this increment's mixed run.
