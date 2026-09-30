# 01: The OpenAPI document becomes the checked wire contract

**What to build:** a copy of the OpenAPI document the backend serves is committed beside the API
design. The backend build fails when the served document differs from the committed copy, writes
the served one where it can be reviewed, and says exactly what to copy and what to run. The
frontend generates its TypeScript declarations from the committed copy with no backend running,
and CI fails when the committed declarations are stale. The stale declarations are regenerated now,
so the sign-in mode on the session, the set-password endpoint and its request body are in them.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A backend test fetches the served OpenAPI document anonymously and fails when it differs from the committed copy (JSON trees compared; key order and whitespace ignored, array order kept), or when the committed copy is missing, naming what to copy and what to run
- [ ] Every run of that test writes the served document to the backend's build output
- [ ] The served document is sorted, pretty-printed and names only a relative server, never a host
- [ ] The frontend's type generation reads the committed document; a staleness check fails when the committed declarations differ from what the document generates, and CI runs it
- [ ] The generated declarations are left exactly as the generator writes them (no formatter touches them)
- [ ] The regenerated declarations contain the session's sign-in mode (`PASSWORD`, `NONE`), the set-password path and its request body with a required password; the frontend's set-password request type is derived from them
- [ ] No API response changes; every other frontend type is unchanged
- [ ] ARCHITECTURE.md, docs/API.md and the README describe the committed document, how it is checked and how to change the contract
