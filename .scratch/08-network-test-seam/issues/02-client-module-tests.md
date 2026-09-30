# 02: The client module's request contract is covered

**What to build:** the one module every request passes through is tested at the network seam: the CSRF header on mutating requests only, JSON bodies and their content type, parsed 2xx bodies, `204`, a Problem becoming an `ApiError` with every member, a non-JSON error body, a network failure, the Session events for `401` and `409` `no-active-profile` and their opt-out, the backup download and the backup upload. API.md "Errors" names the two Problems the security layer writes, which the fixtures mirror.

**Blocked by:** 01 — A shared test server answers every request, and nothing reaches a socket

**Status:** done

- [x] Every request, Session-event, download and upload behaviour the spec lists has a test
- [x] The query-string builder is tested by calling it
- [x] Removing the CSRF header from the client fails the CSRF test (planted once, reverted)
- [x] Stopping the client firing the `409` event fails the event test (planted once, reverted)
- [x] API.md "Errors" names `401` `/errors/unauthenticated` and `403` `/errors/forbidden`
- [x] lint, format, test and build stay green

## Comments

- **Planted defects, each seen failing and reverted** (23 plants in `client.ts`; every one of the 24
  tests failed at least once): the CSRF header removed (the four mutating-method tests fail), sent
  on reads (the read test), sent empty without a cookie (the no-cookie test), the cookie not
  decoded, a JSON content type on every request, the `204` branch removed, 2xx bodies not parsed,
  field errors / extension members / title dropped, the fallback type changed, a network failure
  wrapped in `ApiError`, the `401` event removed, the `409` event removed, the `409` event fired
  for any type, the opt-out ignored (both opt-out tests), the download's filename / fallback /
  CSRF header / Problem branch broken, the upload's JSON content type and CSRF header, and
  `queryString` keeping undefined values.
- **Deviation — the uploaded part is a string, not a `File`.** The spec expected a jsdom `File`
  to survive interception with only its filename changed. Executed, the part arrives *empty*:
  Vitest 5's jsdom bridge copies a `Blob`'s bytes from jsdom's private `_buffer`, which jsdom 30
  renamed to `_bytes`. The test appends the backup as a string part instead; what the client owns
  (the `FormData` passed through untouched as multipart, no JSON content type, the CSRF header) is
  asserted the same way. A future screen-level restore test meets the same limitation.
