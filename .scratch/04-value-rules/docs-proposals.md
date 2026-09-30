# Docs proposals — Candidate 4: One home per value rule

## (a) Proposed glossary terms

New terms:

```md
**Value rule**:
The condition a single value must meet to be accepted anywhere the API takes it — in a request body
or in a restored backup (for example: a money amount is greater than zero with at most 15 integer
and 4 decimal digits).
_Avoid_: validator, constraint, format check, validation (for the rule itself)
```

```md
**Pseudo-field**:
The name under which a validation failure is reported when its rule concerns no single body field —
a rule across several fields, or about which fields a partial update contains — so the name matches
no field of the body (for example `periodValid`).
_Avoid_: virtual field, fake field, error key, cross-field name
```

```md
**Category colour**:
A category's own display colour: a lowercase `#rrggbb` value, or none, in which case the category
shows the colour of its nearest ancestor that has one.
_Avoid_: colour code, tint, effective colour (for the stored value), inherited colour (for the stored value)
```

Definitions proposed for existing seed terms (names unchanged):

```md
**Money amount**:
A positive decimal with at most 15 integer and 4 decimal digits, always paired with a currency code;
on the wire it is a decimal string, never a JSON number.
_Avoid_: price, sum, value, float
```

```md
**Currency code**:
The three uppercase letters of an ISO 4217 currency (for example `PLN`) that says which currency a
money amount is in.
_Avoid_: currency symbol, currency name, ccy
```

## (b) Proposed ADRs

None. The decisions here either amend `docs/API.md` / `ARCHITECTURE.md` (the repository's recorded
decisions — updated in place below, per the repo rule) or are ordinary, easily reversed code choices
(where the annotations live, how the backup validator reads parameters).

## (c) Required updates to recorded-decision documents

All updates travel in the same change as the code step named in brackets.

### `docs/API.md` → "Cross-cutting decisions" → "Money: decimal string + ISO 4217 code" [step 2]

After the paragraph "On input, amount strings are parsed to `BigDecimal` and rejected if they carry
more than 4 decimal places ...", add:

> The amount rule — greater than zero, at most 15 integer and 4 decimal digits, i.e. what
> `NUMERIC(19,4)` with `CHECK (> 0)` can hold — is declared once, as the composed constraint
> `@MoneyAmount` (built from `@DecimalMin(value = "0", inclusive = false)` and
> `@Digits(integer = 15, fraction = 4)`, whose limits come from `Money`). Presence is stated
> separately on each field (`@NotNull`). Its violations are the built-ins' own, reported on the field:
> "must be greater than 0" and "numeric value out of bounds (<15 digits>.<4 digits> expected)".

Replace "Currency is a 3-letter uppercase ISO 4217 code, validated with
`@Pattern(regexp = "^[A-Z]{3}$")`, mirroring the DB `CHECK`." with:

> Currency is a 3-letter uppercase ISO 4217 code, validated with `@CurrencyCode` — a composed
> `@Pattern(regexp = "^[A-Z]{3}$")` whose message is "must be a 3-letter ISO 4217 code" — mirroring
> the DB `CHECK`. Presence is stated separately on each field (`@NotBlank`).

At the end of the "**OpenAPI schema.**" paragraph, add (coordinate with candidate 15, which rewrites
this paragraph when the money schema is stated once — keep this sentence's substance):

> The value-rule constraints do not carry this `@Schema`: springdoc reads `@Schema` only when it is
> directly on the field. It does expand a composed constraint's built-in constraints, so `required`
> flags, patterns and minimums are the same as if the built-ins were written on the field.

### `docs/API.md` → "Errors" → "Validation failures — `400`" [step 4]

In the example body, change the detail to `"The request body has 2 invalid field(s)."` (the handler's
actual wording; pre-existing drift).

Replace the paragraph "Cross-field rules (`periodEnd >= periodStart`, "at least one field" on a
PATCH) are `@AssertTrue` methods, so their `field` is the method's property name (`periodValid`,
`anyFieldSet`) rather than a real body field." with:

> Each error names the body field it concerns — including the value rules `@MoneyAmount`,
> `@CurrencyCode` and `@HexColor`, which are composed from built-in constraints and report the
> built-ins' messages on the field. A rule that needs code instead — one across several fields, one
> about which fields a PATCH body contains, or one that reads the clock or counts bytes — is an
> `@AssertTrue` method, so its `field` is a **pseudo-field**: the method's property name rather than a
> body field. The complete list:
>
> | Pseudo-field | Endpoint | Belongs to |
> |---|---|---|
> | `occurredOnNotInFuture` | `POST`/`PUT /api/transactions` | `occurredOn` |
> | `passwordWithinBcryptLimit` | `POST /api/auth/register`, `PUT /api/auth/password` | `password` |
> | `periodValid` | `POST`/`PUT /api/budgets` | `periodEnd` |
> | `anyFieldSet` | `PATCH /api/categories/{id}` | no single field |
> | `nameValid` | `PATCH /api/categories/{id}` | `name` |
>
> Adding a pseudo-field is a contract change and is recorded here. The order of `errors` is not
> significant.

(Candidate 11 adds a separate paragraph to this section about query parameters; the two edits do
not overlap.)

### `docs/API.md` → "Profiles" → `POST /api/profiles` request table [step 2]

`defaultCurrency` row, Validation column: `@NotBlank` `@CurrencyCode` (`^[A-Z]{3}$`).

### `docs/API.md` → "Categories" → `POST /api/categories` request table [step 2]

`color` row, Validation column: Optional; `@HexColor` — lowercase `#rrggbb`; `null`/absent = inherit.

### `docs/API.md` → "Categories" → `PATCH /api/categories/{id}` [step 4]

`color` row, Validation column: Optional; `@HexColor`; **explicit `null` clears it back to inherit**.

In the paragraph beginning "The `null`-vs-absent distinction is real ...", replace "with
`@AssertTrue` checks for "at least one field" and "name not blank"" with:

> A present `color` is validated on the field exactly as in `POST` (`@HexColor`), so an invalid
> colour is reported as `color`. `@AssertTrue` checks remain for "at least one field" (`anyFieldSet`)
> and "a present name is not blank" (`nameValid`), because both depend on which fields the body
> contains.

### `docs/API.md` → "Transactions" → `POST /api/transactions` [step 2]

Request table: `amount` → `@NotNull` `@MoneyAmount` (greater than 0, at most 15 integer and 4 decimal
digits); `currency` → `@NotBlank` `@CurrencyCode`.

First paragraph under the table: replace "`@Digits(fraction = 4)` mirrors `NUMERIC(19,4)`" with
"`@MoneyAmount`'s 4-decimal limit mirrors `NUMERIC(19,4)`".

### `docs/API.md` → "Budgets" [steps 2 and 5]

`POST /api/budgets` request table: `amountLimit` → `@NotNull` `@MoneyAmount` (greater than 0, at most
15 integer and 4 decimal digits); `currency` → `@NotBlank` `@CurrencyCode`; `periodEnd` row unchanged
(its failure is the pseudo-field `periodValid`). Add under the table: "`POST` and `PUT` share one body,
`BudgetRequest`."

`PUT /api/budgets/{id}`: "Full replacement — same body (`BudgetRequest`) and validation as `POST`."

### `docs/API.md` → "Subscriptions" → `POST /api/subscriptions` table [step 2]

`amount` → `@NotNull` `@MoneyAmount`; `currency` → `@NotBlank` `@CurrencyCode`.

### `docs/API.md` → "Backup" → `POST /api/backup/restore` [step 3]

Replace "Content is validated with the same rules as the normal write endpoints (amount scale and
positivity, ISO 4217 currency, name lengths, category depth ≤ 5, sibling name uniqueness within the
file) plus file-level integrity (dangling or duplicate `ref`s, `parentRef` ordering)." with:

> Content is validated with the same rules as the normal write endpoints (amount scale and
> positivity, ISO 4217 currency, category colour format, name and text lengths, category depth ≤ 5,
> sibling name uniqueness within the file) plus file-level integrity (dangling or duplicate `ref`s,
> `parentRef` ordering). The amount, currency and colour checks read the same parameters as
> `@MoneyAmount`, `@CurrencyCode` and `@HexColor`, and a test holds restore and the write endpoints to
> one table of values; the problem strings are restore's own wording. Two known differences are
> recorded rather than intended: restore rejects dates outside the years 1–9999, which the write
> endpoints do not bound, and restore does not apply the transaction date's not-in-the-future rule.

### `ARCHITECTURE.md` → §3 "Backend" → package layout [step 2]

Change the `dto/` line to:

> `├── dto/          request/response records, and the value-rule constraints they share (@MoneyAmount, @CurrencyCode, @HexColor)`

### `ARCHITECTURE.md` → §3 → "OpenAPI schema and the Jackson 2/3 split" [step 2]

After the sentence ending "... carry an explicit `@Schema(type = "string", format = "decimal", ...)`
(from `io.swagger.v3.oas.annotations.media.Schema`) to correct this;", add (coordinate with candidate
15, which rewrites this section when the money schema is stated once — keep the substance):

> The value-rule constraints (`@MoneyAmount`, `@CurrencyCode`, `@HexColor`) are composed from
> built-in Bean Validation constraints; springdoc's swagger-core (2.2.55) expands those built-ins, so
> the schema keeps its `required` flags, patterns and minimums, but it reads `@Schema` only when it is
> directly on a field — which is why the decimal-string `@Schema` sits on each money field and not on
> `@MoneyAmount`.

### `docs/SCHEMA.md`

No change. "`char_length <= 100` mirrors `@Size(max = 100)` on the request DTO" (the `txn` section)
stays true; the money and currency conventions table stays true.

### `docs/LESSONS.md` (git-ignored; not a recorded-decision document) [step 6]

One new entry, "Constraint composition: one annotation per value rule", referencing "Sharing a
validation rule across records" and "OpenAPI's `required` is a Bean Validation artifact" instead of
repeating them.
