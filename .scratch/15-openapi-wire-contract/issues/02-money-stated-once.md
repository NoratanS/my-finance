# 02: Money stated once in the OpenAPI document

**What to build:** the OpenAPI document states that every money amount is a decimal string from
one registration, instead of from an annotation repeated on every money field. A test fails if
any property in the document is ever a bare JSON number, so a money field can no longer be
documented as a number by forgetting an annotation. The committed document does not change.

**Blocked by:** 01 (The OpenAPI document becomes the checked wire contract)

**Status:** done

- [x] A test asserts that no property anywhere in the served document is a number without a format; it passes against the annotated code before any change
- [x] Money is registered once as a decimal string (with its example) for every field of that Java type, and the committed document is unchanged by it
- [x] All per-field money annotations are removed, and the committed document is still unchanged
- [x] ARCHITECTURE.md and docs/API.md say where money's document schema comes from and that the test replaces the manual check

## Comments

- Inferred claim confirmed: `replaceWithSchema(BigDecimal)` takes effect for record properties.
  After deleting all 22 annotations the served document was byte-for-byte identical to the
  committed one. Removing the registration makes the bare-number test list every money field.
