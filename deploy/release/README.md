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
3. Answer the one question it asks — the sign-in mode, see below. Press
   Enter if unsure.
4. Open **http://localhost:3000**. In `password` mode, register an account;
   in `none` mode you land straight in the app.

On first run the script creates a `.env` file with randomly generated
secrets (the database password, the analytics role password, and the
analytics service token) and your sign-in mode, pulls the images, and starts
the stack. Re-running it later is safe — it just restarts everything, and it
fills in any secret a `.env` from an older bundle is missing (asking for the
sign-in mode once, if that `.env` predates it).

Always start with the launcher, not `docker compose up` directly: it is what
generates `ANALYTICS_TOKEN`, which `docker-compose.yml` here requires
explicitly and refuses to start without (no fallback to a published default).

## Sign-in mode

The launcher asks how my-finance should handle sign-in:

- **password** (the default — Enter, or no answer): everyone signs in with an
  email and a password. The app listens on every network interface, so other
  devices on your network can open it at `http://<this computer's address>:3000`.
- **none**: no login screen — the app serves one local account. It listens on
  `127.0.0.1` only, so it can be reached from this computer and nothing else.

> **Warning: `none` means no authentication.** Anyone who can reach port 3000
> has full access to all your data. Use it only on a computer you alone
> control, and never expose it beyond that machine — no port forwarding, no
> reverse proxy, no changing `MYFINANCE_BIND_ADDRESS` away from `127.0.0.1`.
> The launcher prints a warning at the end of every start in this mode.

Your answer is saved in `.env` as two lines, and the launcher doesn't ask
again:

```
MYFINANCE_AUTH_MODE=none
MYFINANCE_BIND_ADDRESS=127.0.0.1
```

To switch later, edit both lines in `.env` — keep them paired: `none` with
`127.0.0.1`, `password` with `0.0.0.0` — and run the launcher again.

- **none → password**: the local account has no password yet, so set one
  *before* switching — in the app, open **Set password** in the navigation.
  After the switch, sign in with the email `local@localhost` and that
  password. (If you switch first, sign-in simply fails: switch back to
  `none`, set the password, and switch again.)
- **password → none**: works while the instance has at most one account,
  which then signs in automatically. With more than one account the app
  refuses to start rather than guess whose data to show.

## Time zone

Insights decide what "today" is — and so "this month", "last N months" and "year
to date" — in the time zone set by `TZ` in `.env`, UTC by default. To count in
your own zone, set it to an IANA name and run the launcher again:

```
TZ=Europe/Warsaw
```

Only Insights follow it. The daily subscription charge job (00:05 UTC), the
subscriptions screen's dates and backup restore's date re-basing stay on UTC, so
near midnight the two can disagree about "today". A misspelled zone makes every
insight fail with "the analytics service isn't running". If your `.env` came
from an older bundle and has no `TZ` line, add one.

## Where your data lives

All data is stored in a Docker named volume (`postgres-data`), so it
survives restarts and updates. (There's a second named volume, `redis-data`,
holding logged-in sessions — losing it just signs everyone out, not a data
loss.) For an application-level backup, use the export/restore feature on the
profile picker screen inside the app — it downloads a JSON file you can store
anywhere and restore later.

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

Upgrading from a bundle that had the optional local AI (`--ai`): the start
script removes the old `ollama` container, but not the downloaded model. To
free those few GB, run `docker volume rm my-finance_ollama-models`. The
`OLLAMA_MODEL` line left in your `.env` is ignored.
