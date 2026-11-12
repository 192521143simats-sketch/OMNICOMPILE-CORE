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
