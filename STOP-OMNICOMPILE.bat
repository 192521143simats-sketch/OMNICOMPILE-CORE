@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo Stopping the three-service OmniCompile project without deleting data...
docker compose -f "%~dp0compose.yaml" stop
if errorlevel 1 exit /b 1
echo OmniCompile Core is stopped. Both MySQL volumes are preserved.
echo The independent general MYSQL server on port3306 remains available.
exit /b 0
