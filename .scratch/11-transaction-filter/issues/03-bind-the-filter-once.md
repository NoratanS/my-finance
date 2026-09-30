# 03: Spring binds the Transaction filter once per endpoint

**What to build:** the list, `summary` and `category-totals` each receive the Transaction filter as one object bound from the query string, instead of six parameters spelled out three times. Nothing a client sees changes: the same parameter names, types, formats, defaults and optionality in the OpenAPI document, and the same status, Problem type and sentence for every malformed value — a value that cannot be read into the bound filter answers exactly as a malformed request parameter does today. The filter's documentation tells a contributor what binding by name, the nullable flag, the constructor that must not throw and the absence of Bean Validation mean.

**Blocked by:** 02 (Paging belongs to the list alone, and no endpoint can skip the filter's rules)

**Status:** ready-for-agent

- [ ] The three endpoints take the filter as one bound object; `category-counts` keeps its single search-term parameter
- [ ] A request without any filter keeps returning everything on every endpoint
- [ ] Every type-mismatch test from ticket 01 was seen failing before the exception handler learned binding failures, and passes after
- [ ] A handler unit test pins that a binding failure answers 400 `/errors/invalid-request` "Query parameter '<name>' has an invalid value." with no `errors` member, next to the existing body-validation test
- [ ] The committed OpenAPI document is unchanged (the drift test is green without regenerating it)
- [ ] Every existing test passes unchanged
- [ ] A lessons entry on binding query parameters to a record is written
