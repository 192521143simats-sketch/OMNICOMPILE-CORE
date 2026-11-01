# OmniCompile Core browser contribution

For a physical Android test when MIUI blocks automated taps, run PowerShell
`$env:GRID_X_ANDROID_MANUAL='1'; npm run verify:android-browser` and follow the
console's consent/pause/reload/resume/HOME/leave prompts. The verifier still checks
actual coordinator state and persisted computation results; manual taps do not
substitute for result assertions. Keep the phone unlocked. This mode does not
change its sleep setting, inject input or clear Chrome data. USB loopback testing
is not public-internet deployment evidence.

Use a current Chromium browser on desktop or Android. Open the network link,
explicitly consent, and keep the worker tab visible. The browser uses the same
protocol v1/coordinator, HttpOnly worker cookie, task leases and result storage
as native workers. Never copy credentials into URLs or browser storage.

Supported: SHA-256, bounded digest chains, prime counting, signed integer matrix
multiplication, deterministic uint32 benchmark and C IR optimization. Native
GCC/CPython/JDK compilation is not a browser capability. Benchmarks report real
execution time, not a claimed universal speedup or fabricated score.

Each attempt gets its own Web Worker, with a main-thread duration ceiling from
the catalogue (10 or 30 seconds). Long digest/sieve/portable loops yield and
report completed work units; progress is computation, not coordinator acceptance.
Pause, background, freeze, offline, cancellation and teardown terminate owned
work, clear timers and prevent late callbacks publishing another attempt's result.
Coordinator independently verifies portable results and records durable attempts.
Schema limits bound inputs/allocations; memory estimates exclude runtime overhead.
Browsers cannot enforce an OS-level RAM quota or report exact OS CPU/free RAM.
Unknown measurements are explicitly marked unavailable, never replaced by guesses.

Pause withdraws the connection without revoking enrollment; resume retains node
identity. A nonsecret tab-scoped pause preference survives refresh when session
storage is available. Only this preference is stored, never an authentication
secret. With storage disabled the in-memory pause still works. Leave revokes the
enrollment. Joining another network requires explicit consent. Refresh restores
the same network's existing enrollment through authenticated `/api/worker/me`.
Another tab may take over that enrollment; the prior tab stops reconnecting
until explicitly resumed, avoiding reconnect wars.

Mobile OSs may freeze/discard tabs without reliably delivering a final event.
Heartbeat expiry and bounded task leases are the fallback; there is no promise
that browser contribution continues while the phone is locked or in background.
Android browser contribution is not the native Android application/APK (Phase 8).

## LAN versus internet

`localhost` on a phone means the phone, not the coordinator PC. On the same LAN
or reachable hotspot, use the PC's reachable address and the existing LAN startup
configuration. Guest Wi-Fi isolation, carrier NAT and firewall rules can prevent
reachability even with strong signal. A different Wi-Fi/cellular connection
requires a reachable public host, approved VPN or separately approved tunnel.

Production needs a trusted HTTPS certificate and same-origin WSS. Build with
`npm run build`; serve only `apps/web/dist`, not the project directory. The
optional `infra/web/Caddyfile` serves the SPA and proxies `/api`/`/ws` to the
existing host coordinator. Configure `GRID_X_DOMAIN` to your approved hostname
and `GRID_X_WEB_ROOT` to that absolute built directory, then validate with
`caddy validate --config infra/web/Caddyfile` before an approved deployment.

Configure existing coordinator environment: `NODE_ENV=production`,
`PUBLIC_BASE_URL=https://<approved-host>`, an Argon2id `ADMIN_PASSWORD_HASH`, no
plaintext `ADMIN_PASSWORD`, and explicit trusted proxy IPs if applicable. Keep
MySQL on its existing private Docker port/volume. Do not expose MySQL or Vite's
development server publicly. Ensure the chosen edge can reach the coordinator;
this Caddyfile assumes both run on the same host. Firewall/DNS/certificate
issuance/publication require deployment approval and actual verification.

References: [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy),
[Chrome lifecycle](https://developer.chrome.com/docs/web-platform/page-lifecycle-api).

## Reproducible acceptance

With Docker and installed Microsoft Edge, use the repository Node 24 LTS PATH,
then `npm run verify:browser`. For test-only local TLS termination:
`$env:GRID_X_TEST_TLS='1'; npm run verify:browser` in PowerShell. TLS mode needs
OpenSSL (Windows uses the installed Git OpenSSL). It creates one-day test keys
only in ignored fixture storage and accepts its self-signed certificate only in
the isolated browser context. This proves HTTPS/WSS plumbing, not public trusted
TLS or internet deployment. No global trust/certificate settings are changed.

Physical Android: connect via USB, enable USB debugging and authorize ADB; run
`adb devices -l`, then `npm run verify:android-browser`. Xiaomi/MIUI may additionally
require USB debugging (Security settings) for authorized native test taps. The
runner uses an isolated unique localhost origin and temporary USB reverse rule,
normal Chrome and observed accessibility bounds; no helper APK or user-data wipe.
A phone-sized/Android-user-agent desktop context is mobile
emulation, not a physical-device pass. See Phase 6 acceptance for actual evidence.
