# 05: A Plan only comes out of validation

**What to build:** validation is the only way to obtain a Plan: it takes the raw plan, the profile and a connection, and returns an executable Plan or raises the full list of plan problems, exactly as reported today. The Plan type states that guarantee once; the scattered "validated first" comments point at it. The executor's public names stay the same for the route and the tests.

**Blocked by:** 02 (Retire the merchant rollout flag)

**Status:** done

- [x] Validation returns a Plan or raises plan problems; the builder is private to validation
- [x] Plan problems are defined in the validation module and still importable, with execution, from the executor module
- [x] The Plan type states the guarantee; comments that restated the ordering point at it or state the real reason (a DSL value added without a mapping)
- [x] The validation table is unchanged row for row; only its harness changes
- [x] The plan-module tests are deleted and their two uncovered echo facts are asserted through execution
- [x] The SQL tests get their plans from validation, and their unreachable unknown-groupBy case is deleted
- [x] Every plan problem string, including the four the recorded exchanges carry, is byte-identical
- [x] The analytics gate (ruff, format, mypy, pytest) is green

## Comments

- The builder and its forecast helper are private to validation as `_build_plan` and
  `_build_forecast` (the spec calls them "the builder"; the pair is named alike).
- The executor's "raw plan is a dict" assert is gone; validation raises for a non-object plan
  before building, so no assert is needed there either.
- The recorded exchanges (spec 10) and the unchanged validation table both pass: every plan
  problem string is byte-identical.
- Analytics suite 195 → 190 (five plan-module tests and the unreachable `KeyError` case
  deleted; one echo test with two plans added through `execute`).
