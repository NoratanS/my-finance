# Grilling log — candidate 2: One module turns a Problem into messages

Repository: `/home/chris/side-projects/my-finance`, branch `dev`, HEAD `c3e20c5` (tree identical
to the brief's `4545810`). Paths are relative to `frontend/` unless they start with another root
(`backend/…` means `backend/src/main/java/com/myfinance/backend/…`). Every line was re-read at
HEAD.

Read in full for this candidate: `src/api/client.ts`, `src/api/hooks/auth.ts`, all 13 consumer
files (`TxnModal`, `AuthScreen`, `SetPassword`, `BudgetForm`, `Budgets`, `Subscriptions` +
`SubscriptionForm`, `Transactions` error parts, `Categories`, `ProfilePicker`, `SaveControls`,
`ResultsPanel` error part, `Insights`, `MerchantBackfill`), `Nav.tsx`, `PinnedInsights.tsx`,
`App.tsx`, `main.tsx`, the tests of those files, `e2e/smoke.spec.ts`, `e2e/a11y.spec.ts`,
`docs/API.md` (Errors and the per-endpoint error tables), the backend's
`GlobalExceptionHandler`, `ApiException`, `ResourceNotFoundException`, `BackupInvalidException`,
`InvalidPlanException`, `AnalyticsUnavailableException`, `SecurityConfig` exception handling,
`ProblemDetailResponseWriter`, every `@AssertTrue` in `dto/`, `nginx.conf`, `vite.config.ts`,
`eslint.config.js`, and the mockup's error copy in `docs/design/My Finance UI.dc.html`.

---

## The design tree

```
Constraints (Q1) ─┐
Inputs + deps (Q2)├─ Shape of the output + options (Q5) ─┬─ Banner formats (Q6)
Location (Q3) ────┤                                       ├─ Field placement (Q7)
Function/hook (Q4)┘                                       ├─ Pseudo-fields (Q8)
                                                          ├─ Fallback + non-Problems (Q9)
                                                          ├─ Type-specific details (Q10)
                                                          └─ ApiError.fieldMessage (Q11)
   Silent failures (Q12) ─ Per-file result (Q13) ─ Seams (Q14) ─ Tests (Q15) ─ Guard (Q16)
   Order with 3 and 5 (Q17) ─ Docs (Q18) ─ Edge cases (Q19) ─ Cross-candidate (Q20)
```

---

## Round 1 — frontier: Q1, Q2, Q3, Q4

❓ **Q1** - **What constraints must the design respect?** List the wire contract, recorded
decisions and pinned behaviour.

🔎 Facts:
- `docs/API.md:150–169`: every error is RFC 9457 `application/problem+json`; "`type` is a stable
  machine-readable slug the frontend switches on; `detail` is prose and may change without
  notice"; the base example says `detail` is "Human-readable, safe to show a user" (`163`).
- `docs/API.md:171–187`: a `400` `/errors/validation-failed` carries `errors: [{field, message}]`.
  `docs/API.md:189–191`: cross-field rules are `@AssertTrue` methods, "so their `field` is the
  method's property name (`periodValid`, `anyFieldSet`) rather than a real body field".
- `docs/API.md:193–196`: the 400/422 split "tells the frontend whether to highlight a form field or
  show a dialog". **Contradiction with the code:** no screen shows a dialog for a 422; every 422
  (depth, cycle, backup-invalid) is shown in an inline `.error-box` (`Categories.tsx:306–310`,
  `ProfilePicker.tsx:506–517`).
- The backend writes a Problem for every failure it produces: `backend/exception/GlobalExceptionHandler.java:42–45`
  (every `ApiException`), `47–51` (bad credentials), `57–64` (constraint race → `/errors/conflict`),
  `67–72` (anything else → 500 `/errors/internal`), `74–87` (validation-failed, detail "The request
  body has N invalid field(s).", `errors` list), `91–100` (unreadable body → `/errors/invalid-request`);
  401 and 403 are written as Problems by `backend/config/SecurityConfig.java:90–101` through
  `backend/security/ProblemDetailResponseWriter.java:28–37`.
- `ApiError` parses the Problem once (`src/api/client.ts:15–44`): `status`, `type` (falls back to
  `/errors/unknown` when the body has no string `type`, `31`), `title`, `detail` (falls back to
  "Request failed with status N.", `26–27`), `errors` (`34–36`), and the raw body as `extra` (`37`).
  A non-JSON body leaves `extra` empty (`104–108`).
- The generated OpenAPI types contain no Problem type (`grep -i problem src/api/schema.d.ts` → no
  match), so the Problem shape stays hand-typed in `client.ts`.
- Global handling already exists for 401 and 409 `no-active-profile` (`client.ts:110–115`,
  `App.tsx:20–40`); `useSession` swallows its own 401 (`src/api/hooks/auth.ts:24–27`).
- One e2e test pins a format: `e2e/smoke.spec.ts:301–317` — `page.locator('.error-box')` (strict:
  exactly one on the page) must contain `409` and `category-name-taken` after a duplicate category
  name.
- Two unit tests pin visible server text: `Categories.test.tsx:126–143` (category-in-use detail),
  `ProfilePicker.test.tsx:116–135` (last-profile detail); one pins the field mapping:
  `SetPassword.test.tsx:77–92`.
- No test pins any fallback sentence (`grep -rn "backend running\|Could not \|Something went wrong"
  src e2e` shows only source lines).

➡️ Constraints the module must keep: switch only on `type` (never on `detail`); show `detail`
as the human sentence; keep `validation-failed` field messages at fields where a screen shows the
field; keep `ApiError` as the single parser; keep the global 401/409 handling where it is; keep
the Categories error box showing `409` and `category-name-taken`; amend the `API.md` sentence
that says "dialog".

⚖️ Strongest argument against: the e2e pin could simply be changed; it pins presentation, not a
contract.

✅ Decision: constraints stand; the e2e pin is honoured by Q6's decision, and the `API.md`
contradiction is fixed in the same change (Q18).

❓ **Q2** - **What can reach a screen's error handler, and what does the module depend on?**
Options by category: in-process, local-substitutable, ports & adapters, mock.

🔎 Facts:
- A Problem response → `ApiError` with a string `type` (Q1).
- A response that is **not** a Problem → `ApiError` with `extra` lacking `type`. In production the
  SPA reaches the backend through nginx (`nginx.conf:41–61`); nginx answers **502** when it cannot
  reach the backend, and `nginx.conf:22–31` records that this was observed in practice ("502ing
  every /api request until nginx happened to be restarted"). nginx's own body limit is 25 MB
  (`nginx.conf:39`); a larger upload gets nginx's 413, not the backend's Problem. The dev server
  proxies `/api` too (`vite.config.ts:6–13`); what it returns when the backend is down was **not
  verified**.
- A network failure → `fetch` rejects with a `TypeError` (not an `ApiError`); a 2xx whose body is
  not JSON makes `response.json()` throw (`client.ts:98`).
- The module needs none of the network: it maps an already-thrown value to text.

➡️ Inputs: `ApiError` with a Problem, `ApiError` without one, anything else. Dependency category:
**in-process** (a pure function; tested directly, no adapter).

⚖️ Strongest argument against: treating "no Problem body" specially couples the module to the
deployment's proxy behaviour.

✅ Decision: in-process pure module; the non-Problem case is handled in Q9.

❓ **Q3** - **Where does the module live?** Options: (a) next to `ApiError` in the API layer; (b) in
`src/lib/` with the presentation helpers; (c) as methods on `ApiError`.

🔎 Facts: `src/lib/` holds display helpers (`money.ts`, `categoryColor.ts`) that know nothing about
errors. The mapping needs wire knowledge: the `/errors/` prefix of `type`, the `errors` member,
backend pseudo-field names (`dto/TransactionRequest.java:46–47`, `dto/BcryptPassword.java:25–26`,
`dto/CreateBudgetRequest.java:39–40`), and the `problems` member of two Problems
(`backend/exception/BackupInvalidException.java`, `InvalidPlanException.java`, both "Same shape").
Methods on `ApiError` (option c) cannot handle a `TypeError` from `fetch`, which the screens must
also turn into text (Q2).

➡️ (a): a separate module in the API layer, next to the client that parses the Problem. It is the
consumer-side half of the wire error contract; `client.ts` stays a transport.

⚖️ Strongest argument against: the module produces user-facing copy (the fallback sentence, the
" · " join), which is presentation, and presentation lives in `src/lib/`.

✅ Decision: API layer, own file (named `problemMessages`, Q5). Screens import it instead of
`ApiError`.

❓ **Q4** - **A function, a hook, or both?** Options: (a) a pure function; (b) a hook that owns the
message state; (c) both.

🔎 Facts: forms show client-side messages in the same places as server messages:
`SetPassword.tsx:46–49` (passwords do not match → `confirm`), `TxnModal.tsx:119–122` (no category
→ banner), `MerchantBackfill.tsx:21–25` (empty merchant), `SaveControls.tsx:80–84` (empty name).
Screens keep message state as plain `useState` strings/records today (`TxnModal.tsx:64–65`,
`AuthScreen.tsx:19–20`, `SetPassword.tsx:17–18`). The compiler lint preset (`eslint.config.js:16`,
react-hooks 7.1.1) forbids setting state synchronously in an effect.

➡️ (a) a pure function. Screens keep their own `useState` (a banner string and a record of field
messages), set them from the function's result on error and from their own checks on submit. A
hook would have to expose setters for the client-side messages as well — an interface as wide as
the state it wraps (shallow).

⚖️ Strongest argument against: every form repeats two `useState` lines and a three-line `onError`;
a hook would remove them.

✅ Decision: function only. Deletion test on the rejected hook: deleting it brings back two lines per
form, nothing more.

---

## Round 2 — frontier: Q5–Q11 (Q1–Q4 settled)

❓ **Q5** - **What goes in and what comes out?** Options for the output: a single string; a
`{banner, fields}` pair; that pair plus type-specific details.

🔎 Facts — what the 19 mapping sites need (all verified at HEAD):
- a one-line message only: `Budgets.tsx:236–243`, `Transactions.tsx:395–400`,
  `Subscriptions.tsx:122–126`, `Categories.tsx:55–59`, `ProfilePicker.tsx:98–100,111–113,128–130,166–168`,
  `MerchantBackfill.tsx:30–33`, `SaveControls.tsx:56–62`, `BudgetForm.tsx:80–85`;
- messages at fields plus a banner: `TxnModal.tsx:136–152`, `AuthScreen.tsx:27–42`,
  `SetPassword.tsx:24–39`; joined field messages: `Subscriptions.tsx:84–94`;
- a list of specific problems: `ProfilePicker.tsx:179–189` (`backup-invalid`),
  `ResultsPanel.tsx:40–69` (`invalid-plan`);
- a decision on the type: `ResultsPanel.tsx:27–38` (`analytics-unavailable`), `Insights.tsx:149–154`
  (404);
- status and type in the text: `Categories.tsx:57,122–123`, `SaveControls.tsx:59`,
  `ResultsPanel.tsx:73`.

➡️ One function, `problemMessages(failure, options)`.
- **In:** the thrown value (anything), and two options: `fields` — the request field names this
  screen can show a message under (wire names such as `amount`, `occurredOn`); `withCode` —
  prefix the banner with the status and type (Q6).
- **Out** (`ProblemMessages`): `banner` (one line for the whole action, empty when every message
  was placed at a field); `fields` (messages keyed by the requested names only); `problemList`
  (the Problem's `problems` strings, else empty); `slug` (the `type` without its `/errors/`
  prefix, or null when the failure was not a Problem).
- **Invariants:** never throws; every failure yields at least one visible message (a banner or a
  field message); no message from the server is dropped.

⚖️ Strongest argument against: `slug` in the output lets screens keep switching on types, which
is the leak this candidate removes.

✅ Decision: as recommended. Switching on `type` is what `docs/API.md:168` tells the frontend to
do; the leak being removed is the parsing of `errors`/`extra`, the fallback copy and the format
choices, not the right to branch on a documented slug. Unblocks Q6–Q13.

❓ **Q6** - **One banner format for all screens, or a small number? What happens to the
Categories format and its e2e assertion?** Options: (a) one format, `detail` only, and change the
e2e test; (b) one format, `status slug — detail`, everywhere; (c) two formats owned by the module
— plain `detail` by default, `status slug — detail` where a screen asks for it.

🔎 Facts:
- Formats today: F1 `detail` only — 9 sites (`Budgets.tsx:239`, `BudgetForm.tsx:83`,
  `Subscriptions.tsx:124`, `Transactions.tsx:398`, `ProfilePicker.tsx:99,112,129,167`,
  `MerchantBackfill.tsx:32`); F2 per-field with a rename — 3 (`AuthScreen.tsx:27–42`,
  `SetPassword.tsx:24–39`, `TxnModal.tsx:136–152`); F3 joined field messages — 1
  (`Subscriptions.tsx:84–94`); F4 `status — detail` — 1 (`Categories.tsx:57`, the row actions); F5
  `status slug — detail` — 3 (`Categories.tsx:122–123`, `SaveControls.tsx:59`,
  `ResultsPanel.tsx:73`); F6 type-specific — 2 (`ProfilePicker.tsx:180–185`, `ResultsPanel.tsx:27–69`).
- Categories shows API codes on purpose: its "Rules from the API" card quotes
  `422 category-depth-exceeded` and `409` (`Categories.tsx:382–407`); the mockup prescribes the
  same card (`docs/design/My Finance UI.dc.html:291–297`) and writes the category errors as
  `422 category-depth-exceeded — …` and `409 category-name-taken — …` (`…dc.html:664–665`).
- The mockup also writes the transaction dialog's error as `400 validation-failed — …`
  (`…dc.html:676–677`), which the app does **not** follow: `TxnModal` places messages under
  fields. So the mockup is not a binding convention everywhere; it is followed on Categories.
- Categories itself is inconsistent: create uses F5, row actions F4 (no slug).
- The e2e pin (Q1) requires `409` and `category-name-taken` in the Categories error box.

➡️ (c). Two presentations, both produced by the module: **plain** (the Problem's `detail`) by
default; **with code** (`status slug — detail`) for the two developer-facing surfaces that already
show codes — all of Categories (create and row actions, fixing its F4/F5 split) and the Insights
explorer (save/pin/delete errors and the run error). Everything else is plain. The e2e test stays
as it is.

⚖️ Strongest argument against: one format is simpler and codes are jargon to a self-hosting user;
the mockup is not followed consistently, so "the mockup says so" is weak, and the refactor is the
cheapest moment to drop codes everywhere.

✅ Decision: (c). A refactor should not make a product decision silently; this keeps every
deliberate presentation, removes the accidental ones, and puts the choice in one flag. Dropping
codes later is a one-line change per surface plus the e2e text.

❓ **Q7** - **How are field messages placed, and what happens to the ones a screen does not
show?** Options: (a) place requested fields, drop the rest (today's `TxnModal`); (b) place
requested fields, put the rest in the banner; (c) put everything in the banner (today's
`Subscriptions`).

🔎 Facts:
- `TxnModal` builds a record of every violation (`TxnModal.tsx:139–145`) but renders only
  `amount` (`197–201`), `occurredOn` (`214–218`) and `merchant` (`292–296`); the banner is set only
  when there are no violations (`146–148`). A `description` over 500 characters
  (`docs/API.md:709`) therefore produces **no visible message at all**. Read from code, not
  reproduced.
- Where a screen uses F1 for a validation failure, the user sees only "The request body has N
  invalid field(s)." (`GlobalExceptionHandler.java:84`), e.g. a profile name over 100 characters
  on `ProfilePicker.tsx:129`, a merchant over 100 on `MerchantBackfill.tsx:32`.
- `Subscriptions.tsx:88` joins messages without field names ("must not be blank · must be greater
  than 0"); Bean Validation's default messages have no subject.
- One field can carry two violations: `docs/API.md:283` gives `password` both `@NotBlank` and
  `@Size(min = 12, …)`, so an empty password fails both; today's loops keep the last one only
  (`AuthScreen.tsx:31–34`).

➡️ (b). A violation whose field (after the pseudo-field translation, Q8) is in `fields` goes to that
field; several messages for one field are joined with " · ". Every other violation becomes a
banner line "‹field›: ‹message›", lines joined with " · ". A validation failure never shows the
"N invalid field(s)" detail.

⚖️ Strongest argument against: "description: size must be between 0 and 500" shows a wire field
name to the user; the screen knows the label ("Description") and could place it properly.

✅ Decision: (b). The guarantee "no message is dropped" is the point; a screen that wants a label
lists the field and gets placement. The wire name appears only for fields a screen chose not to
show.

❓ **Q8** - **Pseudo-fields: a rename table in the frontend, or nothing if G2 fixes the source?**

🔎 Facts: six `@AssertTrue` pseudo-fields exist (`grep -rn '@AssertTrue' backend/…`):
`occurredOnNotInFuture` (`dto/TransactionRequest.java:46–47`), `passwordWithinBcryptLimit`
(`dto/BcryptPassword.java:25–26`, used by `RegisterRequest` and `SetPasswordRequest`),
`periodValid` (`dto/CreateBudgetRequest.java:39–40`, `dto/UpdateBudgetRequest.java:39–40`),
`anyFieldSet`, `nameValid`, `colorValid` (`dto/UpdateCategoryRequest.java:89–106`). The frontend
renames two today, in three copies (`TxnModal.tsx:142`, `AuthScreen.tsx:32`, `SetPassword.tsx:29`).
Reachable from a form: `occurredOnNotInFuture` (a typed date beyond UTC today + 1 in `TxnModal`),
`passwordWithinBcryptLimit` (register, set password — tested at `SetPassword.test.tsx:77–92`),
`periodValid` (a budget whose client-side check is bypassed or absent). Not reachable:
`anyFieldSet` (the UI never sends an empty category PATCH — every call sends a field,
`Categories.tsx:73,88,202`), `nameValid` (blank names are blocked before sending,
`Categories.tsx:69–70`), `colorValid` (colours come from the palette, `Categories.tsx:359–368,468–477`).
Group G2 (candidate 4) is deciding whether to report cross-field violations on the real field.

➡️ A three-entry table inside the module: `occurredOnNotInFuture` → `occurredOn`,
`passwordWithinBcryptLimit` → `password`, `periodValid` → `periodEnd`. Real field names pass
through untouched, so the module works whether or not G2 changes the backend, and during the
transition. If G2 reports on the real field, the table and its three test rows are deleted and
nothing else changes.

⚖️ Strongest argument against: the frontend should not know backend method names at all; wait for
G2 and ship no table.

✅ Decision: the table, in one place (it replaces three copies). Unreachable pseudo-fields are not
listed (no handling for impossible cases); if one ever arrives it still reaches the banner under
its own name.

❓ **Q9** - **What is the fallback, and what happens to a response that is not a Problem?**

🔎 Facts: "Something went wrong — is the backend running?" is written 7 times
(`Budgets.tsx:241`, `SetPassword.tsx:37`, `Subscriptions.tsx:124`, `BudgetForm.tsx:83`,
`TxnModal.tsx:150`, `MerchantBackfill.tsx:32`, `AuthScreen.tsx:40`), with a variant
`ResultsPanel.tsx:22`; 9 "Could not <verb> the <noun>." mutation fallbacks
(`ProfilePicker.tsx:99,112,129,167,187`, `Subscriptions.tsx:92`, `Transactions.tsx:398`,
`Categories.tsx:125`, `SaveControls.tsx:60`), and `Categories.tsx:57` "Something went wrong.".
Every response the backend writes is a Problem (Q1); a non-Problem body means the backend did not
answer — in production nginx's 502 (Q2). No test pins any fallback (Q1).

➡️ One sentence, owned by the module: "Something went wrong — is the backend running?". Used
when the failure is not an `ApiError`, and when it is an `ApiError` whose body is not a Problem
**and** whose status is 500 or above (the backend did not answer). A non-Problem 4xx (nginx's own
413 for an upload over 25 MB) keeps `ApiError`'s own text, "Request failed with status N.". The
nine "Could not …" variants go.

⚖️ Strongest argument against: "Could not delete the transaction." says which action failed; the
generic sentence does not.

✅ Decision: one sentence. Every message is shown next to the control that failed, so the location
already names the action. Detection uses the raw body (`extra` has no string `type`), not the
`/errors/unknown` sentinel string.

❓ **Q10** - **Type-specific problems (`backup-invalid`, `invalid-plan`): inside the module or left
to the two screens?**

🔎 Facts: both Problems carry `problems: string[]` with the same shape
(`BackupInvalidException.java`, `InvalidPlanException.java` — "Same shape as
`BackupInvalidException`"; `docs/API.md:1420,1469`). The screens read `err.extra.problems` with a
cast (`ProfilePicker.tsx:183–185`, `ResultsPanel.tsx:40`). The explorer adds its own presentation:
an intro sentence and an "Edit" button that focuses the chip that can fix a problem
(`ResultsPanel.tsx:13–15,41–68`), and a calm sentence for `analytics-unavailable`
(`ResultsPanel.tsx:27–38`, wording pinned to `docs/API.md` by its comment).

➡️ Extraction inside the module (`problemList`, for any Problem that carries the member);
presentation stays in the two screens. `ExecutionError` branches on `slug` for
`analytics-unavailable` and on `problemList` for plan problems; `Insights` branches on
`slug === 'not-found'`.

⚖️ Strongest argument against: two consumers could keep their three lines each; the module grows
a field for two callers.

✅ Decision: as recommended — it removes the last reads of `extra` outside the API layer.

❓ **Q11** - **What happens to `ApiError.fieldMessage`?**

🔎 Facts: defined at `client.ts:40–43`; 0 callers (`grep -rn fieldMessage src` → only the
definition). Group G8 lists it as dead code with "candidate 2 decides; coordinate, do not delete
blindly".

➡️ Delete it in the step that adds the module (G3-4). The module's `fields` output replaces it.

⚖️ Strongest argument against: none; it has never been called.

✅ Decision: deleted by this candidate; G8 drops it from its list.

---

## Round 3 — frontier: Q12–Q16

❓ **Q12** - **The four silent failures: what is the default when a mutation fails and the screen
has nowhere to show it?** Options: (a) a toast system; (b) TanStack's global mutation-cache
`onError`; (c) no default — each call site shows its failure next to its control; (d) `alert()`.

🔎 Facts: silent call sites — `Nav.tsx:34–39` (switch profile), `Nav.tsx:97` (log out),
`ProfilePicker.tsx:73–76` (pick a profile), `Categories.tsx:202` (change colour). There is no toast
mechanism. A mutation-cache handler (b) fires for every failed mutation, handled or not, and a
per-call `onError` is not visible to it; there would still be nowhere to show the text. Existing
nearby message areas: Categories' row-error box (`Categories.tsx:306–310`, fed by `onRowError`);
the picker's card-action error below the cards (`ProfilePicker.tsx:318–322`, fed today by delete).
`Nav` has none.

➡️ (c), the smallest honest answer: there is no global default; every `.mutate(` call handles its
failure, and the module makes that one line. The four sites: colour change → Categories'
row-error box; pick → the picker's card-action message area (shared with delete); switch profile
and log out → a new one-line message inside the nav, shown under its controls and announced
(`role="alert"`), cleared when the next switch or logout starts. The switch's select snaps back to
the active profile on its own (it is controlled by the session, `Nav.tsx:69`), so the message
explains why.

⚖️ Strongest argument against: rule (c) is enforced by nothing; the next silent `.mutate(` will
appear the same way these did.

✅ Decision: (c), each fixed test-first. The rule is written in the module's doc comment; the lint
guard in Q16 cannot check `onError`, and building a toast system is out of scope.

❓ **Q13** - **What does each of the 13 files (plus `Nav`) do afterwards?**

🔎 Facts: the sites listed in Q5/Q6/Q12, and where each renders today.

➡️

| File | Calls | Options | Where shown | Visible change |
|---|---|---|---|---|
| `TxnModal` | create / update | `fields`: amount, occurredOn, merchant | as today | a message for an unshown field (description) now reaches the banner |
| `AuthScreen` | login, register | `fields`: displayName, email, password | as today | none in practice |
| `SetPassword` | set password | `fields`: password | as today | none |
| `BudgetForm` (until candidate 5) | create / update | none | form-level banner | "‹field›: ‹message›" instead of "N invalid field(s)." |
| `Budgets` | delete | none | row error | none (fallback already the shared sentence) |
| `Transactions` | delete | none | row error | fallback wording |
| `MerchantBackfill` | apply | none | panel error | validation message visible |
| `Subscriptions` | form save; row actions | none | form banner; row error | field names in the form banner; fallback wording |
| `Categories` | create; rename / move / delete; colour | `withCode` | form box; row error | row errors gain the slug; colour failure shown |
| `ProfilePicker` | pick; rename; delete; create; export; restore | none | card area (pick, delete); rename card; new-profile form; backup area + list | pick failure shown; fallback wording |
| `Nav` | switch profile; log out | none | new message line | both failures shown |
| `SaveControls` | save; pin; delete | `withCode` | under the name field, as today | fallback wording; validation text visible |
| `ExecutionError` | plan run | `withCode` | as today | network-failure sentence becomes the shared one |
| `Insights` | saved-insight query | none (uses `slug`) | as today | none |

Afterwards no screen imports `ApiError`; the only reads of it outside the new module are
`useSession`'s 401 (`hooks/auth.ts:26`) and the client itself.

⚖️ Strongest argument against: `Subscriptions` and `BudgetForm` get an intermediate one-line
version that candidate 5 replaces with field placement.

✅ Decision: as tabled; the two intermediate one-liners are two lines of throwaway, accepted so that
this candidate is complete on its own (Q17).

❓ **Q14** - **Seam discipline and the test seam.**

🔎 Facts: the module is pure (Q2, Q4); nothing varies behind it; screens are tested today at the
hooks-mock seam (`vi.mock('../api/hooks', …)` in 12 of 15 test files) with `onError` invoked by
hand on a constructed `ApiError` (`SetPassword.test.tsx:78–85`, `Categories.test.tsx:128–138`,
`ProfilePicker.test.tsx:117–125`).

➡️ No adapter seam. Test seam: the module's own interface (a table: failure in → messages out) —
one seam for all mapping behaviour. Screens keep the existing hooks-mock seam, and each migrated
screen keeps or gets **one** test that its messages are shown where they belong.

⚖️ Strongest argument against: the highest seam is the screen; testing the mapping at the module
means a screen could list the wrong field and every module test would still pass.

✅ Decision: module table + one placement test per screen that places fields — the placement test
catches a wrong field list.

❓ **Q15** - **The test table, and which screen tests remain, change or are added.**

🔎 Facts: see Q14 prior art; `ProfilePicker.test.tsx:170–187` is the repo's `test.each` precedent;
`Insights.test.tsx:172–181` builds its 404 with `type: '/errors/insight-not-found'`, which is not a
contract slug — every 404 is `/errors/not-found` (`docs/API.md:236–243`,
`backend/exception/ResourceNotFoundException.java:11–13`).

➡️ **Module table** (new test file for the module; each row is one case):
1. `TypeError` (network) → fallback banner; no fields; empty list; slug null.
2. Non-Problem 502 → fallback banner.
3. Non-Problem 413 → "Request failed with status 413.".
4. Problem 409 `category-name-taken` → banner = detail; slug `category-name-taken`.
5. Same with `withCode` → "409 category-name-taken — ‹detail›".
6. `validation-failed`, `amount` violation, `fields` [amount] → field message; empty banner.
7. `validation-failed`, `amount` + `description`, `fields` [amount] → field message; banner
   "description: ‹message›".
8. `validation-failed`, no `fields` → banner "amount: … · currency: …".
9. Two violations on one field → joined with " · " at that field.
10–12. `occurredOnNotInFuture`, `passwordWithinBcryptLimit`, `periodValid` land on `occurredOn`,
   `password`, `periodEnd` when listed.
13. A renamed pseudo-field that is not listed → banner line under the real name.
14. `withCode` with a validation failure and an unplaced line → "400 validation-failed — ‹field›:
   ‹message›".
15. `backup-invalid` with `problems` → banner = detail; `problemList` = the strings.
16. `invalid-plan` with `problems` → `problemList`; slug `invalid-plan`.
17. `analytics-unavailable` → slug; banner = detail.
18. A thrown non-Error value (a string) → fallback banner.

**Screen tests** (all at the existing hooks-mock seam):
- Kept unchanged and still passing: `SetPassword.test.tsx:77–92` (now the placement test for
  `SetPassword`), `Categories.test.tsx:126–143`, `ProfilePicker.test.tsx:116–135`,
  `Insights.test.tsx:183–195`.
- Changed: `Insights.test.tsx:172–181` — fixture type corrected to `/errors/not-found`.
- Added, test-first (each fails before its step): `TxnModal` — a server message for a field the
  form does not show reaches the banner; `AuthScreen` — a `passwordWithinBcryptLimit` violation
  shows under Password; `BudgetForm` — a server field message is visible (assert on the message
  text only, so the test survives candidate 5's move of the message under its field);
  `Subscriptions` — same, text only; `MerchantBackfill` — none (one-line swap, see below);
  `Categories` — a failed colour change shows a message; row errors carry the slug;
  `ProfilePicker` — a failed pick shows a message and does not navigate; a `backup-invalid`
  restore shows the detail and each problem (characterisation: passes before and after);
  `Nav` — a failed switch shows the server's message; a failed log-out shows the fallback;
  `ExecutionError` (new test file, rendered directly) — calm copy for `analytics-unavailable`,
  the list for `invalid-plan`, the coded banner otherwise, the fallback for a network failure
  (characterisation, before the migration).
- Not added: `Budgets`, `Transactions`, `MerchantBackfill`, `SaveControls` — one-line call swaps
  with no logic of their own; their behaviour is the module's table. Said explicitly per the
  CLAUDE.md "trivial" rule.

⚖️ Strongest argument against: characterisation tests for `ExecutionError` and backup restore are
new coverage beyond "replace, don't layer".

✅ Decision: as listed. They are not layered on the module; they pin screen presentation that had
no test (`ExecutionError`'s four branches had none, per the review §2i) before it is edited.

❓ **Q16** - **Is anything needed to stop the leak from coming back?** Options: (a) nothing;
(b) a lint rule restricting `ApiError` imports to the API layer and tests.

🔎 Facts: ESLint is **10.10.0** (`node_modules/eslint/package.json`); its `no-restricted-imports`
accepts `patterns` entries with `regex` and `importNames`
(`node_modules/eslint/lib/rules/no-restricted-imports.js:97–125` schema, `163` "group or regex",
`800–801` regex matching). The backend enforces its structure with ArchUnit, which stays (brief
§6). Tests construct `ApiError` fixtures (`SetPassword.test.tsx:5,80`, `Categories.test.tsx:4,130`,
`ProfilePicker.test.tsx:4,119`, `Insights.test.tsx:4,176,187`).

➡️ (b): one `no-restricted-imports` block for the source tree, excluding the API layer and test
files, restricting the `ApiError` name from the client module, with a message pointing at
`problemMessages`. It is the frontend's small equivalent of an ArchUnit layer rule.

⚖️ Strongest argument against: CLAUDE.md's "no features beyond what was asked"; a lint rule is
extra machinery for a rule reviewers can check by grep.

✅ Decision: (b), as the last step of this candidate. The ask is "screens only say where to show
messages"; without a guard the next screen copies an old pattern and the 13-file problem regrows.
The rule's firing was **not verified** (nothing run); the implementer proves it by importing
`ApiError` in a screen once and seeing lint fail.

---

## Round 4 — frontier: Q17–Q20

❓ **Q17** - **In which order are the 13 files migrated, and how does that interleave with
candidates 3 and 5?**

🔎 Facts: candidate 3 touches only the shell regions of `TxnModal` and `BudgetForm`; candidate 5
rewrites `BudgetForm` (form library removed) and moves the Subscription form's state into
`SubscriptionForm`, and wraps fields in `<form>` in `Categories`, `ProfilePicker` and
`SaveControls`. If candidate 2 ran after 5, 5 would write old-style error mapping into its new code
for 2 to replace; if candidate 2 wrote field placement into `BudgetForm` under the form library,
5 would throw it away.

➡️ G3 order: candidate 3 first (G3-1…3), then this candidate (G3-4…9), then candidate 5
(G3-10…13). Inside this candidate, one file is touched once:
G3-4 module + table + `fieldMessage` deleted + `API.md` sentence;
G3-5 `TxnModal`, `AuthScreen`, `SetPassword`;
G3-6 `Budgets`, `Transactions`, `MerchantBackfill`, `Subscriptions`, `BudgetForm` (one-liners);
G3-7 `Categories`, `ProfilePicker`, `Nav` (with the three silent failures);
G3-8 `SaveControls`, `ExecutionError`, `Insights`;
G3-9 lint guard + `ARCHITECTURE.md` §4 sentence.
Candidate 5 then writes `BudgetForm`'s and `SubscriptionForm`'s error handling with this module and
field placement.

⚖️ Strongest argument against: 5 before 2 would avoid the two one-liners in `BudgetForm` and
`Subscriptions`.

✅ Decision: 3 → 2 → 5. Two lines of throwaway buy a candidate 2 that is complete on its own and
lands the Strong fixes (silent failures, lost messages) before the Worth-exploring form work.

❓ **Q18** - **Which recorded-decision documents change in the same change?**

🔎 Facts: `docs/API.md:193–196` says "dialog" (Q1). The same sentence lists `category-in-use` as
a `422` example, but `backend/exception/CategoryInUseException.java:21` uses `CONFLICT` (409), as
do `docs/API.md:668` and the status summary; "overlapping state" names no rule (overlapping budget
periods are permitted, `docs/API.md:1024–1026`). `ARCHITECTURE.md` §4 (`232–235`) says the
frontend does "presentation and form handling" and mirrors validation "only for UX"; it does not
say where failures become text. `ARCHITECTURE.md` §3 names ArchUnit as the backend's structural
guard (`51–52`).

➡️ `docs/API.md` "Validation failures — 400": replace "highlight a form field or show a dialog"
with "put the message at a form field (a `400` `validation-failed`) or show it as one message for
the whole action (everything else)", and align that sentence's `422` examples with the status
summary (depth limit, category cycle, invalid backup content) — in G3-4. `ARCHITECTURE.md` §4: one sentence saying a failed
request becomes user-facing text in one module in the API layer, and a lint rule keeps `ApiError`
out of screens — in G3-9.

⚖️ Strongest argument against: the `ARCHITECTURE.md` sentence is optional detail for a high-level
document.

✅ Decision: both, each with the code it describes. No ADR (see docs-proposals).

❓ **Q19** - **Edge cases and failure modes.** Concrete scenarios:

🔎 Facts and scenarios:
1. *401 while a form is open* — `client.ts:110–111` emits, `App.tsx:26–28` navigates to `/auth`;
   the form's `onError` also runs and sets a banner that unmounts with the screen. No double
   handling issue.
2. *Backend restarting in production* — nginx 502 without a Problem (`nginx.conf:22–31`) → the
   fallback sentence instead of "Request failed with status 502.".
3. *Upload over 25 MB* — nginx 413 without a Problem → "Request failed with status 413."; an
   upload between 20 and 25 MB → the backend's `backup-too-large` Problem → its detail.
4. *Empty password on register* — two violations on `password` → both shown, joined.
5. *Description over 500 characters in `TxnModal`* — banner "description: size must be between 0
   and 500" (the Bean Validation default text; the exact wording was not run).
6. *An unreachable pseudo-field arrives* (`anyFieldSet`) — banner "anyFieldSet: at least one of …".
7. *A framework Problem with `type` `about:blank`* (a Spring default for exceptions the handler
   does not override; not observed from this UI) — slug is the whole type; plain banner is the
   detail.
8. *A 2xx with a non-JSON body* — `response.json()` throws → fallback sentence.
9. *A string thrown* — fallback sentence.
10. *`SaveControls` pin or delete fails* — the message shows under the name field and marks the
    name input invalid (`SaveControls.tsx:138,156–157`) — pre-existing, out of scope.

➡️ All handled by the rules in Q5–Q10; item 10 recorded as out of scope.

⚖️ Strongest argument against: item 3's wording is unfriendly.

✅ Decision: documented; no extra rules.

❓ **Q20** - **Cross-candidate effects.**

🔎 Facts: G2 card (candidate 4) asks this candidate what to assume about pseudo-fields; G4 card
(candidate 8) moves new tests toward an `msw` network seam; G7 card (candidate 15) makes the
generated types accurate; G8 card (candidate 17) lists `ApiError.fieldMessage`.

➡️
- **Candidate 4 (G2):** the module works either way; if cross-field violations move to the real
  field, delete the three-entry table and its three test rows — nothing else changes.
- **Candidate 8 (G4):** new screen tests in files that already mock the hooks module use that seam
  (a test inside such a file cannot use the network seam without un-mocking the file); the
  module's own tests are pure. Candidate 8's future network-seam tests of `client.ts` cover how an
  `ApiError` is built; this module starts from an `ApiError`. No overlap.
- **Candidate 15 (G7):** the Problem shape is not in the generated schema; the module's input
  stays the hand-written `ApiError`. Unaffected.
- **Candidate 17 (G8):** `ApiError.fieldMessage` is deleted here.
- **Candidate 3:** disjoint regions of `TxnModal`/`BudgetForm`; lands first.
- **Candidate 5:** uses `fields` for field placement in its rewritten `BudgetForm` and
  `SubscriptionForm`; lands after this one.

⚖️ Strongest argument against: none.

✅ Decision: recorded in the spec.

**Frontier after Round 4: empty.**

---

## Decisions (one page)

1. **One pure function in the API layer**, `problemMessages(failure, { fields, withCode })`,
   returning `banner`, `fields`, `problemList`, `slug`. No hook. In-process; no adapter seam.
2. **Placement:** a violation goes to its field when the screen lists it (several joined with
   " · "); otherwise it becomes a banner line "‹field›: ‹message›". No server message is ever
   dropped; "N invalid field(s)" is never shown alone.
3. **Pseudo-fields:** a three-entry table (`occurredOnNotInFuture` → `occurredOn`,
   `passwordWithinBcryptLimit` → `password`, `periodValid` → `periodEnd`); deleted if G2 reports on
   the real field.
4. **Banner formats:** two, both owned by the module — plain `detail` (default) and
   `status slug — detail` (`withCode`) for all of Categories and the Insights explorer. The e2e
   assertion stays.
5. **Fallback:** one sentence, "Something went wrong — is the backend running?", for non-`ApiError`
   failures and non-Problem responses with status ≥ 500; non-Problem 4xx keeps "Request failed with
   status N.". The nine "Could not …" variants go.
6. **Type-specific:** `problemList` extracted by the module; `ExecutionError` and `Insights` branch
   on `slug` / `problemList` for their own copy.
7. **`ApiError.fieldMessage` deleted.**
8. **Silent failures:** no global default; colour change → row error, pick → picker card area,
   switch profile and log out → a new message line in the nav. Each test-first.
9. **Tests:** an 18-row module table; one placement test per field-placing screen; characterisation
   tests for `ExecutionError` and backup restore; the Insights 404 fixture corrected to
   `/errors/not-found`.
10. **Guard + docs:** a `no-restricted-imports` rule keeps `ApiError` inside the API layer and tests;
    `API.md` "dialog" sentence amended (G3-4); one `ARCHITECTURE.md` §4 sentence (G3-9).
11. **Order:** after candidate 3, before candidate 5; G3-4 … G3-9, each file touched once.
12. **Unverified:** the dev proxy's status when the backend is down; exact Bean Validation message
    texts; that the lint pattern fires (schema verified, not run); the `TxnModal` lost-message bug
    (read from code).
