# Grilling log — Candidate 4: One home per value rule

Group G2 · repository `my-finance`, branch `dev` (HEAD `c3e20c5`, a `-s ours` merge whose tree is
identical to the pinned `4545810` — checked with `git diff --stat 4545810 c3e20c5`, empty). Every
`file:line` below is from that tree. Paths are relative to
`backend/src/main/java/com/myfinance/backend/` unless they start with another root.

Library facts were checked in the jars the build resolves from `~/.m2` (no source jars exist, so
bytecode was read with `javap -c` and resource files with `unzip -p`; nothing was built or run):

| Library | Version | How the version was established |
|---|---|---|
| Spring Framework (`spring-context`, `spring-web`, `spring-webmvc`, `spring-beans`, `spring-core`) | 7.0.8 | `spring-boot-dependencies-4.1.0.pom` → `spring-framework.version` |
| Hibernate Validator | 9.1.0.Final | same BOM → `hibernate-validator.version`; only version in `~/.m2` |
| Jakarta Validation API | 3.1.1 | same BOM |
| springdoc-openapi | 3.1.1 | `backend/pom.xml:55` |
| swagger-core-jakarta | 2.2.55 | `springdoc-openapi-3.1.1.pom:62` (`swagger-api.version`); only version in `~/.m2` |

## The design tree

```
Constraints (wire contract, recorded decisions, CI)             ← round 1
 ├─ How HV reports composed constraints                         ← round 1
 ├─ What swagger-core sees of a composed constraint             ← round 1
 ├─ Inventory of value rules and where they live                ← round 1
 ├─ Message locale                                              ← round 1
 └─ Dependencies by category                                    ← round 1
      └─ Shape of a value-rule module                           ← round 2
           ├─ Presence inside or outside the rule               ← round 2
           ├─ @ReportAsSingleViolation or not                   ← round 2
           ├─ Does the rule carry @Schema                       ← round 2
           ├─ Which rules become modules (money/currency/colour/lengths) ← round 2
           ├─ Where the parameters (numbers, regexes, messages) live     ← round 2
           └─ Which package                                     ← round 2
                ├─ How backup restore uses the same rule        ← round 3
                │    ├─ Backup wording                           ← round 3
                │    └─ Divergences found on the way (dates)     ← round 3
                ├─ Pseudo-fields: report on the real field?     ← round 4
                │    └─ UpdateCategoryRequest colour             ← round 4
                ├─ Merge the two budget records?                ← round 4
                └─ Merge the two subscription records?          ← round 4
                     ├─ Test seam                               ← round 5
                     ├─ Tests: survive / change / add / delete  ← round 5
                     └─ Seam discipline                         ← round 5
                          ├─ Order of steps                     ← round 6
                          ├─ Recorded-decision docs to update   ← round 6
                          ├─ Edge cases and failure modes       ← round 6
                          ├─ Cross-candidate effects            ← round 6
                          └─ LESSONS entry                      ← round 6
```

---

## Round 1 — constraints and facts everything else hangs on

❓ **Q1** - **What must the refactor not change on the wire?** Options: (a) only status codes and
slugs; (b) status, slug and `errors[].field`; (c) status, slug, `errors[].field`, `errors[].message`,
the violation count (and so `detail`), the 422 `problems[]` wording, and the OpenAPI schema
(`required`, `pattern`, `minimum`) that the generated frontend types come from.

🔎 Facts:
- `docs/API.md:171-191` fixes the 400 shape: `type /errors/validation-failed`, `errors: [{field, message}]`,
  and its example shows the messages `"must be greater than 0"` and `"must be a 3-letter ISO 4217 code"`
  (`docs/API.md:183-184`). `docs/API.md:168-169`: "`type` is a stable machine-readable slug ...;
  `detail` is prose and may change without notice" — nothing says the same of `errors[].message`.
- The body is built by `exception/GlobalExceptionHandler.java:74-87`: one `FieldViolation(field,
  defaultMessage)` per `getFieldErrors()` entry (`:151-157`), `detail` = "The request body has N
  invalid field(s)." (`:84`). Global (class-level) errors are **dropped** — only field errors reach
  the wire.
- Messages are shown to users verbatim: `frontend/src/components/TxnModal.tsx:138-145` puts each
  message under its field; `frontend/src/screens/Subscriptions.tsx:85-95` joins all messages with
  " · ". So a changed message is a user-visible change.
- The frontend aliases request bodies to generated types (`frontend/src/api/types.ts:92,177,199,201`)
  precisely because their `required` sets are accurate (`docs/LESSONS.md:2557-2581`, "OpenAPI's
  `required` is a Bean Validation artifact"). Losing `required` on `amount` would turn
  `amount: string` into `amount?: string` in `frontend/src/api/schema.d.ts:434`.
- 422 backup wording: `docs/API.md:1420` ("a `problems` array of human-readable strings pinpointing
  the entries"); `service/BackupValidatorTest.java` pins fragments (`"decimal"` at `:209`, `"100"` at
  `:334,:346`, paths throughout) and counts (`:205,:318`).

➡️ (c): treat the whole observable surface as fixed, and make every deliberate exception an explicit
implementation decision with its doc update.

⚖️ Strongest argument against: `API.md` never promises `errors[].message` is stable, so holding it
byte-for-byte over-constrains the design (it rules out, for instance, nicer Digits wording).

✅ Decision: (c). Unblocks Q7–Q11: any module shape that changes a message, a count or a schema
`required` flag is rejected unless the spec names the change.

---

❓ **Q2** - **How does Hibernate Validator 9.1 report a composed constraint?** Options:
(a) one violation per failing composing constraint, each with its own message and the annotated
property as path; (b) a single violation with the composed constraint's message.

🔎 Facts (bytecode, `hibernate-validator-9.1.0.Final.jar`):
- `ComposingConstraintTree.validateComposingConstraints` validates every child tree and collects
  their violation contexts (AND composition keeps going unless fail-fast).
- `ComposingConstraintTree.mainConstraintNeedsEvaluation` returns false when the constraint has
  composing constraints and no matching validator — i.e. `@Constraint(validatedBy = {})`.
- `ComposingConstraintTree.prepareFinalConstraintViolations`: `if (reportAsSingleViolation())` →
  clear the collected composing violations and add one for the main constraint; otherwise keep the
  composing violations as they are.
- Each composing violation carries its own descriptor, so its message template is the composing
  annotation's (`{jakarta.validation.constraints.DecimalMin.message}`, or the literal message given
  in the meta-annotation).
- `org/hibernate/validator/ValidationMessages.properties`:
  `DecimalMin.message = must be greater than ${inclusive == true ? 'or equal to ' : ''}{value}` →
  "must be greater than 0"; `Digits.message = numeric value out of bounds (<{integer}
  digits>.<{fraction} digits> expected)`; `NotNull` "must not be null"; `NotBlank` "must not be
  blank"; `Size` "size must be between {min} and {max}".

➡️ (a) is what happens without `@ReportAsSingleViolation`; that preserves field, message and count.

⚖️ Strongest argument against: none on the facts; the risk is only that a future contributor adds
`@ReportAsSingleViolation` "for tidiness" and silently changes every message.

✅ Decision: composed constraints report exactly like the stacked built-ins they replace, provided
`@ReportAsSingleViolation` is absent and `validatedBy = {}`. Unblocks Q9.

---

❓ **Q3** - **What does springdoc (swagger-core) see of a composed constraint?** Options:
(a) nothing — the schema loses `required`/`pattern`/`minimum`; (b) the composing built-ins, via
meta-annotation expansion; (c) also any `@Schema` placed on the composed annotation.

🔎 Facts (bytecode, `swagger-core-jakarta-2.2.55.jar`):
- `ModelResolver.applyBeanValidatorAnnotationsNoGroups` (offset 0) and the grouped
  `applyBeanValidatorAnnotations` (offset 124) both start with
  `ValidationAnnotationsUtils.expandValidationMetaAnnotations(annotations)`.
- `expandValidationMetaAnnotations`: keeps the directly present annotations, then walks
  meta-annotations breadth-first; every meta-annotation whose class name starts with
  `jakarta.validation.constraints` is added (`putIfAbsent`, so a direct annotation wins) unless it is
  listed by `findOverrides` — which collects the constraint classes named in `@OverridesAttribute`
  on the composed annotation's methods. Non-constraint meta-annotations are queued and expanded
  in turn (a seen-set stops cycles).
- `required` is computed on the **expanded** array: the predicate
  `lambda$applyBeanValidatorAnnotationsNoGroups$29` tests
  `NOT_NULL_ANNOTATIONS.contains(annotationType().getSimpleName())`, and `NOT_NULL_ANNOTATIONS` is
  `[NotNull, NonNull, NotBlank, NotEmpty]` (static initialiser).
- `@Pattern`, `@Size`, `@DecimalMin` etc. are then applied from the expanded map
  (`applyPatternConstraint`, `applySizeConstraint`, `applyDecimalMinConstraint`, ...). There is no
  `@Digits` handler (unchanged from today).
- `AnnotationsUtils.getSchemaAnnotation(Annotation...)` returns the first annotation that is
  `instanceof io.swagger.v3.oas.annotations.media.Schema` — directly present only. So a `@Schema`
  meta-annotation on a custom annotation is **not** seen.
- springdoc 3.1.1 declares swagger-api 2.2.55 (`springdoc-openapi-3.1.1.pom:62`).
- Record components: swagger-core reads the annotations Jackson 2 collects for the property
  (field, accessor, constructor parameter); `@NotNull`, whose targets do not include
  `RECORD_COMPONENT`, is visible today (`schema.d.ts:429` `categoryId: number` is required), so an
  annotation with the same targets is visible the same way.

➡️ (b): a composed constraint with fixed attribute values (no `@OverridesAttribute`) produces the
same schema facts as the stacked built-ins; a `@Schema` on it would be ignored.

⚖️ Strongest argument against: this rests on a swagger-core feature. An older swagger-core without
`expandValidationMetaAnnotations` would silently drop `pattern` and `minimum` (not `required`, if
presence stays on the field — see Q8). I could not find when the method was introduced.

✅ Decision: (b), with two consequences carried forward: no `@OverridesAttribute` in the composed
constraints, and no `@Schema` on them (Q10). The swagger-core dependency is recorded as a risk for
G7 (candidate 15).

---

❓ **Q4** - **Which value rules exist today, and where is each stated?**

🔎 Facts:

| Rule | Request sites | Backup site | DB |
|---|---|---|---|
| Money amount: `@NotNull @DecimalMin(value="0", inclusive=false) @Digits(integer=15, fraction=4)` (+ `@Schema(type="string", format="decimal", example="243.5000")`) | `dto/TransactionRequest.java:24-28`, `dto/SubscriptionRequest.java:26-30`, `dto/UpdateSubscriptionRequest.java:27-31`, `dto/CreateBudgetRequest.java:21-25`, `dto/UpdateBudgetRequest.java:21-25` | `service/BackupValidator.java:227-242` (`checkAmount`, Javadoc says "Same rules as @DecimalMin(0, exclusive) + @Digits(integer = 15, fraction = 4)") | `NUMERIC(19,4)` + `CHECK (> 0)` (`docs/SCHEMA.md:77,260,334,407`) |
| Currency code: `@NotBlank @Pattern(regexp="^[A-Z]{3}$", message="must be a 3-letter ISO 4217 code")` | `TransactionRequest.java:30-31`, `SubscriptionRequest.java:32-33`, `UpdateSubscriptionRequest.java:33-34`, `CreateBudgetRequest.java:27-28`, `UpdateBudgetRequest.java:27-28`, `CreateProfileRequest.java:10-11` | `BackupValidator.java:31,221-225` (same message text) | `CHAR(3)` + `CHECK (~ '^[A-Z]{3}$')` (`SCHEMA.md:78`) |
| Category colour `^#[0-9a-f]{6}$`, message "must be a lowercase hex color like #a4d9c6" | `CreateCategoryRequest.java:14-16` (`@Pattern`), `UpdateCategoryRequest.java:27,101-106` (hand-rolled `isColorValid()`) | `BackupValidator.java:32,81-83` (same message text) | `CHECK (color ~ '^#[0-9a-f]{6}$')` (`SCHEMA.md:169`) |
| Name/label ≤ 100 | `@Size(max = 100)` ×10: `MerchantBackfillRequest:9`, `UpdateCategoryRequest:29`, `RegisterRequest:11`, `CreateCategoryRequest:11`, `UpdateProfileRequest:8`, `InsightRequest:21`, `CreateProfileRequest:8`, `SubscriptionRequest:23`, `TransactionRequest:36`, `UpdateSubscriptionRequest:24` | `BackupValidator.java:33,200-206,214-219` | only `insight.name` and `txn.merchant` have a length CHECK (`SCHEMA.md:265,478`) |
| Free text ≤ 500 | `@Size(max = 500)` ×4: `MerchantBackfillRequest:8`, `TransactionRequest:35`, `SubscriptionRequest:37`, `UpdateSubscriptionRequest:39` | `BackupValidator.java:34,208-212` | none |
| Search term ≤ 100 (query, not body) | `TransactionService.MAX_SEARCH_LENGTH` (`service/TransactionService.java:48`) | — | — |

`@Schema(type = "string", format = "decimal")` appears 22 times in 16 files (grep), request and
response records and `dto/BackupFile.java`. `model/Money.java:14` holds `SCALE = 4`, used by
`Money.normalize` (`:18-20`, `RoundingMode.UNNECESSARY`), the entities (`model/Transaction.java:101`,
`model/Budget.java:56,65`, `model/Subscription.java:89`) and `model/BillingPeriod.java:35,91,118`.
Entities also restate `@Column(precision = 19, scale = 4)` (`model/Transaction.java:31`).

Rules implemented as `@AssertTrue` methods (reported as pseudo-fields): `occurredOnNotInFuture`
(`TransactionRequest.java:45-50`), `periodValid` (`CreateBudgetRequest.java:38-42`,
`UpdateBudgetRequest.java:38-42`), `passwordWithinBcryptLimit` (`dto/BcryptPassword.java:24-29`,
shared by `RegisterRequest` and `SetPasswordRequest` through the interface), `anyFieldSet`,
`nameValid`, `colorValid` (`UpdateCategoryRequest.java:88-106`).

➡️ The inventory matches the evidence pack; two refinements: the `100` count is 10 annotation sites
plus the backup constant (11), and `MAX_SEARCH_LENGTH` is a separate query-parameter rule that
belongs to candidate 11, not here.

⚖️ Strongest argument against: none — this is inventory.

✅ Decision: scope = money amount, currency code, category colour, and the two length limits. The
query-string search limit is left to candidate 11.

---

❓ **Q5** - **Which dependencies does the change touch, by category?**

🔎 Facts: Bean Validation and the backup validator are pure in-process computation
(`BackupValidator` is "Pure static functions over the parsed file — nothing here touches the
database", `BackupValidator.java:27`). Controller tests run against Testcontainers Postgres and Redis
(`src/test/.../support/IntegrationTest.java`, `TestcontainersConfiguration`). No network adapter,
no third party.

➡️ In-process only (Validator, `BackupValidator`, springdoc's schema pass). The controller tests that
already exist are local-substitutable (Testcontainers) and are used as the regression net, not as the
primary seam.

⚖️ Strongest argument against: the OpenAPI schema is produced at runtime by springdoc; checking it
needs the app running — but that is still in-process (a `/v3/api-docs` fetch against a local
backend), not a ports-and-adapters dependency.

✅ Decision: in-process. No port, no adapter, no mock. Unblocks Q21 (seam choice).

---

❓ **Q6** - **In which language are the 400 messages produced, and does it matter for this change?**

🔎 Facts: `hibernate-validator-9.1.0.Final.jar` ships `ValidationMessages_pl.properties` (e.g.
`DecimalMin` → "musi być ... większe od {value}") and `_de`. `spring-context` 7.0.8
`LocalValidatorFactoryBean` wraps its interpolator in `LocaleContextMessageInterpolator` (offset
154-159), which interpolates with `LocaleContextHolder.getLocale()` — in Spring MVC the request
locale (`Accept-Language`). Custom messages given as literals ("must be a 3-letter ISO 4217 code",
"must not be in the future", ...) are not templates and stay English. `MockHttpServletRequest`
defaults to `Locale.ENGLISH`, so controller tests see English. A plain `Validation.buildDefaultValidatorFactory()`
(as in `dto/UpdateCategoryRequestTest.java:22-23`) uses the JVM default locale.
`BaseHibernateValidatorConfiguration.defaultLocale(Locale)` exists in 9.1. Not verified: that Spring
Boot 4.1 wires this `LocalValidatorFactoryBean` as the MVC validator (standard Boot behaviour, but I
read no Boot bytecode for it).

➡️ The refactor keeps every message template, so the localisation behaviour is unchanged. Any new
test that pins a built-in message's text must build its validator with an English default locale,
or it fails on a machine whose default locale is Polish.

⚖️ Strongest argument against: asserting on `getMessageTemplate()` would be locale-proof without
configuring anything — but the interpolated English text is what the API returns without an
`Accept-Language` header and what `API.md` shows, so it is the more honest assertion.

✅ Decision: pin English in new message-asserting tests. Report to G3 that built-in messages follow
`Accept-Language` while custom messages are English only (pre-existing; not changed here).

---

## Round 2 — the shape of a value-rule module

❓ **Q7** - **What shape does a value-rule module take?** Options: (a) a composed Bean Validation
constraint (a custom annotation meta-annotated with the built-ins, `@Constraint(validatedBy = {})`);
(b) a value type (e.g. a `MoneyAmount` record wrapping `BigDecimal`, validated in its constructor or
by a custom validator); (c) a shared `ConstraintValidator` class behind a custom annotation;
(d) a plain predicate class called from `@AssertTrue` methods.

🔎 Facts:
- (a) keeps messages, fields and counts (Q2) and the schema (Q3). It is the shape the Hibernate
  Validator reference guide calls "constraint composition" (its example is `@ValidLicensePlate`).
- (b) changes the wire: the Jackson 3 setup deserializes `BigDecimal` with
  `config/StrictStringBigDecimalDeserializer`; a wrapper type needs its own (de)serializer, its own
  springdoc schema mapping, and every mapping (`TransactionMapper`, entity constructors, `Money.normalize`)
  changes. It also moves failures from 400 `validation-failed` to 400 `invalid-request` (a
  constructor exception during Jackson deserialization is an `HttpMessageNotReadableException`,
  `GlobalExceptionHandler.java:91-100`).
- (c) loses swagger-core's view of the built-ins (Q3: only `jakarta.validation.constraints.*`
  meta-annotations are expanded), so `pattern`/`minimum` vanish from the schema, and it must
  reproduce HV's built-in message templates by hand.
- (d) keeps pseudo-fields and is what `UpdateCategoryRequest.isColorValid()` already does — the
  shape this candidate exists to remove.

➡️ (a) composed constraints.

⚖️ Strongest argument against: the card's own "Against" — stacked annotations are idiomatic and
readable where they stand, and the rules rarely change; a reader now has to open the annotation to
see the numbers. The payoff arrives with Phase 6's money-bearing records (`docs/INVESTMENTS.md:87`:
"Every money field carries its currency").

✅ Decision: (a). Unblocks Q8–Q13.

---

❓ **Q8** - **Does a value rule include presence (`@NotNull`/`@NotBlank`), or does presence stay on
the field?** Options: (a) inside — `@MoneyAmount` alone means "required money amount";
(b) outside — `@NotNull @MoneyAmount`, and the rule treats `null` as valid.

🔎 Facts: every built-in constraint except the presence ones treats `null` as valid. The HV
reference guide's own composition example (`@ValidLicensePlate`) includes `@NotNull`. Today all five
money sites are `@NotNull` and all six currency sites `@NotBlank`; the colour is optional on both
category requests (`null` = inherit, `API.md:590,633`). Presence also decides the generated TS type
(`required`) — with presence on the field that no longer depends on swagger-core's meta-annotation
expansion at all (Q3's risk). Counts stay identical either way: `{}` on `POST /api/transactions`
yields 5 errors (`TransactionControllerTest.java:193-202`), one per field, in both options.

➡️ (b): presence stays on the field; every value rule accepts `null`.

⚖️ Strongest argument against: HV's own documentation puts `@NotNull` inside the composed
constraint, and (b) leaves two annotations per required field instead of one.

✅ Decision: (b). Uniform semantics across the family (`@HexColor` must be optional, so a rule that
sometimes implies presence would be a trap), required-ness in the schema independent of swagger-core
internals, and the record still reads "required, and a money amount".

---

❓ **Q9** - **`@ReportAsSingleViolation` or not?**

🔎 Facts: Q2. With it, `"0"` would report the composed constraint's own message instead of "must be
greater than 0", contradicting the `API.md:183` example.

➡️ Not used; the composed annotation's own `message` attribute (mandatory in Bean Validation) is
never shown and says so in its Javadoc.

⚖️ Strongest argument against: one message per rule ("must be a positive amount with at most 4
decimal places") would be friendlier than HV's Digits text.

✅ Decision: no `@ReportAsSingleViolation`. Better wording is a separate, deliberate wire change and
is out of scope.

---

❓ **Q10** - **Should the composed money constraint carry `@Schema(type = "string", format =
"decimal", example = "243.5000")`?** Options: (a) yes, on the annotation; (b) no, it stays on each
field until candidate 15 states the money schema once; (c) use Jackson's `@JacksonAnnotationsInside`
bundle so Jackson 2's introspection (which swagger-core uses) sees the `@Schema`.

🔎 Facts: Q3 — swagger-core reads `@Schema` only when directly present. `@Schema` is needed on
response records too (`TransactionResponse`, `BudgetResponse`, ... — 22 uses in 16 files), which do
not carry validation, so the constraint is the wrong home for the wire representation anyway.
Candidate 15 (G7) intends to state the money schema once for the whole document (brief §8).
Option (c) is not verified end to end and is exactly the clever, atypical pattern `CLAUDE.md` asks to
avoid.

➡️ (b).

⚖️ Strongest argument against: until candidate 15 lands, money request fields still stack two
annotations (`@MoneyAmount` + `@Schema`), so "one home" is only half true for them.

✅ Decision: (b). The value rule (validity) and the wire representation (decimal string) are two
concerns with two owners: this candidate and candidate 15. Recorded as a note for G7.

---

❓ **Q11** - **Which rules become modules?** Options per rule: composed constraint vs. leave the
built-in annotation where it is.

🔎 Facts (deletion test):
- Money: three numbers, two annotations, a coupling to `Money.SCALE` (a 5-decimal amount that slips
  past validation makes `Money.normalize` throw → 500), five request sites now, many more in Phase 6.
  Deleting the module brings all of that back at every site → earns its keep.
- Currency: a regex **and** a custom message restated together at six sites; a typo in either is
  silent. Earns its keep.
- Colour: regex + message at two request sites plus a hand-rolled copy (`UpdateCategoryRequest.isColorValid`).
  Earns its keep (and removes the hand copy, Q18).
- Lengths: a `@Name` would be a wrapper around one `@Size(max = 100)` — the presence part cannot be
  inside (Q8; `UpdateCategoryRequest.name` is optional). Deleting it brings back exactly one built-in
  annotation per site: a pass-through.

➡️ `@MoneyAmount`, `@CurrencyCode`, `@HexColor`; lengths stay `@Size(max = 100)` / `@Size(max = 500)`
at their sites, and the drift risk with the backup copy is covered by the agreement test (Q14).

⚖️ Strongest argument against: the card names "name" as one of the value rules; leaving the literal
`100` at ten sites means a change to "names may be 150" is ten edits plus the backup constant.

✅ Decision: three modules; no length module. A change to a length limit remains a multi-site edit,
caught by the agreement test if the backup copy is forgotten.

---

❓ **Q12** - **Where do each rule's parameters (numbers, regex, message) live, so the backup
validator can use the same ones?** Options: (a) literals inside the composed annotation, backup keeps
its own copies; (b) constants on the annotation types; (c) money numbers in `model/Money` (next to
`SCALE`), regex and message constants on `@CurrencyCode` / `@HexColor`; (d) one `ValueRules`
constants class.

🔎 Facts: `Money.SCALE = 4` is already the single statement of the storage scale (`Money.java:14`)
and is what `@Digits(fraction = 4)` must equal. `NUMERIC(19,4)` leaves 15 integer digits.
Annotation attribute values must be compile-time constants; `Money.SCALE` is one, and so would be a
new `Money.INTEGER_DIGITS`. Java allows constants in an annotation type (precedent:
`org.springframework.scheduling.annotation.Scheduled.CRON_DISABLED`). Not verified by compiling:
that an annotation type can reference its own constants in its own meta-annotations
(`@Pattern(regexp = CurrencyCode.REGEX) public @interface CurrencyCode { String REGEX = ...; }`) —
the same self-reference is common on classes (`@Table(name = Foo.TABLE)`), and javac resolves it the
same way, but I could not build.

➡️ (c): `Money` gains the maximum integer digits (15) beside `SCALE`; `@MoneyAmount` uses both;
`@CurrencyCode` and `@HexColor` expose `REGEX` and `MESSAGE` constants; `BackupValidator` reads all of
them.

⚖️ Strongest argument against: the money rule's parameters then live in `model` while the currency
and colour rules' live on annotations — two conventions. And a service class reading constants off
an annotation type is unusual to a newcomer.

✅ Decision: (c). The money numbers are storage facts (`NUMERIC(19,4)`) with an existing home; the
regex/message pairs have no model home. Fallback if javac rejects the self-reference: keep the
constants on the annotation and put literals in the meta-annotation is **not** acceptable (two homes)
— instead move `REGEX`/`MESSAGE` to a tiny holder class in `dto` named after the rule.

---

❓ **Q13** - **Which package do the value-rule annotations live in?** Options: (a) `dto`; (b) a new
`validation` package; (c) `model`.

🔎 Facts: `ARCHITECTURE.md:54-67` lists the packages; `dto/` is "request/response records".
`ArchitectureTest.java:25-39` defines only the Controller, Service and Repository layers with
`consideringOnlyDependenciesInLayers()`, so `dto`, `model` or a new package are unconstrained.
`service/BackupValidator.java:15` already imports `dto.BackupFile`; `dto` already depends on `model`
(`TransactionRequest.java:16`, `TransactionSummary.java:5`).

➡️ (a) `dto`: every annotated element is a request record component in `dto`, so the records use the
annotations without imports; `BackupValidator` already depends on `dto`; no new package to document.

⚖️ Strongest argument against: annotation types are not records; a contributor looking for
"validation" will not look in `dto`, whereas `validation/` is a common Spring convention.

✅ Decision: `dto`, and `ARCHITECTURE.md`'s package line says "request/response records, and the
value-rule constraints they share".

---

## Round 3 — backup restore

❓ **Q14** - **How does backup restore use the same rule without changing its 422 wording?**
Options: (A) run the programmatic `Validator` over the backup entries; (B) share the rule as a plain
predicate that both the constraint and the backup validator call; (C) leave the backup copy and only
test both against the same table; (C+) share the parameters (Q12) **and** test both against the same
table.

🔎 Facts:
- (A) changes the wording: the Digits template "numeric value out of bounds (<15 digits>.<4 digits>
  expected)" has no "decimal", so `BackupValidatorTest.amountsMustBePositiveWithAtMostFourDecimals`
  (`:208-209`) fails; "must not be null" replaces "is required"; "size must be between 0 and 100"
  replaces "must be at most 100 characters". `BackupFile` is also the export response body
  (`dto/BackupFile.java:9-11`), so adding constraints to it changes the export's schema
  (`schema.d.ts:701-769`). HV returns violations as a set, so `problems[]` order within an entry
  would stop being deterministic, and the strings would follow `Accept-Language` (Q6). And
  `BackupValidator` would stop being a pure static function.
- (B) has nothing to call: a composed constraint has no validator class (Q7). Making one (option (c)
  of Q7) costs the schema facts and hand-written message templates.
- HV's verdicts equal the backup copy's arithmetic exactly: `DigitsValidatorForNumber.isValid` uses a
  `BigDecimal` as-is (no `stripTrailingZeros` — that happens only for other `Number` types), integer
  part = `precision() - scale()`, fraction part = `scale() < 0 ? 0 : scale()`; `BackupValidator.java:233-241`
  uses `signum() <= 0`, `scale() > 4`, `precision() - scale() > 15`. `DecimalMinValidatorForBigDecimal`
  compares against 0 exclusively.
- The currency and colour messages are already character-identical on both sides
  (`TransactionRequest.java:30` vs `BackupValidator.java:223`; `CreateCategoryRequest.java:15` vs
  `BackupValidator.java:82`).

➡️ (C+): `BackupValidator` keeps its structure and wording and reads the shared parameters; one
table-driven test runs the same values through `Validator.validateValue` on the matching request
property and through `BackupValidator.validate` on the matching backup field, and asserts both give
the expected verdict.

⚖️ Strongest argument against: the verdict logic still exists twice (HV's validators and three lines
in `checkAmount`); only the test keeps them together. "One home" is true for the parameters, not for
the arithmetic.

✅ Decision: (C+). It is the only option that keeps the 422 wording and the export schema, and it
turns `API.md:1397-1400`'s promise ("validated with the same rules as the normal write endpoints")
into an executable check.

---

❓ **Q15** - **Does any backup problem text change?**

🔎 Facts: with the constants from Q12, `checkAmount` still prints "must have at most 4 decimal
places" and "must have at most 15 integer digits" (the numbers come from `Money`), `checkCurrency`
prints `CurrencyCode.MESSAGE` = the same text, the colour check prints `HexColor.MESSAGE` = the same
text.

➡️ No change; `BackupValidatorTest` survives unchanged.

⚖️ Strongest argument against: none.

✅ Decision: byte-identical 422 `problems[]`.

---

❓ **Q16** - **The agreement table exposes divergences that exist today. Are they in scope?**

🔎 Facts:
- Dates: `BackupValidator.checkDate` (`:244-262`) rejects years outside 1..9999
  (`BackupValidatorTest.java:270-306`); the write endpoints do not bound years at all
  (`CreateBudgetRequest.periodEnd`, `SubscriptionRequest.nextBillingOn` are plain `@NotNull
  LocalDate`). Scenario: a budget created through `POST /api/budgets` with `periodEnd` =
  `+10000-01-01` exports fine and then fails to restore with 422 "year must be between 1 and 9999".
  (Not run; derived from the code.)
- The write endpoint's "not after UTC today + 1" rule on `occurredOn` (`TransactionRequest.java:45-50`)
  is not applied on restore, so a restore can admit a future-dated transaction that a later `PUT`
  would reject. `API.md:1397-1400`'s list of shared rules does not claim the date rule.
- Nothing diverges for money, currency, colour, names, merchant, description, notes (checked case by
  case: nulls, blanks, boundaries 100/101 and 500/501, trailing zeros, negative scale).

➡️ Out of scope for this candidate (its rules are money, currency, colour and lengths); the agreement
test covers exactly the shared rules, and the divergences are handed to G8 (housekeeping) with the
scenarios above.

⚖️ Strongest argument against: the export → restore round trip failing is the worst failure a backup
feature can have; leaving a known path to it is uncomfortable.

✅ Decision: out of scope, recorded under Out of Scope and in the hand-back.

---

## Round 4 — pseudo-fields and duplicated records

❓ **Q17** - **Should a rule that is reported under a pseudo-field be moved so it reports on the
real field (`occurredOn`, `password`, `periodEnd`)?** Options: (P0) keep every documented
pseudo-field; (P1) move the single-value rules (the date rule, the BCrypt byte rule, the colour
rule) to field constraints, keep the cross-field/presence ones; (P2) move everything with a natural
real field, keep only `anyFieldSet`.

🔎 Facts:
- Documented as wire contract: `occurredOnNotInFuture` (`API.md:708,716`), `passwordWithinBcryptLimit`
  (`API.md:286-287,381-382`), `periodValid` and `anyFieldSet` (`API.md:189-191`). `nameValid` and
  `colorValid` are not named anywhere in `API.md`.
- Relied on by the frontend: `occurredOnNotInFuture` (`TxnModal.tsx:141-142`),
  `passwordWithinBcryptLimit` (`auth/AuthScreen.tsx:32`, `screens/SetPassword.tsx:29`,
  `SetPassword.test.tsx:82`). Not relied on: `periodValid` (the budget form shows only `detail`,
  `screens/BudgetForm.tsx:80-85`), `anyFieldSet`/`nameValid`/`colorValid` (the categories screen shows
  only status/slug/detail, `screens/Categories.tsx:55-59,119-127`).
- Pinned by tests: `TransactionControllerTest.java:179,686`, `AuthControllerTest.java:113,121`,
  `config/PasswordlessModeTest.java:181`, `BudgetControllerTest.java:132`,
  `CategoryControllerTest.java:441,451,456`, `CategoryColorTest.java:121`,
  `dto/UpdateCategoryRequestTest.java:41,49,102`.
- A recorded, deliberate choice: `docs/LESSONS.md:2930-2946` ("Sharing a validation rule across
  records") — the 72-byte rule lives on the `BcryptPassword` interface so that "the rule — and the
  field name `passwordWithinBcryptLimit` the frontend maps — is declared once ... a custom constraint
  annotation was the alternative, but it would report the error on `password` instead."
- Moving the date rule or the byte rule needs a custom `ConstraintValidator` each (no built-in
  expresses "not after UTC today + 1" or "at most 72 UTF-8 bytes"). The date rule has one caller —
  by the deletion test a single-caller constraint is a pass-through; `CLAUDE.md` forbids
  abstractions for single-use code.
- `periodValid` is genuinely cross-field; reporting it on `periodEnd` needs a class-level constraint
  with its own validator. `anyFieldSet` has no field at all, and `nameValid` depends on the
  present-vs-absent flag.

➡️ (P0) for every rule that needs code, plus the one move that is free and fixes a doc/code
contradiction: the colour rule (Q18).

⚖️ Strongest argument against: pseudo-fields leak an implementation detail (a JavaBeans property of
an `@AssertTrue` method) onto the wire, and every client needs an alias table to put the message
next to the right input — the card counts three hand-written renames in the frontend.

✅ Decision: keep `occurredOnNotInFuture`, `passwordWithinBcryptLimit`, `periodValid`, `anyFieldSet`,
`nameValid` exactly as they are; `API.md` lists them as the complete set. `colorValid` goes (Q18).
G3 must keep one alias table (hand-back).

---

❓ **Q18** - **Can `UpdateCategoryRequest`'s colour use `@HexColor` on its field, despite the
present-vs-absent tracking?**

🔎 Facts: `isColorValid()` = `!colorSet || color == null || COLOR.matcher(color).matches()`
(`UpdateCategoryRequest.java:104-106`). `color` is only assigned by `setColor`, which also sets
`colorSet` (`:76-80`); so `color != null` implies `colorSet`. A null-tolerant `@Pattern` on the field
returns the same verdict in all three states (absent → null → valid; explicit null → valid; present →
must match). The class already puts a field constraint on `name` (`:29`). `API.md:633` documents
PATCH's `color` as `@Pattern("^#[0-9a-f]{6}$")`, and `API.md:189-191` lists only `periodValid` and
`anyFieldSet` as pseudo-fields — so the documented contract already says a bad colour on PATCH is a
`color` error; the code reports `colorValid`. POST reports `color` (`CategoryColorTest.java:72`).
Swagger-core would additionally show `pattern` on the PATCH body's `color` (additive).

➡️ `@HexColor` on the private `color` field; delete `isColorValid()` and the `COLOR` constant. A bad
colour on PATCH is reported as `color`.

⚖️ Strongest argument against: it is a wire change (`colorValid` → `color`) inside a refactor.

✅ Decision: make it, name it, and update the two assertions (`CategoryColorTest.java:121`,
`UpdateCategoryRequestTest.java:97-104`) and `API.md`'s PATCH prose. No client relies on
`colorValid`.

---

❓ **Q19** - **Do `CreateBudgetRequest` and `UpdateBudgetRequest` merge?** Options: merge into one
`BudgetRequest`; keep both.

🔎 Facts: the two files are identical except the record name and the Javadoc line
(`CreateBudgetRequest.java` vs `UpdateBudgetRequest.java`, both 43 lines, same annotations, same
`isPeriodValid()`). Precedent for one record serving `POST` and `PUT`: `TransactionRequest`
(`TransactionController.java:45,114`) and `InsightRequest` (`dto/InsightRequest.java:13`). The split
came from a plan step that said "mirroring `CreateBudgetRequest` exactly"
(`docs/superpowers/plans/2026-09-07-maintenance-run.md:1114`) — no stated reason. Users:
`BudgetController.java:39,62`, `BudgetService.java:58,98`. OpenAPI: the schema components are named
after the records (`schema.d.ts:577,668`); the frontend aliases `components['schemas']['CreateBudgetRequest']`
(`frontend/src/api/types.ts:177`) and uses it for both create and update
(`frontend/src/api/hooks/budgets.ts:4,41,51`; comment `screens/BudgetForm.tsx:15`). `schema.d.ts` is
regenerated with `npm run generate:types`, which needs a running backend (`frontend/package.json:17`),
and is committed. The wire JSON does not change (schema names are not on the wire).

➡️ Merge into `BudgetRequest`; regenerate `schema.d.ts`; point the frontend alias at
`components['schemas']['BudgetRequest']` and rename the alias to `BudgetRequest` in the same change.

⚖️ Strongest argument against: two schema components disappear and one appears — a change in the
OpenAPI document and in generated types, in a candidate whose goal is "no wire change"; and the
frontend change collides with candidate 5 (G3), which rewrites the budget form.

✅ Decision: merge; the spec names the schema rename as a deliberate OpenAPI change and bundles the
regeneration and the alias in the same step.

---

❓ **Q20** - **Do `SubscriptionRequest` and `UpdateSubscriptionRequest` merge?**

🔎 Facts: they differ by `status` (`@NotNull` on PUT, absent on POST — "New subscriptions are always
ACTIVE", `API.md:1164,1196`). A merged record would need conditional validation (groups) or an
ignored field on POST.

➡️ Keep both; with the value rules composed, their remaining overlap is field declarations.

⚖️ Strongest argument against: seven identical fields remain declared twice.

✅ Decision: keep both.

---

## Round 5 — seams and tests

❓ **Q21** - **At which seam is the change tested?** Options: (a) the HTTP interface through MockMvc
for every record × rule; (b) the Bean Validation `Validator` applied to the request records
(in-process, no Spring context), plus `BackupValidator.validate` for backups; (c) unit tests of the
annotation types themselves.

🔎 Facts: prior art for (b): `dto/UpdateCategoryRequestTest.java:19-33` (plain `Validator`, asserts
property paths), `service/BackupValidatorTest.java` (plain static calls, file builders at `:17-45`).
The HTTP body is a pure function of the Validator's violations (`GlobalExceptionHandler.java:77-79`),
already covered end to end by the controller tests. (a) would need Testcontainers for 13 site × rule
combinations. (c) tests an implementation detail (an annotation has no behaviour outside a
Validator).

➡️ (b): the Validator is the seam at which the value rules' interface lives; `BackupValidator.validate`
is the backup path's existing seam. The controller tests stay as the end-to-end net.

⚖️ Strongest argument against: two seams, where the ideal is one; and a Validator-level test cannot
see a mistake in the handler.

✅ Decision: (b). The handler is untouched by this candidate, so the end-to-end net that already
exists is enough for it.

---

❓ **Q22** - **Which tests survive, which change, which are added, which are deleted?**

🔎 Facts: see Q1, Q17, Q18, Q19 for the pinned assertions.

➡️
- Survive unchanged: every `TransactionControllerTest`, `BudgetControllerTest`,
  `SubscriptionControllerTest`, `ProfileControllerTest`, `AuthControllerTest`,
  `PasswordlessModeTest`, `CategoryControllerTest` assertion; all of `BackupValidatorTest`.
- Change (deliberately): `CategoryColorTest.patchWithInvalidColorIs400` expects field `color`;
  `UpdateCategoryRequestTest.malformedColorViolatesColorValid` expects `color` (and is renamed).
- Add, **before** any production change (characterisation, green on today's code):
  1. A Validator-level test for the value rules: for every request property that carries money,
     currency or colour (5 + 6 + 1 today), boundary values produce exactly the expected
     `(property, message)` pairs — built with an English default locale (Q6). This is the first test
     that pins the messages at all; today only field names are asserted.
  2. An agreement test in `BackupValidatorTest`: one table per rule (money, currency, colour, name,
     merchant, description/notes) with the expected verdict per value; each row asserts the request
     property's verdict and the backup field's verdict both equal it.
- Delete: none. The controller-level money tests are not tests of a shallow module the new one
  absorbed; they test the HTTP mapping.

⚖️ Strongest argument against: the Validator-level test pins HV's own message text, so a Hibernate
Validator upgrade that rewords Digits would fail it — arguably a test of a library.

✅ Decision: as above. A failing message test after an HV upgrade is exactly the signal wanted: the
400 body changed.

---

❓ **Q23** - **Does the design introduce a seam (an interface with adapters)?**

🔎 Facts: composed constraints, constants and a merged record introduce no interface a caller could
swap. The one existing shared-rule interface, `BcryptPassword`, is untouched.

➡️ No new seam. Nothing varies across one, so none is introduced.

⚖️ Strongest argument against: none.

✅ Decision: no seam.

---

## Round 6 — sequence, docs, edges, siblings

❓ **Q24** - **In what order do the steps land?**

➡️
1. Characterisation tests (Q22 adds 1 and 2) — green on today's code; no production change.
2. Introduce `@MoneyAmount`, `@CurrencyCode`, `@HexColor` and `Money`'s integer-digit constant;
   replace the stacked annotations on the five money, six currency and one colour (`CreateCategoryRequest`)
   sites. All tests green; no wire or schema change.
3. `BackupValidator` reads the shared parameters. Green; 422 wording identical.
4. `UpdateCategoryRequest.color` gets `@HexColor`; `isColorValid()` goes; the two colour assertions
   change; `API.md` PATCH prose and pseudo-field list updated. Wire change: `colorValid` → `color`.
5. Merge the budget records into `BudgetRequest`; regenerate `schema.d.ts` (backend running); repoint
   and rename the frontend alias. Schema change: component rename.
6. `docs/API.md` money/currency/colour wording and `ARCHITECTURE.md` package line (may travel with
   steps 2 and 4); `docs/LESSONS.md` entry.

⚖️ Strongest argument against: step 1 before step 2 adds a test that passes immediately, which looks
like test-after; but for a refactor the requirement is "green before and after", and a test that
cannot fail on today's code is the characterisation that makes the refactor safe.

✅ Decision: this order; each step leaves `./mvnw verify` green (and `npm` build/lint green for step
5).

---

❓ **Q25** - **Which recorded-decision documents change in the same change?**

🔎 Facts: `docs/API.md:106-130` (money input rules, OpenAPI note, currency validation),
`:171-191` (validation failures; its example detail says "2 invalid fields" while the code says
"invalid field(s)", `GlobalExceptionHandler.java:84` — pre-existing drift), `:453-456`,
`:588-590`, `:627-640`, `:700-717`, `:996-1000`, `:1154-1162`, `:1397-1400`; `ARCHITECTURE.md:54-67`
and `:194-211`. `docs/SCHEMA.md:298-302` ("`char_length <= 100` mirrors `@Size(max = 100)`") stays
true.

➡️ `API.md` (money/currency/colour constraint names, the complete pseudo-field list, PATCH colour,
backup rules sentence), `ARCHITECTURE.md` (package line; a sentence in the OpenAPI section on why the
composed constraints keep the schema facts and why `@Schema` stays on fields). No `SCHEMA.md` change.
Details in `docs-proposals.md`.

⚖️ Strongest argument against: `API.md` tables currently spell out the built-ins with their numbers;
naming the composed constraint instead hides the numbers from a reader of the doc.

✅ Decision: the tables name the composed constraint **and** keep the numbers in words.

---

❓ **Q26** - **Edge cases and failure modes.**

🔎 Facts and scenarios:
- `-1.00001` → two violations on `amount` (DecimalMin and Digits), as today (HV composes with AND and
  keeps going); backup: two problems, as today.
- `1.00000` (value 1, scale 5) → Digits violation on both paths (trailing zeros count for a
  `BigDecimal`); without it `Money.normalize` would throw `ArithmeticException` → 500.
- `1E+3` (scale −3) → valid on both paths; `Money.normalize` gives `1000.0000`.
- Currency `""` → two errors (`@NotBlank` + pattern), `null` → one (`@NotBlank`), as today.
- Colour on PATCH: absent → valid; `null` → valid (clears to inherit); `"#A4D9C6"` → `color` error
  (was `colorValid`).
- A future contributor adds `@ReportAsSingleViolation` or `@OverridesAttribute` → messages or schema
  facts change silently; the Validator-level test catches the first, the OpenAPI diff (candidate 15)
  the second. The annotations' Javadoc says why neither is used.
- swagger-core older than 2.2.55 → `pattern`/`minimum` vanish from the schema; `required` survives
  (presence on the field).
- `Accept-Language: pl` → built-in messages in Polish, custom ones in English (pre-existing).
- `errors[]` order is not part of the contract before or after (HV set order).

✅ Decision: all handled by the design or recorded; none needs extra code.

---

❓ **Q27** - **What does this change mean for the sibling candidates?**

➡️
- **G3 / candidate 2 (problem → messages):** `errors[].field` is a real body field except the
  documented pseudo-fields. Alias table: `occurredOnNotInFuture` → `occurredOn`;
  `passwordWithinBcryptLimit` → `password`; `periodValid` → `periodEnd`; `nameValid` → `name`;
  `anyFieldSet` → banner. `colorValid` disappears after step 4 (aliasing it to `color`
  transitionally is harmless). Unknown field → banner. Messages: built-in ones follow
  `Accept-Language`, custom ones are English; unchanged by this candidate.
- **G3 / candidate 5 (form idiom):** step 5 edits `frontend/src/api/types.ts` and
  `frontend/src/api/hooks/budgets.ts` (and a comment in `BudgetForm.tsx`), which candidate 5 also
  touches; land either first and rebase the other.
- **G7 / candidate 15 (OpenAPI):** request money fields keep `@Schema(type="string",
  format="decimal", ...)` after this candidate — the composed constraint does not and cannot carry it;
  candidate 15 removes them with the response ones. Expected schema diff from this candidate: the
  `CreateBudgetRequest`/`UpdateBudgetRequest` components become `BudgetRequest`; `UpdateCategoryRequest.color`
  gains `pattern`; nothing else. The schema facts of composed constraints depend on swagger-core's
  `expandValidationMetaAnnotations` (2.2.55). If candidate 15 adds a schema check first, it verifies
  this for free; otherwise step 2's verification diffs `/v3/api-docs` by hand.
- **G7 / candidate 14:** no overlap (this candidate does not touch `TransactionMapper`).
- **G2 / candidate 11:** both edit `API.md` "Errors"; this candidate owns the pseudo-field paragraph
  and the constraint names in the tables, candidate 11 owns the new query-parameter paragraph.
- **G8 / candidate 17:** receives the date divergences (Q16) and the `API.md` example-detail drift.

✅ Decision: `Depends on: none`. Recommended order: any time; before candidate 5's budget-form
rewrite if convenient, and ideally after candidate 15's schema check exists.

---

❓ **Q28** - **What does `docs/LESSONS.md` get?**

🔎 Facts: related entries exist — "Sharing a validation rule across records" (`LESSONS.md:2930`),
"OpenAPI's `required` is a Bean Validation artifact" (`:2557`). No entry on constraint composition.

➡️ One new entry: constraint composition — a custom annotation meta-annotated with built-ins; why no
`@ReportAsSingleViolation` (keeps each built-in's message and field); why presence stays on the
field; why springdoc still sees the built-ins but not a `@Schema` on the annotation. Reference the two
existing entries rather than repeating them. (`LESSONS.md` is git-ignored — `.gitignore:13`.)

✅ Decision: as above.

---

## Round 7 — frontier check

Every node of the tree has a decision; no question is open whose prerequisites are settled. Facts I
could not verify are listed below and repeated in the spec's Further Notes.

**Not verified:**
1. The exact current `/v3/api-docs` content (no snapshot is committed; only `schema.d.ts`, which drops
   `pattern`, `minimum`, `default`). The implementer captures before/after and diffs.
2. That javac accepts an annotation type referencing its own constants in its meta-annotations
   (expected; fallback in Q12).
3. Spring Boot 4.1's wiring of the request-locale interpolator into the MVC validator (Spring
   Framework half verified).
4. When swagger-core introduced `expandValidationMetaAnnotations` (present in 2.2.55).
5. The date-range divergence scenario (Q16) was derived from code, not run.
6. `config/StrictStringBigDecimalDeserializer` was not re-read: the new tests feed `BigDecimal`
   directly, so the wire-level guarantee for five decimals and trailing zeros remains the existing
   controller tests (`TransactionControllerTest.java:152-163`, `BudgetControllerTest.java:151-160`).

---

## Decisions (one page)

1. **Shape:** each value rule is a composed Bean Validation constraint — `@MoneyAmount`,
   `@CurrencyCode`, `@HexColor` — built from the same built-ins as today, `@Constraint(validatedBy =
   {})`, no `@ReportAsSingleViolation`, no `@OverridesAttribute`. Proven to keep `errors[]` (field,
   message, count) and the schema facts (`required`, `pattern`, `minimum`) identical.
2. **Presence stays on the field** (`@NotNull @MoneyAmount`, `@NotBlank @CurrencyCode`); every value
   rule accepts `null`.
3. **No `@Schema` on the constraints.** swagger-core ignores it there; the decimal-string schema stays
   on each money field until candidate 15 states it once.
4. **No module for lengths** (`@Size(max = 100/500)` stays; a wrapper would be a pass-through).
5. **Parameters have one home:** money limits in `model.Money` (existing `SCALE` + new integer-digit
   limit, i.e. `NUMERIC(19,4)`), regex and message constants on `@CurrencyCode` / `@HexColor`. The
   annotations live in `dto`.
6. **Backup restore keeps its wording** and reads the same parameters; a table-driven agreement test
   holds request rules and backup rules to the same verdicts (money, currency, colour, names,
   merchant, free text).
7. **Pseudo-fields stay** for rules that need code: `occurredOnNotInFuture`,
   `passwordWithinBcryptLimit`, `periodValid`, `anyFieldSet`, `nameValid` — now listed completely in
   `API.md`. **Deliberate wire change:** a bad colour on `PATCH /api/categories/{id}` is reported as
   `color`, not `colorValid` (aligns code with `API.md`).
8. **Deliberate OpenAPI change:** `CreateBudgetRequest` + `UpdateBudgetRequest` merge into
   `BudgetRequest`; `schema.d.ts` regenerated and the frontend alias repointed in the same step.
   Subscription records stay two.
9. **Seam:** Bean Validation's `Validator` over request records, plus `BackupValidator.validate`;
   characterisation tests land first. Controller tests stay as the end-to-end net; none deleted.
10. **Out of scope, handed to G8:** backup rejects years outside 1..9999 that the write endpoints
    accept; restore skips the not-in-the-future rule; `API.md`'s example detail wording drift.
