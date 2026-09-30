# 03: Query rows are read by name

**What to build:** the plan executor reads every column of its query by the name the SQL gives it, through a row type declared next to the statement, so reordering or renaming a column fails loudly instead of shifting values into the wrong field, and the type checker catches a misspelt column. The SQL text and every envelope stay the same.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] A named, typed row type with the statement's five column aliases lives beside the statement; the statement text is unchanged
- [x] The executor fetches rows through that type and reads no column by position; its row helpers are annotated with it
- [x] The SQL tests fetch through the same row factory and keep every assertion unchanged
- [x] The analytics gate (ruff, format, mypy, pytest) is green

## Comments

- With the rows typed, mypy checks every column the executor reads. The three Optional columns
  are narrowed where the plan guarantees them: one small helper returns a row's bucket for a
  plan with an interval (asserting it is not NULL), and the split asserts its group key and
  label. The split's running totals are now typed as decimals.
- Checked by hand: renaming one field of the row type makes every SQL test fail at fetch with
  a `TypeError` naming the unexpected column (reverted).
