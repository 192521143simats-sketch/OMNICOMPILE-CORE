# Security policy

Report a suspected vulnerability through the repository Security tab using **Report a vulnerability** if private reporting is enabled. Otherwise, contact the repository owner privately and ask for a secure reporting channel. Include the affected commit or release, reproduction steps, impact, and any relevant redacted logs. Keep credentials, worker enrollment links, submitted source code, and exploit details out of public issues.

Security fixes target the current default branch. Rebuild and re-enroll legacy workers when moving to protocol v2.

OmniCompile Core scopes workers to a network and validates task, node, and attempt identity before accepting results. Verification strength depends on the task. Transport security and payload integrity alone do not establish computational correctness.

Use HTTPS and WSS, an Argon2id administrator password hash, and restricted database access for hosted installations. The local Docker profile disables submitted-program execution. Native compiler processes still require external isolation for hostile multi-tenant workloads. Kubernetes configuration is provided for deployment preparation.

See the [security model](docs/SECURITY.md) and [threat model](docs/engineering/SECURITY_THREAT_MODEL.md) for control boundaries and operational details.

## Trust and failure boundaries

The [master build specification](OMNICOMPILE_MASTER_BUILD_SPEC.md) and [product vision](docs/engineering/specification/OMNICOMPILE_CORE_VISION.txt) define the target. The [implementation overrides](docs/engineering/USER_REQUIREMENT_OVERRIDES.md) record later decisions.

- Compilation users, administrators, and workers have separate authorization. Users see their own jobs and artifacts. Enrollment requires consent and administrator approval. An invitation grants only the ability to request enrollment into its network.
- Workers receive capability-matched, bounded tasks. The coordinator checks task ownership, attempt identity, and applicable result verification before accepting outputs. A disconnected worker can lose its lease and eligible work can be retried. Late results from superseded attempts are rejected.
- Browser and Android workers execute supported portable operations. Native Windows toolchain access is a separate trust boundary. Review execution isolation and deployment evidence before exposing the service to untrusted workloads.
