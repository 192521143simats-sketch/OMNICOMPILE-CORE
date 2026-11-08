param(
    [ValidateSet('Watch','Stop')][string]$Action = 'Stop',
    [switch]$LowDisk,
    [switch]$ReclaimImages,
    [switch]$ReclaimCache,
    [ValidateRange(1,86400)][int]$IdleSeconds = 1800,
    [ValidateRange(1,60)][int]$PollSeconds = 30
)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot '../../..')
. (Join-Path $PSScriptRoot 'Low-Disk.ps1')

function Invoke-Cleanup {
    $before = (Get-Item -LiteralPath '.').PSDrive.Free
    $stopped = @(Invoke-ProjectDocker ps -aq --filter 'label=com.docker.compose.project=omnicompile' --filter 'status=exited' --filter 'status=created' --filter 'status=dead')
    if ($stopped.Count) { Invoke-ProjectDocker rm @stopped }
    if ($ReclaimImages) {
        $images = @(Invoke-ProjectDocker compose --project-name omnicompile --file docker-compose.yml config --images | Sort-Object -Unique)
        foreach ($image in $images) {
            if ($image -notmatch '^omnicompile-(mysql|coordinator|frontend|[a-z]+-worker|executor|artifacts):') {
                throw "Unexpected project image: $image"
            }
            $id = & docker image inspect --format '{{.Id}}' $image 2>$null
            if ($LASTEXITCODE -ne 0) { continue }
            if (Invoke-ProjectDocker ps -aq --filter "ancestor=$id") { continue }
            & docker image rm $image
            if ($LASTEXITCODE -ne 0) { Write-Warning "Docker retained $image." }
        }
    }
    if ($ReclaimCache) {
        $builders = @(Invoke-ProjectDocker buildx ls --format '{{.Name}}')
        if ($builders -contains $script:ProjectBuilder) {
            Invoke-ProjectDocker buildx prune --builder $script:ProjectBuilder --all --force
        }
    }
    $after = (Get-Item -LiteralPath '.').PSDrive.Free
    Write-Host "Host drive free-space change: $($after - $before) bytes. Docker Desktop may retain its virtual disk allocation."
}

if ($Action -eq 'Stop') {
    Invoke-ProjectDocker compose --project-name omnicompile --file docker-compose.yml stop
    if ($LowDisk -or $ReclaimImages -or $ReclaimCache) { Invoke-Cleanup }
    Write-Host 'OmniCompile Core is stopped. MySQL and artifact volumes are preserved.'
    exit
}

# Only one monitor may run for the Compose project. A failed probe resets the idle interval.
$mutex = New-Object System.Threading.Mutex($false, 'Local\OmniCompileLowDisk')
try { $acquired = $mutex.WaitOne([TimeSpan]::FromSeconds(65)) }
catch [Threading.AbandonedMutexException] { $acquired = $true }
if (-not $acquired) { $mutex.Dispose(); exit }
try {
    $idleSince = $null
    $cleaned = $false
    $coordinator = Invoke-ProjectDocker compose --project-name omnicompile --file docker-compose.yml ps -q --status running omnicompile-coordinator
    if (-not $coordinator) { return }
    $startedAt = Invoke-ProjectDocker inspect --format '{{.State.StartedAt}}' $coordinator
    while ($true) {
        if ((Invoke-ProjectDocker compose --project-name omnicompile --file docker-compose.yml ps -q --status running omnicompile-coordinator) -ne $coordinator) { break }
        if ((Invoke-ProjectDocker inspect --format '{{.State.StartedAt}}' $coordinator) -ne $startedAt) { break }
        try {
            $probe = @'
export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
mysql -h127.0.0.1 -P3307 -uroot -N -B omnicompile <<'SQL'
SELECT EXISTS(SELECT 1 FROM compilation_jobs WHERE status IN ('SUBMITTED','DISTRIBUTING','CODE_GENERATING'))
    OR EXISTS(SELECT 1 FROM tasks WHERE status NOT IN ('COMPLETED','FAILED','CANCELLED'));
SQL
exit $?
'@
            $busy = ($probe.Replace([string][char]13, "") + [char]10) | & docker exec -i omnicompile-mysql sh
            if ($LASTEXITCODE -ne 0 -or $busy -notin @('0','1')) { throw 'Could not verify project workload.' }
            if ($busy -ne '0') { $idleSince = $null; $cleaned = $false }
            elseif (-not $idleSince) { $idleSince = [DateTime]::UtcNow }
            elseif (-not $cleaned -and ([DateTime]::UtcNow - $idleSince).TotalSeconds -ge $IdleSeconds) {
                Invoke-Cleanup
                $cleaned = $true
            }
        } catch {
            $idleSince = $null
            Write-Warning $_.Exception.Message
        }
        Start-Sleep -Seconds $PollSeconds
    }
} finally {
    $mutex.ReleaseMutex()
    $mutex.Dispose()
}
