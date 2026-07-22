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
- [Status code summary](#status-code-summary)

---

## Cross-cutting decisions

### Authentication: session cookie

Spring Security's standard form-login-style session, with the session id in an
**`HttpOnly`, `SameSite=Lax`, `Secure`** cookie. Not JWT.

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
`spring.jackson.generator.write-bigdecimal-as-plain=true` to avoid scientific notation
on large values.

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

Returns the profile's full category forest as **nested JSON**.

```json
[
  {
    "id": 1,
    "name": "Shopping",
    "parentId": null,
    "depth": 1,
    "children": [
      {
        "id": 4, "name": "Stimulants", "parentId": 1, "depth": 2,
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

The `null`-vs-absent distinction is real and needs `JsonNullable` (or an equivalent
wrapper) in the DTO — a plain `Long parentId` field cannot tell "not sent" from "sent
as null", and conflating them is how a move-to-root becomes a no-op or vice versa.
This is the one genuinely fiddly DTO in the API and deserves its own tests.

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
| `409` | **In use** — has child categories, transactions, or budgets (`/errors/category-in-use`) |

The `409` is the API-level expression of `ON DELETE RESTRICT` (`SCHEMA.md` → "cascade
ownership, restrict references"). The service checks and returns a structured error
rather than letting a raw FK violation surface as a `500`:

```json
{
  "type": "/errors/category-in-use",
  "title": "Category is in use",
  "status": 409,
  "detail": "'Groceries' has 2 subcategories and 143 transactions. Reassign or delete them first.",
  "childCategoryCount": 2,
  "transactionCount": 143,
  "budgetCount": 1
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
| `occurredOn` | string (date) | `@NotNull` `@PastOrPresent` |
| `description` | string or null | Optional, `@Size(max = 500)` |

`@Digits(fraction = 4)` mirrors `NUMERIC(19,4)` — an amount with 5 decimals is a `400`,
not a silent round. `@PastOrPresent` blocks future-dated entries; if scheduled/planned
transactions are ever wanted, that's a feature with its own semantics, not a loosened
validator.

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
  "createdAt": "2026-07-22T18:04:11Z"
}
```

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

**Response `200 OK`** — bare array of `BudgetResponse`, sorted `periodStart DESC`.
No pagination: budgets are per-category-per-period and stay in the dozens.

`activeOn=2026-07-15` is the common call ("what am I tracking right now?") and is
served by `idx_budget_profile_period`.

| Status | When |
|---|---|
| `200` | OK |
| `400` | Malformed date |
| `401` / `409` | Not authenticated / no active profile |

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
  "percentUsed": 72.5,
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
   `percentUsed` is a JSON *number*, not a decimal string: it's a computed ratio for
   display, never money, so float precision is harmless here. `amountLimit > 0` is
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
| `422` | Body is valid but violates a domain rule: depth limit, category cycle |
| `500` | Unhandled — a bug. Never used for an anticipated case. |

Note the absence of `403` for authorization. Every cross-profile access is a `404` by
design (see [Errors](#errors)); `403` appears only for CSRF, which is about the request
itself rather than the resource.

---

## Open questions for implementation tickets

Recorded so they're decided deliberately, not by whoever writes the code first:

- **Session timeout and "remember me."** Not specified here. Spring Security's default
  30-minute idle timeout is probably wrong for a personal finance app someone leaves
  open in a tab.
- **Rate limiting on `/api/auth/login`.** Nothing here prevents brute force. Low risk
  self-hosted, non-zero if exposed to the internet.
- **Bulk reassign of transactions between categories.** Implied by the
  `category-in-use` `409` flow but not designed; add it if the client-orchestrated
  loop proves too slow for large categories.
