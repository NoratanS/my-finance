# REST API design

The HTTP contract for the core domain, designed before any controllers exist so the
shape is reviewable independently of the implementation.

Depends on [`SCHEMA.md`](./SCHEMA.md) — every DTO here maps onto the tables settled
there, and the constraints repeated below are the API-layer mirror of the DB
constraints, not new rules.

**Status of this document.** Once controllers exist they are the source of truth for
behavior; this file explains the reasoning behind the shape. Implementation of the
controllers and services is out of scope here (separate ticket per resource).

Base path: **`/api`**. All request and response bodies are `application/json`;
errors are `application/problem+json`.

---

## Contents

- [Cross-cutting decisions](#cross-cutting-decisions)
- [Errors](#errors)
- [Auth](#auth)
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

### Authentication: session cookie

Spring Security's standard session, with the session id in an **`HttpOnly`,
`SameSite=Lax`** cookie (`Secure` when `SESSION_COOKIE_SECURE=true` — set it behind TLS;
plain-HTTP localhost keeps it off). Idle timeout is 8 hours. Not JWT.

`ARCHITECTURE.md` §3 already describes the intended behavior in these words:
"profile switching **re-scopes the authenticated session** to the selected profile."
A server-side session is the direct implementation of that sentence. Concretely:

- An `HttpOnly` cookie is unreadable from JavaScript, so an XSS bug can't exfiltrate
  the credential the way it can with a token in `localStorage`.
- Logout and profile switching take effect immediately. A stateless JWT would need a
  denylist to revoke, which reintroduces the server-side state JWT was chosen to avoid.
- This is a single self-hosted instance with one backend. There is no horizontal
  scaling requirement (`ARCHITECTURE.md` §7 lists it as an explicit non-goal), so
  statelessness buys nothing here.

The cost is **CSRF**: cookies are sent automatically by the browser. Spring Security's
`CookieCsrfTokenRepository` issues a readable `XSRF-TOKEN` cookie which the frontend
echoes in an `X-XSRF-TOKEN` header on every mutating request. Required on all
`POST`/`PUT`/`PATCH`/`DELETE`; a missing or stale token is **`403`**.

### Active profile: server-side, never client-supplied

The active profile is stored **in the session**. It appears in exactly one request
body in the entire API — `PUT /api/auth/active-profile` — and nowhere else.

This is the single most important rule in this document. `CLAUDE.md` states it
directly: *"Never write a query or endpoint that trusts the client to supply the
correct profile."* So there is no `profileId` in any other request body, no
`?profileId=` query parameter, and no `/profiles/{id}/transactions` path nesting.
A caller cannot express "give me another profile's data" — the request has no field
in which to say it.

Every request to a profile-scoped resource resolves the profile server-side from the
session and passes it into the repository query. This pairs with the composite foreign
keys in `SCHEMA.md`: the service layer scopes the query, and the schema makes a
cross-profile row unstorable in the first place.

A request to a profile-scoped endpoint with no active profile selected returns
**`409 Conflict`** (`type: /errors/no-active-profile`) — authenticated, but not yet
scoped. It's a distinct state from "not logged in" (`401`) and the frontend should
handle it by showing the profile picker.

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
than 4 decimal places — silently rounding someone's money is worse than a `422`.

Currency is a 3-letter uppercase ISO 4217 code, validated with
`@Pattern(regexp = "^[A-Z]{3}$")`, mirroring the DB `CHECK`.

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
  "detail": "Human-readable, safe to show a user.",
  "instance": "/api/categories/9"
}
```

`type` is a stable machine-readable slug the frontend switches on; `detail` is prose
and may change without notice.

### Validation failures — `400`

Bean Validation failures on the request body. The field errors ride along as an
extension member:

```json
{
  "type": "/errors/validation-failed",
  "title": "Validation failed",
  "status": 400,
  "detail": "The request body has 2 invalid fields.",
  "errors": [
    { "field": "amount",   "message": "must be greater than 0" },
    { "field": "currency", "message": "must be a 3-letter ISO 4217 code" }
  ]
}
```

Cross-field rules (`periodEnd >= periodStart`, "at least one field" on a PATCH) are
`@AssertTrue` methods, so their `field` is the method's property name (`periodValid`,
`anyFieldSet`) rather than a real body field.

`400` for a malformed or invalid body; **`422`** is reserved for a body that is
structurally valid but violates a domain rule (depth limit, overlapping state,
category-in-use). The split is worth keeping consistent — it tells the frontend
whether to highlight a form field or show a dialog.

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

**A row belonging to another profile returns `404`, not `403`.**

`403` would confirm that the id exists and belongs to someone else — an existence
oracle that lets a caller enumerate ids and learn how much data another profile holds.
Since the caller has no legitimate way to know the row exists, `404` is both more
secure and more honest about what they're permitted to observe.

This falls out of the implementation naturally: repository queries are scoped to the
session's profile, so an out-of-scope id simply returns no row, and "no row" is
already `404`. The secure behavior is the default one, not an extra check that can be
forgotten.

```json
{
  "type": "/errors/not-found",
  "title": "Resource not found",
  "status": 404,
  "detail": "No transaction with id 4213."
}
```

The same reasoning applies to a `PUT /api/auth/active-profile` naming a profile owned
by another user: `404`.

### Constraint races — `409`

Every uniqueness rule is checked in the service before the insert so the specific slug
above (`email-taken`, `category-name-taken`, ...) is returned. If two requests race past
that check, the database constraint still wins and the resulting
`DataIntegrityViolationException` is mapped to a generic `409` `/errors/conflict` rather
than a `500`.

---

## Auth

### `POST /api/auth/register`

Creates a user account. Unauthenticated.

**Request**

| Field | Type | Validation |
|---|---|---|
| `email` | string | `@NotBlank` `@Email` `@Size(max = 254)` |
| `password` | string | `@NotBlank` `@Size(min = 12, max = 128)` |
| `displayName` | string | `@NotBlank` `@Size(max = 100)` |

`password` must also be at most 72 bytes UTF-8 (BCrypt's input limit); reported as field
`passwordWithinBcryptLimit`.

Email is lowercased server-side before persisting — `SCHEMA.md` relies on the service
layer doing this for case-insensitive uniqueness.

**Response `201 Created`** — `UserResponse`:

```json
{ "id": 1, "email": "chris@example.com", "displayName": "Chris", "createdAt": "2026-07-22T18:04:11Z" }
```

`password_hash` never appears in any response.

Registering does **not** log the user in and does not create a profile — the client
follows with `POST /api/auth/login`, then creates a first profile.

| Status | When |
|---|---|
| `201` | Created |
| `400` | Validation failure |
| `409` | Email already registered (`/errors/email-taken`) |

> `409` here leaks that an email is registered. That's unavoidable for a usable
> signup form, and the exposure is negligible on a single-user self-hosted instance.
> Noted rather than glossed over, since it's the opposite call from the `404` above.

### `POST /api/auth/login`

**Request:** `{ "email": "...", "password": "..." }` — both `@NotBlank`.

**Response `200 OK`** — sets the session cookie, and returns the user *plus* their
profiles so the client can render the profile picker without a second round trip:

```json
{
  "user": { "id": 1, "email": "chris@example.com", "displayName": "Chris" },
  "profiles": [
    { "id": 3, "name": "Personal", "defaultCurrency": "PLN" },
    { "id": 4, "name": "Company",  "defaultCurrency": "EUR" }
  ],
  "activeProfileId": null
}
```

`activeProfileId` is `null` immediately after login — no profile is assumed, even when
the user owns exactly one. Auto-selecting would make "which profile am I in?" implicit,
and every subsequent write would depend on a default the user never chose.

| Status | When |
|---|---|
| `200` | Authenticated |
| `400` | Validation failure |
| `401` | Bad credentials (`/errors/bad-credentials` — deliberately does not distinguish unknown email from wrong password) |

### `POST /api/auth/logout`

Invalidates the session and clears the cookie. **`204 No Content`**. Idempotent —
`204` even if there was no session.

### `GET /api/auth/me`

Current session state; the frontend calls this on page load to decide whether to show
the app, the login form, or the profile picker.

**Response `200 OK`** — same shape as the login response, with `activeProfileId`
populated if one is selected. **`401`** if unauthenticated.

### `PUT /api/auth/active-profile`

The profile switch. `PUT` rather than `POST` because it sets a single value to a
desired state and is idempotent — switching to profile 3 twice leaves the same state.

**Request**

| Field | Type | Validation |
|---|---|---|
| `profileId` | integer | `@NotNull` |

**This is the only place a profile id is ever accepted from the client**, and the
service must verify the profile belongs to the authenticated user before writing it to
the session. Everything downstream trusts the session value, so this check is the hinge
the whole scoping model turns on — it gets a dedicated test in the auth ticket.

**Response `200 OK`**

```json
{ "activeProfileId": 3, "profile": { "id": 3, "name": "Personal", "defaultCurrency": "PLN" } }
```

| Status | When |
|---|---|
| `200` | Switched |
| `400` | `profileId` missing |
| `401` | Not authenticated |
| `404` | No such profile, **or it belongs to another user** |

---

## Profiles

### `GET /api/profiles`

Profiles owned by the authenticated user. Scoped by user, not by active profile — this
is the one resource that is above the profile boundary.

**Response `200 OK`**

```json
[
  { "id": 3, "name": "Personal", "defaultCurrency": "PLN", "createdAt": "2026-01-04T09:12:00Z" },
  { "id": 4, "name": "Company",  "defaultCurrency": "EUR", "createdAt": "2026-02-11T14:31:00Z" }
]
```

Returned as a bare array, not an envelope: the list is inherently small (a handful per
user) and needs no pagination metadata.

| Status | When |
|---|---|
| `200` | OK (empty array if the user has no profiles yet) |
| `401` | Not authenticated |

### `POST /api/profiles`

**Request**

| Field | Type | Validation |
|---|---|---|
| `name` | string | `@NotBlank` `@Size(max = 100)` |
| `defaultCurrency` | string | `@NotBlank` `@Pattern("^[A-Z]{3}$")` |

**Response `201 Created`** with `Location: /api/profiles/{id}` and the
`ProfileResponse` body.

| Status | When |
|---|---|
| `201` | Created |
| `400` | Validation failure |
| `401` | Not authenticated |
| `409` | The user already has a profile with that name (`/errors/profile-name-taken`, mirrors `UNIQUE (user_id, name)`) |

Creating a profile does **not** switch to it — the client calls
`PUT /api/auth/active-profile` explicitly. One action, one effect.

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
| `401` | Not authenticated |
| `409` | No active profile selected |

### `POST /api/categories`

**Request**

| Field | Type | Validation |
|---|---|---|
| `name` | string | `@NotBlank` `@Size(max = 100)` |
| `parentId` | integer or null | Optional; `null` creates a root |
| `color` | string or null | Optional; `@Pattern("^#[0-9a-f]{6}$")` — lowercase hex; `null`/absent = inherit |

**Response `201 Created`** with `Location: /api/categories/{id}`. The body is a single
category node with `"children": []` — the same node shape as in the tree, so the client
can splice it straight into its local state.

| Status | When |
|---|---|
| `201` | Created |
| `400` | Validation failure |
| `401` / `409` | Not authenticated / no active profile |
| `404` | `parentId` does not exist **in the active profile** |
| `409` | A sibling with that name already exists (`/errors/category-name-taken`, mirrors the two partial unique indexes in `SCHEMA.md`) |
| `422` | Depth limit — `depth(parent) + 1 > 5` (`/errors/category-depth-exceeded`) |

### `PATCH /api/categories/{id}`

Rename and/or reparent. `PATCH` because both fields are optional and omitting one must
mean "leave it alone" — with `PUT`, omitting `parentId` would be indistinguishable from
"move to root", which would silently detach subtrees.

**Request** — at least one field must be present:

| Field | Type | Validation |
|---|---|---|
| `name` | string | Optional; `@Size(max = 100)`, non-blank if present |
| `parentId` | integer or null | Optional; **explicit `null` moves to root** |
| `color` | string or null | Optional; `@Pattern("^#[0-9a-f]{6}$")`; **explicit `null` clears it back to inherit** |

The `null`-vs-absent distinction is real — a plain `Long parentId` field cannot tell
"not sent" from "sent as null", and conflating them is how a move-to-root becomes a no-op
or vice versa. `UpdateCategoryRequest` is therefore the one non-record DTO: a small class
whose `@JsonSetter` setters flip a `parentIdSet`/`nameSet`/`colorSet` flag (Jackson calls a setter for
an explicit `null` but not for an absent field), with `@AssertTrue` checks for "at least
one field" and "name not blank". No extra library. It has its own tests.

**Response `200 OK`** — the updated node, with `children` populated (the subtree moves
with it).

| Status | When |
|---|---|
| `200` | Updated |
| `400` | Validation failure, or no fields supplied |
| `401` / `409` | Not authenticated / no active profile |
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
| `401` / `409` | Not authenticated / no active profile |
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
| `amount` | string (decimal) | `@NotNull` `@DecimalMin(value = "0", inclusive = false)` `@Digits(integer = 15, fraction = 4)` |
| `currency` | string | `@NotBlank` `@Pattern("^[A-Z]{3}$")` |
| `type` | string | `@NotNull`, one of `EXPENSE`, `INCOME` |
| `occurredOn` | string (date) | `@NotNull`, not after UTC today + 1 (field `occurredOnNotInFuture`) |
| `description` | string or null | Optional, `@Size(max = 500)` |

`@Digits(fraction = 4)` mirrors `NUMERIC(19,4)` — an amount with 5 decimals is a `400`,
not a silent round. Future-dated entries are blocked, but the server does not know the
client's timezone: the latest calendar date anywhere on Earth (UTC+14) is at most the UTC
date + 1, so that is the bound — every timezone can enter "today", genuinely future dates
are a `400` (`occurredOnNotInFuture`). If scheduled/planned transactions are ever wanted,
that's a feature with its own semantics, not a loosened validator.

`currency` is not defaulted from the profile server-side — the client sends it
explicitly, prefilled from `defaultCurrency` in the UI. An implicit server-side default
would make the currency of a record depend on profile settings at write time, which is
invisible in the payload and unpleasant to debug later.

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
  "subscriptionId": null,
  "createdAt": "2026-07-22T18:04:11Z"
}
```

`subscriptionId` is set only on transactions posted by the subscription charge job (see
[Subscriptions](#subscriptions)); it is read-only — not part of the request body.

The category is inlined as a small `{id, name}` object rather than a bare
`categoryId` — a transaction list is almost always rendered with category names, and
inlining avoids the client either doing N lookups or joining against the tree it
fetched separately. No `profileId` in the response: it's implied by the session, and
echoing it would suggest it's a meaningful client-side value.

| Status | When |
|---|---|
| `201` | Created |
| `400` | Validation failure |
| `401` / `409` | Not authenticated / no active profile |
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
| `page` | integer, default `0` | |
| `size` | integer, default `50`, max `200` | |

`from`/`to` are **inclusive on both ends**, matching the inclusive `period_end`
convention in `SCHEMA.md`. Keeping one convention across the whole project is worth
more than picking the "better" one per endpoint.

`includeDescendants=true` is what triggers the recursive CTE (`SCHEMA.md` → query 1)
to expand the subtree before filtering. Default `false` keeps the common case a plain
indexed lookup on `idx_txn_profile_category_date`; nobody pays for recursion they
didn't ask for.

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
| `400` | Malformed date, `size` over max, `from` after `to`, or `includeDescendants` without `categoryId` |
| `401` / `409` | Not authenticated / no active profile |
| `404` | `categoryId` not in the active profile |

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

---

## Budgets

Profile-scoped. A budget is a limit for one category over one inclusive date range.

### `POST /api/budgets`

**Request**

| Field | Type | Validation |
|---|---|---|
| `categoryId` | integer | `@NotNull` |
| `amountLimit` | string (decimal) | `@NotNull` `@DecimalMin(value = "0", inclusive = false)` `@Digits(integer = 15, fraction = 4)` |
| `currency` | string | `@NotBlank` `@Pattern("^[A-Z]{3}$")` |
| `periodStart` | string (date) | `@NotNull` |
| `periodEnd` | string (date) | `@NotNull`, must be `>= periodStart` (class-level `@AssertTrue`) |

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
| `401` / `409` | Not authenticated / no active profile |
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
| `401` / `409` | Not authenticated / no active profile |
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
| `401` / `409` | Not authenticated / no active profile |
| `404` | Budget not found in the active profile |

> Update and delete for budgets aren't designed here — the ticket lists create, list,
> and status. They'd follow the transaction pattern exactly (`PUT`/`DELETE`, `404`
> scoping, no `409` since nothing references a budget) and can be added when a ticket
> asks for them.

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
| `amount` | string (decimal) | `@NotNull` `@DecimalMin("0", inclusive = false)` `@Digits(15, 4)` |
| `currency` | string | `@NotBlank` `@Pattern("^[A-Z]{3}$")` |
| `billingPeriod` | string | `@NotNull`, one of `WEEKLY` `MONTHLY` `QUARTERLY` `YEARLY` |
| `nextBillingOn` | string (date) | `@NotNull` — may be in the past; the next job run posts the missed charges |
| `notes` | string or null | Optional, `@Size(max = 500)` |

New subscriptions are always `ACTIVE`; status is changed with `PUT`.

**Response `201 Created`** with `Location: /api/subscriptions/{id}` and `SubscriptionResponse`.

| Status | When |
|---|---|
| `201` | Created |
| `400` | Validation failure |
| `401` / `409` | Not authenticated / no active profile |
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
| `401` / `409` | Not authenticated / no active profile |

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
  is `monthlyCost × 12`.
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
| `401` / `409` | Not authenticated / no active profile |

### Charge posting (no endpoint)

`SubscriptionChargeService.postDueCharges(today)` runs daily at 00:05 UTC (`@Scheduled`), see
`SCHEMA.md` → "Charge posting". Transactions it creates are visible through the normal transaction
endpoints and carry `"subscriptionId": 12` in `TransactionResponse` (a new, nullable field —
manual entries have `null`). No client can trigger the job; there is nothing to protect.

---

## Backup

Manual, user-initiated backup: the client downloads a file and keeps it wherever it
likes; restore is uploading that file back. No scheduled job, no cloud target — on a
self-hosted instance the user already owns the machine, so "give me a file" beats
wiring credentials for a third-party drive.

**Why an application-level JSON export, not `pg_dump`.** The requirement is *choose
which profiles the backup contains*, and restore must never touch data the file
doesn't describe. A SQL dump is all-or-nothing: it can't scope to a subset of
profiles, it contains every user's rows (including password hashes), and restoring
one would clobber the whole instance. An application-level export contains exactly
the selected profiles' domain data, restores through the same validated service
layer as normal writes, and stays portable across schema versions via
`formatVersion` (a `pg_dump` from V3 can't load into a V5 schema; a JSON backup can
be upgraded on read).

Both endpoints sit **above the profile boundary**, like `GET /api/profiles`: they
are scoped to the authenticated user and require no active profile — no `409
no-active-profile` here. The UI for both lives on the profile picker for the same
reason. Cross-profile scoping stays server-side: the request names profile ids, and
any id not owned by the session's user is a `404`, exactly as with
`PUT /api/auth/active-profile`.

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
          "type": "EXPENSE", "occurredOn": "2026-08-03", "description": "Netflix subscription" },
        { "categoryRef": 1, "subscriptionRef": null, "amount": "34.9900", "currency": "PLN",
          "type": "EXPENSE", "occurredOn": "2026-07-21", "description": "liquid refill" }
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
- **No account data.** No email, no display name, no password hash — a backup
  restores into whatever account uploads it. This is also why the file is safe to
  keep in a synced folder: it holds finance data, not credentials.
- **`createdAt` is not exported.** It's audit metadata about *this* database's
  rows; restored rows get their own. Domain dates (`occurredOn`, budget periods,
  `nextBillingOn`) are preserved exactly.

| Status | When |
|---|---|
| `200` | File returned |
| `400` | `profileIds` missing or empty |
| `401` | Not authenticated |
| `404` | Any listed profile does not exist **or belongs to another user** |

### `POST /api/backup/restore`

`multipart/form-data` with a single part named `file` (max 20 MB —
`spring.servlet.multipart.max-file-size`). Multipart rather than a JSON body
because the client is handing back an opaque file from disk, and the browser's file
input produces exactly that.

**Restore always creates new profiles.** It never merges into or overwrites an
existing profile — a restore that could silently rewrite live data is the wrong
default for a recovery tool. If a profile name is taken, the restored profile is
named `"<name> (restored)"`, then `"<name> (restored 2)"`, and so on; the response
reports the final names. Everything is inserted in **one database transaction** —
a half-restored profile is worse than a failed restore, so any error rolls back the
whole upload.

One subtlety worth its own rule: a restored `ACTIVE` subscription whose
`nextBillingOn` is in the past would be treated as *overdue* by the daily charge
job, which would post "missed" charges — duplicating transactions the backup
already contains. On restore, such a `nextBillingOn` is **advanced by whole billing
periods to the first date ≥ today**, preserving the billing cadence (a monthly
charge on the 3rd stays on the 3rd). The charge history is already in the file's
transactions; the subscription just resumes on schedule.

Content is validated with the same rules as the normal write endpoints (amount
scale and positivity, ISO 4217 currency, name lengths, category depth ≤ 5, sibling
name uniqueness within the file) plus file-level integrity (dangling or duplicate
`ref`s, `parentRef` ordering).

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
| `401` | Not authenticated |
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
| `400` | Not a JSON object (`/errors/invalid-plan`), or executor-rejected plan (`/errors/invalid-plan` with `problems` array — unsupported `version`, dangling `categoryId`, unknown field, `merchants` before Phase 4b, ...) |
| `401` / `409` | Not authenticated / no active profile |
| `503` | Analytics service unreachable (`/errors/analytics-unavailable`) — the UI says "the analytics service isn't running", distinct from a bug |

### `POST /api/insights`

**Request**

| Field | Type | Validation |
|---|---|---|
| `name` | string | `@NotBlank` `@Size(max = 100)` |
| `plan` | object | `@NotNull`; a well-formed JSON object — deep validation, `version` support included, stays with the executor (see above); the explorer always executes before offering save, so an unexecutable saved plan is possible only by hand-crafting, and surfaces as `400` problems at execution |
| `viz` | object or null | Optional render overrides |
| `pinned` | boolean | Optional, default `false` |

**Response `201 Created`** with `Location: /api/insights/{id}` and
`InsightResponse`.

| Status | When |
|---|---|
| `201` | Created |
| `400` | Validation failure, or `plan` not a JSON object (`/errors/invalid-plan`, same slug as `POST /api/insights/execute`) |
| `401` / `409` | Not authenticated / no active profile |
| `409` | Name already used in this profile (`/errors/insight-name-taken`, mirrors `UNIQUE (profile_id, name)`) |

### `GET /api/insights`

Bare array of `InsightResponse`, sorted `pinned DESC, name ASC` (pinned
first — the dashboard consumes the same list). No pagination: dozens at
most. `200` / `401` / `409`.

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

> Phase 5 adds `GET /api/insights/capabilities` (is NL interpretation
> available?), `POST /api/insights/interpret` (free text → draft plan), and a
> narration endpoint — contracts to be added to this section when that phase
> starts, per `INSIGHTS.md` → "The AI layer".

---

## Status code summary

| Code | Meaning in this API |
|---|---|
| `200` | Success with a body |
| `201` | Resource created; `Location` header set |
| `204` | Success, no body (logout, all deletes) |
| `400` | Malformed body, failed Bean Validation, or bad query parameter |
| `401` | Not authenticated, or bad credentials |
| `403` | CSRF token missing or invalid |
| `404` | Not found — **including any row belonging to another profile or user** |
| `409` | State conflict: no active profile selected, uniqueness violation, or category in use |
| `413` | Uploaded backup file over the size limit |
| `422` | Body is valid but violates a domain rule: depth limit, category cycle, invalid backup content |
| `500` | Unhandled — a bug. Never used for an anticipated case. |
| `503` | The analytics service is unreachable — an operational state, not a bug |

Note the absence of `403` for authorization. Every cross-profile access is a `404` by
design (see [Errors](#errors)); `403` appears only for CSRF, which is about the request
itself rather than the resource.

---

## Open questions for implementation tickets

Recorded so they're decided deliberately, not by whoever writes the code first:

- **"Remember me."** Not specified. The idle timeout is set to 8 hours
  (`server.servlet.session.timeout`) so an open tab survives a working day; a
  persistent "remember me" login is a separate feature.
- **Rate limiting on `/api/auth/login`.** Nothing here prevents brute force. Low risk
  self-hosted, non-zero if exposed to the internet.
- **Bulk reassign of transactions between categories.** Implied by the
  `category-in-use` `409` flow but not designed; add it if the client-orchestrated
  loop proves too slow for large categories.
