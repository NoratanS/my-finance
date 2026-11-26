# 0015 — Parallel lanes: up to three slices at once

Date: 2026-11-26 · Status: accepted · Amends [0010](0010-agent-loop.md) and [0014](0014-loop-after-m1.md)

**Context.** 0010 held the loop to one lane until a retro said output is reliable; 0014 kept it there. M1 and M2 slices landed without a second fix round. M2 ended with 8 issues labelled `ready-for-agent` and agent capacity left unused, since one lane runs one slice at a time. The web suite flaked under load during M2 (#78, the M2 retro #64), so parallel runs need a guard.

**Decision.**
- **Up to three lanes at once.** Each lane is a git worktree off `origin/dev`, created by the main session.
- **Disjoint files only.** Slices run in parallel only when they touch disjoint files. Slices sharing a file go one after another in the same lane; the next starts only after the previous PR is merged, since stacked PRs stay the exception (0010).
- **One orchestrator.** The main session runs every lane and posts each design note. A flagged note pauses only its own lane. Flags from several lanes reach me in one question round.
- **Shared services.** Lanes share one Postgres and one Rails API on :3000. Each lane runs its own Vite on its own port and its own named `playwright-cli` session. A slice that changes `api/` (migrations, API specs) runs alone. Full web suite runs take a shared lock.
- **My merges are the throttle.** A lane waits on my merge, not the other way round.

**Consequences.** More PRs arrive together, and merge conflicts in shared files land on me at merge time. A retro lowers the lane count if output quality drops: a second fix round or a reverted PR, twice.
