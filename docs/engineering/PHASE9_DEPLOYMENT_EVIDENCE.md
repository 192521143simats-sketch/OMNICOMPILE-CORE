# Phase 9 deployment foundation - 17 October 2026

This records verified local foundation work, not a public deployment or universal
untrusted-code containment acceptance. No account, cluster, public endpoint,
registry publication or paid resource was created. Existing databases, volumes
and secrets were preserved.

## Implemented

- Root-context coordinator and web container recipes, SPA nginx configuration,
  and Docker context exclusions for secrets, runtime state and generated files.
- Kubernetes API execution dispatch with bounded payload transport, isolated
  execution namespace, scoped RBAC, deny-all NetworkPolicy, quota and admission
  templates. Existing Docker execution remains available; no Docker socket mount
  or execution-disabled substitute is used by the Kubernetes configuration.
- Separate migration CLI/Job and check-only coordinator migration startup.
- Disposable local container acceptance script:
  `node infra/containers/Verify-Images.mjs`.

## Verification evidence

| Command / check | Result | Verified scope |
|---|---|---|
| New Kubernetes executor test before implementation | Failed | Missing adapter reproduced. |
| Check-only migration test before implementation | Failed | Missing completeness validation reproduced. |
| `npx vitest run apps/coordinator/src/kubernetes-execution.test.ts apps/coordinator/src/migrations.test.ts` | Passed 12 tests | Seven payload/spec/fake-API tests and five migration tests. Fake API is not live Kubernetes execution. |
| `npm run typecheck -w @omnicompile/coordinator` | Passed | Adapter, dispatch, CLI and migration changes. Full repository verification is recorded separately. |
| `kubectl kustomize infra/kubernetes` | Passed, 476 lines | Local YAML transformation, not server schema/admission validation. |
| `kubectl config current-context` | Blocked | No current context configured. |
| Coordinator image build | Passed | `docker build -f infra/containers/coordinator.Dockerfile -t omnicompile-coordinator:phase9 .`; fresh final build exited 0. |
| Web image build | Passed | `docker build -f infra/containers/web.Dockerfile -t omnicompile-web:phase9 .`; actual production bundle built inside image, final build exited 0. |
| Execution image build | Passed | `docker build -t oa-omnicompile-execution:local infra/sandbox`; actual existing runner plus Kubernetes entry built. |
| Final `node infra/containers/Verify-Images.mjs` | Passed, fixture `65f766cf86870a1b` | Real disposable MySQL/container coordinator/web, separate migration apply/check, readiness nonce, administrator login, network creation, pending native enrollment, SPA deep-route fallback, UID1000 coordinator and UID101 web. Cleanup exited 0. |
| Earlier same local image smoke | Passed, fixture `e81df023f17269ef` | Same functional assertions before final server rate-limit and distribution concurrency guards; superseded by final image smoke above. |
| Bounded execution image Python smoke | Passed | Real read-only, network-none Docker container, PID64/memory512MiB/capability restrictions; `print(6*7)` returned `42`, exit0, measured144.03ms and13,914,112 peak memory bytes. Not Kubernetes containment evidence. |
| Execution image tool inspection | Passed | Python3.14.8 and GCC14.2.0 inspected directly in actual image. |

The first disposable fixture `b5e1ea654eb6cd00` failed: Docker's internal network
did not expose its requested host API port. Coordinator startup and migrations
had succeeded, but host acceptance could not proceed. The verifier was corrected
to use a dedicated Docker bridge with API/web ports published only on loopback,
and no MySQL host port. Both subsequent full reruns passed. Every fixture's own
containers and network were removed using exact ownership labels; no broad Docker
pruning or database-volume deletion was used.

The verifier never reads `.env` or mounts developer data. Generated fixture
passwords stay in child environments and diagnostic logs are redacted. All
requests and subprocesses have bounded deadlines. `.runtime` and `.codex` are
explicitly excluded from container build context.

## Final local image identities

These are local Linux/amd64 Docker content identities, not published registry
references. The final coordinator includes the server distribution guards and
the final web includes the latest terminal stylesheet changes.

- Coordinator: `sha256:1151b87245a272242fdc56d4eba76d727e699d39943fa2e3d0704f3d6acbc314`
- Web: `sha256:d23985ec7f4a6ac46a0c93a7e64d2aa8a119cb9a68fc2a2d89ccc1ee3e429879`
- Execution: `sha256:6d64a6c5aaff7b6c3f9f808687e9904d5dcd660e11750c53b992e22da56ff8b6`

After the final layout-preserving polish and typed CSS tests, the web image was
rebuilt on 17 October. Fresh image fixture `5335e7581a7b2db9` passed the same real
MySQL, migration apply/check, API/auth/enrollment, SPA and non-root assertions;
cleanup exited zero. This supersedes the earlier web image and smoke identity
above. No cluster or public-internet behavior is inferred.

## Unverified external gates

- No authorized cluster, domain, ingress or public endpoint exists.
- Kubernetes API/server validation, migration Job execution and actual sandbox
  Jobs are not verified. Local container startup does not close those gates.
- Require an installed and tested sandbox RuntimeClass, enforcing CNI denial,
  admission policy and actual PID limits before untrusted Kubernetes execution.
  A RuntimeClass name alone is not evidence of containment.
- Public HTTPS/WSS, unrelated-internet joining and continued service with the
  development computer powered off have not been tested.
- The execution Job does not sandbox existing coordinator-side compilation;
  that trusted-native boundary remains explicit.

Deployment, backup and rollback steps are in
`infra/kubernetes/DEPLOYMENT.md`. All image/DNS placeholders require reviewed
overlays and separate publishing approval. No claim of public launch, signature,
cluster deployment or universal compilation containment follows from these tests.

## Evidence-file recovery

After successful tests, a source-integrity check found this new evidence file
contained 5195 NUL bytes. The original bytes were preserved at
`.runtime/recovery/PHASE9_DEPLOYMENT_EVIDENCE-nul-20261016.bak`, and this document
was reconstructed from captured command outputs and fixture identities. No
application source or test result was invented to repair the documentation.
