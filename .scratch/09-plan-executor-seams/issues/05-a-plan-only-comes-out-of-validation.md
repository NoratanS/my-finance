# 05: A Plan only comes out of validation

**What to build:** validation is the only way to obtain a Plan: it takes the raw plan, the profile and a connection, and returns an executable Plan or raises the full list of plan problems, exactly as reported today. The Plan type states that guarantee once; the scattered "validated first" comments point at it. The executor's public names stay the same for the route and the tests.

**Blocked by:** 02 (Retire the merchant rollout flag)

**Status:** ready-for-agent

- [ ] Validation returns a Plan or raises plan problems; the builder is private to validation
- [ ] Plan problems are defined in the validation module and still importable, with execution, from the executor module
- [ ] The Plan type states the guarantee; comments that restated the ordering point at it or state the real reason (a DSL value added without a mapping)
- [ ] The validation table is unchanged row for row; only its harness changes
- [ ] The plan-module tests are deleted and their two uncovered echo facts are asserted through execution
- [ ] The SQL tests get their plans from validation, and their unreachable unknown-groupBy case is deleted
- [ ] Every plan problem string, including the four the recorded exchanges carry, is byte-identical
- [ ] The analytics gate (ruff, format, mypy, pytest) is green
