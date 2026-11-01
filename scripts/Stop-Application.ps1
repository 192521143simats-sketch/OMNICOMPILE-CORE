param([Parameter(Mandatory=$true)][string]$ProjectRoot)
$ErrorActionPreference = 'Continue'
$pidFile = Join-Path $ProjectRoot '.runtime\application.pid'
if (Test-Path -LiteralPath $pidFile) {
    $applicationPid = [int](Get-Content -LiteralPath $pidFile -Raw)
    if (Get-Process -Id $applicationPid -ErrorAction SilentlyContinue) {
        & taskkill.exe /PID $applicationPid /T /F | Out-Null
        Write-Host 'Stopped OmniCompile Core application services.'
    }
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
} else {
    $stopped = $false
    foreach ($port in 4100,5173) {
        Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | ForEach-Object {
            $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($_.OwningProcess)" -ErrorAction SilentlyContinue
            if ($process.CommandLine -like "*$ProjectRoot*") {
                & taskkill.exe /PID $_.OwningProcess /T /F | Out-Null
                $stopped = $true
            }
        }
    }
    if (-not $stopped) { Write-Host 'OmniCompile Core application services were not running.' }
}

