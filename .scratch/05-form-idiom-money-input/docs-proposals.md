# Docs proposals — candidate 5: One form idiom, one money input

## (a) Proposed glossary terms

**Entered amount**:
An amount as a user types it into a form — digits with an optional comma or dot and up to four
decimals — before it has been checked and turned into a Money amount.
_Avoid_: typed amount, amount text, raw amount, input value

This sits next to the seed terms **Money amount** (the decimal string on the wire) and **Currency
code**; it names the one place where the two meet — a form boundary — and is what `parseAmount`
takes.

## (b) Proposed ADRs

None. Checked against the three criteria:

- *No form library; one plain form idiom* — hard to reverse: no (adding a library back is an
  install and a rewrite of the forms that want it); surprising without context: somewhat (a form
  library was adopted in the 2026-09 maintenance run and is now removed); real trade-off: yes. Two
  of three. The repo rule applies anyway: `ARCHITECTURE.md` §4 is where the frontend stack's
  "why" paragraphs live, so the reason goes there (below), not into an ADR.
- *A comma is accepted as the decimal separator in every money field* — hard to reverse: no;
  surprising: no (the app displays amounts with a comma); trade-off: small. One of three.

## (c) Required updates to recorded-decision documents

Both land in step G3-11, the step that removes the three packages.

### 1. `ARCHITECTURE.md` → §4 "Frontend" → new paragraph after "Why Storybook, scoped to primitives only"

**Add:**

> **Why plain form state, no form library:** every form is a component that keeps its fields in
> React state and submits through a real `<form>` — Enter submits, only the submit button submits,
> the form's own checks run first, and a failed request comes back through the one module that
> turns a Problem into messages. `react-hook-form` and `zod` were adopted for the budget form in
> the 2026-09 maintenance run and removed once no other form had followed them: with validation
> owned by the server (see above), a form library and a schema library bought one form a second
> idiom and three runtime dependencies. Converting an entered amount to a Money amount — a comma or
> a dot accepted, a dot always sent, at most four decimals — lives in the money module next to
> amount formatting.

(Placed after the Storybook paragraph so that it does not touch the paragraph candidate 2 extends
with its one sentence about error messages.)

### 2. `ARCHITECTURE.md` → §4 → "Why Recharts for charts (Phase 4)" (lines 253–255)

**Today:** "Cost accepted: ~100 kB gzipped and a d3 transitive tree in a frontend that otherwise
has three runtime dependencies."

The sentence was written on 2026-09-05 (`ced3912`), when the runtime dependencies were exactly
`react`, `react-dom`, `react-router-dom` and `@tanstack/react-query`; it has been false since the
form stack arrived (seven other packages), and the count "three" only works if React and React DOM
count as one.

**After:** "Cost accepted: ~100 kB gzipped and a d3 transitive tree in a frontend whose only other
runtime dependencies are React, React Router and TanStack Query."

True again once the three packages are removed, which is why it lands in the same step.

### Not changed

- `docs/API.md` "Money" and the request tables: the wire rules do not change; the client mirrors
  them (greater than zero, at most 15 integer and 4 fraction digits, a decimal string).
- `docs/SCHEMA.md`, `docs/INSIGHTS.md`: nothing about forms.
- `docs/superpowers/specs/2026-09-07-maintenance-run-design.md:129`, which planned the form library
  for "the budget CRUD forms (G1), then reused for the existing hand-rolled forms", and the reports
  under `.superpowers/sdd/2026-09-07-maintenance-run/`: historical plans, not recorded-decision
  documents; left as history. The new `ARCHITECTURE.md` paragraph supersedes them.

### Not a recorded-decision document

The git-ignored `docs/LESSONS.md` gets one entry (no form library; parsing an entered amount at the
form boundary; reset-by-key), referencing the existing entry on `<form>` and button types, and a
one-line "superseded" note on the existing entry "react-hook-form + zod: a schema has two types, not
one".
