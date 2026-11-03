param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot), [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
Set-Location -LiteralPath $ProjectRoot
function Invoke-Docker {
    param([string[]]$Arguments)
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker operation failed: $($Arguments[0]). No data was removed." }
}
function Wait-Healthy([string]$Name, [int]$Seconds = 180) {
    $deadline = [DateTime]::UtcNow.AddSeconds($Seconds)
    while ([DateTime]::UtcNow -lt $deadline) {
        $status = & docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $Name 2>$null
        if ($LASTEXITCODE -eq 0 -and $status -eq 'healthy') { return }
        if ($status -in @('exited','dead')) { throw "$Name exited before readiness. Inspect docker logs $Name (do not share credentials)." }
        Start-Sleep -Seconds 2
    }
    throw "$Name did not become healthy within $Seconds seconds. Inspect docker logs $Name."
}
$envFile = Join-Path $ProjectRoot '.env'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Missing .env. Run scripts/Initialize-Environment.ps1 first.' }
$settings = @{}
foreach ($line in [IO.File]::ReadAllLines($envFile)) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
        $settings[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
    }
}
if ([string]::IsNullOrWhiteSpace($settings['MYSQL_ROOT_PASSWORD'])) { throw 'MYSQL_ROOT_PASSWORD must be configured in ignored .env.' }
if ($settings['DB_PORT'] -and $settings['DB_PORT'] -ne '3307') { throw 'Host development DB_PORT must be3307 for OMNICOMPILE-DATA; general MYSQL retains3306.' }
if ($settings['DB_NAME'] -and $settings['DB_NAME'] -ne 'omnicompile') { throw 'Expected application DB_NAME=omnicompile.' }
Write-Host '[3/6] Preparing genuine MySQL8.4 image and independent general MYSQL server...'
$mysqlImage = & docker image ls mysql:8.4 --quiet
if (-not $mysqlImage) { Invoke-Docker -Arguments @('pull','mysql:8.4') }
Invoke-Docker -Arguments @('image','tag','mysql:8.4','db-omnicompile-database:8.4')
$generalId = & docker container ls --all --filter 'name=^/MYSQL$' --format '{{.ID}}'
if ($generalId) {
    $generalRaw = & docker inspect MYSQL
    $general = ($generalRaw | ConvertFrom-Json)[0]
    $mapping = $general.HostConfig.PortBindings.'3306/tcp'
    $volume = @($general.Mounts | Where-Object { $_.Destination -eq '/var/lib/mysql' })
    if ($mapping.Count -ne 1 -or $mapping[0].HostIp -ne '127.0.0.1' -or $mapping[0].HostPort -ne '3306' -or $volume.Count -ne 1 -or $volume[0].Name -ne 'mysql-data') {
        throw 'Existing MYSQL has a different port/storage configuration. It was preserved; resolve the conflict explicitly.'
    }
    if ($general.Config.Labels.'com.docker.compose.project') { throw 'Existing MYSQL belongs to another Compose project; preserved without modification.' }
    if ($general.Config.Image -notin @('mysql:8.4','db-omnicompile-database:8.4')) { throw 'Existing MYSQL does not use the approved MySQL8.4 image; preserved.' }
    Invoke-Docker -Arguments @('start','MYSQL')
} else {
    $oldPassword = $env:MYSQL_ROOT_PASSWORD
    try {
        $env:MYSQL_ROOT_PASSWORD = $settings['MYSQL_ROOT_PASSWORD']
        Invoke-Docker -Arguments @('run','--detach','--name','MYSQL','--label','omnicompile.role=general-mysql','--restart','unless-stopped','--publish','127.0.0.1:3306:3306','--volume','mysql-data:/var/lib/mysql','--env','MYSQL_ROOT_PASSWORD','--env','MYSQL_ROOT_HOST=%','--health-cmd','MYSQL_PWD=$MYSQL_ROOT_PASSWORD mysql --protocol=TCP -h127.0.0.1 -uroot --execute=SELECT\ 1 >/dev/null','--health-interval','5s','--health-timeout','5s','--health-retries','30','--health-start-period','30s','db-omnicompile-database:8.4')
    } finally { $env:MYSQL_ROOT_PASSWORD = $oldPassword }
}
Wait-Healthy -Name 'MYSQL'
$oldClientPassword = $env:MYSQL_PWD
try {
    $env:MYSQL_PWD = $settings['MYSQL_ROOT_PASSWORD']
    Invoke-Docker -Arguments @('exec','--env','MYSQL_PWD','MYSQL','mysql','--protocol=TCP','-h127.0.0.1','-uroot','--execute=SELECT 1')
} finally { $env:MYSQL_PWD = $oldClientPassword }
Write-Host '[4/6] Building application images and starting the three-service OmniCompile project...'
$distributionDirectory = Join-Path $ProjectRoot '.runtime/distribution'
[void][IO.Directory]::CreateDirectory($distributionDirectory)
$manifestPath = Join-Path $distributionDirectory 'manifest.json'
$manifestBefore = if (Test-Path -LiteralPath $manifestPath) { (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash } else { '' }
$backendBefore = & docker container ls --all --filter 'name=^/OMNICOMPILE-BACKEND$' --format '{{.ID}}'
$hostNode = Get-Command node -ErrorAction SilentlyContinue
if ($hostNode) {
    & $hostNode.Source (Join-Path $ProjectRoot 'scripts/Local-Distribution.mjs') --container
    if ($LASTEXITCODE -ne 0) { throw 'Local worker package preparation failed. Existing source packages were preserved.' }
} else {
    Write-Warning 'Host Node.js is unavailable; worker download metadata was not regenerated. Only already-verified mounted packages can be offered.'
}
Invoke-Docker -Arguments @('compose','--file','compose.yaml','config','--quiet')
if (-not $SkipBuild) { Invoke-Docker -Arguments @('compose','--file','compose.yaml','build','backend','frontend') }
Invoke-Docker -Arguments @('compose','--file','compose.yaml','up','--detach','--wait','--wait-timeout','240')
$manifestAfter = if (Test-Path -LiteralPath $manifestPath) { (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash } else { '' }
$backendAfter = & docker container ls --all --filter 'name=^/OMNICOMPILE-BACKEND$' --format '{{.ID}}'
if ($backendBefore -and $backendBefore -eq $backendAfter -and $manifestBefore -ne $manifestAfter) {
    Write-Host 'Reloading the backend because actual worker package metadata changed.'
    Invoke-Docker -Arguments @('compose','--file','compose.yaml','restart','backend')
}
Write-Host '[5/6] Verifying application database, API and frontend...'
Wait-Healthy -Name 'OMNICOMPILE-DATA'
Wait-Healthy -Name 'OMNICOMPILE-BACKEND'
Wait-Healthy -Name 'OMNICOMPILE-FRONTEND'
$ready = Invoke-RestMethod -Uri 'http://localhost:4100/ready' -TimeoutSec 10
if ($ready.status -ne 'ready') { throw 'Coordinator did not report ready.' }
$page = Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 10
if ($page.StatusCode -ne 200) { throw 'Frontend did not respond successfully.' }
Write-Host '[6/6] OmniCompile Core is ready: http://localhost:5173/'
Write-Host 'General MYSQL:127.0.0.1:3306; application OMNICOMPILE-DATA:127.0.0.1:3307.'
