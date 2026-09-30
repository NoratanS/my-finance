# 03: Plans, `viz` and execution bodies stated as free-form JSON objects

**What to build:** the OpenAPI document stops describing the internals of the backend's JSON tree
type. An Insight's plan and `viz`, and both bodies of the plan-execution endpoint, are documented
as free-form JSON objects whose structure the plan executor owns; `viz` may be `null`. The
frontend's plan and result-shape types stay hand-written.

**Blocked by:** 01 (The OpenAPI document becomes the checked wire contract)

**Status:** ready-for-agent

- [ ] A test (red first) asserts that no schema describes the JSON tree type, that plan, `viz` and both execution bodies are free-form objects, and that `viz` may be `null` on the Insight request and response
- [ ] The committed document and the generated declarations are regenerated, and the frontend compiles with its types unchanged
- [ ] No API response changes
- [ ] ARCHITECTURE.md and docs/API.md (Insights) say these values are opaque JSON objects and why
