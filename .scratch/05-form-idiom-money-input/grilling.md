# Grilling log — candidate 5: One form idiom, one money input

Repository: `/home/chris/side-projects/my-finance`, branch `dev`, HEAD `c3e20c5` (a merge commit
whose tree is identical to the brief's `4545810`). Paths are relative to `frontend/` unless they
start with another root. Every line number was re-read at HEAD.

**Settled before this session (brief §6, not re-litigated):** the plain form idiom;
`react-hook-form`, `@hookform/resolvers` and `zod` are removed. This log settles everything that
hangs off that decision.

Read in full for this candidate: `package.json`, `src/lib/money.ts`, `src/lib/schemas.ts`,
`src/screens/BudgetForm.tsx`, `src/components/TxnModal.tsx`, `src/screens/Subscriptions.tsx`,
`src/screens/SubscriptionForm.tsx`, the form parts of `Categories.tsx`, `ProfilePicker.tsx`,
`SaveControls.tsx`, `AuthScreen.tsx`, `SetPassword.tsx`, `MerchantBackfill.tsx`; the tests of all
of these; `e2e/smoke.spec.ts`; `ARCHITECTURE.md` §4; `docs/API.md` "Money" and the request tables
for transactions, budgets and subscriptions; the backend's
`config/StrictStringBigDecimalDeserializer.java` and `exception/GlobalExceptionHandler.java`; the
generated request types in `src/api/schema.d.ts`; `package-lock.json` (with a script, read-only);
`docs/LESSONS.md` entries at lines 2042 and 2358; the maintenance spec's dependency table.

---

## The design tree

```
Constraints (Q1) ─┬─ Comma everywhere? (Q3) ── The two money functions (Q5) ─┐
Dependencies (Q2) │                                                         ├─ BudgetForm (Q8)
Date helpers (Q4) ┘   What "the plain idiom" is (Q6) ── Shared helper? (Q7) ┼─ SubscriptionForm (Q9)
                                                                            ├─ Real <form>s (Q10)
                                                                            ├─ Packages (Q11)
                                                                            └─ Server field errors (Q12)
        Tests (Q13) ── Order with 2 and 3 (Q14) ── Docs (Q15) ── Edge cases (Q16) ── Siblings (Q17)
```

---

## Round 1 — frontier: Q1, Q2, Q3, Q4

❓ **Q1** - **What constraints bind the forms and the money input?**

🔎 Facts:
- `ARCHITECTURE.md:232–235`: no business logic beyond presentation and form handling; validation
  rules live server-side and are mirrored client-side "only for UX, never as the source of
  truth".
- `docs/API.md:82–115`: money is a decimal string plus a currency code; "rejected if they carry
  more than 4 decimal places — silently rounding someone's money is worse than a `400`" (`106–107`);
  an amount sent as a JSON number is rejected (`109–115`). Amount rules: `@DecimalMin(value = "0",
  inclusive = false)` `@Digits(integer = 15, fraction = 4)` for transactions (`705`), budgets
  (`997`) and subscriptions (`1158`); amounts are positive, direction is in `type` (`696`).
- A malformed amount string is not a field violation: the strict deserializer checks only the
  token type and delegates parsing to Jackson "so malformed numeric text still gets Jackson's usual
  handling" (`backend/config/StrictStringBigDecimalDeserializer.java:17–18,28–35`), and an unreadable
  body becomes the whole-body `400 /errors/invalid-request`, "The request body is missing or
  malformed." (`backend/exception/GlobalExceptionHandler.java:91–100`). So "1,234,56" (today's
  `.replace(',', '.')` rewrites only the first comma) reaches the server as "1.234,56" and comes
  back as a message that cannot be placed under the amount field. Read from code, not run.
- The generated request types the forms build: `CreateBudgetRequest { categoryId: number;
  amountLimit: string; currency: string; periodStart: string; periodEnd: string }`
  (`src/api/schema.d.ts:668–674`), `SubscriptionRequest` (`631–639`), `TransactionRequest`
  (`427–435`) — every amount is a `string`.
- Behaviour pinned by tests: `BudgetForm.test.tsx:24–33` (a zero amount shows text matching
  /greater than zero/ and sends nothing), `35–46` (the amount is sent as the string "1500.50");
  `TxnModal.test.tsx:30–40` (Enter submits; amount "12.50" sent as typed), `46–60` (toggle and
  Cancel do not submit); `Transactions.test.tsx:232–263` (editing prefills Amount with "10" from
  "10.0000"); `Subscriptions.test.tsx:155–194` (create currency, edit without currency selector,
  edit notes and save).
- Behaviour pinned by e2e: `e2e/smoke.spec.ts:88–93` (a colour swatch is clicked **between** filling
  the category name and clicking Create), `185–192` and `207–211` (cadence buttons clicked between
  filling the subscription and clicking Add), `80–86` (new profile Create), `575–586` (profile rename
  Save), `398–400` (insight name Save).
- Amounts are displayed with `pl-PL` formatting, so the user sees commas everywhere
  (`src/lib/money.ts:13`; e2e expects "34,99", `smoke.spec.ts:139`).

➡️ The design keeps: amounts as strings end to end (no `Number()` on an amount that is sent),
client checks as UX mirrors only, the exact labels and button names the tests and e2e use, and
the behaviours those tests pin.

⚖️ Strongest argument against: "mirrors only for UX" could be read as "do not validate amounts on
the client at all".

✅ Decision: constraints stand. The amount check is more than UX here — it is what keeps a malformed
amount from turning into a whole-body error — and it mirrors the server rule exactly.

❓ **Q2** - **Dependencies, by category.**

🔎 Facts: the forms call mutation hooks (`TxnModal.tsx:49–50`, `BudgetForm.tsx:34–35`,
`Subscriptions.tsx:27–29`) and read the active profile and categories from hooks; the money
functions will be pure string functions.

➡️ **In-process** only: pure money functions tested directly; forms tested at the existing
screen seam (the hooks module mocked). No port, adapter or mock is introduced.

⚖️ Strongest argument against: none.

✅ Decision: in-process.

❓ **Q3** - **The amount rule: is a comma accepted everywhere?** Options: (a) accept `,` and `.`
as the decimal separator in all three money forms; (b) accept only `.` everywhere (today's budget
rule); (c) keep two rules.

🔎 Facts: comma accepted and rewritten at `TxnModal.tsx:125` and `Subscriptions.tsx:106`
(`.trim().replace(',', '.')`); comma rejected by `src/lib/schemas.ts:11`
(`/^\d{1,15}(\.\d{1,4})?$/`). "12,50" therefore saves as a Transaction or a Subscription and fails as
a Budget — read from code, not reproduced. Display is `pl-PL` (Q1). All three amount inputs use
`inputMode="decimal"` (`TxnModal.tsx:194`, `BudgetForm.tsx:130`, `SubscriptionForm.tsx:92`); that
mobile decimal keypads offer the locale's separator (a comma in Polish) is platform behaviour, **not
verified here**.

➡️ (a). One rule: a comma or a dot, one of them, as the decimal separator; the wire string always
uses a dot.

⚖️ Strongest argument against: accepting a comma invites "1.234,56"-style grouped input that the
rule must then reject explicitly.

✅ Decision: (a); grouped input is rejected with a clear message (Q5). This fixes the budget case
that group G8 lists as possible bug E.1 and hands to this candidate.

❓ **Q4** - **Does the money module keep the date helpers, or do they move?** Options: (a) keep;
(b) move them to their own module in this change.

🔎 Facts: `src/lib/money.ts:46–134` are date helpers (`formatShortDate`, `formatDateWithYear`,
`todayIso`, `MonthOption`, `currentMonth`, `lastMonths`) — about 60% of the file. Seven files import
date helpers from it: `Budgets.tsx:16`, `Subscriptions.tsx:16`, `BudgetForm.tsx:10`,
`SubscriptionRow.tsx:3`, `Dashboard.tsx:17`, `Transactions.tsx:19`, `TxnModal.tsx:11`.

➡️ (a) — out of scope. Moving them is a pure rename touching seven import lines with no behaviour
change and no bearing on the money input; it would add churn to files this candidate otherwise
leaves alone (`Dashboard`, `Transactions`, `SubscriptionRow`, `Budgets`).

⚖️ Strongest argument against: the module's name misleads while it is 60% dates, and the files
being rewritten here (`BudgetForm`, `TxnModal`, `Subscriptions`) would take the new import for free.

✅ Decision: keep; recorded in Out of Scope as a possible housekeeping follow-up.

---

## Round 2 — frontier: Q5, Q6, Q7 (Q1, Q3 settled)

❓ **Q5** - **The two functions in the money module: names, contracts and edge cases.**

🔎 Facts: the edit-mode trim is the same expression in three places — `TxnModal.tsx:57`,
`BudgetForm.tsx:25–28`, `Subscriptions.tsx:76` (`/(\.\d*?)0+$/` then `/\.$/`); the backend writes
amounts at the stored scale, plainly (`docs/API.md:100–104`). The schema's messages: 'Required',
'Use digits, up to 4 decimal places', 'Must be greater than zero' (`src/lib/schemas.ts:10–12`); it
checks zero with `Number(v) > 0` (`12`). JavaScript's `\d` without the `u` flag matches only ASCII
digits (language semantics).

➡️ Two functions next to the display formatting:

**`parseAmount(text)`** — turns an **entered amount** into either the Money amount to send or the
message to show under the field. Rules, in order:
1. Surrounding whitespace is ignored.
2. Nothing left → "Enter an amount".
3. The shape must be: one or more digits, optionally followed by exactly one separator (`.` or
   `,`) and one or more digits. Anything else — a sign, letters, an exponent, a leading or trailing
   separator, two separators, grouping spaces — → "Use digits with an optional decimal part, e.g.
   12.50 or 12,50".
4. More than 4 digits after the separator → "Use at most 4 decimal places".
5. More than 15 digits before it → "Use at most 15 digits before the decimal separator".
6. No digit other than zero → "Must be greater than zero".
7. Otherwise the result is the text with the separator written as a dot; the digits are kept as
   typed (no rounding, no padding to four places, no stripping of zeros).
No floating-point conversion anywhere (the zero check looks at the digits).

**`editableAmount(amount)`** — turns a Money amount from the API ("1500.5000") into text for an
input: trailing zeros after the separator are dropped, and the separator too when nothing is left
after it. Integer zeros are never touched.

| Entered | `parseAmount` |
|---|---|
| "" or "   " | Enter an amount |
| "12" | "12" |
| " 12.50 " | "12.50" |
| "12,5" | "12.5" |
| "0,0001" | "0.0001" |
| "12.50000" | Use at most 4 decimal places |
| "0", "0.00", "0,0000" | Must be greater than zero |
| "-1", "+1", "1e3", ".5", "5.", "1 500", "1.500,00", "1,500.00", "١٢" | Use digits with an optional decimal part, e.g. 12.50 or 12,50 |
| "1234567890123456" (16 digits) | Use at most 15 digits before the decimal separator |
| "123456789012345.1234" | "123456789012345.1234" |
| "007" | "007" |

| From the API | `editableAmount` |
|---|---|
| "1500.5000" | "1500.5" |
| "10.0000" | "10" |
| "0.1000" | "0.1" |
| "1234.5670" | "1234.567" |
| "100" | "100" |
| "29.99" | "29.99" |

⚖️ Strongest argument against: rejecting grouping spaces ("1 500") is unfriendly to a Polish user
who types the way the app displays; stripping spaces is safe because a space is never a decimal
separator.

✅ Decision: as tabled. The rule stays one sentence long and exactly mirrors `@DecimalMin(0,
exclusive)` + `@Digits(15, 4)`, so a parsed amount never draws an amount violation from the server
and a malformed one never reaches it. Accepting grouping is a feature for later. Known harmless
false negative: a leading-zero-padded amount longer than 15 digits is rejected although the server
would accept it.

❓ **Q6** - **What exactly is "the plain idiom"?**

🔎 Facts: the older forms: `AuthScreen.tsx:15–20,44–62,103`, `SetPassword.tsx:15–19,41–51,79`,
`TxnModal.tsx:55–65,115–159,177–182`; `SetPassword.tsx:9–10` states it ("plain state, server field
errors under each field"). The repeated shape is listed in the evidence (`ProfilePicker.tsx:117–133`,
`Subscriptions.tsx:96–120`, `Categories.tsx:104–130`, `SaveControls.tsx:79–109`,
`MerchantBackfill.tsx:20–36`). `TxnModal.tsx:116` ignores a submit while one is in flight ("Enter
bypasses the Save button's disabled state"). The `<form>`/button-type trap is recorded in
`docs/LESSONS.md:2358–2373`.

➡️ A form is a component that:
1. holds each field's value in plain React state, one `useState` per field, initialised from the
   record being edited or from defaults;
2. holds its messages in plain state: one banner string and one record of field messages;
3. renders a real `<form>` whose submit handler: prevents the page submit; ignores a submit while
   the mutation is pending; clears its messages; runs its own checks (the money parse and the few
   checks the server cannot do or reports badly) and, if any fail, shows them and stops; builds the
   request body; calls the mutation hook with one success action (close, reset, navigate) and a
   failure handler that shows what `problemMessages` (candidate 2) returns;
4. gives every button inside the form that is not the submit button `type="button"`.

⚖️ Strongest argument against: this is a convention, not code; nothing stops the next form from
drifting.

✅ Decision: this definition goes into the LESSONS entry and the `ARCHITECTURE.md` §4 paragraph
(Q15). It is enforced by review and by the per-form tests (Q13).

❓ **Q7** - **Does the plain idiom need any shared helper at all?** Apply the deletion test to each
candidate helper.

🔎 Facts: see Q6. The category fallback `categoryId || (options[0] ? String(options[0].id) : '')`
appears at `TxnModal.tsx:112`, `Subscriptions.tsx:98`, `SubscriptionForm.tsx:131` (and a reset
variant at `Subscriptions.tsx:66`); `profile?.defaultCurrency ?? 'PLN'` at `TxnModal.tsx:110,231`,
`BudgetForm.tsx:59`, `Subscriptions.tsx:46`.

➡️ No shared helper beyond the two money functions (Q5) and candidate 2's `problemMessages`.
- A form hook (pending guard, clear, mutate, map errors): each form differs in its checks, body,
  success action and field list, so the hook would need an option for each — an interface as wide
  as its implementation. Deleting it would bring back about six lines per form. Rejected.
- A field component (label, input, message): would reshape every form's markup for no behaviour
  gain. Rejected here (a possible later accessibility change).
- A "first category id" helper: after this change each form computes the fallback once, in one
  line; deleting the helper would bring back one line per form. Rejected.
- A currency-default helper: the `?? 'PLN'` exists only because the active-profile hook returns a
  nullable value (review §2h); fixing that is a different change. Rejected.

⚖️ Strongest argument against: three copies of the category fallback encode a rule ("the visible
default and the saved value must agree") that a named helper would document.

✅ Decision: a form is a component with state, and that is fine. The honest answer to the card's
question is "no helper".

---

## Round 3 — frontier: Q8–Q12

❓ **Q8** - **`BudgetForm` in the plain idiom: what replaces the schema's messages and the
cross-field check (`periodEnd` ≥ `periodStart`)?**

🔎 Facts: the schema (`src/lib/schemas.ts:16–27`) checks: category id positive ('Pick a category'),
amount (`moneyString`), currency `^[A-Z]{3}$` ('Three-letter code, e.g. PLN'), both dates
`^\d{4}-\d{2}-\d{2}$` ('Use YYYY-MM-DD'), and `periodEnd >= periodStart` on `periodEnd` ('End date
must be on or after the start date'). The currency field is free text (`BudgetForm.tsx:141–147`);
the dates are `type="date"` inputs (`157–177`), which yield either an empty string or
`YYYY-MM-DD`. Defaults: first category or 0, empty amount, the profile's currency, the current
month (`BudgetForm.tsx:48–62`). Server errors all go to the form-level box today (`80–85`).
The server's own cross-field rule reports as `periodValid` (`dto/CreateBudgetRequest.java:39–42`),
which candidate 2 translates to `periodEnd`.

➡️ `BudgetForm` keeps every check the schema made, written as plain code in the submit handler,
all collected and shown together:
- no categories at all → banner "Create a category first — every budget needs one." (the wording
  `TxnModal` and `Subscriptions` already use; with the first-option fallback, "no categories" is the
  only way the old 'Pick a category' could fire);
- amount → `parseAmount`, message under "Amount limit";
- currency not three capital letters → "Three-letter code, e.g. PLN" under "Currency";
- an empty date → "Pick a date" under that date;
- both dates present and the end before the start → "End date must be on or after the start date"
  under "Period end" (ISO dates compare correctly as strings).
Body: category id as a number, the parsed amount string, currency, both dates. Server failures go
through `problemMessages` with the fields `categoryId`, `amountLimit`, `currency`, `periodStart`,
`periodEnd`. The `Dialog` wrapper (candidate 3) stays exactly as it is. Editing starts from
`editableAmount` of the budget's limit.

⚖️ Strongest argument against: currency and date checks are server rules mirrored for no strong
reason; dropping them would make the three money forms check the same things.

✅ Decision: keep them. This is a refactor; the only intended behaviour change in `BudgetForm` is
the money rule (comma accepted) and field placement of server messages. The "Pick a category"
message is replaced by the banner wording the other two money forms use.

❓ **Q9** - **The Subscription form owns its state: what is its interface afterwards?**

🔎 Facts: today `SubscriptionForm` takes 22 props (`SubscriptionForm.tsx:8–35`); all state,
defaults, reset, body building and submit live in the parent (`Subscriptions.tsx:36–120`); the
parent passes them through (`240–263`). The parent's row actions (pause, resume, cancel, restore,
delete) use the same update and delete mutations (`133–161`) and a `rowBusy` check on the update
mutation's variables (`129–131`). Editing sets every field from the subscription (`73–82`); a
successful save of either kind calls `resetForm` (`60–71`). The name and price inputs clear the
banner on change (`SubscriptionForm.tsx:72–75,87–90`). The lint preset forbids setting state
synchronously in an effect (`eslint.config.js:16`, react-hooks 7.1.1 recommended includes
`set-state-in-effect`). Resetting a component's state by giving it a new `key` is React's
documented idiom — library documentation, **not verified in this repo**.

➡️ `SubscriptionForm`'s interface becomes two props:
- **the subscription being edited**, or none for the add form;
- **a callback for when an edit ends** (saved or cancelled), so the parent can leave edit mode.
The parent renders it keyed by the edited subscription's id (a new id, or leaving edit mode, gives a
fresh form initialised from its props). The form reads the active profile and categories itself,
owns the create and update mutations for its own submit, its field state, its messages, its
checks (category exists → banner; `parseAmount` → under Price) and its body building. After a
successful **add** it resets its own fields in place (focus stays in the form); after a successful
**edit** or Cancel it calls the edit-ended callback. Typing in the name or price clears the banner
and that field's message, as today's clear-on-change does. Server failures go through
`problemMessages` with the fields `name`, `amount` (shown under "Price"), `nextBillingOn`, `notes`.
The parent keeps the list mode, the pending confirmation, the edited subscription and the row
error, with its own update and delete mutations for the row actions.

⚖️ Strongest argument against: two update-mutation instances (form and parent) mean a row's buttons
no longer disable while the form saves an edit of that same row.

✅ Decision: as recommended. The two in-flight states become independent — the form's Save is no
longer disabled by an unrelated row action either. The double-PUT race (pause clicked while an
edit of the same row is saving; the edit carries the status captured when editing began, so it can
undo the pause) is the same class of race as today's and is recorded, not fixed.

❓ **Q10** - **Every form a real `<form onSubmit>`: which change, and what does that do to their
tests?**

🔎 Facts: real forms today: `TxnModal.tsx:177`, `BudgetForm.tsx:107`, `AuthScreen.tsx:103`,
`SetPassword.tsx:79`. Not forms: `SubscriptionForm` (Add is an `onClick`, `SubscriptionForm.tsx:170`),
the Categories add card (`Categories.tsx:313–381`, Create `onClick` at `374`), the ProfilePicker
new-profile card (`ProfilePicker.tsx:323–394`, Create `374–380`, Cancel `381–383`), the insight
name (`SaveControls.tsx:144–174`, Save `166`, New insight `170`). One more in a file this candidate
already touches: the ProfilePicker rename card (`ProfilePicker.tsx:223–249`, Save `238–244`, Cancel
`245–247`) — Enter does nothing there either. Buttons without a `type` inside those blocks: the
four cadence buttons (`SubscriptionForm.tsx:146–153`), Add and Cancel (`170–177`); the Auto swatch
and nine palette swatches (`Categories.tsx:353–368`); Create; the picker's Create/Cancel and
Save/Cancel; Save and New insight. Inside a `<form>` a button without a `type` submits
(`docs/LESSONS.md:2358–2373`; `TxnModal.test.tsx:42–60` is the regression test for it). The
Categories inline rename already submits on Enter and cancels on Escape through its own key handler
(`Categories.tsx:218–221`).

➡️ Five forms become real forms: the Subscription form, the Categories add form, the ProfilePicker
new-profile form and rename card, and the insight name. In each, the one submit button is
`type="submit"` with no click handler, and every other button gets `type="button"` (cadence
buttons, Cancel, swatches, New insight). Left as they are: the Categories inline rename (already
handles Enter), the move popover, the merchant back-fill rows, the backup export panel, the
transaction search box, the nav's profile select.

⚖️ Strongest argument against: the rename card was not in the card's list of four; converting it
widens the change.

✅ Decision: five. The rename card is in a file already being edited, has the same bug, and needs
the same three attributes. Tests: every existing test that clicks a submit or cancel button by name
keeps passing (the names do not change); new tests assert that Enter submits each form and that
the cadence buttons and swatches do not (test-first: each fails today); the e2e flows at
`smoke.spec.ts:88–93,185–192,207–211` depend on the `type="button"` changes and keep passing.

❓ **Q11** - **Which package entries go, and what else references them?**

🔎 Facts: `package.json:22` `@hookform/resolvers`, `:26` `react-hook-form`, `:29` `zod`, all in
`dependencies`. Imported only by `BudgetForm.tsx:1,3,4` and `src/lib/schemas.ts:5`
(`grep -rn "react-hook-form\|hookform\|from 'zod'" src`). Added in `8be4977` (2026-09-07) and
declared in the maintenance spec as "The budget CRUD forms (G1), then reused for the existing
hand-rolled forms" (`docs/superpowers/specs/2026-09-07-maintenance-run-design.md:129`). In the
lockfile (read with a script): `react-hook-form` is required only by the root and as a peer of the
resolvers; `@hookform/resolvers` only by the root; **`zod` is also a dependency of
`eslint-plugin-react-hooks`** (a dev dependency) and a peer of `zod-validation-error`; the resolvers'
own dependency `@standard-schema/utils` is also required by `@reduxjs/toolkit`. Other mentions:
the historical reports under `.superpowers/sdd/2026-09-07-maintenance-run/`, and a git-ignored
LESSONS entry (`docs/LESSONS.md:2042`).

➡️ Uninstall the three with the package manager so the manifest and the lockfile change together;
delete the `schemas` module. Expected afterwards: `react-hook-form` and `@hookform/resolvers` leave
the lockfile; `zod` stays in it as a development-only transitive dependency of the lint plugin (that
is correct — nothing in the app bundle imports it); `@standard-schema/utils` stays for Recharts'
toolkit. The historical `.superpowers` reports and the maintenance spec are history and are not
edited; the old LESSONS entry gets a one-line "superseded" note.

⚖️ Strongest argument against: leaving `zod` in the lockfile may look like an incomplete removal to
a reviewer.

✅ Decision: as recommended; the spec says so explicitly so a reviewer checks the manifest and the
imports, not the lockfile, for `zod`.

❓ **Q12** - **How do field errors from the server reach the fields?**

🔎 Facts: candidate 2's `problemMessages` takes the list of fields a form shows and returns their
messages plus a banner (candidate 2 spec). In the combined order, candidate 2's G3-6 leaves
`BudgetForm` and `Subscriptions` with a one-line form-level banner.

➡️ Through candidate 2's module, with each rewritten form passing its field list (`BudgetForm`: five
fields; `SubscriptionForm`: `name`, `amount`, `nextBillingOn`, `notes`). This candidate therefore
**depends on candidate 2** and lands after it; it replaces the G3-6 one-liners with field
placement.

⚖️ Strongest argument against: landing this candidate first would avoid those two one-liners.

✅ Decision: after candidate 2 (see Q14).

---

## Round 4 — frontier: Q13–Q17

❓ **Q13** - **Tests: which survive, which are added, which go; what is the seam?**

🔎 Facts: see Q1 for the pinned tests; the repo's table precedent is the parametrised
`test.each` in `ProfilePicker.test.tsx:170–187`; there is no unit test of the money module today.

➡️ Seams: the money module's own interface (a table), and the existing screen seam (hooks module
mocked) for the forms. No new seam.
- **New:** a money test table covering every row of Q5's two tables.
- **Survive unchanged:** `BudgetForm.test.tsx:24–33` (the zero message still matches /greater than
  zero/) and `35–46`; the five `TxnModal` form tests that remain after candidate 3 removes its
  three dialog tests; `Transactions.test.tsx:232–300` (edit prefill "10", save "12.50", explicit merchant clear);
  all 13 `Subscriptions` tests (they drive the form through the screen by label and button name);
  `ProfilePicker`, `Categories` and `Insights` tests that click Save/Create/Cancel by name; the G3-6
  "server message is visible" tests from candidate 2 (they assert text only).
- **Added, each written first:** `TxnModal` — a malformed amount shows a message under Amount and
  sends nothing (fails today: it is sent); `BudgetForm` — "12,50" is sent as "12.50" (the G8 E.1 bug;
  fails today), an end date before the start date is rejected under Period end before any request,
  a server field message lands under its field, editing prefills "1500.5" from "1500.5000";
  `Subscriptions` — Enter in the service name adds, a cadence click does not submit, "9,99" is sent
  as "9.99"; `Categories` — Enter in the name creates, a swatch click does not; `ProfilePicker` —
  Enter creates a profile, Enter saves a rename, Cancel on the new-profile form creates nothing;
  `Insights` (for the insight name) — Enter saves.
- **Deleted:** nothing beyond what candidate 3 moves. The schema has no test of its own.

⚖️ Strongest argument against: screen tests for "comma accepted" re-test the money table.

✅ Decision: one comma test per form that had a different rule or none (`BudgetForm`,
`Subscriptions`); `TxnModal` only gets the malformed-amount test. The table owns the rule; the
screen tests prove each form uses it.

❓ **Q14** - **The order across candidates 2, 3 and 5, file by file, so that no file is rewritten
twice.**

🔎 Facts: candidate 3 touches only the dialog shells (`TxnModal`, `BudgetForm`); candidate 2 only
the error handling of 13 files plus `Nav`; this candidate rewrites `BudgetForm` and
`SubscriptionForm`/`Subscriptions`, edits two amount lines in `TxnModal`, and wraps fields in
`<form>` in `Categories`, `ProfilePicker`, `SaveControls`.

➡️ G3 combined order: 3 (G3-1…3) → 2 (G3-4…9) → 5 (G3-10…13):
- **G3-10** money functions + table + `TxnModal`'s amount lines;
- **G3-11** `BudgetForm` rewrite + `schemas` deleted + packages uninstalled + `ARCHITECTURE.md` §4;
- **G3-12** `SubscriptionForm` owns its state + real form + `Subscriptions` slimmed;
- **G3-13** real forms in `Categories`, `ProfilePicker`, `SaveControls`.
The only rewrites (G3-11, G3-12) happen once and last; every other file this candidate touches gets
one small edit in a region the siblings' steps leave alone.

⚖️ Strongest argument against: this candidate removes three dependencies and could go first for a
quick visible win.

✅ Decision: last. It depends on candidate 2's module for field placement and on candidate 3's
`Dialog` for the `BudgetForm` shell; landing it last is what makes every file's rewrite happen once.

❓ **Q15** - **Which recorded-decision documents change in the same change?**

🔎 Facts: `ARCHITECTURE.md` §4 explains the frontend stack with "Why …" paragraphs (Vite,
Recharts, Storybook: `237–268`) and says nothing about forms beyond "presentation and form
handling" (`233`). Its Recharts paragraph says "a frontend that otherwise has three runtime
dependencies" (`254–255`); it was added on 2026-09-05 by `ced3912` (the only commit that adds the
phrase to `ARCHITECTURE.md`), when the runtime dependencies were exactly `react`, `react-dom`,
`react-router-dom` and `@tanstack/react-query` (`git show ced3912:frontend/package.json`) — three
libraries if React and React DOM count as one; Recharts arrived later that day (`9ea8dee`). Today,
with the form stack, the sentence is false (seven other packages). The adoption of the form stack was recorded only in the maintenance spec (a historical
plan, not a recorded-decision document).

➡️ `ARCHITECTURE.md` §4: add a short "Why plain form state, no form library" paragraph (the idiom in
one sentence, where the amount rule lives, why the form library was removed); and make the Recharts
paragraph's count exact by naming the others (React, React Router, TanStack Query) — true again
once the three packages are gone, so it lands in G3-11. No change to `docs/API.md` (the wire rules
are unchanged; the client mirrors them).

⚖️ Strongest argument against: a "why not" paragraph documents an absence.

✅ Decision: both edits, in G3-11. The paragraph stops the next contributor from re-adding a form
library for one form without knowing it was tried and removed. No ADR (docs-proposals).

❓ **Q16** - **Edge cases and failure modes.**

🔎 Facts and scenarios:
1. A pasted display value "1 234,50 zł" → format message (display uses `pl-PL` with grouping).
2. "1,234,56" → format message (today: first comma rewritten, the rest sent → whole-body 400).
3. A leading-zero-padded amount of 16+ characters → rejected though the server would accept it.
4. Categories still loading when the form opens → the fallback picks the first option at submit
   time, as `TxnModal` already does (`TxnModal.tsx:111–112`).
5. A profile whose default currency is outside the fixed list (a restored backup) → the currency
   options still include it (`src/lib/money.ts:28–35`); unchanged.
6. Enter pressed while a save is in flight → ignored (the `TxnModal.tsx:116` guard, now in every
   form).
7. Enter in the notes textarea → a new line, not a submit (textarea semantics).
8. A date input cleared in `TxnModal` or the Subscription form → sent as an empty string, as today;
   what the backend answers for an empty date or amount string (Jackson 3 coercion) was **not
   verified** — the design does not depend on it (amounts are parsed first; `BudgetForm` checks its
   dates as the schema did).
9. A future transaction date → the server's `occurredOnNotInFuture` lands under Date (candidate 2).
10. Editing a subscription, then pausing that row before saving the edit → the edit's save carries
    the old status (Q9) — pre-existing.

➡️ Handled by Q5–Q10 or recorded as pre-existing.

⚖️ Strongest argument against: item 3 is a false negative.

✅ Decision: accepted and documented.

❓ **Q17** - **Cross-candidate effects.**

🔎 Facts: G8's card lists `sumAmounts` (`src/lib/money.ts:140–142`, 0 callers) as dead code, the
hard-coded currency options (`ProfilePicker.tsx:368–371`) inside the new-profile block this candidate
wraps in a `<form>`, and possible bug E.1 (comma in a budget amount) as owned by this candidate. G7
(candidate 15) is making the generated types accurate; the forms build `CreateBudgetRequest`,
`SubscriptionRequest` and `TransactionRequest` bodies. G4 (candidate 8) moves new tests toward a
network seam.

➡️
- **Candidate 17 (G8):** `sumAmounts` — independent lines of the money module; either order.
  Currency options — recommend G8's one-line fix lands before G3-13; if not, whichever lands second
  resolves a one-block conflict. E.1 — fixed in G3-11 with a failing test first; G8 records it as
  handed over.
- **Candidate 15 (G7):** if the generated request types are renamed, the forms follow the new
  names; the bodies they build are unchanged.
- **Candidate 8 (G4):** new form tests live in files that already mock the hooks module and use
  that seam; the money table is pure.
- **Candidate 2:** provides `problemMessages`; this candidate replaces its G3-6 one-liners.
- **Candidate 3:** provides `Dialog`; the `BudgetForm` rewrite keeps it untouched.

⚖️ Strongest argument against: none.

✅ Decision: recorded in the spec.

**Frontier after Round 4: empty.**

---

## Decisions (one page)

1. **One amount rule everywhere:** comma or dot, once; ≤ 15 digits before, ≤ 4 after; greater than
   zero; no sign, no grouping. Wire string uses a dot and keeps the typed digits.
2. **Two functions in the money module:** `parseAmount` (entered amount → Money amount or a message)
   and `editableAmount` (Money amount → input text without trailing zeros). Pure; table-tested;
   no floating point.
3. **The plain idiom** is defined (state per field, a banner and field messages, a real `<form>`,
   pending guard, own checks, `problemMessages` on failure, `type="button"` on non-submit buttons).
   **No shared helper** beyond the money functions and candidate 2's module.
4. **`BudgetForm`** rewritten in the idiom, keeping the schema's checks and wording (except "Pick a
   category" → the shared "Create a category first" banner); keeps candidate 3's `Dialog`; server
   messages placed by field.
5. **`SubscriptionForm`** owns its state and mutations; interface = the edited subscription + an
   edit-ended callback; keyed by the subscription id; resets itself after an add.
6. **Five real forms:** Subscription, Categories add, ProfilePicker new-profile and rename, insight
   name.
7. **Packages:** `react-hook-form`, `@hookform/resolvers`, `zod` uninstalled; the `schemas` module
   deleted; `zod` legitimately remains in the lockfile under the lint plugin.
8. **Date helpers stay** in the money module (out of scope).
9. **Order:** last in G3 (G3-10 … G3-13), after candidates 3 and 2.
10. **Docs:** `ARCHITECTURE.md` §4 gains "why plain form state" and an exact dependency sentence;
    no ADR.
11. **Unverified:** mobile keypad separators; Jackson 3's answer to empty amount/date strings; React's
    key-reset idiom (library documentation); the budget comma bug itself (read from code).
