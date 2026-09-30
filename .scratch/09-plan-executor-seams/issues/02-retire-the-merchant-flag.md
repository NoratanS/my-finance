# 02: Retire the merchant rollout flag

**What to build:** merchant filters and the merchant axis keep working exactly as they do, but the plan executor no longer carries a rollout flag for them: the route stops choosing a value, validation and execution lose the parameter, and the never-emitted "not available yet" plan problems disappear. Every test runs in the production configuration.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The flag constant, the shared "not available yet" message and both branches that emit it are gone
- [x] Validation, its filters check and execution no longer take the flag; the route no longer passes it
- [x] The two flag-only validation rows and the two merchant tests that call validation with the flag are deleted; the merchant array rule stays covered
- [x] Every other test drops the argument and keeps its expected values
- [x] Comments that referred to the flag or its branches no longer do
- [x] The analytics gate (ruff, format, mypy, pytest) is green

## Comments

- The two strings "groupBy: merchant filtering and grouping are not available yet" and
  "filters.merchants: merchant filtering and grouping are not available yet" are gone from the
  code. Production always passed the flag as true, so neither was ever emitted: no observable
  output changes. They survive only in the historical planning document under
  `docs/superpowers/plans/`, which is left as written.
- The `includeDescendants` comment in validation lost its closing contrast with the merchant
  fields, which referred to the branches removed here.
- Analytics suite 198 → 194 (two flag-only validation rows, two merchant validation tests).
