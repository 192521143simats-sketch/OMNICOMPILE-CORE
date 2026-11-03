# Deployment rebuild and independent verification

**Goal:** Rebuild removed deployment resources around the existing React/Fastify/MySQL/compiler/worker contracts and verify actual local behavior.

**Architecture:** Preserve existing source and migrations. Use MySQL 8.4 (`MYSQL`, loopback port3306, named `mysql-data`, database `omnicompile`) locally. Keep secrets in ignored environment configuration. Compose provides MySQL, one controlled migration task, one coordinator and a same-origin web proxy. Kubernetes retains one coordinator and isolated execution Jobs; it is not declared deployed without a cluster.

**Execution checklist**

- [x] Inspect current changes, deployment deletions, runtime contracts and previous evidence.
- [ ] Fix demonstrated configuration/liveness defects with behavioral tests.
- [ ] Restore compatible execution sandbox; rebuild integrated Compose/images.
- [ ] Validate Kubernetes resources, policy, probes and migration ordering.
- [ ] Run unit/typecheck/build and isolated MySQL/compiler/recovery/web/worker regressions.
- [ ] Run actual Compose startup, authentication, service networking and persistence checks.
- [ ] Run browser/Windows together; Android build/tests without claiming absent-device acceptance.
- [ ] Review final files independently, record exact commands/outcomes/open gates.

Temporary execution evidence must be outside the repository when supported; new owned fixtures are cleaned after results are recorded. Preserve regression test source as part of maintainability. No public publishing, paid provisioning, secret commits or destructive database reset.
