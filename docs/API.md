# REST API design

The HTTP contract for the core domain, designed before any controllers exist so the
shape is reviewable independently of the implementation.

Depends on [`SCHEMA.md`](./SCHEMA.md) — every DTO here maps onto the tables settled
there, and the constraints repeated below are the API-layer mirror of the DB
constraints, not new rules.

**Status of this document.** Once controllers exist they are the source of truth for
behavior; this file explains the reasoning behind the shape. Implementation of the
controllers and services is out of scope here (separate ticket per resource).

The machine-checked statement of request and response **shapes** is [`openapi.json`](./openapi.json),
generated from the code and compared with it on every build (see
[OpenAPI document](#openapi-document)). It is authoritative for field names, types, formats, which
fields are always present and which may be `null`. This file stays authoritative for status codes,
error shapes and the reasoning — the generated document's status codes are not reliable (handlers
that return `ResponseEntity` are documented as `200`), and error responses are not in it. Where
this file and `openapi.json` disagree on a shape, this file is wrong and is corrected in the same
change.

Base path: **`/api`**. All request and response bodies are `application/json`;
errors are `application/problem+json`.

---

## Contents

- [Cross-cutting decisions](#cross-cutting-decisions)
- [Errors](#errors)
- [Profiles](#profiles)
- [Categories](#categories)
- [Transactions](#transactions)
- [Budgets](#budgets)
- [Subscriptions](#subscriptions)
- [Backup](#backup)
- [Insights](#insights)
- [Status code summary](#status-code-summary)

---

## Cross-cutting decisions

### Active profile: one header, resolved in one place

An instance has profiles and nothing above them. Which profile a request works in — its
active profile — is named by the request itself, in the **`X-Profile-Id`** header. The
browser remembers which profile the owner chose and sends its id on every request; the
server keeps no record of which profile a browser is working in.

This is the single most important rule in this document. The profile is **never a path
segment, a query parameter or a body field of a profile-scoped request**: there is no
`profileId` in any such body, no `?profileId=`, and no `/profiles/{id}/transactions`
nesting. The header's value is read in exactly one place, `ActiveProfile` (`web/`), which
resolves it once per operation — one primary-key lookup — and hands the profile to the
service. Every repository query is then scoped by that one id. This pairs with the
composite foreign keys in `SCHEMA.md`: the service layer scopes the query, and the schema
makes a cross-profile row unstorable in the first place.

It is a **correctness rule, not a security boundary**. An instance has one owner, who may
open every profile: there is nobody to keep out. What the rule guarantees is that a
request can only ever read or change the profile it names: a row of another profile
answers `404`, whatever id the request carries (see
[Errors](#not-found-and-wrong-profile-access--both-404)).

**No active profile — `409`.** A request to a profile-scoped endpoint whose header is
missing, empty, not a number, or names a profile that does not exist answers
**`409 Conflict`** (`type: /errors/no-active-profile`), reads included. All four are the
same state, and the frontend handles it by showing the profile picker. Not a `404`: the
request did not name the profile as a resource, and the only useful next step for the
client is to choose one. A deleted profile needs no bookkeeping for the same reason — the
next request that names it finds nothing. (A request that changes something and has no
header at all gets the `400` below instead: the filter answers first.)

**Above the profile boundary.** Seven endpoints never read the header's value: the profile
list, create, read, rename and delete ([Profiles](#profiles)), and backup export and
restore ([Backup](#backup)). There a profile is an ordinary resource — an id in the path
of `/api/profiles/{id}`, a list of ids in the export body — and the answer is the same
whatever the header says.

**Every request that changes something must carry the header — `400`.** A request other
than a read (`GET`, `HEAD`, `OPTIONS`) that arrives without the header at all is refused
with **`400`** (`type: /errors/profile-header-missing`) by a servlet filter
(`web/ProfileHeaderFilter`), before any controller runs. This holds on every endpoint,
the ones above the profile boundary included. The filter only asks whether the header is
there: an **empty value is enough**, and it is what a client sends while no profile is
chosen.

**Why the header must be there: CORS stays off.** The frontend and the API are one origin
— nginx proxies `/api` in the stack, the Vite dev server does in development — and the
backend has no CORS configuration. Together with the rule above, that is what stops a
page of another site from changing data through the owner's browser (cross-site request
forgery):

- A cross-origin request that carries a custom header is not sent straight away: the
  browser asks first, with a preflight `OPTIONS`. Spring MVC answers that `OPTIONS` itself
  — with `200` on Spring Framework 7, not with a refusal — but with no CORS configuration
  it adds no `Access-Control-Allow-*` header, and without one the browser never sends the
  request itself.
- A cross-origin request without a custom header needs no preflight: a form can post one,
  and backup restore is a multipart upload, exactly what a form submits. Such a request
  cannot carry `X-Profile-Id`, so the filter refuses it with the `400`.
- Reads pass without the header. They change nothing, and with no CORS headers on the
  answer the other site's page cannot read it.

This is a recorded decision, not an accident of configuration: a CORS configuration, or
an exemption from the header rule, would reopen the hole. `ProfileHeaderFilterTest` pins
both halves — a headerless upload is refused, and a preflight gets no
`Access-Control-Allow-Origin`, `-Methods` or `-Headers`. It asserts the missing headers
rather than the preflight's status, because the missing headers are what a browser acts
on.

**Why a header and not a path segment.** A header keeps every profile-scoped URL as it is
(`/api/transactions`, not `/api/profiles/3/transactions`), and it is the custom header
that makes a cross-origin write need a preflight.

### Money: decimal string + ISO 4217 code

```json
{ "amount": "1234.5000", "currency": "PLN" }
```

`SCHEMA.md` stores money as `NUMERIC(19,4)`, which maps exactly onto Java's
`BigDecimal`. Serializing it as a **JSON string** keeps that exactness end to end: a
JSON *number* is an IEEE-754 double in every JavaScript client, which is precisely the
bug class `NUMERIC` was chosen to avoid — the value would be corrupted after the
backend did everything right.

The ticket suggested minor-unit integers (`123450`). That solves the same problem, but
fits this schema poorly: `NUMERIC(19,4)` holds four decimal places while most
currencies have two, so the API would need a per-currency exponent table to convert,
and any value with sub-minor-unit precision becomes unrepresentable. A decimal string
needs no exponent table and no lossy conversion — it *is* the stored value.

Amounts are serialized at the stored scale (`"1234.5000"`, not `"1234.5"`) so the
representation is stable. Jackson needs
`spring.jackson.write.write-bigdecimal-as-plain=true` to avoid scientific notation on
large values, and a global `JsonMapperBuilderCustomizer` (`config/JacksonConfig`) writes every
`BigDecimal` as a string so no DTO can forget to.

On input, amount strings are parsed to `BigDecimal` and rejected if they carry more
than 4 decimal places — silently rounding someone's money is worse than a `400`.

The amount rule — greater than zero, at most 15 integer and 4 decimal digits, i.e. what
`NUMERIC(19,4)` with `CHECK (> 0)` can hold — is declared once, as the composed constraint
`@MoneyAmount` (built from `@DecimalMin(value = "0", inclusive = false)` and
`@Digits(integer = 15, fraction = 4)`, whose limits come from `Money`). Presence is stated
separately on each field (`@NotNull`). Its violations are the built-ins' own, reported on the field:
"must be greater than 0" and "numeric value out of bounds (<15 digits>.<4 digits> expected)".

An amount sent as a **JSON number** (`"amount": 12.34` instead of `"amount": "12.34"`) is
rejected outright — `400 /errors/invalid-request`, same shape as any other malformed body.
By the time a JS client has a number to serialize it may already be an IEEE-754 rounding
of the value that was typed (`JSON.stringify(0.1 + 0.2)` → `"0.30000000000000004"`), so
accepting it would make the API complicit in precision already lost before the request
was sent. A `StrictStringBigDecimalDeserializer` (`config/JacksonConfig`) enforces this
for every `BigDecimal` field, request-wide.

The OpenAPI document states money the same way — see [OpenAPI document](#openapi-document).

Currency is a 3-letter uppercase ISO 4217 code, validated with `@CurrencyCode` — a composed
`@Pattern(regexp = "^[A-Z]{3}$")` whose message is "must be a 3-letter ISO 4217 code" — mirroring
the DB `CHECK`. Presence is stated separately on each field (`@NotBlank`).

**No currency conversion anywhere in this API.** Per `ARCHITECTURE.md` §3, conversion
would live in the service layer if added later. Until then, endpoints that aggregate
never mix currencies — see [budget status](#get-apibudgetsidstatus).

### Dates

Dates are ISO-8601 `YYYY-MM-DD` strings mapping to `java.time.LocalDate`
(`occurred_on`, `period_start`, `period_end` are all `DATE` in the schema). Timestamps
(`createdAt`) are ISO-8601 instants with offset, mapping to `OffsetDateTime`.

### Naming

JSON fields are `camelCase` (`parentId`, `occurredOn`), mapping to `snake_case`
columns. Spring Boot's default `PropertyNamingStrategy` handles this; DTOs are Java
`record` types per the `dto/` package in `ARCHITECTURE.md` §3.

### OpenAPI document

springdoc serves the document at `/v3/api-docs` (`config/OpenApiConfig`) by introspecting DTOs
through its own Jackson 2 pass, which is blind to `JacksonConfig`'s Jackson 3 `STRING`-shape
customizer — left alone, every `BigDecimal` field would be schema'd as a plain `number`,
contradicting [Money](#money-decimal-string--iso-4217-code). `OpenApiConfig` corrects this once:
every `BigDecimal`, wherever it appears, is documented as `type: string, format: decimal`.

A copy is committed as `docs/openapi.json`. `OpenApiDocumentTest` fails the build when the served
document differs from it and writes the served one to `backend/target/openapi.json` for review; the
frontend's `frontend/src/api/schema.d.ts` is generated from the committed copy
(`npm run generate:types`, no backend needed), and `npm run check:types` fails CI when it is stale.
`OpenApiDocumentTest` fails if any property in the document is a bare `number`, so a money field
can never be documented as a JSON number.

Every field of a success response is **required** in the document — always present, since every
record component is written, `null`s included — and a field that can be `null` is marked nullable
(`description`, `merchant` and `subscriptionId` on a transaction, a category's `parentId` and
`color`, a subscription's `notes`, an insight's `viz`, and the matching backup-file fields). A
request field is required only where Bean Validation says so: an absent request field is
legitimate. Responses are documented as `application/json`.

The value-rule constraints `@MoneyAmount`, `@CurrencyCode` and `@HexColor` are composed from
built-in Bean Validation constraints. springdoc expands a composed constraint's built-ins, so the
document's `required` lists and patterns are the same as if the built-ins were written on the field
(`required` does not even depend on this: presence stays a separate `@NotNull`/`@NotBlank`).

The document does not describe the `X-Profile-Id` header: it is a rule of every request, stated
once in this file ([Active profile](#active-profile-one-header-resolved-in-one-place)), not a
parameter of each operation. The committed copy was regenerated together with that rule.

---

## Errors

**RFC 9457 Problem Details**, which Spring Boot 4 supports natively via
`ProblemDetail` — no bespoke error class needed. A `@RestControllerAdvice` in
`exception/` maps each domain exception to a `ProblemDetail`.

Base shape:

```json
{
  "type": "/errors/category-depth-exceeded",
  "title": "Category depth limit exceeded",
  "status": 422,
  "detail": "Human-readable, safe to show as it is.",
  "instance": "/api/categories/9"
}
```

`type` is a stable machine-readable slug the frontend switches on; `detail` is prose
and may change without notice.

One Problem is written by a servlet filter, before any controller runs, in the same shape but without
`instance`: **`400`** `/errors/profile-header-missing`, below.

### Active profile problems — `409` and `400`

A request to a profile-scoped endpoint that names no existing profile — the `X-Profile-Id` header is
missing, empty, not a number, or names a profile that does not exist — reads included (a request
that changes something and has no header at all gets the `400` further down instead):

```json
{
  "type": "/errors/no-active-profile",
  "title": "No active profile",
  "status": 409,
  "detail": "Name an existing profile in the X-Profile-Id header.",
  "instance": "/api/categories"
}
```

The frontend switches on this `type` to show the profile picker.

A request other than a read (`GET`, `HEAD`, `OPTIONS`) that arrives without the header at all, on
any endpoint:

```json
{
  "type": "/errors/profile-header-missing",
  "title": "Profile header missing",
  "status": 400,
  "detail": "A request that changes something must carry the X-Profile-Id header; its value may be empty."
}
```

This one is the filter's (`web/ProfileHeaderFilter`), so it comes before every other answer the
endpoint could give — a validation failure, a `404`, the `409` above. It applies to every `POST`,
`PUT`, `PATCH` and `DELETE` in this document and is not repeated in the per-endpoint tables. The
reasoning for both is under [Active profile](#active-profile-one-header-resolved-in-one-place).

### Validation failures — `400`

Bean Validation failures on the request body. The field errors ride along as an
extension member:

```json
{
  "type": "/errors/validation-failed",
  "title": "Validation failed",
  "status": 400,
  "detail": "The request body has 2 invalid field(s).",
  "errors": [
    { "field": "amount",   "message": "must be greater than 0" },
    { "field": "currency", "message": "must be a 3-letter ISO 4217 code" }
  ]
}
```

Each error names the body field it concerns — including the value rules `@MoneyAmount`,
`@CurrencyCode` and `@HexColor`, which are composed from built-in constraints and report the
built-ins' messages on the field. A rule that needs code instead — one across several fields, one
about which fields a PATCH body contains, or one that reads the clock or counts bytes — is an
`@AssertTrue` method, so its `field` is a **pseudo-field**: the method's property name rather than a
body field. The complete list:

| Pseudo-field | Endpoint | Belongs to |
|---|---|---|
| `occurredOnNotInFuture` | `POST /api/transactions`, `PUT /api/transactions/{id}` | `occurredOn` |
| `periodValid` | `POST /api/budgets`, `PUT /api/budgets/{id}` | `periodEnd` |
| `anyFieldSet` | `PATCH /api/categories/{id}` | no single field |
| `nameValid` | `PATCH /api/categories/{id}` | `name` |

Adding a pseudo-field is a contract change and is recorded here. The order of `errors` is not
significant.

`400` for a malformed or invalid body; **`422`** is reserved for a body that is
structurally valid but violates a domain rule (depth limit, category cycle,
invalid backup content). The split is worth keeping consistent — a `400`
`validation-failed` tells the frontend which form fields to put messages under;
every other failure is shown as one message for the whole action, next to the
control that triggered it.

### Query parameter problems — `400`

A query parameter that cannot be read — a malformed date, an unknown enum value such as
`type=REFUND`, a non-numeric id, a non-boolean flag — or that breaks a rule of the endpoint answers
`400` with `type: /errors/invalid-request`, title "Invalid request", a `detail` that names the
parameter, and **no** `errors` member:

```json
{
  "type": "/errors/invalid-request",
  "title": "Invalid request",
  "status": 400,
  "detail": "Query parameter 'from' has an invalid value.",
  "instance": "/api/transactions"
}
```

`/errors/validation-failed` and its `errors` list are only for request bodies. Only the first
problem is reported. The transaction filters use these sentences: `Query parameter '<name>' has an
invalid value.`, `'from' must not be after 'to'.`, `'includeDescendants' requires 'categoryId'.`,
`'q' must be at most 100 characters.`, `'page' must be 0 or greater.`, `'size' must be between 1
and 200.` A parameter that cannot be read is reported before the active-profile check (`409`); a
broken rule after it.

### Category depth exceeded — `422`

Called out by the ticket. Returned by `POST /api/categories` and by
`PATCH /api/categories/{id}` when a reparent would push any node past
`MAX_DEPTH = 5` (`SCHEMA.md` → Depth enforcement):

```json
{
  "type": "/errors/category-depth-exceeded",
  "title": "Category depth limit exceeded",
  "status": 422,
  "detail": "Moving 'Vaping' under 'Food' would place its deepest subcategory at level 7. The maximum is 5.",
  "instance": "/api/categories/9",
  "maxDepth": 5,
  "resultingDepth": 7
}
```

`maxDepth` and `resultingDepth` are extension members so the UI can explain the
failure precisely ("this would be 2 levels too deep") without parsing prose. On a
*move*, `resultingDepth` is the depth of the deepest node in the moved subtree after
the move — `depth(newParent) + height(subtree)` — not the depth of the moved node
itself. That distinction is the whole point of the rule; see `SCHEMA.md`.

### Not found, and wrong-profile access — both `404`

**A row belonging to another profile returns `404`**, exactly like a row that does not exist:
in the profile the request names, it doesn't.

This falls out of the implementation naturally: repository queries are scoped to the
active profile, so an out-of-scope id simply returns no row, and "no row" is already
`404`. The correct behavior is the default one, not an extra check that can be forgotten.

```json
{
  "type": "/errors/not-found",
  "title": "Resource not found",
  "status": 404,
  "detail": "No transaction with id 4213."
}
```

A path that matches no endpoint at all (typo'd URL, wrong method prefix) gets the same
shape — `type: /errors/not-found`, `title: "Resource not found"` — rather than the
framework's default "No static resource ..." wording, which carries no `type` and leaks
servlet-layer vocabulary (`GlobalExceptionHandler.handleNoResourceFoundException`).

### Constraint races — `409`

Every uniqueness rule is checked in the service before the insert so the specific slug
above (`profile-name-taken`, `category-name-taken`, ...) is returned. If two requests race past
that check, the database constraint still wins and the resulting
`DataIntegrityViolationException` is mapped to a generic `409` `/errors/conflict` rather
than a `500`.

---

## Profiles

Above the profile boundary: none of these endpoints reads the `X-Profile-Id` header's value
(see [Active profile](#active-profile-one-header-resolved-in-one-place)). A profile's name is
unique in the instance, so the profile picker never shows two entries that look alike.

### `GET /api/profiles`

Every profile of the instance, in creation order. It is the first thing a client loads: an
empty array is the first-run state, anything else is what the profile picker shows.

**Response `200 OK`**

```json
[
  { "id": 3, "name": "Personal", "defaultCurrency": "PLN", "createdAt": "2026-01-04T09:12:00Z" },
  { "id": 4, "name": "Company",  "defaultCurrency": "EUR", "createdAt": "2026-02-11T14:31:00Z" }
]
```

Returned as a bare array, not an envelope: the list is inherently small (a handful per
instance) and needs no pagination metadata.

| Status | When |
|---|---|
| `200` | OK (an empty array on an instance with no profiles) |

### `POST /api/profiles`

**Request**

| Field | Type | Validation |
|---|---|---|
| `name` | string | `@NotBlank` `@Size(max = 100)` |
| `defaultCurrency` | string | `@NotBlank` `@CurrencyCode` (`^[A-Z]{3}$`) |

**Response `201 Created`** with `Location: /api/profiles/{id}` and the
`ProfileResponse` body.

| Status | When |
|---|---|
| `201` | Created |
| `400` | Validation failure |
| `409` | A profile with that name already exists (`/errors/profile-name-taken`, mirrors `UNIQUE (name)`) |

Creating a profile does **not** make it the active profile — the browser chooses that, by
naming the new id in the header of its next requests. One action, one effect.

### `GET /api/profiles/{id}`

The target of the `Location` header above.

**Response `200 OK`** with a `ProfileResponse` body (see `GET /api/profiles`).

| Status | When |
|---|---|
| `200` | OK |
| `404` | No profile with that id |

### `PUT /api/profiles/{id}`

Rename only — the default currency is fixed at creation and cannot be changed here.

**Request**

| Field | Type | Validation |
|---|---|---|
| `name` | string | `@NotBlank` `@Size(max = 100)` |

**Response `200 OK`** with the updated `ProfileResponse`.

| Status | When |
|---|---|
| `200` | Renamed |
| `400` | Validation failure |
| `404` | No profile with that id |
| `409` | Another profile already has that name (`/errors/profile-name-taken`) — renaming to the profile's own current name is a no-op, not a conflict |

### `DELETE /api/profiles/{id}`

Deletes the profile and everything it owns — categories, transactions, budgets,
subscriptions, insights — via `ON DELETE CASCADE` (`SCHEMA.md` → "Foreign keys and
cascade behavior"). Irreversible.

**Response `204 No Content`.**

| Status | When |
|---|---|
| `204` | Deleted — the only profile of the instance included |
| `404` | No profile with that id |

An instance may have no profiles: that is the first-run state, and it works like any other
(`GET /api/profiles` answers `[]`). A browser that still names the deleted profile has no
active profile from its next request on: a profile-scoped request answers `409`
`/errors/no-active-profile`, the client's cue to show the picker again rather than stay
pointed at a profile that no longer exists. Nothing is kept on the server that would need
clearing.

---

## Categories

Profile-scoped. Hierarchy per `SCHEMA.md`: adjacency list, `parentId = null` for roots,
max depth 5.

### `GET /api/categories`

Returns the profile's full category forest as **nested JSON**. Siblings are sorted by name
(database collation).

```json
[
  {
    "id": 1,
    "name": "Shopping",
    "parentId": null,
    "color": "#c3b3ee",
    "depth": 1,
    "children": [
      {
        "id": 4, "name": "Stimulants", "parentId": 1, "color": null, "depth": 2,
        "children": [
          { "id": 9, "name": "Vaping", "parentId": 4, "depth": 3, "children": [] }
        ]
      }
    ]
  },
  { "id": 2, "name": "Rent", "parentId": null, "depth": 1, "children": [] }
]
```

Nested rather than flat because the tree *is* the domain concept — a flat list with
`parentId` would leak the storage model into the contract and make every consumer
reimplement assembly. Depth is capped at 5 and a personal category list is small, so
the payload is bounded and the response can be built in one pass without pagination.

`color` is the category's own display color or `null` for "inherit from the nearest
ancestor with one" — the client resolves inheritance while walking the tree it already
has; the server only stores and echoes the raw value (see `SCHEMA.md` → `category`).

`parentId` is kept alongside `children` (redundant, but cheap) so a subtree can be
manipulated without tracking its position in the tree. `depth` is included because
the client needs it to disable "add subcategory" at level 5 — otherwise it would have
to count nesting itself and duplicate a server rule.

The server loads all of the profile's categories with one flat query
(`idx_category_profile_id`) and assembles the tree in memory. **No recursive CTE is
needed here** — recursion is for aggregating *over* the tree, not for fetching a
bounded set of rows the service can group by `parentId` in a single pass.

| Status | When |
|---|---|
| `200` | OK (empty array if none) |
| `409` | No active profile |

### `POST /api/categories`

**Request**

| Field | Type | Validation |
|---|---|---|
| `name` | string | `@NotBlank` `@Size(max = 100)` |
| `parentId` | integer or null | Optional; `null` creates a root |
| `color` | string or null | Optional; `@HexColor` — lowercase `#rrggbb`; `null`/absent = inherit |

**Response `201 Created`** with `Location: /api/categories/{id}`. The body is a single
category node with `"children": []` — the same node shape as in the tree, so the client
can splice it straight into its local state.

| Status | When |
|---|---|
| `201` | Created |
| `400` | Validation failure |
| `409` | No active profile |
| `404` | `parentId` does not exist **in the active profile** |
| `409` | A sibling with that name already exists (`/errors/category-name-taken`, mirrors the two partial unique indexes in `SCHEMA.md`) |
| `422` | Depth limit — `depth(parent) + 1 > 5` (`/errors/category-depth-exceeded`) |

### `GET /api/categories/{id}`

**`200`** with the category node — the same shape as `GET /api/categories`, but with its
**live subtree** in `children` rather than the empty array `POST` returns for a brand-new
leaf. `404` if absent or in another profile. Closes the gap where `POST`'s `Location` header
pointed at a URL with no `GET` mapping.

### `PATCH /api/categories/{id}`

Rename and/or reparent. `PATCH` because both fields are optional and omitting one must
mean "leave it alone" — with `PUT`, omitting `parentId` would be indistinguishable from
"move to root", which would silently detach subtrees.

This is the one resource in the API that uses `PATCH` instead of `PUT` for its update —
transactions, budgets, subscriptions and insights all use `PUT` (see their own sections)
because each is a small flat record edited as a whole through one form, with no
`null`-vs-absent ambiguity to resolve. Categories differ because a rename and a reparent
are two independent, optional edits with a real "leave alone" default, which `PUT`'s
full-replacement contract cannot express without forcing every caller to resend the
current `parentId` on every rename. See `UpdateCategoryRequest` and
`CategoryService.update`, which only touch the fields Jackson recorded as present.

**Request** — at least one field must be present:

| Field | Type | Validation |
|---|---|---|
| `name` | string | Optional; `@Size(max = 100)`, non-blank if present |
| `parentId` | integer or null | Optional; **explicit `null` moves to root** |
| `color` | string or null | Optional; `@HexColor`; **explicit `null` clears it back to inherit** |

The `null`-vs-absent distinction is real — a plain `Long parentId` field cannot tell
"not sent" from "sent as null", and conflating them is how a move-to-root becomes a no-op
or vice versa. `UpdateCategoryRequest` is therefore the one non-record DTO: a small class
whose `@JsonSetter` setters flip a `parentIdSet`/`nameSet`/`colorSet` flag (Jackson calls a setter for
an explicit `null` but not for an absent field). A present `color` is validated on the field
exactly as in `POST` (`@HexColor`), so an invalid colour is reported as `color`. `@AssertTrue`
checks remain for "at least one field" (`anyFieldSet`) and "a present name is not blank"
(`nameValid`), because both depend on which fields the body contains. No extra library. It has
its own tests.

**Response `200 OK`** — the updated node, with `children` populated (the subtree moves
with it).

| Status | When |
|---|---|
| `200` | Updated |
| `400` | Validation failure, or no fields supplied |
| `409` | No active profile |
| `404` | Category not found in the active profile, or `parentId` not found in it |
| `409` | Sibling name collision at the destination |
| `422` | **Depth limit** — `depth(newParent) + height(subtree) > 5` (`/errors/category-depth-exceeded`) |
| `422` | **Cycle** — `parentId` is the category itself or one of its descendants (`/errors/category-cycle`) |

Both `422`s are the service-layer rules from `SCHEMA.md`; the cycle check is not
optional tidiness, since a cycle would make the recursive queries loop forever. The
subtree-height query answers both checks in one round trip.

### `DELETE /api/categories/{id}`

**Response `204 No Content`.**

| Status | When |
|---|---|
| `204` | Deleted |
| `409` | No active profile |
| `404` | Not found in the active profile |
| `409` | **In use** — has child categories, transactions, budgets, or subscriptions (`/errors/category-in-use`) |

The `409` is the API-level expression of `ON DELETE RESTRICT` (`SCHEMA.md` → "cascade
ownership, restrict references"). The service checks and returns a structured error
rather than letting a raw FK violation surface as a `500`:

```json
{
  "type": "/errors/category-in-use",
  "title": "Category is in use",
  "status": 409,
  "detail": "'Groceries' has 2 subcategories, 143 transactions, 1 budgets and 1 subscriptions. Reassign or delete them first.",
  "childCategoryCount": 2,
  "transactionCount": 143,
  "budgetCount": 1,
  "subscriptionCount": 1
}
```

The counts let the UI offer a real next step ("reassign 143 transactions to…") instead
of a dead end. Reassign-then-delete is a client-orchestrated flow over the existing
transaction endpoints — no bulk-reassign endpoint is designed here, since nothing has
asked for one yet.

---

## Transactions

Profile-scoped. Amounts are positive with direction in `type`, per `SCHEMA.md`.

### `POST /api/transactions`

**Request**

| Field | Type | Validation |
|---|---|---|
| `categoryId` | integer | `@NotNull` |
| `amount` | string (decimal) | `@NotNull` `@MoneyAmount` (greater than 0, at most 15 integer and 4 decimal digits) |
| `currency` | string | `@NotBlank` `@CurrencyCode` |
| `type` | string | `@NotNull`, one of `EXPENSE`, `INCOME` |
| `occurredOn` | string (date) | `@NotNull`, not after UTC today + 1 (field `occurredOnNotInFuture`) |
| `description` | string or null | Optional, `@Size(max = 500)` |
| `merchant` | string or null | Optional, `@Size(max = 100)` |

`@MoneyAmount`'s 4-decimal limit mirrors `NUMERIC(19,4)` — an amount with 5 decimals is a `400`,
not a silent round. Future-dated entries are blocked, but the server does not know the
client's timezone: the latest calendar date anywhere on Earth (UTC+14) is at most the UTC
date + 1, so that is the bound — every timezone can enter "today", genuinely future dates
are a `400` (`occurredOnNotInFuture`). If scheduled/planned transactions are ever wanted,
that's a feature with its own semantics, not a loosened validator.

`currency` is not defaulted from the profile server-side — the client sends it
explicitly, prefilled from `defaultCurrency` in the UI. An implicit server-side default
would make the currency of a record depend on profile settings at write time, which is
invisible in the payload and unpleasant to debug later.

`merchant` is free text (`SCHEMA.md` → `txn`), never normalized server-side: the same string is
the same merchant, so `"lidl"` and `"Lidl"` are two of them. That is a deliberate trade — a
normalizer would have to guess, and guessing wrong is invisible — and it is why the backfill
endpoints below exist to set many rows at once from what was already typed. `PUT` is a full
replacement here as everywhere: a body without `merchant` clears it.

**Response `201 Created`** with `Location`, body `TransactionResponse`:

```json
{
  "id": 4213,
  "category": { "id": 9, "name": "Vaping" },
  "amount": "34.9900",
  "currency": "PLN",
  "type": "EXPENSE",
  "occurredOn": "2026-07-21",
  "description": "liquid refill",
  "merchant": "Lidl",
  "subscriptionId": null,
  "createdAt": "2026-07-22T18:04:11Z"
}
```

`subscriptionId` is set only on transactions posted by the subscription charge job (see
[Subscriptions](#subscriptions)); it is read-only — not part of the request body.

The category is inlined as a small `{id, name}` object rather than a bare
`categoryId` — a transaction list is almost always rendered with category names, and
inlining avoids the client either doing N lookups or joining against the tree it
fetched separately. No `profileId` in the response: it's implied by the active profile, and
echoing it would suggest it is something a client sends back in a body.

| Status | When |
|---|---|
| `201` | Created |
| `400` | Validation failure |
| `409` | No active profile |
| `404` | `categoryId` not found in the active profile |

### `GET /api/transactions`

**Query parameters** — all optional:

| Param | Type | Meaning |
|---|---|---|
| `from` | date | Inclusive lower bound on `occurredOn` |
| `to` | date | Inclusive upper bound on `occurredOn` |
| `categoryId` | integer | Filter to a category |
| `includeDescendants` | boolean, default `false` | With `categoryId`: include the whole subtree |
| `type` | `EXPENSE` \| `INCOME` | Filter by direction |
| `q` | string, max 100 chars | Case-insensitive substring match on `description` OR `merchant` |
| `page` | integer, default `0` | |
| `size` | integer, default `50`, max `200` | |

The six filters (`from`, `to`, `categoryId`, `includeDescendants`, `type`, `q`) mean the same
thing, and are checked the same way, here and on the aggregates `summary` and `category-totals`
below; `page` and `size` exist only on this list. They are checked first: a request that breaks a
paging rule and a filter rule at once is answered with the paging sentence.

`from`/`to` are **inclusive on both ends**, matching the inclusive `period_end`
convention in `SCHEMA.md`. Keeping one convention across the whole project is worth
more than picking the "better" one per endpoint.

`includeDescendants=true` is what triggers the recursive CTE (`SCHEMA.md` → query 1)
to expand the subtree before filtering. Default `false` keeps the common case a plain
indexed lookup on `idx_txn_profile_category_date`; nobody pays for recursion they
didn't ask for.

`q` matches against `LOWER(description) LIKE LOWER('%' || q || '%')` (and the same
against `merchant`), so it never touches the profile's other transactions — a blank
or whitespace-only `q` is treated as "no search". `%` and `_` in the input are LIKE
wildcards and are escaped before the match, so searching for a literal `%` finds rows
that actually contain one instead of matching everything.

Sorted `occurredOn DESC, id DESC` — matching `idx_txn_profile_date` so the index
satisfies the ordering, with `id` as a tiebreak so pagination is stable across rows
sharing a date. Without that tiebreak, `page=1` can repeat or skip a row from `page=0`.

**Response `200 OK`** — a paged envelope (unlike profiles/categories, this list is
unbounded and genuinely needs pagination metadata):

```json
{
  "content": [ /* TransactionResponse objects */ ],
  "page": 0,
  "size": 50,
  "totalElements": 1284,
  "totalPages": 26
}
```

A hand-written envelope rather than serializing Spring Data's `Page` directly — `Page`
has an unstable JSON shape across versions and leaks framework internals (`pageable`,
`sort`, `numberOfElements`) into a public contract.

| Status | When |
|---|---|
| `200` | OK |
| `400` | `/errors/invalid-request` ([Query parameter problems](#query-parameter-problems--400)): a value that cannot be read in any parameter (a date, `type`, `categoryId`, `includeDescendants`, `page`, `size`), `page` below 0, `size` outside 1–200, `from` after `to`, `includeDescendants` without `categoryId`, or `q` over 100 chars |
| `409` | No active profile |
| `404` | `categoryId` not in the active profile |

### Aggregates: `summary`, `category-counts`, `category-totals`

Three read-only aggregates that exist for one reason: **a total must cover every matching row,
regardless of pagination.** Screens that need a figure — the transactions KPI tiles, the category
tree's per-row counts, the dashboard's spend-by-category chart — used to sum one `size=200` page
client-side, which quietly under-reported the moment a profile held more than one page of matching
transactions (a whole category could vanish from the chart). These endpoints group in SQL over the
full match, so the page cap on `GET /api/transactions` never touches a displayed total again.
Raising `size` was never the fix: a bounded page is the wrong instrument for a total.

Each of them is scoped server-side to the active profile, and each keeps **one row per currency** —
amounts from two currencies are never added together, here or anywhere else in this API.

#### `GET /api/transactions/summary`

**Query parameters** — the same optional filters as `GET /api/transactions` (`from`, `to`,
`categoryId`, `includeDescendants`, `type`, `q`), minus paging. They are built into the same
specification the list endpoint uses, so the summary always describes exactly the rows the list
would show.

**Response `200 OK`** — a bare array, one object per currency present in the match, ordered by
currency:

```json
[
  { "currency": "EUR", "income": "20.0000", "expense": "50.0000", "net": "-30.0000", "count": 2 },
  { "currency": "PLN", "income": "3351.3000", "expense": "48236.0300", "net": "-44884.7300", "count": 235 }
]
```

`income`, `expense` and `net` are decimal strings at scale 4 (see [Money](#money-decimal-string--iso-4217-code));
`net` is `income − expense`. A currency with only expenses reports `"income": "0.0000"` rather than
omitting the field. `count` is a JSON number — a row count, never money. An empty match is `[]`.

| Status | When |
|---|---|
| `200` | OK |
| `400` | `/errors/invalid-request`: a filter value that cannot be read, `from` after `to`, `includeDescendants` without `categoryId`, or `q` over 100 chars |
| `409` | No active profile |
| `404` | `categoryId` not in the active profile |

#### `GET /api/transactions/category-counts`

How many transactions are filed on each category of the active profile. `q` (same match rule as
`GET /api/transactions`) is the only filter it accepts; every other parameter is deliberately
absent — it otherwise feeds the category tree, which wants the whole picture.

**Response `200 OK`** — ordered by `categoryId`; categories with no transactions are absent, not
zero rows:

```json
[
  { "categoryId": 15, "count": 50 },
  { "categoryId": 19, "count": 41 }
]
```

Counts are **as filed** — a parent does not include its children. The client already holds the
category tree and rolls up whichever way its screen needs (the tree view sums the subtree); doing
it server-side would force one roll-up policy on every caller.

| Status | When |
|---|---|
| `200` | OK (`[]` when the profile has no transactions) |
| `400` | `/errors/invalid-request`: `q` over 100 chars |
| `409` | No active profile |

#### `GET /api/transactions/category-totals`

**Query parameters** — the same optional filters as `summary`.

**Response `200 OK`** — one row per (category, currency), ordered by `categoryId` then `currency`:

```json
[
  { "categoryId": 15, "currency": "PLN", "total": "9670.3300" },
  { "categoryId": 19, "currency": "PLN", "total": "8849.1100" }
]
```

`total` is a decimal string at scale 4. As filed, per currency, same reasoning as
`category-counts`. Pass `type=EXPENSE` for a spend chart; without it, income and expense rows are
summed into one figure, which is rarely what a chart wants.

Statuses as `summary`.

### `GET /api/transactions/{id}`

**`200`** with `TransactionResponse`; **`404`** if absent *or in another profile*.

### `PUT /api/transactions/{id}`

Full replacement — same body and validation as `POST`. `PUT` rather than `PATCH` here
because a transaction is a small flat record edited through a single form; there's no
partial-update use case, and no `null`-vs-absent ambiguity to resolve.

**`200`** with the updated `TransactionResponse`. Statuses as `POST`, plus `404` for
the transaction itself.

### `DELETE /api/transactions/{id}`

**`204 No Content`**. `404` if absent or in another profile. Nothing references a
transaction, so there is no `409` case — this is a real hard delete.

### `GET /api/transactions/merchant-suggestions`

Backfill candidates for the active profile: descriptions that repeat across transactions which
have **no merchant yet**.

**Response `200 OK`** — a bare array, biggest group first, twenty at most:

```json
[
  { "description": "Biedronka", "transactionCount": 14 },
  { "description": "Lidl", "transactionCount": 9 }
]
```

`transactionCount` is a JSON number (a row count, never money). The suggested merchant *is* the
description — the client prefills its input with it and the owner edits it before applying.

**What this deliberately does not do.** No case folding (`"lidl"` and `"Lidl"` are two
suggestions), no fuzzy or prefix matching, no tokenizing of bank-statement noise
(`"CARD PAYMENT LIDL 4123"` is its own group), no learning between calls, and no rewriting of the
`description` itself. It groups on the exact string, keeps groups of two or more — one occurrence
is not evidence of anything — and stops at twenty. A cleverer suggester guesses, and a wrong guess
applied in bulk is invisible; a dumb one plus an editable input is cheaper and honest.

| Status | When |
|---|---|
| `200` | OK (an empty array when there is nothing to suggest) |
| `409` | No active profile |

### `POST /api/transactions/merchant-backfill`

**Request**

| Field | Type | Validation |
|---|---|---|
| `description` | string | `@NotBlank` `@Size(max = 500)` |
| `merchant` | string | `@NotBlank` `@Size(max = 100)` |

Sets `merchant` on every transaction of the active profile whose `description` equals the one sent
**and** whose `merchant` is still null. Exact match, same as the suggester — so applying twice is a
no-op and nothing already labelled is ever overwritten.

**Response `200 OK`**

```json
{ "updated": 14 }
```

`200` rather than `204`: the count is how a stale suggestion (rows changed since the list was
fetched) shows up as a smaller number instead of a lie. The backfill panel does not display it —
on success it invalidates the suggestion list and the applied row simply disappears — so today the
count is for the caller that asks, not for the UI.

| Status | When |
|---|---|
| `200` | Applied, possibly to zero rows |
| `400` | Validation failure |
| `409` | No active profile |

---

## Budgets

Profile-scoped. A budget is a limit for one category over one inclusive date range.

### `POST /api/budgets`

**Request**

| Field | Type | Validation |
|---|---|---|
| `categoryId` | integer | `@NotNull` |
| `amountLimit` | string (decimal) | `@NotNull` `@MoneyAmount` (greater than 0, at most 15 integer and 4 decimal digits) |
| `currency` | string | `@NotBlank` `@CurrencyCode` |
| `periodStart` | string (date) | `@NotNull` |
| `periodEnd` | string (date) | `@NotNull`, must be `>= periodStart` (class-level `@AssertTrue`) |

`POST` and `PUT` share one body, `BudgetRequest`.

**Response `201 Created`** with `Location`, body `BudgetResponse`:

```json
{
  "id": 77,
  "category": { "id": 1, "name": "Shopping" },
  "amountLimit": "2000.0000",
  "currency": "PLN",
  "periodStart": "2026-07-01",
  "periodEnd": "2026-07-31",
  "createdAt": "2026-06-28T10:00:00Z"
}
```

| Status | When |
|---|---|
| `201` | Created |
| `400` | Validation failure, including `periodEnd < periodStart` |
| `409` | No active profile |
| `404` | `categoryId` not in the active profile |
| `409` | A budget already exists for that exact category + period (`/errors/budget-exists`, mirrors the `UNIQUE`) |

`SCHEMA.md` records that *overlapping* (not identical) periods are permitted for now.
The API inherits that gap deliberately — it isn't validated here either. When the
exclusion constraint is added, this endpoint gains a matching `409`.

### `GET /api/budgets`

**Query parameters** — optional:

| Param | Type | Meaning |
|---|---|---|
| `activeOn` | date | Only budgets whose period contains this date |
| `categoryId` | integer | Filter to one category |

**Response `200 OK`** — bare array of `BudgetResponse`, sorted `periodStart DESC, id DESC`.
No pagination: budgets are per-category-per-period and stay in the dozens.

`activeOn=2026-07-15` is the common call ("what am I tracking right now?") and is
served by `idx_budget_profile_period`.

| Status | When |
|---|---|
| `200` | OK |
| `400` | Malformed date |
| `409` | No active profile |
| `404` | `categoryId` not in the active profile |

### `GET /api/budgets/{id}/status`

Spend against limit — the endpoint the ticket calls out, and the one place the
recursive CTE does real work.

**Response `200 OK`**

```json
{
  "budget": {
    "id": 77,
    "category": { "id": 1, "name": "Shopping" },
    "amountLimit": "2000.0000",
    "currency": "PLN",
    "periodStart": "2026-07-01",
    "periodEnd": "2026-07-31"
  },
  "spent": "1450.7500",
  "remaining": "549.2500",
  "percentUsed": 72.54,
  "overBudget": false,
  "includesDescendants": true,
  "excludedCurrencies": ["EUR"]
}
```

Four things worth pinning down, because each is a place a plausible implementation
would be quietly wrong:

1. **Descendant spend is included.** A budget on `Shopping` counts spending in
   `Shopping > Stimulants > Vaping` — anything else would make budgets on parent
   categories meaningless. This is exactly query 1 in `SCHEMA.md`, bounded by
   `periodStart`/`periodEnd` and filtered to `txn_type = 'EXPENSE'`.
   `includesDescendants: true` states it in the payload rather than leaving the client
   to assume.

2. **`INCOME` transactions are excluded.** A budget is a spending limit; income landing
   in a budgeted category must not offset it.

3. **Only transactions matching the budget's currency are summed.** There is no FX
   layer (`ARCHITECTURE.md` §3), so adding €50 to a PLN total would be arithmetic on
   incompatible units. `excludedCurrencies` lists any other currencies with
   transactions in that subtree and period, so the UI can warn "3 EUR transactions not
   counted" instead of showing a total that is silently short. Usually `[]`.

4. **`remaining` can be negative** (`overBudget: true`) rather than clamping at zero —
   "how far over am I?" is the more useful number, and clamping discards it.
   `percentUsed` is a JSON *number* rounded to 2 decimal places, not a decimal string:
   it's a computed ratio for display, never money, so float precision is harmless here. `amountLimit > 0` is
   guaranteed by the schema, so there's no divide-by-zero case.

| Status | When |
|---|---|
| `200` | OK |
| `409` | No active profile |
| `404` | Budget not found in the active profile |

### `GET /api/budgets/{id}`

**`200`** with `BudgetResponse`; **`404`** if absent or in another profile.

### `PUT /api/budgets/{id}`

Full replacement — same body (`BudgetRequest`) and validation as `POST`.

**`200`** with the updated `BudgetResponse`. Statuses as `POST` (including the `404` for
`categoryId`), plus `404` for the budget itself. The `409` collision check is exempted for
the budget's own current slot: saving it back with the same category and period it already
has is an edit, not a move, and must not conflict with itself.

### `DELETE /api/budgets/{id}`

**`204 No Content`**. `404` if absent or in another profile. Nothing references a budget,
so there is no `409` case — this is a real hard delete.

## Subscriptions

Profile-scoped. A subscription is a named recurring charge (`SCHEMA.md` → `subscription`);
the daily charge job turns due `ACTIVE` subscriptions into ordinary transactions, so
`GET /api/transactions` and budget status already include them.

Shared response shape — `SubscriptionResponse`:

```json
{
  "id": 12,
  "name": "Netflix",
  "category": { "id": 7, "name": "Streaming" },
  "amount": "43.0000",
  "currency": "PLN",
  "billingPeriod": "MONTHLY",
  "nextBillingOn": "2026-09-03",
  "status": "ACTIVE",
  "notes": null,
  "monthlyAmount": "43.0000",
  "createdAt": "2026-08-17T21:40:00Z"
}
```

`monthlyAmount` is the server-side normalization (`WEEKLY × 52 / 12`, `QUARTERLY / 3`,
`YEARLY / 12`, rounded `HALF_UP` to 4 places) so every client sums the same numbers.

### `POST /api/subscriptions`

| Field | Type | Validation |
|---|---|---|
| `name` | string | `@NotBlank` `@Size(max = 100)` |
| `categoryId` | integer | `@NotNull` |
| `amount` | string (decimal) | `@NotNull` `@MoneyAmount` (greater than 0, at most 15 integer and 4 decimal digits) |
| `currency` | string | `@NotBlank` `@CurrencyCode` |
| `billingPeriod` | string | `@NotNull`, one of `WEEKLY` `MONTHLY` `QUARTERLY` `YEARLY` |
| `nextBillingOn` | string (date) | `@NotNull` — may be in the past; the next job run posts the missed charges |
| `notes` | string or null | Optional, `@Size(max = 500)` |

New subscriptions are always `ACTIVE`; status is changed with `PUT`.

**Response `201 Created`** with `Location: /api/subscriptions/{id}` and `SubscriptionResponse`.

| Status | When |
|---|---|
| `201` | Created |
| `400` | Validation failure |
| `409` | No active profile |
| `404` | `categoryId` not in the active profile |
| `409` | Name already used in this profile (`/errors/subscription-name-taken`) |

### `GET /api/subscriptions`

**Query parameters** — optional: `status` (`ACTIVE` \| `PAUSED` \| `CANCELLED`). Without it,
`ACTIVE` and `PAUSED` are returned — cancelled ones are history and must be asked for.

**Response `200 OK`** — bare array of `SubscriptionResponse`, sorted `nextBillingOn ASC, id ASC`
(soonest first). No pagination: a personal subscription list is small.

| Status | When |
|---|---|
| `200` | OK |
| `400` | Unknown `status` value |
| `409` | No active profile |

### `GET /api/subscriptions/{id}`

`200` with `SubscriptionResponse`; `404` if absent or in another profile.

### `PUT /api/subscriptions/{id}`

Full replacement — same body as `POST` **plus** `status` (`@NotNull`, one of the three values).
This is how a subscription is paused, resumed or cancelled. Moving from `PAUSED`/`CANCELLED` back
to `ACTIVE` with a `nextBillingOn` in the past will post the missed charges on the next job run —
the client should send a fresh `nextBillingOn` when resuming.

`200` with the updated `SubscriptionResponse`. Statuses as `POST`, plus `404` for the subscription
itself.

### `DELETE /api/subscriptions/{id}`

`204 No Content`. `404` if absent or in another profile. Linked transactions are kept and their
`subscriptionId` cleared (`ON DELETE SET NULL`); prefer `PUT` with `status: CANCELLED` when the
history should stay linked.

### `GET /api/subscriptions/dashboard`

Everything the subscription dashboard shows, in one round trip. Only `ACTIVE` subscriptions
count toward totals and upcoming renewals; `PAUSED` ones appear only in `pausedCount`.

**Query parameters** — optional: `horizonDays` (integer, default `30`, `1..365`) — how far ahead
`upcoming` looks.

**Response `200 OK`**

```json
{
  "asOf": "2026-08-17",
  "activeCount": 6,
  "pausedCount": 1,
  "monthlyCost": [ { "currency": "PLN", "amount": "212.9900" }, { "currency": "USD", "amount": "10.0000" } ],
  "yearlyCost":  [ { "currency": "PLN", "amount": "2555.8800" }, { "currency": "USD", "amount": "120.0000" } ],
  "chargedThisMonth": [ { "currency": "PLN", "amount": "86.0000" } ],
  "byCategory": [
    { "category": { "id": 7, "name": "Streaming" }, "currency": "PLN", "monthlyAmount": "86.0000" }
  ],
  "upcoming": [
    { "id": 12, "name": "Netflix", "category": { "id": 7, "name": "Streaming" },
      "amount": "43.0000", "currency": "PLN", "billingPeriod": "MONTHLY",
      "nextBillingOn": "2026-09-03", "daysUntil": 17 }
  ],
  "overdue": []
}
```

- Totals are **per currency** and never mixed (no FX layer, `ARCHITECTURE.md` §3). `yearlyCost`
  is computed directly from each subscription's raw `amount` (`YEARLY × 1`, `QUARTERLY × 4`,
  `MONTHLY × 12`, `WEEKLY × 52`) and summed — **not** `monthlyCost × 12`, which would multiply
  already-rounded monthly equivalents back up and compound their rounding (e.g. a single YEARLY
  100.0000 subscription would report 99.9996 instead of 100.0000).
- `chargedThisMonth` sums `EXPENSE` transactions with a non-null `subscriptionId` whose
  `occurredOn` falls in the calendar month of `asOf` — actual money, not projection.
- `byCategory` groups active subscriptions by category **and** currency, sorted by
  `monthlyAmount DESC`; it is what the breakdown chart plots.
- `upcoming` is `ACTIVE` with `asOf <= nextBillingOn <= asOf + horizonDays`, sorted soonest first;
  `overdue` is `ACTIVE` with `nextBillingOn < asOf` (the job hasn't run yet, or a subscription was
  created/resumed with a past date) — the UI flags these rather than hiding them.
- `asOf` is today's date in UTC, the same clock the charge job uses.

| Status | When |
|---|---|
| `200` | OK |
| `400` | `horizonDays` out of range or malformed |
| `409` | No active profile |

### Charge posting (no endpoint)

`SubscriptionChargeService.postDueCharges(today)` runs daily at 00:05 UTC (`@Scheduled`), see
`SCHEMA.md` → "Charge posting". Transactions it creates are visible through the normal transaction
endpoints and carry `"subscriptionId": 12` in `TransactionResponse` (a new, nullable field —
manual entries have `null`). No client can trigger the job; there is nothing to protect.

---

## Backup

Manual backup, started by the owner: the client downloads a file and keeps it wherever
it likes; restore is uploading that file back. No scheduled job, no cloud target — on a
self-hosted instance the machine is already the owner's, so "give me a file" beats
wiring up access to a third-party drive.

**Why an application-level JSON export, not `pg_dump`.** The requirement is *choose
which profiles the backup contains*, and restore must never touch data the file
doesn't describe. A SQL dump is all-or-nothing: it can't scope to a subset of
profiles, and restoring one would clobber the whole instance. An application-level
export contains exactly the selected profiles' domain data, restores through the same
validated service layer as normal writes, and stays portable across schema versions
via `formatVersion` (a `pg_dump` taken at one schema version can't load into a later
one; a JSON backup can be upgraded on read).

Both endpoints sit **above the profile boundary**, like `GET /api/profiles`: the
`X-Profile-Id` header's value is not read, so there is no `409 no-active-profile`
here. (Both are `POST`s, so the header itself must be there, as on every request that
changes something.) The UI for both lives on the profile picker for the same reason.
An export names the profiles it wants by id in its body, and an id that names no
profile is a `404`.

### `POST /api/backup/export`

`POST` rather than `GET` because the response is a generated document parameterized
by a request body — and the body keeps profile selection validated like every other
input. The client triggers the download from the response blob.

**Request**

| Field | Type | Validation |
|---|---|---|
| `profileIds` | array of integers | `@NotEmpty`, no nulls |

**Response `200 OK`** — `Content-Type: application/json`,
`Content-Disposition: attachment; filename="my-finance-backup-YYYY-MM-DD.json"`.

The body is the backup file (`formatVersion: 1`):

```json
{
  "app": "my-finance",
  "formatVersion": 1,
  "exportedAt": "2026-08-25T12:00:00Z",
  "profiles": [
    {
      "name": "Personal",
      "defaultCurrency": "PLN",
      "categories": [
        { "ref": 1, "parentRef": null, "name": "Shopping", "color": "#c3b3ee" },
        { "ref": 4, "parentRef": 1,    "name": "Stimulants", "color": null }
      ],
      "subscriptions": [
        { "ref": 12, "categoryRef": 4, "name": "Netflix", "amount": "43.0000",
          "currency": "PLN", "billingPeriod": "MONTHLY", "nextBillingOn": "2026-09-03",
          "status": "ACTIVE", "notes": null }
      ],
      "transactions": [
        { "categoryRef": 4, "subscriptionRef": 12, "amount": "43.0000", "currency": "PLN",
          "type": "EXPENSE", "occurredOn": "2026-08-03", "description": "Netflix subscription",
          "merchant": null },
        { "categoryRef": 1, "subscriptionRef": null, "amount": "34.9900", "currency": "PLN",
          "type": "EXPENSE", "occurredOn": "2026-07-21", "description": "liquid refill",
          "merchant": "Lidl" }
      ],
      "budgets": [
        { "categoryRef": 1, "amountLimit": "2000.0000", "currency": "PLN",
          "periodStart": "2026-07-01", "periodEnd": "2026-07-31" }
      ]
    }
  ]
}
```

Decisions pinned down:

- **`ref`s are file-internal.** They are the database ids at export time, but on
  restore they are only used to stitch `parentRef` / `categoryRef` /
  `subscriptionRef` back together — restored rows get fresh ids. A backup is data,
  not identity.
- **Parents precede children.** `categories` is ordered so every `parentRef` points
  to an earlier element of the array; the exporter guarantees it and the restorer
  requires it (violations are a `422`). This keeps restore single-pass and makes
  "is this file well-formed?" checkable without building a graph.
- **No account data.** An instance has no accounts, so there is none to export: the
  file holds the selected profiles' finance data and nothing else, and it restores
  into whatever instance it is uploaded to. This is also why the file is safe to keep
  in a synced folder.
- **`createdAt` is not exported.** It's audit metadata about *this* database's
  rows; restored rows get their own. Domain dates (`occurredOn`, budget periods,
  `nextBillingOn`) are preserved exactly.
- **`merchant` is optional and `formatVersion` stays `1`.** The field arrived in Phase 4b; files
  exported before it simply have no `merchant`, and restore leaves the column null. A version bump
  would have been the wrong tool: the restorer accepts exactly its own version, so bumping would
  make every existing backup unrestorable in exchange for a field whose absence already means
  something sensible.
- **Old files stay restorable.** The format has only ever described profiles, so any file of
  `formatVersion: 1` restores, whichever build exported it.
  `BackupControllerTest.aFileExportedBeforeProfilesOnlyStillRestores` restores one exported by a
  build from before the instance became profiles-only (the fixture
  `backup/exported-before-profiles-only.json`).

| Status | When |
|---|---|
| `200` | File returned |
| `400` | `profileIds` missing or empty |
| `404` | Any listed profile does not exist |

### `POST /api/backup/restore`

`multipart/form-data` with a single part named `file` (max 20 MB —
`spring.servlet.multipart.max-file-size`). Multipart rather than a JSON body
because the client is handing back an opaque file from disk, and the browser's file
input produces exactly that.

**Restore always creates new profiles.** It never merges into or overwrites an
existing profile — a restore that could silently rewrite live data is the wrong
default for a recovery tool. Profile names are unique in the instance, so if a name
is taken the restored profile is named `"<name> (restored)"`, then
`"<name> (restored 2)"`, and so on; the response reports the final names. Everything
is inserted in **one database transaction** — a half-restored profile is worse than a
failed restore, so any error rolls back the whole upload.

One subtlety worth its own rule: a restored `ACTIVE` subscription whose
`nextBillingOn` is in the past would be treated as *overdue* by the daily charge
job, which would post "missed" charges — duplicating transactions the backup
already contains. On restore, such a `nextBillingOn` is **advanced by whole billing
periods to the first date ≥ today**, preserving the billing cadence (a monthly
charge on the 3rd stays on the 3rd). The charge history is already in the file's
transactions; the subscription just resumes on schedule.

Content is validated with the same rules as the normal write endpoints (amount
scale and positivity, ISO 4217 currency, category colour format, name and text lengths,
category depth ≤ 5, sibling name uniqueness within the file) plus file-level integrity
(dangling or duplicate `ref`s, `parentRef` ordering). The amount, currency and colour
checks read the same parameters as `@MoneyAmount`, `@CurrencyCode` and `@HexColor`, and a
test holds restore and the write endpoints to one table of values; the problem strings are
restore's own wording. Two known differences are recorded rather than intended: restore
rejects dates outside the years 1–9999, which the write endpoints do not bound, and restore
does not apply the transaction date's not-in-the-future rule.

**Response `200 OK`** — a summary the picker can show and then refetch
`GET /api/profiles`:

```json
{
  "profiles": [
    { "id": 9, "name": "Personal (restored)", "categories": 12,
      "transactions": 431, "budgets": 3, "subscriptions": 5 }
  ]
}
```

| Status | When |
|---|---|
| `200` | Restored; summary returned |
| `400` | Not JSON, not a my-finance backup, or unsupported `formatVersion` (`/errors/invalid-backup-file`) |
| `413` | File over the size limit (`/errors/backup-too-large`) |
| `422` | Well-formed backup violating domain rules — bad refs, depth > 5, invalid amounts/currencies/dates (`/errors/backup-invalid`, with a `problems` array of human-readable strings pinpointing the entries) |

The `400`/`422` split follows the project-wide rule: `400` means "this isn't a
backup file", `422` means "this is a backup file with invalid content".

---

## Insights

Phase 4 (design in [`INSIGHTS.md`](./INSIGHTS.md), table in
[`SCHEMA.md`](./SCHEMA.md) → `insight`). Profile-scoped. An **Insight** is a
saved analytics question: a name plus a versioned **query plan** the analytics
service executes. The plan DSL, execution semantics, and result shapes live in
`INSIGHTS.md`; this section owns only the HTTP contract.

Shared response shape — `InsightResponse`:

```json
{
  "id": 7,
  "name": "Lidl vs Biedronka, monthly",
  "plan": { "version": 1, "metric": "spend", "filters": { "categoryId": 12,
            "merchants": ["Lidl", "Biedronka"], "currency": "PLN" },
            "groupBy": "merchant", "interval": "month",
            "range": { "type": "lastMonths", "n": 12 } },
  "viz": null,
  "pinned": true,
  "createdAt": "2026-08-25T18:00:00Z"
}
```

In the OpenAPI document `plan`, `viz` and both bodies of `POST /api/insights/execute` are
free-form JSON objects: the backend stores and forwards them without reading their structure,
which [`INSIGHTS.md`](./INSIGHTS.md) defines.

### `POST /api/insights/execute`

Runs a plan **without saving it** — the explorer's run button, and how the
dashboard renders pinned tiles. Body: a bare plan object.

The backend checks only that the body **is a JSON object**. Everything else,
including whether the plan `version` is supported, is the executor's job
(one validator, one source of truth — the backend forwarding a plan it
half-understands is how two validators drift, and a second component that
knows the version set drifts the moment the DSL bumps to v2). The analytics
service returns either the result envelope (`INSIGHTS.md` → Result shapes)
or a problem list.

**Response `200 OK`** — the result envelope, passed through verbatim.

| Status | When |
|---|---|
| `200` | Executed (empty data is a `200` with empty series, not an error) |
| `400` | Not a JSON object (`/errors/invalid-plan`), or executor-rejected plan (`/errors/invalid-plan` with `problems` array — unsupported `version`, dangling `categoryId`, unknown field, unknown enum value, `from` after `to`, ...) |
| `409` | No active profile |
| `503` | Analytics service unreachable (`/errors/analytics-unavailable`) — the UI says "the analytics service isn't running", distinct from a bug |

### `POST /api/insights`

**Request**

| Field | Type | Validation |
|---|---|---|
| `name` | string | `@NotBlank` `@Size(max = 100)` |
| `plan` | object | `@NotNull`; a well-formed JSON object — deep validation, `version` support included, stays with the executor (see above); the explorer always executes before offering save, so an unexecutable saved plan is possible only by hand-crafting, and surfaces as `400` problems at execution |
| `viz` | object or null | Optional render override. v1 honours `{"chart": "table"}` (pin the table renderer); absent or `null` means the default chart for the result shape. Any other value is stored and returned verbatim but renders as that default chart — chart-type selection is deferred (`INSIGHTS.md` → "Deliberately deferred") |
| `pinned` | boolean | Optional, default `false` |

**Response `201 Created`** with `Location: /api/insights/{id}` and
`InsightResponse`.

| Status | When |
|---|---|
| `201` | Created |
| `400` | Validation failure, or `plan` not a JSON object (`/errors/invalid-plan`, same slug as `POST /api/insights/execute`) |
| `409` | No active profile |
| `409` | Name already used in this profile (`/errors/insight-name-taken`, mirrors `UNIQUE (profile_id, name)`) |

### `GET /api/insights`

Bare array of `InsightResponse`, sorted `pinned DESC, name ASC` (pinned
first — the dashboard consumes the same list). No pagination: dozens at
most. `200` / `409`.

### `GET /api/insights/{id}`

`200` with `InsightResponse`; `404` if absent or in another profile.

### `PUT /api/insights/{id}`

Full replacement — same body and validation as `POST` (rename, edit the
plan, pin/unpin; a flat record edited through one form, so `PUT` like
transactions, no `null`-vs-absent ambiguity). `200` with the updated
`InsightResponse`; statuses as `POST`, plus `404` for the insight itself.

### `DELETE /api/insights/{id}`

`204 No Content`; `404` if absent or in another profile. Nothing references
an insight — no `409` case.

---

## Status code summary

| Code | Meaning in this API |
|---|---|
| `200` | Success with a body |
| `201` | Resource created; `Location` header set |
| `204` | Success, no body (all deletes) |
| `400` | A malformed body or a bad query parameter (`/errors/invalid-request`), a body that fails Bean Validation (`/errors/validation-failed`, with an `errors` list), or a request that changes something but arrives without the `X-Profile-Id` header (`/errors/profile-header-missing`) |
| `404` | Not found — **including any row belonging to another profile** |
| `409` | State conflict: the request names no active profile, a uniqueness violation, or a category in use |
| `413` | Uploaded backup file over the size limit |
| `422` | Body is valid but violates a domain rule: depth limit, category cycle, or invalid backup content |
| `500` | Unhandled — a bug. Never used for an anticipated case. |
| `503` | The analytics service is unreachable — an operational state, not a bug |

---

## Open questions for implementation tickets

Recorded so they're decided deliberately, not by whoever writes the code first:

- **Bulk reassign of transactions between categories.** Implied by the
  `category-in-use` `409` flow but not designed; add it if the client-orchestrated
  loop proves too slow for large categories.
- **Backend clock and the instance time zone.** Insights resolve "today" in `TZ` (`INSIGHTS.md` →
  Execution semantics). The backend's clock is UTC: the charge job runs at 00:05 UTC, and the
  subscription dashboard's `asOf` is the UTC date (above). With `TZ` away from UTC the two
  disagree for the hours between local and UTC midnight. Making the backend follow `TZ` would:
  - move the charge job;
  - change what `asOf`, `chargedThisMonth`, `upcoming` and `overdue` mean;
  - change restore's date re-basing and the backup filename date;
  - if passed as `TZ` itself, change the JVM's default zone.

  The `occurredOn` bound (UTC + 1) is zone-independent and would not change. Decide it when the owner
  reports subscription widgets and Insights disagreeing near midnight.
