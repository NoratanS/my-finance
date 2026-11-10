# 0005 — Code is the doc; prose holds only the why

Date: 2026-11-10 · Status: accepted

**Context.** v1 kept SCHEMA.md and API.md in sync with code by hand, and they drifted.

**Decision.** `api/db/schema.rb` is the schema doc. rswag request specs generate the OpenAPI file, which is the API doc; `openapi-typescript` generates the frontend types from it. Prose is limited to `ARCHITECTURE.md`, `GLOSSARY.md` (glossary) and ADRs. Issues and specs live in GitHub Issues (a PRD issue per milestone, sub-issues per slice).

**Consequences.** Testing is RSpec + FactoryBot + request specs (rswag requires RSpec), Vitest + Testing Library in `web/`, one Playwright smoke test. CI fails when generated types drift from the specs.
