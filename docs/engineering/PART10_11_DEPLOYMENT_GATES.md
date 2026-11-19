# Parts 10/11 local deployment preparation

Local source/configuration audit: 19 November 2026. Public OCI and Vercel delivery
is held for target infrastructure and hosted acceptance. No cloud resources,
accounts, domains, live cluster resources or local Docker services were changed.

## What the Windows startup button actually starts

`START-OMNICOMPILE.bat` checks Docker Engine and starts Docker Desktop when needed.
It calls `scripts/Initialize-Environment.ps1`, then
`infra/docker/operations/Start-Containers.ps1`. The latter validates Compose,
builds images unless explicitly skipped, starts the Compose project with readiness
waiting, provisions and approves three scoped compiler enrollments, restarts
language services whose credentials changed, and checks database, executor,
coordinator and frontend health. The BAT opens `http://localhost:5173/` only after
that script succeeds. Existing application data and the separate general MySQL
instance are preserved by this startup flow.

Compose sets coordinator `OMNICOMPILE_EXECUTION_MODE=docker-broker`. The BAT does
not apply Kubernetes manifests, select a Kubernetes context, provision OCI, or
deploy Vercel. It depends on the development computer continuing to run.

Cloud Only, Local Only and Hybrid are per-job worker placement preferences:

| Preference | Meaning in the existing application |
| --- | --- |
| Cloud Only | Select compatible administrator-approved CLOUD workers; these can be the locally hosted Compose language services. This label does not establish public-cloud hosting. |
| Local Only | Require an eligible local native worker; reject admission when none is available. |
| Hybrid | Prefer eligible local workers and allow cloud fallback within the selected compatible network. This is not a Docker/Kubernetes deployment selector. |

Native Kubernetes execution uses `infra/kubernetes-native` and its broker provider
configuration. Desktop compatibility uses a separate overlay. The cloud base
configuration contains placeholder domains, CIDRs and local image tags and must
not be treated as a deployable OCI release unchanged.

## Local checks completed

All seven Kubernetes overlays rendered. Basic object metadata and Deployment
selector/template consistency checks passed. Base produced 17 resources; each
native/Desktop variant produced 26. Existing overlay and environment-preservation
tests passed: four tests total. These checks do not validate API admission,
RuntimeClass installation, CNI enforcement, registry access or available capacity.

The Vercel JSON and supported SPA route expressions passed local checks. Static
gateway checks confirmed API/WebSocket/health routing to the coordinator,
invitation-page rewrites to the static HTML shell without their token/query path,
and stripping Cookie, Authorization and Referer upstream and Set-Cookie downstream
on the static-origin route. Caddy syntax/runtime, TLS and live proxy behavior were
not exercised in this audit. No Vercel platform schema validation was performed.

## OCI gates held for the selected tenancy

1. Confirm tenancy, home region, architecture, node shape availability, quotas and
   a current cost plan for compute, storage, registry, load balancers, IPs, egress
   and backups. Historical free-tier research is not a no-cost guarantee.
2. Select the provider topology: native Kubernetes broker or private Docker
   execution host. Pin application and all compiler images by immutable digest;
   prove the target node architecture can run each image.
3. Supply actual TLS hostname, maintained ingress/controller configuration,
   trusted proxy ranges and private endpoints. Keep execution and database access
   private. Demonstrate enforced ingress/egress restrictions on the chosen CNI.
4. Provision Secrets outside Git, run the separate migration Job in release order,
   and verify durable database/object storage, backup and isolated restore. Test
   OCI S3-compatible put/get/delete against the chosen private bucket and region.
5. Install and validate the chosen sandbox RuntimeClass, including the existing
   compiler wrapper's Landlock and socket restrictions. A Ready Pod alone does
   not prove compiler-wrapper compatibility or isolation.
6. Exercise real C/Python/Java compilation, authenticated artifacts, admission
   limits, cancellation, receipts, restart recovery and eventual cleanup. If
   prewarming is enabled, verify input refresh, ownership fencing and drain on
   that cluster. Correlate execution records with real provider resources.
7. Demonstrate continued service and worker connectivity with the development
   computer switched off. Local Desktop acceptance cannot satisfy this gate.

## Vercel and shared-origin gates

Use the existing `infra/vercel/vercel.json` with the repository root as build
context. Vercel supplies static assets; the public Caddy gateway sends `/api`,
`/ws`, `/health` and `/ready` to the coordinator and static content to Vercel.
The browser must use the shared gateway origin, with coordinator public URLs,
allowed origins and trusted proxies configured for it. Native worker URLs must
also point to the intended hosted coordinator origin.

Select the real project/team, static deployment origin and already-owned domain
before mutation. Domain registration, project assignment, authoritative DNS and
certificate readiness are separate gates. Use the exact records returned for the
chosen project/domain; do not assume a universal DNS target or change nameservers
without preserving the existing zone. No purchase or DNS change was attempted.

For a protected deployment, first inspect the existing authenticated CLI identity
and project link. Use `vercel curl` or origin-scoped short-lived Trusted Sources
OIDC headers for acceptance requests. Do not disable Deployment Protection.
Those test credentials do not automatically authenticate the deployed Caddy
static-origin proxy: choose and verify an intentionally accessible static origin
or an explicitly authorized origin-authentication design. Do not put bypass
credentials in source or expose them to the browser.

Hosted acceptance must cover direct navigation/reload, secure cookie login/logout,
USER/ADMIN authorization, invitation chooser and all platform paths, native package
downloads, authenticated artifact downloads, WSS registration/task assignment,
disconnect/reconnect, and prevention of session/token leakage to the static origin.
An HTTP 200 serving a protection/login page is not application acceptance.

Parts 10/11 remain incomplete until these external gates have recorded evidence.
