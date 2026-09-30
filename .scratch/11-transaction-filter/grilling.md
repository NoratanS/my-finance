# Grilling log — Candidate 11: Bind the Transaction filter once

Group G2 · repository `my-finance`, branch `dev` (HEAD `c3e20c5`, a `-s ours` merge whose tree is
identical to the pinned `4545810`; `git diff --stat 4545810 c3e20c5` is empty). Every `file:line`
below is from that tree. Paths are relative to `backend/src/main/java/com/myfinance/backend/` unless
they start with another root.

Library facts were read from the jars the build resolves in `~/.m2` (no source jars; bytecode via
`javap -c`, resources via `unzip -p`; nothing built or run): Spring Framework 7.0.8
(`spring-web`, `spring-webmvc`, `spring-context`, `spring-beans`, `spring-core`; version from
`spring-boot-dependencies-4.1.0.pom`), springdoc-openapi 3.1.1 (`backend/pom.xml:55`) with
swagger-core-jakarta 2.2.55 (`springdoc-openapi-3.1.1.pom:62`), spring-data-commons 4.1.0.

## The design tree

```
Constraints (documented contract, pinned tests, precedence)            ← round 1
 ├─ How Spring MVC binds a record from the query string                ← round 1
 │    ├─ Type mismatch during binding                                  ← round 1
 │    ├─ Absent value for a primitive component                        ← round 1
 │    ├─ Exception thrown by the record's constructor                  ← round 1
 │    └─ Headers and URI variables bound into the object               ← round 1
 ├─ How springdoc documents a record argument                          ← round 1
 └─ Dependencies by category                                           ← round 1
      └─ Binding mechanism (one object per endpoint)                   ← round 2
           ├─ Component types and defaults (includeDescendants)        ← round 2
           ├─ Bean Validation or explicit rules                        ← round 2
           │    └─ Where the rules run                                 ← round 2
           ├─ Handler change for binding failures                      ← round 2
           ├─ Paging separated from filtering                          ← round 2
           ├─ category-counts: full filter or q only                   ← round 2
           └─ Where TransactionFilter and the spec builder live        ← round 2
                ├─ Precedence and multi-violation detail               ← round 3
                ├─ OpenAPI before/after                                ← round 3
                └─ Edge cases                                          ← round 3
                     ├─ Test seam, tests that notice, tests to add     ← round 4
                     └─ Seam discipline                                ← round 4
                          ├─ Order of steps                            ← round 5
                          ├─ Docs                                      ← round 5
                          ├─ Cross-candidate effects                   ← round 5
                          └─ LESSONS entry                             ← round 5
```

---

## Round 1 — constraints and library behaviour

❓ **Q1** - **What must not change on the wire?** Options: (a) statuses only; (b) statuses and slugs;
(c) statuses, slugs, the `detail` texts, the absence of an `errors` member on query problems, the
precedence between 400/404/409, and the OpenAPI parameters of the four operations.

🔎 Facts:
- `docs/API.md:817` (list), `:858` (summary), `:885` (category-counts), `:905` (category-totals
  "Statuses as `summary`") list the 400 causes but **not** their slug; `docs/API.md:1525` says 400 is
  "Malformed body, failed Bean Validation, or bad query parameter". The slug is pinned only by tests.
- Pinned by tests: `TransactionControllerTest.java:415-423` (from after to → `/errors/invalid-request`),
  `:425-432` (malformed `from` → `/errors/invalid-request`, `application/problem+json`, detail
  exactly "Query parameter 'from' has an invalid value."), `:434-446` (size 201 → invalid-request;
  size 0 and page −1 → 400; size 200 → 200), `:448-455` (includeDescendants without categoryId →
  invalid-request), `:536-538` (`type=REFUND` → invalid-request), `:604-609` (q of 101 chars →
  invalid-request), `:457-468` (foreign category → 404 not-found), `:240-256` (GET list without an
  active profile → 409); `TransactionAggregateControllerTest.java:141-154` (summary: from after to →
  invalid-request; includeDescendants alone → 400), `:170-177`, `:261-267` (foreign category → 404),
  `:271-278` (all three aggregates → 409 without an active profile).
- The rule texts come from `service/TransactionService.java:239-255`: "'from' must not be after
  'to'.", "'includeDescendants' requires 'categoryId'.", "'page' must be 0 or greater.", "'size' must
  be between 1 and 200.", "'q' must be at most 100 characters." — only the type-mismatch text is
  asserted anywhere. `API.md:168-169` says `detail` "may change without notice"; the assignment says a
  changed message must not be silent.
- Precedence today: argument resolution (type mismatches) precedes the service; each service method
  starts with `activeProfile.requireId()` (409) before `validate` (400) (`TransactionService.java:94-95,
  108-109, 133-134, 146-147`); the foreign-category 404 comes from `filterSpec` after validation
  (`:171-172`).
- The UI caps the search input at 100 characters (`frontend/src/screens/Transactions.tsx:174`) and
  does not display list-query error details; the texts are still reachable by any client.

➡️ (c).

⚖️ Strongest argument against: the API document explicitly lets `detail` change; holding the texts
fixed forbids nothing useful, but it does force the design to keep the explicit rule code.

✅ Decision: (c). Every change to a detail text or to precedence is named in the spec (Q17).

---

❓ **Q2** - **How does Spring MVC 7.0.8 bind a record argument from query parameters?** Options:
(a) an unannotated non-simple argument is a model attribute, bound by constructor binding from
request parameters by name; (b) it needs `@ModelAttribute`; (c) records need setters.

🔎 Facts:
- `ModelAttributeMethodProcessor.resolveArgument` (`spring-web`, offsets 178-294): when no model
  attribute exists yet it creates a binder for the parameter's `ResolvableType`, calls
  `constructAttribute`, and, if the binding result has no errors, `bindRequestParameters`, then
  `validateIfApplicable`; if the binding result has errors and the parameter is not followed by an
  `Errors` argument, it throws `new MethodArgumentNotValidException(parameter, bindingResult)`.
- `DataBinder.createObject` (`spring-context`): resolves the constructor with
  `BeanUtils.getResolvableConstructor`; for each parameter resolves the name (`NameResolver`, so
  `@BindParam` could rename), the value (`ValueResolver`), and converts it with
  `convertIfNecessary(value, paramType, methodParameter)`.
- `BeanUtils.findPrimaryConstructor` (`spring-beans`): for a record (`Class.isRecord()`) returns the
  canonical constructor built from `getRecordComponents()` — so extra constructors do not confuse
  binding.
- The same conversion service as for `@RequestParam` applies: `application.properties:34-35`
  (`spring.mvc.format.date=iso`). (That model attributes use the MVC conversion service is standard
  Spring behaviour; the existing date tests will prove it after the change.)

➡️ (a).

⚖️ Strongest argument against: implicit binding is invisible to a newcomer — nothing in the signature
says "bind query parameters here".

✅ Decision: (a), made visible by the springdoc annotation and the record's Javadoc (Q9).

---

❓ **Q3** - **What happens on a type mismatch while binding the record, and how would today's
handler render it?**

🔎 Facts:
- `DataBinder.createObject`: a `TypeMismatchException` from `convertIfNecessary` (exception-table
  range 351–417) sets the argument to null, records the parameter as failed and calls
  `handleTypeMismatchException`, which calls `BindingErrorProcessor.processPropertyAccessException`.
  If the binding result then has errors, the constructor is **not** invoked (offsets 456-552 record
  field values instead).
- `DefaultBindingErrorProcessor.processPropertyAccessException` creates a `BindingFieldError` whose
  constructor passes `bindingFailure = true` (`iconst_1`) and the exception's localised message as
  default message ("Failed to convert property value of type 'java.lang.String' to required type
  ...").
- Resulting exception: `MethodArgumentNotValidException` (Q2) → `GlobalExceptionHandler.handleMethodArgumentNotValid`
  (`exception/GlobalExceptionHandler.java:74-87`) → today that would answer `/errors/validation-failed`
  with `errors[{field: "from", message: "Failed to convert ..."}]` — a different slug, a new member, and
  framework internals in the message (the handler's own comment at `:89` says such texts must not
  leak).
- Today the same mistake raises `MethodArgumentTypeMismatchException` and is rendered by
  `handleTypeMismatch` (`:102-113`): invalid-request, "Query parameter '<name>' has an invalid value."

➡️ Binding the record makes the handler change unavoidable: a binding failure on a model attribute
must render exactly like `handleTypeMismatch`.

⚖️ Strongest argument against: this is the cost the card warned about ("The error shapes for bad
parameters are fixed ... which constrains how the binding is done"); keeping `@RequestParam` avoids
it entirely.

✅ Decision: the handler gains a binding-failure branch (Q13). Unblocks Q9.

---

❓ **Q4** - **What happens when a query parameter is absent and the record component is a primitive
(`boolean includeDescendants`)?**

🔎 Facts:
- `DataBinder.createObject` offsets 351-413: for a `null` value, if the parameter is `Optional` or the
  binding result already has errors, the argument is `null`/`Optional.empty()`; **otherwise it still
  calls `convertIfNecessary(null, paramType, param)`**.
- `TypeConverterDelegate.convertIfNecessary` (`spring-beans`): `null` is not assignable to `boolean`,
  so it asks the conversion service; `GenericConversionService.handleResult` →
  `assertNotPrimitiveTargetType` throws `ConversionFailedException(..., new IllegalArgumentException("A
  null value cannot be assigned to a primitive type"))`.
- `TypeConverterSupport.convertIfNecessary` maps `ConversionException` / `IllegalArgumentException` to
  `TypeMismatchException` (exception table), which `DataBinder` records as a binding failure (Q3).
- Consequence: with a primitive component, `GET /api/transactions` without `includeDescendants`
  would answer 400. The same trap exists for Jackson records (`docs/LESSONS.md:502`, "Jackson 3
  rejects a missing `boolean` record field by default").

➡️ The component must be a `Boolean` normalised to `false` when absent.

⚖️ Strongest argument against: a wrapper where a primitive is meant invites `null` into the service.

✅ Decision: `Boolean includeDescendants`, normalised to `false` in the record's compact
constructor, so the accessor never returns `null`. Existing tests with no filter parameters
(`TransactionControllerTest.java:334-354`, `TransactionAggregateControllerTest.java:81-97, 271-278`)
guard the trap.

---

❓ **Q5** - **Can the record validate itself in its compact constructor (throwing
`InvalidRequestException`)?**

🔎 Facts: `DataBinder.createObject` offsets 581-677: `BeanUtils.instantiateClass` wraps a
constructor exception in `BeanInstantiationException`; the binder catches it and, unless the class is
a Kotlin type and the cause a `NullPointerException`, **rethrows it**. `GlobalExceptionHandler` has
no handler for `BeanInstantiationException`, so it would reach `handleUnexpected` (`:66-72`) → 500
`/errors/internal`.

➡️ No. The compact constructor may only normalise values; it must never throw.

⚖️ Strongest argument against: "an invalid filter cannot exist" is the deepest possible module, and
unwrapping `BeanInstantiationException` in the handler would buy it.

✅ Decision: no validation in the constructor; unwrapping would be the clever, atypical route
`CLAUDE.md` asks to avoid. The record's Javadoc says why.

---

❓ **Q6** - **Can anything other than the query string feed the record?**

🔎 Facts: `org.springframework.web.servlet.support.ExtendedServletRequestDataBinder` (7.0.8) binds
URI template variables and request headers into model attributes (`createValueResolver`,
`addBindValues`, `getHeaderValue`, `normalizeHeaderName` removes "-"), with a default filter
`FILTERED_HEADER_NAMES` = accept, authorization, connection, cookie, **from**, host, origin,
priority, range, referer, upgrade. A query parameter is resolved first; a header is used only when
the parameter is absent. The three paths have no URI variables.

➡️ Accept it: the standard `From` header is filtered; no standard header matches `to`,
`categoryId`, `includeDescendants`, `type` or `q`, and the SPA, the Vite proxy and nginx add none.

⚖️ Strongest argument against: a proxy that adds a header named `Type` or `Q` would silently filter
or break the list; switching header binding off needs a binder customisation per argument.

✅ Decision: no code; recorded as an edge case (spec Further Notes, LESSONS entry).

---

❓ **Q7** - **How does springdoc 3.1.1 document a record argument?** Options: (a) without an
annotation, as one query parameter named `filter` of object type; (b) with `@ParameterObject` on the
parameter (or on the record type), flattened into one query parameter per component; (c) flattened
everywhere via `springdoc.default-flat-param-object`.

🔎 Facts:
- `DelegatingMethodParameter.customize` (`springdoc-openapi-starter-common-3.1.1`): a non-simple
  parameter is flattened into its fields when it has `@ParameterObject`, when its class is annotated
  with `@ParameterObject` (`AnnotatedElementUtils.isAnnotated`), or when `defaultFlatParamObject` is
  on and the parameter carries no Spring binding annotation. `@ParameterObject` targets `PARAMETER`
  and `TYPE`. `SpringDocConfigProperties.defaultFlatParamObject` exists, default off.
- `MethodParameterPojoExtractor` reads record components (`getRecordComponents`), naming each
  parameter by `@Parameter`/`@Schema` name or the field name.
- Required-ness of a flattened field: `SchemaUtils.fieldRequired` — `@Schema`/`@Parameter` required,
  else `Optional` → not required, `@Nullable` → not required, `@NotNull` (field, getter or constructor
  parameter) → required, `@JsonProperty(required = true)` → required, else not required.
- Defaults today: springdoc copies `@RequestParam.defaultValue` into the parameter
  (`ParameterInfo.calculateParams`) and onto the schema (`AbstractRequestService`, `setDefault` after
  `castDefaultValue`); it also reads `@Schema.defaultValue()` (`GenericParameterService`).
- Before: `frontend/src/api/schema.d.ts:1313-1335` (list: `from?, to?, categoryId?,
  includeDescendants?, type?, q?, page?, size?`), `:1806-1820` (summary), `:1853-1866`
  (categoryTotals), `:1880-1886` (categoryCounts: `q?`). The TypeScript drops formats and defaults.

➡️ (b), on the controller parameter.

⚖️ Strongest argument against: (c) is one line of configuration instead of three annotations; putting
the annotation on the record type would keep the controller signatures bare.

✅ Decision: `@ParameterObject` on each controller parameter — explicit at the binding site, keeps the
springdoc dependency out of `dto`, and has no global effect. Unblocks Q18.

---

❓ **Q8** - **Dependencies by category.**

🔎 Facts: binding, validation, the handler and specification building are in-process; the
specifications run against Postgres (`TransactionSpecifications`, `TransactionAggregatesImpl`), which
the controller tests provide through Testcontainers (`src/test/.../support/IntegrationTest.java`).

➡️ In-process change; the existing MockMvc tests are local-substitutable (Testcontainers). No port,
no adapter, no mock.

✅ Decision: as stated.

---

## Round 2 — the shape of the change

❓ **Q9** - **How is the filter bound once per endpoint?** Options: (a) keep 3 × 6 `@RequestParam`;
(b) a record argument, implicit model attribute, documented with `@ParameterObject`; (c) the same with
an explicit `@ModelAttribute`; (d) a custom `HandlerMethodArgumentResolver`.

🔎 Facts: Q2–Q7. `TransactionController.java:51-95` holds 21 `@RequestParam`: the six filter
parameters are spelled out at `:52-58` (plus `page`/`size` `:59-60`), `:70-76` and `:86-92`;
`category-counts` takes only `q` (`:80-83`). Adding the search filter touched four source files and
two test classes (`git show --stat 8ace3fb`).

➡️ (b): `TransactionFilter` as the argument of `list`, `summary` and `categoryTotals`, annotated
`@ParameterObject`.

⚖️ Strongest argument against: (c) makes the binding explicit for a learner at the cost of a second
annotation; (d) would make the binding fully explicit and testable but is a custom resolver for a
problem Spring already solves.

✅ Decision: (b). The record's Javadoc states that Spring binds query parameters to its components by
name, so its component names are the wire names.

---

❓ **Q10** - **What are the record's components and defaults?**

🔎 Facts: Q4 (primitive trap); today's defaults: `includeDescendants` false
(`TransactionController.java:56`); the schema's `default: false` comes from `@RequestParam.defaultValue`
(Q7). Record accessors are not JavaBeans getters, so property binding after construction is a no-op
(unknown properties are ignored by default).

➡️ `from` and `to` (`LocalDate`), `categoryId` (`Long`), `includeDescendants` (`Boolean`, normalised
to `false`), `type` (`TransactionType`), `q` (`String`) — in that order; no `page`/`size`. The
`includeDescendants` component also carries `@Schema(defaultValue = "false")` so the OpenAPI document
keeps its default.

⚖️ Strongest argument against: the default is then stated twice, in the constructor and in the schema
annotation, side by side.

✅ Decision: as above; both statements sit on the same component and the Javadoc ties them together.
Whether springdoc honours `@Schema(defaultValue)` on a flattened record component is not verified;
fallback: `@Parameter(schema = @Schema(defaultValue = "false"))` on the component.

---

❓ **Q11** - **Bean Validation on the bound object, or explicit rules?**

🔎 Facts:
- With `@Valid` on the argument, violations land in the same `MethodArgumentNotValidException` →
  `/errors/validation-failed` with `errors[]` whose `field` would be record components or `@AssertTrue`
  pseudo-fields (`rangeValid`, ...) — a new shape for a contract that answers `/errors/invalid-request`
  with a single `detail` (Q1).
- Hibernate Validator returns violations as a set, so which rule a multi-violation request reports
  would become nondeterministic; today the order is fixed (`TransactionService.java:240-254`).
- Without `@Valid`, Bean Validation annotations on the record are never evaluated — they would only
  appear in the OpenAPI document (swagger-core maps `@Size` to `maxLength`), i.e. they would look
  enforced and not be.
- Spring Data's `Pageable` is not an alternative for validation either (Q14).

➡️ Explicit rules, with today's texts, in a fixed order; no Bean Validation annotation on the filter.

⚖️ Strongest argument against: Bean Validation on a bound object is the textbook Spring shape, and
the handler could translate its violations into `invalid-request`.

✅ Decision: explicit rules. Translating would need a second rendering path and would still lose the
fixed order.

---

❓ **Q12** - **Where do the filter rules run?** Options: (a) as today, a private `validate(filter)`
that each of the four service methods must call; (b) a method on the record that callers must call;
(c) inside the one place a filter becomes a `Specification` (`filterSpec`), so no caller can obtain a
specification from an unvalidated filter.

🔎 Facts: `validate` and `filterSpec` are each called from the same four methods
(`TransactionService.java:95-97, 109-112, 134-136, 147-149`). `filterSpec` already owns the mandatory
profile predicate and the category lookup that answers 404 for another profile's category (`:154-182`),
so the list and its totals share it — "That part is already right" (evidence pack). `InvalidRequestException`
is a service-layer exception (`exception/InvalidRequestException.java:5-13`; also thrown by
`SubscriptionService.java:145` for `horizonDays`).

➡️ (c): the specification builder validates the filter first, then scopes and resolves the category;
the separate `validate` calls disappear.

⚖️ Strongest argument against: (b) puts the filter's invariants next to its fields, which reads more
naturally than a service method named after specifications.

✅ Decision: (c). It turns "remember to validate" into "cannot forget", keeps the 409 → 400 → 404
precedence of today (validation still runs after `requireId`, before the category lookup), and keeps
`InvalidRequestException` in the service layer like `horizonDays`. The builder's Javadoc says it
validates.

---

❓ **Q13** - **Exactly what changes in `GlobalExceptionHandler`?**

🔎 Facts: Q3. Binding failures carry `FieldError.isBindingFailure() == true`; Bean Validation
violations on a `@RequestBody` never do (body parse errors are `HttpMessageNotReadableException`,
`:91-100`). The existing unit test builds a `MethodArgumentNotValidException` by hand
(`src/test/.../exception/GlobalExceptionHandlerTest.java:62-88`).

➡️ In `handleMethodArgumentNotValid`: if the binding result holds a field error that is a binding
failure, answer 400 `/errors/invalid-request`, title "Invalid request", detail "Query parameter
'<field>' has an invalid value." for the **first** such error, with no `errors` member; otherwise
behave exactly as today. `handleTypeMismatch` and the new branch build the problem through one shared
private helper so the text cannot fork.

⚖️ Strongest argument against: the branch assumes every model attribute in this API is bound from the
query string; a future form-data model attribute would get "Query parameter ..." wording.

✅ Decision: as above; the assumption is written in the handler's Javadoc and in `API.md`. "First" is
constructor-parameter order (`from`, `to`, `categoryId`, `includeDescendants`, `type`, `q`), the same
order in which today's `@RequestParam`s are resolved, so a request with two malformed parameters
still names `from` first.

---

❓ **Q14** - **How is paging separated from filtering?** Options: (a) a second record (`page`,
`size`); (b) Spring Data's `Pageable` argument; (c) two plain `@RequestParam`s on `list` only.

🔎 Facts:
- `spring-data-commons` 4.1.0 `PageableHandlerMethodArgumentResolverSupport`: the page size is capped
  with `Math.min(pageSize, maxPageSize)` and page values pass through `parseAndApplyBoundaries` — out
  of range values are **clamped**, not rejected; unparseable values fall back to defaults. That
  contradicts `API.md:817` ("size over max" → 400) and `TransactionControllerTest.java:434-446`, and
  `Pageable` also brings a `sort` parameter while the API fixes the order
  (`TransactionService.java:50`, `API.md:793-795`).
- `list` is the only paged endpoint in the API (budgets, subscriptions, insights are bare arrays).
- `MAX_PAGE_SIZE` (200) is used only by `validate` and named in a test comment
  (`TransactionAggregateControllerTest.java:38`).
- A malformed `page`/`size` stays a `MethodArgumentTypeMismatchException` → `handleTypeMismatch`,
  unchanged.

➡️ (c): `page` and `size` stay `@RequestParam` with defaults 0 and 50 on `list`; `TransactionService.list`
takes them as two arguments and checks them with today's texts before building the specification.

⚖️ Strongest argument against: (a) would make paging reusable and symmetric with the filter.

✅ Decision: (c) — a record for two parameters used by one endpoint is an abstraction for single-use
code. The aggregates stop carrying fake paging (`TransactionFilter.java:23-31` goes).

---

❓ **Q15** - **Does `category-counts` take the full filter or stay restricted to `q`?**

🔎 Facts: `API.md:864-866`: "`q` ... is the only filter it accepts; every other parameter is
deliberately absent — it otherwise feeds the category tree, which wants the whole picture."
`TransactionController.java:80-83` builds a filter with five fixed values; the service's Javadoc says
the controller fixes them (`TransactionService.java:126-131`). The frontend sends only `q`
(`frontend/src/api/hooks/transactions.ts:71-78`). No test pins that other parameters are ignored, and
none pins `q` over 100 on this endpoint although `API.md:885` documents it.

➡️ Restricted: the controller keeps one `@RequestParam q`; the service method becomes
`categoryCounts(String q)` and builds the search-only filter itself, so `q`'s rule is checked by the
same code path as everywhere else.

⚖️ Strongest argument against: binding the full filter would be simpler to explain ("every
transaction read takes the filter") and harmless for today's client.

✅ Decision: restricted; the document decides. The restriction moves from a controller convention to
the service method's signature.

---

❓ **Q16** - **Where do `TransactionFilter` and the specification builder live?**

🔎 Facts: `ArchitectureTest.java:25-39`: Repository may be accessed only by Service and Repository;
Service only by Controller and Service; `dto` and `model` are not layers. `TransactionFilter` is in
`service` today and called "Internal parameter object assembled by the controller"
(`TransactionFilter.java:7-12`). The builder needs `CategoryRepository` (subtree ids) and the 404
semantics (`TransactionService.java:171-177, 263-267`). Every other controller-bound shape lives in
`dto`.

➡️ `TransactionFilter` moves to `dto` (it becomes the bound request shape of the query string); the
builder stays private in `TransactionService`. No repository depends on the filter (it would be a
repository → service dependency if the filter stayed in `service`, forbidden by the layer rule).

⚖️ Strongest argument against: moving a file is churn in a "surgical" change; the layer rule is
satisfied either way.

✅ Decision: move to `dto` (three importers change); builder unchanged in place.

---

## Round 3 — observable behaviour in detail

❓ **Q17** - **What changes in precedence and in the reported detail?**

🔎 Facts: Q1 for today. After the change: type mismatches still precede the service (binding) → same;
`list`: `requireId` (409) → paging (400) → filter rules (400) → category (404); aggregates:
`requireId` → filter rules → category; `category-counts`: `requireId` → `q` rule. Today's order inside
`validate`: from/to → includeDescendants → page → size → q.

➡️ Every status and slug keeps its precedence. The one observable difference: a list request that
breaks a paging rule **and** a filter rule at the same time now reports the paging text (today the
from/to and includeDescendants texts win over paging, and paging wins over `q`).

⚖️ Strongest argument against: reproducing today's order exactly would need paging checks between
the filter's rules, which re-couples what the candidate separates.

✅ Decision: accept and document it (`API.md` says only the first problem is reported, without
promising an order).

---

❓ **Q18** - **What does the OpenAPI document show before and after?**

🔎 Facts: Q7; no `/v3/api-docs` snapshot is committed (only the generated TypeScript, which omits
formats and defaults).

➡️ Before (derived from springdoc's behaviour and `schema.d.ts`): `list` — query parameters `from`,
`to` (string, date), `categoryId` (integer, int64), `includeDescendants` (boolean, default false),
`type` (string enum EXPENSE/INCOME), `q` (string), `page` (integer, int32, default 0), `size`
(integer, int32, default 50), all optional; `summary` and `categoryTotals` — the first six;
`categoryCounts` — `q`. After: identical names, types, formats, optionality and defaults (the
`includeDescendants` default from Q10); operation ids unchanged (method names unchanged).

⚖️ Strongest argument against: "identical" is a prediction; springdoc might order flattened parameters
differently or drop the default.

✅ Decision: the implementer captures `/v3/api-docs` before and after and diffs the four operations;
parameter order is not significant; any other difference blocks the step. Note for G7.

---

❓ **Q19** - **Edge cases.**

➡️ Scenarios and expected behaviour (all identical to today unless stated):
- No filter parameters → 200 on all three bound endpoints (the primitive trap, Q4).
- `includeDescendants=` (empty) → expected to behave as absent (false) both today and after
  (today through the `@RequestParam` default, after through the converter yielding `null`, which the
  record normalises). Known from Spring's documented behaviour, **not verified in bytecode** this
  session; the characterisation test pins today's result before anything moves.
- `from=` (empty) → expected to mean "no lower bound" in both paths (Spring's date formatter returns
  `null` for empty text); **not verified in bytecode**; pinned by the same characterisation test.
- `from=not-a-date`, `to=x`, `categoryId=abc`, `includeDescendants=maybe`, `type=REFUND` → 400
  invalid-request "Query parameter '<name>' has an invalid value." on all three bound endpoints
  (today pinned only for `from` and `type` on the list).
- Two malformed parameters → the first in component order is named (Q13).
- `q` of 101 spaces → 400 (length is checked before blankness, as today).
- Unknown parameters, and `page`/`size` sent to an aggregate → ignored, as today.
- Other filters sent to `category-counts` → ignored, as today; locked by a new test.
- A header named after a component, with the query parameter absent → binds (Q6); `From` filtered.
- No active profile and a malformed parameter → 400 (binding precedes the service), as today.
- No active profile and a broken filter rule → 409, as today.

✅ Decision: covered by the design; the new tests lock the ones not pinned today.

---

## Round 4 — tests

❓ **Q20** - **At which seam is this tested?** Options: (a) the HTTP interface through MockMvc (the
existing `@IntegrationTest` classes); (b) the service directly; (c) the record and the handler as
units.

🔎 Facts: the whole change is about how the HTTP interface binds and reports; the controller tests
already exercise every parameter and status (Q1). `GlobalExceptionHandlerTest` shows the handler can
be tested as a plain object (`:62-88`).

➡️ (a) as the one seam for behaviour — the existing classes plus new characterisation cases — and one
unit test for the new handler branch, because a binding failure's rendering is a pure function worth
pinning without a database.

⚖️ Strongest argument against: two seams; the handler branch is already exercised through MockMvc.

✅ Decision: MockMvc for behaviour; one handler unit test following the existing prior art.

---

❓ **Q21** - **Which existing tests notice a changed message or status; which survive; which are
added; which are deleted?**

🔎 Facts: `TransactionControllerTest` has 40 `@Test` methods and one `@ParameterizedTest` with four
cases (the evidence pack's "40 tests"); `TransactionAggregateControllerTest` has 13.

➡️
- Notice a status or slug change: `fromAfterToIs400`, `malformedDateIs400` (also the only detail
  assertion), `invalidPagingParamsAre400`, `includeDescendantsWithoutCategoryIdIs400`,
  `categoryFilterFromAnotherProfileIs404`, `typeFilterAndCombinedFilters`, `searchOver100CharactersIs400`,
  `withoutActiveProfileIs409` ("GET list"), `summaryRejectsTheSameBadFiltersAsTheList`, both
  aggregate 404 tests, `everyAggregateIs409WithoutAnActiveProfile`. Every 200 test without
  `includeDescendants` would notice the primitive trap.
- Survive unchanged: all 53 methods.
- Add first (characterisation, green on today's code): exact `detail` for each of the five rules on
  the list; type mismatch on every typed filter parameter on each of `list`, `summary` and
  `category-totals`; `q` over 100 on `category-counts`; `category-counts` ignoring `from`;
  `includeDescendants=` and `from=` behaving as absent.
- Add with the binding step: the handler unit test for a binding failure.
- Delete: none.

⚖️ Strongest argument against: pinning the rule texts makes a harmless wording improvement cost a
test edit.

✅ Decision: as above; the texts are user-reachable and the assignment forbids silent message
changes.

---

❓ **Q22** - **Does the design introduce a seam?**

➡️ No. `TransactionFilter` is a value, the builder is private, the handler branch is a conditional.
Nothing varies behind an interface.

✅ Decision: no seam.

---

## Round 5 — sequence, docs, siblings

❓ **Q23** - **Order of steps.**

➡️
1. Characterisation tests (Q21) — green on today's code; no production change.
2. Separate paging and give validation one home: `TransactionFilter` loses `page`/`size` and the
   fake-paging constructor; `TransactionService.list(filter, page, size)` checks paging, then builds
   the specification, which validates the filter; `categoryCounts(String q)`; the controller still
   uses `@RequestParam` and calls the new signatures. Green, no wire change.
3. Bind once: `TransactionFilter` moves to `dto` with `Boolean includeDescendants` and its default;
   `list`, `summary`, `categoryTotals` take `@ParameterObject TransactionFilter`; the handler gains
   the binding-failure branch (the characterisation tests for type mismatches go red without it —
   the TDD red), plus its unit test. Diff `/v3/api-docs`. Green.
4. Docs (can travel with step 3) and the lessons entry.

⚖️ Strongest argument against: steps 2 and 3 could be one commit.

✅ Decision: keep them apart — step 2 is a pure internal refactor, step 3 changes the binding
mechanism and is the one to revert if something surprises.

---

❓ **Q24** - **Which recorded-decision documents change?**

🔎 Facts: `API.md:817,858,885,905,1525` (status rows), `:171-196` (Errors), `:836-839` and
`:864-866` (aggregate parameters). `ARCHITECTURE.md` says nothing about query binding.

➡️ `docs/API.md` only: a new "Query parameter problems — 400" paragraph under "Errors" (slug, single
`detail`, no `errors`, the fixed texts, first problem only); the list's status row names the slug and
adds `size` 0, negative `page`, an unknown `type` and a non-numeric `categoryId`; the aggregates'
rows name the slug; the status-code summary distinguishes the two 400 slugs; one sentence says the
six filters mean and validate the same on the list, `summary` and `category-totals`, and paging exists
only on the list. Details in `docs-proposals.md`.

✅ Decision: as above; no `ARCHITECTURE.md` or `SCHEMA.md` change.

---

❓ **Q25** - **Cross-candidate effects.**

➡️
- **G7 / candidate 15 (OpenAPI):** the three operations' parameters are generated from
  `TransactionFilter` through `@ParameterObject`; expected identical to before (Q18). Do not add Bean
  Validation annotations to `TransactionFilter` to document limits — without `@Valid` they are
  inert, with `@Valid` they change the 400 shape; use `@Schema`/`@Parameter` attributes (for example
  `maxLength` on `q`, `minimum`/`maximum` on `size`) if the schema should state them. If candidate 15's
  schema check lands first, it verifies step 3's zero diff.
- **G3 / candidate 2 (problem messages):** no wire change. Query-parameter problems are
  `/errors/invalid-request` with only `detail` (English, fixed); there is no field to map.
- **G1 / candidate 1 (active profile) and G7 / candidate 14 (`from()` factory):** both edit
  `TransactionService` (`requireId`, `getReferenceById`, the mapper calls); land in any order and
  rebase.
- **G2 / candidate 4:** both edit `API.md` "Errors"; candidate 4 owns the pseudo-field paragraph, this
  candidate the new query-parameter paragraph.
- **Frontend parallel (not designed here):** the three transaction hooks each spell out the six
  parameters (`frontend/src/api/hooks/transactions.ts:25-33, 52-59, 87-93`) and `TransactionQuery` is
  hand-written (`frontend/src/api/types.ts:94-103`) — the same duplication on the client.

✅ Decision: `Depends on: none`; any order relative to siblings.

---

❓ **Q26** - **LESSONS entry.**

🔎 Facts: related entries: "Jackson 3 rejects a missing `boolean` record field by default"
(`docs/LESSONS.md:502`), "Escaping user input inside a SQL `LIKE` pattern, and composing
`Specification`s safely" (`:2245`). No entry on query-string binding.

➡️ One entry: binding query parameters to a record — constructor binding; a primitive component
cannot be absent (same trap as the Jackson entry, different machinery); the constructor must not throw
(it becomes a 500); `@ParameterObject` is documentation only; binding failures arrive as
`MethodArgumentNotValidException` with `isBindingFailure()`; headers can bind too.

✅ Decision: as above.

---

## Round 6 — frontier check

Every node has a decision. Not verified in this pass (also in the spec's Further Notes):
1. The current `/v3/api-docs` content (no snapshot committed).
2. That springdoc honours `@Schema(defaultValue = "false")` on a flattened record component
   (fallback in Q10).
3. That the empty-string cases (`from=`, `includeDescendants=`) behave identically in both binding
   paths — expected from Spring's formatter behaviour, locked by new tests before the change.
4. That model-attribute binding uses the same MVC conversion service as `@RequestParam` (standard;
   proven after the change by the existing date tests).

---

## Decisions (one page)

1. **Bind once:** `list`, `summary` and `category-totals` take one `TransactionFilter` argument,
   bound by Spring's constructor binding and documented with springdoc's `@ParameterObject` on the
   parameter; its component names are the wire names.
2. **Components:** `from`, `to`, `categoryId`, `includeDescendants`, `type`, `q`; `includeDescendants`
   is a `Boolean` normalised to `false` (a primitive would make every request without it a 400) and
   keeps `default: false` in the schema. The compact constructor only normalises — a constructor
   exception during binding is a 500.
3. **No Bean Validation on the filter.** The rules stay explicit, with today's texts, and run inside
   the one place a filter becomes a specification, after the active-profile check and before the
   category lookup — so 409 → 400 → 404 precedence is unchanged and no caller can skip validation.
4. **Handler:** a binding failure on a model attribute answers exactly like today's type mismatch —
   400 `/errors/invalid-request`, "Query parameter '<name>' has an invalid value.", no `errors` — via
   one helper shared with `handleTypeMismatch`.
5. **Paging:** `page`/`size` stay two `@RequestParam`s on `list` only, checked with today's texts;
   `Pageable` rejected (clamps instead of 400, adds `sort`). The fake paging of aggregates is gone.
6. **`category-counts`** stays `q`-only, as documented; the service method takes just `q`.
7. **Location:** `TransactionFilter` moves to `dto`; the specification builder stays private in
   `TransactionService`; no layer rule changes.
8. **Only observable change:** a list request breaking a paging rule and a filter rule at once
   reports the paging text; documented.
9. **OpenAPI:** expected identical; verified by diffing `/v3/api-docs` before and after.
10. **Seam:** MockMvc (existing classes, characterisation cases first) plus one handler unit test;
    all 53 existing test methods survive; none deleted.
