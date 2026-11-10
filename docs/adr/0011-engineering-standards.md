# 0011 — Engineering standards

Date: 2026-11-10 · Status: accepted

**Context.** I want code that reads cleanly and stays small: REST, SOLID, FIRST, KISS, DRY. Slogans don't steer agents; checkable rules do. Where respected sources disagree, I picked one side so reviewers can enforce it.

**Decision.** The rules live in `docs/agents/standards.md`, the reviewers' checklist. Anything a linter can enforce lives in lint config instead. The choices behind them:

- **Vanilla Rails** (37signals): rich models, concerns, plain Ruby objects in `app/models`, no service layer. Queries through ActiveRecord: scope → query object → raw SQL only when ActiveRecord can't express it. Totals are computed in the database.
- **CRUD-only controllers**; a non-CRUD action becomes its own resource (DHH). Shallow routes.
- **Errors** as RFC 9457 `problem+json` with an `errors` member of field messages. Another user's record is a 404.
- **Alba** serializers. Pagination decided in M2's spec.
- **Tests:** explicit four-phase setup, no `let`/`subject` (thoughtbot, "mystery guest"); FactoryBot with minimal factories; request specs as the main layer. Frontend: Testing Library + MSW, integration-first; unit tests only for pure logic.
- **Web:** feature folders, no barrel files, `queryOptions` factories (TkDodo), no effects that sync state.
- **Lint:** `rubocop-rails-omakase` + `rubocop-rails` + `rubocop-rspec` + Metrics (class 100, method 10, params 4). TypeScript strict + `noUncheckedIndexedAccess`; ESLint `strict-type-checked` + `react-hooks` + `jsx-a11y`; Prettier with the Tailwind plugin. ESLint over Biome for the type-aware rules.
- **DRY:** rule of three; inline an abstraction that grows flags (Sandi Metz, "The Wrong Abstraction").

**Consequences.** Lint configs arrive with M1's scaffolding. Points that need real code to judge are revisited at the M1 retro.
