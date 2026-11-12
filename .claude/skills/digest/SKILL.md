---
name: digest
description: Write the weekly learning digest (ADR 0009) as a Claude Doc. Usage: /digest
disable-model-invocation: true
---

Write the owner's learning digest from the PRs merged into `dev`. The brief is [ADR 0009](../../../docs/adr/0009-learning-out-of-the-loop.md): read it first. Read the repo only; edit, commit and comment nothing.

## Steps

1. **Range.**
   - Look up the newest Claude Doc titled `my-finance learning digest <date>` with the Claude Docs tools.
   - Run `git fetch origin dev`. Each PR is one squash commit on `origin/dev`, and its subject ends in `(#n)`. Cover the commits after that doc's date. If there is no earlier digest, start from #16.
   - If the range is empty, say so in one line and stop.
2. **Pick 3–5 concepts** that appear in the owner's own code.
   - Read each commit with `git show`, plus the ADRs, `GLOSSARY.md` and `docs/agents/standards.md` it touches. The design note is on the PR's issue (`gh issue view <n> --comments`), and the review notes are in the PR body.
   - Prefer what recurs or cost a review fix. Skip trivia.
3. **Write one Claude Doc** titled `my-finance learning digest <today>`. Follow the Claude Docs instructions: the skeleton comes first. For each concept, give:
   - a heading;
   - where it lives, as `file:line` (PR #n);
   - what it does and why it was done that way;
   - the rejected alternative, and why it was rejected;
   - one optional line starting "If you're curious:".

   Keep it under about 600 words, readable on a phone, in plain language, with no exercises. Never invent a reason: if the why isn't recorded, say so.

Done when the doc exists. Reply with its link in one line.
