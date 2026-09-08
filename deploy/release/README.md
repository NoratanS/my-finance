# my-finance — run from this bundle

A self-hosted personal finance tracker. This bundle runs the whole app
(database, API, analytics service, web UI) on your own machine with Docker.

## Prerequisites

Docker is the only prerequisite:

- **Windows / macOS**: [Docker Desktop](https://docs.docker.com/get-docker/)
- **Linux**: Docker Engine with the compose plugin
  (`docker-compose-plugin` package)

## Start

1. Unzip this bundle anywhere.
2. Run the launcher:
   - **Windows**: double-click `start.bat`
   - **macOS / Linux**: `./start.sh`
3. Open **http://localhost:3000** and register an account.

On first run the script creates a `.env` file with randomly generated
secrets (the database password, the analytics role password, and the
analytics service token), pulls the images, and starts the stack. Re-running
it later is safe — it just restarts everything, and it fills in any secret a
`.env` from an older bundle is missing.

Always start with the launcher, not `docker compose up` directly: it is what
generates `ANALYTICS_TOKEN`, which `docker-compose.yml` here requires
explicitly and refuses to start without (no fallback to a published default).

## Optional: local AI

my-finance is complete without it: every insight can be built from templates
and chips. The AI layer adds one thing — typing a question in your own words
instead of clicking chips.

```
./start.sh --ai        # start.bat --ai on Windows
```

The first run downloads a language model (a few GB) into a Docker volume and
reuses it afterwards. It runs entirely on your machine; nothing is sent
anywhere. Change the model by editing `OLLAMA_MODEL` in `.env` and re-running
with `--ai`. Plain `./start.sh` never starts it; to stop one that is already
running, use `docker compose --profile ai down`.

## Where your data lives

All data is stored in a Docker named volume (`postgres-data`), so it
survives restarts and updates. For an application-level backup, use the
export/restore feature on the profile picker screen inside the app — it
downloads a JSON file you can store anywhere and restore later.

## Stop

```
docker compose down
```

(from this folder). Your data stays in the volume. `docker compose down -v`
deletes the data too — only use it to wipe the instance.

## Update

Download the newer release bundle and unzip it — over this folder, or into a
new one with your `.env` copied across — then run the start script again.
Your data volume is reused. If the script finds your database but no `.env`,
it stops and tells you to copy the old one rather than locking the app out
of its own data.
