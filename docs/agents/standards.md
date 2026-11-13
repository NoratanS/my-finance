# Coding standards

The reviewers' checklist (`/code-review` Standards axis, `bug-hunter`). Lint enforces formatting, size limits and type rules. This file holds the judgement calls. The why: [ADR 0011](../adr/0011-engineering-standards.md). Names come from `GLOSSARY.md`.

## api/ — Rails

**Domain logic**
- Domain logic lives in models, concerns, and plain Ruby objects under `app/models`. There is no `app/services`.
- Queries go through ActiveRecord, in this order: a scope (one table, simple) → a query object in `app/models` (several scopes, parameters, or several models) → raw SQL only when ActiveRecord can't express it, with bound parameters and a why-comment.
- Totals and aggregates are computed by the database (`sum`, `group`), never by iterating in Ruby.
- Money is an integer in minor units plus `kind` (ADR 0006). Formatting happens in `web/`.

**Controllers and routes**
- Controllers use only `index`, `show`, `create`, `update`, `destroy`. Any other action is its own resource: "mark as paid" → `Subscriptions::PaymentsController#create`.
- Routes are `shallow`. Updates use `PATCH`.
- A controller action parses params, calls one model method, and renders. Logic lives below it.
- Every record is loaded through `current_user` (`current_user.transactions.find(id)`), so another user's record is a 404.

**Responses**
- Each resource has one Alba resource class, matching its rswag schema.
- Errors are `application/problem+json` with `type`, `title`, `status`, and `errors: {field: [messages]}` for validation. One handler in `ApplicationController`.
- Status codes: 201 create, 204 destroy, 400 a required field is missing or the wrong type, 401 no session, 404 missing or not yours, 422 invalid.

**Specs**
- Request specs (rswag) are the main layer: each endpoint has its happy path, its validation failure, and a spec proving another user gets a 404.
- Model and query-object specs only where the logic branches.
- Each example is four-phase: set up its own data in plain sight, act once, assert, (teardown is automatic). No `let`, `subject` or `shared_context` for data an example depends on.
- Factories set required attributes only; variants are traits. Use `build` unless the example needs the database.
- Specs are fast, isolated and repeatable: no network, no sleeps, no dependence on order or the clock (freeze time when dates matter).

## web/ — React

**Structure**
- Code lives in `src/features/<feature>/`, with its components, hooks, queries and tests side by side. Shared UI lives in `src/components/ui/`.
- Imports use the `@/` alias and point at the file itself. There are no `index.ts` barrels.
- API types come from the generated OpenAPI types. Never hand-write an API shape.

**Data and state**
- Each feature has one `queryOptions` factory (`transactionQueries.list(filters)`). Components get query keys only from it.
- Server state lives in TanStack Query. Local UI state lives in `useState`. Derived values are computed during render.
- Effects only synchronise with something outside React. Derive, or handle it in the event, instead of syncing state in an effect.
- Forms use react-hook-form with a zod schema. Server field errors map from `problem+json` `errors`.

**Tests**
- Tests drive the feature through the screen, the way a user does: query by role and label, interact with `user-event`, mock the network with MSW handlers typed from the OpenAPI types.
- Unit tests cover pure logic only (money and date formatting).
- Never mock hooks or modules.

**UI**
- Each screen matches its canvas board at desktop, tablet and phone (ADR 0004).
- Interactive elements are reachable and operable by keyboard, with a visible focus state.

## Everywhere

- **DRY, rule of three.** Duplicate twice; extract on the third occurrence. When an abstraction grows flags or per-caller conditionals, inline it back.
- **KISS.** Build only what the slice asks for: no options, hooks or layers for imagined needs.
- **Reuse before writing.** Before new code, look in this order: a helper or component already in the repo → the standard library or the platform (Rails, ActiveSupport, a native HTML element) → an installed gem or package. Never add a dependency for what a few lines do.
- **Names** say what a thing is in domain terms. A name that needs a comment gets renamed.
- **Comments** explain why, in one line. Code that is dead or commented out gets deleted. A `TODO` carries an issue number.
- **One reason to change.** A file or class serves one concept. A diff that edits many files for one change hints that a concept is scattered.
