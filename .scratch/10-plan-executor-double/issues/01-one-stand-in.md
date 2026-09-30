# 01: One stand-in for the plan executor

**What to build:** every backend test that talks to the plan executor does so through one stand-in, held by the test class as a JUnit extension that starts before Spring builds the test context, resets before each test and stops after the class. The two hand-written in-process servers and the two "nothing is listening" helpers disappear into it. Its behaviour is unchanged: it still answers whatever the test scripts and accepts any request. No assertion changes.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] One stand-in class lives in the backend's test support package, beside the other test support classes, with no new test dependency
- [x] The client test and the execute endpoint test use it; neither writes its own server any more
- [x] The client test and the "analytics is not running" test take the unreachable address from the stand-in
- [x] Every assertion and every test count is unchanged (client 9, endpoint 8, not-running 1)
- [x] The full backend build is green
