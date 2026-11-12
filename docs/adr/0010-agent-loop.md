# 0010 — The agent loop

Date: 2026-11-10 · Status: accepted · Supersedes [0008](0008-agent-workflow.md) · Amended by [0014](0014-loop-after-m1.md)

**Context.** 0008 set the direction: agents write the code, I decide and review. Since then I researched how Matt Pocock, Lauren Tan, Andrej Karpathy and Emil Kowalski run agents, and grilled the loop end to end. What I want: clean, decluttered code over speed; short reports; research before implementation; verification on the running app; a setup that improves itself.

**Decision.**
- **Loop.** Milestone grilling → PRD issue → slice issues (`ready-for-agent`, blocking edges) → per slice: research and a design note → implement (TDD) → verify → review → PR → I review and merge. The runbook is `docs/agents/loop.md`.
- **Design before code.** Each slice starts with a design note on its issue (approach, rejected alternatives, modules touched, planned tests, risks). Code starts only after I approve it. This is the low end of Karpathy's autonomy slider; a retro may raise it.
- **Architecture on a schedule.** `improve-codebase-architecture` runs at the end of each milestone; I pick which findings become issues.
- **Review.** One parallel round per PR: Matt's `code-review` (Standards + Spec) and our `bug-hunter` agent (bugs, performance, security). A bug-hunter finding counts as proven only with a reproducing command (Lauren Tan's rule).
- **Verification** uses `playwright-cli` through the repo's `verify` skill, walking the slice's acceptance criteria. Ad-hoc checks never become new e2e specs.
- **Trust before parallelism.** One lane at a time. A second lane (git worktree, independent slices only) unlocks when a retro says output is reliable. No unattended loops until then.
- **Self-improvement.** Agents log one friction line per slice on the milestone's pinned retro issue. A retro runs weekly and at each milestone's end, fixing each recurring problem at the strongest layer: architecture → lint/CI → skill or `CLAUDE.md` → human review.
- **Branches.** `dev` is the default branch; slices branch off it as `<issue>-<slug>` and squash-merge back with a Conventional Commits title. `dev` → `main` is a merge commit at milestone end. Stacked PRs only when one slice truly blocks the next.
- **Guardrails.** Agents push only their own slice branches and open PRs. GitHub rulesets block direct and force pushes to `dev`/`main` for everyone; `.claude/settings.json` denies merging, force-pushing and repo edits. No AI attribution lines in commits or PRs.
- **CI and Vercel.** 0008's "Branching and CI" settings still stand until M1's CI slice.
- **Output.** Reports lead with the outcome, ≤ 5 lines. Questions come in one round, each with a recommendation.

**Consequences.** Slower per slice than letting agents run, by design. Retros will change this loop; each structural change gets a new ADR, smaller ones land in the retro's PR.
