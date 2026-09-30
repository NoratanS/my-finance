# Architecture pass — specs

Fifteen specs from the architecture review of 2026-09-29 (branch `dev`, tree of `4545810`).

Each spec came out of a grill-with-docs session run by an Opus agent: the design tree was worked
to an empty frontier, facts were looked up in the code and in the library sources, and the
recommended answer stood in for the owner's at every decision. The spec was then written with the
to-spec template.

**Nothing is implemented, and nothing was built or run while writing these.** Every spec ends with
a list of what was read from code or library sources, what was inferred, and what is unchecked.

## Layout

| Path | What it is |
|---|---|
| `<NN-slug>/spec.md` | The spec. `Status: ready-for-agent`. |
| `<NN-slug>/grilling.md` | The design tree: every question, the facts with `file:line`, the recommendation, the strongest argument against it, the decision. |
| `<NN-slug>/docs-proposals.md` | Exact edits to `ARCHITECTURE.md`, `docs/API.md`, `docs/SCHEMA.md`, `docs/INSIGHTS.md` and the READMEs, to be made in the same change as the code. |
| `architecture-review-2026-09-29.html` | The review the candidate numbers refer to. |
| `/CONTEXT.md` (repository root) | The glossary the specs use, merged from every session's proposals. |

Numbers are the review's candidate numbers. 12 and 16 were not specified (see the end); 17 is
housekeeping.

There are **no ADRs**. Several decisions met the bar, but each amends something already recorded
in `ARCHITECTURE.md`, `docs/API.md`, `docs/SCHEMA.md` or `docs/INSIGHTS.md`. Those documents are
this repository's recorded decisions, so the specs update them in place rather than create a
second source of truth.

## The specs

| # | Spec | Strength | Area | Steps | Lands after |
|---|---|---|---|---|---|
| 01 | [Give the active profile one home](01-active-profile-scope/spec.md) | Strong | backend | 4 | — |
| 02 | [One module turns a Problem into messages](02-problem-messages/spec.md) | Strong | frontend | 6 | 03 |
| 03 | [One dialog module](03-dialog-module/spec.md) | Strong | frontend | 3 | — |
| 04 | [One home per value rule](04-value-rules/spec.md) | Worth exploring | backend | 6 | 15 steps 1–2 (recommended) |
| 05 | [One form idiom, one money input](05-form-idiom-money-input/spec.md) | Worth exploring | frontend | 4 | 03, 02 |
| 06 | [Every sign-in rule behind the sign-in module](06-sign-in-module/spec.md) | Worth exploring | backend | 3 | 01 |
| 07 | [One stack definition](07-stack-definition/spec.md) | Worth exploring | deploy | 2 | 13 |
| 08 | [Move the test seam to the network](08-network-test-seam/spec.md) | Worth exploring | frontend tests | 4 | — |
| 09 | [Tighten the plan executor's internal seams](09-plan-executor-seams/spec.md) | Worth exploring | plan executor | 6 | 17 step 4; 10 steps 1–2 before its step 5 |
| 10 | [One faithful double for the plan executor](10-plan-executor-double/spec.md) | Worth exploring | backend tests, plan executor | 4 | 17 step 5 |
| 11 | [Bind the Transaction filter once](11-transaction-filter/spec.md) | Worth exploring | backend | 4 | 15 step 1 (recommended) |
| 13 | [Sessions move into the Postgres already there](13-session-store-postgres/spec.md) | Strong | backend, deploy | 2 | — |
| 14 | [Build `TransactionResponse` with a `from()` factory](14-mapstruct-to-from/spec.md) | Strong | backend | 1 | 15 step 1 (recommended) |
| 15 | [Make the OpenAPI document the checked wire contract](15-openapi-wire-contract/spec.md) | Strong | backend, frontend | 6 | — |
| 17 | [Housekeeping](17-housekeeping/spec.md) | Strong | all | 13 | see its header |

Step counts are each spec's own ordered steps, without a closing step that only adds the lessons entry.

## Recommended order

Only four orderings are hard: 15 step 3 before 15 step 4; 03 before 02 before 05; 01 before 06;
13 before 07. Everything else is a recommendation that keeps reviews small and rebases trivial.

**First — guards and small wins.** None depends on anything.

1. **15 step 1** — commit the OpenAPI document, regenerate the stale frontend types, add the drift
   check to CI. Every later backend refactor then has an automatic proof that the wire contract
   did not move.
2. **14** — one commit. After 15 step 1, the document proves the JSON is unchanged.
3. **08 steps 1–2** — the `msw` harness, the client module's tests, the lint guard.
4. **09 step 1** — three golden cases through `execute`; no code change.
5. **17 steps 1–8 and 11** — tooling, dead code, stale text, the time-zone documentation, the
   end-to-end support module. Step 4 before 09's later steps, step 5 before 10, step 6 before 05.
6. **03** — the dialog module (G3-1 to G3-3).

**Then — the backend core.**

7. **01** — the active profile. The review's top recommendation: it is where the project's one
   security rule lives.
8. **06** — the sign-in module.
9. **15 step 2**, then **04** and **11**.
10. **13**, then **07**.
11. **10 steps 1–2**, then **09 steps 2–6**, then **10 steps 3–4**.

**Last — the frontend, and the rest of the contract.**

12. **02** (G3-4 to G3-9), **17 step 12**, then **05** (G3-10 to G3-13), then **17 step 13**.
13. **17 steps 9–10** — the two frontend defects, on the network seam.
14. **15 steps 3–6** and **08 steps 3–4**.

## Deliberate changes to observable behaviour

Everything not listed here is specified to stay exactly as it is.

| Spec | Change |
|---|---|
| 01 | A session whose active profile was deleted from another session gets `409 no-active-profile` on every profile-scoped endpoint, and lands on the profile picker. Today the answer depends on the endpoint: an empty list, a `404` that blames a Category, or a generic `409 conflict`. |
| 02 | A message for a field the screen does not show appears in the banner instead of being dropped. The four failures that showed nothing now show a message. One fallback sentence replaces the nine "Could not …" variants. |
| 03 | The Budget dialog keeps Tab inside and returns focus to the button that opened it. |
| 04 | `PATCH /api/categories/{id}` reports a bad colour as field `color`, not `colorValid`. `CreateBudgetRequest` and `UpdateBudgetRequest` become one `BudgetRequest` in the OpenAPI document and the generated types. |
| 05 | A comma is accepted as the decimal separator in every amount field, a Budget's included. Enter submits in every form. |
| 07 | Development needs Docker Compose 2.27 or newer. An explicitly empty `ANALYTICS_TOKEN` stops the development stack instead of falling back to the development token. |
| 09 | A row whose bucket is missing from the time axis fails the execution instead of being drawn as zero. |
| 11 | A list request that breaks a paging rule and a filter rule at once reports the paging message. Status and Problem type are the same. |
| 13 | Everyone signs in once after the upgrade (in sign-in mode `none`: picks their profile once). The read-only database role is denied the session tables. |
| 15 | `/v3/api-docs.yaml` is reachable like the JSON. The document marks the fields of success responses as required. |
| 17 | Three defects are fixed (below). JaCoCo and the frontend coverage tooling are removed. |

## Decisions made when the specs were cross-checked

The sessions ran in parallel, so a few specs disagreed. Each affected spec carries the resolution
at the end of its Further Notes.

| Disagreement | Resolution |
|---|---|
| **Which seam new screen tests use.** 08 says a new test of a server-reaching module uses the network seam and converts a hook-mocked file. 02 and 05 add their new screen tests on the existing hook-mocked seam. | 02 and 05 keep the existing seam, so each stays complete on its own. 08's conversion rule applies to tests added after both have landed. |
| **When the create-profile currency options are fixed.** 17 prefers after 05; 05 wants it before its last step, which wraps that block in a form. | 17 step 12 lands before G3-13. |
| **How the generated types are regenerated.** 04 says from a running backend; 15 step 1 makes that unnecessary. | 04's wording holds only until 15 step 1 lands; after that the procedure is 15's. |
| **Whether typed fixtures wait for the OpenAPI work.** 15 places 08's fixtures after its step 5; 08 declares no dependency. | No dependency: 08 types its answers against the wire types module, which already holds complete response types. |
| **Pseudo-fields.** 04 lists five names; 02's table has three. | 02's three are the ones a screen can trigger. Any other name goes to the banner. `colorValid` disappears with 04 step 4. |

## Where the specs overrule the review

| Spec | The review said | The spec decided, and why |
|---|---|---|
| 01 | Answer `404` when the active profile was deleted elsewhere. | `409 no-active-profile`: the request did not name the profile, and the only useful next step is the profile picker, which the frontend already shows for that answer. |
| 01 | Absorb the four copies of `requireCategory`. | They stay. Every way of sharing them — a method reference, a generic base repository, a dependency between two classes of the same package — was cleverer or more coupled than the one-line duplicate it removed, and none added safety. |
| 03 | The native `<dialog>` element might be simpler. | A React module: the installed jsdom implements no `showModal()`, so every behaviour test would run against a stub. Revisit when jsdom does. |
| 06 | A seam with one adapter per sign-in mode might be justified. | Three conditionals in one class. What varies is three booleans. |
| 10 | Some backend test might run the real plan executor. | None does. The recorded exchanges are proved by the Python suite instead, and the end-to-end job stays the only run of the real pair. |
| 17 | Remove twelve unused CSS classes. | They stay: that stylesheet is a deliberately frozen copy of the design system. |
| 17 | Trimming `uvicorn[standard]` is optional housekeeping. | It stays: without the extras the process changes HTTP parser and event loop, which is a behaviour change. |
| 17 | Make both sides honour `TZ`. | Documentation only. There are three clocks, not two, and changing the backend's moves the charge job. Recorded as an open question with a trigger. |

## Defects found along the way

None was reproduced; each was read from code. The owning spec fixes it test-first.

| Defect | Owner |
|---|---|
| A pinned Insight with no matching transactions draws empty axes instead of saying that nothing matched. | 17 step 9 |
| A saved plan that omits `filters`, `groupBy` or `interval` blanks the whole dashboard. No error boundary exists anywhere. Reachable only through a hand-crafted request. | 17 step 10 |
| A currency code ending in a newline passes the plan executor's validation and then blanks the page when it is formatted. | 17 step 4 |
| "12,50" saves as a Transaction or a Subscription and is rejected as a Budget. | 05, G3-11 |
| The Transaction form silently drops a server message for the description field. | 02, G3-5 |
| A Budget ending in year 10000 exports but will not restore; restore skips the not-in-the-future rule. | 17, recorded as unverified |
| Adopted naively, `msw` could let a unit test reach a running instance on `localhost:3000`. | 08 step 1 designs this out |
| `docs/API.md` lists `category-in-use` as a `422`; the backend answers `409`. | 02, G3-4 |
| Eleven endpoints are documented as `200` in the OpenAPI document but answer `201` or `204`. | recorded in 15 as out of scope |
| The commit that fixed the HTTP/2 upgrade bug names the wrong HTTP parser. | 17 step 5 corrects the comment |

## How facts were checked

Read-only throughout. Library behaviour was read from the jars and packages installed on this
machine (`~/.m2`, `frontend/node_modules`, `analytics/.venv`), with two exceptions: Spring
Session's JDBC jars were not cached locally and were read from Maven Central (spec 13), and the
behaviour of the Docker Compose version on the CI runner was reasoned from its source, because only
a newer Compose could be run locally (spec 07). Spec 07's checks used `docker compose config`,
which starts nothing. No test, build or container was run for any spec.

## Not specified

| # | Candidate | Why |
|---|---|---|
| 12 | One in-process Category tree | Rated Speculative; it contradicts `docs/SCHEMA.md`'s recorded hierarchy queries. |
| 16 | Fold the plan executor into the backend | Rated Speculative; it would void specs 09 and 10. The plan executor stays a separate Python process. |

## Next

The repository has not been configured for the engineering skills: there is no
`docs/agents/issue-tracker.md`. Run `/setup-matt-pocock-skills` and choose local markdown, which is
this layout. `/to-tickets` then turns a spec into `<NN-slug>/issues/NN-<slug>.md`.
