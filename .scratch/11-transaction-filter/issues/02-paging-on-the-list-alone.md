# 02: Paging belongs to the list alone, and no endpoint can skip the filter's rules

**What to build:** the Transaction filter no longer carries a page and a size, so the aggregates stop pretending to page. The list takes paging next to the filter and checks it first; the filter's rules are checked in the one place a filter becomes a database query, so no endpoint can forget them; `category-counts` passes only its search term, so its restriction is stated by the service's signature. Every answer stays as ticket 01 pinned it, except one, which is documented: a list request that breaks a paging rule and a filter rule at once reports the paging sentence.

**Blocked by:** 01 (Pin every answer to a bad transaction query parameter)

**Status:** done

- [x] A list request with `page=-1` and `from` after `to` answers "'page' must be 0 or greater." (seen failing first on today's code)
- [x] The filter holds only the six filters; there is no fake-paging constructor and no separate validation call to remember
- [x] `category-counts` passes only the search term to the service
- [x] 409, then 400, then 404 keep their precedence on every filtered endpoint
- [x] Every test from ticket 01 and every existing test passes unchanged
- [x] The API document states that the paging sentence wins when a paging rule and a filter rule are broken together
- [x] The committed OpenAPI document is unchanged

## Comments

- Red before the change: the paging-and-filter test answered "'from' must not be after 'to'."
- The docs proposals held no sentence for the one intended change; one was added to the list's
  section ("They are checked first: …").
- Backend: `Tests run: 472, Failures: 0, Errors: 0, Skipped: 0`.
