# 02: New rows are owned by the verified active profile

**What to build:** creating a transaction, a budget, a subscription or an insight uses the verified active profile the active-profile module hands out as the owner of the new row, instead of an unverified reference to the stored id. The four services stop depending on the profile repository. Nothing observable changes: creates in a valid session answer as before, and creates in a session whose active profile was deleted keep answering `409` `/errors/no-active-profile`.

**Blocked by:** 01 — A dangling active profile reads as "no active profile" everywhere

**Status:** done

- [x] The active-profile module hands out the verified Profile, managed within the caller's transaction
- [x] Transaction, Budget, Subscription and Insight creates take that Profile and use its id for their scoped lookups
- [x] Those four services no longer depend on the profile repository
- [x] The sweep's create rows and every existing create test pass unchanged; the backend build is green

## Comments

- Backend: `Tests run: 443, Failures: 0, Errors: 0, Skipped: 0` (unchanged from ticket 01).
