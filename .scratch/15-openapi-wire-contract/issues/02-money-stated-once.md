# 02: Money stated once in the OpenAPI document

**What to build:** the OpenAPI document states that every money amount is a decimal string from
one registration, instead of from an annotation repeated on every money field. A test fails if
any property in the document is ever a bare JSON number, so a money field can no longer be
documented as a number by forgetting an annotation. The committed document does not change.

**Blocked by:** 01 (The OpenAPI document becomes the checked wire contract)

**Status:** ready-for-agent

- [ ] A test asserts that no property anywhere in the served document is a number without a format; it passes against the annotated code before any change
- [ ] Money is registered once as a decimal string (with its example) for every field of that Java type, and the committed document is unchanged by it
- [ ] All per-field money annotations are removed, and the committed document is still unchanged
- [ ] ARCHITECTURE.md and docs/API.md say where money's document schema comes from and that the test replaces the manual check
