# Explicit factory operation. Normal startup never calls this script.
param([switch]$FactoryReset)
$ErrorActionPreference='Stop'
if(!$FactoryReset){throw 'This permanently clears OmniCompile application data. Invoke with -FactoryReset only when a fresh product reset is intended.'}
$resetRoot=[IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
Set-Location -LiteralPath $resetRoot
$docker=Join-Path $env:ProgramFiles 'Docker/Docker/resources/bin/docker.exe'
if(!(Test-Path -LiteralPath $docker)){throw 'Docker Desktop CLI was not found.'}
$env:PATH=(Split-Path $docker)+';'+$env:PATH
function Invoke-Docker([string[]]$Arguments){
    & $docker @Arguments
    if($LASTEXITCODE -ne 0){throw "Docker operation failed: $($Arguments[0]). Stop and inspect before repeating the factory reset."}
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
$protectedId=& $docker inspect MYSQL --format '{{.Id}}'
if($LASTEXITCODE -ne 0){throw 'The protected separate MYSQL container was not found.'}
$protectedVolume=& $docker volume inspect mysql --format '{{.CreatedAt}} {{.Mountpoint}}'
if($LASTEXITCODE -ne 0){throw 'The protected separate mysql volume was not found.'}
foreach($pair in @(@('OMNICOMPILE-MYSQL','omnicompile-mysql'),@('OMNICOMPILE-ARTIFACTS','omnicompile-artifacts'))){
    $consumers=@(& $docker ps -a --filter "volume=$($pair[0])" --format '{{.Names}}')
    if($LASTEXITCODE -ne 0 -or $consumers.Count -ne 1 -or $consumers[0] -ne $pair[1]){throw "Unexpected consumer of $($pair[0]); nothing has been cleared."}
    $project=& $docker inspect $pair[1] --format '{{index .Config.Labels "com.docker.compose.project"}}'
    if($LASTEXITCODE -ne 0 -or $project -ne 'omnicompile'){throw 'Unexpected Docker project; nothing has been cleared.'}
}
Write-Host 'Factory reset: clearing only OmniCompile database/artifact storage and old managed credentials.'
Invoke-Docker @('compose','-f','docker-compose.yml','-f','.runtime/online-demo/compose.json','down')
Invoke-Docker @('volume','rm','OMNICOMPILE-MYSQL','OMNICOMPILE-ARTIFACTS')
foreach($name in @('enrollment.json','c.credential','python.credential','java.credential')){
    Remove-FactoryFile ".runtime/docker/cloud-workers/$name"
}
foreach($purpose in @('compiler','executor','artifacts-access','artifacts-secret')){
    $secretPath=Join-Path $resetRoot ".runtime/docker/secrets/$purpose.token"
    if((Get-Item -LiteralPath $secretPath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Unexpected secret file link.'}
    $bytes=New-Object byte[] 32
    $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
    try{$rng.GetBytes($bytes)}finally{$rng.Dispose()}
    [IO.File]::WriteAllText($secretPath,[BitConverter]::ToString($bytes).Replace('-','').ToLowerInvariant())
}
& (Join-Path $PSScriptRoot 'Clean-Generated-Launch-Files.ps1')
& (Join-Path $PSScriptRoot 'Start-Product.ps1') -NoBrowser
if($LASTEXITCODE -ne 0){throw 'Fresh startup failed. Do not repeat the reset; use START-OMNICOMPILE.bat after correcting the startup error.'}
# Provisioning authenticates once. Remove that bootstrap login session too;
# the three private worker enrollments remain active.
& node --input-type=module -e 'import fs from "node:fs";import dotenv from "dotenv";import mysql from "mysql2/promise";const e=dotenv.parse(fs.readFileSync(".env"));if(e.DB_NAME!=="omnicompile")throw Error("Unexpected database");const db=await mysql.createConnection({host:"127.0.0.1",port:3307,user:"root",password:e.MYSQL_ROOT_PASSWORD,database:"omnicompile"});try{await db.execute("DELETE FROM auth_sessions");}finally{await db.end();}'
if($LASTEXITCODE -ne 0){throw 'Bootstrap session cleanup failed; do not repeat the reset.'}
$protectedAfter=& $docker inspect MYSQL --format '{{.Id}}'
$volumeAfter=& $docker volume inspect mysql --format '{{.CreatedAt}} {{.Mountpoint}}'
if($protectedId -ne $protectedAfter -or $protectedVolume -ne $volumeAfter){throw 'Protected MYSQL identity mismatch.'}
& node (Join-Path $PSScriptRoot 'Verify-Fresh-Launch.mjs') --public
if($LASTEXITCODE -ne 0){throw 'Fresh baseline verification failed; inspect the report rather than resetting again.'}
Write-Host 'Fresh launch verified: administrator=1, compiler pool=Network A, workers=A001-A003, next network=B; ordinary users/jobs/artifacts/sessions=0.'
