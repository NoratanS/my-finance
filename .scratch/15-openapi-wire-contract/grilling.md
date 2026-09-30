# Candidate 15 — Make the OpenAPI schema earn its keep — grilling log

Settled by the owner on 2026-09-29: **OpenAPI stays.** This session designs how it pays; removing
it is not an option on any branch.

Repository state examined: branch `dev`, HEAD `c3e20c5` (`git diff --stat 4545810 HEAD` is
empty, so the brief's line numbers hold). Read-only throughout.

How library behaviour was checked (nothing was run): springdoc 3.1.1 and swagger-core 2.2.55
were unpacked from `~/.m2` into the session scratchpad and read with `javap -p -c -constants`;
springdoc's `META-INF/spring-configuration-metadata.json` was read for property names;
spring-test 7.0.8's `JsonPathExpectationsHelper` was read the same way; openapi-typescript
7.13.0 was read as installed under `frontend/node_modules` (`bin/cli.js`,
`dist/transform/schema-object.mjs`).

---

## Round 1 — constraints, dependency categories, scope, where the checked artefact lives

❓ **Q1** - **What must the design not break?**

🔎 Facts:
- Settled (brief §6): OpenAPI stays; money is a decimal string plus an ISO 4217 code;
  package-by-layer with ArchUnit; Testcontainers stays.
- Jackson 2 containment stays (card): the ArchUnit rule `noJackson2Databind`
  (`backend/src/test/java/com/myfinance/backend/ArchitectureTest.java:71–79`, which bans any
  app-code dependency on `com.fasterxml.jackson.databind..`; tests are excluded at `:22`),
  `HttpMessageConverterTest` (`config/HttpMessageConverterTest.java:33–56`), the Hibernate pin
  (`application.properties:13–17`), and `JacksonConfig.jackson2ConverterRemover`
  (`config/JacksonConfig.java:54–63`).
- `./mvnw -B verify` is the backend's single command (`ci.yml:18–19`); "CI runs the same commands
  a developer runs locally" (`ARCHITECTURE.md:363–364`); every formatter is gated
  (`ARCHITECTURE.md:360–361`).
- Request semantics that the document must keep: `PATCH /api/categories/{id}` distinguishes
  absent from `null` (`docs/API.md:612–640`, `dto/UpdateCategoryRequest.java:13–24`), so its
  properties must stay optional; `TransactionRequest.description`/`merchant` and the
  subscription `notes` are optional and may be `null` (`dto/TransactionRequest.java:35–36`).
- Recorded design of the schema today: `ARCHITECTURE.md:194–223`; `docs/API.md:117–127`.

➡️ Constraints: no wire change for any client; no app code importing Jackson 2 databind; no
second backend build command; both CI halves run locally with the same commands; request
optionality stays exactly as Bean Validation states it.

⚖️ Strongest argument against: none; these are recorded decisions.

✅ Decision: constraints fixed as listed. Unblocks every other question.

---

❓ **Q2** - **Dependency categories and seams**: what crosses what, and where are the test seams?

🔎 Facts:
- Document generation runs inside the backend process: springdoc
  (`backend/pom.xml:52–56`) introspects the controllers and records through swagger-core's
  Jackson 2 `ModelResolver`; `config/OpenApiConfig.java:16–24` contributes one `OpenAPI` bean.
  No test touches `/v3/api-docs` or Swagger UI today (`grep -rn "api-docs\|swagger"` over
  `backend/src/test`: no hits).
- The frontend consumes the contract only through a generated file:
  `frontend/src/api/schema.d.ts` is imported by exactly one file, `frontend/src/api/types.ts:4`
  (grep); 12 `components[...]` references, 0 `paths[...]`/`operations[...]` outside the
  generated file.
- The generator is `openapi-typescript` 7.13.0 (`frontend/package.json:17,50`, installed
  version read from its `package.json`).

➡️ In-process on the backend side (springdoc is a library inside the process; test it at the
HTTP interface where the document is served). Across the repository the committed document is
the port between backend and frontend; springdoc is the producing adapter and
`openapi-typescript` the consuming adapter. Two checks, one per side: the served document
equals the committed one (backend), and the generated file equals what the committed document
generates (frontend); the TypeScript compiler then checks `types.ts` and every call site.

⚖️ Strongest argument against: a single end-to-end check (start the backend in CI, fetch,
generate, compare) would be one seam instead of two. It needs a running backend with Postgres
and Redis in the frontend job — the cost the card asks to avoid.

✅ Decision: backend seam = the document served at `/v3/api-docs` through MockMvc; frontend seam
= the generator's own staleness check plus `tsc`. Unblocks Q4, Q6–Q8.

---

❓ **Q3** - **What is the document authoritative for?**: Options: (a) everything the HTTP interface
does (shapes, status codes, errors, security); (b) request and response shapes only — names,
types, formats, which fields are always present, which may be `null`.

🔎 Facts:
- Status codes in the current document are wrong wherever a controller returns `ResponseEntity`:
  `POST /api/transactions` is documented `200` (`schema.d.ts` `operations.create`), real `201`
  (`TransactionController`'s create returns `ResponseEntity.created`); `DELETE
  /api/transactions/{id}` documented `200`, real `204` (`ResponseEntity<Void>`). Methods with
  `@ResponseStatus` are right (`register` → `201`; `AuthController.java:50`). Six creates and
  five deletes are affected (`grep` of `ResponseEntity<` in `controller/`).
- No error responses are documented (`responses: never` components, only `200/201` per
  operation in `schema.d.ts`); `/api/auth/logout` is absent because Spring Security's logout
  filter handles it (`SecurityConfig.java:87–89`).
- Nothing consumes status codes from the document: the client's `api<T>` ignores them
  (`frontend/src/api/client.ts:72–99`).

➡️ (b). The document is the checked statement of *shapes*. docs/API.md stays authoritative for
status codes, error shapes and reasoning, and says so.

⚖️ Strongest argument against: "the one statement of the wire contract" with wrong status codes
invites someone (for example candidate 8's msw handlers) to trust them. Fixing them means eleven
controller edits near G1's territory for no current consumer.

✅ Decision: shapes only; the status-code and logout gaps are recorded as known, out of scope,
and flagged to G4; docs/API.md's "Status of this document" names the split (Q21). Unblocks Q4.

---

❓ **Q4** - **Where does the checked document live, and what produces it?**: Options:
(a) a backend test that fetches `/v3/api-docs` through MockMvc and compares it with a committed
file; (b) `springdoc-openapi-maven-plugin` at `integration-test`; (c) the frontend or e2e CI job
starting the stack and fetching; (d) commit only `schema.d.ts`. Location options:
`docs/openapi.json`, `backend/src/test/resources/…`, `frontend/…`.

🔎 Facts:
- The springdoc Maven plugin downloads the document from a *running* application; this backend
  needs Postgres (Flyway, `ddl-auto=validate`, `application.properties:5–10`) and Redis
  (`:56–57`) to start. The test suite gets both from Testcontainers
  (`support/TestcontainersConfiguration.java:23–38`), which a plugin-started app would not have.
- Every `@IntegrationTest` class shares one cached Spring context
  (`support/IntegrationTest.java:24–30`), so one more such class adds no container start.
- The frontend CI job has no backend (`ci.yml:21–31`); only the e2e job starts the stack
  (`:59–72`).
- The backend image build uses `-DskipTests` with `backend/` as context (`backend/Dockerfile:12`),
  so a test reading a file outside `backend/` never runs there.
- Formatter reach: Prettier runs on `frontend/{src,e2e}` (`frontend/package.json:12–13`,
  `lefthook.yml:8–13`); Spotless on Java only; ruff on Python only. `docs/` is outside all of
  them.
- docs/ already holds non-prose artefacts (`docs/design/styles.css`, `ARCHITECTURE.md:229`).

➡️ (a). The document is committed as `docs/openapi.json`, beside `docs/API.md`; the backend test
reads it relative to the backend module directory (the working directory under Maven), and the
frontend reads it as `../docs/openapi.json`.

⚖️ Strongest argument against: a backend test reaching outside its module
(`backend/src/test/resources` would keep `./mvnw verify` self-contained). But the file is the
contract both halves share, not a backend fixture; beside `API.md` it is where a reader — or an
agent told to read `docs/API.md` first — finds it, and no formatter touches it there.

✅ Decision: (a) at `docs/openapi.json`. Unblocks Q5–Q8.

---

## Round 2 — determinism, comparison and update procedure, test context, frontend generation

❓ **Q5** - **Is springdoc's output deterministic enough to commit?**: Sources of churn: path
order, schema order, operationId numbering, the server URL, whitespace.

🔎 Facts:
- `org.springdoc.webmvc.api.OpenApiResource.calculatePath` (3.1.1, `javap -c`) copies the handler
  methods into a `TreeMap` whose comparator is `byReversedRequestMappingInfos` — `o2.toString()
  .compareTo(o1.toString())` on `RequestMappingInfo`. Processing order therefore depends only on
  the mappings, and so do the operationId suffixes (`get`, `get_1` … `get_5`, `update_4`,
  `list_5` in today's `schema.d.ts` `operations`) — stable for a fixed endpoint set, renumbered
  when an endpoint is added.
- `springdoc.writer-with-order-by-keys` (metadata default `false`) makes
  `ObjectMapperProvider.sortOutput` enable `ORDER_MAP_ENTRIES_BY_KEYS` and
  `SORT_PROPERTIES_ALPHABETICALLY` and register `SortedOpenAPIMixin31`/`SortedSchemaMixin31` for
  OpenAPI 3.1; `springdoc.writer-with-default-pretty-printer` (default `false`) pretty-prints.
  Both are read by `AbstractOpenApiResource` when writing (`javap -c`, `isWriterWithOrderByKeys`,
  `isWriterWithDefaultPrettyPrinter`). Arrays (`required`, `enum`, `tags`) keep their order.
- The server entry: `OpenAPIService.updateServers` adds `{url: <request base>, description:
  "Generated server url"}` only when `isServersPresent` is false; the constructor sets that flag
  when the `OpenAPI` bean already declares servers (`javap -c`). Under MockMvc the request base
  would be `http://localhost`; against a dev backend `http://localhost:8080`.
- `springdoc.api-docs.version` defaults to `openapi-3-1` (metadata), matching `ARCHITECTURE.md`
  and the maintenance design (`…-maintenance-run-design.md:136`).

➡️ Set `springdoc.writer-with-order-by-keys=true` and `springdoc.writer-with-default-pretty-printer=true`
in `application.properties`, and declare one relative server, `/`, on the `OpenAPI` bean in
`OpenApiConfig`, so the document never carries the host it was fetched from. Accept that
operationIds renumber when endpoints change; therefore nothing may ever index `operations[...]`
(Q18).

⚖️ Strongest argument against: sorting in the application changes the served order for Swagger UI
readers. Swagger UI groups by tag and sorts itself; the sorted, pretty document is also nicer to
read raw.

✅ Decision: both writer properties plus a relative server in step 1. Expect one large, mechanical
reorder of `schema.d.ts` when it is first regenerated. Unblocks Q6, Q9.

---

❓ **Q6** - **How does the test compare, and how is the contract changed on purpose?**: Options:
(a) byte comparison; (b) parse both and compare JSON trees; update by (i) a system-property
"update mode" that rewrites the committed file; (ii) always writing the served document under
`target/` and failing with a copy-and-regenerate instruction.

🔎 Facts:
- No `.gitattributes` in the repository (`ls -a`), so a Windows checkout with `core.autocrlf`
  would change line endings of the committed file; a byte comparison would then fail spuriously.
- A text-equality failure on a ~2,000-line document is unreadable in a test report; a tree
  mismatch is too, which is why the served copy must be written somewhere diffable.
- The analytics service already uses committed golden files for the executor
  (`analytics/tests/test_executor_golden.py`, referenced in `docs/LESSONS.md:777`), so golden
  files are established prior art in this repo.

➡️ (b) + (ii). The test parses the served body and the committed file as JSON trees and asserts
equality (object key order and whitespace do not matter, array order does); on every run it
writes the served document, as served, to `backend/target/openapi.json`; on mismatch — or when
the committed file is missing — it fails with one short message: review the difference, copy
`backend/target/openapi.json` over `docs/openapi.json`, then run `npm run generate:types` in
`frontend/`.

⚖️ Strongest argument against: (i) is the usual snapshot ergonomics (`-u` in Jest) and saves a
copy. It also adds a mode to the test and makes it easy to rewrite the contract without looking;
an explicit copy keeps the change a deliberate act, and CI never writes.

✅ Decision: tree comparison; served copy always written under `target/`; explicit copy to update.
Unblocks Q9.

---

❓ **Q7** - **Which test context runs it?**: Options: (a) `@IntegrationTest` (full context,
MockMvc through the security chain); (b) `@WebMvcTest`; (c) a dedicated `@SpringBootTest`.

🔎 Facts: `@IntegrationTest` = `@SpringBootTest` + `@AutoConfigureMockMvc` + `DatabaseCleaner` +
`TestcontainersConfiguration` + `TestFixtures` (`support/IntegrationTest.java:24–30`); all such
classes share the cached context. A `@WebMvcTest` slice does not load the services the controllers
need, nor necessarily springdoc's auto-configuration. `/v3/api-docs` is `permitAll`
(`SecurityConfig.java:83–84`), so the test exercises the anonymous path real readers use.

➡️ (a), a new class `OpenApiDocumentTest` in the `config` test package beside
`HttpMessageConverterTest` and `SecurityConfigTest`.

⚖️ Strongest argument against: the full context is heavier than needed. It is already started for
every other integration test; reusing it is free.

✅ Decision: `@IntegrationTest`. Unblocks Q9, Q16.

---

❓ **Q8** - **How does the frontend generate its types without a running backend, and what is the
CI check?**: Options: (a) `generate:types` reads the committed file; CI regenerates and runs
`git diff --exit-code`; (b) the same but using `openapi-typescript --check`.

🔎 Facts:
- `frontend/package.json:17`: `openapi-typescript http://localhost:8080/v3/api-docs -o
  src/api/schema.d.ts`. The CLI resolves a positional input with `new URL(input, CWD)`
  (`bin/cli.js`, single-file branch), so `../docs/openapi.json` works from `frontend/`.
- `--check` exists in 7.13.0 (`bin/cli.js:22`); `checkStaleOutput` reads the existing output
  file and compares `current === previous` byte for byte, exiting 1 with "Generated types are not
  up-to-date!" (`bin/cli.js:125–135`).
- The committed `schema.d.ts` is Prettier-formatted (single quotes; commit `77921d1 style(frontend):
  apply Prettier`), and `.prettierignore` does not list it (`frontend/.prettierignore:1–6`). The
  raw generator output would therefore never byte-equal the committed file.
- ESLint has no stylistic rules (`frontend/eslint.config.js:7–24`: `js.configs.recommended`,
  `tseslint.configs.recommended`, react-hooks, react-refresh), so raw output lints the same as
  the formatted file.
- lefthook runs `npx prettier --write {staged_files}` on staged `frontend/{src,e2e}/**/*.ts`
  (`lefthook.yml:8–13`).

➡️ (b). `generate:types` becomes `openapi-typescript ../docs/openapi.json -o src/api/schema.d.ts`;
a new `check:types` runs the same with `--check`; `src/api/schema.d.ts` is added to
`frontend/.prettierignore` so the committed file is exactly the generator's output; the CI
frontend job runs `npm run check:types` after `npm ci`.

⚖️ Strongest argument against: keeping Prettier on the file and using `git diff` keeps one
formatting style across `src/`. But then the check needs three commands in CI and a clean working
tree, and a generated file does not need a human style.

✅ Decision: (b). Not verified by running: that Prettier 3 skips an explicitly passed file listed in
`.prettierignore` (lefthook passes staged paths). If it did not, the reformatted file would fail
`check:types` in CI — loudly — and lefthook's glob would need an exclusion. Unblocks Q9.

---

## Round 3 — step 1's content, the money schema, what G2 may assume, the Plan

❓ **Q9** - **What exactly is step 1 ("regenerate, add the drift check"), and what does it leave
working?**

🔎 Facts:
- The generated file is stale: last regenerated in `8bf1131` (2026-09-22,
  `git log -- frontend/src/api/schema.d.ts`). Since then `19f9be6` added `authMode` to
  `SessionResponse` and `742c1e2` added `PUT /api/auth/password` and `SetPasswordRequest`
  (`git log 8bf1131..HEAD -- dto controller AuthMode.java`). `schema.d.ts:788–793` has no
  `authMode`; no `/api/auth/password` path; no `SetPasswordRequest` (grep).
- The frontend already uses them through hand-written types: `AuthMode` and
  `SessionResponse.authMode` (`types.ts:23–32`), `SetPasswordRequest` (`types.ts:43–46`),
  `useSetPassword` (`hooks/auth.ts:75–81`).
- The convention since `feabb01` is "request bodies are aliases of the generated components".
- The promise that was not built: "Backend/frontend type drift becomes a CI failure instead of a
  runtime surprise" (`docs/superpowers/specs/2026-09-07-maintenance-run-design.md:131`).

➡️ Step 1 ships, in one change: `OpenApiDocumentTest` (equality, Q6); the committed
`docs/openapi.json`; the two writer properties and the relative server (Q5); `generate:types` from
the file, `check:types`, the Prettier ignore and the CI line (Q8); `schema.d.ts` regenerated;
`SetPasswordRequest` in `types.ts` turned into an alias of the generated component (the request
convention); docs (Q21). It leaves: CI failing on drift in either half; `types.ts` compiling
unchanged otherwise (all 12 request aliases still resolve; response types are still hand-written).

⚖️ Strongest argument against: aliasing `SetPasswordRequest` is not strictly "regenerate + check".
It is one line that brings the type under the check the step introduces, following the recorded
request-type convention.

✅ Decision: as above. Unblocks Q10, Q12.

---

❓ **Q10** - **The money schema stated once: does `replaceWithSchema(BigDecimal)` work here, and
which of the 22 annotations can go?**

🔎 Facts:
- 33 `@Schema(` in 18 files under `backend/src/main` (grep): 22 are `@Schema(type = "string",
  format = "decimal", example = "243.5000")` on `BigDecimal` components (`BackupFile` ×3,
  `BudgetResponse`, `BudgetStatusResponse` ×2, `BudgetSummary`, `CategoryMonthlyCost`,
  `CategoryTotal`, `CreateBudgetRequest`, `CurrencyAmount`, `SubscriptionRequest`,
  `SubscriptionResponse` ×2, `TransactionRequest`, `TransactionResponse`, `TransactionSummary` ×3,
  `UpcomingRenewal`, `UpdateBudgetRequest`, `UpdateSubscriptionRequest`); 8 are `nullable = true`
  (all on request types); 3 are `hidden = true` (`UpdateCategoryRequest.java:49,66,83`).
- springdoc 3.1.1: `SpringDocUtils.replaceWithSchema(Class, Schema)` exists and delegates to
  `AdditionalModelsConverter.replaceWithSchema`, a static map (`javap`).
  `AdditionalModelsConverter.resolve` constructs the Jackson 2 `JavaType` of the type being
  resolved, looks its raw class up in that map and, on a hit, returns a JSON clone of the
  replacement (after `SpringDocUtils.handleSchemaTypes` under OpenAPI 3.1) without consulting the
  rest of the chain (`javap -c`).
- The converter is a springdoc bean (`SpringDocConfiguration.additionalModelsConverter`),
  registered by `ModelConverterRegistrar` into `ModelConverters.getInstance(openapi31)`, and
  `ModelConverters.addConverter` inserts at index 0 — ahead of swagger-core's `ModelResolver`
  (`javap -c`). `ModelResolver` resolves each bean property through
  `ModelConverterContext.resolve` (many call sites in `resolve`, `javap -c`), i.e. through the
  chain head.
- swagger-core applies `@DecimalMin`/`@DecimalMax` only to number schemas
  (`ValidationAnnotationsUtils.applyDecimalMinConstraint` starts with `isNumberSchema`), so the
  money request fields carry no `minimum` today and will carry none afterwards.
- A `BigDecimal` the replacement misses would be emitted by `PrimitiveType` as a bare `number`
  (no format); `double` is `number`/`double` (`percentUsed`, `BudgetStatusResponse.java:21`).
- `ArchitectureTest.noJackson2Databind` inspects app code only; `replaceWithSchema(Class, Schema)`
  and `io.swagger.v3.oas.models.media.*` expose no Jackson 2 databind type.

➡️ Register the money schema once in `OpenApiConfig` — `BigDecimal` → `{type: string, format:
decimal, example: "243.5000"}` through springdoc's `SpringDocUtils` configuration, from a static
initializer (springdoc's documented idiom; it runs before any document is generated) — then delete
all 22 annotations. Do it as two commits inside the step: add the registration (committed document
unchanged), then delete the annotations (document still unchanged). Add a test that no property
anywhere in the served document is a bare `number` (Q16). The 8 `nullable` and 3 `hidden`
annotations stay.

⚖️ Strongest argument against: a static, JVM-global registry is unusual-looking Spring code for a
learner, and a `ModelConverter` bean would be more "Spring-shaped". It would also be ~30 lines of
converter code where springdoc offers one documented call.

✅ Decision: global replacement + 22 deletions + invariant test, proven by an unchanged committed
document. Verified in bytecode, not by execution — the unchanged document in both commits is the
runtime proof; if it changes, stop. Unblocks Q11.

---

❓ **Q11** - **What can candidate 4 (G2, one home per value rule) assume about the schema?**

🔎 Facts:
- swagger-core 2.2.55 maps `NotNull`/`NonNull`/`NotBlank`/`NotEmpty` to `required` by simple
  name (`ModelResolver.NOT_NULL_ANNOTATIONS`, static initializer), and `Pattern`, `Size`, `Email`,
  `Min`/`Max`, `DecimalMin`/`DecimalMax` (numbers only) into schema keywords
  (`ValidationAnnotationsUtils`).
- Both of `ModelResolver`'s bean-validation paths call
  `ValidationAnnotationsUtils.expandValidationMetaAnnotations` first, which walks each annotation
  type's own annotations breadth-first and collects `jakarta.validation.constraints.*`
  meta-annotations (honouring `@OverridesAttribute` via `findOverrides`) — so a composed
  constraint keeps `required`, `pattern` and `maxLength` in the document (`javap -c`).
- Colour today: `CreateCategoryRequest.color` has `@Pattern("^#[0-9a-f]{6}$")` (so a `pattern`
  appears in the document); `UpdateCategoryRequest` validates colour in an `@JsonIgnore
  @AssertTrue isColorValid()` (`UpdateCategoryRequest.java:101–106`), so its `color` has no
  `pattern` in the document.

➡️ Statement for G2: after step 2, no value-rule module needs any `@Schema`: money's document
schema is keyed by the Java type that carries money on the wire, in one place in `OpenApiConfig`
(today `BigDecimal`; a new money wire type is registered there, never per field). Composed
constraints keep their schema effects. A pure refactor of value rules must leave
`docs/openapi.json` unchanged; an intended change (for example colour gaining a `pattern` on the
PATCH body when its rule moves into one module) shows up as a reviewable diff.

⚖️ Strongest argument against: G2 might introduce a money value type whose Jackson 2 introspection
differs; the snapshot catches it, and the registration point is named.

✅ Decision: recorded for G2; recommend step 2 lands before candidate 4. Unblocks Q24.

---

❓ **Q12** - **The Plan and result shapes: what should the document say instead of Jackson
internals?**: Options: (a) leave the `JsonNode` bean dump; (b) a free-form JSON object
(`type: object`, `additionalProperties: true`); (c) a hand-written JSON Schema of the Plan DSL in
the document; (d) an empty schema (any JSON value).

🔎 Facts:
- `dto/InsightRequest.java:20–24` and `dto/InsightResponse.java:10–11` type `plan` and `viz` as
  Jackson 3 `tools.jackson.databind.JsonNode`; `InsightController.execute` takes and returns
  `JsonNode` (`controller/InsightController.java:42–45`). swagger-core's Jackson 2 resolver does
  not know the Jackson 3 type and introspects it as a bean: `schema.d.ts:530–566` lists
  `container`, `nodeType`, `bigDecimal`, … — none of which appear on the wire.
- The backend only checks that a plan is a JSON object (`InsightService.requirePlanObject`,
  `service/InsightService.java:108–109`; `docs/API.md:1456–1462`: "one validator, one source of
  truth"). `viz` is "object or null", stored and returned verbatim (`docs/API.md:1481`). The
  execute response is the executor's envelope "passed through verbatim" (`:1464`).
- openapi-typescript renders `{type: object}` with no properties as `Record<string, never>`
  unless `--empty-objects-unknown`, and `additionalProperties: true` as `{ [key: string]:
  unknown }` (`dist/transform/schema-object.mjs:174–178, 427–437`); `nullable`/`"null"` in
  `type` adds `| null` (`:62, :181`).
- The frontend's Plan and result types are hand-written and cite `docs/INSIGHTS.md`
  (`types.ts:255–364`).

➡️ (b), registered like money: `tools.jackson.databind.JsonNode` → `{type: object,
additionalProperties: true}` with a description pointing to docs/API.md → Insights for what the
object holds; `viz` marked `@Schema(nullable = true)` on both `InsightRequest` and
`InsightResponse`. The frontend's `Plan`, `Viz`, `ResultEnvelope` and the result-shape types stay
hand-written.

⚖️ Strongest argument against: (c) would make the plan's structure checkable in the frontend. It
would also be a second statement of the DSL beside the executor's validator — the drift docs/API.md
rules out.

✅ Decision: (b) in its own step (step 3), before the `required` rule (Q13 depends on it).
Unblocks Q13, Q17.

---

## Round 4 — required, nullable, media type, and the tests that state the rules

❓ **Q13** - **How do response fields become required: a global customiser or annotations on
records?**: Options: (a) `@Schema(requiredMode = REQUIRED)` on every response component;
(b) `@NotNull` on response components; (c) one `OpenApiCustomizer` that marks every property of
every schema reachable from a success response as required; (d) openapi-typescript's
`--properties-required-by-default`.

🔎 Facts:
- Response records carry no Bean Validation, so every response property is optional in the
  document (`schema.d.ts` `TransactionResponse`, `:448–468`); recorded in `feabb01`: aliasing one
  response type "cascades into ~25 possibly-undefined errors across 3 screens".
- Counted response record components (all response records, nested ones included): about 158. Option
  (a) is ~158 annotations, and forgetting one on a new field silently makes it optional again.
- (b) misuses Bean Validation (it is never run on responses) and would read as a validation rule.
- (d) exists (`bin/cli.js:28`) but applies to every schema, including request bodies — it would
  make `UpdateCategoryRequest`'s fields required, contradicting PATCH semantics — and it fixes the
  TypeScript, not the document.
- Jackson writes every record component, `null` included: no `default-property-inclusion` is set
  anywhere in the backend (grep), and tests assert present-and-null keys with `jsonPath(...)
  .value(nullValue())` (`TransactionControllerTest.java:291, 720`), which spring-test 7.0.8 only
  passes when the key exists (`JsonPathExpectationsHelper.evaluateJsonPath` rethrows a missing
  path; default `Configuration`, `javap -c`).
- `springdoc`'s `OpenApiCustomizer` (`customise(OpenAPI)`) is the documented post-processing
  hook; it exposes no Jackson 2 types.
- Request and response component sets: today they share exactly one component, `JsonNode`
  (referenced by `InsightRequest`, the execute request body and `InsightResponse`); after Q12 it
  is inline, and the request bodies (16 request records, all flat) reference no response
  component (read from `schema.d.ts` `requestBody` entries and the DTO sources).
- `CategoryNode.children` is a list of `CategoryNode` (`dto/CategoryNode.java:9`).

➡️ (c). One `OpenApiCustomizer` bean in `OpenApiConfig`: from every operation's success (2xx)
responses, follow `$ref`s through properties, array items and schema-valued
`additionalProperties`, with a visited set (`CategoryNode` refers to itself), and set each reached
component's `required` to all its property names in property order. Request schemas are left to
Bean Validation.

⚖️ Strongest argument against: a customiser is logic hidden behind configuration, and a reader of
a record cannot see "required" on it. The rule is one sentence ("a success body always contains
every field"), it is true by construction of Jackson's default inclusion, and it is stated in
ARCHITECTURE.md §3 and asserted by name in a test.

✅ Decision: (c), landing after step 3 (hard dependency: with `JsonNode` still a shared component,
the walk would mark its bean-dump properties required on a schema that request bodies use too).
Unblocks Q14–Q16.

---

❓ **Q14** - **Which response fields are nullable, and how are they marked?**: Options: (a) the
existing `@Schema(nullable = true)` convention; (b) any declaration annotation named `Nullable`
(swagger-core matches by simple name); (c) JSpecify `@Nullable`.

🔎 Facts:
- `ModelResolver.resolveNullable` returns true for `@Schema(nullable = true)` or for any annotation
  whose simple name is in `NULLABLE_ANNOTATIONS` = `["Nullable"]` (`javap -c`). JSpecify's
  `@Nullable` is a type-use annotation, not seen among declaration annotations; springdoc 3.1.1 has
  no JSpecify support (no `jspecify` string in its classes; only Kotlin nullability customisers).
- Nullable sources: entity fields without `nullable = false` — `Transaction.description`,
  `merchant`, `subscription` (`model/Transaction.java:45–57`); `Category.parent`, `color`
  (`model/Category.java:22–34`); `Subscription.notes` (`model/Subscription.java:56`);
  `Insight.viz` (`model/Insight.java:36`); plus `SessionResponse.activeProfileId`, `null` until a
  profile is chosen (`docs/API.md:327–334`). `MerchantSuggestion.description` is never null (the
  query filters `description IS NOT NULL`, `repository/TransactionRepository.java:75–86`).
- The export response `BackupFile` mirrors those columns in `CategoryData(parentRef, color)`,
  `SubscriptionData(notes)`, `TransactionData(subscriptionRef, description, merchant)`
  (`dto/BackupFile.java:35–62`).

➡️ (a), matching the 8 existing request markers. The 14 nullable response components:
`TransactionResponse.description`, `.merchant`, `.subscriptionId`; `CategoryNode.parentId`,
`.color`; `SessionResponse.activeProfileId`; `SubscriptionResponse.notes`; `InsightResponse.viz`
(step 3); `BackupFile.CategoryData.parentRef`, `.color`; `BackupFile.SubscriptionData.notes`;
`BackupFile.TransactionData.subscriptionRef`, `.description`, `.merchant`. Plus the request
`InsightRequest.viz` (step 3).

⚖️ Strongest argument against: (b) with `jakarta.annotation.Nullable` would also document nullness
to Java readers and IDEs. It introduces a second convention beside the existing one for no
behavioural gain.

✅ Decision: `@Schema(nullable = true)`, 15 new markers (2 in step 3, 13 in step 4). After all steps
the DTOs carry 26 `@Schema` annotations instead of 33 — each one a fact the Java type cannot
express. Unblocks Q16, Q17.

---

❓ **Q15** - **Responses are documented as `*/*`: change it?**

🔎 Facts: every operation's response content key is `'*/*'` (`schema.d.ts`, e.g. `operations.get`),
because no controller declares `produces` and springdoc's default produces media type is `*/*`;
`springdoc.default-produces-media-type` exists in 3.1.1 (metadata). The API only produces JSON
(the Jackson 2 YAML converter is removed, `JacksonConfig.java:38–53`). Nothing indexes response
content today; candidate 8's msw handlers may type from `paths`.

➡️ Set `springdoc.default-produces-media-type=application/json` in step 4, with the other response
accuracy changes.

⚖️ Strongest argument against: no current consumer. It is one property that makes the document
say what the server does, and it is cheapest to take with the step that regenerates every response.

✅ Decision: in step 4.

---

❓ **Q16** - **How are the rules tested (test-first)?**

🔎 Facts: CLAUDE.md asks for a failing test first for real logic; the customiser is real logic;
the money and JSON-object rules are configuration whose effect is observable only in the served
document. Prior art for asserting a framework-assembled artefact instead of code:
`HttpMessageConverterTest` (asserts the converter list, `:33–56`).

➡️ One test class, `OpenApiDocumentTest`, at the served document, growing per step:
1. step 1 — the served document equals the committed one (red first: no committed file yet);
2. step 2 — no property anywhere in the document is a bare `number` (money is never a number);
   written first and green against the annotated code, it guards the annotation deletions;
3. step 3 — no schema named `JsonNode`; `plan`, `viz` and the execute bodies are free-form
   objects; `viz` may be `null` (red first);
4. step 4 — every property of `TransactionResponse` is required, `description`/`merchant`/
   `subscriptionId` are nullable and `amount` is not; every property of `CategoryNode` is required,
   `parentId`/`color` nullable, `children` an array of `CategoryNode` (the self-reference);
   `SessionResponse.activeProfileId` nullable; `TransactionRequest`'s required list is exactly its
   Bean Validation set (`categoryId`, `amount`, `currency`, `type`, `occurredOn`); response content
   is `application/json` (red first).
The equality test pins everything else.

⚖️ Strongest argument against: the equality test already fails on any change, so the named
assertions look redundant. They are what survives a contributor regenerating the committed file
without reading it, and they state the rules as requirements rather than as "same as before".

✅ Decision: as listed. Unblocks Q22.

---

## Round 5 — deriving response types, typed call sites, exposure, recorded residuals

❓ **Q17** - **Deriving response types: all 45 at once or resource by resource, and what happens to
the six names that differ?**

🔎 Facts:
- `types.ts` exports 57 types: 12 aliases of request components, 45 hand-written (read in full).
  The 45 are: 23 response types, 4 enums (`AuthMode`, `TxnType`, `BillingPeriod`,
  `SubscriptionStatus`), `SetPasswordRequest` (aliased in step 1), `TransactionQuery` (query
  parameters), `Insight` and `InsightRequest`, and 14 Plan-DSL and result-shape types.
- Names that differ from the backend records: `TransactionSummaryRow`/`TransactionSummary`,
  `SubscriptionCategoryCost`/`CategoryMonthlyCost`, `RestoredProfileSummary`/`RestoredProfile`,
  `RestoreBackupResponse`/`BackupRestoreResponse`, `Insight`/`InsightResponse`,
  `Page<T>`/`PageResponseTransactionResponse`. Uses outside `types.ts`: 1–2 files each
  (`hooks/transactions.ts:14,24,51`, `hooks/profiles.ts:8,108`, `screens/ProfilePicker.tsx:13,58`).
- Reuse mismatches the derivation will correct: the session user is typed as `UserResponse` with
  an optional `createdAt` (`types.ts:6–11,28`) but is `SessionUser` without `createdAt` on the
  wire (`dto/SessionResponse.java:15`); `BudgetStatusResponse.budget` is typed `BudgetResponse`
  (`types.ts:167`) but is `BudgetSummary` on the wire (`dto/BudgetStatusResponse.java:13`).
- Frontend tests mock `../api/hooks` wholesale and import only `AuthMode` from `types.ts`
  (`SetPassword.test.tsx:6`, `Nav.test.tsx:3`).
- Candidate 11 (G2) may change how the transaction filter is bound, i.e. the query parameters.

➡️ Resource by resource (auth and profiles with backup; categories; transactions; budgets;
subscriptions; insights), one commit each, each green on `npm run build`, `npm test`, `npm run
lint`. Derived types take the backend record's name (so one name travels from Java to TypeScript):
`TransactionSummary`, `CategoryMonthlyCost`, `RestoredProfile`, `BackupRestoreResponse`; `Page<T>`
becomes `TransactionPage`, an alias of `PageResponseTransactionResponse` (a generated
concatenation, not a name to spread). Enums become indexed-access aliases on the response that
carries them, keeping their frontend names. `Insight` and `InsightRequest` keep their names and are
the generated types with `plan`/`viz` overridden by the hand-written `Plan`/`Viz`. Hand-written
afterwards: `TransactionQuery` and the 14 Plan/result types.

⚖️ Strongest argument against: aliasing the old frontend names (for example `TransactionSummaryRow
= components[...]['TransactionSummary']`) would touch no screen. It would keep two names for one
wire concept; the renames touch one or two files each.

✅ Decision: as above; step 5, after step 4. Unblocks Q24.

---

❓ **Q18** - **Should the 42 call sites be typed against `paths`/`operations`?**

🔎 Facts: 42 call sites pair URL, method and response type by hand (`api<T>(url)`: 40 generic
calls, one nested `api<Page<TransactionResponse>>`, one `apiDownload`; grep of `hooks/*`). The
operationIds are method-name based with renumbered suffixes (Q5). Typing call sites means a typed
client (for example `openapi-fetch`) or a generic wrapper over `paths` in `client.ts`, which
candidate 2 (G3) and candidate 8 (G4) also shape.

➡️ Not in this candidate. A later candidate may type call sites against `paths` (stable keys);
nothing may ever index `operations` (unstable keys).

⚖️ Strongest argument against: a URL typed with the wrong response type stays possible. The
derived response types remove most of the value such a mismatch could hide; the remaining risk is
small and the fix touches modules two sibling groups are redesigning.

✅ Decision: out of scope, recorded.

---

❓ **Q19** - **Anonymous exposure of the document and Swagger UI, and the `.yaml` residual: leave,
fix or restrict?**

🔎 Facts:
- `SecurityConfig.java:78–84` permits `/v3/api-docs/**`, `/swagger-ui/**`, `/swagger-ui.html`.
  `/v3/api-docs/**` does not match the sibling `/v3/api-docs.yaml` (second path segment differs),
  so the YAML falls to `.anyRequest().authenticated()` (`:85–86`) — the known residual.
- In the shipped stack neither is reachable: nginx proxies only `/api/`
  (`frontend/nginx.conf:26–46`), and no compose file publishes the backend port except the e2e
  overlay (`docker-compose.e2e.yml:8–10`; `deploy/release/docker-compose.yml:126–130` publishes
  only the frontend).
- After step 1 the JSON is committed to the (public) repository, so nothing in it is secret.
- `/v3/api-docs.yaml` is written by springdoc itself, not through the MVC converter list
  (`JacksonConfig.java:47–48`).

➡️ Leave the anonymous exposure; fix the residual by adding `/v3/api-docs.yaml` to the same
`permitAll` matcher, with a `SecurityConfigTest` assertion that both the JSON and the YAML are
readable anonymously. A small independent step.

⚖️ Strongest argument against: nobody uses the YAML; leaving it behind login costs nothing. But
the rule's comment says it permits "springdoc's schema", the omission is accidental, and an
inconsistent rule is a trap for the next reader.

✅ Decision: fix in step 6 (independent; may land any time after step 1).

---

❓ **Q20** - **Which inaccuracies stay, knowingly?**

🔎 Facts: Q3 (status codes of eleven `ResponseEntity` handlers; logout absent; no error responses);
the three `hidden = true` flags stay correct as they are.

➡️ Record, do not fix: (1) status codes — the fix is `@ResponseStatus` on eleven handlers or the
`@ResponseStatus void` delete style `BudgetController` uses (`:66–69`), best done by whoever next
types call sites from `paths`; (2) `/api/auth/logout` missing; (3) Problem responses undocumented
(G3's candidate 2 cannot derive a Problem type from the document). docs/API.md states the document
is authoritative for shapes only.

⚖️ Strongest argument against: "the one statement of the wire contract" ships with known holes.
They are named where readers look, and no consumer reads them.

✅ Decision: recorded in the spec's Out of Scope and Further Notes, and told to G4 and G3.

---

## Round 6 — documents, sequence, edge cases, siblings, lessons

❓ **Q21** - **Which documents change, and when?**

🔎 Facts: `ARCHITECTURE.md:194–223` ("OpenAPI schema and the Jackson 2/3 split") and `:343–364`
(CI); `docs/API.md:10–12` ("Status of this document"), `:117–127` (OpenAPI paragraph in Money,
including the manual check "verify a regeneration by checking that every money field reads
`string`"), `:1427–1449` (Insights); `README.md:113–116` and `:172–182` ("Regenerating API
types": "this needs the backend **running**"). No OpenAPI mention in `docs/INSIGHTS.md` or
`docs/SCHEMA.md` (grep).

➡️ Per step, in the same commit: step 1 — ARCHITECTURE.md §3 (section retitled "OpenAPI document
and the Jackson 2/3 split"; generation from the committed document; the drift checks) and §5 (both
CI jobs), docs/API.md "Status of this document" and the OpenAPI paragraph, README; step 2 — the
money sentence in ARCHITECTURE.md §3 and docs/API.md (the manual check is replaced by the test);
step 3 — docs/API.md Insights and ARCHITECTURE.md §3 (opaque JSON objects); step 4 — docs/API.md
and ARCHITECTURE.md §3 (required/nullable rule); step 5 — ARCHITECTURE.md §3 (what stays
hand-written); step 6 — none. The dated maintenance design is not edited; its promise is fulfilled.
Exact text in docs-proposals.md.

⚖️ Strongest argument against: many small doc edits. Each keeps code and record in step; batching
them would leave intermediate commits contradicting the docs.

✅ Decision: as listed.

---

❓ **Q22** - **The order of safe, separately shippable steps.**

🔎 Facts: dependencies found above — step 1 is the proof for step 2 (Q10); step 3 must precede
step 4 (Q13); step 4 must precede step 5 (Q17); step 6 is independent (Q19).

➡️
1. The checked contract: equality test, committed document, writer properties, relative server,
   generation from the file, `check:types`, Prettier ignore, CI line, regenerated types,
   `SetPasswordRequest` alias, docs.
2. Money stated once: invariant test, registration (document unchanged), 22 deletions (document
   unchanged), docs.
3. Opaque JSON stated honestly: failing test, `JsonNode` registration, `viz` nullable (request and
   response), document and types regenerated, docs.
4. Responses exact: failing tests, the customiser, 13 nullable markers, JSON media type, document
   and types regenerated, docs.
5. Response types derived, one resource per commit, docs at the end.
6. The YAML sibling permitted, with its test (any time after 1).

⚖️ Strongest argument against: six steps for "make OpenAPI pay". Each is small, independently
valuable, and leaves the build green; step 1 alone delivers the drift check the card calls the
cheap first step.

✅ Decision: as listed.

---

❓ **Q23** - **Edge cases and failure modes.**

🔎 Facts: as gathered above.

➡️ Concrete scenarios:
1. DTO changed, document not updated → backend job fails with the copy-and-regenerate instruction.
2. Document hand-edited → backend job fails (served ≠ committed).
3. Document updated, types not regenerated, or `schema.d.ts` hand-edited → `check:types` fails.
4. Dependabot bumps springdoc/swagger-core and the output changes → the Dependabot PR fails until
   the maintainer regenerates both files in it (intended: a library upgrade that moves the contract
   is reviewed).
5. Dependabot bumps openapi-typescript and its output format changes → `check:types` fails until
   `schema.d.ts` is regenerated in that PR.
6. An endpoint added → operationId suffixes renumber and `schema.d.ts`'s `operations` block churns;
   harmless because nothing indexes `operations`.
7. `CategoryNode.children` self-reference → the walk's visited set prevents infinite recursion;
   without it every document request would overflow the stack and the equality test would fail.
8. A record later used both as a request body and inside a success response → the customiser would
   mark the request's optional fields required: visible in the document diff and as TypeScript
   errors at call sites. Rule recorded: request and response records are not shared.
9. A future documented error response (Problem Details) → excluded, because the walk starts only
   from 2xx responses.
10. Someone sets a non-default Jackson inclusion (for example omitting nulls) → "required" would
    become untrue; recorded in ARCHITECTURE.md §3 beside the rule.
11. A new money wire type other than `BigDecimal` → documented as an object or number unless
    registered in `OpenApiConfig`; the invariant test catches a bare number, the equality diff shows
    the rest.
12. Windows checkout with CRLF → backend comparison is tree-based (immune); `--check` is byte-based
    and would fail; not an issue for Linux CI or the WSL development machine, and fixable with a
    `.gitattributes` rule if it ever becomes one.
13. Passwordless instance → same controllers, same document; the test runs in the default mode only.
14. Test run from a working directory other than `backend/` → the committed file is not found; the
    failure message names the expected location.
15. Swagger UI "Try it out" for mutating calls → still 403 without a CSRF header, as today (out of
    scope).
16. Lefthook formatting `schema.d.ts` despite the ignore (not verified) → CI `check:types` fails;
    remedy is an exclusion in lefthook's glob.

⚖️ Strongest argument against: scenarios 4–5 add maintenance to dependency bumps. That is the
check doing its job.

✅ Decision: no extra code beyond the visited set and the 2xx filter; the rest are documented
behaviours.

---

❓ **Q24** - **Cross-candidate effects (brief §8).**

🔎 Facts: sibling table (brief §8); evidence in Q11, Q17, Q18, Q20.

➡️
- **Candidate 14 (this group):** changes nothing in the document. If 15.1 lands first, the unchanged
  document is extra proof; both touch `TransactionResponse` (14 adds the factory, 15.2 removes its
  money annotation, 15.4 adds three nullable markers) — textual overlap only.
- **Candidate 4 (G2):** Q11. Recommend 15.1 and 15.2 before 4.
- **Candidate 11 (G2):** the wire contract of `GET /api/transactions`, `/summary`,
  `/category-totals` (and `q` on `/category-counts`) is individual query parameters with today's
  names, types and defaults (`includeDescendants=false`, `page=0`, `size=50`;
  `TransactionController.java:51–92`). Binding them to a record must keep the document's parameter
  lists identical; springdoc 3.1.1 offers `@ParameterObject` (class present in the jar) and
  `springdoc.default-flat-param-object` (metadata) — which one flattens a bound record exactly as
  today is not verified. The frontend's `TransactionQuery` stays hand-written. Recommend 15.1
  before 11.
- **Candidate 8 (G4):** until step 4, `components['schemas']` response types are all-optional —
  type fixtures with `types.ts` exports, not `components[...]` directly. After step 5, six names
  change (above) and `Page<T>` becomes `TransactionPage`. Status codes in the document are not
  authoritative (creates say 200, `ResponseEntity<Void>` deletes say 200) — take statuses from
  docs/API.md. Errors are not in the document. `paths` keys are stable, `operations` keys are not.
  Response content is keyed `application/json` after step 4 (`*/*` before). Recommend G4's typed
  fixtures after 15.4, ideally 15.5.
- **Candidates 1 and 6 (G1):** refactors of `ActiveProfile` and `AuthController` must leave the
  document unchanged — the equality test is their wire-equivalence check once 15.1 has landed.
- **Candidates 2 and 5 (G3):** 2 cannot derive the Problem type from the document; 5 keeps using
  the derived request types (`amount` is `string`), which no step of 15 changes.
- **Candidate 13 (G5):** replacing Redis changes the shared test context but not the document.
- **Candidate 17 (G8):** `openapi-typescript` is used (`generate:types`, `check:types`) and must not
  be removed as unused tooling.

⚖️ Strongest argument against: none beyond the sequencing cost.

✅ Decision: recorded under "Depends on", "Out of Scope" and "Further Notes"; recommended order:
15.1 → (14 any time) → 15.2 → G2's 4 and 11 → 15.3 → 15.4 → 15.5 → G4's typed fixtures; 15.6 any
time after 15.1.

---

❓ **Q25** - **Which lessons does the change teach (docs/LESSONS.md)?**

🔎 Facts: existing entries "A schema generator can be blind to the exact rule it's supposed to
describe" (`docs/LESSONS.md:2532`) and "OpenAPI's `required` is a Bean Validation artifact, not a
nullability one" (`:2557`); the first's "Where" says every `BigDecimal` field carries `@Schema`
(becomes stale in step 2).

➡️ Three new entries: step 1 — a golden-file (approval) test for a generated artefact; step 2 — one
global type-to-schema mapping instead of per-field annotations (and why a static initializer),
referencing the "blind generator" entry; step 4 — `required` means present, `nullable` means may be
null: two axes, and why every response field is required, referencing and resolving the
"`required` is a Bean Validation artifact" entry. No entry for steps 3, 5, 6 (same patterns).

⚖️ Strongest argument against: three entries for one candidate. Each teaches a distinct concept
the owner meets here for the first time.

✅ Decision: as listed.

---

Frontier after Round 6: empty. The ten questions on the card are settled (Q4/Q6 artefact and
update procedure, Q8 frontend generation and CI, Q13–Q14 required and nullable, Q10–Q11 money,
Q12 Plan, Q17 derivation and names, Q18 `paths`/`operations`, Q19 exposure, Q21 documents, Q22
order), plus constraints, dependency categories, seams, determinism, edge cases, siblings and
lessons.

---

## Decisions (one-page summary)

1. **Scope of authority.** The OpenAPI document becomes the checked statement of request and
   response *shapes*; docs/API.md keeps status codes, error shapes and reasoning, and says so.
2. **Checked artefact.** Committed as `docs/openapi.json`, beside `docs/API.md`. `OpenApiDocumentTest`
   (`@IntegrationTest`, shared context) fetches `/v3/api-docs` anonymously through MockMvc and
   compares JSON trees with the committed file; it always writes the served copy to
   `backend/target/openapi.json` and, on mismatch, fails with "copy it over, then `npm run
   generate:types`". No update mode; `./mvnw verify` stays the single backend command.
3. **Determinism.** `springdoc.writer-with-order-by-keys=true`,
   `springdoc.writer-with-default-pretty-printer=true`, and a relative server `/` on the `OpenAPI`
   bean (verified: declared servers suppress the request-derived URL; handler order is a `TreeMap`).
4. **Frontend.** `generate:types` reads `../docs/openapi.json`; `check:types` adds
   openapi-typescript's `--check` (byte comparison); `schema.d.ts` is Prettier-ignored so it is the
   raw generator output; the CI frontend job runs `check:types`.
5. **Step 1 ships alone:** both drift checks, regenerated types (`authMode`, `/api/auth/password`,
   `SetPasswordRequest`), `SetPasswordRequest` aliased, docs.
6. **Money once.** `BigDecimal` → `{string, decimal, example}` registered once in `OpenApiConfig`
   (springdoc `replaceWithSchema`, static initializer); 22 annotations deleted; proven by an
   unchanged document; a test forbids any bare `number` in the document.
7. **Plan and viz.** Jackson 3 `JsonNode` → free-form object (`additionalProperties: true`); `viz`
   nullable; Plan DSL and result shapes stay hand-written in the frontend. Lands before the
   `required` rule.
8. **Responses exact.** One `OpenApiCustomizer` marks every property of every schema reachable from
   a 2xx response as required (visited set; request schemas untouched); 14 nullable response fields
   (+ `InsightRequest.viz`) marked with the existing `@Schema(nullable = true)` convention;
   responses documented as `application/json`. Tests assert the rule by name, test-first.
9. **Derivation.** Resource by resource; derived types take the backend record names
   (`TransactionSummary`, `CategoryMonthlyCost`, `RestoredProfile`, `BackupRestoreResponse`,
   `TransactionPage`); `Insight`/`InsightRequest` override `plan`/`viz`; `TransactionQuery` and the
   14 Plan/result types stay hand-written. `paths`/`operations` typing is a later candidate; never
   index `operations`.
10. **Exposure.** Anonymous JSON and Swagger UI stay (unpublished in the shipped stack; the JSON is
    public in the repo); the `.yaml` sibling is permitted too (step 6).

**Order:** 15.1 → 15.2 → 15.3 → 15.4 → 15.5; 15.6 any time after 15.1. Siblings: 15.1 (and 15.2)
before G2's 4 and 11; G4's typed fixtures after 15.4/15.5; 14 any time.

**Facts not verified by execution (read in bytecode or source only):**
- That `replaceWithSchema(BigDecimal)` and `replaceWithSchema(JsonNode)` take effect for record
  properties at runtime (converter at the chain head, properties resolved through the context —
  read in `javap`); the unchanged document in step 2 is the runtime proof.
- That `@Schema(nullable = true)` composes with a replaced object schema under OpenAPI 3.1 to give
  `["object","null"]`.
- That `springdoc.default-produces-media-type=application/json` replaces `*/*` for every operation.
- That Prettier 3 skips an explicitly passed, ignored file (lefthook).
- That `/v3/api-docs.yaml` answers 401 anonymously today (inferred from the matcher).
- Which of `@ParameterObject` / `default-flat-param-object` keeps candidate 11's parameters identical.
- The exact content of the regenerated `schema.d.ts` (no backend was run).
