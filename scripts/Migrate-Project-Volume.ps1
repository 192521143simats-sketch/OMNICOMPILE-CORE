param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot), [switch]$VerifyExisting)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath ([IO.Path]::GetFullPath($ProjectRoot))
function Invoke-MigrationDocker([string[]]$Arguments) {
    $output = & docker @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Docker migration step failed: $($Arguments[0]). Source volume remains preserved." }
    return $output
}
$source = 'OMNICOMPILE-DATA'
$target = 'omnicompile-data'
$sourceExists = Invoke-MigrationDocker @('volume','ls','--filter',"name=^$source$", '--format','{{.Name}}')
if (-not $sourceExists) { Write-Host 'No legacy project volume exists; nothing to migrate.'; exit 0 }
$targetExists = Invoke-MigrationDocker @('volume','ls','--filter',"name=^$target$", '--format','{{.Name}}')
if ($targetExists) {
    $targetInfo = (Invoke-MigrationDocker @('volume','inspect',$target) | ConvertFrom-Json)[0]
    if (-not $VerifyExisting -or $targetInfo.Labels.'omnicompile.migrated-from' -ne $source) { throw 'Target volume already exists. It was preserved. Use -VerifyExisting only for this script-owned migration target.' }
}
foreach ($name in @('OMNICOMPILE-BACKEND','OMNICOMPILE-FRONTEND','OMNICOMPILE-DATA')) {
    $container = Invoke-MigrationDocker @('container','ls','--all','--filter',"name=^/$name$", '--format','{{.ID}}')
    if ($container) {
        $details = (Invoke-MigrationDocker @('inspect',$container) | ConvertFrom-Json)[0]
        if ($details.Config.Labels.'com.docker.compose.project' -ne 'omnicompile') { throw "Container $name is not owned by this project." }
        [void](Invoke-MigrationDocker @('stop','--time','60',$container))
    }
}
$usingSource = Invoke-MigrationDocker @('ps','--filter',"volume=$source",'--format','{{.ID}}')
if ($usingSource) { throw 'Source is still mounted by a running container; refusing an inconsistent copy.' }
$usingTarget = Invoke-MigrationDocker @('ps','--filter',"volume=$target",'--format','{{.ID}}')
if ($usingTarget) { throw 'Target is mounted by a running container; refusing an inconsistent verification.' }
if (-not $targetExists) {
[void](Invoke-MigrationDocker @('volume','create','--label','omnicompile.migrated-from=OMNICOMPILE-DATA',$target))
# Both paths below are fixed container paths. No host filesystem or general MYSQL
# volume is exposed. Original bytes remain on the read-only source volume.
[void](Invoke-MigrationDocker @('run','--rm','--network','none','--user','0','--mount',"type=volume,source=$source,target=/source,readonly",'--mount',"type=volume,source=$target,target=/target",'--entrypoint','sh','mysql:8.4','-c','cp -a /source/. /target/'))
}
$verify = 'cd /source && find . -type f -exec sha256sum {} + | sort > /tmp/source.sha; cd /target && find . -type f -exec sha256sum {} + | sort > /tmp/target.sha; sha256sum /tmp/source.sha /tmp/target.sha'
$verification = @(Invoke-MigrationDocker @('run','--rm','--network','none','--user','0','--mount',"type=volume,source=$source,target=/source,readonly",'--mount',"type=volume,source=$target,target=/target,readonly",'--entrypoint','sh','mysql:8.4','-ec',$verify))
if ($verification.Count -ne 2 -or ($verification[0] -split '\s+')[0] -ne ($verification[1] -split '\s+')[0]) { throw 'Migration file checksum manifests differ. Both volumes remain preserved for inspection.' }
Write-Host 'Project volume copy verified by file checksums. Original OMNICOMPILE-DATA remains intact and stopped. Start the new Compose project and verify SQL persistence before retiring old containers.'
