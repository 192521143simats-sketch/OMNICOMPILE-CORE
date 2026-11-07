# Docker reset and rebuild

## Authority and approved resources

The user explicitly authorized discarding project Docker containers, images, data volumes, old build records and generated residue and rebuilding Docker integration. This overrides the earlier instruction to preserve project database records. Application source, installed toolchains and native worker deliverables remain outside destructive cleanup. Git changes use normal commits, preserving history.

The referenced deployment guide supplies Docker requirements. Its Kubernetes and Vercel instructions are excluded by the latest explicit user directive. Existing active Kubernetes manifests, runtime adapter and CI steps are retired.

Approved project service/image names are `omnicompile-coordinator`, `omnicompile-frontend`, `omnicompile-c-worker`, `omnicompile-python-worker`, `omnicompile-java-worker`, `omnicompile-mysql`, `omnicompile-executor` and `omnicompile-artifacts`. Docker image names must be lowercase. Project volume names are `OMNICOMPILE-MYSQL` and `OMNICOMPILE-ARTIFACTS`; networks are `omnicompile-network` and private `omnicompile-storage-network`.

The user separately authorized migrating the general-purpose `MYSQL` to `mysql:8.4`, volume `mysql`, loopback port3306. Its data was preserved, before/after SQL and authentication fingerprints were compared, and it was left stopped. Project scripts must never manage that container or mount its volume.

## Dependency and execution map

| Component | Dependencies | Persistent state | Communication |
|---|---|---|---|
| Web | React/Vite build, nginx runtime | None | Same-origin HTTP/WebSocket proxy to coordinator |
| Coordinator | Node24, Fastify, shared contracts/compiler frontend packages, MySQL and S3 SDK | MySQL metadata and private S3 artifact bytes | Worker protocol, internal compiler/executor/S3 APIs |
| Language services | Node24 peer, one selected GCC/G++, Python or JDK environment | Scoped enrollment identity outside image | Authenticated tasks and bounded broker requests |
| Executor | Node24, fixed Docker CLI, authenticated job schemas | No user artifact state | Docker daemon creates disposable language jobs |
| Disposable job | One fixed language image, filesystem restriction, time/output/resource bounds | Temporary task workspace only | Network disabled, JSON input/output |
| Project MySQL | Independent MySQL8.4 Dockerfile, migrations | OMNICOMPILE-MYSQL | Internal and host loopback3307 |
| Artifacts | Pinned S3-compatible object store | OMNICOMPILE-ARTIFACTS | Private storage network, authenticated coordinator access |
| Native Windows/Android and browser peers | Existing installable app/APK/browser runtime and protocol v2 | Their own scoped identities | Existing consent/enrollment/WebSocket protocol |

Android SDK/Gradle and Windows packaging dependencies belong to native build environments. They are not installed in the compiler services. Host Python/Java on C drive and C tooling on D drive remain unchanged.

## Implementation and acceptance checklist

- [x] Inspect referenced guide, images, repository, Git and actual Docker resources.
- [x] Confirm all added Docker resource names with the user.
- [x] Migrate general MySQL independently and preserve its data.
- [x] Remove six old project containers, project image tags, both prior project volumes and25 old project build-history records.
- [x] Move maintained Docker files under infra/docker and retire tracked active Kubernetes files.
- [x] Configure independent project MySQL with actual container/host port3307 and exact requested volume.
- [x] First no-cache build of seven project services passes; all seven report healthy.
- [x] Recreate scoped cloud enrollments and configure HeidiSQL project session.
- [ ] Rebuild all final images after broker security, execution modes and artifact persistence changes.
- [ ] Verify C/Python/Java compilation, artifacts and actual execution through disposable containers.
- [ ] Verify invalid code, isolation, limits, cancellation, authorization and exact owned cleanup.
- [ ] Verify cloud/local/hybrid selection, server-approved location and network isolation.
- [ ] Verify private object access, corruption rejection, SQL metadata, restart persistence and scoped orphan retention.
- [ ] Verify MySQL persistence, admin authentication and real backup/clone restoration.
- [ ] Run full workspace tests/builds and Docker integration; record exact failures and retests.
- [ ] Verify browser and Windows peer regressions; report actual Android device availability separately.
- [ ] Remove owned test residue, inspect Git staging, commit and push verified changes.
- [ ] Audit every Docker requirement against actual final state.

## Runtime cleanup

Automatic approval review rejected the combined cleanup command. The user removed the six named old runtime paths, and a subsequent filesystem check confirmed their absence. The new runtime uses `.runtime/docker`. The user requested that generated backups be removed after acceptance and that related files be grouped after the build.

## Evidence rules

Build success alone does not prove job success. Tests must inspect actual job state, task attempts, accepted results, bytes, program output/exit code, ownership checks and removed fixture resources. Measurements come from runtime records. Missing memory readings remain unavailable. No public hosting, registry publication, Kubernetes deployment or Vercel action is implied by local Docker acceptance.

Planning workflow reference: [Explore Plan & Ship in Codelit](https://codelit.io/plan-and-ship). This link is navigation only; no external project was created.

## Local acceptance results

- The eight-image Compose build passed after the Docker files were regrouped. Compose configuration validation passed.
- The isolated Docker pipeline compiled and executed valid C, Python and Java, rejected invalid submissions, checked downloads and recorded 12 verified worker results. Two concurrent jobs completed. The fixture did not modify application data.
- The broker passed eight live cases covering execution, input, runtime failure, timeout, combined output limits, filesystem and environment isolation, and controller output integrity.
- MySQL and object storage preserved fixture data across service restarts. Admin authentication remained valid. The isolated MySQL dump and restore ran in memory and produced no backup file.
- Workspace verification passed type checking, builds, 385 Vitest tests and 31 script tests. Eleven opt-in Vitest tests were skipped.
- Docker images, operator commands, and verification scripts are grouped under `infra/docker`; the nine example programs are grouped by language under `samples`.
