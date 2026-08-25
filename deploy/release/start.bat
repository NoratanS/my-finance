@echo off
rem Starts my-finance. Prerequisite: Docker Desktop.
rem Safe to re-run - it just pulls and restarts the stack.
cd /d "%~dp0"

where docker >nul 2>&1
if errorlevel 1 (
  echo Error: Docker is not installed ^(or not on your PATH^).
  echo Install Docker Desktop: https://docs.docker.com/get-docker/
  pause
  exit /b 1
)

docker compose version >nul 2>&1
if errorlevel 1 (
  echo Error: the "docker compose" command is not available.
  echo It ships with Docker Desktop - please update or reinstall it.
  pause
  exit /b 1
)

if not exist .env (
  rem An existing database volume with no .env means an upgrade into a fresh
  rem folder: a new random password would lock the app out of its own data.
  docker volume inspect my-finance_postgres-data >nul 2>&1
  if not errorlevel 1 (
    echo Error: found an existing my-finance database volume but no .env here.
    echo Copy the .env from your previous bundle folder into this one ^(it holds
    echo the database password^), or run "docker compose down -v" there first to
    echo deliberately wipe the old data.
    pause
    exit /b 1
  )
  echo First run: creating .env with a random database password.
  powershell -NoProfile -Command "$p = -join ((48..57) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_}); (Get-Content .env.example) -replace '^POSTGRES_PASSWORD=.*', ('POSTGRES_PASSWORD=' + $p) | Set-Content .env"
)

echo Pulling images...
docker compose pull
if errorlevel 1 (
  echo.
  echo Warning: could not pull the my-finance images from ghcr.io - continuing
  echo with locally cached images. If this is the first run, the start below
  echo will fail; if the error says "denied", the images may not be public yet -
  echo please report it at https://github.com/NoratanS/my-finance/issues.
)
echo Starting my-finance...
docker compose up -d

echo Waiting for the app to come up...
set /a tries=0
:wait
timeout /t 2 /nobreak >nul
curl -fs -o NUL http://localhost:3000 >nul 2>&1
if not errorlevel 1 goto ready
set /a tries+=1
if %tries% lss 45 goto wait

echo Still starting. If http://localhost:3000 does not answer shortly, check:
echo   docker compose ps
echo   docker compose logs
pause
exit /b 1

:ready
echo.
echo my-finance is running at http://localhost:3000
pause
