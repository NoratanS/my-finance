# 02: Each value rule has one home the request bodies use by name

**What to build:** a request body states "required, and a money amount", "not blank, and a currency code" or "an optional category colour" by name instead of restating the stacked rule. The money amount rule takes its limits from the same place that states the storage format of money, so validation can never allow a scale the storage would reject. Every 400 body, every field name, message and count, and the OpenAPI document stay exactly as they are. The API document and the architecture document name the new value-rule constraints and keep the numbers in words.

**Blocked by:** 01 (The value rules and their agreement with backup restore are pinned by tests)

**Status:** done

- [x] The money amount, currency code and category colour rules are each stated once and used by name on the five money, six currency and one colour request fields
- [x] The maximum number of integer digits of a money amount is stated beside its scale, and the money amount rule reads both
- [x] Presence stays on each field; each value rule accepts a missing value
- [x] Each rule's documentation says why it reports the built-ins' own messages and why it has no attribute overrides
- [x] The characterisation tests and every existing controller test pass unchanged
- [x] The committed OpenAPI document is unchanged, and its check passes
- [x] The API document's money and currency paragraphs, the OpenAPI paragraph and the endpoint tables name the constraints; the architecture document's package line and OpenAPI section mention them

## Comments

- javac accepts an annotation type that references its own constants in its own meta-annotations
  (`@Pattern(regexp = CurrencyCode.REGEX, …) public @interface CurrencyCode { String REGEX = …; }`),
  settling the spec's unverified fact 2; the fallback holder class was not needed.
- The served OpenAPI document is byte-identical to the committed one after this step
  (`OpenApiDocumentTest` green, `cmp` of `backend/target/openapi.json` and `docs/openapi.json` equal).
- Adapted to spec 15, which landed first: money is mapped to a decimal string once in
  `OpenApiConfig`, so no money field carries a `@Schema` any more. The docs proposals' sentences
  about "`@Schema` stays on each money field, not on `@MoneyAmount`" were dropped in `docs/API.md`
  and `ARCHITECTURE.md`; their remaining substance (springdoc expands the composed constraints'
  built-ins, so `required` lists and patterns stay; swagger-core 2.2.55) was kept. Money request
  fields never showed a `minimum` (the registered decimal-string schema replaces the whole
  `BigDecimal` schema), so the docs say "required lists and patterns", not "minimums".
- The blank lines that separated the formerly multi-line money and currency components inside the
  record headers were removed with them.
- Backend: `Tests run: 702, Failures: 0, Errors: 0, Skipped: 0`.
