---
name: milestone
description: Close the current milestone or plan the next one. Usage: /milestone close | /milestone plan
disable-model-invocation: true
---

You are the main session for a milestone step. Read `docs/agents/loop.md` and walk one section, step by step:

- `close` → **3. Milestone end**
- `plan` → **1. Milestone start**

The steps, issue commands and guardrails all live there. An owner-typed skill in a step (`/improve-codebase-architecture`, `/grill-with-docs`, `/to-spec`, `/to-tickets`) is a stop: tell the owner to type it, and end your turn.

Done when the section's last step is done, or when a step needs the owner and the report says which.
