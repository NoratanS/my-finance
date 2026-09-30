# 04: The stand-in refuses what the executor refuses

**What to build:** the stand-in refuses, in the executor's order, an HTTP/2 upgrade offer (answered as the shipped executor answers it), another method, a JSON body that does not parse, and a request wrapper that is not an object with an integer profile id and a plan. Reverting the backend's HTTP/1.1 pin now fails the backend's own tests the way production failed, and one test proves that a default-configured JDK client really is refused while the backend's client succeeds against the same stand-in. The production comment about the pin describes the stand-in truthfully.

**Blocked by:** 03 (The stand-in answers with the recorded exchanges)

**Status:** done

- [x] Checks run in the executor's order: upgrade, method, JSON decoding, token, wrapper, recorded answer
- [x] Bodies the backend never reads are written in the stand-in, each citing its source
- [x] The HTTP/2 guard asserts that a default-version JDK client is refused and the backend's client is not; it no longer inspects a recorded header
- [x] The HTTP/1.1 comment's last sentence names the stand-in and what it now refuses
- [x] docs/INSIGHTS.md "Testing strategy" lists the refusals
- [x] The full backend build is green

## Comments

- The upgrade refusal was verified by execution, not only read from source: uvicorn 0.52.4 with
  httptools 0.8.0 (the locked versions), serving the real `analytics.main:app` on a free loopback
  port with the database dependency overridden, was called by a JDK 21 `HttpClient` left at its
  default version. Five calls out of five were answered `400`, `content-type: text/plain;
  charset=utf-8`, `connection: close`, body `Invalid HTTP request received.`, with uvicorn
  logging "Unsupported upgrade request." then "Invalid HTTP request received."; the same client
  pinned to HTTP/1.1 got the executor's JSON answer. (A toy async app on the same server answered
  the bodiless request itself, with a 200, before the leftover bytes were rejected: the race
  depends on how quickly the app answers, and the real executor, whose dependencies run in a
  thread pool, loses it every time.) The stand-in imitates the observed answer.
- Reverting `AnalyticsClient`'s HTTP/1.1 pin locally made 10 of the 18 tests that use the
  stand-in fail, the guard among them; the other 8 expect analytics-unavailable anyway or never
  reach the stand-in (restored afterwards).
- The refusal order was exercised by hand with a scratch test (deleted): GET/PUT 405 with
  `Allow: POST`; malformed JSON without a token 422 (decode before token); a non-JSON content
  type without a token 401, with the token 422; an empty body, an array, a string `profileId`
  and a missing `plan` 422; a wrong token 401; `application/problem+json` decoded as JSON.
- The token check itself landed in ticket 03 (see its comments); this ticket adds the rest.
