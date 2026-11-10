# 0008 — How agents build this

Date: 2026-11-10 · Status: superseded by [0010](0010-agent-loop.md)

**Context.** Part of the point of v2 is to find an AI-assisted setup that fits a Claude Max plan, produces good code, and makes me a better engineer rather than a vibe coder.

**Decision.**
- Agents write the code. I own decisions (grillings, specs) and review every PR. Nobody pushes or merges without me. Specs that would be fun to write by hand get a `nice-to-hand-code` label — optional, never pressure.
- One milestone at a time; one main session per milestone spawns an agent per issue (issue → branch → PR); a reviewer subagent checks the PR against the issue and standards before I see it. At most two parallel lanes, only for independent issues.
- Lean `CLAUDE.md` (< 100 lines); repeatable how-tos live in skills.
- **Output rules (non-negotiable):** final reports lead with the outcome, ≤ 5 lines, no narration. PR descriptions: what, why, board link, how verified. Questions come in one round with a recommendation each.

**Branching and CI.**
- Stacked PRs squash into `dev`, managed with plain `git rebase --update-refs` + `gh`. `dev` → `main` is always a merge commit, never a squash, at the end of a milestone.
- Every PR: fast job (< 2 min) — lint, type-check, specs/tests for touched files only.
- Push to `dev` / `main`: full suite + OpenAPI drift check + Brakeman + bundler-audit. `main` deploys prod, then the Playwright smoke runs.
- Vercel builds only `dev` and `main` (ignored-build step for other branches).
