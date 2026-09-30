# 03: Backup restore reads the value rules' parameters from their one home

**What to build:** backup restore checks money amounts, currency codes and category colours with the same limits, regular expressions and messages as the write endpoints, read from the one home of each value rule rather than from its own copies. Every problem string a restore returns stays exactly as it is. The API document's backup paragraph says restore reads the same parameters, that a test holds restore and the write endpoints to one table of values, and names the known date differences.

**Blocked by:** 02 (Each value rule has one home the request bodies use by name)

**Status:** done

- [x] Backup restore holds no copy of the currency or colour regular expression or message, nor of the money amount digit limits
- [x] Every existing backup restore test passes unchanged, and so does the agreement test
- [x] Backup restore's name and text length limits stay its own
- [x] The API document's backup paragraph describes the shared parameters, the agreement test and the known date differences

## Comments

- No new test: the existing backup validator tests (which pin the 422 fragments) and the agreement
  test from 01 are the guard, as the spec says. The problem strings are unchanged by construction:
  the constants hold the exact texts the literals held.
- Spec 17 recorded the two date differences but did not write them into `docs/API.md`, so the
  backup paragraph names them as the docs proposal says.
- Backend: `Tests run: 702, Failures: 0, Errors: 0, Skipped: 0`.
