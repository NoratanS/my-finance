# 03: Plan executor test and image hygiene

**What to build:** the plan executor's test tree loses the orphaned envelopes module nothing imports and the two tests that repeat others (health without a token, the bearer-token check), and a locally built analytics image excludes bytecode at any depth, exactly as a CI-built image does.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The orphaned envelopes module is gone
- [ ] Each behaviour is asserted once: the health module keeps the no-token health check, the execute module keeps the bearer-token check
- [ ] The image's build-context ignore rule excludes bytecode directories at any depth
- [ ] ruff, mypy and pytest are green, and the collected test count drops by exactly two
