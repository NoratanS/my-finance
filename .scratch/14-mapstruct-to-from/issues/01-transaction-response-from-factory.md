# 01: Every response record is built by its own `from()` factory

**What to build:** a Transaction response is built by a static `from` factory on its own record, the
same way every other response record is built, and the backend no longer carries MapStruct: no
dependency, no annotation processor, no mapper package and no mapper unit test. Every transaction
endpoint returns exactly the same JSON as before, and ARCHITECTURE.md records one mapping idiom
with the real reason it is safe (the record's canonical constructor is the compile-time field
check) and why MapStruct was tried and removed. Code and document change in one commit.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The backend suite's result is recorded before the change
- [x] The Transaction response record has a static factory that passes every component in the record's order, reads the subscription id without loading the Subscription and copies the amount as stored
- [x] Create, get, update and list of Transactions build their responses with that factory, inside the service's transactions, and the service no longer depends on a mapper
- [x] The backend build declares no MapStruct dependency, version property or annotation processor, and adds no replacement compiler configuration
- [x] The mapper and its unit test are deleted; no other test is edited
- [x] The committed OpenAPI document is unchanged and its drift check passes
- [x] The full backend build is green with the same results as before minus exactly the two deleted mapper tests
- [x] ARCHITECTURE.md's stack line, package layout and mapping paragraph describe one `from()` idiom and why MapStruct was removed; the record's Javadoc says it is built by `from`

## Comments

- Backend suite before the change (`./mvnw -B verify`): `Tests run: 431, Failures: 0, Errors: 0, Skipped: 0`.
  After (`./mvnw -B clean verify`): `Tests run: 429, Failures: 0, Errors: 0, Skipped: 0` — exactly the
  two deleted mapper tests fewer. The OpenAPI drift check passed with the committed document untouched,
  and the compiler reports no warning that was not there before.
- Wording deviation from the docs proposal: it said "every response DTO is a record with a static
  `from(entity)` factory" (and "each response record" in the package layout, "like every response
  record" in the Javadoc). Several response records are not built from an entity and have no `from`
  (the session, the active profile, the aggregate rows, the backfill count), so the three places say
  "built from an entity" instead. The rule and the reasoning are unchanged.
