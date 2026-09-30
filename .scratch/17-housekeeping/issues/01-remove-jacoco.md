# 01: Remove the unused backend coverage report

**What to build:** the backend build stops instrumenting every test run and writing a JaCoCo coverage report that nothing reads. The removal is its own commit so the owner can revert just this decision (it reverses the 2026-09-22 "keep all tooling" choice). The one-off command that still produces the report on demand is recorded for the owner.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The backend build declares no coverage plugin
- [ ] The full backend build is green and writes no coverage report
- [ ] The commit touches nothing but the backend build definition
- [ ] The ad-hoc command that reproduces the coverage baseline is recorded (report and lessons)
