param([string]$ProjectRoot = (Join-Path $PSScriptRoot '../../..'), [switch]$SkipBuild, [switch]$LowDisk, [switch]$ReclaimImages, [switch]$ReclaimCache)
$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath($ProjectRoot)
Set-Location -LiteralPath $ProjectRoot
function Invoke-Docker {
    param([string[]]$Arguments)
    & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker operation failed: $($Arguments[0]). No data was removed." }
}
function Get-Sha256([string]$Path) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes($Path))) }
    finally { $sha.Dispose() }
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
if ($settings['DB_PORT'] -and $settings['DB_PORT'] -ne '3307') { throw 'Host development DB_PORT must be3307 for omnicompile-mysql; general MYSQL retains3306.' }
if ($settings['DB_NAME'] -and $settings['DB_NAME'] -ne 'omnicompile') { throw 'Expected application DB_NAME=omnicompile.' }
Write-Host '[3/6] Preparing project Docker services; general MYSQL is managed independently.'
Write-Host '[4/6] Building application images and starting the OmniCompile project...'
$distributionDirectory = Join-Path $ProjectRoot '.runtime/docker/distribution'
[void][IO.Directory]::CreateDirectory($distributionDirectory)
$manifestPath = Join-Path $distributionDirectory 'manifest.json'
$manifestBefore = if (Test-Path -LiteralPath $manifestPath) { Get-Sha256 $manifestPath } else { '' }
$backendBefore = & docker container ls --all --filter 'name=^/omnicompile-coordinator$' --format '{{.ID}}'
$hostNode = Get-Command node -ErrorAction SilentlyContinue
if ($hostNode) {
    & $hostNode.Source (Join-Path $ProjectRoot 'scripts/Local-Distribution.mjs') --container
    if ($LASTEXITCODE -ne 0) { throw 'Local worker package preparation failed. Existing source packages were preserved.' }
} else {
    Write-Warning 'Host Node.js is unavailable; worker download metadata was not regenerated. Only already-verified mounted packages can be offered.'
}
$secretDirectory = Join-Path $ProjectRoot '.runtime/docker/secrets'
[void][IO.Directory]::CreateDirectory($secretDirectory)
foreach ($purpose in @('compiler','executor','artifacts-access','artifacts-secret')) {
    $tokenPath = Join-Path $secretDirectory ($purpose + '.token')
    if (-not (Test-Path -LiteralPath $tokenPath)) {
        $tokenBytes = New-Object byte[] 32
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try { $rng.GetBytes($tokenBytes) } finally { $rng.Dispose() }
        [IO.File]::WriteAllText($tokenPath, [BitConverter]::ToString($tokenBytes).Replace('-', '').ToLowerInvariant())
    }
}
$credentialDirectory = Join-Path $ProjectRoot '.runtime/docker/cloud-workers'
[void][IO.Directory]::CreateDirectory($credentialDirectory)
foreach ($language in @('c','python','java')) {
    $credentialPath = Join-Path $credentialDirectory ($language + '.credential')
    if (-not (Test-Path -LiteralPath $credentialPath)) { [IO.File]::WriteAllText($credentialPath, '') }
}
Invoke-Docker -Arguments @('compose','--project-name','omnicompile','--file','docker-compose.yml','config','--quiet')
if (-not $SkipBuild) {
    $buildArgs = @('compose','--project-name','omnicompile','--file','docker-compose.yml','build')
    if ($ReclaimCache) {
        . (Join-Path $PSScriptRoot 'Low-Disk.ps1')
        if (@(Invoke-ProjectDocker buildx ls --format '{{.Name}}') -notcontains $script:ProjectBuilder) {
            Invoke-ProjectDocker buildx create --name $script:ProjectBuilder --driver docker-container --driver-opt default-load=true
        }
        $buildArgs += @('--builder',$script:ProjectBuilder)
    }
    Invoke-Docker -Arguments $buildArgs
}
Invoke-Docker -Arguments @('compose','--project-name','omnicompile','--file','docker-compose.yml','up','--detach','--wait','--wait-timeout','240')
if (-not $hostNode) { throw 'Node.js is required for secure cloud-worker enrollment. Install the supported pinned Node runtime, then restart.' }
$credentialHashes = @{}
foreach ($language in @('c','python','java')) {
    $credentialHashes[$language] = Get-Sha256 (Join-Path $credentialDirectory ($language + '.credential'))
}
& $hostNode.Source (Join-Path $ProjectRoot 'infra/docker/operations/Provision-Cloud-Workers.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Cloud worker enrollment failed. Existing project data is preserved; inspect the enrollment error above.' }
foreach ($language in @('c','python','java')) {
    $after = Get-Sha256 (Join-Path $credentialDirectory ($language + '.credential'))
    if ($after -ne $credentialHashes[$language]) {
        Invoke-Docker -Arguments @('compose','--project-name','omnicompile','--file','docker-compose.yml','restart',('omnicompile-' + $language + '-worker'))
    }
    Wait-Healthy -Name ('omnicompile-' + $language + '-worker')
}

$manifestAfter = if (Test-Path -LiteralPath $manifestPath) { Get-Sha256 $manifestPath } else { '' }
$backendAfter = & docker container ls --all --filter 'name=^/omnicompile-coordinator$' --format '{{.ID}}'
if ($backendBefore -and $backendBefore -eq $backendAfter -and $manifestBefore -ne $manifestAfter) {
    Write-Host 'Reloading the backend because actual worker package metadata changed.'
    Invoke-Docker -Arguments @('compose','--project-name','omnicompile','--file','docker-compose.yml','restart','omnicompile-coordinator')
}
Write-Host '[5/6] Verifying application database, API and frontend...'
Wait-Healthy -Name 'omnicompile-mysql'
Wait-Healthy -Name 'omnicompile-executor'
Wait-Healthy -Name 'omnicompile-coordinator'
Wait-Healthy -Name 'omnicompile-frontend'
$ready = Invoke-RestMethod -Uri 'http://localhost:4100/ready' -TimeoutSec 10
if ($ready.status -ne 'ready') { throw 'Coordinator did not report ready.' }
$page = Invoke-WebRequest -Uri 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 10
if ($page.StatusCode -ne 200) { throw 'Frontend did not respond successfully.' }
Write-Host '[6/6] OmniCompile Core is ready: http://localhost:5173/'
Write-Host 'Project MySQL:127.0.0.1:3307. General-purpose MYSQL was not modified.'

if ($LowDisk -or $ReclaimImages -or $ReclaimCache) {
    $watchScript = Join-Path $PSScriptRoot 'Manage-LowDisk.ps1'
    $watchArgs = @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $watchScript + '"'),'-Action','Watch')
    if ($ReclaimImages) { $watchArgs += '-ReclaimImages' }
    if ($ReclaimCache) { $watchArgs += '-ReclaimCache' }
    Start-Process powershell.exe -ArgumentList $watchArgs -WindowStyle Hidden
    Write-Host 'Low-Disk monitoring is active. Idle cleanup keeps running services available.'
}
