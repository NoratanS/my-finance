# 03: The pinned-tile tests run on the network seam

**What to build:** the pinned insight tiles' tests, written with the client function stubbed by path while the network seam did not exist yet, declare their answers to the test server instead. Same test names, same assertions; the tiles' full network conversation (Session, Insights, Categories, execution) is declared in the file, and no test mocks the client module any more.

**Blocked by:** 01 — A shared test server answers every request, and nothing reaches a socket

**Status:** ready-for-agent

- [ ] The file no longer mocks the client module; only the chart renderer is replaced
- [ ] Every test keeps its name and its assertions
- [ ] Each converted test still fails against the defect it pins (planted once, reverted)
- [ ] lint, format, test and build stay green
