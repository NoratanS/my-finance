# CLAUDE.md

my-finance v2: Rails 8.1 API in `api/`, React SPA in `web/`, on Vercel. Shape and constraints: `ARCHITECTURE.md`. Terms: `GLOSSARY.md`.

## Pointers

- **Building anything**: follow `docs/agents/loop.md` step by step.
- **Writing or reviewing code**: `docs/agents/standards.md`.
- **Decisions**: `docs/adr/`. Read the ADRs touching your area before changing structure. Flag a conflict with one; never work around it.
- **Issues, labels, glossary handling**: `docs/agents/issue-tracker.md`, `triage-labels.md`, `domain.md`.

## Output

- Reports lead with the outcome, ≤ 5 lines, shaped as in `loop.md` → Reports.
- Questions to the owner come in one round. Each lists its options, then a recommended one. This applies to grilling skills too.
- PR descriptions follow `.github/pull_request_template.md`. Commits follow Conventional Commits (`.gitmessage`), with no attribution trailers.

## Guardrails

Push only your own slice branch. The owner merges, closes issues and changes repo settings.
