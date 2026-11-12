---
name: verify
description: Prove a slice works in the running app with playwright-cli, walking its acceptance criteria. Use after implementing any slice that changes web/, or when asked to check a change in the browser.
---

Prove the slice against the real running app, criterion by criterion.

## Steps

1. **Start the app** with `bin/dev` from the repo root. It starts Postgres, the API and the web app. Wait until both answer. Then run `bin/rails db:seed` in `api/`: it creates `verify-admin@example.com` and `verify-member@example.com`, both with the password `verify password 42`. If the seed warns that another user is the admin, ask the owner before running `bin/rails db:reset`.
2. **Read the criteria** from the slice issue (`gh issue view <n>`) and note the boards it links.
3. **Walk each criterion** with the `playwright-cli` skill, run from the repo root so it picks up `.playwright/cli.config.json` (Chromium). Use desktop width (1440×900), plus tablet (834×1194) and phone (390×844) when the board has those designs. Act as a user: navigate, fill, click. Read the page through snapshots; take a screenshot only when layout is the thing being checked.
4. **Check the plumbing** on every screen you visit: no console errors, no failed or 5xx network requests.
5. **Stop the app** and close the browser.

Done when every criterion has a pass or fail line backed by something you saw.

## Report

```
Verified <n>/<m> criteria (desktop[, tablet][, phone])
✅ <criterion>
❌ <criterion> — <what happened instead>
Console/network: clean | <errors>
```

These lines go into the PR's **How verified**. A walkthrough stays a walkthrough: the one durable e2e test is the CI smoke (ADR 0005).
