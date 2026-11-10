---
name: retro
description: Weekly or milestone-end retro on the agent loop; proposes ≤ 3 fixes at the strongest layer.
disable-model-invocation: true
---

A retrospective on this repo's agent loop ([loop.md](../../../docs/agents/loop.md)). The goal is fewer repeated problems next week, fixed where they can't recur.

## Steps

1. **Gather evidence** since the last retro, which is the last merged `chore(agents): retro` PR:
   - friction lines on the pinned `Retro: M<n>` issue;
   - the owner's review comments on merged PRs (`gh pr list --state merged --base dev`, then `gh pr view <n> --comments`);
   - bug-hunter and code-review findings quoted in PR threads;
   - design notes the owner rejected or changed.
2. **Group** the evidence into problems. A problem counts when it occurred at least twice, or once with a critical consequence.
3. **Pick the strongest layer** for each problem, in this order, and take the first that fits:
   1. **Architecture**: change the code's shape so the mistake can't be written.
   2. **Automated check**: a lint rule, type, test or CI job. Mechanical problems always land here.
   3. **Docs**: a rule in `docs/agents/standards.md`, a step in `loop.md`, a skill or agent edit, a `CLAUDE.md` pointer.
   4. **Human review**: the owner watches for it.
4. **Prune.** Find one line in `CLAUDE.md`, `loop.md`, `standards.md` or a skill that no longer changes behaviour, and propose deleting it. If a rule is now enforced by lint, delete it from the docs.
5. **Check the autonomy slider.** If the last 5 design notes were approved unchanged and no PR needed a second fix round, propose the next step: design notes go ahead unless they flag something, or a second lane.
6. **Present one round** to the owner: at most 3 fixes, most severe first, plus the deletion and the slider proposal. Each gets a recommendation. Format:

```
❓ R1 · <problem> (seen <n>×: #12, #15) → <layer>: <fix>
➡️ <recommendation>
```

7. **Apply what the owner approves** on a branch `retro-<yyyy-mm-dd>`, and open a PR titled `chore(agents): retro <yyyy-mm-dd>`. A change to the loop's structure also gets a new ADR. Post a summary comment on the retro issue and leave it pinned.

Done when the PR is open, or when the owner approves nothing and that is noted on the retro issue.
