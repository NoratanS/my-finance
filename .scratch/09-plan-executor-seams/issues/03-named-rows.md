# 03: Query rows are read by name

**What to build:** the plan executor reads every column of its query by the name the SQL gives it, through a row type declared next to the statement, so reordering or renaming a column fails loudly instead of shifting values into the wrong field, and the type checker catches a misspelt column. The SQL text and every envelope stay the same.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A named, typed row type with the statement's five column aliases lives beside the statement; the statement text is unchanged
- [ ] The executor fetches rows through that type and reads no column by position; its row helpers are annotated with it
- [ ] The SQL tests fetch through the same row factory and keep every assertion unchanged
- [ ] The analytics gate (ruff, format, mypy, pytest) is green
