param([switch]$Rebuild,[switch]$NoBrowser,[switch]$RepairManagedWorkers)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
$env:PATH = "${env:ProgramFiles}\Docker\Docker\resources\bin;${env:PATH}"
$logDirectory = Join-Path $projectRoot '.runtime/startup'
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
$log = Join-Path $logDirectory ('startup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.log')
Start-Transcript -LiteralPath $log | Out-Null
try {
    if (!(Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Docker CLI is missing. Install Docker Desktop.' }
    if (!(Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is missing from PATH.' }
    Write-Host '[1/5] Checking Docker Engine...'
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        $desktop = Join-Path $env:ProgramFiles 'Docker/Docker/Docker Desktop.exe'
        if (!(Test-Path -LiteralPath $desktop)) { $desktop = Join-Path $env:LOCALAPPDATA 'Docker/Docker Desktop.exe' }
        if (!(Test-Path -LiteralPath $desktop)) { throw 'Docker Desktop was not found.' }
        Start-Process -FilePath $desktop -WindowStyle Hidden
        $deadline = [DateTime]::UtcNow.AddSeconds(180)
        do {
            Start-Sleep -Seconds 2
            & docker info *> $null
            if ($LASTEXITCODE -eq 0) { break }
        } while ([DateTime]::UtcNow -lt $deadline)
        if ($LASTEXITCODE -ne 0) { throw 'Docker Engine did not become ready within 180 seconds.' }
    }
    Write-Host '[2/5] Preparing the saved environment and public transport...'
    & (Join-Path $PSScriptRoot 'Initialize-Environment.ps1') -ProjectRoot $projectRoot
    $origin = 'https://omnicompile-core-platform.vercel.app'
    & (Join-Path $PSScriptRoot 'Start-Online-Demo.ps1') -PublicOrigin $origin -PrepareOnly
    $override = Join-Path $projectRoot '.runtime/online-demo/compose.json'
    $mustBuild = [bool]$Rebuild
    foreach ($image in @('coordinator','frontend','mysql','artifacts','executor','c-worker','python-worker','java-worker')) {
        $tag = if ($image -eq 'mysql') { '8.4' } else { 'local' }
        & docker image inspect "omnicompile-${image}:$tag" *> $null
        if ($LASTEXITCODE -ne 0) { $mustBuild = $true }
    }
    if ($RepairManagedWorkers) { $env:OMNICOMPILE_REPAIR_MANAGED_WORKERS = '1' }
    Write-Host '[3/5] Starting the saved services and worker identities...'
    & (Join-Path $projectRoot 'infra/docker/operations/Start-Containers.ps1') -ProjectRoot $projectRoot -SkipBuild:(!$mustBuild) -ComposeOverride $override -PublicOrigin $origin
    Write-Host '[4/5] Checking the public frontend transport...'
    $publish = Join-Path $projectRoot 'vercel.json'
    $url = (Get-Content -LiteralPath (Join-Path $projectRoot '.runtime/online-demo/url.txt') -Raw).Trim()
    if (!(Test-Path -LiteralPath $publish) -or !(Get-Content -LiteralPath $publish -Raw).Contains($url)) {
        Write-Host 'The tunnel changed. Updating the existing Vercel deployment...'
        & node (Join-Path $PSScriptRoot 'Publish-Vercel-Demo.mjs')
        if ($LASTEXITCODE -ne 0) { throw 'Public route deployment failed. The local services remain running; inspect this log.' }
    }
    $response = Invoke-WebRequest "$origin/api/auth/me" -SkipHttpErrorCheck -TimeoutSec 30
    if ($response.StatusCode -ne 401 -or !($response.Headers['Content-Type'] -match 'application/json')) { throw 'The public API route is not reaching the coordinator.' }
    Write-Host "[5/5] Ready: $origin"
    Write-Host 'Keep this laptop, Docker, K: storage, and internet running.'
    if (!$NoBrowser) { Start-Process $origin }
} catch {
    Write-Host "STARTUP FAILED: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Log: $log"
    exit 1
} finally { Stop-Transcript | Out-Null }
