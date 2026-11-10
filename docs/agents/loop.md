# The loop

The runbook for building this repo. The why lives in [ADR 0010](../adr/0010-agent-loop.md). The **main session** is the one the owner talks to; it spawns subagents and owns the issue tracker. Matt Pocock's planning skills are owner-typed (an agent can't start them): `/mattpocock-skills:grill-with-docs`, `to-spec`, `to-tickets`, `improve-codebase-architecture`. Issue commands: [issue-tracker.md](issue-tracker.md).

## 1. Milestone start

1. The milestone's boards on the canvas are approved (ADR 0004).
2. The owner types `/grill-with-docs` on the milestone, then `/to-spec`: one PRD issue (form: PRD), in a GitHub Milestone `M<n> <name>`.
3. The owner types `/to-tickets`: slice issues (form: Slice), each a sub-issue of the PRD with `Blocked by` edges. Each slice is a tracer bullet that fits one context window.
4. The owner approves the slice list; the main session labels the slices `ready-for-agent`.
5. Open and pin `Retro: M<n>`.

Done when every slice is labelled and the retro issue is pinned.

## 2. Per slice

The owner starts a fresh session per slice with `/slice <issue>`; that session is the main session for the slice.

**Pick.** The first open `ready-for-agent` slice in PRD order with no open blocker. One lane at a time.

**Research → design note.** A subagent reads the slice, `GLOSSARY.md`, the ADRs touching its area, and the code it will change, through the `codebase-design` lens: does the area need deepening first, and where does the seam go? It returns a design note of ≤ 10 lines, which the main session posts on the issue:

```
Approach: …
Rejected: … (why) · … (why)
Touches: <modules>
Tests: <specs planned>
Risks: …
```

Then the main session stops and asks the owner. Code starts only after approval.

**Implement.** A subagent gets the slice, the approved note and this file.
- Branch `<issue>-<slug>` off `origin/dev`.
- `/tdd`: red → green → refactor. Commit per green step, Conventional Commits (`.gitmessage`).
- Done when the touched suites and lint are green.

**Verify.** If `web/` changed, run the `verify` skill. Every acceptance criterion gets a pass or fail line.

**Review.** In parallel, against `origin/dev`: `/code-review` (Standards + Spec) and the `bug-hunter` agent. The implementer fixes every hard violation, spec gap and proven finding. A proven finding becomes a failing spec first. A judgement call is fixed or answered in one line in the PR. A critical finding re-runs `bug-hunter` on the fix; nothing else re-runs. After two fix rounds, stop and report.

**PR.**
- Push the slice branch, then `gh pr create --base dev`.
- Title: Conventional Commits, it becomes the squash commit.
- Body: the template's five headings, plus `Closes #<issue>`.

**Report** to the owner (shape below). The owner reviews; comments go back to the implementer. The owner merges.

**Friction.** If something slowed the slice down, add one line to `Retro: M<n>`: `#<issue>: <what slowed it> → <suspected fix>`.

## 3. Milestone end

1. The owner types `/improve-codebase-architecture` on the whole codebase; the owner picks the findings that become issues for the next milestone.
2. The `retro` skill.
3. A PR `dev` → `main`, merged by the owner as a merge commit.

## Retro

Weekly, and at every milestone end: the `retro` skill.

## Reports

Every report to the owner:

```
✅|⚠️|❌ <outcome in one line> → <PR or issue link>
Verified: <n>/<m> criteria · <suites run>
Needs you: <one action, or "nothing">
```

Two more lines at most. A subagent returns a brief, never raw tool output.

## Guardrails

Agents push only their own slice branches. Merging, closing issues, editing repo settings and writing to `dev` or `main` belong to the owner. GitHub rulesets and `.claude/settings.json` enforce this. Stop and ask when a step needs one of them.
