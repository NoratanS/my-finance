# 05: Frontend response types derived from the OpenAPI document

**What to build:** the frontend's response types become aliases of the generated ones, resource by
resource (auth, profiles and backup; categories; transactions; budgets; subscriptions; insights),
and take the backend record names, so a backend field rename becomes a TypeScript compile error.
Screens render exactly as before.

**Blocked by:** 04 (Success responses stated exactly)

**Status:** done

- [x] Each resource group's response types are aliases of the generated components, one commit per group, each green on lint, tests and build
- [x] Renamed types follow the backend record names (Transaction summary, Category monthly cost, Restored profile, Backup restore response) and the transaction page has its own name; every use is updated
- [x] The session user and a Budget status's embedded budget use the shapes the wire actually carries
- [x] The enums keep their frontend names as aliases on the generated response that carries them; Insight and Insight request keep their names with the hand-written plan and `viz`
- [x] The transaction list's query parameters and the Plan DSL and result-shape types stay hand-written
- [x] ARCHITECTURE.md says which frontend types remain hand-written, and why
