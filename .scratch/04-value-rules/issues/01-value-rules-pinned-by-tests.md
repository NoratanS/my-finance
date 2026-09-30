# 01: The value rules and their agreement with backup restore are pinned by tests

**What to build:** before any production change, the build proves what a caller sees today for every money amount, currency code and category colour a request body carries, and that backup restore accepts exactly the values the write endpoints accept. For each request field that carries one of these value rules, boundary values produce exactly today's set of field violations — field name and English message — so a refactor or a library upgrade that changes a 400 body fails the build. One table per value rule (money amount, currency code, category colour, the names of profiles, categories and subscriptions, merchant, description and notes) lists each value with its expected verdict, and every row holds both the matching request field and the matching backup field to that verdict. A request sent with a Polish `Accept-Language` gets the built-in messages in Polish and the custom ones in English, as today. No production code changes; the tests pass on today's code.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Every request field carrying the money amount rule (transaction, both subscription bodies, both budget bodies) reports exactly the expected field violations for `0`, a negative amount, five decimals, `1.00000`, sixteen integer digits, `999999999999999.9999`, `0.0001` and a missing amount
- [ ] Every request field carrying the currency code rule (those five plus the profile's default currency) reports exactly the expected field violations for `PLN`, `pln`, `PL`, `PLNX`, an empty string and a missing value
- [ ] The category colour on the create body reports exactly the expected field violations for `#a4d9c6`, `#A4D9C6`, `a4d9c6`, `#a4d` and a missing value
- [ ] The messages are pinned in English whatever the machine's default locale
- [ ] One table per value rule gives the same, expected verdict through the request rule and through backup restore, for every backup field that carries that rule
- [ ] A validation Problem for a request with a Polish `Accept-Language` carries the built-in amount message in Polish and the currency message in English
- [ ] All new tests pass on today's code; the backend build is green
