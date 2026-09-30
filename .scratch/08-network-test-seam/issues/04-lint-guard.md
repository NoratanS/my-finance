# 04: A lint rule keeps new tests on the network seam

**What to build:** a contributor who mocks the hooks or client module in a new test file, or answers JSON without naming its wire type, gets a lint error that points at the ARCHITECTURE.md paragraph. The files that still mock those modules are named in one allowlist, the migration's visible progress. ARCHITECTURE.md says so in one sentence.

**Blocked by:** 03 — The pinned-tile tests run on the network seam

**Status:** ready-for-agent

- [ ] A hook mock planted in a new test file fails lint (planted once, reverted)
- [ ] A JSON answer without a type argument fails lint (planted once, reverted)
- [ ] A misspelt field in a typed answer fails `npm run build` (planted once, reverted)
- [ ] The allowlist names exactly the twelve hook-mocked files and the old invalidation test
- [ ] lint, format, test and build stay green
