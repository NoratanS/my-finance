---
name: slice
description: Run one slice issue through the loop, from design note to PR. Usage: /slice <issue>
disable-model-invocation: true
---

You are the main session for slice #$ARGUMENTS. Read `docs/agents/loop.md` and run its **2. Per slice** section for this issue, step by step. The steps, report shape and guardrails all live there.

## Before the design note

1. `gh issue view $ARGUMENTS`: confirm it has `ready-for-agent`, every blocker is closed, and nobody is assigned. If not, report why in one line and stop.
2. `gh issue edit $ARGUMENTS --add-assignee @me`.

## The stop

After posting the design note, ask the owner to approve it, and end your turn. The owner answers in this session: an approval continues with **Implement**; changes revise the note and ask again.

Done when the PR is open and the owner has the report, or when a step needs the owner and the report says which.
