# 01: The value rules and their agreement with backup restore are pinned by tests

**What to build:** before any production change, the build proves what a caller sees today for every money amount, currency code and category colour a request body carries, and that backup restore accepts exactly the values the write endpoints accept. For each request field that carries one of these value rules, boundary values produce exactly today's set of field violations — field name and English message — so a refactor or a library upgrade that changes a 400 body fails the build. One table per value rule (money amount, currency code, category colour, the names of profiles, categories and subscriptions, merchant, description and notes) lists each value with its expected verdict, and every row holds both the matching request field and the matching backup field to that verdict. A request sent with a Polish `Accept-Language` gets the built-in messages in Polish and the custom ones in English, as today. No production code changes; the tests pass on today's code.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Every request field carrying the money amount rule (transaction, both subscription bodies, both budget bodies) reports exactly the expected field violations for `0`, a negative amount, five decimals, `1.00000`, sixteen integer digits, `999999999999999.9999`, `0.0001` and a missing amount
- [x] Every request field carrying the currency code rule (those five plus the profile's default currency) reports exactly the expected field violations for `PLN`, `pln`, `PL`, `PLNX`, an empty string and a missing value
- [x] The category colour on the create body reports exactly the expected field violations for `#a4d9c6`, `#A4D9C6`, `a4d9c6`, `#a4d` and a missing value
- [x] The messages are pinned in English whatever the machine's default locale
- [x] One table per value rule gives the same, expected verdict through the request rule and through backup restore, for every backup field that carries that rule
- [x] A validation Problem for a request with a Polish `Accept-Language` carries the built-in amount message in Polish and the currency message in English
- [x] All new tests pass on today's code; the backend build is green

## Comments

- Characterisation, not red–green: these tests pin today's behaviour and pass on today's code by
  design, so there is no failing run to see (the spec's step 1). Checked that they discriminate: the
  86 value-rule cases carry different expected sets, and the locale test fails with
  `expected:<must be greater than 0> but was:<musi być większe od 0>` when its expectation is
  switched to English.
- The Polish `Accept-Language` test is an addition to the spec's list. It settles the spec's
  unverified fact 3: Spring Boot 4.1 wires the request-locale message interpolator into the MVC
  validator — built-in messages follow `Accept-Language`, custom ones stay English.
- The agreement test adds `1E+3` (valid on both sides), `PLN` followed by a newline and a
  seven-character colour (invalid on both sides) to the spec's values; each backup field that
  carries a rule is paired with each request field that carries it.
- Backend: `Tests run: 702, Failures: 0, Errors: 0, Skipped: 0`.
