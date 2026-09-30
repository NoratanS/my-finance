# One module turns a Problem into messages

Status: ready-for-agent
Candidate: 2 — One module turns a problem into messages
Strength: Strong
Depends on: none required. Recommended to land after candidate 3 (G3-1 to G3-3) and before
candidate 5 (G3-10 to G3-13); its own steps are G3-4 to G3-9 in the combined order below.

## Problem Statement

When a save, delete or other action fails, what the user sees depends on which screen they are
on, because 13 screens each decide for themselves how a failed request becomes text:

- Some failures are **invisible**. Switching profile from the navigation bar, logging out, picking
  a profile on the picker, and changing a category's colour show nothing at all when they fail;
  the profile selector simply snaps back.
- Some **messages are lost**. The transaction dialog shows server messages only for amount, date
  and merchant; a description over 500 characters is rejected by the server and the dialog shows
  nothing. Where a screen shows only the Problem's `detail`, a validation failure appears as the
  useless sentence "The request body has 1 invalid field(s)." — for example a profile or merchant
  name that is too long.
- The budget dialog throws away field placement: every server error lands in one box, so a
  server-side field error loses its field.
- The same failure reads differently on different screens: six presentation formats, one fallback
  sentence copied seven times plus nine "Could not … the …" variants, and the Categories screen's
  own row errors and create errors disagree on whether to show the error type.
- For the owner and any contributor, changing how a validation error is shown means editing 13
  files, three of which also know backend validator method names (`occurredOnNotInFuture`,
  `passwordWithinBcryptLimit`) and translate them by hand. The helper meant for forms,
  `ApiError.fieldMessage`, has never been called.

## Solution

One module, `problemMessages`, in the API layer next to `ApiError`, turns any failure — a Problem
from the backend, a response that is not a Problem, or a network failure — into what a screen can
show: a one-line banner, messages for the fields the screen displays, a list of specific problems
when the Problem carries one, and the Problem's type. Screens only say which fields they show and
where to put the banner.

For the user: every failed action shows a message next to the control that triggered it; a
validation message is shown under its field when the form has that field and in the banner
(with the field's name) when it does not, so no message is ever lost; one fallback sentence is
used when the backend did not answer; the Categories screen and the Insights explorer keep their
deliberate "status type — detail" presentation, now consistent within Categories. A lint rule
keeps screens from reading `ApiError` directly again.

## User Stories

1. As a user, I want a message when switching profile from the navigation bar fails, so that I
   know why the selector snapped back.
2. As a user, I want a message when logging out fails, so that I do not think I am logged out when
   I am not.
3. As a user, I want a message when picking a profile on the picker fails, so that I am not left
   on the picker wondering why nothing happened.
4. As a user, I want a message when changing a category's colour fails, so that I know the colour
   was not saved.
5. As a user, I want a server validation message for a transaction description to be shown, so
   that I know why my transaction was not saved.
6. As a user, I want validation messages for fields a form does not display to appear in the form's
   banner with the field's name, so that no reason for a rejected save is hidden.
7. As a user, I want a too-long profile, merchant or insight name to tell me what is wrong, not
   "The request body has 1 invalid field(s).", so that I can fix it.
8. As a user, I want validation messages shown under the field they belong to wherever the form
   shows that field, so that I see what to fix where I would fix it.
9. As a user, I want both messages when one field breaks two rules (an empty password), so that I
   fix it in one go.
10. As a user, I want a failed save of a budget to tell me which field was wrong, so that I am not
    left guessing from a generic sentence.
11. As a user, I want the same sentence — "Something went wrong — is the backend running?" —
    whenever the backend did not answer, including when the proxy in front of it reports a bad
    gateway, so that I recognise the situation.
12. As a user, I want a backup restore that fails validation to list each problem it found, so that
    I can fix the file.
13. As a user, I want the Insights explorer to keep telling me calmly that the analytics service is
    not running, and to list plan problems next to the chips that can fix them, so that nothing I
    rely on there changes.
14. As a user of the Categories screen, I want every error there — create, rename, move, delete —
    shown the same way, with its status and type, so that it matches the "Rules from the API"
    card.
15. As a user, I want the message for a deleted saved insight to keep saying it no longer exists,
    so that a stale link is explained.
16. As a user, I want messages shown next to the control I used, so that I know which action
    failed without it being repeated in the text.
17. As a self-hosting user, I want messages to use the server's human-readable sentence, so that
    they stay accurate when the server's wording improves.
18. As the owner, I want one place that decides how a failure becomes text, so that changing a
    message format is one edit.
19. As the owner, I want the backend's validator method names known in one place only, so that a
    backend change to them is one edit (or none, if the backend reports on the real field).
20. As the owner, I want the mapping tested once as a table of failures and messages, so that each
    rule has exactly one test.
21. As the owner, I want every mutation call to handle its failure, so that silent failures do not
    come back.
22. As a future contributor, I want screens to import one function instead of `ApiError`, so that I
    need not learn the Problem's fields, the pseudo-fields or the fallback sentence to write a
    screen.
23. As a future contributor, I want a lint error if a screen imports `ApiError`, so that I am
    pointed at the module before I copy an old pattern.
24. As a future contributor, I want the module's doc comment to state its rules (placement,
    formats, fallback), so that I know what a screen will show without reading every screen.
25. As a reviewer, I want each screen's visible change listed, so that I can check that only the
    intended messages changed.
26. As a reviewer, I want the Categories end-to-end assertion (`409`, `category-name-taken`) to keep
    passing unchanged, so that the refactor provably keeps that presentation.
27. As a reviewer, I want `docs/API.md` to stop promising a dialog for 422 responses, so that the
    document and the code agree.
28. As the owner, I want the dead `ApiError.fieldMessage` removed, so that there is one way to get a
    field's message.

## Implementation Decisions

**The module: `problemMessages`, in the API layer, next to the client.** One pure function of the
same name and its result type, `ProblemMessages`.

- **Input:** the value a mutation or query failed with (any type), and two options:
  - **fields** — the request field names the screen can show a message under, as they appear on
    the wire (`amount`, `occurredOn`, `password`, …);
  - **withCode** — when set, the banner is prefixed with the Problem's status and type
    ("409 category-name-taken — …").
- **Output:**
  - **banner** — one line for the whole action; empty only when every message was placed at a
    field;
  - **fields** — messages keyed by the requested field names, and only those;
  - **problemList** — the Problem's list of specific problems (the `problems` member that
    `backup-invalid` and `invalid-plan` carry), otherwise empty;
  - **slug** — the Problem's type without its `/errors/` prefix (`category-name-taken`,
    `not-found`, `analytics-unavailable`), or none when the failure was not a Problem.
- **Rules**, in order:
  1. A failure that is not an `ApiError` (a network failure, a non-JSON success body, anything
     thrown): the banner is the fallback sentence "Something went wrong — is the backend
     running?".
  2. An `ApiError` whose body is not a Problem (it carried no `type`): status 500 or above → the
     fallback sentence (the backend did not answer; in production this is the proxy's bad
     gateway); below 500 → the error's own text, "Request failed with status N.". No slug.
  3. A Problem carrying field violations (`errors`): each violation's field is first translated
     from a pseudo-field to its real field — `occurredOnNotInFuture` → `occurredOn`,
     `passwordWithinBcryptLimit` → `password`, `periodValid` → `periodEnd`; if the (translated)
     field is in **fields**, the message goes there, several messages for one field joined with
     " · "; every other violation becomes a banner line "‹field›: ‹message›", lines joined with
     " · ". The Problem's `detail` ("The request body has N invalid field(s).") is never used for a
     validation failure.
  4. Any other Problem: the banner is its `detail`.
  5. With **withCode** and a non-empty banner from a Problem: the banner becomes
     "‹status› ‹slug› — ‹banner›".
  6. **problemList** is filled from the `problems` member (strings only) of any Problem.
- **Invariants:** it never throws; every failure yields at least one visible message; no message
  from the server is dropped. No configuration, no ordering constraints.
- The pseudo-field table lists only the three a form can trigger. If backend candidate 4 reports
  cross-field violations on the real field, the table is deleted and nothing else changes; real
  field names always pass through untouched.
- The doc comment states these rules, the rule that every mutation call handles its failure (there
  is no global fallback), and why screens may still branch on **slug** (the API contract says the
  type is what the frontend switches on).

**`ApiError`** stays the single parser of a Problem. Its unused `fieldMessage` method is deleted.

**Screens.** Each keeps its own message state (a banner string, and for forms a record of field
messages) and fills it from the module on failure and from its own checks on submit. Afterwards no
screen imports `ApiError`.

| Screen / component | Calls handled | Options | Where it is shown | Visible change |
|---|---|---|---|---|
| `TxnModal` | create, update | fields: amount, occurredOn, merchant | as today | a message for an unshown field (description) reaches the banner |
| `AuthScreen` | sign in, register | fields: displayName, email, password | as today | none in practice |
| `SetPassword` | set password | fields: password | as today | none |
| `BudgetForm` (until candidate 5) | create, update | none | the form-level box | "‹field›: ‹message›" instead of the generic sentence |
| `Budgets` | delete | none | row error | none |
| `Transactions` | delete | none | row error | fallback wording |
| `MerchantBackfill` | apply | none | panel error | validation message visible |
| `Subscriptions` | form save; pause, resume, cancel, restore, delete | none | form box; row error | field names in the form box; fallback wording |
| `Categories` | create; rename, move, delete; colour | withCode | create box; row error below the tree | row errors gain the type; colour failure shown |
| `ProfilePicker` | pick; rename; delete; create; export; restore | none | pick and delete: below the cards; rename: in its card; create: in its form; export and restore: backup area, with the problem list | pick failure shown; fallback wording |
| `Nav` | switch profile; log out | none | a new one-line message under the nav controls, announced as an alert, cleared when the next switch or logout starts | both failures shown |
| `SaveControls` | save, pin, delete | withCode | under the name field, as today | fallback wording; validation text visible |
| `ExecutionError` | plan run | withCode | as today: calm copy when slug is `analytics-unavailable`; intro and problem list (with the chip "Edit" buttons) when there is a problem list; otherwise the banner | network-failure sentence becomes the shared one |
| `Insights` | saved-insight query | none | as today: "no longer exists" when slug is `not-found`, otherwise "couldn't load" | none |

**The four silent failures** — colour change, pick profile, switch profile, log out — each get a
failure handler routed to the place in the table above. There is deliberately no toast system and
no global mutation-error handler (it would fire for handled failures too and still have nowhere to
show text).

**Lint guard.** One `no-restricted-imports` block in the ESLint configuration for the frontend
source, excluding the API layer and the test files (which construct `ApiError` fixtures),
restricts importing the `ApiError` name from the client module, with a message pointing at
`problemMessages`. It is the frontend's small equivalent of the backend's ArchUnit layer rules.

**Docs updated in the same change** (see docs-proposals): `docs/API.md` "Validation failures —
400" stops saying the frontend shows a dialog, and its `422` examples stop listing
`category-in-use`, which is a `409` (with the module, G3-4); `ARCHITECTURE.md` §4 gains
one sentence on where failures become text and the lint guard (with the guard, G3-9).

**Dependencies.** In-process only. No port, adapter or mock; no adapter seam is introduced.

**Ordered steps — this candidate** (each separately shippable, build green: `npm run lint`,
`npm run format:check`, `npm test`, `npm run build`, `npm run build-storybook`):

1. **G3-4** — The module's table test first (fails: no module), then the module; delete
   `ApiError.fieldMessage`; amend `docs/API.md`. No screen changes; everything else stays green.
2. **G3-5** — `TxnModal`, `AuthScreen`, `SetPassword`: each placement test first, then replace the
   hand-written mapping (the pseudo-field loops go).
3. **G3-6** — `Budgets`, `Transactions`, `MerchantBackfill`, `Subscriptions` (form box and row
   actions), `BudgetForm` (form-level box only): one-line swaps; the `BudgetForm` and
   `Subscriptions` "server message is visible" tests first.
4. **G3-7** — `Categories` (withCode; colour failure), `ProfilePicker` (problem list; pick
   failure), `Nav` (switch and logout failures): the failure tests and the backup-restore
   characterisation test first.
5. **G3-8** — `SaveControls`, `ExecutionError`, `Insights`: the `ExecutionError`
   characterisation tests first; correct the Insights 404 fixture to the contract's type.
6. **G3-9** — The lint guard and the `ARCHITECTURE.md` sentence. Prove the rule fires by importing
   `ApiError` in a screen once (lint must fail), then remove the import.
7. Add the LESSONS entry.

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

**What this spec assumes the siblings do.** Candidate 3 (if landed first) has moved the dialog
shells of `TxnModal` and `BudgetForm` into `Dialog`; this spec touches only their error handling,
so it also works if candidate 3 has not landed. Candidate 5 lands afterwards and replaces the
one-line form-level handling in `BudgetForm` and `Subscriptions` (G3-6) with field placement
through this module's **fields** option; the G3-6 tests assert only that the server's message text
is visible, so they keep passing through that rewrite.

## Testing Decisions

- **What makes a good test.** It feeds a failure in and asserts what the user would read — the
  banner text, the message under a field, the listed problems — never how the module or a screen
  stores it. Screen tests find messages by their text or by the field's label, as the existing
  tests do.
- **The seam: the module's interface** — a table of failures in, messages out. It is one seam for
  all mapping behaviour, and the module is pure, so no adapter is needed. Screens keep their
  existing test seam (the hooks module mocked, the mutation's failure callback invoked with a
  constructed `ApiError`); on that seam each screen that places messages at fields gets one test
  that proves the placement, because a wrong field list would pass every module test. The owner
  delegated the seam check; this is the argument.
- **The module table** (one case per row): a network failure; a non-Problem 502; a non-Problem 413;
  a Problem 409 `category-name-taken` (plain and with code); a validation failure with the field
  listed, with an unlisted second field, and with no fields listed; two violations on one field; the
  three pseudo-fields, listed and unlisted; with code and an unplaced validation line;
  `backup-invalid` and `invalid-plan` with a problem list; `analytics-unavailable`; a thrown string.
  Prior art: the parametrised `test.each` table in the `ProfilePicker` tests.
- **Screen tests kept unchanged:** `SetPassword`'s "a server field error renders under the password
  field" (now its placement test); `Categories`' "a 409 category-in-use rejection … surfaces its
  server message"; `ProfilePicker`'s "a 409 last-profile error from delete surfaces"; `Insights`'
  non-404 saved-insight test.
- **Screen test changed:** `Insights`' deleted-insight test builds its 404 with a type that is not in
  the contract; its fixture becomes `/errors/not-found`, as every 404 is.
- **Screen tests added, each written first:** `TxnModal` (a message for a field the dialog does not
  show reaches the banner — fails today); `AuthScreen` (a `passwordWithinBcryptLimit` violation
  shows under Password); `BudgetForm` and `Subscriptions` (the server's field message text is
  visible — fails today for `BudgetForm`); `Categories` (a failed colour change shows a message; a
  row error carries its type); `ProfilePicker` (a failed pick shows a message and does not navigate;
  a `backup-invalid` restore shows the detail and each problem — characterisation, green before and
  after); `Nav` (a failed switch shows the server's message; a failed log-out shows the fallback);
  `ExecutionError`, rendered directly in a new test file (calm copy, problem list, coded banner,
  fallback — characterisation, written before the migration).
- **Not added, on purpose:** tests for `Budgets`, `Transactions`, `MerchantBackfill` and
  `SaveControls` — their change is a one-line call swap with no logic of its own; the behaviour is
  the module table's.
- **Seam policy with candidate 8.** New tests inside files that already mock the hooks module use
  that seam (they cannot use the network seam without un-mocking the whole file). The module's own
  test is pure. Candidate 8's network-seam tests of the client cover how an `ApiError` is built;
  this module starts from one.
- **End to end:** the Categories collision test (`409`, `category-name-taken` in the single error
  box) and the axe gate keep passing unchanged.

## Out of Scope

- A toast or global notification system; a global mutation-error handler.
- Changing any backend message, status, type or the Problem shape. Reporting cross-field
  violations on the real field is backend candidate 4's decision.
- Field-level accessibility wiring (`aria-describedby`, `aria-invalid`) across forms, and
  `role="alert"` on existing message boxes. Only the new nav message is announced.
- `SaveControls` marking the name field invalid when a pin or delete fails (pre-existing).
- Query-error messages that do not inspect `ApiError` (the pinned-insight tile's "Could not run
  this insight.").
- Moving validation messages under fields in `BudgetForm` and the Subscription form: candidate 5
  does it with this module.
- Wrapping forms in `<form>` elements (candidate 5).

## Further Notes

- **Lesson to record** (git-ignored `docs/LESSONS.md`): a wire-contract boundary on the frontend —
  one module turns a Problem into text, screens only place it, and a lint rule keeps the boundary
  (the frontend's small ArchUnit). Reference the existing entry on `aria-describedby` and
  `role="alert"` rather than repeating it.
- **Facts not verified in this pass:** what the development proxy returns when the backend is down
  (the production proxy's 502 is documented in the nginx configuration); the exact Bean Validation
  default message texts; that the lint pattern fires (the rule's schema supports it; nothing was
  run); the transaction dialog's lost description message (read from code, not reproduced).
  Nothing was run; the implementer runs lint, tests and the build at every step.
- **Edge cases** (all handled by the rules above): a 401 while a form is open (global navigation
  plus a banner that unmounts); the backend restarting behind the proxy (fallback sentence); an
  upload over the proxy's 25 MB limit ("Request failed with status 413."); an empty password (two
  messages joined); an unreachable pseudo-field arriving (banner line under its own name); a
  framework Problem typed `about:blank` (plain detail); a non-JSON success body and a thrown string
  (fallback).
- **Sibling effects and order:**
  - Candidate 3 lands first; the regions are disjoint.
  - Candidate 5 lands after and uses the **fields** option for its rewritten `BudgetForm` and
    `SubscriptionForm`.
  - Candidate 4 (backend): if cross-field violations move to the real field, delete the three-entry
    pseudo-field table and its three table rows; nothing else changes. The pseudo-fields a form can
    trigger are `occurredOnNotInFuture`, `passwordWithinBcryptLimit` and `periodValid`; `anyFieldSet`,
    `nameValid` and `colorValid` cannot be triggered from the UI.
  - Candidate 8: see the seam policy above.
  - Candidate 15: the generated schema has no Problem type; the module's input stays the
    hand-written `ApiError`.
  - Candidate 17: `ApiError.fieldMessage` is deleted by this candidate; it should be dropped from
    the housekeeping list.

**Added when the specs were cross-checked (2026-09-30).**

- **Test seam, reconciled with candidate 8.** Candidate 8's spec says a new test of a module that
  reaches the server uses the network seam, and that adding one to a file that mocks the hooks
  module converts that file. This spec's new screen tests are the agreed exception: they are added
  on the hook-mocked seam of files that already use it, so that this candidate stays complete on
  its own. The conversion rule applies to tests added after candidates 2 and 5 have landed.
- **Pseudo-fields, reconciled with candidate 4.** Candidate 4 keeps the pseudo-fields this spec's
  table renames, so the three-entry table stands. After candidate 4's step 4 the backend reports a
  bad Category colour as `color`; `colorValid` disappears. Any name this module does not know goes
  to the banner, which covers `nameValid` and `anyFieldSet`.
