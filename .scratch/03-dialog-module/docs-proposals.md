# Docs proposals — candidate 3: One dialog module

## (a) Proposed glossary terms

None. Everything this candidate names — dialog, backdrop, opener, focus return, Tab trap — is UI
mechanics, not domain language, and the glossary holds domain terms only. No existing domain term
is renamed or used differently.

## (b) Proposed ADRs

None.

The only decision that looks ADR-shaped is "a React dialog module, not the native `<dialog>`
element". Checked against the three criteria:

- **Hard to reverse?** No. The module's interface (title, close handler, content, width) does not
  expose how it is built; switching its implementation to `<dialog>` + `showModal()` later changes
  one module and its tests, not its callers.
- **Surprising without context?** Somewhat — a reader may wonder why the platform element is not
  used.
- **Result of a real trade-off?** Yes — platform behaviour in the browser versus testability in
  jsdom 30.0.1, which implements no `showModal()`, no `close()` and no cancel event.

Two of three hold, so no ADR. The reason is recorded where the next person to change it will read
it: the module's doc comment (see the spec), plus a `docs/LESSONS.md` entry (git-ignored).

## (c) Required updates to recorded-decision documents

None.

- `ARCHITECTURE.md` §4 — unchanged. It does not describe dialogs, and its Storybook sentence
  ("`Card`, `ProgressBar`, `CategoryDot`, the insight `chips/`") stays true because no dialog story
  is added.
- `docs/API.md`, `docs/SCHEMA.md`, `docs/INSIGHTS.md` — do not mention dialogs; unchanged.
- `docs/design/styles.css` and its frontend copy — unchanged by design (the dialog keeps the
  design-system classes; `app.css` states that the design-system stylesheet is not edited).

Not a recorded-decision document, listed for completeness: the git-ignored `docs/LESSONS.md` gets
one entry (why a React module rather than native `<dialog>`; why the module owns initial focus),
referencing the existing entry "One dialog component, four callers — and doing the focus trap
`TxnModal` skipped" rather than repeating it.
