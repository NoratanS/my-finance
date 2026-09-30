# 02: Retire the merchant rollout flag

**What to build:** merchant filters and the merchant axis keep working exactly as they do, but the plan executor no longer carries a rollout flag for them: the route stops choosing a value, validation and execution lose the parameter, and the never-emitted "not available yet" plan problems disappear. Every test runs in the production configuration.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The flag constant, the shared "not available yet" message and both branches that emit it are gone
- [ ] Validation, its filters check and execution no longer take the flag; the route no longer passes it
- [ ] The two flag-only validation rows and the two merchant tests that call validation with the flag are deleted; the merchant array rule stays covered
- [ ] Every other test drops the argument and keeps its expected values
- [ ] Comments that referred to the flag or its branches no longer do
- [ ] The analytics gate (ruff, format, mypy, pytest) is green
