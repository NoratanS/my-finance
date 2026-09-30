# 03: Spring binds the Transaction filter once per endpoint

**What to build:** the list, `summary` and `category-totals` each receive the Transaction filter as one object bound from the query string, instead of six parameters spelled out three times. Nothing a client sees changes: the same parameter names, types, formats, defaults and optionality in the OpenAPI document, and the same status, Problem type and sentence for every malformed value — a value that cannot be read into the bound filter answers exactly as a malformed request parameter does today. The filter's documentation tells a contributor what binding by name, the nullable flag, the constructor that must not throw and the absence of Bean Validation mean.

**Blocked by:** 02 (Paging belongs to the list alone, and no endpoint can skip the filter's rules)

**Status:** done

- [x] The three endpoints take the filter as one bound object; `category-counts` keeps its single search-term parameter
- [x] A request without any filter keeps returning everything on every endpoint
- [x] Every type-mismatch test from ticket 01 was seen failing before the exception handler learned binding failures, and passes after
- [x] A handler unit test pins that a binding failure answers 400 `/errors/invalid-request` "Query parameter '<name>' has an invalid value." with no `errors` member, next to the existing body-validation test
- [x] The committed OpenAPI document is unchanged (the drift test is green without regenerating it)
- [x] Every existing test passes unchanged
- [x] A lessons entry on binding query parameters to a record is written

## Comments

- Red before the handler branch: 19 tests in the transaction controller class (the 15 type-mismatch
  cases, the two-unreadable-parameters case, the no-active-profile case, and the existing
  `malformedDateIs400` and `typeFilterAndCombinedFilters`) answered `/errors/validation-failed`.
  The handler unit test was red on the Problem type too.
- Unverified fact 1 and 2 of the spec, settled by the drift test: the served document is identical
  to the committed `docs/openapi.json` without regenerating it. Parameter order is the same, which
  the drift test requires although the spec called order insignificant. `includeDescendants` keeps
  `"default": false` as a boolean. `@Schema(defaultValue = "false")` on the record component is
  honoured, and it is load-bearing: removed, the drift test fails with the default gone.
- Unverified fact 3, after half: `from=` and `includeDescendants=` still mean "not set" through the
  bound record (ticket 01's test is green).
- Unverified fact 4: the existing date tests pass through the bound record, so it uses the same ISO
  date conversion.
- Backend: `Tests run: 473, Failures: 0, Errors: 0, Skipped: 0`.
