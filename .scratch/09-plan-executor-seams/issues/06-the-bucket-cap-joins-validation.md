# 06: The bounded bucket cap joins validation

**What to build:** every pre-query plan rule, the bucket cap included, lives in validation, which now also takes today's date. A bounded plan over the cap is still rejected alone, with the same message, once every other rule has passed. A range-all plan is still capped after the query, through the same rule and wording, because its rows decide its extent. The insights design document says when the cap is checked.

**Blocked by:** 05 (A Plan only comes out of validation)

**Status:** ready-for-agent

- [ ] A characterisation test for the range-all cap (two expenses 1,100 days apart, daily buckets) is written first and passes before the move
- [ ] Validation takes today's date and applies the cap to bounded ranges after the Plan is built
- [ ] The bucket limit sits with the other DSL limits; one public check holds the rule's only statement of the message
- [ ] The executor no longer checks the cap before the query; its range-all check uses the shared rule
- [ ] Both cap tests pass with the exact wording; the validation table is unchanged
- [ ] The insights design document's bounded output bullet says when the cap is checked
- [ ] The analytics gate (ruff, format, mypy, pytest) is green
