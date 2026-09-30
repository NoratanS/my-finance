# Grilling log — candidate 3: One dialog module

Repository: `/home/chris/side-projects/my-finance`, branch `dev`. HEAD is `c3e20c5`, whose tree is
identical to the brief's `4545810` (`git diff --stat 4545810 HEAD` is empty). Paths below are
relative to `frontend/` unless they start with another root. Every line number was re-read at
HEAD; where a card line number drifted, the verified one is used.

Read in full for this candidate: `src/components/TxnModal.tsx`, `src/screens/BudgetForm.tsx`,
`src/components/ConfirmDialog.tsx`, `src/components/Card.tsx`, the popovers in
`src/screens/Categories.tsx`, `src/app.css`, `src/styles.css` (dialog block),
`docs/design/styles.css`, the mockup's dialog markup in `docs/design/My Finance UI.dc.html`,
`src/components/TxnModal.test.tsx`, `src/components/ConfirmDialog.test.tsx`,
`src/screens/BudgetForm.test.tsx`, the dialog tests in `Budgets.test.tsx`, `Subscriptions.test.tsx`,
`Transactions.test.tsx`, `Insights.test.tsx`, `ProfilePicker.test.tsx`, `e2e/a11y.spec.ts`,
`e2e/smoke.spec.ts`, `ARCHITECTURE.md` §4, `docs/LESSONS.md` entries at lines 1931 and 2358.

Library facts were checked in `frontend/node_modules` (versions below), never from memory.

---

## The design tree

```
Constraints (Q1) ── Native <dialog> or React module (Q2) ──┬── Interface (Q5)
Dependencies (Q3)                                           ├── Initial focus + opener (Q6)
Scope: which dialogs, popovers (Q4) ────────────────────────┤── Tab trap (Q7)
                                                            ├── Escape + backdrop (Q8)
                                                            ├── Naming / a11y attributes (Q9)
                                                            ├── Location, portal, z-index (Q10)
                                                            └── ConfirmDialog as a caller (Q11)
            Seam discipline (Q12) ── Tests (Q13) ── Storybook (Q14) ── Edge cases (Q15)
            Sequence with 2 and 5 (Q16) ── Docs (Q17) ── Cross-candidate effects (Q18)
```

---

## Round 1 — frontier: Q1, Q2, Q3, Q4 (no prerequisites)

❓ **Q1** - **What constraints must the dialog design not break?** Options: list the recorded
decisions, markup/CSS contracts, test and CI rules that bind any dialog change.

🔎 Facts:
- `ARCHITECTURE.md:227–230`: React + Vite, plain CSS carrying the tokens of
  `docs/design/styles.css`, **no UI framework**.
- The dialog classes are defined by the design system: `docs/design/styles.css:233–250`
  (`.dialog-backdrop` = `position: fixed; inset: 0; display: grid; place-items: center` plus a
  translucent background; `.dialog` = width `min(440px, 100%)`, padding, surface, border, shadow;
  `.dialog-title`, `.dialog-body`, `.dialog-actions`). The frontend copy is
  `src/styles.css:240–257`, byte-identical to the design file except the disabled font import
  (`diff` shows only lines 2–9).
- `src/app.css:281–283`: "styles.css is the design system and is not edited; app.css loads after
  it."
- The mockup draws the dialog as backdrop → `.dialog.blueprint` with corners, title, fields,
  `.dialog-actions`, `z-index: 100` inline, and a backdrop click that closes
  (`docs/design/My Finance UI.dc.html:427–458`).
- Tests find dialogs by role and accessible name: `Budgets.test.tsx:71,80`
  (`getByRole('dialog', { name: /add budget/i })`), `ConfirmDialog.test.tsx:25–28` (name and
  `aria-modal="true"`), `Transactions.test.tsx:272`, `Subscriptions.test.tsx:77,99`.
- The axe gate opens all three dialogs and scans them with WCAG 2 A/AA rules:
  `e2e/a11y.spec.ts:133–139` (tags), `173–201` (TxnModal, ConfirmDialog, BudgetForm, each found
  with `page.getByRole('dialog')`). The comment at `151–171` notes axe does not check focus
  trapping.
- Unit tests run in jsdom (`vitest.config.ts:7`), CI runs lint, format check, tests, build and the
  Storybook build.
- `ConfirmDialog` has 7 call sites in 6 files: `Budgets.tsx:227`, `ProfilePicker.tsx:521`,
  `Subscriptions.tsx:345,357`, `Transactions.tsx:382`, `Categories.tsx:411`,
  `SaveControls.tsx:223`.

➡️ The design must keep: the design-system class names and structure (backdrop wrapping a
`.dialog.blueprint`), no edits to the design-system stylesheet, `role="dialog"` with an
accessible name from the title and `aria-modal="true"`, the 7 `ConfirmDialog` call sites
unchanged, and behaviour that is testable in jsdom.

⚖️ Strongest argument against: "No edits to styles.css" is a local convention, not a recorded
decision; a native `<dialog>` could restyle through `app.css` without touching it.

✅ Decision: the constraints above stand. They are inputs to Q2 (markup) and Q13 (tests).

❓ **Q2** - **Native `<dialog>` with `showModal()`, or one shared React module that keeps the
current markup?** Options: (a) native `<dialog>` + `showModal()`, backdrop via `::backdrop`;
(b) a React component that owns the existing markup and behaviour; (c) native `<dialog>` in
production plus hand-written behaviour for tests.

🔎 Facts:
- Installed jsdom is **30.0.1** (`node_modules/jsdom/package.json`). Its dialog implementation
  is an empty class: `node_modules/jsdom/lib/jsdom/living/nodes/HTMLDialogElement-impl.js:1–9`
  (`class HTMLDialogElementImpl extends HTMLElementImpl { }`). The generated interface exposes
  only the `open` attribute: `node_modules/jsdom/lib/generated/idl/HTMLDialogElement.js:103–147`.
  There is no `showModal`, `show`, `close`, `returnValue`, no `cancel`/`close` events, no top
  layer, no inertness.
- jsdom's user-agent stylesheet hides a closed dialog:
  `node_modules/jsdom/lib/jsdom/browser/default-stylesheet.css:32`
  (`dialog:not([open]) { display: none; }`). Testing Library's `getByRole` skips inaccessible
  (hidden) elements by default, so a `<dialog>` whose `showModal()` never ran would not be found
  by the tests listed in Q1.
- Five existing unit tests exercise dialog behaviour that jsdom would no longer provide under
  (a): `TxnModal.test.tsx:62–68` and `70–76` (Tab wrap), `119–130` (focus restore);
  `ConfirmDialog.test.tsx:52–58` (Escape), `60–79` (focus restore), `81–89` (Tab). Three more
  screen tests press Escape on a `ConfirmDialog`: `Subscriptions.test.tsx:84–91`,
  `Insights.test.tsx:76–83`, and they would stop closing it in jsdom.
- The CSS assumes a wrapper element: `.dialog-backdrop` is the fixed full-screen grid that
  centres `.dialog` (`src/styles.css:241–245`). A native modal dialog would need `::backdrop`
  rules and overrides of the user-agent `dialog`/`dialog:modal` styles (jsdom's copy of them is at
  `default-stylesheet.css:33–54`: `border: solid`, `padding: 1em`, `max-width: calc(100% - 6px -
  2em)`, `overflow: auto`), all in `app.css`.
- A native modal dialog has no built-in "click outside closes" for modal dialogs in the browsers
  this app targets — **not verified here**; it does not affect the decision because of the jsdom
  facts above.

➡️ (b): one React module that keeps today's markup and owns the behaviour. Native `<dialog>` is
rejected because the unit-test environment implements none of it, so every behaviour test would
either be deleted or run against a stub that is not the production behaviour (option (c) is
exactly that: tests would test code production never runs).

⚖️ Strongest argument against: in a real browser `showModal()` gives the top layer, inertness of
the page behind and Escape handling for free; a React module re-implements what the platform
already does, and the Tab trap it keeps is weaker than true inertness.

✅ Decision: a shared React module, current markup. Revisit native `<dialog>` only when the
unit-test environment implements `showModal()` (a jsdom upgrade) or dialog behaviour tests move
to a real browser. Unblocks Q5–Q11.

❓ **Q3** - **What does the module depend on, by category?** Options: in-process,
local-substitutable, ports & adapters, mock.

🔎 Facts: the three dialogs use only React state/effects and DOM focus APIs
(`TxnModal.tsx:67–104`, `ConfirmDialog.tsx:35–58`, `BudgetForm.tsx:65–75`); none talks to the
network itself — their mutations come from hooks the callers own (`TxnModal.tsx:49–50`,
`BudgetForm.tsx:34–35`).

➡️ **In-process** only (React and the DOM). No port, no adapter, no mock. Tests render the
module directly in jsdom.

⚖️ Strongest argument against: none of substance; focus behaviour in jsdom is an approximation
of a browser, but the existing tests already rely on it.

✅ Decision: in-process; tested directly.

❓ **Q4** - **Which dialogs are in scope, and are the two Categories popovers in?** Options:
(a) the three modal dialogs only; (b) the three plus `ColorPopover` and `MovePopover`.

🔎 Facts:
- Modal dialogs: `TxnModal` (`TxnModal.tsx:161–311`), `BudgetForm` (`BudgetForm.tsx:93–198`),
  `ConfirmDialog` (`ConfirmDialog.tsx:60–90`).
- The popovers are anchored, non-modal, have no backdrop and no Tab trap: `ColorPopover`
  (`Categories.tsx:432–480`, Escape + outside-mousedown effect at `441–458`, `role="dialog"` at
  `461`, closes on pick), `MovePopover` (`Categories.tsx:492–555`, Escape effect at `507–514`,
  `role="dialog"` at `520`). They are positioned by `.color-popover` (`app.css:199–212`).
- The Escape effect is written five times: `TxnModal.tsx:78–84`, `ConfirmDialog.tsx:44–50`,
  `BudgetForm.tsx:69–75`, `Categories.tsx:442–457` (inside the popover effect),
  `Categories.tsx:508–514`.

➡️ (a). The popovers are a different thing — non-modal, anchored, no focus management — and
forcing them into a modal module would add options nobody else needs. They keep their own
Escape effects; the count of Escape effects drops from five to three (the module and the two
popovers).

⚖️ Strongest argument against: a tiny shared "Escape closes" hook would remove two more copies
and is not the dialog module.

✅ Decision: three modal dialogs in scope; popovers explicitly out. A shared Escape hook for the
popovers is not proposed (two copies in one file, deletion test fails: nothing reappears
elsewhere).

---

## Round 2 — frontier: Q5–Q11 (Q2 and Q4 settled)

❓ **Q5** - **What is the module's interface — the smallest set of things a caller passes?**
Options: (a) title, close handler, content; (b) (a) plus an `actions` slot; (c) (a) plus an
initial-focus target; (d) (a) plus a width.

🔎 Facts:
- What varies across the three callers today: the title text (`TxnModal.tsx:174–176`,
  `BudgetForm.tsx:104–106`, `ConfirmDialog.tsx:71–73`); the close handler; the content; the width
  (`TxnModal.tsx:171` and `BudgetForm.tsx:101` set `min(480px, 100%)` inline, `ConfirmDialog`
  uses the design default of 440 from `src/styles.css:247`).
- The two form dialogs must keep their action buttons **inside** their `<form>`, because the
  submit button must belong to the form: `TxnModal.tsx:177–308`, `BudgetForm.tsx:107–195`.
- The first focusable element is the one each dialog focuses today: amount input in `TxnModal`
  (`TxnModal.tsx:75,187–196` — first control inside the form), category select in `BudgetForm`
  (`BudgetForm.tsx:66–68,111`), Cancel in `ConfirmDialog` (`ConfirmDialog.tsx:40,76`, rendered
  before the confirm button).

➡️ (a) + (d): **title**, **close handler**, **content**, and an optional **width** (defaults to the
design system's 440; the two form dialogs pass 480). No `actions` slot (it would split the form's
submit button from its `<form>`), and no initial-focus option (the first focusable element is
already the right target in all three dialogs — adding the option now would be a seam with no
variation).

⚖️ Strongest argument against: a width in pixels is a styling leak; the two widths could collapse
into one (all dialogs 480, or all 440) and the prop would disappear.

✅ Decision: title, onClose, children, optional width. Unifying the widths is a visual design
change and is out of scope. Unblocks Q6–Q10.

❓ **Q6** - **Who owns initial focus, and how is the opener captured?** Options: (a) callers
focus their own element (today); (b) the module captures the opener and then focuses the first
focusable element, in one mount effect; (c) the module captures the opener during its first
render (lazy state initializer), so even a child's `autoFocus` cannot defeat the restore.

🔎 Facts:
- Today's ordering rule is written in a comment: "the opener must be captured before the
  `.focus()` call below moves it" (`TxnModal.tsx:67–69`, effect `73–77`); `ConfirmDialog.tsx:38–42`
  repeats the pattern; `BudgetForm.tsx:66–68` focuses via the form library and never captures an
  opener.
- `src/main.tsx:20` renders under `StrictMode`, so mount effects run twice in development; the
  existing pattern (capture → focus → cleanup restores) survives that: the cleanup refocuses the
  opener, and the second run captures it again.
- The repo's lint preset is `eslint-plugin-react-hooks@7.1.1` recommended
  (`eslint.config.js:16`), which includes the compiler rules `refs`, `purity` and
  `set-state-in-effect` (`node_modules/eslint-plugin-react-hooks/cjs/eslint-plugin-react-hooks.development.js:18090–18335`
  presets, config assembly at `55416–55440`).
- React runs a child's effects before its parent's effects — this is React library behaviour, **not
  verified in this repo**; it is why a child that focuses itself on mount (e.g. `autoFocus`) would
  be captured as the "opener" by an effect in the parent.

➡️ (b). The module does both, in one mount effect, in the right order: remember
`document.activeElement`, focus the first focusable element inside the dialog, and on unmount
return focus to the remembered element. Callers never call `.focus()` and never use `autoFocus`
inside a dialog. (c) is more robust but reads the DOM during render — impure by React's rules and
a likely target of the compiler lint preset — for a case no current dialog has.

⚖️ Strongest argument against: (b) leaves one caller rule ("no `autoFocus` inside a dialog"); (c)
would leave none.

✅ Decision: (b). The caller rule is written in the module's doc comment and in the LESSONS
entry. The ordering rule leaves the callers' interface entirely.

❓ **Q7** - **Tab trap: generic, or the two-button toggle?** Options: (a) generic — on Tab /
Shift+Tab at an edge, wrap; focusables queried fresh on every key press; (b) keep the toggle for
`ConfirmDialog`.

🔎 Facts: generic trap at `TxnModal.tsx:86–104` (selector skips disabled controls and
`tabindex="-1"`); toggle at `ConfirmDialog.tsx:52–58` (always `preventDefault`, bounces between
two refs). `ConfirmDialog`'s `body` is a `ReactNode` (`ConfirmDialog.tsx:8`), so a link in the body
would be unreachable under the toggle. `confirmDisabled` (`ConfirmDialog.tsx:13,83`) disables the
confirm button; `.focus()` on a disabled button is a no-op, so the toggle then leaves focus on
Cancel.

➡️ (a) for all three. With two buttons it behaves exactly like the toggle; with a disabled
confirm button the only focusable is Cancel and the wrap keeps focus there; content with links
now stays reachable.

⚖️ Strongest argument against: a generic selector can miss exotic focusables (contenteditable,
elements hidden by CSS); the toggle had no such gap for its two buttons.

✅ Decision: generic trap, the `TxnModal` selector, queried on every key press.

❓ **Q8** - **Escape and backdrop click: what exactly closes the dialog?** Options: keep today's
behaviour; add guards (ignore while pending; ignore a drag that ends on the backdrop).

🔎 Facts: all three close on Escape via a `document` keydown listener (`TxnModal.tsx:78–84`,
`ConfirmDialog.tsx:44–50`, `BudgetForm.tsx:69–75`) and on a backdrop click, with
`stopPropagation` on the dialog box (`TxnModal.tsx:162,169`, `ConfirmDialog.tsx:61,67`,
`BudgetForm.tsx:94,100`). Pressing the mouse inside the box and releasing it on the backdrop fires
the click on their common ancestor — the backdrop — so a text selection that overshoots closes the
dialog; this follows from DOM click semantics and is **not reproduced here**.

➡️ Keep today's behaviour exactly: Escape anywhere → close handler; click on the backdrop →
close handler; click inside → nothing. No new guards in this refactor.

⚖️ Strongest argument against: the drag-release bug now lives in one place and could be fixed
once for all three dialogs.

✅ Decision: behaviour preserved; the drag-release case is recorded as a follow-up in the spec's
Further Notes, to be fixed test-first in its own change.

❓ **Q9** - **Accessible naming and ARIA attributes.** Options: keep hard-coded title ids
(`txn-dialog-title`, `budget-dialog-title`, `confirm-dialog-title`) or generate them; keep
`aria-modal`; make the title a heading?

🔎 Facts: hard-coded ids at `TxnModal.tsx:168,174`, `BudgetForm.tsx:99,104`,
`ConfirmDialog.tsx:66,71`. Two `ConfirmDialog`s mounted at once would share an id (not possible
today — each screen renders at most one). React is **19.2.8** (`node_modules/react/package.json`),
which has `useId`. `ConfirmDialog.test.tsx:28` asserts `aria-modal="true"`. The title is a `div`
styled by `.dialog-title` (`src/styles.css:252–255`); `h1`–`h6` carry global sizes and margins
(`src/styles.css:92–101`).

➡️ The module generates the title id with `useId`, sets `role="dialog"`, `aria-modal="true"` and
`aria-labelledby` pointing at the title. The title stays a `div` (no visual change).

⚖️ Strongest argument against: a heading element would help screen-reader users navigate by
headings.

✅ Decision: as recommended; heading semantics are out of scope (a visual change).

❓ **Q10** - **Where does the module live, what is it called, and does it portal?** Options:
`components/Dialog` rendered in place; a portal to `document.body`.

🔎 Facts: shared presentational components live in `src/components/` (`Card.tsx`,
`ConfirmDialog.tsx`, `ProgressBar.tsx`). No portal exists anywhere (`grep createPortal src` →
nothing). The backdrop is `position: fixed` with an inline `z-index: 100` in all three dialogs
(`TxnModal.tsx:162`, `BudgetForm.tsx:94`, `ConfirmDialog.tsx:61`); the mockup does the same
(`My Finance UI.dc.html:428`). The popovers use `z-index: 60` (`app.css:203`).

➡️ A `Dialog` component in the components folder, rendered in place (no portal), owning the
`z-index: 100` that the three callers repeat today, and the `Corners` markup from `Card`.

⚖️ Strongest argument against: rendering in place breaks if an ancestor ever gets a `transform`
or `filter` (fixed positioning becomes relative to it); a portal is the textbook defence.

✅ Decision: in place, as today; a portal is added only if such an ancestor ever appears.

❓ **Q11** - **Does `ConfirmDialog` become a caller of the dialog module?** Options: (a) yes,
keeping its own interface; (b) no, leave it as it is.

🔎 Facts: `ConfirmDialog`'s interface is `title`, `body`, `confirmLabel`, `cancelLabel?`,
`onConfirm`, `onClose`, `confirmDisabled?` (`ConfirmDialog.tsx:4–14`); 7 call sites (Q1); its
doc comment promises initial focus on Cancel and dismissal by Escape and backdrop
(`ConfirmDialog.tsx:16–22`). Deletion test from the review: it earns its keep (7 callers).

➡️ (a). Its interface does not change; its body shrinks to the `Dialog` plus a `.dialog-body` and
`.dialog-actions` with Cancel first. Cancel stays first in the DOM, so "initial focus on Cancel"
now follows from the module's rule.

⚖️ Strongest argument against: leaving a working, tested component alone is cheaper; its toggle
trap is correct for its two buttons.

✅ Decision: (a). Otherwise the shell would still be written twice and the behaviour would
diverge again the next time one copy changes.

---

## Round 3 — frontier: Q12–Q15 (interface settled)

❓ **Q12** - **Seam discipline: is there a seam with adapters here?** Options: introduce a
`DialogProvider`/portal target/"dialog service"; or none.

🔎 Facts: one implementation of dialog behaviour is needed; nothing varies across environments
(no second adapter: tests and production run the same component in the same DOM).

➡️ No adapter seam. The module's props are its interface; behind it sit the shell markup, focus
capture/restore, initial focus, the Escape listener, the backdrop click and the Tab wrap. Callers
are not adapters; they are three users of one module.

⚖️ Strongest argument against: a provider would allow stacking/nesting rules later.

✅ Decision: no provider, no context, no seam beyond the props. One adapter would make it a
hypothetical seam.

❓ **Q13** - **Which tests move, which stay, which are deleted, and what is the test seam?**

🔎 Facts:
- `TxnModal.test.tsx` has 8 tests; dialog behaviour: `62–68` (Tab from last wraps to first),
  `70–76` (Shift+Tab from first wraps to last; it also asserts initial focus on Amount at `73`),
  `119–130` (focus restore). Form behaviour: `30–40`, `46–51`, `53–60`, `82–95`, `97–117`.
- `ConfirmDialog.test.tsx` has 7 tests: `23–29` (named by title, `aria-modal`), `31–34` (initial
  focus on Cancel), `36–42` / `44–50` (confirm vs cancel wiring), `52–58` (Escape dismisses
  without confirming), `60–79` (focus restore), `81–89` (Tab does not escape).
- `BudgetForm` has no dialog-behaviour test (`BudgetForm.test.tsx` has 2 tests, both about the
  amount).
- Prior art for rendering a component directly with `render` + `userEvent`:
  `ConfirmDialog.test.tsx:7–21`; for focus restore with a detached trigger button:
  `ConfirmDialog.test.tsx:60–79`.

➡️ Test seam: the `Dialog` module's own interface, rendered directly in jsdom with simple
content (an input and two buttons) — one seam, the highest one that exercises the behaviour.
New `Dialog` tests (each replaces the listed old test):
1. It is a modal dialog named by its title (`role="dialog"`, accessible name, `aria-modal`).
2. On open, focus moves to the first focusable element (replaces the implicit check at
   `TxnModal.test.tsx:73`).
3. Escape calls the close handler.
4. A click on the backdrop calls the close handler; a click inside the dialog does not.
5. Tab from the last focusable element wraps to the first (replaces `TxnModal.test.tsx:62–68`
   and `ConfirmDialog.test.tsx:81–89`).
6. Shift+Tab from the first wraps to the last (replaces `TxnModal.test.tsx:70–76`).
7. A disabled control is skipped by the wrap.
8. Closing (unmount) returns focus to the element that had it before opening (replaces
   `TxnModal.test.tsx:119–130` and `ConfirmDialog.test.tsx:60–79`).
Deleted: `TxnModal.test.tsx` 62–68, 70–76, 119–130; `ConfirmDialog.test.tsx` 60–79, 81–89.
Kept unchanged: `TxnModal.test.tsx`'s five form tests; `ConfirmDialog.test.tsx` 23–29, 31–34
(Cancel-first is `ConfirmDialog`'s own promise), 36–42, 44–50, 52–58 ("without confirming" is a
`ConfirmDialog` safety property, not only the Escape wiring); every screen test that finds a
dialog by role/name or presses Escape.

⚖️ Strongest argument against: deleting the `TxnModal` focus tests loses the proof that
`TxnModal` in particular focuses Amount first; that now depends on the Amount input staying the
first control.

✅ Decision: as recommended; the form tests in `TxnModal.test.tsx` already select by label, and
`e2e/a11y.spec.ts:173–181` keeps scanning the real dialog. No test is added to `BudgetForm` for
dialog behaviour (it gets the behaviour by construction; testing it again would be layering).

❓ **Q14** - **Does the dialog get a Storybook story?**

🔎 Facts: `ARCHITECTURE.md:260–268` justifies stories by "states that are awkward to reach in
the running app" and limits them to presentational primitives; the existing stories are
`Card`, `CategoryDot`, `ProgressBar` and the insight chips (`ls src/components`,
`src/insights/chips`). `ConfirmDialog` has no story today. Every dialog is one click away in
the running app.

➡️ No story. The dialog is a primitive, but it has no state that is awkward to reach, which is
the documented reason for a story.

⚖️ Strongest argument against: the static Storybook is the portfolio artifact
(`ARCHITECTURE.md:266–268`) and a dialog is a visible design-system piece.

✅ Decision: no story in this change; the Storybook scope sentence in `ARCHITECTURE.md` stays as it
is.

❓ **Q15** - **Edge cases and failure modes.** Concrete scenarios:

🔎 Facts and scenarios:
1. *Opener removed while the dialog is open* — editing a transaction from a row
   (`Transactions.tsx:404`); if the saved change moves the row off the current page, the Edit
   button is detached. `.focus()` on a detached element is a no-op → focus falls to `<body>`.
   Same as today.
2. *StrictMode double mount* (`main.tsx:20`) — capture, focus, cleanup-restore, capture again,
   focus again: ends in the right state (Q6).
3. *Content with no focusable element* — not possible today (every dialog has buttons). The
   module then leaves focus where it was; the Tab handler returns early.
4. *A popover open behind a dialog* — `MovePopover` open, then Delete on another row opens
   `ConfirmDialog` (`Categories.tsx:272–286,289–297,410–422`); both listen for Escape on
   `document`, so one Escape closes both. Same as today.
5. *Mutation in flight when Escape is pressed* — the dialog closes; the mutation completes;
   `onSuccess` calls the close handler again (idempotent state set). Same as today.
6. *Route change while open* (a 401 sends the app to `/auth`, `App.tsx:26–28`) — the dialog
   unmounts and tries to refocus an opener that is no longer mounted. No error.
7. *Safari does not focus a button on click* (browser behaviour, not verified here) — the
   captured opener is `<body>` and the restore is a no-op. Same as today.

➡️ None of these needs new code; all behave as today.

⚖️ Strongest argument against: scenario 1 could fall back to a sensible target (the list), but
that is a feature.

✅ Decision: documented, not changed.

---

## Round 4 — frontier: Q16–Q18

❓ **Q16** - **In which order do the steps land, relative to candidate 5 (which rewrites
`BudgetForm`) and candidate 2 (which edits the error handling of `TxnModal` and `BudgetForm`)?**

🔎 Facts: candidate 5 rewrites `BudgetForm` away from the form library and moves money input
into the money module; candidate 2 replaces the error mapping in 13 files including `TxnModal`
and `BudgetForm`. This candidate only touches the dialog shell regions of `TxnModal`
(`162–176`, `67–104`) and `BudgetForm` (`65–75`, `93–106`), which neither sibling needs to
change.

➡️ Candidate 3 lands **first** in G3's combined order (steps G3-1 to G3-3): the dialog module and
`ConfirmDialog`; then `TxnModal`; then `BudgetForm` with the form library still in place. Then
candidate 2 (G3-4 to G3-9), then candidate 5 (G3-10 to G3-13), whose `BudgetForm` rewrite keeps
the `Dialog` wrapper untouched. See the combined table in the spec.

⚖️ Strongest argument against: doing `BudgetForm`'s dialog swap inside candidate 5's rewrite would
touch `BudgetForm` one time fewer.

✅ Decision: first. It is the smallest candidate, it fixes a user-visible accessibility gap in
`BudgetForm` immediately, and its edits are in regions the later rewrites keep, so no file is
rewritten twice.

❓ **Q17** - **Which recorded-decision documents must change?**

🔎 Facts: `ARCHITECTURE.md` §4 (`225–268`) does not describe dialogs; the Storybook list
(`260–264`) is unchanged by Q14; `docs/API.md`, `docs/SCHEMA.md`, `docs/INSIGHTS.md` do not
mention dialogs. `docs/LESSONS.md` is git-ignored (`.gitignore:13`) and already has "One dialog
component, four callers — and doing the focus trap `TxnModal` skipped" (`docs/LESSONS.md:1931`).

➡️ No recorded-decision document changes. One LESSONS entry (git-ignored) on why the dialog is a
React module rather than native `<dialog>` (jsdom 30 implements none of it) and why the module,
not the caller, owns initial focus; it references the entry at line 1931 instead of repeating
focus-restore basics.

⚖️ Strongest argument against: a future contributor may reach for native `<dialog>`; a sentence
in `ARCHITECTURE.md` §4 would stop that.

✅ Decision: the reason lives in the module's doc comment, where the next person to touch it will
read it; no ADR (Q17 criteria in docs-proposals).

❓ **Q18** - **Cross-candidate effects.**

🔎 Facts: candidate 2 edits `TxnModal`'s `onError` (`TxnModal.tsx:134–153`) and `BudgetForm`'s
(`BudgetForm.tsx:80–85`); candidate 5 edits `TxnModal`'s amount lines (`55–58`, `125`) and
rewrites `BudgetForm`. Candidate 8 (G4) moves new tests to an `msw` network seam; the dialog has
no network. Candidate 17 (G8) lists no dialog item.

➡️ This candidate needs nothing from siblings. It gives candidate 5 a `BudgetForm` whose shell is
already the `Dialog` (the rewrite keeps that wrapper and owns no focus or Escape code), and
candidate 2 a `TxnModal` whose error handling is untouched. Candidate 8's seam does not apply
(no network).

⚖️ Strongest argument against: none.

✅ Decision: recorded in the spec's Depends on / Further Notes.

**Frontier after Round 4: empty.** Every branch (constraints, dependencies, interface, what is
behind it, seam discipline, tests, sequence, docs, edge cases, cross-candidate effects) has a
decision.

---

## Decisions (one page)

1. **React module, not native `<dialog>`.** jsdom 30.0.1 implements no `showModal`/`close`/cancel
   event and hides `dialog:not([open])`; native would delete or fake every behaviour test.
   Revisit when jsdom implements `showModal()`.
2. **Scope:** `TxnModal`, `BudgetForm`, `ConfirmDialog`. The two Categories popovers stay as
   they are (non-modal, anchored).
3. **Interface:** title, close handler, content, optional width (default 440, form dialogs 480).
   No actions slot, no initial-focus option.
4. **Behaviour behind the interface:** capture the opener, focus the first focusable element,
   Escape closes, backdrop click closes, generic Tab wrap (queried per key press, disabled
   skipped), restore focus on unmount, `role="dialog"`, `aria-modal`, title id from `useId`,
   `z-index: 100`, design-system classes and corners. Rendered in place.
5. **Caller rule left:** render it only while open; put the first control first; no `autoFocus`
   inside a dialog; keep actions inside the content (inside the `<form>` for forms).
6. **`ConfirmDialog` becomes a caller**, interface unchanged; its toggle trap becomes the generic
   one. `BudgetForm` gains focus restore and the Tab trap.
7. **Tests:** one new `Dialog` test file (8 tests); delete 3 from `TxnModal.test.tsx` and 2 from
   `ConfirmDialog.test.tsx`; everything else unchanged.
8. **No Storybook story, no provider, no portal, no ADR, no recorded-doc change.**
9. **Order:** first in G3 (G3-1 `Dialog` + `ConfirmDialog`, G3-2 `TxnModal`, G3-3 `BudgetForm`),
   before candidates 2 and 5.
10. **Unverified:** native-dialog browser behaviour (moot), React's child-before-parent effect
    order (library behaviour), the drag-release backdrop close (follows from DOM semantics, not
    reproduced), Safari focus-on-click.
