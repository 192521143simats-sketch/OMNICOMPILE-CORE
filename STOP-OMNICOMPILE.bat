@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo Stopping the OmniCompile project without deleting data...
docker compose -f "%~dp0docker-compose.yml" stop
if errorlevel 1 exit /b 1
echo OmniCompile Core is stopped. Project data is preserved.
echo The independent general MYSQL server on port3306 is not managed by this script.
exit /b 0
