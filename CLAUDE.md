# CLAUDE.md

## Agent skills

### Issue tracker

GitHub Issues on `NoratanS/my-finance`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles, each label named after its role (`needs-triage` … `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Output rules

- Final reports lead with the outcome, ≤ 5 lines, no narration of steps.
- PR descriptions: what, why, the canvas board link, how it was verified.
- Questions to the owner come in one round, each with a recommended answer.
- Never push or merge; the owner does.

Decisions live in `docs/adr/` — read the ones touching your area before changing structure, and flag a conflict rather than working around it.
