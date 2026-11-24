# Laptop backend through Tailscale Funnel

The Vercel frontend uses `https://omnicompile-server.tail4c8dab.ts.net` as its
backend transport. Railway is deferred. MySQL, artifacts and compiler tools stay
on the laptop; Funnel supplies public HTTPS/WSS access, not independent hosting.

Tailscale is installed at `D:\Tailscale\tailscale.exe`. Its Windows service is
Running/Automatic. The operator authorized Funnel and configured it with:

```powershell
& 'D:\Tailscale\tailscale.exe' set --hostname=omnicompile-server
& 'D:\Tailscale\tailscale.exe' funnel --bg http://127.0.0.1:5173
& 'D:\Tailscale\tailscale.exe' funnel status
```

The background configuration persists without an open PowerShell window. Keep the
device name and tailnet unchanged to retain this hostname. Reboot recovery has
not yet been tested. Docker and the application must also be running, and the
laptop must remain awake with internet and its artifact disk available.

The ignored `.runtime/online-demo/operator-transport-url.txt` pins this hostname
for the existing launcher. Startup no longer needs a newly generated Quick Tunnel
URL. Vercel API rewrites target Funnel; browser WebSockets use authenticated
one-use tickets and native workers use authenticated endpoint discovery. The
publisher accepts this exact ts.net hostname, not arbitrary ts.net destinations.
No credentials are included in frontend configuration.

Verification: public Vercel administrator login, ticket creation and authenticated
WSS snapshot passed; the temporary verification session was revoked. Transport
validation tests passed. No database reset, job or enrollment was created.

## Follow-up acceptance test

The public transport smoke passed again after deployment: nine frontend page
routes returned HTML successfully, and both Vercel and direct Funnel API requests
correctly rejected unauthenticated sessions. Administrator login, ticket issuance
and the authenticated WSS snapshot passed. All eight application containers
remained healthy, and the normal startup script completed successfully.

Isolated integration instance `e762014c748c5362` completed with exit code zero.
It exercised real C, Python and Java tool compilation and sandboxed execution for
each logical Web, Windows and Android worker identity (nine combinations), with
expected output `42`. It also checked worker attribution, rejection of unassigned
compiler requests, and zero job success rate for deliberate Python runtime and
syntax failures. These compilation checks used a separate local coordinator and
disposable MySQL fixture; they do not constitute physical-device or public-path
compilation tests. Production data was preserved. Reboot recovery remains untested.

Detailed logs remain in ignored `.runtime/integration/e762014c748c5362` and
`.runtime/online-demo/realtime-audit.json`; secret-bearing fixture files are not
committed.

Funnel is beta and bandwidth-limited; this setup is not an uptime guarantee.
See https://tailscale.com/docs/features/tailscale-funnel.
