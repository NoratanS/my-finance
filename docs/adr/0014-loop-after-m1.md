# 0014 — The loop after M1: notes go ahead, options in questions, milestone steps

Date: 2026-11-12 · Status: accepted · Amends [0010](0010-agent-loop.md)

**Context.** The M1 retro (#1). I approved the last five design notes (#27–#31) without changing them, and no PR needed a second fix round. In grilling I saw only a recommendation, not the options it was chosen from. Closing M1 and planning M2 had no written steps: the architecture findings (#27–#31) were filed by working it out on the spot.

**Decision.**
- **Autonomy slider, one step up.** A design note is still posted on its issue, but implementation goes ahead unless the note flags something: an open question, or a departure from the issue, an ADR or a board. A flagged note waits for my approval. Still one lane.
- **Questions show their options.** Every question to me lists the options, then a recommendation, including in grilling skills.
- **Milestone steps.** `/milestone close` and `/milestone plan` walk loop.md's sections 3 and 1. Architecture findings I pick become slices of the closing milestone, done before `dev` → `main`. Deferred review work becomes a `needs-triage` issue, triaged at milestone end. Planning checks that ADR 0009's digest routine is enabled: it was decided in M1 but never set up.

**Consequences.** I see unflagged notes after the fact, so a wrong one costs a PR review round instead of a note revision. A retro lowers the slider again if that happens twice. Releases wait for the architecture slices.
