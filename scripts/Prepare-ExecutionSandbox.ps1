param([Parameter(Mandatory=$true)][string]$ProjectRoot)
$ErrorActionPreference='Stop'
$context=Join-Path $ProjectRoot 'infra\sandbox'
$runnerHash=(Get-FileHash -LiteralPath (Join-Path $context 'runner.py') -Algorithm SHA256).Hash.ToLowerInvariant()
$dockerfileHash=(Get-FileHash -LiteralPath (Join-Path $context 'Dockerfile') -Algorithm SHA256).Hash.ToLowerInvariant()
$identity="$runnerHash-$dockerfileHash"
$savedPreference=$ErrorActionPreference
try {
  $ErrorActionPreference='Continue'
  $imageJson=& docker.exe image inspect gridx-execution:1 2>$null
  $inspectExit=$LASTEXITCODE
} finally {$ErrorActionPreference=$savedPreference}
if($inspectExit -eq 0){
  $imageInfo=($imageJson -join "`n") | ConvertFrom-Json
  if($imageInfo[0].Config.Labels.'gridx.execution.source' -eq $identity){Write-Host 'Reusing verified OmniCompile Core execution image.';exit 0}
}
Write-Host 'Preparing isolated OmniCompile Core execution environment (first build needs Internet)...'
$runtime=Join-Path $ProjectRoot '.runtime'
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
$build=Start-Process -FilePath 'docker.exe' -ArgumentList @('build','--quiet','--label',"gridx.execution.source=$identity",'-t','gridx-execution:1',"`"$context`"") -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'sandbox-build.log') -RedirectStandardError (Join-Path $runtime 'sandbox-build-error.log')
$null=$build.Handle
$deadline=[DateTime]::UtcNow.AddMinutes(10)
while(-not $build.WaitForExit(10000)){if([DateTime]::UtcNow -gt $deadline){$build.Kill();throw 'Execution image build timed out. See .runtime\sandbox-build-error.log.'};Write-Host 'Execution image build is still working...'}
$build.WaitForExit()
if($build.ExitCode -ne 0){throw 'Execution image build failed. See .runtime\sandbox-build-error.log.'}
Write-Host 'OmniCompile Core isolated execution image is ready.'
