# 0004 — The canvas is the design source of truth

Date: 2026-11-10 · Status: accepted

**Context.** The Claude Design canvas (`my-finance redesign`) is the only thing carried over from v1. It is desktop-first and dark-only; the only phone board is the add-transaction sheet.

**Decision.** The canvas is our Figma. Every screen gets desktop (1200), tablet (~820–1024) and phone (390) boards, including empty / error / loading states. Each milestone starts with a design pass; code starts only after I approve its boards. PRs link the boards they implement. Dark only for now. Parts the canvas marks open (tag-insight concepts) or deferred ("every other tag" split) stay out until decided there.

**Consequences.** Milestone 1 needs new boards (login, invite, reset password, settings). The profile picker boards are retired (ADR 0003).
