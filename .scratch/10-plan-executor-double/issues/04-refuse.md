# 04: The stand-in refuses what the executor refuses

**What to build:** the stand-in refuses, in the executor's order, an HTTP/2 upgrade offer (answered as the shipped executor answers it), another method, a JSON body that does not parse, and a request wrapper that is not an object with an integer profile id and a plan. Reverting the backend's HTTP/1.1 pin now fails the backend's own tests the way production failed, and one test proves that a default-configured JDK client really is refused while the backend's client succeeds against the same stand-in. The production comment about the pin describes the stand-in truthfully.

**Blocked by:** 03 (The stand-in answers with the recorded exchanges)

**Status:** ready-for-agent

- [ ] Checks run in the executor's order: upgrade, method, JSON decoding, token, wrapper, recorded answer
- [ ] Bodies the backend never reads are written in the stand-in, each citing its source
- [ ] The HTTP/2 guard asserts that a default-version JDK client is refused and the backend's client is not; it no longer inspects a recorded header
- [ ] The HTTP/1.1 comment's last sentence names the stand-in and what it now refuses
- [ ] docs/INSIGHTS.md "Testing strategy" lists the refusals
- [ ] The full backend build is green
