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

Funnel is beta and bandwidth-limited; this setup is not an uptime guarantee.
See https://tailscale.com/docs/features/tailscale-funnel.
