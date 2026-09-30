# 06: The bounded bucket cap joins validation

**What to build:** every pre-query plan rule, the bucket cap included, lives in validation, which now also takes today's date. A bounded plan over the cap is still rejected alone, with the same message, once every other rule has passed. A range-all plan is still capped after the query, through the same rule and wording, because its rows decide its extent. The insights design document says when the cap is checked.

**Blocked by:** 05 (A Plan only comes out of validation)

**Status:** done

- [x] A characterisation test for the range-all cap (two expenses 1,100 days apart, daily buckets) is written first and passes before the move
- [x] Validation takes today's date and applies the cap to bounded ranges after the Plan is built
- [x] The bucket limit sits with the other DSL limits; one public check holds the rule's only statement of the message
- [x] The executor no longer checks the cap before the query; its range-all check uses the shared rule
- [x] Both cap tests pass with the exact wording; the validation table is unchanged
- [x] The insights design document's bounded output bullet says when the cap is checked
- [x] The analytics gate (ruff, format, mypy, pytest) is green

## Comments

- The characterisation test (1101 daily buckets) was committed on its own first and passed
  before the move; replacing the executor's range-all check with a no-op fails it. It passes
  unchanged after the move, as does the bounded case (13150 daily buckets).
- The shared check is `check_bucket_cap(count, interval)` in the validation module; the executor
  calls it only for `range: "all"`, after the query. `validate_plan` and `execute` both resolve
  the range (a pure function of the Plan and today).
- Three comments that the move made stale now point at the bucket cap or `MAX_BUCKETS` instead
  of the executor: the merchant bound's comment in validation, the matching test docstring, and
  `bucket_count`'s docstring in the range module.
- Analytics suite 190 → 191 (the characterisation test).
