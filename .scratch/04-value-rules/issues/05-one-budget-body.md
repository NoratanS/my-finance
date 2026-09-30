# 05: The Budget create and update endpoints share one body

**What to build:** creating and replacing a Budget accept one request body, `BudgetRequest`, which states the period rule once, still reported as `periodValid`. The JSON accepted by both endpoints is identical to today's. The OpenAPI document and the generated frontend types have one budget request component instead of two, and the frontend's budget hooks use one alias named after it. The API document's Budgets section says both methods share the body.

**Blocked by:** 02 (Each value rule has one home the request bodies use by name)

**Status:** ready-for-agent

- [ ] One budget request body serves both create and update; the two old bodies are gone
- [ ] Every existing budget controller test passes unchanged, and the value-rule and agreement tests cover the one body
- [ ] The committed OpenAPI document differs only by the component rename and the two request references to it
- [ ] The generated frontend types are regenerated from the committed document, and the budget alias and hooks use the one body type
- [ ] The frontend lint, format, type check, tests, build and Storybook build are green
- [ ] The API document's Budgets section names the shared body
