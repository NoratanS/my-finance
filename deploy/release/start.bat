@echo off
rem Starts my-finance. Prerequisite: Docker Desktop.
rem Safe to re-run - it just pulls and restarts the stack.
cd /d "%~dp0"

rem Optional local AI: `start.bat --ai` adds the compose "ai" profile (an
rem ollama container plus its model cache). Without the flag nothing
rem AI-related is pulled, started, or downloaded.
set PROFILE_ARGS=
set WANT_AI=0
if "%~1"=="--ai" (
  set PROFILE_ARGS=--profile ai
  set WANT_AI=1
)
if not "%~1"=="" if not "%~1"=="--ai" (
  echo Usage: start.bat [--ai]
  echo   --ai   also start the optional local AI container ^(see README.md^)
  pause
  exit /b 1
)

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
  powershell -NoProfile -Command "function New-Secret { -join ((48..57) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_}) }; (Get-Content .env.example) -replace '^POSTGRES_PASSWORD=.*', ('POSTGRES_PASSWORD=' + (New-Secret)) -replace '^DB_ANALYTICS_PASSWORD=.*', ('DB_ANALYTICS_PASSWORD=' + (New-Secret)) -replace '^ANALYTICS_TOKEN=.*', ('ANALYTICS_TOKEN=' + (New-Secret)) | Set-Content .env"
)

rem A .env written by a pre-analytics bundle has neither analytics secret, and
rem compose's default-value convention would quietly fall back to the published
rem dev defaults - never acceptable for a bearer token. Append what is missing.
powershell -NoProfile -Command "function New-Secret { -join ((48..57) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_}) }; foreach ($k in 'DB_ANALYTICS_PASSWORD', 'ANALYTICS_TOKEN') { if (-not (Select-String -Path .env -Pattern ('^' + $k + '=') -Quiet)) { Write-Host ('Adding a generated ' + $k + ' to .env (upgrade from an older bundle).'); Add-Content .env ($k + '=' + (New-Secret)) } }"

echo Pulling images...
docker compose %PROFILE_ARGS% pull
if errorlevel 1 (
  echo.
  echo Warning: could not pull the my-finance images from ghcr.io - continuing
  echo with locally cached images. If this is the first run, the start below
  echo will fail; if the error says "denied", the images may not be public yet -
  echo please report it at https://github.com/NoratanS/my-finance/issues.
)
echo Starting my-finance...
docker compose %PROFILE_ARGS% up -d
if "%WANT_AI%"=="1" goto aipull
goto appwait

:aipull
echo Waiting for the AI container...
set /a aitries=0
:aiwait
timeout /t 2 /nobreak >nul
docker compose %PROFILE_ARGS% exec -T ollama ollama list >nul 2>&1
if not errorlevel 1 goto aiready
set /a aitries+=1
if %aitries% lss 30 goto aiwait

:aiready
echo Downloading the AI model. First run only: it is a few GB and is kept in
echo a Docker volume, so later starts reuse it.
rem Double-quoted here so cmd passes $OLLAMA_MODEL through untouched; the
rem container's shell expands it.
docker compose %PROFILE_ARGS% exec -T ollama sh -c "ollama pull $OLLAMA_MODEL"
if errorlevel 1 (
  echo.
  echo Warning: the model download did not finish. my-finance runs fine without
  echo it - free-text search stays off until you re-run start.bat --ai.
)

:appwait
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
