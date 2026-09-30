# Candidate 15 — documentation proposals

Line numbers are from `dev` at `c3e20c5` (identical tree to `4545810`). Each update lands in the same
commit as the step named.

## (a) Proposed glossary terms

One term. It is project vocabulary rather than a finance-domain term: if the glossary holds only
domain terms, put it with the architecture vocabulary ("HTTP interface", "wire contract") instead.

```md
**OpenAPI document**:
The committed, generated description of the backend's HTTP interface — its paths and the shape of
every request and response body — checked against the running code on every build; the
machine-checked statement of the wire contract, kept beside the human-written API design.
_Avoid_: OpenAPI schema, API schema, spec, swagger, api-docs, contract file
```

Why pick it: "schema" already means the database schema (docs/SCHEMA.md) and, inside the document,
the `components.schemas` entries; ARCHITECTURE.md's current heading "OpenAPI schema" invites the
collision. "OpenAPI document" is the OpenAPI Specification's own name for the whole file.

## (b) Proposed ADRs

None. The two decisions that could qualify — the committed OpenAPI document as the CI-checked
statement of shapes, and one customiser making every success-response field required — amend
ARCHITECTURE.md §3 "OpenAPI schema and the Jackson 2/3 split". Per the repo rule the amendment is
made in that section (below), not in a separate ADR.

## (c) Required updates to recorded-decision documents

### ARCHITECTURE.md

**§2 "High-level structure", the tree (line 28)** — step 1.
Now: `├── docs/        architecture notes, schema diagrams`
After: `├── docs/        architecture notes, API and schema design, the committed OpenAPI document`

**§3 "OpenAPI schema and the Jackson 2/3 split" (lines 194–223)**

*Step 1.* Retitle to **"OpenAPI document and the Jackson 2/3 split"**. Replace the first sentence of
the first paragraph ("springdoc … serves the OpenAPI schema at `/v3/api-docs` … are generated from
that schema.") with:

> springdoc (`org.springdoc:springdoc-openapi-starter-webmvc-ui`) serves the OpenAPI document at
> `/v3/api-docs` and Swagger UI at `/swagger-ui.html` (`OpenApiConfig`). The document is committed as
> `docs/openapi.json` and is the checked statement of the API's request and response shapes:
> `OpenApiDocumentTest` fetches the served document through MockMvc and fails `./mvnw verify` when it
> differs from the committed copy, and the frontend generates `frontend/src/api/schema.d.ts` from
> that copy (`npm run generate:types`, no running backend needed), with `npm run check:types`
> failing CI when the generated file is stale. A wire-contract change therefore cannot land without
> appearing as a diff of both files. springdoc writes the document with sorted keys and a fixed
> relative server, so that diff contains only the change. Status codes and error shapes are not
> taken from the document; `docs/API.md` stays authoritative for them.

The rest of the paragraph (the Jackson 2 pass being blind to the Jackson 3 `BigDecimal` customizer,
the `@Schema` correction, the ArchUnit ban) stays until step 2. The second paragraph (the Hibernate
`json_format_mapper` pin) does not change in any step.

*Step 2.* Replace "Response and request DTOs with a `BigDecimal` field carry an explicit
`@Schema(type = "string", format = "decimal", ...)` (from `io.swagger.v3.oas.annotations.media.Schema`)
to correct this;" with:

> `OpenApiConfig` corrects this once, for every field: it registers `BigDecimal` with springdoc as
> `{type: string, format: decimal}` (`SpringDocUtils.replaceWithSchema`), and `OpenApiDocumentTest`
> fails if any property in the document is a bare `number`;

*Step 3.* Add after the first paragraph:

> The same registration documents Jackson 3 `JsonNode` values — an insight's `plan` and `viz`, and
> both bodies of `POST /api/insights/execute` — as free-form JSON objects. Their structure belongs to
> the plan executor (`docs/INSIGHTS.md`); the backend only checks that a plan is an object. That is
> why the frontend's Plan and result-shape types are written by hand rather than generated.

*Step 4.* Add a paragraph:

> In the document every property of a success-response body is **required** — Jackson writes every
> record component, `null`s included, so a response field is always present — and a field that can
> be `null` says so with `@Schema(nullable = true)`. One `OpenApiCustomizer` in `OpenApiConfig`
> applies this to every schema reachable from a 2xx response, so no response record carries a
> "required" annotation; request schemas keep the required list Bean Validation gives them, because
> an absent request field is legitimate (the category `PATCH` depends on it). Two consequences: a
> record must not serve both as a request body and inside a response body, and configuring Jackson
> to omit `null`s would make the document untrue.

*Step 5.* Add a sentence to the step-4 paragraph:

> The frontend's request and response types (`frontend/src/api/types.ts`) are aliases of the
> generated ones and carry the backend record names; only the Plan DSL and result shapes, and the
> transaction list's query parameters, are written by hand.

**§5 "CI/CD (GitHub Actions)" (lines 343–364)** — step 1.

Backend bullet, after:
> *backend* — `./mvnw -B verify`: unit, integration (real Postgres via Testcontainers, using the
> runner's own Docker daemon) and ArchUnit tests — among them `OpenApiDocumentTest`, which fails when
> the committed OpenAPI document (`docs/openapi.json`) no longer matches what the code serves — plus
> Spotless formatting, which is bound to the `verify` phase rather than run as a separate step.

Frontend bullet, after:
> *frontend* — ESLint, Prettier `--check`, the generated-types check (`npm run check:types`:
> `schema.d.ts` regenerated from `docs/openapi.json` must equal the committed file), vitest, the
> production build, and the Storybook build.

"CI runs the same commands a developer runs locally" stays true and unchanged.

### docs/API.md

**"Status of this document" (lines 10–12)** — step 1. Append:

> The machine-checked statement of request and response **shapes** is [`openapi.json`](./openapi.json),
> generated from the code and compared with it on every build (see
> [OpenAPI document](#openapi-document)). It is authoritative for field names, types, formats, which
> fields are always present and which may be `null`. This file stays authoritative for status codes,
> error shapes and the reasoning — the generated document's status codes are not reliable (handlers
> that return `ResponseEntity` are documented as `200`), and error responses are not in it. Where
> this file and `openapi.json` disagree on a shape, this file is wrong and is corrected in the same
> change.

**"Money: decimal string + ISO 4217 code", the paragraph "OpenAPI schema." (lines 117–127)** —
step 1: move it out of Money into a new cross-cutting subsection **"### OpenAPI document"** placed
after "Naming" (line 142–146), and leave in Money one sentence: "The OpenAPI document states money
the same way — see [OpenAPI document](#openapi-document)." The new subsection, after step 1:

> ### OpenAPI document
>
> springdoc serves the document at `/v3/api-docs` (`config/OpenApiConfig`) by introspecting DTOs
> through its own Jackson 2 pass, which is blind to `JacksonConfig`'s Jackson 3 `STRING`-shape
> customizer — left alone, every `BigDecimal` field would be schema'd as a plain `number`,
> contradicting [Money](#money-decimal-string--iso-4217-code). Every money field on every
> request/response DTO carries an explicit `@Schema(type = "string", format = "decimal",
> example = "243.5000")` to correct this.
>
> A copy is committed as `docs/openapi.json`. `OpenApiDocumentTest` fails the build when the served
> document differs from it and writes the served one to `backend/target/openapi.json` for review; the
> frontend's `frontend/src/api/schema.d.ts` is generated from the committed copy
> (`npm run generate:types`, no backend needed), and `npm run check:types` fails CI when it is stale.
> Verify a regeneration by checking that every money field reads `string`, never `number`.

Step 2: replace "Every money field on every request/response DTO carries an explicit `@Schema(…)` to
correct this." with "`OpenApiConfig` corrects this once: every `BigDecimal`, wherever it appears, is
documented as `type: string, format: decimal`." and replace the last sentence ("Verify a
regeneration …") with "`OpenApiDocumentTest` fails if any property in the document is a bare
`number`, so a money field can never be documented as a JSON number."

Step 4: append:

> Every field of a success response is **required** in the document — always present, since every
> record component is written, `null`s included — and a field that can be `null` is marked nullable
> (`description`, `merchant` and `subscriptionId` on a transaction, a category's `parentId` and
> `color`, the session's `activeProfileId`, a subscription's `notes`, an insight's `viz`, and the
> matching backup-file fields). A request field is required only where Bean Validation says so: an
> absent request field is legitimate. Responses are documented as `application/json`.

**"Insights", after the `InsightResponse` example (lines 1435–1449)** — step 3. Add:

> In the OpenAPI document `plan`, `viz` and both bodies of `POST /api/insights/execute` are
> free-form JSON objects: the backend stores and forwards them without reading their structure,
> which [`INSIGHTS.md`](./INSIGHTS.md) defines.

### README.md

**"Backend (development)", the Swagger UI sentence (lines 113–116)** — step 1.
After: "Swagger UI is at `http://localhost:8080/swagger-ui.html` (the raw document at `/v3/api-docs`;
a committed copy lives at `docs/openapi.json`) when the backend is running."

**"Regenerating API types" (lines 172–182)** — step 1. Replace the section with:

> ### Changing the API contract
>
> The backend's OpenAPI document is committed as `docs/openapi.json`, and
> `frontend/src/api/schema.d.ts` is generated from it. Both are generated files — never edit them by
> hand. When a DTO or endpoint changes, `./mvnw verify` fails in `OpenApiDocumentTest` and writes the
> document the code now serves to `backend/target/openapi.json`. Review the difference, then:
>
> ```bash
> cp backend/target/openapi.json docs/openapi.json
> cd frontend && npm run generate:types
> ```
>
> No backend needs to be running. CI runs `npm run check:types`, which fails when `schema.d.ts` is
> stale, so commit both files together with the change.

### Documents that do not change

- `docs/SCHEMA.md`, `docs/INSIGHTS.md`: no mention of OpenAPI (checked); the Plan DSL stays defined
  in INSIGHTS.md.
- `docs/superpowers/specs/2026-09-07-maintenance-run-design.md`: a dated record; its promise
  ("type drift becomes a CI failure", line 131) is fulfilled, not rewritten.
- `CLAUDE.md`: no change required. (Optional, owner's call: its "Read docs/API.md before touching
  controllers, DTOs …" sentence could add "and regenerate docs/openapi.json when the shapes change".)

### docs/LESSONS.md (git-ignored; local only)

Three entries, each after its step:

1. **Step 1 — "A golden-file test for a generated artefact."** *What:* the test regenerates the
   artefact, compares it with a committed copy, and on mismatch fails with instructions and a
   written file to review; the commit diff becomes the review of the contract change. *Where:*
   `OpenApiDocumentTest`, `docs/openapi.json`, the frontend's `check:types`. *Why:* comparing parsed
   JSON trees ignores formatting and line endings while array order still counts; there is no
   "update mode", so changing the contract is always a deliberate copy. Python comparison: snapshot
   testing with `syrupy`, minus its `--snapshot-update` flag.
2. **Step 2 — "One global type-to-schema mapping instead of per-field annotations."** *What:*
   springdoc's `replaceWithSchema` maps a Java type to a schema everywhere it appears, so 22 identical
   annotations become one line. *Where:* `OpenApiConfig`. *Why:* it is a static registry read while
   the document is generated, which is why it sits in a static initializer; the unchanged committed
   document proved the swap. References the existing entry "A schema generator can be blind to the
   exact rule it's supposed to describe" (whose "Where" line this supersedes).
3. **Step 4 — "`required` means present; `nullable` means may be `null`."** *What:* two independent
   axes in OpenAPI and TypeScript (`field?: T` versus `field: T | null`). A record always writes every
   component, so every response field is required, and nullability is stated separately; requests are
   the opposite, since an absent field is legitimate. *Where:* the `OpenApiCustomizer` in
   `OpenApiConfig`, the `nullable` markers on response records. *Why:* resolves the existing entry
   "OpenAPI's `required` is a Bean Validation artifact, not a nullability one" — reference it rather
   than repeat it.

No entry for steps 3, 5 and 6: same patterns (a global mapping; aliasing generated types; a
security matcher).
