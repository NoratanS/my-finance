# 02: Each value rule has one home the request bodies use by name

**What to build:** a request body states "required, and a money amount", "not blank, and a currency code" or "an optional category colour" by name instead of restating the stacked rule. The money amount rule takes its limits from the same place that states the storage format of money, so validation can never allow a scale the storage would reject. Every 400 body, every field name, message and count, and the OpenAPI document stay exactly as they are. The API document and the architecture document name the new value-rule constraints and keep the numbers in words.

**Blocked by:** 01 (The value rules and their agreement with backup restore are pinned by tests)

**Status:** ready-for-agent

- [ ] The money amount, currency code and category colour rules are each stated once and used by name on the five money, six currency and one colour request fields
- [ ] The maximum number of integer digits of a money amount is stated beside its scale, and the money amount rule reads both
- [ ] Presence stays on each field; each value rule accepts a missing value
- [ ] Each rule's documentation says why it reports the built-ins' own messages and why it has no attribute overrides
- [ ] The characterisation tests and every existing controller test pass unchanged
- [ ] The committed OpenAPI document is unchanged, and its check passes
- [ ] The API document's money and currency paragraphs, the OpenAPI paragraph and the endpoint tables name the constraints; the architecture document's package line and OpenAPI section mention them
