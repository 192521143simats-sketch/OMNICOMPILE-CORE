# Docker language execution rollout — 2026-11-05

Approved names use omnicompile-coordinator, omnicompile-frontend, omnicompile-c-worker, omnicompile-python-worker, omnicompile-java-worker, omnicompile-mysql, omnicompile-data and omnicompile-network.

1. Preserve existing data and inventory compilation entry points, worker authentication, artifacts, verification and execution adapters.
2. Rename the authoritative Compose file to docker-compose.yml and update all maintained consumers. Validate rendered configuration.
3. Separate compiler execution behind the existing authenticated task contracts. Provide bounded language-specific environments and actual toolchain detection. Retain artifact ownership and verification.
4. Update startup to manage project services only. Migrate project volume only through a verified transfer with the original retained until acceptance. General MYSQL is outside this rollout.
5. Prepare matching Kubernetes resources without applying them. Keep a single coordinator until shared connection/scheduling ownership is supported.
6. Run isolated language, artifact, authentication, recovery and worker regressions, then real Docker integration. Record failures and pending gates.

Windows host locations and Linux container paths are distinct. Host Python/Java locations stay on C and C tooling on D. No compiler capability is inferred from installation paths alone.

Current acceptance: Docker compilation, authenticated three-worker routing, data migration/persistence and protected-file denial have passed local acceptance. See docs/engineering/DOCKER_LANGUAGE_ACCEPTANCE_2026-11-06.md. Kubernetes resources are statically validated preparation only. Program execution remains under the existing disabled Compose policy.
