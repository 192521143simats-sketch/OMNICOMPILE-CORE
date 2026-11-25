#pwsh -NoProfile -File "C:\Users\mahen\OneDrive\Desktop\SARVESH\simats\SIMATS PROJECT\COMPILER DESIGN\OMNICOMPILE\scripts\Reset-Fresh-Application.ps1" -FactoryReset


# Explicit factory operation. Normal startup never calls this script.
# Preview: pwsh -NoProfile -File scripts/Reset-Fresh-Application.ps1 -FactoryReset -WhatIf
# Execute only for an intentional data reset: use the same command without -WhatIf.
[CmdletBinding(SupportsShouldProcess)]
param([switch]$FactoryReset)
$ErrorActionPreference='Stop'
if(!$FactoryReset){throw 'This permanently clears OmniCompile application data. Invoke with -FactoryReset only when a fresh product reset is intended.'}
$resetRoot=[IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
Set-Location -LiteralPath $resetRoot
$docker=Join-Path $env:ProgramFiles 'Docker/Docker/resources/bin/docker.exe'
if(!(Test-Path -LiteralPath $docker)){throw 'Docker Desktop CLI was not found.'}
$env:PATH=(Split-Path $docker)+';'+$env:PATH
$pwsh=(Get-Command pwsh -ErrorAction Stop).Source
$node=(Get-Command node -ErrorAction Stop).Source
function Invoke-Docker([string[]]$Arguments){
    & $docker @Arguments
    if($LASTEXITCODE -ne 0){throw "Docker operation failed: $($Arguments[0]). Stop and inspect before repeating the factory reset."}
}
$compose=@('compose','--project-name','omnicompile','-f','docker-compose.yml')
if(Test-Path -LiteralPath '.runtime/online-demo/compose.json'){$compose+=@('-f','.runtime/online-demo/compose.json')}
foreach($required in @('.env','scripts/Start-Product.ps1','scripts/Verify-Fresh-Launch.mjs')){
    if(!(Test-Path -LiteralPath $required -PathType Leaf)){throw "Required file missing: $required. Nothing has been cleared."}
}
Invoke-Docker -Arguments @('info','--format','{{.ServerVersion}}')
Invoke-Docker -Arguments ($compose+@('config','--quiet'))
# Treat an absent unrelated MYSQL as absent, never create or reset it. If it is
# present, preserve its container identity and volume identity exactly.
function Protected-DatabaseSnapshot {
    $containers=@(& $docker ps -a --filter 'name=^/MYSQL$' --format '{{.ID}}')
    if($LASTEXITCODE -ne 0){throw 'Could not inspect protected MYSQL.'}
    $id='absent'
    if($containers.Count){$id=& $docker inspect MYSQL --format '{{.Id}}';if($LASTEXITCODE -ne 0){throw 'Could not inspect protected MYSQL identity.'}}
    $volumes=@(& $docker volume ls --filter 'name=^mysql$' --format '{{.Name}}')
    if($LASTEXITCODE -ne 0){throw 'Could not inspect protected mysql volume.'}
    $volume='absent'
    if($volumes.Count){$volume=& $docker volume inspect mysql --format '{{.CreatedAt}} {{.Mountpoint}}';if($LASTEXITCODE -ne 0){throw 'Could not inspect protected mysql volume identity.'}}
    return "$id|$volume"
}
function Remove-FactoryFile([string]$RelativePath){
    $absolute=[IO.Path]::GetFullPath((Join-Path $resetRoot $RelativePath))
    if(!$absolute.StartsWith($resetRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Factory file escapes the repository.'}
    if(Test-Path -LiteralPath $absolute){
        $item=Get-Item -LiteralPath $absolute -Force
        if($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Expected a regular factory-state file.'}
        Remove-Item -LiteralPath $absolute -Force
    }
}
$protectedBefore=Protected-DatabaseSnapshot
# Validate all factory-state files before stopping services or deleting volumes.
foreach($relative in @('.runtime/docker/cloud-workers/enrollment.json','.runtime/docker/cloud-workers/c.credential','.runtime/docker/cloud-workers/python.credential','.runtime/docker/cloud-workers/java.credential')+@('compiler','executor','artifacts-access','artifacts-secret' | ForEach-Object {".runtime/docker/secrets/$_.token"})){
    $absolute=[IO.Path]::GetFullPath((Join-Path $resetRoot $relative))
    $cursor=$absolute
    while($cursor.Length -gt $resetRoot.Length){
        if(Test-Path -LiteralPath $cursor){$item=Get-Item -LiteralPath $cursor -Force;if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Factory-state path contains a link/junction. Nothing has been cleared.'}}
        $cursor=Split-Path $cursor -Parent
    }
    if((Test-Path -LiteralPath $absolute) -and (Get-Item -LiteralPath $absolute -Force).PSIsContainer){throw 'Expected a regular factory-state file.'}
}
foreach($pair in @(@('OMNICOMPILE-MYSQL','omnicompile-mysql'),@('OMNICOMPILE-ARTIFACTS','omnicompile-artifacts'))){
    $consumers=@(& $docker ps -a --filter "volume=$($pair[0])" --format '{{.Names}}')
    if($LASTEXITCODE -ne 0 -or $consumers.Count -ne 1 -or $consumers[0] -ne $pair[1]){throw "Unexpected consumer of $($pair[0]); nothing has been cleared."}
    $project=& $docker inspect $pair[1] --format '{{index .Config.Labels "com.docker.compose.project"}}'
    if($LASTEXITCODE -ne 0 -or $project -ne 'omnicompile'){throw 'Unexpected Docker project; nothing has been cleared.'}
    $mounts=(& $docker inspect $pair[1] --format '{{json .Mounts}}') | ConvertFrom-Json
    if($LASTEXITCODE -ne 0 -or @($mounts | Where-Object {$_.Type -eq 'volume' -and $_.Name -eq $pair[0]}).Count -ne 1){throw 'Expected named application volume was not mounted; nothing has been cleared.'}
}
if(!$PSCmdlet.ShouldProcess('OmniCompile database, artifact volumes, and retired managed credentials','Permanently reset; retain .env, transport URL, unrelated MYSQL, source, packages and test evidence')){return}
Write-Host 'Factory reset: clearing only OmniCompile database/artifact storage and old managed credentials.'
Invoke-Docker -Arguments ($compose+@('down'))
Invoke-Docker -Arguments @('volume','rm','OMNICOMPILE-MYSQL','OMNICOMPILE-ARTIFACTS')
foreach($name in @('enrollment.json','c.credential','python.credential','java.credential')){
    Remove-FactoryFile ".runtime/docker/cloud-workers/$name"
}
foreach($purpose in @('compiler','executor','artifacts-access','artifacts-secret')){
    $secretPath=Join-Path $resetRoot ".runtime/docker/secrets/$purpose.token"
    [void][IO.Directory]::CreateDirectory((Split-Path $secretPath -Parent))
    $bytes=New-Object byte[] 32
    $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
    try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
    [IO.File]::WriteAllText($secretPath,[BitConverter]::ToString($bytes).Replace('-','').ToLowerInvariant())
}
# Do not invoke broad generated-file cleanup: it removes saved operator transport
# configuration and acceptance evidence. A factory data reset needs neither.
& $pwsh -NoProfile -File (Join-Path $PSScriptRoot 'Start-Product.ps1') -NoBrowser
if($LASTEXITCODE -ne 0){throw 'Fresh startup failed. Do not repeat the reset; use START-OMNICOMPILE.bat after correcting the startup error.'}
# Fresh startup creates only the configured administrator. It must not create a
# network or enroll tool providers as workers. Revoke any bootstrap login sessions.
& $node --input-type=module -e 'import fs from "node:fs";import dotenv from "dotenv";import mysql from "mysql2/promise";const e=dotenv.parse(fs.readFileSync(".env"));if((e.DB_NAME??"omnicompile")!=="omnicompile")throw Error("Unexpected database");const db=await mysql.createConnection({host:"127.0.0.1",port:3307,user:"root",password:e.MYSQL_ROOT_PASSWORD,database:"omnicompile"});try{await db.execute("DELETE FROM auth_sessions");}finally{await db.end();}'
if($LASTEXITCODE -ne 0){throw 'Bootstrap session cleanup failed; do not repeat the reset.'}
$protectedAfter=Protected-DatabaseSnapshot
if($protectedBefore -ne $protectedAfter){throw 'Protected MYSQL identity mismatch.'}
& $node (Join-Path $PSScriptRoot 'Verify-Fresh-Launch.mjs') --public
if($LASTEXITCODE -ne 0){throw 'Fresh baseline verification failed; inspect the report rather than resetting again.'}
Write-Host 'Fresh launch verified: administrator=1, networks=0, workers=0, next network=A; ordinary users/jobs/artifacts/sessions=0.'
