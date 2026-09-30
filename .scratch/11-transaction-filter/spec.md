# Bind the Transaction filter once: one filter object for the list and its aggregates, paging on the list alone

Status: ready-for-agent
Candidate: 11 — Bind the Transaction filter once
Strength: Worth exploring
Depends on: none

## Problem Statement

The transaction list and its aggregates (`summary`, `category-totals`) share six optional filters —
date range, category (with or without its subcategories), direction and search term — and they are
meant to select exactly the same rows. But the owner and any contributor meet those six filters
spelled out three times in the transaction controller, eighteen parameter declarations in all, plus
paging on the list. Adding the search filter touched four source files and two test classes.

The filter record carries page and size although only the list pages, so the aggregates build it
with a fake page (0) and a fake size (1) just to satisfy the shared validation. That validation is a
separate call each of the four service methods has to remember before building its query.

Meanwhile the exact answer to a bad query parameter — a 400 with the `invalid-request` slug and one
sentence naming the parameter — is not written in the API document, and most of its sentences are
not pinned by any test. A refactor of the binding could change them without anyone noticing, even
though they are part of what clients see.

## Solution

The six filters become one `TransactionFilter` object that Spring binds from the query string once
per endpoint (`GET /api/transactions`, `/summary`, `/category-totals`). Paging stays two plain
parameters of the list alone, so the aggregates no longer pretend to page. The filter's rules run in
the one place where a filter becomes a database query, so no endpoint can skip them, and the
exception handler answers a malformed parameter on the bound object exactly as it answers one today.

Nothing a client sees changes: same parameter names, types, defaults and optionality in the OpenAPI
document; same statuses, slugs and sentences for every mistake; `category-counts` still accepts only
the search term. The API document now spells out the query-parameter error shape, and new tests pin
every sentence before the refactor starts.

## User Stories

1. As the owner, I want the six transaction filters declared once, so that adding a seventh filter means changing one record and one query builder instead of three controller signatures.
2. As the owner, I want paging to belong to the list alone, so that the aggregates no longer carry a fake page and size.
3. As the owner, I want the filter's rules checked in the one place a filter turns into a database query, so that no endpoint can forget to validate before querying.
4. As the owner, I want the list, the summary and the category totals to keep sharing one query builder, so that a total always covers exactly the rows its list shows.
5. As the owner, I want `category-counts` to keep accepting only the search term, so that the category tree keeps seeing the whole profile as the API document promises.
6. As the owner, I want the `category-counts` restriction stated by the service method's signature, so that it is not just a controller convention someone can break by passing a full filter.
7. As a future contributor, I want the filter record's documentation to say that Spring binds query parameters to its components by name, so that I know renaming a component renames a query parameter.
8. As a future contributor, I want the record's documentation to say why `includeDescendants` is a nullable wrapper normalised to false, so that I do not turn it back into a primitive and break every request that omits it.
9. As a future contributor, I want the record's documentation to say its constructor must never throw, so that I do not move validation there and turn a bad request into a 500.
10. As a future contributor, I want the record's documentation to say why it carries no Bean Validation annotations, so that I do not add ones that are either ignored or change the error shape.
11. As a future contributor, I want the OpenAPI parameters to be generated from the filter record, so that the documented parameters cannot drift from the bound ones.
12. As a self-hosting user, I want a malformed date in a filter to keep answering "Query parameter 'from' has an invalid value.", so that any script or screen that reads the message keeps working.
13. As a self-hosting user, I want an unknown transaction type, a non-numeric category id or a non-boolean `includeDescendants` to be rejected the same way on the list and on the aggregates, so that the three endpoints behave as one.
14. As a self-hosting user, I want `from` after `to`, `includeDescendants` without a category, a search term over 100 characters, a page below 0 and a size outside 1–200 to keep their exact messages, so that nothing changes for me.
15. As a self-hosting user, I want a request without any filter to keep returning everything, so that the transactions screen and the dashboard keep loading.
16. As a self-hosting user, I want an empty `includeDescendants=` or `from=` to keep meaning "not set", so that hand-written URLs keep working.
17. As a self-hosting user, I want a category from another profile to keep answering 404 on every filtered endpoint, so that no endpoint reveals another profile's data.
18. As a self-hosting user without an active profile, I want to keep getting 409 for a well-formed filtered request, so that the app sends me to the profile picker as before.
19. As a self-hosting user, I want `page` and `size` still to be rejected when out of range rather than silently clamped, so that the API never returns a different page than I asked for.
20. As the owner maintaining the frontend, I want the generated operation types for the four endpoints to stay identical, so that nothing in the frontend has to change.
21. As a reviewer, I want every query-parameter error sentence pinned by a test before the binding changes, so that I can see the refactor kept them.
22. As a reviewer, I want a type-mismatch test on each of the three bound endpoints, so that the new binding path is proven on the aggregates, not only on the list.
23. As a reviewer, I want a test that `category-counts` ignores other filters and rejects a long search term, so that its documented restriction and its documented 400 are both held.
24. As a reviewer, I want the exception handler's new branch unit-tested, so that the rendering of a binding failure is pinned without a database.
25. As a reviewer, I want the OpenAPI document diffed before and after the binding change, so that I can confirm the four operations are unchanged.
26. As a reviewer, I want the one observable difference — which sentence wins when a list request breaks a paging rule and a filter rule at once — stated in the spec and the API document, so that nothing changes silently.
27. As the owner, I want the API document to state that query-parameter problems are 400 `/errors/invalid-request` with one `detail` and no `errors` list, so that the error shape for query strings is part of the written contract.
28. As a client developer, I want the status-code summary to say which 400 slug means a bad body and which a bad query parameter, so that I can branch on the slug.
29. As a learner of Spring, I want a short lesson on binding query parameters to a record, so that I understand constructor binding, the primitive trap and why `@ParameterObject` is documentation only.
30. As the maintainer of the OpenAPI work (candidate 15), I want to know how the filter's parameters are generated and which annotations are safe to add for documentation, so that I do not change the error shape by accident.
31. As a self-hosting user, I want an unrelated request header never to change my results, so that a proxy cannot alter what the list returns (standard headers such as `From` are excluded by Spring; the residual risk is recorded).

## Implementation Decisions

**Modules modified**

- **`TransactionFilter`** moves from the service package to `dto`, because it becomes the bound
  request shape of the query string (every controller-bound shape lives in `dto`). Its components, in
  order: `from` and `to` (dates, inclusive bounds), `categoryId`, `includeDescendants`, `type`, `q`.
  It loses `page`, `size` and the second constructor that faked paging. `includeDescendants` is a
  nullable `Boolean` that the compact constructor normalises to `false`, so its accessor never returns
  `null`; the component also declares a schema default of `false` so the OpenAPI document keeps it.
  The compact constructor does nothing else. The record carries no Bean Validation annotations. Its
  documentation states: Spring binds query parameters to components by name (the names are the wire
  names); a primitive component would make every request that omits it a 400; a constructor exception
  during binding becomes a 500; validation lives in `TransactionService`.
- **`TransactionController`**: `list`, `summary` and `categoryTotals` each take one `TransactionFilter`
  argument annotated with springdoc's `@ParameterObject` (documentation only; binding is Spring's
  implicit model-attribute binding). `list` additionally takes `page` (default 0) and `size`
  (default 50) as plain request parameters. `categoryCounts` keeps its single optional `q` request
  parameter and passes it to the service as is.
- **`TransactionService`**:
  - `list(filter, page, size)`: checks the active profile, then paging ("'page' must be 0 or greater.",
    "'size' must be between 1 and 200."), then builds the specification.
  - `summary(filter)` and `categoryTotals(filter)`: check the active profile, then build the
    specification.
  - `categoryCounts(q)`: checks the active profile, then builds the specification for a filter that
    holds only `q`.
  - The private specification builder (today `filterSpec`) first checks the filter's rules — "'from'
    must not be after 'to'.", "'includeDescendants' requires 'categoryId'.", "'q' must be at most 100
    characters." — in that order, each as `InvalidRequestException`; then adds the mandatory profile
    predicate, the date, type and search predicates, and resolves the category in the active profile
    (404 for another profile's category) and its subtree when asked. Its documentation says it
    validates. The separate `validate` method and its four call sites disappear. `MAX_PAGE_SIZE` and
    `MAX_SEARCH_LENGTH` keep their values and names.
- **`GlobalExceptionHandler.handleMethodArgumentNotValid`**: when the binding result holds a field
  error that is a binding failure (a query value that could not be converted), it answers 400 with
  type `/errors/invalid-request`, title "Invalid request", detail "Query parameter '<field>' has an
  invalid value." for the first such error, and no `errors` member. Otherwise it behaves exactly as
  today. `handleTypeMismatch` and the new branch build their problem through one shared helper so the
  sentence exists once. The handler's documentation records the assumption that model attributes in
  this API are bound only from the query string.

**Unchanged modules** — `TransactionSpecifications`, `TransactionAggregates` and its implementation,
the repositories, and every other controller. No layer rule changes (the filter lives in `dto`, which
the architecture test does not constrain; no repository depends on it).

**Binding details the implementation relies on (verified in Spring Framework 7.0.8 bytecode)**

- An unannotated record argument is a model attribute bound through its canonical constructor; a
  conversion failure is recorded as a binding-failure field error and raised as
  `MethodArgumentNotValidException`.
- An absent value for a primitive component is a conversion failure (hence the `Boolean`).
- A constructor exception is rethrown as `BeanInstantiationException` (hence no validation in the
  constructor).
- Model attributes can also be bound from URI variables and request headers; Spring filters eleven
  standard headers by default, including `From`; the three paths have no URI variables.

**API contract**

- Unchanged: parameter names, types, formats, optionality and defaults of `GET /api/transactions`,
  `/summary`, `/category-totals` and `/category-counts`; every status, slug and detail sentence; the
  409 → 400 → 404 precedence; parse errors still answered before the active-profile check.
- One observable difference, documented: a list request that breaks a paging rule and a filter rule
  at once reports the paging sentence (today the date-range and `includeDescendants` sentences win
  over paging, and paging wins over the search-term sentence). Status and slug are the same either
  way.
- `Pageable` is not used: Spring Data clamps an out-of-range size or page instead of rejecting it and
  adds a `sort` parameter, which would contradict the documented 400s and the fixed order.
- Bean Validation is not used on the filter: with validation enabled its failures would answer
  `/errors/validation-failed` with an `errors` list in a nondeterministic order; without it, the
  annotations would be decoration.

**Documents updated in the same change** (details in docs-proposals) — `docs/API.md`: a new "Query
parameter problems — 400" paragraph under "Errors"; the list's 400 row names the slug and every
cause; the aggregates' 400 rows name the slug; a sentence saying the six filters mean and validate the
same on the list, `summary` and `category-totals`, with paging on the list only; the status-code
summary distinguishes `validation-failed` (body) from `invalid-request` (malformed body or bad query
parameter). No change to `ARCHITECTURE.md` or `docs/SCHEMA.md`.

**Lesson** — one `docs/LESSONS.md` entry: binding query parameters to a record (constructor binding;
the primitive trap, same as the existing Jackson entry but in Spring's binder; the constructor must not
throw; `@ParameterObject` is documentation only; binding failures arrive as
`MethodArgumentNotValidException` with `isBindingFailure()`; headers can bind too).

**Ordered steps** (each leaves `./mvnw verify` green)

1. **Characterisation tests** (see Testing Decisions) — green on today's code; no production change.
2. **Separate paging and give validation one home.** The filter loses paging and the fake-paging
   constructor; the service's list takes page and size; the rules move into the specification
   builder; `categoryCounts` takes `q`. The controller still declares request parameters and calls
   the new service signatures. No wire change.
3. **Bind once.** The filter moves to `dto` with the `Boolean` component and its schema default; the
   three endpoints take it as a `@ParameterObject` argument; the handler gains the binding-failure
   branch with its unit test (the type-mismatch characterisation tests on the bound endpoints fail
   without it — that is the red). Capture `/v3/api-docs` before and after and diff the four
   operations.
4. **Documents and lesson** (may travel with step 3).

## Testing Decisions

**What makes a good test here.** A test sends a real query string and asserts what a client receives:
status, content type, `type` slug, `detail` sentence, and the rows or totals returned. It does not
assert how the controller receives its arguments, which service method validates, or what the
specification looks like.

**Seam chosen, and why.** The HTTP interface through MockMvc, in the existing integration test classes
for transactions and their aggregates (real Postgres via Testcontainers). The change is entirely about
how the HTTP interface binds and reports, and those classes already exercise every parameter, status
and precedence case, so one seam covers it. The only addition at another seam is a unit test of the
exception handler's new branch, following the existing handler test that builds a
`MethodArgumentNotValidException` by hand — the rendering of a binding failure is a pure function and
worth pinning without a database.

**Tests added first (characterisation — green before and after)**

- The exact `detail` for each list rule: from after to; `includeDescendants` without `categoryId`;
  page −1; size 0 and size 201; a 101-character search term.
- A type mismatch on every typed filter parameter (`from`, `to`, `categoryId`, `includeDescendants`,
  `type`) on each of `list`, `summary` and `category-totals`: 400, `application/problem+json`,
  `/errors/invalid-request`, "Query parameter '<name>' has an invalid value." (today only `from` and
  `type` on the list are pinned, and only `from`'s sentence).
- `category-counts` with a 101-character `q`: 400 `/errors/invalid-request`, "'q' must be at most 100
  characters." (documented, untested today).
- `category-counts` with `from` set far in the future still counts every transaction (the documented
  restriction).
- `includeDescendants=` and `from=` (empty values) behave as absent.

**Test added with step 3** — handler unit test: a `MethodArgumentNotValidException` whose binding
result holds a binding-failure field error for `from` answers 400 `/errors/invalid-request` with the
query-parameter sentence and no `errors` property; the existing test that a body validation failure
lists every field error stays as the counterpart.

**Existing tests** — all 53 methods in the two transaction controller test classes survive unchanged;
they are the regression net for statuses, slugs, precedence and results (including every request that
omits `includeDescendants`, which guards the primitive trap). None is deleted.

**Prior art** — `TransactionControllerTest` (list, paging, filters, precedence),
`TransactionAggregateControllerTest` (aggregates over more than one page, 404 and 409 cases),
`GlobalExceptionHandlerTest.validationFailureListsEveryFieldError` (hand-built
`MethodArgumentNotValidException`).

**OpenAPI verification** — diff `/v3/api-docs` for the four operations before step 3 and after it;
parameter order is not significant; any other difference blocks the step. If candidate 15's schema
check exists by then, it performs this diff.

## Out of Scope

- Spring Data `Pageable`, sorting parameters, or any change to the fixed `occurredOn DESC, id DESC` order.
- Bean Validation annotations on the filter, and schema-only limits such as `maxLength` on `q` or `minimum`/`maximum` on `size` (candidate 15 may add them with schema annotations, never with validation annotations).
- Giving `category-counts` the full filter (the API document says it takes only `q`).
- Switching off Spring's header and URI-variable binding for the filter.
- The query parameters of budgets, subscriptions and the subscription dashboard.
- The frontend's three transaction hooks, which spell out the six parameters each, and its hand-written transaction query type.
- Pseudo-fields and value rules of request bodies (candidate 4).
- Changes to the active-profile resolution in the service (candidate 1) or to response mapping (candidate 14).

## Further Notes

**Facts that could not be verified in this read-only pass**

1. The current `/v3/api-docs` content — no snapshot is committed, and the generated TypeScript omits
   formats and defaults. The before/after description is derived from springdoc 3.1.1 bytecode; the
   implementer confirms it by diffing.
2. That springdoc honours a schema default declared on a flattened record component. Fallback: declare
   it through a parameter annotation on the component.
3. That empty values (`from=`, `includeDescendants=`) behave identically in both binding paths —
   expected from Spring's formatters, and locked by the characterisation tests before anything moves.
4. That model-attribute binding uses the same MVC conversion service (and so the ISO date setting) as
   request parameters — standard Spring behaviour, proven after the change by the existing date tests.

**What siblings must assume**

- *G7 (candidate 15, OpenAPI):* after this change the parameters of `list`, `summary` and
  `categoryTotals` come from the `TransactionFilter` record through `@ParameterObject`, with
  `includeDescendants` defaulting to false; operation ids are unchanged; `page`/`size` and
  `category-counts` are untouched. Document limits with schema or parameter annotation attributes,
  never with Bean Validation annotations on the filter (inert without `@Valid`, a new 400 shape with
  it). If the schema check lands first, it verifies step 3's zero diff for free.
- *G3 (candidate 2, problem messages):* no wire change. A query-parameter problem is
  `/errors/invalid-request` with a single English `detail` and no `errors` list; there is nothing to
  map to form fields.
- *G1 (candidate 1) and G7 (candidate 14):* both edit `TransactionService` (active-profile calls and
  response mapping); land in any order and rebase.
- *G2 (candidate 4):* both edit the API document's "Errors" section; this candidate adds the
  query-parameter paragraph, candidate 4 owns the pseudo-field paragraph.

**Sequencing** — no prerequisite; any order relative to siblings. Ideally after candidate 15's schema
check exists.

**Residual risk** — a proxy that adds a header whose name matches a filter component (`Type`, `Q`,
`To`, `CategoryId`, `IncludeDescendants`) would bind it when the query parameter is absent; `From` and
the other standard headers are filtered by Spring. No such header is added by the SPA, the Vite proxy
or nginx today.

**Lesson to write** — binding query parameters to a record, as described under Implementation
Decisions; reference the existing lesson "Jackson 3 rejects a missing `boolean` record field by
default" for the parallel trap.
