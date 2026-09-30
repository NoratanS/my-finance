# One dialog module: shell, Escape, focus return and Tab trap in one place

Status: ready-for-agent
Candidate: 3 — One dialog module
Strength: Strong
Depends on: none. It lands first in G3's combined order (steps G3-1 to G3-3, below); candidates 2
and 5 assume it has landed.

## Problem Statement

The app has three modal dialogs — add/edit transaction (`TxnModal`), add/edit budget
(`BudgetForm`) and the shared confirmation (`ConfirmDialog`) — and each one writes the dialog
shell and its keyboard behaviour by hand. The copies have drifted:

- A keyboard or screen-reader user who opens the budget dialog can Tab straight out of it onto
  the page hidden behind the backdrop, and when the dialog closes their focus is dropped on the
  page body instead of going back to the "New budget" or "Edit" button they pressed. The
  transaction dialog and the confirmation dialog were fixed for exactly this earlier; the budget
  dialog's own comment claims it "mirrors TxnModal", but it does not.
- The confirmation dialog traps Tab with a two-button toggle, so anything else placed in its body
  (a link, for example) could never be reached by keyboard.
- The owner and any future contributor must know, for every new dialog, the markup contract of the
  design system, the stacking order, three separate effects, and an ordering rule that only lives
  in a code comment: the element that opened the dialog must be remembered before focus is moved
  into it. Missing any of these produced the budget-dialog gap above.

## Solution

One `Dialog` module owns the dialog shell and its behaviour. A caller passes a title, what to do
when the user dismisses it, the content, and (for the two form dialogs) a wider width. Everything
else — the design-system markup and corners, the stacking order, moving focus into the dialog,
Escape and backdrop-click dismissal, keeping Tab inside, returning focus to the opener on close,
and the accessible name — happens inside the module, once.

`TxnModal`, `BudgetForm` and `ConfirmDialog` all render through it. For the user, the transaction
and confirmation dialogs behave exactly as before; the budget dialog now keeps focus inside and
returns it to the button that opened it. `ConfirmDialog` keeps its interface, so its seven call
sites do not change.

## User Stories

1. As a keyboard user, I want Tab and Shift+Tab to stay inside the budget dialog, so that I cannot
   land on controls hidden behind the backdrop.
2. As a keyboard user, I want focus to return to the "New budget" or "Edit" button when the budget
   dialog closes, so that I can carry on from where I was.
3. As a screen-reader user, I want every dialog announced as a modal dialog with its title as its
   name, so that I know where I am.
4. As a keyboard user, I want focus to land on the first field (or on Cancel in a confirmation)
   when any dialog opens, so that I can start typing or safely dismiss it.
5. As a user, I want Escape to close any dialog, so that dismissal works the same everywhere.
6. As a user, I want a click on the dimmed backdrop to close any dialog, and a click inside it not
   to, so that dismissal is predictable.
7. As a user, I want a confirmation to never confirm on Escape or a backdrop click, so that a
   stray key or click never deletes anything.
8. As a user, I want Cancel to be focused first in a confirmation, so that pressing Enter by
   accident never runs the destructive action.
9. As a keyboard user, I want every focusable element in a confirmation's body to be reachable
   with Tab, so that nothing placed there is locked out.
10. As a keyboard user, I want a disabled button to be skipped when Tab wraps, so that focus never
    gets stuck on something I cannot use.
11. As a user, I want the transaction and confirmation dialogs to look and behave exactly as they
    do today, so that nothing I rely on changes.
12. As the owner, I want one place that defines dialog behaviour, so that fixing a dialog bug fixes
    it in every dialog.
13. As the owner, I want new dialogs to need only a title, a close handler and content, so that a
    new dialog cannot forget focus return or the Tab trap.
14. As a future contributor, I want the rule "remember the opener before moving focus" hidden
    inside the module, so that I cannot get the order wrong.
15. As a future contributor, I want the module's doc comment to say why it is a React module and
    not the native `<dialog>` element, so that I do not re-open that question without new facts.
16. As a future contributor, I want the dialog's title id generated per instance, so that two
    dialogs can never share an id.
17. As a future contributor, I want dialog behaviour tested once, at the module, so that screen
    tests only test what the screen adds.
18. As a reviewer, I want each deleted test mapped to the module test that replaces it, so that I
    can see that no behaviour lost its test.
19. As a reviewer, I want the design-system stylesheet untouched, so that the design tokens stay
    authoritative.
20. As a reviewer, I want the axe accessibility gate to keep scanning all three dialogs unchanged,
    so that the refactor is checked against the same rules as before.
21. As a self-hosting user, I want no visual change in any dialog, so that the upgrade is invisible
    apart from the budget-dialog fix.
22. As the owner, I want the confirmation dialog's seven call sites untouched, so that the change
    stays small and reviewable.
23. As the owner, I want the two Categories popovers left alone, so that non-modal popovers are
    not forced into a modal module.
24. As a future contributor, I want to know which dialog content rule remains mine (no
    `autoFocus`, first control first, actions inside the content), so that I use the module
    correctly.
25. As the owner, I want the change to land before the form and error-message refactors that touch
    the same dialogs, so that none of those files is rewritten twice.

## Implementation Decisions

**The module.** A new `Dialog` component in the shared components folder.

- Its interface is: a **title** (shown as the dialog title and used as its accessible name), a
  **close handler** (called when the user dismisses the dialog — Escape, or a click on the
  backdrop; never called on unmount), the **content**, and an optional **width** in pixels
  (default: the design system's dialog width, 440; `TxnModal` and `BudgetForm` pass 480, which is
  what they use today).
- Mounting it opens the dialog and unmounting it closes it. Callers render it only while open, as
  they do today.
- Behaviour behind the interface:
  - On open, it remembers the element that had focus, then moves focus to the first focusable
    element inside the dialog — both in one mount effect, in that order.
  - Escape anywhere closes (calls the close handler).
  - A click on the backdrop closes; a click inside the dialog box does not.
  - Tab from the last focusable element wraps to the first; Shift+Tab from the first wraps to the
    last. Focusable elements are looked up on every key press (so fields added or disabled later
    are handled) and disabled controls are skipped. This is the generic trap `TxnModal` has today.
  - On close (unmount), focus returns to the remembered element.
  - It renders `role="dialog"`, `aria-modal="true"`, and an `aria-labelledby` pointing at the title,
    whose id is generated per instance.
  - It renders the design system's backdrop, dialog box (with the blueprint corners), title and
    stacking order (the `z-index` of 100 all three dialogs repeat today). It renders in place, not
    through a portal. It does not render the actions; they are part of the content, so that a form
    dialog's submit button stays inside its form.
- The rules left to callers, written in the module's doc comment: put the element that should
  receive focus first in the content; do not use `autoFocus` inside a dialog; keep the action
  buttons inside the content.
- The doc comment also records why this is a React module and not the native `<dialog>` element:
  the unit-test environment (jsdom 30) implements no `showModal()`, no `close()`, no cancel event,
  and hides a dialog without the `open` attribute, so every behaviour test would be deleted or run
  against a stub. Revisit when jsdom implements `showModal()`.

**Callers.**

- `ConfirmDialog` keeps its interface (title, body, confirm label, optional cancel label, confirm
  handler, close handler, optional confirm-disabled flag). Its implementation becomes a `Dialog`
  containing the body and the actions with Cancel first; its own focus effect, Escape effect and
  two-button toggle are deleted. "Initial focus on Cancel" now follows from Cancel being the first
  focusable element.
- `TxnModal` renders its form inside a `Dialog` with its title ("Add transaction" / "Edit
  transaction") and width 480. Its backdrop markup, focus refs and effect, Escape effect and Tab
  handler are deleted. The Amount input stays the first control. Its form, fields and error
  handling are not touched in this candidate.
- `BudgetForm` renders its form inside a `Dialog` ("Add budget" / "Edit budget", width 480). Its
  backdrop markup, its "focus the category field" effect and its Escape effect are deleted; the
  category select stays the first control, so it still receives focus. Its misleading "mirrors
  TxnModal" comment goes. The form library is still in place after this step (candidate 5 removes
  it later and keeps the `Dialog` wrapper as it is).

**What does not change.** The design-system stylesheet and `app.css`; the two Categories
popovers (non-modal, anchored, with their own Escape handling); the transaction-modal context and
its provider; every `ConfirmDialog` call site; the markup classes the axe gate and the tests rely
on.

**Dependencies.** In-process only (React and the DOM). No port, adapter or mock. No adapter seam
is introduced: one implementation, nothing varying behind it.

**Ordered steps — this candidate.** Each step is separately shippable and leaves the build green
(`npm run lint`, `npm run format:check`, `npm test`, `npm run build`, `npm run build-storybook`).

1. **G3-1** — Write the `Dialog` tests first (they fail: no module). Add the `Dialog` module.
   Rebuild `ConfirmDialog` on it. Delete `ConfirmDialog`'s focus-return and Tab tests (now covered
   by the `Dialog` tests). All screen tests that open a confirmation stay green unchanged.
2. **G3-2** — Move `TxnModal` onto `Dialog`; delete its three dialog-behaviour tests (Tab wrap,
   Shift+Tab wrap, focus return). Its five form tests stay green unchanged.
3. **G3-3** — Move `BudgetForm` onto `Dialog`. Its two tests and the `Budgets` tests that open it
   by role and name stay green unchanged.
4. Add the LESSONS entry (see Further Notes).

**Combined order of work for G3 (identical in specs 02, 03 and 05).**

| Step | Owner | What lands | Modules touched | What it leaves working |
|---|---|---|---|---|
| G3-1 | 03 | The `Dialog` module and its tests; `ConfirmDialog` rebuilt on it, interface unchanged; its focus-return and Tab tests replaced by the `Dialog` tests | `Dialog` (new), `ConfirmDialog` | Every confirmation behaves as before |
| G3-2 | 03 | `TxnModal` renders through `Dialog`; its shell, Escape, focus and Tab code deleted, with its three dialog-behaviour tests | `TxnModal` (shell only) | Add/edit transaction behaves as before |
| G3-3 | 03 | `BudgetForm` renders through `Dialog`; the form library is still in place | `BudgetForm` (shell only) | Budget dialog gains focus return and the Tab trap |
| G3-4 | 02 | The `problemMessages` module and its table test; `ApiError.fieldMessage` deleted; API.md's 400/422 sentence amended | `problemMessages` (new), `ApiError` | No screen changed yet |
| G3-5 | 02 | Forms that place messages at fields use it: `TxnModal`, `AuthScreen`, `SetPassword` | those three (error handler only) | Pseudo-field loops gone; a message for an unshown field reaches the banner |
| G3-6 | 02 | One-line sites: `Budgets`, `Transactions`, `MerchantBackfill`, `Subscriptions` (form banner and row actions), `BudgetForm` (form-level banner only) | those five (error handlers only) | "The request body has N invalid field(s)." is never shown alone |
| G3-7 | 02 | `Categories` (with code; colour failure shown), `ProfilePicker` (problem list; pick failure shown), `Nav` (switch and logout failures shown) | those three (error handlers; `Nav` gains a message line) | No silent mutation failure left |
| G3-8 | 02 | Insights explorer: `SaveControls` (with code), `ExecutionError`, `Insights` (not-found by type; test fixture corrected) | those three (error handling only) | Explorer copy unchanged except the network-failure sentence |
| G3-9 | 02 | Lint guard: `ApiError` importable only inside the API layer and in tests; ARCHITECTURE.md §4 sentence | ESLint configuration, ARCHITECTURE.md | A regression fails `npm run lint` |
| G3-10 | 05 | The money module gains `parseAmount` and `editableAmount` with a table test; `TxnModal` uses both | `money`, `TxnModal` (amount lines only) | Transactions accept the same text as before and reject malformed text before sending |
| G3-11 | 05 | `BudgetForm` rewritten in the plain idiom (keeps `Dialog`, uses `problemMessages` and the money functions); the `schemas` module deleted; `react-hook-form`, `@hookform/resolvers`, `zod` uninstalled; ARCHITECTURE.md §4 paragraph | `BudgetForm`, `schemas`, package manifest and lockfile, ARCHITECTURE.md | "12,50" saves as a budget; server field messages land under their fields |
| G3-12 | 05 | `SubscriptionForm` owns its state and is a real form; `Subscriptions` slimmed | `SubscriptionForm`, `Subscriptions` | Enter submits; field messages under their fields |
| G3-13 | 05 | Real forms: `Categories` add form, `ProfilePicker` new-profile and rename forms, `SaveControls` insight name | those three (markup around the fields only) | Enter submits in every form |

No file is rewritten twice. The only rewrites are `BudgetForm` (G3-11) and
`SubscriptionForm`/`Subscriptions` (G3-12), and each happens once, last. Every other repeated touch
is a small edit in a region the other steps do not change: `TxnModal` gets its shell (G3-2), its
error handler (G3-5) and its two amount lines (G3-10); `BudgetForm` gets its shell (G3-3) and a
one-line banner (G3-6) before its rewrite keeps both ideas; `Categories`, `ProfilePicker` and
`SaveControls` get error handlers (G3-7/G3-8) and, separately, a `<form>` around existing fields
(G3-13).

**What this spec assumes the siblings do.** Nothing before it. After it: candidate 2 edits only
the error handling of `TxnModal` and `BudgetForm`; candidate 5 rewrites `BudgetForm` and keeps the
`Dialog` wrapper, owning no focus or Escape code of its own.

## Testing Decisions

- **What makes a good test here.** It drives the dialog the way a user does — keyboard, clicks,
  focus — through the module's interface, and asserts what the user observes: which element has
  focus, whether the close handler was called, the dialog's role and accessible name. It never
  inspects the module's refs, effects or internal state.
- **The seam: the `Dialog` module's own interface**, rendered directly in jsdom with simple content
  (an input and two buttons). It is one seam, the highest one that exercises dialog behaviour
  without a screen around it, and it is an existing kind of seam in this repo (components rendered
  directly, as `ConfirmDialog`'s tests do). The owner delegated the seam check; the argument is
  that the behaviour is identical for every caller, so it is tested once where it lives, and
  screen tests keep testing only what screens add.
- **New `Dialog` tests** (each replaces an old one where listed):
  1. It is a modal dialog named by its title.
  2. On open, focus moves to the first focusable element.
  3. Escape calls the close handler.
  4. A click on the backdrop calls the close handler; a click inside does not.
  5. Tab from the last focusable element wraps to the first (replaces `TxnModal`'s "Tab from the
     last control wraps back to the first" and `ConfirmDialog`'s "Tab does not escape the
     dialog").
  6. Shift+Tab from the first wraps to the last (replaces `TxnModal`'s Shift+Tab test).
  7. A disabled control is skipped by the wrap.
  8. Closing returns focus to the element focused before opening (replaces the focus-return tests
     of both `TxnModal` and `ConfirmDialog`).
- **Deleted** (replace, don't layer): `TxnModal`'s three dialog-behaviour tests; `ConfirmDialog`'s
  focus-return and Tab tests.
- **Unchanged and still passing:** `TxnModal`'s five form tests; `ConfirmDialog`'s tests for the
  accessible title, Cancel focused first, confirm-versus-cancel wiring, and "Escape dismisses
  without confirming" (a `ConfirmDialog` safety property); every screen test that finds a dialog by
  role and name or presses Escape (Budgets, Subscriptions, Transactions, Categories, Insights,
  ProfilePicker); the Playwright axe gate, which opens all three dialogs.
- **Not added:** dialog-behaviour tests for `BudgetForm` (it gets the behaviour by construction;
  testing it again would be layering).
- **Prior art:** `ConfirmDialog`'s tests (direct render with `userEvent`, focus-return with a
  trigger button appended to the document); `TxnModal`'s Tab-wrap tests.
- **Seam policy with candidate 8.** The `Dialog` tests use no network, so candidate 8's network
  seam does not apply.

## Out of Scope

- The two Categories popovers (colour and move). They are non-modal and anchored; they keep their
  own Escape handling.
- Native `<dialog>` / `showModal()` (see Solution; revisit when jsdom implements it).
- A portal, a dialog provider, stacking of several dialogs.
- Unifying the dialog widths, turning the title into a heading, or any visual change.
- Fixing the "drag from inside the dialog, release on the backdrop closes it" behaviour (see
  Further Notes).
- A Storybook story for the dialog: `ARCHITECTURE.md` §4 limits stories to primitives whose states
  are awkward to reach in the running app; every dialog is one click away.
- Error-message handling inside the dialogs (candidate 2) and the form idiom and money input
  (candidate 5).

## Further Notes

- **Lesson to record** (git-ignored `docs/LESSONS.md`): why the dialog is a React module and not
  the native element (what jsdom 30 implements), and why the module — not the caller — moves focus
  in: a child's effects run before its parent's, so focus management split between caller and
  module depends on effect order. Reference the existing entry "One dialog component, four callers
  — and doing the focus trap `TxnModal` skipped" instead of repeating the focus-return basics.
- **Follow-up, not part of this spec:** pressing the mouse inside the dialog and releasing it on the
  backdrop closes all three dialogs today (the click lands on the backdrop, the common ancestor).
  It now lives in one place and can be fixed there once, test-first, by also checking where the
  press started.
- **Facts not verified in this pass:** how the native `<dialog>` behaves in the target browsers
  (focus return, Tab, light dismiss) — moot because of the jsdom facts; React's child-before-parent
  effect order (library behaviour, relied on only in the explanation above); the drag-release
  close (follows from DOM click semantics, not reproduced); Safari not focusing a button on click
  (then focus return is a no-op, as today). Nothing was run: lint, tests and the build must be run
  by the implementer at each step.
- **Edge cases that behave as today:** an opener removed from the page while the dialog is open
  (focus falls to the page body); StrictMode's double mount in development (ends in the right
  state); a popover and a confirmation open together (one Escape closes both); a route change while
  a dialog is open (no error).
- **Sibling effects:** candidate 2 changes only the error handling inside `TxnModal` and
  `BudgetForm`; candidate 5 rewrites `BudgetForm` and keeps the `Dialog` wrapper. Candidate 8's
  network seam does not apply. Candidate 17 has no dialog item.
