# OCI and release readiness

Reviewed 12 November 2026. This checkpoint records the deployment preparation and
the evidence required before provisioning an environment.

## OCI capacity and cost

| Resource | Published allowance or charge | OmniCompile implication |
| --- | --- | --- |
| OKE control plane | Basic is listed as free. The India price list shows Enhanced at ₹9.5545 per cluster-hour. | Start cost evaluation with Basic and managed node pools. Basic lacks virtual nodes, self-managed nodes, workload identity and a financially backed SLA. Compute, network and storage eligibility must be checked separately. [India price list](https://www.oracle.com/in/cloud/price-list/) · [OKE cluster types](https://docs.oracle.com/en-us/iaas/Content/ContEng/Concepts/contengclustersnodes.htm) |
| Ampere compute | The current Always Free resource guide lists 1,500 A1 OCPU-hours and 9,000 GB-hours per month, equivalent to two OCPUs and 12 GB for Always Free tenancies. Oracle's India price list shows a separate allowance for paid tenancies. | Confirm the actual account class, home-region quota and managed-node shape availability in the tenancy. The locally inspected language images are Linux amd64. Build and run all three toolchain images on arm64 before relying on A1. Oracle may reclaim idle Always Free compute. [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) |
| Boot and block storage | 200 GB combined in the home region and five volume backups. | Count every node boot disk, the MySQL PVC and any execution host before selecting a topology. [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) |
| Public networking | Oracle lists one Always Free 10 Mbps Flexible Load Balancer and one Network Load Balancer. | Confirm the tenancy's existing allocations, the chosen load-balancer shape and egress pricing before provisioning. Keep the broker endpoint private. [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) |
| Object Storage | The free-only account allowance is 20 GB across storage tiers and 50,000 API requests per month. The guide lists a tier split for paid or trial accounts. | Test a private bucket with OCI Customer Secret Keys, the regional path-style S3 endpoint, and coordinator artifact put/get/delete. Set `OMNICOMPILE_ARTIFACT_REGION` to the OCI endpoint region. The default `us-east-1` remains available for Docker and OCI home-region compatibility. [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) · [OCI S3 compatibility](https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/s3compatibleapi.htm) |
| Managed MySQL | Oracle documents one home-region MySQL.Free system per commercial tenancy, 50 GiB data storage, latest-version upgrades and restrictions on manual backups. | The manifests currently describe a MySQL StatefulSet. Evaluate HeatWave against the exact migrations, privileges, backup and restore before selecting it. [HeatWave features](https://docs.oracle.com/en-us/iaas/mysql-database/doc/features-mysql-heatwave-service.html) · [Backup restrictions](https://docs.oracle.com/en-us/iaas/mysql-database/doc/overview-backups.html) |

A free control plane alone cannot establish a no-cost deployment. Confirm a
costed plan for node pools, registry, load balancing, IPs, egress, storage,
backups and Vercel before creating resources. Small free-tier limits also
constrain simultaneous builds and leave little capacity for high availability.

## Deployment boundary

- The Kubernetes preparation renders a single coordinator, three language
  peers, a frontend, and MySQL. Its migration Job is applied separately. The
  current broker runs on a dedicated Docker host behind private HTTPS.
  In-cluster per-assignment execution Jobs, a Kubernetes execution provider,
  prewarming and OCI infrastructure provisioning remain open.
- Choose an OKE pod networking setup that enforces NetworkPolicy. Oracle
  documents Calico policy integration with VCN-native pod networking. Test
  restrictions from workload pods, including egress to the executor and
  object storage, before accepting the configuration.
  [OKE network policy example](https://docs.oracle.com/en-us/iaas/Content/ContEng/Tasks/contengsettingupcalico.htm)
- Use the same public gateway origin for frontend navigation, the coordinator
  API and worker WebSockets. Vercel serves the static build through the gateway.
  The gateway keeps recognized enrollment paths and query strings out of
  static-origin requests. Hosted HTTPS/WSS and externally connected workers
  still need a staging test.
- Validate registry pulls and architecture-specific image digests, the
  migration Job against the selected database, retention on PVC and object
  storage, and a restore into an isolated database. Exercise coordinator and
  execution-host restart behavior with active jobs before release.

## Native packaging and release gates

- Windows packages as an x64 NSIS installer with a pinned Node runtime. The
  packaging script disables executable signing and emits SHA-256 integrity
  metadata for an unsigned development build. Release requires a trusted
  signing identity, signature verification and a clean-machine installation.
- Android builds the native Compose worker with minimum API 25 and target API
  36. The local distribution script reads a debug APK and labels it accordingly.
  Release requires an authorized signing identity, signature verification and
  device installation from the production download flow. The local API 25
  worker evidence does not establish hosted connectivity.
- Existing GitHub verification covers workspace checks, dependency audit and
  Docker compiler and execution smoke tests. Native build matrices, Kubernetes
  validation in CI, image and secret scanning, SBOMs and deployment approval
  gates still need release automation.

## Verification for this checkpoint

- Local Kustomize rendering returned 17 resources. The migration Job remains
  separate. The workstation has no current Kubernetes context.
- A disposable Caddy container and fixture upstream verified the invitation
  chooser and all three platform URLs, including valid trailing slashes where
  exercised, HTML-shell rewrites, local rejection of unsupported join paths,
  static credential-header stripping, and coordinator API path preservation.
  The Vercel route expressions matched the same platform paths locally.
- These checks establish local routing and rendered configuration. OCI/Vercel
  provisioning, actual registry pulls, deployment, TLS and recovery evidence
  await the staging environment and authorized resource plan.
