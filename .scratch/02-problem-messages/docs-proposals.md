# Docs proposals — candidate 2: One module turns a Problem into messages

## (a) Proposed glossary terms

These sharpen the seed term **Problem** (an RFC 9457 problem detail). They are wire-contract
vocabulary that the backend, `docs/API.md` and the frontend all use, not implementation details.

**Problem type**:
The stable, machine-readable slug that names what kind of failure a Problem is
(`category-name-taken`, `not-found`, `validation-failed`), fixed per failure kind by the backend.
It is the only part of a Problem a client may branch on; the `detail` is prose and may change.
_Avoid_: error code, error slug, error type

**Field violation**:
One entry of a `validation-failed` Problem: the name of a request field and a human-readable
message saying which rule that field broke. The backend calls it `FieldViolation`.
_Avoid_: field error, validation error, field message (a field message is what a screen shows)

**Pseudo-field**:
The field name a cross-field rule reports its field violation under — the name of the validating
rule, not a field of the request (`periodValid`, `occurredOnNotInFuture`,
`passwordWithinBcryptLimit`).
_Avoid_: virtual field, cross-field name, method field

**Problem list**:
The list of human-readable strings that a `backup-invalid` or `invalid-plan` Problem carries, each
pinpointing one bad backup entry or one bad Plan field.
_Avoid_: problems (on its own — ambiguous with Problem), errors, details

## (b) Proposed ADRs

None. Checked against the three criteria:

- *One module maps every failure to text, and screens may not import `ApiError`* — hard to
  reverse: no (screens call one function; the lint rule is one block); surprising without
  context: no; real trade-off: mild. One of three.
- *Two banner presentations — plain everywhere, "status type — detail" on Categories and the
  Insights explorer* — hard to reverse: no (one option per call site plus one e2e text);
  surprising: somewhat; real trade-off: yes (consistency against keeping deliberate presentation).
  Two of three.
- *A frontend table of three backend pseudo-field names* — hard to reverse: no; surprising:
  somewhat; trade-off: yes, and backend candidate 4 may remove it. Two of three.

None meets all three. The reasons live in the module's doc comment and in the spec.

## (c) Required updates to recorded-decision documents

### 1. `docs/API.md` → "Errors" → "Validation failures — `400`" — the closing paragraph (lines 193–196)

**Today:**

> `400` for a malformed or invalid body; **`422`** is reserved for a body that is structurally
> valid but violates a domain rule (depth limit, overlapping state, category-in-use). The split is
> worth keeping consistent — it tells the frontend whether to highlight a form field or show a
> dialog.

Two contradictions with the code:

- The frontend never shows a dialog for a `422`: every `422` (depth, cycle, backup-invalid) is shown
  as an inline message where the action happened.
- `category-in-use` is a **`409`**, not a `422`: `CategoryInUseException` uses `CONFLICT`, and this
  same document says `409` in the `DELETE /api/categories/{id}` table and in the "Status code
  summary". "Overlapping state" names no existing rule — overlapping budget periods are permitted,
  as the Budgets section says.

**After (proposed wording):**

> `400` for a malformed or invalid body; **`422`** is reserved for a body that is structurally
> valid but violates a domain rule (depth limit, category cycle, invalid backup content). The split
> is worth keeping consistent — a `400` `validation-failed` tells the frontend which form fields to
> put messages under; every other failure is shown as one message for the whole action, next to the
> control that triggered it.

Lands with the module, in step G3-4.

### 2. `ARCHITECTURE.md` → §4 "Frontend" — after the paragraph ending "…never as the source of truth."

**Add one sentence:**

> A failed request becomes user-facing text in one module in the API layer, next to the client
> that parses the Problem: validation messages go under the fields a screen shows, everything else
> is one message where the action happened, and a lint rule keeps screens from reading the error
> object directly — the frontend's small counterpart to the backend's ArchUnit rules.

Lands with the lint guard, in step G3-9.

### Not changed

- `docs/API.md` "Errors" base shape, the `validation-failed` example, and the pseudo-field sentence
  (lines 189–191) stay as they are. If backend candidate 4 reports cross-field violations on the
  real field, that candidate updates the pseudo-field sentence; this candidate then deletes its
  three-entry table (see the spec).
- `docs/SCHEMA.md`, `docs/INSIGHTS.md` — no error presentation in them.

### Not a recorded-decision document

The git-ignored `docs/LESSONS.md` gets one entry (a wire-contract boundary on the frontend, kept
by a lint rule), referencing the existing entry on `aria-describedby` and `role="alert"` rather
than repeating it.
