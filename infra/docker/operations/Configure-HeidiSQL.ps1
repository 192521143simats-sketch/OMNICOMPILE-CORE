param([string]$SessionName = 'OMNICOMPILE')
$ErrorActionPreference = 'Stop'
if ($SessionName -ne 'OMNICOMPILE') { throw 'This helper configures only the OMNICOMPILE HeidiSQL session.' }
$session = 'HKCU:\Software\HeidiSQL\Servers\OMNICOMPILE'
$created = -not (Test-Path -LiteralPath $session)
if ($created) { [void](New-Item -Path $session -Force) }
foreach ($setting in @{
    Host = '127.0.0.1'
    User = 'root'
    Databases = 'omnicompile'
}.GetEnumerator()) {
    [void](New-ItemProperty -LiteralPath $session -Name $setting.Key -Value $setting.Value -PropertyType String -Force)
}
foreach ($setting in @{
    Port = 3307
    NetType = 0
    LoginPrompt = 1
}.GetEnumerator()) {
    [void](New-ItemProperty -LiteralPath $session -Name $setting.Key -Value $setting.Value -PropertyType DWord -Force)
}
if ($created) { [void](New-ItemProperty -LiteralPath $session -Name Password -Value '' -PropertyType String) }
$result = Get-ItemProperty -LiteralPath $session
if ($result.Host -ne '127.0.0.1' -or $result.Port -ne 3307 -or $result.User -ne 'root' -or $result.NetType -ne 0 -or $result.LoginPrompt -ne 1) {
    throw 'HeidiSQL project session verification failed.'
}
Write-Host 'HeidiSQL OMNICOMPILE session configured for root at127.0.0.1:3307, database omnicompile.'
Write-Host 'Select OMNICOMPILE in HeidiSQL and enter the local root password when prompted. Other sessions were preserved.'
