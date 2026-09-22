#!/usr/bin/env bash
# Starts my-finance. Prerequisite: Docker (Desktop or Engine with the
# compose plugin). Safe to re-run — it just pulls and restarts the stack.
set -eu

cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker is not installed (or not on your PATH)."
  echo "Install Docker Desktop or Docker Engine: https://docs.docker.com/get-docker/"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Error: the 'docker compose' plugin is not available."
  echo "It ships with Docker Desktop; on Linux install the docker-compose-plugin package."
  exit 1
fi

# 24 alphanumeric characters — one recipe, one fresh value per secret.
gen_secret() {
  LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 24
}

if [ ! -f .env ]; then
  # An existing database volume with no .env means this is an upgrade into a
  # fresh folder: generating a new password here would lock the app out of
  # its own data.
  if docker volume inspect my-finance_postgres-data >/dev/null 2>&1; then
    echo "Error: found an existing my-finance database volume but no .env here."
    echo "Copy the .env from your previous bundle folder into this one (it holds"
    echo "the database password), or run 'docker compose down -v' there first to"
    echo "deliberately wipe the old data."
    exit 1
  fi
  echo "First run: creating .env with randomly generated secrets."
  sed -e "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(gen_secret)/" \
      -e "s/^DB_ANALYTICS_PASSWORD=.*/DB_ANALYTICS_PASSWORD=$(gen_secret)/" \
      -e "s/^ANALYTICS_TOKEN=.*/ANALYTICS_TOKEN=$(gen_secret)/" \
      .env.example > .env
fi

# A .env written by a pre-analytics bundle has neither analytics secret, and
# compose's ${VAR:-default} convention would quietly fall back to the published
# dev defaults — never acceptable for a bearer token. Append what is missing.
for key in DB_ANALYTICS_PASSWORD ANALYTICS_TOKEN; do
  if ! grep -q "^${key}=" .env; then
    echo "Adding a generated ${key} to .env (upgrade from an older bundle)."
    printf '%s=%s\n' "$key" "$(gen_secret)" >> .env
  fi
done

echo "Pulling images..."
if ! docker compose pull; then
  echo ""
  echo "Warning: could not pull the my-finance images from ghcr.io — continuing"
  echo "with locally cached images. If this is the first run, the start below"
  echo "will fail; if the error above says 'denied', the images may not be"
  echo "public yet — please report it at https://github.com/NoratanS/my-finance/issues."
fi
echo "Starting my-finance..."
docker compose up -d

# Poll until the frontend answers (the backend healthcheck gates it, so this
# usually takes well under a minute on first run).
probe() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS -o /dev/null "$1" 2>/dev/null
  elif command -v wget >/dev/null 2>&1; then
    wget -q -O /dev/null "$1" 2>/dev/null
  else
    return 0 # no probe tool available; assume it will be up shortly
  fi
}

printf "Waiting for the app to come up"
for _ in $(seq 1 45); do
  if probe http://localhost:3000; then
    printf "\n\nmy-finance is running at http://localhost:3000\n"
    exit 0
  fi
  printf "."
  sleep 2
done

printf "\n"
echo "Still starting. If http://localhost:3000 does not answer shortly, check:"
echo "  docker compose ps"
echo "  docker compose logs"
exit 1
