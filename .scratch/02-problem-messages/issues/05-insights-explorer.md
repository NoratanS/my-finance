# 05: The Insights explorer uses the module

**What to build:** saving, pinning and deleting an insight, running a plan, and loading a saved insight from a deep link all get their text from the module. Everything the explorer shows stays the same — the calm analytics-offline copy, the plan problems with their chip "Edit" buttons, the coded banner, "no longer exists" for a deleted insight — except that a network failure while running a plan now shows the shared fallback sentence. A deleted insight is recognised by its Problem type, and the test fixture for it uses the type the contract actually sends.

**Blocked by:** 01 (One module turns any failure into messages)

**Status:** ready-for-agent

- [ ] Characterisation tests for the run error — calm copy, plan problems, coded banner, network failure — are written first, rendered directly, and pass before the change
- [ ] The deleted-insight test fixture uses the contract's not-found type and passes before and after the change
- [ ] After the change the only changed expectation is the network-failure sentence
- [ ] None of the three files reads the error object any more
- [ ] Lint, format check, unit tests, build and Storybook build are green
