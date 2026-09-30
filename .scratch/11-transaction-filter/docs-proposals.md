# Docs proposals — Candidate 11: Bind the Transaction filter once

## (a) Proposed glossary terms

```md
**Transaction filter**:
The optional criteria that select a profile's transactions: an inclusive date range, a category
(optionally with all its subcategories), a direction (expense or income) and a search term. The list
and its aggregates apply the same filter, so a total covers exactly the rows its list shows.
_Avoid_: query, criteria, search parameters, filter params
```

```md
**Aggregate**:
A figure computed over every transaction a filter matches — never over one page — and kept per
currency: the per-currency summary, the per-category counts and the per-category totals.
_Avoid_: stats, report, roll-up (the client's sum over the category tree is the roll-up)
```

```md
**Search term**:
Text matched case-insensitively and literally (no wildcards) against a transaction's description or
merchant; a blank search term means no search.
_Avoid_: query, keyword, q (outside the wire name)
```

## (b) Proposed ADRs

None. The decisions either document the existing wire contract in `docs/API.md` (updated in place,
per the repo rule) or are ordinary code choices that are easy to reverse (where the filter record
lives, where its rules run, how springdoc is told to flatten it).

## (c) Required updates to recorded-decision documents

All in `docs/API.md`; they document behaviour that exists today and that the characterisation tests
pin, so they may land with step 1 or with the binding change (step 3).

### `docs/API.md` → "Errors" → new subsection after "Validation failures — `400`"

(Candidate 4 edits the paragraph above it — the pseudo-field list; the two edits do not overlap.)

> ### Query parameter problems — `400`
>
> A query parameter that cannot be read — a malformed date, an unknown enum value such as
> `type=REFUND`, a non-numeric id, a non-boolean flag — or that breaks a rule of the endpoint answers
> `400` with `type: /errors/invalid-request`, title "Invalid request", a `detail` that names the
> parameter, and **no** `errors` member:
>
> ```json
> {
>   "type": "/errors/invalid-request",
>   "title": "Invalid request",
>   "status": 400,
>   "detail": "Query parameter 'from' has an invalid value.",
>   "instance": "/api/transactions"
> }
> ```
>
> `/errors/validation-failed` and its `errors` list are only for request bodies. Only the first
> problem is reported. The transaction filters use these sentences: `Query parameter '<name>' has an
> invalid value.`, `'from' must not be after 'to'.`, `'includeDescendants' requires 'categoryId'.`,
> `'q' must be at most 100 characters.`, `'page' must be 0 or greater.`, `'size' must be between 1
> and 200.` A parameter that cannot be read is reported before the active-profile check (`409`); a
> broken rule after it.

### `docs/API.md` → "Transactions" → `GET /api/transactions`

After the query-parameter table, add:

> The six filters (`from`, `to`, `categoryId`, `includeDescendants`, `type`, `q`) mean the same
> thing, and are checked the same way, here and on the aggregates `summary` and `category-totals`
> below; `page` and `size` exist only on this list.

Status table, `400` row:

> | `400` | `/errors/invalid-request` ([Query parameter problems](#query-parameter-problems--400)): a value that cannot be read in any parameter (a date, `type`, `categoryId`, `includeDescendants`, `page`, `size`), `page` below 0, `size` outside 1–200, `from` after `to`, `includeDescendants` without `categoryId`, or `q` over 100 chars |

### `docs/API.md` → "Aggregates" → `GET /api/transactions/summary`

Status table, `400` row:

> | `400` | `/errors/invalid-request`: a filter value that cannot be read, `from` after `to`, `includeDescendants` without `categoryId`, or `q` over 100 chars |

(`category-totals` keeps "Statuses as `summary`.")

### `docs/API.md` → "Aggregates" → `GET /api/transactions/category-counts`

Status table, `400` row:

> | `400` | `/errors/invalid-request`: `q` over 100 chars |

### `docs/API.md` → "Status code summary"

`400` row:

> | `400` | A malformed body or a bad query parameter (`/errors/invalid-request`), or a body that fails Bean Validation (`/errors/validation-failed`, with an `errors` list) |

### `ARCHITECTURE.md`, `docs/SCHEMA.md`, `docs/INSIGHTS.md`

No change.

### `docs/LESSONS.md` (git-ignored; not a recorded-decision document)

One new entry, "Binding query parameters to a record", after step 3: constructor binding by
component name; an absent primitive component is a binding error (reference "Jackson 3 rejects a
missing `boolean` record field by default" for the parallel trap); the constructor must not throw (a
500); `@ParameterObject` only documents; binding failures arrive as `MethodArgumentNotValidException`
with `isBindingFailure()`; headers can bind too, with `From` among the filtered ones.
