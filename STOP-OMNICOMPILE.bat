@echo off
setlocal EnableExtensions
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\docker\operations\Manage-LowDisk.ps1" -Action Stop %*
exit /b %errorlevel%
