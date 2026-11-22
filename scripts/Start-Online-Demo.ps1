# Temporary laptop-hosted HTTPS demonstration, not independent cloud hosting.
# Run with PowerShell 7. Requires the existing authenticated free ngrok installation.
param([string]$PublicOrigin='https://omnicompile-core-platform.vercel.app')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
$docker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
$demoDir = Join-Path $projectRoot '.runtime/online-demo'
New-Item -ItemType Directory -Path $demoDir -Force | Out-Null
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
if ($url -notmatch '^https://[a-z0-9-]+\.ngrok-free\.app$') { throw 'Unexpected demo URL; review before exposing the application.' }
# Parse credentials internally; never print or copy the plaintext password.
$hash = node --input-type=module -e 'import fs from "node:fs";import dotenv from "dotenv";import argon2 from "argon2";const e=dotenv.parse(fs.readFileSync(".env"));process.stdout.write(e.ADMIN_PASSWORD_HASH||await argon2.hash(e.ADMIN_PASSWORD,{type:2,memoryCost:19456,timeCost:2,parallelism:1}));'
if ($LASTEXITCODE -ne 0 -or !$hash.StartsWith('$argon2id$')) { throw 'Could not prepare production authentication.' }
$environment = @{NODE_ENV='production';PUBLIC_BASE_URL=$PublicOrigin;COORDINATOR_PUBLIC_URL=$PublicOrigin;ALLOWED_ORIGINS=$url;OMNICOMPILE_REALTIME_PUBLIC_URL=$url;OMNICOMPILE_TEMPORARY_DEMO_ORIGIN=$url;ADMIN_PASSWORD='';ADMIN_PASSWORD_HASH=$hash.Replace('$','$$')}
$mounts = @('runtime-policy.ts','config.ts','server.ts','realtime-tickets.ts') | ForEach-Object { @{type='bind';source=(Join-Path $projectRoot "apps/coordinator/src/$_");target="/app/apps/coordinator/src/$_";read_only=$true} }
$override = @{services=@{'omnicompile-coordinator'=@{environment=$environment;volumes=@($mounts)}}}
$overrideFile = Join-Path $demoDir 'compose.json'
$override | ConvertTo-Json -Depth 10 | Set-Content $overrideFile
$url | Set-Content (Join-Path $demoDir 'url.txt')
$oldMode=$env:VITE_BACKEND_MODE; $oldApi=$env:VITE_API_BASE_URL; $oldWs=$env:VITE_WS_BASE_URL; $oldTickets=$env:VITE_REALTIME_TICKETS
try {
    $env:VITE_BACKEND_MODE='remote'; $env:VITE_API_BASE_URL=$PublicOrigin; $env:VITE_WS_BASE_URL=$PublicOrigin.Replace('https://','wss://'); $env:VITE_REALTIME_TICKETS='true'
    npm run build -w @omnicompile/web
    if ($LASTEXITCODE -ne 0) { throw 'Demo frontend build failed.' }
} finally { $env:VITE_BACKEND_MODE=$oldMode; $env:VITE_API_BASE_URL=$oldApi; $env:VITE_WS_BASE_URL=$oldWs; $env:VITE_REALTIME_TICKETS=$oldTickets }
& $docker compose -f docker-compose.yml -f $overrideFile up -d --no-deps --no-build omnicompile-coordinator
if ($LASTEXITCODE -ne 0) { throw 'Coordinator startup failed.' }
& $docker cp apps/web/dist/. omnicompile-frontend:/usr/share/nginx/html/
if ($LASTEXITCODE -ne 0) { throw 'Frontend publication failed.' }
for ($attempt=0; $attempt -lt 30; $attempt++) {
    try { $health=Invoke-RestMethod http://127.0.0.1:4100/ready; if ($health.status -eq 'ready') { break } } catch {}
    Start-Sleep -Seconds 2
}
if (!$health -or $health.status -ne 'ready') { throw 'Coordinator readiness failed.' }
Write-Host "Frontend: $PublicOrigin | Backend transport: $url"
Write-Host "If the tunnel URL changed, run: node scripts/Publish-Vercel-Demo.mjs"
Write-Host 'Keep this laptop, Docker, internet, and K: running. First-time visitors may need to click Visit Site.'
