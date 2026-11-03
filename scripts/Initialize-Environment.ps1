param([string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot))
$ErrorActionPreference = 'Stop'
$environmentPath = Join-Path $ProjectRoot '.env'
function New-RandomSecret {
    $bytes = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
}
if (Test-Path -LiteralPath $environmentPath) {
    $existing = [IO.File]::ReadAllText($environmentPath)
    $additions = @()
    if ($existing -notmatch '(?m)^ADMIN_USERNAME=') { $additions += 'ADMIN_USERNAME=admin' }
    # A hash-only environment must remain hash-only: production rejects plaintext.
    $hasPasswordHash = $existing -match '(?m)^ADMIN_PASSWORD_HASH\s*=\s*[''"]?\$argon2id\$'
    if ($existing -notmatch '(?m)^ADMIN_PASSWORD=' -and -not $hasPasswordHash) { $additions += "ADMIN_PASSWORD=$(New-RandomSecret)" }
    if ($existing -notmatch '(?m)^ADMIN_PASSWORD_HASH=') { $additions += 'ADMIN_PASSWORD_HASH=' }
    if ($existing -notmatch '(?m)^SESSION_TTL_HOURS=') { $additions += 'SESSION_TTL_HOURS=12' }
    if ($existing -notmatch '(?m)^RESET_TTL_MINUTES=') { $additions += 'RESET_TTL_MINUTES=20' }
    if ($additions.Count) { [IO.File]::AppendAllText($environmentPath, "`r`n" + ($additions -join "`r`n") + "`r`n", [Text.UTF8Encoding]::new($false)) }
    Write-Host 'Environment file already exists; preserved credentials and added any missing OmniCompile Core settings.'
    exit 0
}

$databaseSecret = New-RandomSecret
$content = @"
HOST=0.0.0.0
PORT=4100
PUBLIC_BASE_URL=http://localhost:5173
COORDINATOR_PUBLIC_URL=http://localhost:4100
ADMIN_USERNAME=admin
ADMIN_PASSWORD=$(New-RandomSecret)
ADMIN_PASSWORD_HASH=
SESSION_TTL_HOURS=12
RESET_TTL_MINUTES=20
DB_HOST=127.0.0.1
DB_PORT=3307
DB_NAME=omnicompile
DB_USER=root
DB_PASSWORD=$databaseSecret
MYSQL_ROOT_PASSWORD=$databaseSecret
HEARTBEAT_STALE_MS=15000
HEARTBEAT_OFFLINE_MS=30000
TASK_TIMEOUT_MS=30000
"@
[IO.File]::WriteAllText($environmentPath, $content, [Text.UTF8Encoding]::new($false))
Write-Host 'Created .env with randomly generated local development credentials.'

