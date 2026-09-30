# 01: Pin every answer to a bad transaction query parameter

**What to build:** every answer a client gets for a bad query parameter on the transaction list and its aggregates is pinned by a test and written in the API document, before anything about the binding moves. A malformed date, id, flag or direction on the list, `summary` and `category-totals` answers 400 `/errors/invalid-request` with "Query parameter '<name>' has an invalid value."; each rule of the list answers its exact sentence; `category-counts` rejects a search term over 100 characters and ignores every other filter; an empty `from=` or `includeDescendants=` means "not set"; a malformed parameter is reported before the missing active profile, a broken rule after it. No production code changes.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The list answers the exact sentence for `from` after `to`, `includeDescendants` without `categoryId`, `page` below 0, `size` of 0 and of 201, and a 101-character search term
- [ ] A value that cannot be read in `from`, `to`, `categoryId`, `includeDescendants` or `type` answers 400 `application/problem+json` `/errors/invalid-request` "Query parameter '<name>' has an invalid value." on each of the list, `summary` and `category-totals`
- [ ] Two unreadable parameters in one request name `from`, the first of them
- [ ] `category-counts` with a 101-character search term answers 400 `/errors/invalid-request` "'q' must be at most 100 characters."
- [ ] `category-counts` with a `from` far in the future still counts every transaction
- [ ] `from=` and `includeDescendants=` behave as absent
- [ ] Without an active profile, an unreadable parameter answers 400 and a broken rule answers 409
- [ ] Every new test is green on today's code; every existing test passes unchanged
- [ ] The API document has a "Query parameter problems" paragraph under "Errors", names the Problem type and every cause in the list's and the aggregates' 400 rows, says the six filters mean and are checked the same on the list, `summary` and `category-totals`, and splits the two 400 slugs in the status-code summary
