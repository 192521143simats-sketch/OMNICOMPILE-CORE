@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo [1/6] Checking Docker Engine...
docker info >nul 2>&1
if not errorlevel 1 goto DOCKER_READY
echo [2/6] Starting Docker Desktop and waiting for Engine readiness...
set "DOCKER_DESKTOP=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
if not exist "%DOCKER_DESKTOP%" set "DOCKER_DESKTOP=%LocalAppData%\Docker\Docker Desktop.exe"
if not exist "%DOCKER_DESKTOP%" (
 echo ERROR: Docker Desktop was not found. Install it before starting OmniCompile Core.
 exit /b 1
)
start "" "%DOCKER_DESKTOP%"
set /a DOCKER_WAIT=0
:WAIT_DOCKER
powershell.exe -NoProfile -Command "Start-Sleep -Seconds 2"
docker info >nul 2>&1
if not errorlevel 1 goto DOCKER_READY
set /a DOCKER_WAIT+=2
if %DOCKER_WAIT% GEQ 180 (
 echo ERROR: Docker Engine did not become ready within180 seconds.
 exit /b 1
)
goto WAIT_DOCKER
:DOCKER_READY
echo [2/6] Docker Engine is ready.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Initialize-Environment.ps1" -ProjectRoot "%~dp0."
if errorlevel 1 exit /b 1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0infra\docker\operations\Start-Containers.ps1" -ProjectRoot "%~dp0."
if errorlevel 1 exit /b 1
start "" "http://localhost:5173/"
exit /b 0
