# User-run cleanup: source tests, source fixtures, secrets, packages, toolchains,
# security evidence and the active ngrok configuration are deliberately retained.
[CmdletBinding(SupportsShouldProcess)]
param()
$ErrorActionPreference='Stop'
$cleanupRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$relativeTargets=@('.runtime/integration','.runtime/windows-worker/releases/win-unpacked','.runtime/windows-worker/releases/builder-debug.yml','apps/android-worker/app/build-acceptance','.vercel/output')
$targets=@($relativeTargets | ForEach-Object {Join-Path $cleanupRoot $_})
$targets+=@(Get-ChildItem -LiteralPath (Join-Path $cleanupRoot '.runtime') -File -Filter '*.log' | Select-Object -ExpandProperty FullName)
$targets+=@(Get-ChildItem -LiteralPath (Join-Path $cleanupRoot '.runtime/online-demo') -File | Where-Object {$_.Name -notin @('compose.json','url.txt','ngrok.log','ngrok-error.log','agent.pid')} | Select-Object -ExpandProperty FullName)
$removedBytes=0L;$removedTargets=0
foreach($candidate in $targets){
  $absolute=[IO.Path]::GetFullPath($candidate)
  if(!$absolute.StartsWith($cleanupRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Target escapes the project workspace.'}
  if(!(Test-Path -LiteralPath $absolute)){continue}
  $item=Get-Item -LiteralPath $absolute -Force
  if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw "Unexpected link/junction: $absolute"}
  if($absolute.EndsWith('win-unpacked',[StringComparison]::OrdinalIgnoreCase)){
    $running=@(Get-CimInstance Win32_Process | Where-Object {$_.ExecutablePath -and $_.ExecutablePath.StartsWith($absolute+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)})
    if($running.Count){throw 'Close the unpacked Windows development worker before cleanup.'}
  }
  $files=if($item.PSIsContainer){@(Get-ChildItem -LiteralPath $absolute -Recurse -File -Force)}else{@($item)}
  $bytes=[long](($files | Measure-Object Length -Sum).Sum)
  if($PSCmdlet.ShouldProcess($absolute,'Remove generated launch/test output')){
    Remove-Item -LiteralPath $absolute -Recurse -Force
    $removedBytes+=$bytes;$removedTargets++
  }
}
$credentials=Join-Path $cleanupRoot '.runtime/oci-credentials'
foreach($name in @('ssh-key-2026-11-22.key','ssh-key-2026-11-22.key.pub')){
  $source=Join-Path $cleanupRoot $name;$destination=Join-Path $credentials $name
  if(!(Test-Path -LiteralPath $source)){continue}
  if(Test-Path -LiteralPath $destination){throw 'Refusing to overwrite an existing OCI key.'}
  if($PSCmdlet.ShouldProcess($source,'Move OCI key into ignored credentials directory')){
    New-Item -ItemType Directory -Path $credentials -Force | Out-Null
    $hash=(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
    Move-Item -LiteralPath $source -Destination $destination
    if((Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash -ne $hash){throw 'OCI key integrity mismatch.'}
  }
}
Write-Host "GENERATED_TARGETS_REMOVED=$removedTargets"
Write-Host "GENERATED_BYTES_REMOVED=$removedBytes"
Write-Host 'Application data cleanup and Docker cleanup are separate operations.'
