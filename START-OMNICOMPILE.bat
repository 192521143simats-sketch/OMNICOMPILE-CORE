@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "PATH=%ProgramFiles%\Docker\Docker\resources\bin;%PATH%"
set "PS7=%ProgramFiles%\PowerShell\7\pwsh.exe"
if exist "%PS7%" goto RUN
where pwsh.exe >nul 2>&1
if errorlevel 1 goto MISSING
set "PS7=pwsh.exe"
:RUN
"%PS7%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-Product.ps1" %*
if errorlevel 1 goto FAILED
exit /b 0
:MISSING
echo ERROR: PowerShell 7 is required. Install it and reopen this launcher.
:FAILED
echo.
echo OmniCompile startup failed. Read the error above and .runtime\startup logs.
echo The existing database and files have been preserved.
pause
exit /b 1
