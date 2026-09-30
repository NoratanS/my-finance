# One form idiom and one money input

Status: ready-for-agent
Candidate: 5 — One form idiom, one money input
Strength: Worth exploring
Depends on: candidate 3 (One dialog module) and candidate 2 (One module turns a problem into
messages) — both must land first. This candidate's steps are G3-10 to G3-13 in the combined order
below.

## Problem Statement

- A user who types "12,50" — the way the app itself displays every amount — can save it as a
  transaction or a subscription, but the budget dialog rejects it. Three forms convert typed
  amounts, under two different rules.
- A malformed amount such as "1,234,56" typed into the transaction dialog or the subscription form
  is sent anyway (only the first comma is rewritten); the server then rejects the whole request
  with "The request body is missing or malformed.", which cannot be shown under the amount field.
- Pressing Enter does nothing in the subscription form, the add-category form, the new-profile
  form, the profile rename card and the insight name field, while it submits the other four forms.
- The subscription form cannot show a server message under the field it belongs to: it does not
  own its state; everything lives in the screen above it and is passed down through 22 props.
- For the owner and any contributor, two form idioms coexist. One form — the budget dialog — uses
  `react-hook-form`, `@hookform/resolvers` and `zod` (three runtime dependencies for one 29-line
  schema); every other form uses plain React state, and the announced migration of the other forms
  never happened. The "trim trailing zeros for editing" rule is the same expression in three files.
  The subscription form component hides nothing: all its state, defaults, reset, request body and
  submit stay in its parent.

## Solution

- **One money input.** The money module, which already owns amount formatting, now also owns the
  two conversions between an amount as the user types it and the Money amount on the wire:
  `parseAmount` turns an entered amount into the string to send or a message for the field, and
  `editableAmount` turns a stored amount into input text. A comma or a dot is accepted everywhere;
  the wire always gets a dot; malformed input is caught under the field before anything is sent.
- **One form idiom.** Every form is a component with plain state and a real `<form>`: Enter
  submits, non-submit buttons never submit, a submit is ignored while one is in flight, the form's
  own checks run first, and server failures come back through candidate 2's module with messages
  under their fields.
- The budget dialog is rewritten in that idiom, and `react-hook-form`, `@hookform/resolvers` and
  `zod` are removed with the schema module.
- The subscription form owns its state; its interface shrinks from 22 props to two.

## User Stories

1. As a user, I want to type an amount with a comma ("12,50") in every money field, so that I can
   type amounts the way the app shows them.
2. As a user, I want the budget dialog to accept the same amounts as the transaction dialog and the
   subscription form, so that one rule applies everywhere.
3. As a user, I want a clear message under the amount field when I type something that is not an
   amount ("1,234,56", "-5", "12 zł"), so that I can fix it before anything is sent.
4. As a user, I want to be told that at most four decimal places are allowed, so that my money is
   never silently rounded.
5. As a user, I want to be told that an amount must be greater than zero, so that I know why "0"
   is refused.
6. As a user, I want to be told when an amount has too many digits, so that I do not get a vague
   server error.
7. As a user, I want an empty amount to say "Enter an amount", so that I know what is missing.
8. As a user editing a record, I want its amount shown without trailing zeros ("1500.5", not
   "1500.5000"), so that it is easy to change.
9. As a user, I want pressing Enter in any text field of any form to submit that form, so that
   forms behave the same everywhere.
10. As a user, I want clicking a cadence button or a colour swatch to only select it, never to
    submit the form, so that I can finish filling the form.
11. As a user, I want pressing Enter while a save is still running to do nothing, so that I never
    create a record twice.
12. As a user, I want Enter in the subscription notes box to start a new line, so that I can write
    longer notes.
13. As a user, I want a server message about a subscription's name, price, next charge date or
    notes shown under that field, so that I see what to fix where I would fix it.
14. As a user, I want the same for the budget's category, limit, currency and dates, so that a
    rejected budget tells me exactly what to change.
15. As a user, I want the budget dialog to keep refusing a period that ends before it starts, and a
    currency that is not a three-letter code, before anything is sent, so that nothing I rely on
    gets weaker.
16. As a user, I want the add-subscription form to empty itself after I add one, and keep my focus
    in the form, so that I can add the next one straight away.
17. As a user, I want the edit form to fill in the subscription I clicked, and to go back to the add
    form when I save or cancel, so that editing works as it does today.
18. As a user, I want to be told to create a category first when there is none, in every money
    form, so that the message is the same everywhere.
19. As the owner, I want one form idiom, so that I learn one way of writing a form.
20. As the owner, I want `react-hook-form`, `@hookform/resolvers` and `zod` removed, so that the app
    ships three fewer runtime dependencies for one form.
21. As the owner, I want the amount rule in one place with one table of tests, so that changing it
    is one edit.
22. As the owner, I want the subscription form to own its state, so that the subscriptions screen
    only deals with the list and its row actions.
23. As a future contributor, I want the plain idiom written down (in LESSONS and ARCHITECTURE.md),
    so that I do not re-add a form library for one form without knowing it was tried and removed.
24. As a future contributor, I want every non-submit button inside a form to declare its type, so
    that the "a button in a form submits" trap is not reintroduced.
25. As a future contributor, I want the subscription form's interface to be just "the subscription
    being edited" and "an edit ended", so that I can use it without reading its parent.
26. As a reviewer, I want the existing tests that pin behaviour (zero amount refused, amount sent as
    a string, amounts prefilled without zeros, Enter submits the transaction dialog) to keep passing
    unchanged, so that the refactor provably keeps them.
27. As a reviewer, I want the end-to-end flows that click a swatch or a cadence before submitting to
    keep passing, so that the `<form>` change provably does not submit early.
28. As a reviewer, I want to know why `zod` still appears in the lockfile after the removal, so that
    I do not flag it as incomplete.
29. As the owner, I want the money module's name to stay truthful about money: every conversion
    between a Money amount and text lives there, so that nothing about amounts is scattered again.

## Implementation Decisions

**The money module gains two functions** (next to the display formatting; its header comment
changes from "display helpers" to "money helpers: display formatting and entry parsing").

- **`parseAmount`** takes an entered amount and returns either the Money amount to send or the
  message to show under the field. Rules, in order: surrounding whitespace is ignored; nothing
  left → "Enter an amount"; the text must be one or more digits, optionally followed by exactly one
  separator (a dot or a comma) and one or more digits — anything else (a sign, letters, an exponent,
  a leading or trailing separator, two separators, grouping spaces) → "Use digits with an optional
  decimal part, e.g. 12.50 or 12,50"; more than 4 digits after the separator → "Use at most 4
  decimal places"; more than 15 before it → "Use at most 15 digits before the decimal separator";
  no digit other than zero → "Must be greater than zero"; otherwise the result is the text with the
  separator written as a dot, the digits kept exactly as typed (no rounding, no padding, no zero
  stripping). No floating-point conversion is ever made.
- **`editableAmount`** takes a Money amount from the API and returns input text: trailing zeros
  after the separator are dropped, and the separator too when nothing is left after it; integer
  zeros are never touched ("1500.5000" → "1500.5", "10.0000" → "10", "100" → "100").
- Together they mirror the server's amount rule exactly (greater than zero, at most 15 integer
  and 4 fraction digits), so a parsed amount never draws an amount violation from the server and a
  malformed amount never reaches it.

| Entered | `parseAmount` result |
|---|---|
| empty or spaces | Enter an amount |
| "12", " 12.50 " | "12", "12.50" |
| "12,5", "0,0001" | "12.5", "0.0001" |
| "12.50000" | Use at most 4 decimal places |
| "0", "0.00", "0,0000" | Must be greater than zero |
| "-1", "+1", "1e3", ".5", "5.", "1 500", "1.500,00", "1,500.00", non-ASCII digits | Use digits with an optional decimal part, e.g. 12.50 or 12,50 |
| 16 digits | Use at most 15 digits before the decimal separator |
| 15 digits "." 4 digits | kept as typed |
| "007" | "007" |

**The plain idiom**, written in the LESSONS entry and in ARCHITECTURE.md §4. A form is a component
that: keeps each field's value in plain state (one per field), initialised from the record being
edited or from defaults; keeps its messages in plain state (one banner and one record of field
messages); renders a real `<form>` whose submit handler prevents the page submit, ignores a submit
while the mutation is pending, clears the messages, runs the form's own checks (the money parse and
the few checks the server cannot do or reports badly) and stops if any fail, builds the request
body, and calls the mutation hook with one success action and a failure handler that shows what
`problemMessages` returns for the form's field list; gives every button in the form other than the
submit button an explicit `type="button"`.

**No shared form helper.** Apart from the two money functions and candidate 2's `problemMessages`,
nothing is shared: a form hook would need an option for every way the forms differ (checks, body,
success action, field list) — an interface as wide as its implementation; a field component would
reshape every form's markup for no behaviour gain; a "first category" helper would replace one line
per form. The "fall back to the first category, so the visible default and the saved value agree"
expression stays inline, once per form.

**`TxnModal`** (G3-10): its amount starts from `editableAmount` when editing; on submit the amount
goes through `parseAmount` — a message goes under Amount and nothing is sent; the body carries the
parsed amount. Nothing else in `TxnModal` changes in this candidate.

**`BudgetForm`** (G3-11) is rewritten in the plain idiom:
- State: category (empty means the first option), amount limit text, currency text, period start,
  period end, the banner, the field messages. Editing starts from the budget (limit through
  `editableAmount`); creating starts empty, with the profile's currency and the current month.
- Checks on submit, all shown together, before anything is sent: no categories at all → banner
  "Create a category first — every budget needs one."; amount → `parseAmount`, under "Amount
  limit"; currency not three capital letters → "Three-letter code, e.g. PLN" under "Currency"; an
  empty date → "Pick a date" under it; both dates present and the end before the start → "End date
  must be on or after the start date" under "Period end". (The currency and date checks and their
  wording are kept from the removed schema; "Pick a category" is replaced by the banner the other
  money forms already use.)
- Body: the category as a number, the parsed amount string, the currency, both dates. Success
  closes the dialog. Failure goes through `problemMessages` with the fields `categoryId`,
  `amountLimit`, `currency`, `periodStart`, `periodEnd` (the server's `periodValid` lands on
  `periodEnd`).
- The `Dialog` wrapper from candidate 3 stays exactly as it is; the category select stays the first
  control, so it still receives focus. No focus, Escape or backdrop code in the form.
- The schema module is deleted. `react-hook-form`, `@hookform/resolvers` and `zod` are uninstalled
  with the package manager so the package manifest and the lockfile change together. Afterwards
  `react-hook-form` and `@hookform/resolvers` are gone from the lockfile; `zod` legitimately stays
  there as a development-only dependency of the React hooks lint plugin — the check is that the
  manifest lists none of the three and no source file imports them.

**`SubscriptionForm` owns its state** (G3-12):
- Its interface becomes **the subscription being edited** (or none, for the add form) and **a
  callback for when an edit ends** (saved or cancelled).
- The subscriptions screen renders it keyed by the edited subscription's id, so a different
  subscription (or leaving edit mode) gives a freshly initialised form — React's reset-by-key idiom,
  not an effect.
- The form reads the active profile and the categories itself; owns its create and update
  mutations, its fields (name, price, next charge date, category, cadence, currency for new
  subscriptions, notes), its banner and field messages, its checks (no categories → the existing
  "Create a category first — every subscription needs one." banner; price → `parseAmount`, under
  "Price") and the request body (an edit keeps the subscription's own currency and status, as
  today).
- After a successful add it resets its own fields in place, so focus stays in the form; after a
  successful edit, or Cancel, it calls the edit-ended callback.
- Typing in the name or the price clears the banner and that field's message, as today's
  clear-on-change does.
- Server failures go through `problemMessages` with the fields `name`, `amount` (shown under
  "Price"), `nextBillingOn`, `notes`.
- The subscriptions screen keeps the list mode, the pending confirmation, the edited subscription,
  the row error and its own update and delete mutations for the row actions (pause, resume, cancel,
  restore, delete). The form's save and a row action now have independent pending states.

**Real forms** (G3-13, and in G3-12 for the subscription form): the subscription form, the
Categories add form, the ProfilePicker new-profile form and its rename card, and the insight name
in `SaveControls` become real forms. In each, the submit button is a real submit button with no
click handler; every other button — the four cadence buttons, the colour swatches (including
"Auto"), each Cancel, "New insight" — gets `type="button"`. Labels and button names do not change.
Left as they are: the Categories inline rename (it already submits on Enter and cancels on Escape),
the move popover, the merchant back-fill rows, the backup export panel, the transaction search box,
the navigation's profile selector.

**Docs updated in the same change** (G3-11; see docs-proposals): ARCHITECTURE.md §4 gains a short
"why plain form state, no form library" paragraph, and its Recharts paragraph names the other
runtime dependencies instead of counting them.

**Dependencies.** In-process only (pure money functions; forms tested at the existing screen
seam). No port, adapter or mock; no adapter seam is introduced.

**Ordered steps — this candidate** (each separately shippable, build green: `npm run lint`,
`npm run format:check`, `npm test`, `npm run build`, `npm run build-storybook`):

1. **G3-10** — The money table test first (fails: no functions); add `parseAmount` and
   `editableAmount`; `TxnModal` uses them (its malformed-amount test first).
2. **G3-11** — `BudgetForm`'s new tests first (the comma amount fails today); rewrite it in the
   plain idiom; delete the schema module; uninstall the three packages; update ARCHITECTURE.md §4.
3. **G3-12** — The subscription form's new tests first (Enter adds; a cadence click does not
   submit; a comma price); move the state into the form; make it a real form; slim the screen.
4. **G3-13** — The Enter / non-submit tests first for each; make the Categories add form, the
   ProfilePicker new-profile form and rename card, and the insight name real forms.
5. Add the LESSONS entry and mark the old form-library entry superseded.

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

**What this spec assumes the siblings have done.** Candidate 3: `TxnModal` and `BudgetForm` already
render through `Dialog`, which owns focus, Escape, the backdrop and the Tab trap — the rewrite keeps
that wrapper and adds none of that code. Candidate 2: `problemMessages` exists and accepts a field
list; `TxnModal` already routes server failures through it (G3-5); `BudgetForm` and `Subscriptions`
carry a one-line form-level banner (G3-6), which this spec replaces with field placement; the
error handling of `Categories`, `ProfilePicker` and `SaveControls` is already migrated (G3-7/G3-8),
so G3-13 touches only the markup around their fields.

## Testing Decisions

- **What makes a good test.** It types into a field the way a user does and asserts what the user
  observes — the message under a field, whether the mutation was called and with which body — found
  by labels and button names, never by component state. The money functions are tested as
  input → output pairs.
- **Seams.** The money module's own interface (a table), and the existing screen seam for the forms
  (the hooks module mocked, the mutation inspected). No new seam; both are pure or existing. The
  owner delegated the seam check; the argument is that the rule lives in one module and is tested
  once there, while each form test proves only that the form uses it.
- **New:** a money test table covering every row above plus the `editableAmount` cases. Prior art:
  the parametrised `test.each` table in the `ProfilePicker` tests.
- **Kept unchanged and still passing:** the two `BudgetForm` tests (a zero limit shows "…greater
  than zero…" and sends nothing; the limit is sent as the string "1500.50"); the five `TxnModal`
  form tests left after candidate 3 (Enter submits and sends "12.50", the type toggle and Cancel do
  not submit, currency on create only); the `Transactions` edit tests (Amount prefilled "10" from
  "10.0000", "12.50" sent, merchant cleared explicitly); all 13 `Subscriptions` tests (they drive the
  form through the screen by label and button name); every `ProfilePicker`, `Categories` and
  `Insights` test that clicks Save, Create or Cancel by name; candidate 2's G3-6 tests (they assert
  message text only).
- **Added, each written first:** `TxnModal` — a malformed amount shows its message under Amount and
  nothing is sent; `BudgetForm` — "12,50" is sent as "12.50" (fails today), an end date before the
  start date is refused under Period end before any request, a server field message appears under
  its field, editing shows "1500.5" for "1500.5000"; `Subscriptions` — Enter in the service name
  adds, a cadence click does not submit, "9,99" is sent as "9.99"; `Categories` — Enter in the name
  creates, a swatch click does not; `ProfilePicker` — Enter creates a profile, Enter saves a rename,
  Cancel on the new-profile form creates nothing; `Insights` — Enter in the insight name saves.
- **Deleted:** none beyond candidate 3's moves; the schema module had no test of its own.
- **Seam policy with candidate 8.** New form tests live in files that already mock the hooks module
  and use that seam; the money table is pure.
- **End to end:** the Playwright flows that click a colour swatch or a cadence button before
  submitting, and those that create a profile, rename one, add a transaction and save an insight,
  keep passing unchanged; they depend on the `type="button"` changes.

## Out of Scope

- Moving the date helpers out of the money module (a rename touching seven imports, no behaviour
  change) — a possible housekeeping follow-up.
- Accepting grouped amounts ("1 500,00") or a currency symbol in an amount field.
- A form library, a form hook, or a field component.
- Turning the budget dialog's free-text currency into the currency select the other money forms
  use (a behaviour change).
- The active-profile hook's nullable result (the source of the `?? 'PLN'` fallbacks).
- The Categories inline rename, the move popover, the merchant back-fill rows, the backup export
  panel, the search box.
- Field-level accessibility wiring (`aria-describedby`, `aria-invalid`) on form messages.
- The race where an edit's save undoes a pause made on the same row meanwhile (pre-existing).
- Deleting the unused `sumAmounts` and replacing the new-profile form's hard-coded currency options
  (candidate 17).
- Error-message mapping (candidate 2) and dialog behaviour (candidate 3).

## Further Notes

- **Lesson to record** (git-ignored `docs/LESSONS.md`): why there is no form library — a form is
  state plus a submit handler; parsing an entered amount at the form boundary works like a Pydantic
  validator (text in, typed value or message out); resetting a component by changing its `key`
  instead of syncing state in an effect. Reference the existing entry on `<form>` and button types
  instead of repeating it, and add a one-line "superseded — the form library was removed" note to the
  existing "react-hook-form + zod: a schema has two types" entry.
- **Facts not verified in this pass:** that mobile decimal keypads offer the locale's separator (the
  reason commas matter on phones); what the backend answers for an empty amount or date string
  (Jackson 3's coercion — the design does not depend on it); React's reset-by-key idiom (library
  documentation); the budget comma bug and the "1,234,56" whole-body error (read from code, not
  reproduced). Nothing was run; the implementer runs lint, tests and the build at every step, and
  confirms with the package manager that `react-hook-form` and `@hookform/resolvers` left the
  lockfile.
- **Edge cases:** a pasted display value ("1 234,50 zł") gets the format message; a leading-zero
  amount longer than 15 digits is refused although the server would accept it (harmless false
  negative); categories still loading when a form opens are handled by the first-option fallback at
  submit time; a profile currency outside the fixed list stays selectable; a cleared date in the
  transaction dialog or the subscription form is sent as today.
- **Sibling effects and order:** after candidates 3 and 2 (see above). Candidate 17: `sumAmounts`
  sits in the money module on lines this candidate does not touch (either order); its fix for the
  hard-coded currency options sits inside the new-profile block G3-13 wraps in a `<form>` —
  recommended to land before G3-13, otherwise whichever lands second resolves a one-block conflict;
  its possible bug E.1 (comma in a budget amount) is fixed here in G3-11, test-first. Candidate 15:
  if the generated request types are renamed, the forms follow the new names; the bodies they build
  do not change. Candidate 8: see the seam policy above.

**Added when the specs were cross-checked (2026-09-30).**

- **Test seam, reconciled with candidate 8.** As in candidate 2's spec: this spec's new screen tests
  are added on the hook-mocked seam of files that already use it. Candidate 8's rule — a
  hook-mocked file converts as a whole the first time it needs a new test — applies to tests added
  after candidates 2 and 5 have landed.
- **Create-profile currency options, reconciled with candidate 17.** Candidate 17's step 12
  (the form reads the exported currency list) lands before step G3-13 of this spec, which wraps
  the same block in a form.
- **Budget body type, reconciled with candidate 4.** Candidate 4's step 5 merges the two budget
  request records into `BudgetRequest` and repoints the frontend alias and the two budget hooks.
  Land it before G3-11, which rewrites the Budget form, or rebase G3-11 over it.
