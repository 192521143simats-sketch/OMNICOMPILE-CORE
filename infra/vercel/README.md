# Vercel static frontend preparation

Use the repository root as the build context and the configuration in this
directory as the local configuration input. Vercel builds the existing Vite
workspace and serves its static output. The application hostname terminates TLS
at the gateway in `Caddyfile`. Set `OMNICOMPILE_DOMAIN` to that hostname,
`OMNICOMPILE_COORDINATOR_UPSTREAM` to the Kubernetes coordinator service or
private TLS ingress, and `OMNICOMPILE_VERCEL_ORIGIN` to the HTTPS static
deployment origin. Deploy the gateway where both upstreams are reachable.

The browser uses the gateway hostname for HTML, login, the API and WebSocket
upgrades. Set the coordinator's public URLs and allowed origins to the gateway
HTTPS URL. Use its trusted proxy configuration for the actual gateway addresses.
The gateway sends SPA navigation to Vercel's index document without sharing
session cookies, authorization headers or invitation paths with the static
origin. The coordinator remains responsible for authentication and worker state.

Before launch, verify direct navigation and reload at login and dashboard,
secure cookie login and logout, role enforcement, invite approval, WSS
registration, task assignment, reconnect, and authenticated artifact downloads
through the public application hostname.

## Current temporary Vercel-to-laptop demonstration

The authorized public entry point is `https://omnicompile-core-platform.vercel.app`.
Run `pwsh -NoProfile -File scripts/Start-Online-Demo.ps1` with Docker already running.
If the ngrok origin changes, run `node scripts/Publish-Vercel-Demo.mjs` from the
repository root. It builds the frontend with the canonical same-origin HTTP API,
updates the external API route, and uploads only prebuilt static output.
The authenticated Vercel CLI/project link is required; no paid plan is needed.

API requests remain on `/api/*` at Vercel and are forwarded without caching.
Browser realtime tickets are obtained through that API and consumed once at the
direct backend WSS endpoint; ordinary session/enrollment cookies stay HttpOnly
and scoped to Vercel. Do not assume the legacy `/ws/*` external rewrite supports
WebSocket upgrades: it failed actual verification. Native installation pages
provide the native backend invitation address for existing applications.

Pages: `/`, `/login`, `/signup`, `/admin`, `/dashboard`, `/worker`, `/web-worker`,
`/browser-worker`, `/windows-worker`, `/android-worker`, plus existing `/join/*`.
Platform-specific enrollment carries the invitation in `?token=`. The invitation
is still validated by the coordinator; a platform page alone grants no access.
Keep the laptop awake, K: attached, Docker and internet running. This is a
laptop-dependent demo and does not satisfy independent/PC-off cloud operation.
