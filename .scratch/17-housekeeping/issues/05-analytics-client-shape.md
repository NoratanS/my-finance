# 05: The plan executor client has the shape its one endpoint needs

**What to build:** the backend's client for the plan executor names its one execute path once and uses it for the request and both log lines; the private HTTP helper no longer takes a path. Its HTTP/1.1 comment states only what is certain and names no HTTP parser as the culprit. Behaviour is identical.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The execute path is a single constant used by the request and both log lines
- [ ] The private HTTP helper takes no path parameter
- [ ] The HTTP/1.1 comment says: the JDK default sends a cleartext h2c upgrade; uvicorn supports no upgrade except WebSocket; against the real service that request failed ("not JSON" -> analytics unavailable); pinning HTTP/1.1 keeps the backend independent of how uvicorn's HTTP implementation (httptools under `uvicorn[standard]`, h11 without it) treats an upgrade. The sentence about the in-process test double stays
- [ ] The client's existing test is unchanged and green; the full backend build is green
