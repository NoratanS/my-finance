# 04: The plan executor's Currency code rule matches the whole value

**What to build:** a plan whose currency filter carries stray whitespace (for example a trailing newline, reachable by editing the explorer's URL) is rejected as a plan problem with the existing "must be a three-letter ISO 4217 code" message, instead of being echoed back and blanking the page. The executor then accepts exactly what the backend's Currency code rule accepts. The merchant predicate's comment also drops its planning label.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] A failing row in the table-driven plan-validation test is seen red first: a currency with a trailing newline yields the existing currency plan problem
- [ ] The currency rule matches the entire value; the problem message is unchanged
- [ ] The merchant predicate's comment no longer says "Stage 1's"; the sentence is otherwise unchanged
- [ ] ruff, mypy and pytest are green
