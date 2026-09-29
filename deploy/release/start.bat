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
  echo First run: creating .env with randomly generated secrets.
  call :ask_auth_mode
  rem PowerShell reads the answer as $env:AUTH_MODE at run time. cmd's own
  rem percent expansion would happen when it parses this whole block - before
  rem the prompt has even run - and see an empty value.
  powershell -NoProfile -Command "function New-Secret { -join ((48..57) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_}) }; (Get-Content .env.example) -replace '^POSTGRES_PASSWORD=.*', ('POSTGRES_PASSWORD=' + (New-Secret)) -replace '^DB_ANALYTICS_PASSWORD=.*', ('DB_ANALYTICS_PASSWORD=' + (New-Secret)) -replace '^ANALYTICS_TOKEN=.*', ('ANALYTICS_TOKEN=' + (New-Secret)) -replace '^MYFINANCE_AUTH_MODE=.*', ('MYFINANCE_AUTH_MODE=' + $env:AUTH_MODE) -replace '^MYFINANCE_BIND_ADDRESS=.*', ('MYFINANCE_BIND_ADDRESS=' + $env:BIND_ADDRESS) | Set-Content .env"
)

rem A .env written by a pre-analytics bundle has neither analytics secret, and
rem compose's default-value convention would quietly fall back to the published
rem dev defaults - never acceptable for a bearer token. Append what is missing.
powershell -NoProfile -Command "function New-Secret { -join ((48..57) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_}) }; foreach ($k in 'DB_ANALYTICS_PASSWORD', 'ANALYTICS_TOKEN') { if (-not (Select-String -Path .env -Pattern ('^' + $k + '=') -Quiet)) { Write-Host ('Adding a generated ' + $k + ' to .env (upgrade from an older bundle).'); Add-Content .env ($k + '=' + (New-Secret)) } }"

rem A .env from a bundle that predates the sign-in mode has neither key. Ask
rem once; after that the line is there and re-runs never prompt again.
findstr /b /l /c:"MYFINANCE_AUTH_MODE=" .env >nul 2>&1
if errorlevel 1 (
  echo Your .env does not choose a sign-in mode yet ^(upgrade from an older bundle^).
  call :ask_auth_mode
  powershell -NoProfile -Command "Add-Content .env ('MYFINANCE_AUTH_MODE=' + $env:AUTH_MODE); if (-not (Select-String -Path .env -Pattern '^MYFINANCE_BIND_ADDRESS=' -Quiet)) { Add-Content .env ('MYFINANCE_BIND_ADDRESS=' + $env:BIND_ADDRESS) }"
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
rem --remove-orphans stops containers from services an older bundle had and
rem this one doesn't (the removed ollama service), instead of leaving them running.
docker compose up -d --remove-orphans

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
call :no_auth_warning
pause
exit /b 1

:ready
echo.
echo my-finance is running at http://localhost:3000
call :no_auth_warning
pause
exit /b 0

rem Sets AUTH_MODE and the BIND_ADDRESS that goes with it. "none" has no login,
rem so it is only ever published on 127.0.0.1; the backend cannot see how its
rem port is published, which is why the pairing lives here. An empty answer
rem (Enter, or no input at all) keeps the default: password.
:ask_auth_mode
echo.
echo How should my-finance handle sign-in?
echo   password - accounts with passwords; reachable from other devices on your network.
echo   none     - no login at all; reachable only from this computer. Only for a
echo              single user on a machine they control.
:ask_auth_mode_again
rem set /p leaves the variable unchanged on an empty answer, so clear it first.
set "AUTH_MODE="
set /p "AUTH_MODE=Sign-in mode [password/none] (Enter = password): "
if not defined AUTH_MODE set "AUTH_MODE=password"
if /i "%AUTH_MODE%"=="password" (
  set "AUTH_MODE=password"
  set "BIND_ADDRESS=0.0.0.0"
  exit /b 0
)
if /i "%AUTH_MODE%"=="none" (
  set "AUTH_MODE=none"
  set "BIND_ADDRESS=127.0.0.1"
  exit /b 0
)
echo Please type password or none.
goto ask_auth_mode_again

rem Reads .env rather than AUTH_MODE: a re-run doesn't ask, and the user may
rem have edited the file.
:no_auth_warning
findstr /x /i /l /c:"MYFINANCE_AUTH_MODE=none" .env >nul 2>&1
if errorlevel 1 exit /b 0
echo.
echo WARNING: sign-in mode is "none" - there is NO authentication. Anyone who can
echo reach http://localhost:3000 has full access to all your data.
findstr /x /l /c:"MYFINANCE_BIND_ADDRESS=127.0.0.1" .env >nul 2>&1
if errorlevel 1 (
  echo MYFINANCE_BIND_ADDRESS in .env is not 127.0.0.1, so other devices on your
  echo network can reach it too. Set it to 127.0.0.1 and re-run this script.
)
exit /b 0
