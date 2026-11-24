# Temporary laptop-hosted HTTPS demonstration, not independent cloud hosting.
# PowerShell 7: accepts an operator-provided HTTPS origin, or the legacy ngrok installation.
param([string]$PublicOrigin='https://omnicompile-core-platform.vercel.app', [switch]$PrepareOnly, [string]$TransportUrl=$env:OMNICOMPILE_PUBLIC_TUNNEL_URL)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
$docker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
$demoDir = Join-Path $projectRoot '.runtime/online-demo'
New-Item -ItemType Directory -Path $demoDir -Force | Out-Null
# An operator may supply an already-running HTTPS transport. This branch does
# not install software or start a tunnel process.
$operatorUrlFile = Join-Path $demoDir 'operator-transport-url.txt'
if (!$TransportUrl -and (Test-Path -LiteralPath $operatorUrlFile)) { $TransportUrl = (Get-Content -LiteralPath $operatorUrlFile -Raw).Trim() }
if ($TransportUrl) { $url = $TransportUrl.Trim().TrimEnd('/') }
else {
try { $tunnels = (Invoke-RestMethod http://127.0.0.1:4040/api/tunnels).tunnels }
catch { $tunnels = @() }
$tunnel = @($tunnels | Where-Object { $_.config.addr -eq 'http://127.0.0.1:5173' })
if (!$tunnel.Count) {
    if (@($tunnels).Count) { throw 'Another ngrok tunnel is running; leave it intact and inspect manually.' }
    $agent = Start-Process -FilePath (Get-Command ngrok).Source -ArgumentList @('http','http://127.0.0.1:5173','--inspect=false','--log=stdout','--log-format=json') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $demoDir 'ngrok.log') -RedirectStandardError (Join-Path $demoDir 'ngrok-error.log') -PassThru
    $agent.Id | Set-Content (Join-Path $demoDir 'agent.pid')
    for ($attempt=0; $attempt -lt 20; $attempt++) {
        Start-Sleep -Seconds 1
        try { $tunnel = @((Invoke-RestMethod http://127.0.0.1:4040/api/tunnels).tunnels | Where-Object { $_.config.addr -eq 'http://127.0.0.1:5173' }); if ($tunnel.Count) { break } } catch {}
    }
}
if ($tunnel.Count -ne 1) { throw 'Demo tunnel did not start. Inspect .runtime/online-demo/ngrok-error.log.' }
$url = $tunnel[0].public_url
}
if ($url -notmatch '^https://[a-z0-9-]+\.(?:ngrok-free\.app|trycloudflare\.com)$') { throw 'Unexpected demo URL; review before exposing the application.' }
# Parse credentials internally; never print or copy the plaintext password.
$hash = node --input-type=module -e 'import fs from "node:fs";import dotenv from "dotenv";import argon2 from "argon2";const e=dotenv.parse(fs.readFileSync(".env"));const p=".runtime/online-demo/admin-password.hash";let h=e.ADMIN_PASSWORD_HASH;if(!h){try{const saved=fs.readFileSync(p,"utf8");if(await argon2.verify(saved,e.ADMIN_PASSWORD))h=saved;}catch{}if(!h){h=await argon2.hash(e.ADMIN_PASSWORD,{type:2,memoryCost:19456,timeCost:2,parallelism:1});fs.writeFileSync(p,h,{mode:0o600});}}process.stdout.write(h);'
if ($LASTEXITCODE -ne 0 -or !$hash.StartsWith('$argon2id$')) { throw 'Could not prepare production authentication.' }
$environment = @{NODE_ENV='production';PUBLIC_BASE_URL=$PublicOrigin;COORDINATOR_PUBLIC_URL=$PublicOrigin;ALLOWED_ORIGINS=$url;OMNICOMPILE_REALTIME_PUBLIC_URL=$url;OMNICOMPILE_TEMPORARY_DEMO_ORIGIN=$url;ADMIN_PASSWORD='';ADMIN_PASSWORD_HASH=$hash.Replace('$','$$')}
$override = @{services=@{'omnicompile-coordinator'=@{environment=$environment}}}
$overrideFile = Join-Path $demoDir 'compose.json'
$override | ConvertTo-Json -Depth 10 | Set-Content $overrideFile
$url | Set-Content (Join-Path $demoDir 'url.txt')
if ($PrepareOnly) { Write-Host 'Public transport configuration prepared.'; return }
& $docker compose -f docker-compose.yml -f $overrideFile up -d --no-deps --no-build omnicompile-coordinator
if ($LASTEXITCODE -ne 0) { throw 'Coordinator startup failed.' }
for ($attempt=0; $attempt -lt 30; $attempt++) {
    try { $health=Invoke-RestMethod http://127.0.0.1:4100/ready; if ($health.status -eq 'ready') { break } } catch {}
    Start-Sleep -Seconds 2
}
if (!$health -or $health.status -ne 'ready') { throw 'Coordinator readiness failed.' }
Write-Host "Frontend: $PublicOrigin | Backend transport: $url"
Write-Host "If the tunnel URL changed, run: node scripts/Publish-Vercel-Demo.mjs"
Write-Host 'Keep this laptop, Docker, internet, and K: running. First-time visitors may need to click Visit Site.'
