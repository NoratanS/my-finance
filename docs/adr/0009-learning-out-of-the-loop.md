# 0009 — Learning happens beside the work, not inside it

Date: 2026-11-10 · Status: accepted

**Context.** v1 made agents write a LESSONS.md entry per change — learning as homework inside the engineering loop. I want learning to be low-pressure and to fall out of the work as a byproduct.

**Decision.** Agents never stop to teach or set exercises. A weekly cloud routine reads the week's merged PRs and writes a short digest as a Claude Doc: 3–5 concepts that appeared in my own code, each tied to a file and line, why it was done that way, the rejected alternative, and one optional "if you're curious" thread. Readable on a phone; skipping one costs nothing. The main learning comes from making decisions and reviewing PRs; the digest names what already happened.

**Consequences.** No learning files in the repo. A yearly roll-up may land in the repo later if it's worth showing.
