# Kubernetes preparation

Render locally with `kubectl kustomize infra/kubernetes`. The render uses
placeholder DNS names, a documentation-only broker CIDR and local image tags.
Set the public HTTPS hostname, ingress class, trusted proxy CIDR, private
executor and object-storage endpoints, and immutable registry image references
before cluster validation.

The coordinator is single-replica because WebSocket ownership is process-local.
The language services use one pre-enrolled and approved CLOUD identity per
language. The coordinator and language services call the existing execution
broker over private HTTPS. Run that broker on a dedicated Linux execution host
with the three Compose language images, the same executor token, and restricted
network access to its TLS gateway. The broker launches the same disposable
workloads used by the Docker verification suite. The Kubernetes workloads have
no Docker socket or Kubernetes API token.

Provision Kubernetes Secrets through the site's secret manager. The runtime
secret needs `DB_PASSWORD`, `MYSQL_ROOT_PASSWORD`, `ADMIN_USERNAME`, and
`ADMIN_PASSWORD_HASH`. Use separate migration credentials with the schema
permissions required for migrations. The compiler secret uses key `token`.
The executor secret uses key `token`. The artifact secret uses keys `access`
and `secret` for the private bucket. Each worker identity secret uses key
`credential`. Enroll workers using the coordinator APIs and store their
credentials securely before bringing up the worker deployments.

Validate the database and run the separately rendered migration Job before
starting the coordinator. Use a unique Job name per release and the same
coordinator image digest as the rollout. The MySQL StatefulSet retains its
PVC. Select a storage class and validate backup and restore before launch.

The Ingress routes `/api` and `/ws` to the coordinator and SPA requests to the
frontend. For the optional Vercel static origin, use the same-origin gateway
described in the sibling Vercel directory. The external broker and storage
endpoints, TLS, network policy and ingress upgrades require a real staging
acceptance test before public release.

## Dedicated execution host

From the repository root on the execution host, provide the ignored
`.runtime/docker/secrets/executor.token` with the same value as the cluster
executor secret. Supply the required Compose interpolation variables through the
host environment. Build the broker and all three language images from the same
release, then start only the broker with the dedicated host override.

```sh
docker compose build omnicompile-executor omnicompile-c-worker omnicompile-python-worker omnicompile-java-worker
docker compose -f docker-compose.yml -f infra/kubernetes/executor-host.compose.yml up -d --no-deps omnicompile-executor
```

Run the included `Executor.Caddyfile` on that host with the executor's private
DNS hostname and the cluster's actual egress CIDR. Provision a certificate trusted
by the coordinator and workers, and restrict port 443 to the same cluster egress
range at the firewall. The broker itself binds only to host loopback through
the Compose override. Use a dedicated host because the broker's Docker socket
grants it authority over that Docker daemon.
