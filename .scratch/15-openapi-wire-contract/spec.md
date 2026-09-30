# Make the OpenAPI document the checked statement of the wire contract

Status: ready-for-agent
Candidate: 15 — Make the OpenAPI schema earn its keep
Strength: Strong
Depends on: none (its own steps are ordered below; step 1 stands alone)

## Problem Statement

The project pays the full price of OpenAPI and collects little of the benefit. springdoc puts
Jackson 2 on the backend's classpath, which already needed an ArchUnit rule, a converter-list test
and a Hibernate pin to contain; 22 identical hand-placed annotations tell it that money is a string.
In return the frontend derives 12 request types from the generated TypeScript file and hand-writes
45 others — every response type among them — and pairs URLs with response types by hand at 42 call
sites.

The generated file is stale: it was last regenerated on 2026-09-22, and the passwordless-mode work
since then added `authMode` to the session response, the `PUT /api/auth/password` endpoint and its
`SetPasswordRequest` body — none of which the generated file knows, all of which the frontend
already uses through hand-written copies. Nothing in CI noticed. The maintenance run that adopted
the tooling promised "backend/frontend type drift becomes a CI failure instead of a runtime
surprise"; that part was never built. Regenerating needs a running backend, with Postgres and Redis
behind it, so it does not happen.

The document is also not accurate enough to derive from. Every response field is optional in it,
so aliasing one response type produced about 25 possibly-undefined errors across three screens
(recorded in commit `feabb01`); money is right only because each money field repeats an
annotation; the Plan and `viz` are described as a dump of Jackson 3 `JsonNode` getters that never
appear on the wire. For the owner, a DTO change can reach `dev` with the frontend still compiling
against the old shape; for a contributor, there is no single, trustworthy statement of what the
backend sends and accepts.

## Solution

The OpenAPI document becomes the checked statement of the backend's request and response shapes.

First, a copy of the document is committed beside docs/API.md. A backend test fetches the document
the application actually serves and fails when it differs from the committed copy; the frontend
generates its TypeScript declarations from the committed copy, with no backend running, and CI fails
when the committed declarations are stale. The stale declarations are regenerated in the same step.
From then on, any contract change appears in review as a diff of the document and of the generated
declarations, and cannot land without them.

Then, step by step, the document is made accurate enough to derive from: the money schema is stated
once instead of 22 times; the Plan, `viz` and the insight execution bodies are stated as free-form
JSON objects; every field of a success response is stated as always present, with the fields that
can be `null` marked as such; responses are stated as JSON. Finally the frontend's response types
become aliases of the generated ones, resource by resource, with the frontend names converging on
the backend record names. The YAML form of the document becomes readable on the same terms as the
JSON form.

The document is authoritative for shapes — field names, types, formats, which fields are always
present, which may be `null`. docs/API.md stays authoritative for status codes, error shapes and the
reasoning, and says so. No API response changes at any step.

## User Stories

1. As the owner, I want CI to fail when the backend's served OpenAPI document differs from the
   committed copy, so that no wire-contract change reaches `dev` unreviewed.
2. As the owner, I want CI to fail when the committed TypeScript declarations are stale relative to
   the committed document, so that the frontend never compiles against an outdated contract.
3. As the owner, I want to regenerate the frontend declarations without starting the backend,
   Postgres and Redis, so that a type refresh takes seconds and actually gets done.
4. As the owner, I want the stale declarations regenerated now, so that `authMode`, the password
   endpoint and `SetPasswordRequest` exist in the generated file the frontend compiles against.
5. As the owner, I want the maintenance run's promise — type drift is a CI failure — to be true, so
   that the Jackson 2 containment I maintain for springdoc buys something.
6. As the owner, I want the procedure for an intended contract change to be "copy one file,
   regenerate one file", so that I follow it every time.
7. As the owner, I want a failing test to tell me exactly what to copy and what to run, so that I
   never have to remember the procedure.
8. As the owner, I want the money schema declared once, so that a new money field is documented
   correctly with no annotation to forget.
9. As the owner, I want the 22 identical money annotations deleted, so that each DTO carries only
   what is specific to its fields.
10. As the owner, I want a test that fails if any money field is ever documented as a JSON number,
    so that I no longer verify regenerations by eye as docs/API.md currently asks.
11. As the owner, I want the Plan and `viz` documented as opaque JSON objects, so that the document
    stops advertising Jackson internals that never appear on the wire.
12. As the owner, I want every field of a success response documented as always present, so that
    response types can be derived instead of maintained by hand.
13. As the owner, I want fields that can be `null` documented as nullable, so that the derived types
    force the frontend to handle `null` exactly where the server can send it.
14. As the owner, I want the 23 hand-written response interfaces replaced by derived types, so that
    a backend field rename becomes a TypeScript compile error rather than a blank cell on a screen.
15. As the owner, I want a springdoc or swagger-core upgrade that changes the document to fail CI,
    so that library upgrades cannot silently change the contract.
16. As the owner, I want every step to be separately shippable with a green build, so that I can
    stop after any step and keep what it delivered.
17. As the owner, I want the YAML form of the document readable under the same rule as the JSON
    form, so that the security configuration has no accidental gaps.
18. As a future contributor, I want one committed file that states every endpoint's request and
    response shapes, so that I can read the contract without running anything.
19. As a future contributor, I want the committed document sorted and pretty-printed and free of any
    host name, so that my diff contains only my change.
20. As a future contributor, I want every rule that shapes the document to live in one
    configuration class, so that I know where to look when the document says something surprising.
21. As a future contributor adding a nullable field to a response, I want one visible convention
    for marking it, so that the generated type says `| null`.
22. As a future contributor adding a field to a response, I want it documented as present without
    any annotation, so that the default is right.
23. As a future contributor, I want frontend type names to match the backend record names, so that
    I can follow one name from the Java record to the TypeScript type with one search.
24. As a future contributor, I want request and response types to come from one generated source,
    so that I never wonder which copy of a shape is right.
25. As a future contributor, I want the Plan DSL and result-shape types clearly left hand-written,
    with the reason, so that I do not try to derive them from a document that treats plans as
    opaque.
26. As a future contributor, I want to know which parts of the document are authoritative and which
    are not (status codes, error responses, logout), so that I do not build on the inaccurate parts.
27. As an AI agent told to read docs/API.md first, I want the machine-checked document right beside
    it, so that I find the exact shapes when I need them.
28. As a future contributor writing frontend tests at the network seam, I want fixtures typed
    against derived response types, so that a fixture that no longer matches the wire fails the
    type-check.
29. As a future contributor, I want generated files excluded from formatters, so that their diffs
    are exactly the generator's output.
30. As a reviewer, I want every contract change to arrive as a diff of the committed document and
    of the generated declarations in the same pull request as the code, so that I can check the
    change is intended.
31. As a reviewer, I want a refactor that should not touch the wire (for example moving validation
    rules into shared modules) to show an unchanged document, so that I can trust the refactor.
32. As a reviewer, I want the removal of 22 money annotations proven by an unchanged document, so
    that I can accept it without reading 22 hunks.
33. As a reviewer, I want the required and nullable rules asserted by name in a test, so that the
    rules survive someone regenerating the committed document without reading it.
34. As a reviewer, I want Dependabot pull requests that change the generator's output to fail until
    the regenerated file is committed, so that the tool version and its output never disagree.
35. As a self-hosting user, I want no change to any API response at any step, so that my instance,
    my frontend and my scripts keep working.
36. As a self-hosting user, I want the shipped stack to keep not publishing Swagger UI or the
    document, so that my instance's surface does not grow.
37. As a self-hosting user writing my own client, I want an accurate committed OpenAPI document, so
    that a client I generate treats money as strings and handles `null`s.
38. As a self-hosting user running a passwordless instance, I want the same document as a password
    instance, so that one contract serves both.
39. As a self-hosting user, I want the frontend to render transactions, budgets, subscriptions,
    profiles and insights exactly as before after the type migration, so that the refactor is
    invisible to me.
40. As a future contributor, I want the transaction query-parameter type to stay hand-written until
    the filter's binding is settled, so that this work does not collide with that redesign.
41. As a reviewer, I want the known inaccuracies of the document (status codes of eleven handlers,
    the missing logout path, undocumented errors) recorded, so that nobody mistakes them for the
    contract.

## Implementation Decisions

**Scope of authority**
- The OpenAPI document is authoritative for request and response *shapes*: names, types, formats,
  enums, which fields are always present, which may be `null`. docs/API.md remains authoritative
  for status codes, error shapes and the reasoning, and its "Status of this document" paragraph says
  where each lives and that a disagreement on a shape is fixed in the same change.

**The committed document (step 1)**
- A JSON copy of the document springdoc serves is committed, named `openapi.json`, in the same docs
  directory as API.md. It is generated, never edited by hand, and outside every formatter's reach.
- A new backend test, `OpenApiDocumentTest`, uses the project's `@IntegrationTest` (so it shares the
  cached context and its Testcontainers Postgres) and fetches `/v3/api-docs` anonymously through
  MockMvc. It parses the served body and the committed file as JSON trees and asserts they are equal
  — object key order and whitespace do not matter, array order does. On every run it writes the
  served document, as served, into the backend's build output directory; when the trees differ, or
  the committed file is missing, it fails with one short instruction: review the difference, copy the
  written file over the committed one, then run `npm run generate:types` in the frontend. There is no
  "update mode"; CI never writes.
- The committed file is found relative to the backend module directory (Maven's working directory
  for tests); a failure to find it names the expected location.
- Determinism: the application sets `springdoc.writer-with-order-by-keys=true` and
  `springdoc.writer-with-default-pretty-printer=true`, and the `OpenAPI` bean in `OpenApiConfig`
  declares a single relative server, `/`, so the document never contains the host it was fetched
  from. springdoc already orders handler methods deterministically; operationIds (method name plus a
  numeric suffix) still renumber when endpoints are added, so no code may ever depend on them.

**Frontend generation and the CI check (step 1)**
- `generate:types` generates the TypeScript declarations (`schema.d.ts`) from the committed document
  instead of a running backend.
- A new script, `check:types`, runs the same generation with openapi-typescript's `--check` flag,
  which fails when the committed declarations differ byte for byte from what the committed document
  generates.
- `schema.d.ts` is added to the frontend's Prettier ignore list, so the committed file is exactly the
  generator's output (ESLint has no stylistic rules, so linting is unaffected).
- The CI frontend job runs `npm run check:types` after `npm ci`. The backend job needs no change:
  `./mvnw -B verify` runs `OpenApiDocumentTest`.
- The declarations are regenerated in this step and bring in `authMode`, the `PUT /api/auth/password`
  path and `SetPasswordRequest`. `SetPasswordRequest` in `types.ts` becomes an alias of the generated
  component, following the existing convention that request bodies are derived. Check before aliasing:
  the committed document must contain a `SetPasswordRequest` component with a required `password`
  string (it is the request body of `PUT /api/auth/password`) and `SessionResponse` must contain
  `authMode` with the values `PASSWORD` and `NONE`; if either is missing, the document is not what the
  code serves — stop. The one-time reorder of `schema.d.ts` (sorted keys) is expected and mechanical.
  Nothing else in `types.ts` changes.

**`OpenApiConfig` becomes the one module that shapes the document**
- Its interface is the document served at `/v3/api-docs` (and `/v3/api-docs.yaml`). Behind it: the
  info block, the relative server, the money schema, the JSON-object schema and the rule that makes
  success-response fields required. A reader who finds the document surprising looks here.

**Money stated once (step 2)**
- `OpenApiConfig` registers, once, through springdoc's global `SpringDocUtils` configuration
  (`replaceWithSchema`), that `BigDecimal` is documented as a string with format `decimal` and example
  `"243.5000"` — wherever it appears, in any request or response record, nested or not. The
  registration sits in a static initializer, springdoc's documented idiom, so it is in place before
  any document is generated.
- All 22 `@Schema(type = "string", format = "decimal", …)` annotations are deleted. The step is two
  commits: the registration first (the committed document does not change), then the deletions (it
  still does not change). If either commit changes the committed document, stop — the registration is
  not taking effect.
- Money constraints (`@DecimalMin`, `@Digits`) do not appear in the document before or after:
  swagger-core applies them only to number schemas.

**Plan, `viz` and the execution bodies stated honestly (step 3)**
- `OpenApiConfig` registers the Jackson 3 `JsonNode` type as a free-form JSON object (type `object`,
  additional properties allowed), with a description pointing to docs/API.md → Insights. This covers
  `plan` and `viz` on `InsightRequest` and `InsightResponse`, and the request and response bodies of
  `POST /api/insights/execute`. The `JsonNode` component disappears from the document.
- `viz` is marked `@Schema(nullable = true)` on `InsightRequest` and `InsightResponse` ("object or
  null", as docs/API.md states).
- The frontend's `Plan`, `Viz`, `ResultEnvelope` and result-shape types stay hand-written, mirroring
  docs/INSIGHTS.md: the executor owns that structure and the backend treats it as opaque; a second
  statement of the DSL in the document would drift from the executor's validator.
- This step must land before step 4: while `JsonNode` is a component shared by request and response
  bodies, the required rule would mark its bean properties required on a schema the request side
  uses too.

**Success responses stated exactly (step 4)**
- An `OpenApiCustomizer` bean in `OpenApiConfig` applies one rule: every property of every schema
  reachable from a success (2xx) response is required. It starts from each operation's success
  responses, follows schema references through properties, array items and schema-valued additional
  properties, keeps a visited set (`CategoryNode` refers to itself through `children`), and sets each
  reached component's required list to all its property names, in property order. Request schemas are
  not touched: their required lists keep coming from Bean Validation.
- The rule is true because Jackson writes every record component, `null`s included (no custom
  property inclusion is configured). ARCHITECTURE.md §3 records that dependency.
- Nullable success-response fields are marked with the existing `@Schema(nullable = true)` convention:
  `TransactionResponse.description`, `.merchant`, `.subscriptionId`; `CategoryNode.parentId`,
  `.color`; `SessionResponse.activeProfileId`; `SubscriptionResponse.notes`; and in the backup export
  body `BackupFile.CategoryData.parentRef`, `.color`, `BackupFile.SubscriptionData.notes`,
  `BackupFile.TransactionData.subscriptionRef`, `.description`, `.merchant` (13 markers;
  `InsightResponse.viz` came in step 3). Every other success-response field is non-null.
- The application sets `springdoc.default-produces-media-type=application/json`, so response content
  is documented as JSON instead of `*/*`.
- The 8 existing `nullable = true` markers on request records and the 3 `hidden = true` markers on
  `UpdateCategoryRequest`'s tri-state flags stay as they are. After all steps the DTOs carry 26
  `@Schema` annotations instead of 33, each stating a fact the Java type cannot.

**Frontend response types derived (step 5)**
- One commit per resource group — auth, profiles and backup; categories; transactions; budgets;
  subscriptions; insights — each green on `npm run lint`, `npm test` and `npm run build`.
- Response types in `types.ts` become aliases of the generated components and take the backend record
  names: `TransactionSummaryRow` becomes `TransactionSummary`, `SubscriptionCategoryCost` becomes
  `CategoryMonthlyCost`, `RestoredProfileSummary` becomes `RestoredProfile`, `RestoreBackupResponse`
  becomes `BackupRestoreResponse`. The generic `Page<T>` becomes `TransactionPage`, an alias of the
  generated `PageResponseTransactionResponse` (a generated concatenation, not a name worth spreading).
  Hooks and screens that use the old names are updated in the same commit.
- The derived types correct two reuse mismatches the TypeScript compiler will surface: the session
  user is `SessionUser` (no `createdAt`), and a budget status embeds `BudgetSummary` (no `createdAt`).
- The enums `AuthMode`, `TxnType`, `BillingPeriod` and `SubscriptionStatus` keep their frontend names
  and become indexed-access aliases on the generated response that carries them.
- `Insight` and `InsightRequest` keep their names: each is the generated type with `plan` and `viz`
  replaced by the hand-written `Plan` and `Viz`.
- Still hand-written afterwards: `TransactionQuery` (the list filter's query parameters, which
  candidate 11 may rebind) and the 14 Plan-DSL and result-shape types.
- Call sites keep `api<T>(url)`; nothing is typed against `paths` or `operations` in this candidate.

**The YAML sibling (step 6)**
- `SecurityConfig` permits `/v3/api-docs.yaml` together with the existing `/v3/api-docs/**`, Swagger UI
  paths. The anonymous exposure of the document and Swagger UI stays: neither is reachable in the
  shipped stack (nginx proxies only `/api/`, the backend port is published only by the e2e overlay),
  and the JSON is public in the repository anyway.

**Documents updated in the same change as each step** (exact text in this candidate's docs proposals)
- Step 1: ARCHITECTURE.md §2 (the one-line description of the docs directory), §3 "OpenAPI schema and
  the Jackson 2/3 split" (retitled "OpenAPI document and the Jackson 2/3 split"; the committed
  document, how it is checked, how types are generated) and §5 "CI/CD" (what each job now checks);
  docs/API.md "Status of this document" and the OpenAPI paragraph of "Money", which moves into its own
  cross-cutting subsection "OpenAPI document" with a one-line pointer left in "Money"; README
  "Regenerating API types" (renamed "Changing the API contract") and the Swagger UI sentence.
- Step 2: the money sentences in ARCHITECTURE.md §3 and docs/API.md (the manual verification
  instruction is replaced by the test).
- Step 3: docs/API.md "Insights" and ARCHITECTURE.md §3 (opaque JSON objects).
- Step 4: docs/API.md and ARCHITECTURE.md §3 (success-response fields required, nullability explicit,
  the Jackson inclusion dependency).
- Step 5: ARCHITECTURE.md §3 (which frontend types remain hand-written, and why).
- No ADR: the design amends ARCHITECTURE.md §3, which is updated in place.

**Lessons** (docs/LESSONS.md, git-ignored): step 1 — a golden-file test for a generated artefact;
step 2 — one global type-to-schema mapping instead of per-field annotations, and why a static
initializer; step 4 — `required` means present, `nullable` means may be `null`: two separate axes.

**Ordered steps** (each separately shippable, each leaving `./mvnw -B verify` and the frontend CI
commands green)
1. **The checked contract.** `OpenApiDocumentTest` equality test (fails first: no committed file),
   the committed document, the two writer properties, the relative server, `generate:types` from the
   committed file, `check:types`, the Prettier ignore, the CI line, regenerated `schema.d.ts`, the
   `SetPasswordRequest` alias, docs. *Leaves:* drift in either half fails CI; no response changes; no
   other frontend change.
2. **Money stated once.** The no-bare-number test (green against today's annotated code), the global
   money registration (document unchanged), deletion of the 22 annotations (document unchanged), docs.
   *Leaves:* an identical document, with no money annotation left.
3. **Opaque JSON stated honestly.** The failing test for the JSON-object rule, the `JsonNode`
   registration, `viz` nullable on both insight records, document and declarations regenerated, docs.
   *Leaves:* `types.ts` unchanged and compiling (it never referenced the `JsonNode` component).
4. **Success responses exact.** The failing required/nullable/media-type tests, the customiser, the 13
   nullable markers, the produces property, document and declarations regenerated, docs. *Leaves:*
   `types.ts` unchanged and compiling (request schemas did not change).
5. **Response types derived**, one resource group per commit, then the ARCHITECTURE.md sentence.
   *Leaves:* 42 of 57 exported types derived; the frontend behaves identically.
6. **YAML sibling permitted**, with its test. Independent; any time after step 1.

## Testing Decisions

- **What makes a good test here:** it asserts the document as served — the observable interface every
  consumer sees — never the customiser's internals or springdoc's configuration objects. A rule is
  asserted by name on representative schemas; the equality test pins everything else. On the frontend
  the "test" is mechanical: the generator's own staleness check and the TypeScript compiler.
- **Seam chosen:** the served document at `/v3/api-docs`, fetched anonymously through MockMvc in the
  shared `@IntegrationTest` context. It is the highest seam available (it includes springdoc, every
  customisation and the security rule that exposes it), it needs no new infrastructure, and one test
  class covers all the backend rules. The frontend half is `check:types` plus `tsc -b` inside
  `npm run build`, run by the frontend CI job; no vitest test is added.
- **`OpenApiDocumentTest`, growing per step:**
  1. the served document equals the committed one (step 1; red until the committed file exists);
  2. no property anywhere in the document is a bare `number` (a number without a format), which is how
     an undocumented `BigDecimal` would appear — money is never a JSON number (step 2; written first,
     green against the annotated code, the guard for deleting the annotations);
  3. no schema is named `JsonNode`; `plan`, `viz` and both execution bodies are free-form objects;
     `viz` may be `null` (step 3; red first);
  4. every property of `TransactionResponse` is required, `description`, `merchant` and
     `subscriptionId` are nullable and `amount` is not; every property of `CategoryNode` is required,
     `parentId` and `color` are nullable, `children` is an array of `CategoryNode`;
     `SessionResponse.activeProfileId` is nullable; `TransactionRequest`'s required list is exactly
     its Bean Validation set (`categoryId`, `amount`, `currency`, `type`, `occurredOn`); response
     content is `application/json` (step 4; red first).
- **`SecurityConfigTest` (step 6):** an anonymous request reads the document as JSON and as YAML.
- **Existing tests:** every backend and frontend test survives unchanged. Frontend tests mock the
  hooks module and import only `AuthMode` from `types.ts`, which stays exported. Nothing is deleted.
  What is replaced is not a test but docs/API.md's manual instruction to check regenerated money
  fields by eye.
- **Prior art:** `HttpMessageConverterTest` (asserts a framework-assembled artefact rather than
  code), `SecurityConfigTest` and the controller tests (`@IntegrationTest` + MockMvc),
  `ArchitectureTest` (a structural invariant as a test), the analytics executor's committed golden
  files (golden-file testing already used in this repository).

## Out of Scope

- **Status codes in the document.** Eleven handlers returning `ResponseEntity` are documented as `200`
  while they answer `201` (six creates) or `204` (five deletes). Fixing them (`@ResponseStatus`, or
  the `void` delete style `BudgetController` already uses) is left to whichever candidate first types
  call sites against `paths`; docs/API.md stays authoritative for status codes.
- **The logout endpoint** (handled by Spring Security's filter, absent from the document) and
  **error responses** (Problem Details are not documented; the customiser deliberately ignores
  non-2xx responses).
- **Typing the 42 call sites** against `paths` (a typed client such as openapi-fetch, or a typed
  wrapper in the API client) — a later candidate. `operations` must never be indexed.
- **Deriving `TransactionQuery`** — waits for candidate 11's filter binding.
- **A JSON Schema of the Plan DSL** in the document — the executor and docs/INSIGHTS.md own it.
- Swagger UI's "Try it out" for mutating requests (CSRF), disabling springdoc in production, a
  `.gitattributes` rule for Windows line endings, converting the three `hidden = true` markers to
  `@JsonIgnore`.
- The Jackson 2 containment (ArchUnit rule, converter test, Hibernate pin) — it stays as is.
- Any change to what the API sends or accepts.

## Further Notes

- **Verified in bytecode or source, not by execution** (no builds or runs were allowed in the design
  pass): that springdoc 3.1.1's `replaceWithSchema` takes effect for record properties (its converter
  sits at the head of swagger-core's chain and properties are resolved through the chain); that
  `@Schema(nullable = true)` composes with a replaced object schema under OpenAPI 3.1; that
  `springdoc.default-produces-media-type` replaces `*/*` everywhere; that `/v3/api-docs.yaml` answers
  401 anonymously today; that Prettier 3 skips an explicitly passed file listed in its ignore file
  (lefthook passes staged paths — if it does not, `check:types` fails loudly in CI and lefthook's glob
  needs an exclusion); and the exact content of the regenerated declarations. Step 2's
  unchanged-document requirement is the runtime proof of the first; the named tests of steps 3–4 prove
  the next two.
- **Ongoing cost, accepted:** a Dependabot bump of springdoc, swagger-core or openapi-typescript that
  changes output fails CI until the maintainer regenerates the committed files in that pull request.
- **Edge cases recorded for implementers:** without the visited set the walk recurses forever on
  `CategoryNode`; a record used both as a request body and inside a success response would get its
  request fields marked required (request and response records must stay separate, as they are
  today); a future money wire type other than `BigDecimal` must be registered next to it in
  `OpenApiConfig`; a non-default Jackson property inclusion would make the required rule untrue.
- **Sibling candidates — what they can assume and the recommended order:**
  - *Candidate 4 (G2, value rules):* after step 2 no value-rule module needs any `@Schema`; money's
    document schema is keyed by the Java type in `OpenApiConfig`. swagger-core expands composed Bean
    Validation constraints (verified in its bytecode), so `required`, `pattern` and `maxLength`
    survive a composed constraint. A pure refactor must leave the committed document unchanged; an
    intended change (for example the category colour gaining a `pattern` on the PATCH body, which
    today validates colour in an `@AssertTrue` method) shows as a diff. Land steps 1–2 first.
  - *Candidate 11 (G2, Transaction filter):* the contract is individual query parameters with today's
    names, types and defaults on the list, `summary` and `category-totals` endpoints (and `q` on
    `category-counts`); a record-bound filter must leave the document's parameter lists identical.
    springdoc 3.1.1 offers `@ParameterObject` and `springdoc.default-flat-param-object`; which one
    reproduces today's parameters exactly was not verified. Land step 1 first.
  - *Candidate 8 (G4, network seam):* before step 4, generated response types are all-optional — type
    fixtures with `types.ts` exports, not generated components directly. After step 5, six names change
    as listed and `Page<T>` becomes `TransactionPage`. Take status codes from docs/API.md, not from the
    document; errors are not in the document; `paths` keys are stable, `operations` keys are not;
    response content is keyed `application/json` from step 4. Start typed fixtures after step 4,
    ideally step 5.
  - *Candidates 1 and 6 (G1):* the committed document is their wire-equivalence check once step 1 has
    landed.
  - *Candidates 2 and 5 (G3):* the document does not describe Problem responses, so candidate 2 cannot
    derive a Problem type from it; candidate 5 keeps the derived request types, which no step changes.
  - *Candidate 13 (G5):* replacing Redis changes the shared test context, not the document.
  - *Candidate 17 (G8):* `openapi-typescript` is used by `generate:types` and `check:types`; it is not
    unused tooling.
  - *Candidate 14 (G7):* changes nothing in the document; if step 1 lands first, the unchanged document
    is extra proof. Textual overlap on `TransactionResponse` only.
  - Recommended order: 15.1 → 15.2 → candidates 4 and 11 → 15.3 → 15.4 → 15.5 → candidate 8's typed
    fixtures; 15.6 and candidate 14 any time after 15.1.
- The dated maintenance-run design is not edited; this candidate makes its drift-check promise true.

**Added when the specs were cross-checked (2026-09-30).**

- **Candidate 8, reconciled.** Candidate 8 types its test answers against the frontend's wire types
  module, not against the generated types directly, so it does not have to wait for step 4 or 5.
  The place given to it in the recommended order above is a preference only.
- **Candidate 4, reconciled.** Candidate 4's step 5 says the generated types are regenerated from a
  running backend. Once step 1 of this spec has landed, the procedure is this spec's instead: let
  the document test write the served copy, copy it over the committed document, regenerate.
