# One home per value rule: money amount, currency code and category colour as composed constraints

Status: ready-for-agent
Candidate: 4 — One home per value rule
Strength: Worth exploring
Depends on: none

## Problem Statement

What counts as a valid money amount, currency code or category colour is written out again at every
place the API accepts one. The money rule is a stack of three validation annotations repeated on five
request records; the currency rule is a regular expression plus a hand-typed message repeated on six;
the colour rule appears on the category create body, again as a hand-written method on the category
PATCH body, and a third time inside the backup restore validator, which also carries its own copies
of the money and currency rules (its money check even says in a comment that it copies the
annotations).

For the owner and any future contributor this means a rule change is a hunt across a dozen sites,
and a missed copy fails silently. The failure that matters most is in backup restore: if the write
endpoints and the restore validator disagree, a backup of data the API accepted can fail to restore,
or a restore can admit data the API would reject on the next edit. Nothing checks that the two
agree, and no test pins the validation messages the API returns, even though the frontend shows them
to users word for word. Phase 6 (investments) will add many more money-bearing records and would
multiply the copies.

Two smaller symptoms of the same scattering: the budget create and update bodies are two identical
records that each carry the period rule, and a bad colour on the category PATCH body is reported
under the undocumented name `colorValid`, while the API document and the create endpoint both use
`color`.

## Solution

Each value rule gets one home: a composed Bean Validation constraint — `@MoneyAmount`,
`@CurrencyCode`, `@HexColor` — that request records use by name, next to the ordinary presence
annotation (`@NotNull` / `@NotBlank`). The composed constraints are assembled from exactly the
built-in constraints used today, so every 400 validation body keeps the same fields, the same
messages and the same number of entries, and the OpenAPI document keeps the same required flags,
patterns and minimums.

Backup restore keeps its own, more readable problem wording, but reads the rule's parameters (digit
limits, regular expressions, messages) from the same home, and a table-driven test proves that the
write endpoints and backup restore accept exactly the same values.

Two changes are made on purpose and documented: a bad colour on `PATCH /api/categories/{id}` is now
reported under `color` — what the API document already says and what `POST /api/categories` already
does — and the two budget body records become one `BudgetRequest`, which renames one component in
the OpenAPI document and the generated frontend types without changing any JSON on the wire.

## User Stories

1. As the owner, I want the money-amount rule stated once, so that a change to it is one edit instead of five plus a backup copy.
2. As the owner, I want the currency-code rule, its regular expression and its message stated once, so that a typo in one copy can no longer make one endpoint disagree with the others.
3. As the owner, I want the category-colour rule stated once and used by both category bodies, so that create and update can never validate colours differently.
4. As the owner, I want the money limits to come from the same place that defines the storage format `NUMERIC(19,4)`, so that validation cannot allow a scale that the entities' normalisation would reject with a 500.
5. As a future contributor adding a Phase 6 money-bearing record, I want to write "required, and a money amount" as two annotations by name, so that I cannot forget one of the three parts of the rule.
6. As a future contributor adding a currency field, I want one annotation that carries both the pattern and the message, so that my field reports the same message as every other currency field.
7. As a future contributor reading a request record, I want the rule named after the domain concept (money amount, currency code, colour), so that I understand the field without decoding stacked numbers.
8. As a future contributor, I want each composed constraint's documentation to say why it has no single-violation reporting and no attribute overrides, so that I do not "tidy" it into a silent wire change.
9. As a future contributor, I want the documentation of the money constraint to say why it does not carry the decimal-string schema annotation, so that I do not move it there and lose it from the OpenAPI document.
10. As a future contributor, I want presence (`@NotNull` / `@NotBlank`) to stay on the field, so that every value rule means the same thing — "if present, it must look like this" — including the optional colour.
11. As a self-hosting user, I want every existing validation error to keep its field name, message and count, so that the forms I use show the same errors after the upgrade.
12. As a self-hosting user entering an amount of `0`, I want to keep seeing "must be greater than 0" under the amount field, so that nothing about entering money changes for me.
13. As a self-hosting user entering an amount with five decimals, I want it still rejected with the same message, so that my money is never silently rounded.
14. As a self-hosting user entering a lowercase currency code, I want the same "must be a 3-letter ISO 4217 code" message, so that I know how to correct it.
15. As a self-hosting user whose browser sends a non-English `Accept-Language`, I want the messages to be localised exactly as they are today, so that the upgrade does not change the language of my errors.
16. As a self-hosting user, I want a backup of anything the API accepted to restore, so that my backups are a reliable recovery tool.
17. As a self-hosting user, I want a restore to reject exactly what the API would reject for money, currency, colour and name lengths, so that restored data can be edited normally afterwards.
18. As a self-hosting user restoring an invalid backup, I want the problem list to read exactly as it does today, so that the messages still pinpoint the entry and say what is wrong in plain words.
19. As a self-hosting user changing a category's colour to an invalid value, I want the error attached to the colour field, so that the screen can highlight the input I got wrong.
20. As the owner maintaining the frontend, I want the generated request types to keep every required flag, so that the typed request bodies stay accurate.
21. As the owner maintaining the frontend, I want one generated type for the budget create and update body, so that the hooks do not pretend an update body is a create body.
22. As the owner, I want the budget create and update endpoints to share one body record, like transactions and insights already do, so that the period rule exists once.
23. As the owner, I want the subscription create and update bodies to stay separate, so that `status` stays required on update and absent on create without conditional validation.
24. As the owner, I want `docs/API.md` to list every pseudo-field the API can return, so that a client knows the complete set of names that are not body fields.
25. As the owner, I want `docs/API.md` to name the composed constraints and keep the numbers in words, so that the document and the code state the same rule.
26. As the owner, I want `ARCHITECTURE.md` to say that the value-rule constraints live beside the request records, so that a newcomer finds them.
27. As a reviewer, I want a test that feeds one table of values to the request rules and to the backup rules and expects the same verdicts, so that I can check the promise "restore uses the same rules as the write endpoints" by running it.
28. As a reviewer, I want a test that pins the exact field and message of every money, currency and colour violation on every request record, so that a refactor or a library upgrade that changes a 400 body fails the build.
29. As a reviewer, I want the characterisation tests to land before the production change and pass on the old code, so that I can see the refactor kept behaviour rather than trust it.
30. As a reviewer, I want the two deliberate changes (the colour field name on PATCH and the budget schema component rename) listed with their test and document updates, so that nothing on the wire changes silently.
31. As a reviewer, I want the OpenAPI document diffed before and after, so that I can confirm the only schema differences are the budget component rename and the new pattern on the PATCH colour.
32. As a future contributor, I want the message tests to pin the English locale, so that they pass on a machine whose default locale is Polish.
33. As the owner, I want the backup validator to stay a set of pure functions over the parsed file, so that its tests keep running without a Spring context.
34. As the owner, I want no new abstraction for name and text lengths, so that a one-annotation rule does not grow a wrapper that adds nothing.
35. As the owner, I want known differences between restore and the write endpoints (date ranges, the not-in-the-future rule) written down rather than hidden, so that they can be fixed deliberately.
36. As a learner of Spring, I want a short lesson on constraint composition tied to this code, so that I understand why the constraints are shaped this way.
37. As a frontend developer working on shared problem messages (candidate 2), I want a definitive list of pseudo-fields and what real field each belongs to, so that one alias table covers every case.
38. As the maintainer of the OpenAPI work (candidate 15), I want to know which schema facts depend on springdoc expanding composed constraints, so that a dependency downgrade is caught.

## Implementation Decisions

**Modules built**

- **`MoneyAmount`** — a composed constraint in the `dto` package for `BigDecimal` values. Interface: `null` is valid; a value that is not greater than 0 yields one violation "must be greater than 0"; a value with more than 15 integer digits or more than 4 decimal digits yields one violation "numeric value out of bounds (<15 digits>.<4 digits> expected)" (trailing zeros count: `1.00000` is rejected); both may occur for the same value; violations are reported on the annotated property. It is composed of the built-in `DecimalMin` (value 0, not inclusive) and `Digits` (integer and fraction limits taken from `Money`), with an empty validator list, **without** single-violation reporting and **without** attribute overrides, and with the same target list as the built-in constraints. Its own mandatory `message` attribute is never shown; its documentation says so and says why each of these choices is load-bearing.
- **`CurrencyCode`** — a composed constraint in `dto` for `String` values: `null` is valid; anything not matching `^[A-Z]{3}$` yields "must be a 3-letter ISO 4217 code". It is composed of the built-in `Pattern` with that regular expression and message. It exposes two public constants, the regular expression and the message, used by backup restore.
- **`HexColor`** — a composed constraint in `dto` for `String` values: `null` is valid (it means "inherit" for a category); anything not matching `^#[0-9a-f]{6}$` yields "must be a lowercase hex color like #a4d9c6". Built like `CurrencyCode`, with the same two public constants.
- **`BudgetRequest`** — the single body of `POST /api/budgets` and `PUT /api/budgets/{id}`: `categoryId`, `amountLimit`, `currency`, `periodStart`, `periodEnd`, and the existing cross-field period rule, still reported as `periodValid`. It replaces `CreateBudgetRequest` and `UpdateBudgetRequest`.

**Modules modified**

- **`Money`** (model) states the maximum number of integer digits (15 — `NUMERIC(19,4)` minus the scale) beside its existing `SCALE`. `MoneyAmount` and backup restore both read these two numbers.
- **Request records** use the rules by name, with presence kept on the field: money fields become "required and a money amount" on `TransactionRequest`, `SubscriptionRequest`, `UpdateSubscriptionRequest` and `BudgetRequest`; currency fields become "not blank and a currency code" on those four and on `CreateProfileRequest`; `CreateCategoryRequest.color` becomes an optional hex colour. The money fields keep their decimal-string `@Schema` annotation (owned by candidate 15).
- **`UpdateCategoryRequest`** puts `HexColor` on its colour field and drops its hand-written colour method and pattern constant. The present-versus-absent tracking is unaffected: an absent colour and an explicit `null` are both valid, a present value must match, exactly as before. Its remaining cross-field checks (`anyFieldSet`, `nameValid`) stay.
- **`BackupValidator`** keeps its structure, its ordering, its problem cap and every problem string, but takes the currency regular expression and message from `CurrencyCode`, the colour regular expression and message from `HexColor`, and the money digit limits from `Money`. Its name and text length limits stay its own constants.
- **`BudgetController`** and **`BudgetService`** take `BudgetRequest` for create and update.
- **Frontend** (step 5 only): the committed generated schema types are regenerated from a running backend; the budget body type alias points at the generated `BudgetRequest` and is renamed to match, together with the two budget hooks that use it and a comment in the budget form.

**Rules that deliberately do not become modules**

- Name and text lengths (`@Size(max = 100)` and `@Size(max = 500)`) stay where they are: a wrapper around one built-in annotation would be a pass-through. Drift between these and backup restore is caught by the agreement test.
- Pseudo-fields that exist because a rule needs code — `occurredOnNotInFuture` (a clock), `passwordWithinBcryptLimit` (a byte count; kept on purpose, as recorded in the owner's lessons), `periodValid` (cross-field), `anyFieldSet` and `nameValid` (presence rules of the category PATCH body) — stay unchanged.

**API contract**

- Unchanged: every status code, every `type` slug, every `errors[]` field name and message and the number of entries (and so the `detail` text) for every body except the one below; every backup restore `problems[]` string; every required flag, pattern and minimum in the OpenAPI document.
- Changed on purpose (1): a bad colour on `PATCH /api/categories/{id}` is reported with field `color` instead of `colorValid`. This matches the API document's PATCH table and the create endpoint; no client relies on `colorValid`.
- Changed on purpose (2): the OpenAPI components `CreateBudgetRequest` and `UpdateBudgetRequest` are replaced by `BudgetRequest`; the JSON accepted by the two budget endpoints is identical. `UpdateCategoryRequest.color` additionally shows its pattern in the OpenAPI document.
- `errors[]` order is not part of the contract, before or after.

**Architecture**

- The value-rule constraints live in `dto`, beside the records that use them; no layer rule is affected (only controller, service and repository are layers in the ArchUnit test).
- No seam is introduced: nothing varies behind these constraints.
- The decimal-string representation of money (Jackson configuration plus the per-field `@Schema`) is a separate concern owned by candidate 15; the constraints do not carry `@Schema` because springdoc only reads it when it is directly on the field.

**Documents updated in the same change** (details in docs-proposals)

- `docs/API.md`: the money and currency paragraphs name `MoneyAmount` and `CurrencyCode`; the Transactions, Budgets, Subscriptions, Profiles and Categories tables name the composed constraints and keep the numbers in words; "Validation failures — 400" lists the complete set of pseudo-fields; the category PATCH prose says colour is validated on the field; Budgets says both methods share one body; the Backup paragraph says restore uses the same parameters and names the known date differences.
- `ARCHITECTURE.md`: the package line for `dto` mentions the shared value-rule constraints; the OpenAPI section says springdoc expands composed constraints' built-ins (so required flags, patterns and minimums stay) but ignores a `@Schema` placed on an annotation.

**Lesson** — one `docs/LESSONS.md` entry on constraint composition (see Testing Decisions and Further Notes), referencing the existing entries "Sharing a validation rule across records" and "OpenAPI's `required` is a Bean Validation artifact".

**Ordered steps** (each leaves `./mvnw verify` green; step 5 also leaves the frontend build, lint and tests green)

1. **Characterisation tests.** Add the Validator-level value-rule test and the request/backup agreement test (Testing Decisions). They pass on today's code. No production change.
2. **Introduce the three composed constraints and the integer-digit limit in `Money`;** replace the stacked annotations on the five money, six currency and one colour site (`CreateCategoryRequest`). Verify with the tests and by diffing `/v3/api-docs` before and after: no difference expected.
3. **Backup restore reads the shared parameters.** No behaviour change; the backup validator's tests and the agreement test stay green.
4. **Category PATCH colour on the field.** `UpdateCategoryRequest` uses `HexColor`; the hand-written method goes; the two colour assertions that pinned `colorValid` now expect `color`; the API document's pseudo-field list and PATCH prose are updated in the same commit.
5. **One budget body.** Merge the budget records into `BudgetRequest`; update the budget controller and service; regenerate the frontend's schema types from a running backend; repoint and rename the frontend alias. The API document's Budgets section says both methods share the body.
6. **Remaining documentation and the lesson** (the constraint wording in the API document's tables, the architecture document's lines, the lessons entry), if not already carried by steps 2 and 4.

## Testing Decisions

**What makes a good test here.** A test asserts what a caller can observe at an interface: the
violations (property path and message) that Bean Validation reports for a request record, the
problem strings and verdict that backup restore returns for a file, and the HTTP body a request gets.
It does not inspect annotation metadata, count meta-annotations, or reflect over constraint
attributes — those are implementation details the refactor is allowed to change.

**Seam chosen, and why.** The value rules are tested at the Bean Validation `Validator` applied to
the request records (in-process, no Spring context), and backup restore at its existing entry point
`BackupValidator.validate`. The 400 body is a direct projection of the Validator's violations through
the unchanged exception handler, which the existing controller tests already cover end to end, so the
Validator is the highest seam that can pin every record-and-rule combination cheaply (twelve at step
1; the PATCH colour joins as the thirteenth at step 4, when it gets a field constraint — until then
its rule is the hand-written method already pinned by the category PATCH body's own test). Testing
every combination through MockMvc would need Testcontainers for each case; testing the annotation
types directly would test nothing observable. Two seams are unavoidable because backup restore is a
second, independent interface that must agree with the first — the agreement test is the point where
they meet.

**Tests added first (characterisation — green before and after the refactor)**

- *Value-rule test* (new, beside the request records): for every request property that carries the
  money, currency or colour rule — `TransactionRequest`, `SubscriptionRequest`,
  `UpdateSubscriptionRequest`, both budget records (later `BudgetRequest`) for money; those plus
  `CreateProfileRequest` for currency; `CreateCategoryRequest` for colour — boundary values yield
  exactly the expected set of (property, message) pairs. Cases: `0`, a negative amount, five decimals,
  `1.00000`, sixteen integer digits, `999999999999999.9999`, `0.0001`, `null` (money); `PLN`, `pln`,
  `PL`, `PLNX`, `""`, `null` (currency); `#a4d9c6`, `#A4D9C6`, `a4d9c6`, `#a4d`, `null` (colour).
  The validator is built with an English default locale (Hibernate Validator ships Polish messages).
  This is the first test that pins the messages; today only field names are asserted.
- *Agreement test* (added to the backup validator's test class, which has package access): one table
  per rule — money, currency, colour, names (profile, category, subscription), merchant, description
  and notes — listing each value with its expected verdict; every row asserts that the matching
  request property (through `Validator.validateValue`) and the matching backup field (through a
  one-entry backup file) both give that verdict. Asserting the expected verdict, not only equality,
  stops the two sides from being wrong together.

**Tests that change on purpose (step 4)**

- `CategoryColorTest.patchWithInvalidColorIs400` expects field `color`.
- `UpdateCategoryRequestTest.malformedColorViolatesColorValid` expects property `color` and is renamed accordingly.

**Tests that survive unchanged** — all transaction, budget, subscription, profile, category, auth and
passwordless controller tests (they pin statuses, slugs, field names and counts that must not move),
and every existing backup validator test (they pin the 422 wording).

**Tests deleted** — none. The controller-level money tests test the HTTP mapping, not a shallow module
absorbed by the new one.

**Prior art**

- `UpdateCategoryRequestTest` — a plain Bean Validation `Validator` with no Spring context, asserting property paths.
- `BackupValidatorTest` — small backup-file builders and plain calls to the static validator.
- `GlobalExceptionHandlerTest` — the handler exercised as a plain object.
- `TransactionControllerTest`, `BudgetControllerTest`, `CategoryColorTest` — the MockMvc end-to-end net.

**Schema verification** — capture `/v3/api-docs` from a local backend before step 2 and after steps 2,
4 and 5, and diff. Expected differences overall: the budget component rename and a `pattern` on the
PATCH colour; nothing else. If candidate 15's schema check exists by then, it performs this diff.

## Out of Scope

- A composed constraint for name or text lengths.
- Moving any other pseudo-field to a real field (`occurredOnNotInFuture`, `passwordWithinBcryptLimit`, `periodValid`, `anyFieldSet`, `nameValid` stay as documented).
- Friendlier messages (for example replacing Hibernate Validator's Digits wording); that is a separate, deliberate wire change.
- Removing or relocating the decimal-string `@Schema` on money fields (candidate 15).
- Adding Bean Validation annotations to the backup file record, or running the Validator over backup entries.
- Date differences between restore and the write endpoints: restore rejects years outside 1–9999 that the write endpoints accept (a budget ending in year 10000 exports but does not restore), and restore does not apply the transaction date's not-in-the-future rule. Handed to candidate 17 (housekeeping).
- Replacing the entities' literal column precision and scale with the `Money` constants.
- Merging the two subscription body records.
- The transaction search-term length (candidate 11).
- Message localisation behaviour (built-in messages follow `Accept-Language`, custom messages are English); unchanged here.
- The frontend's alias table for pseudo-fields and the problem-to-messages module (candidate 2) and the budget form's rewrite (candidate 5).

## Further Notes

**Facts that could not be verified in this read-only pass**

1. The current `/v3/api-docs` content: no snapshot is committed, and the generated TypeScript drops patterns, minimums and defaults. The expected schema diff above is derived from springdoc and swagger-core bytecode, not observed; the implementer confirms it.
2. That javac accepts an annotation type referencing its own constants inside its own meta-annotations (expected, as for a class referencing its own constant in `@Table`). Fallback if it does not: keep the regular expression and message in a tiny holder named after the rule in `dto` — never literals in two places.
3. That Spring Boot 4.1 wires the request-locale message interpolator into the MVC validator (the Spring Framework half — `LocalValidatorFactoryBean` wrapping `LocaleContextMessageInterpolator` — was verified).
4. The date-range divergence scenario was derived from the code, not run.
5. The strict money deserializer (which turns the JSON string into a `BigDecimal`) was not re-read in
   this pass. The new Validator-level and agreement tests feed `BigDecimal` values directly; the
   guarantee that the **wire** still rejects five decimals and `1.00000` comes from the existing
   controller tests (the transaction and budget "five decimals" tests), which stay unchanged.

**Risks**

- The schema facts of composed constraints depend on swagger-core expanding `jakarta.validation.constraints` meta-annotations (present in swagger-core 2.2.55, which springdoc 3.1.1 declares). A downgrade would drop patterns and minimums from the schema; required flags would survive because presence stays on the field.
- A future contributor adding single-violation reporting or attribute overrides would silently change messages or schema facts; the value-rule test catches the first, the schema diff (or candidate 15's check) the second.

**What siblings must assume**

- *G3 (candidate 2, problem messages):* `errors[].field` is a real body field except these pseudo-fields — `occurredOnNotInFuture` → show under `occurredOn`; `passwordWithinBcryptLimit` → `password`; `periodValid` → `periodEnd`; `nameValid` → `name`; `anyFieldSet` → banner. `colorValid` stops occurring after step 4 (an alias to `color` is harmless in the meantime). Any other unknown field → banner. Built-in constraint messages follow the browser's `Accept-Language`; custom messages (currency, colour, the date rule, the byte limit, the period rule) are English only.
- *G7 (candidate 15, OpenAPI):* money request fields still carry the decimal-string `@Schema` after this candidate; the composed constraint cannot carry it. Expected schema changes from this candidate: `BudgetRequest` replaces two components; the PATCH colour gains a pattern. Keep swagger-core at 2.2.55 or later. When the money schema is stated once, the request fields lose their `@Schema` together with the response ones.
- *G3 (candidate 5, form idiom):* step 5 touches the frontend's type aliases and budget hooks; land either first and rebase the other.
- *G2 (candidate 11):* both candidates edit the API document's "Errors" section; this candidate owns the pseudo-field paragraph and the constraint names in the endpoint tables, candidate 11 owns the new query-parameter paragraph.

**Sequencing** — no prerequisite. Convenient before candidate 5 rewrites the budget form, and ideally
after candidate 15's schema check exists (it then verifies the "no schema change" claim of steps 2
and 3 for free).

**Phase 6** — `MoneyAmount` is the rule for money stored as `NUMERIC(19,4)`. Prices or quantities
stored at another scale need their own rule; do not bend this one.

**Pre-existing drift noticed** — the API document's validation example says "The request body has 2
invalid fields." while the handler writes "invalid field(s)"; corrected when the section is edited
(prose, not contract).

**Lesson to write** — constraint composition: a custom annotation meta-annotated with built-ins;
without single-violation reporting each built-in keeps its own message and field; presence stays on
the field so every rule reads "if present"; springdoc sees the built-ins through meta-annotation
expansion but not a `@Schema` on the annotation.

**Added when the specs were cross-checked (2026-09-30).**

- **Regenerating the generated types, reconciled with candidate 15.** Step 5 says the types are
  regenerated from a running backend. That is the procedure only while candidate 15's step 1 has
  not landed. Once it has, the procedure is candidate 15's: let the OpenAPI document test write the
  served copy, copy it over the committed document, then regenerate the types from that file.
  Landing candidate 15's steps 1 and 2 first is the recommended order; its document check then
  proves this spec's "no schema change" claims.
- **The three findings for housekeeping** named in this spec's hand-over (backup restore's year
  range, backup restore skipping the not-in-the-future rule, the "fields" example in the API
  document) are recorded in candidate 17's spec as unverified additions.
