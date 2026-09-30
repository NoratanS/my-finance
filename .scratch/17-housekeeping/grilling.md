# Candidate 17 — Housekeeping: grilling log

Evidence pack: `cards/G8-housekeeping.md` (items A–F). Sweep sections read: frontend review §2f, §2j,
§4, §5, §6; insights review Q5, Q6, §4, §5, §6.

Repository `/home/chris/side-projects/my-finance`, branch `dev`, HEAD `c3e20c5`. That commit is a
`-s ours` merge whose tree equals `4545810` (`git diff --stat 4545810 c3e20c5` prints nothing), so
the brief's line numbers hold. All paths below are relative to the repository root unless absolute.

**Method.** Read-only throughout. Nothing was executed: no build, no test, no container, no Python
or Node interpreter. Every behavioural claim is from reading code. Where a claim rests on the
documented contract of a compiled or external component (llhttp inside the httptools `.so`,
ECMA-402, React, Docker, Maven, Python's `re`), it says so and is listed under "not verified" in the
spec.

**Search tool.** In this shell `grep` is a function that runs ugrep with `--ignore-files`, so it
honours `.gitignore` and would hide ignored residue. Every "0 callers" claim below therefore uses
`git grep` over tracked files (the tree is clean, so that equals HEAD). Untracked residue uses
`find`, `ls` and `command grep` (GNU grep 3.11).

**Labels.** Items keep the pack's labels: A1 JaCoCo, A2 frontend coverage, A3 `uvicorn[standard]`,
B1 `envelopes.py`, B2 `sumAmounts`, B3 `ApiError.fieldMessage`, B4 `useProfiles`, B5
`AnalyticsClient.post(path, …)`, B6 the 12 CSS classes, C1 Grafana directories, C2 stale bytecode,
D1–D5 stale text, E1–E4 possible bugs, E5 the `$` regex, F1–F5 duplication. Findings not in the
pack are X1–X8 (Q24).

---

## Round 1 — Is each claim true?

Frontier: every verification question. None depends on another's answer.

---

❓ **Q1** - **A1: does anything consume the JaCoCo report?** Options: (a) nothing does — removable;
(b) something reads it (CI, a threshold, a doc, a script).

🔎 Facts:
- `backend/pom.xml:158-173` declares `jacoco-maven-plugin` 0.8.15 with `prepare-agent` (default
  phase) and `report` bound to `verify`.
- `command grep -n -i -E 'argLine|surefire|failsafe' backend/pom.xml` → exit 1. No surefire
  `argLine` refers to `@{argLine}`, so nothing else in the build depends on `prepare-agent` having run.
- `git grep -n -i jacoco` → `backend/pom.xml:159-160` plus historical documents only:
  `docs/superpowers/plans/2026-09-07-maintenance-run.md:708,719,720,741,746,762,1833` and
  `docs/superpowers/specs/2026-09-07-maintenance-run-design.md:138,207`.
- CI: `.github/workflows/ci.yml:19` runs `./mvnw -B verify`; the file (`:1-75`) has no
  artifact-upload or coverage step. Release: `.github/workflows/release.yml:39` builds the image;
  `backend/Dockerfile:12` runs `-DskipTests package`, so JaCoCo never runs there.
- The report lands under `target/`, which `backend/.gitignore:2` ignores.
- The maintenance plan recorded the one-time baseline: "356 tests, 98.3% instruction coverage"
  (`maintenance-run.md:1833`), and its design spec gave the reason: "Coverage becomes visible rather
  than assumed" (`maintenance-run-design.md:138`).
- Owner history: `/home/chris/.claude/projects/-home-chris-side-projects-my-finance/memory/cleanup-2026-09-22.md`
  records under **Kept**: "all tooling (Storybook, ArchUnit, MapStruct, JaCoCo, Testcontainers)" and
  "tooling may stay". The brief's settled list (§6) protects "Storybook, ArchUnit, Testcontainers and
  Flyway" and omits JaCoCo. MapStruct, kept on the same day, is being replaced by candidate 14.

➡️ True: no consumer. The report is produced on every `verify` and read by nothing.

⚖️ Strongest argument against: the owner kept JaCoCo by name a week ago, so "nothing reads it" might
be a deliberate choice to have it available rather than an oversight.

✅ Decision: the claim stands (verified). Whether to remove it is Q26.

---

❓ **Q2** - **A2: does anything consume the frontend coverage report?** Options as Q1.

🔎 Facts:
- `frontend/package.json:16` script `"coverage": "vitest run --coverage"`; `:42` devDependency
  `@vitest/coverage-v8`; `frontend/vitest.config.ts:12` holds the `coverage` block
  (`provider: 'v8', reporter: ['text', 'lcov']`).
- CI runs `npm test` (`vitest run`), never the coverage script (`ci.yml:31`).
- `git grep -n -i coverage -- ':!frontend/package-lock.json'` → only `package.json:16,42`,
  `vitest.config.ts:12` and historical plan/spec lines.
- `git grep -n -i -E 'lcov|codecov|sonar|coveralls' -- ':!frontend/package-lock.json'` → only
  `vitest.config.ts:12` and the historical plan (`maintenance-run.md:175`).
- `frontend/coverage/` does not exist (`ls` → no such file) and no ignore file lists it (root
  `.gitignore`, `frontend/.prettierignore`, `frontend/eslint.config.js:8`).
- Lockfile: `package-lock.json:31` (root devDependency) and `:3641` (the package, with its own
  dependencies `@bcoe/v8-coverage`, `@vitest/istanbul-lib-*`, `ast-v8-to-istanbul`, `magicast`, …).
  `:7538` and `:7566` are vitest's own optional-peer metadata and stay after an uninstall.

➡️ True: no consumer.

⚖️ Strongest argument against: the script costs nothing when not run, and a contributor may run it
by hand.

✅ Decision: verified. Removal is Q27.

---

❓ **Q3** - **A3: which HTTP implementation does uvicorn use with and without the `[standard]` extras,
and does that matter for the HTTP/1.1 pin of commit `eafc8f8`?**

🔎 Facts (all from the installed package, `analytics/.venv/lib/python3.12/site-packages/`):
- Versions: uvicorn 0.52.4, httptools 0.8.0, h11 0.16.0, uvloop 0.22.1, websockets 17.1,
  watchfiles 1.2.0, python-dotenv 1.2.3, pyyaml 6.0.3. The uvicorn METADATA's `standard` extra is
  exactly: httptools, python-dotenv, pyyaml, uvloop (not on win32/cygwin/PyPy), watchfiles, websockets.
- `uvicorn/config.py:52-57` maps `"auto"` to `uvicorn.protocols.http.auto:AutoHTTPProtocol`;
  `config.py:200` defaults `http="auto"`.
- `uvicorn/protocols/http/auto.py:6-15`: if `import httptools` succeeds, `AutoHTTPProtocol` is
  `HttpToolsProtocol`; otherwise `H11Protocol`.
- `analytics/Dockerfile:36` starts `uvicorn analytics.main:app --host 0.0.0.0 --port 8000` with no
  `--http`, so the container uses `auto`.
- `analytics/pyproject.toml:11` has `uvicorn[standard]>=0.30`. It has been there since the service's
  first commit `97120f4` (2026-09-05). `git show <rev>:analytics/uv.lock` gives the same versions at
  `eafc8f8` and at HEAD: uvicorn 0.52.4, httptools 0.8.0, h11 0.16.0, uvloop 0.22.1.
- **So the process `eafc8f8` observed ran `HttpToolsProtocol`, not h11.** Yet the commit message
  ("uvicorn's h11 parser rejects it outright") and the code comment at
  `backend/src/main/java/com/myfinance/backend/service/AnalyticsClient.java:45-50` ("uvicorn's h11
  protocol implementation rejects outright") both name h11. `docs/LESSONS.md:1019-1045` (git-ignored,
  the owner's file) repeats it.
- How each implementation treats a non-WebSocket upgrade, in this version:
  - Both accept only `websocket` upgrades (`h11_impl.py:164-170`, `httptools_impl.py:166-168`) and
    log "Unsupported upgrade request." otherwise.
  - h11: the request is still served (`h11_impl.py:178-284`), and h11 drops the pending switch
    proposal on any non-101 response, returning the client to `DONE` (`h11/_state.py:289-290`,
    `:339-340`). By this code, h11 would answer an h2c-upgrade POST normally.
  - httptools: `httptools/parser/parser.pyx:353-362` makes `on_headers_complete` return `1` whenever
    llhttp's upgrade flag is set, and `parser.pyx:233-246` resumes the parser and raises
    `HttpParserUpgrade(offset)`. uvicorn only logs a warning (`httptools_impl.py:180-184`) and never
    feeds the bytes after that offset back. Under llhttp's documented callback contract (`1` = "the
    message has no body"), the request body is not delivered. That contract lives in the compiled
    `.so` and was **not verified by execution**. It is consistent with the symptoms `eafc8f8` records
    ("Invalid HTTP request received", "not JSON"), but it is inference.
- `AnalyticsClient.java:51-54` pins `HttpClient.Version.HTTP_1_1`, so the backend sends no upgrade.
  Whichever implementation answers sees plain HTTP/1.1.
- Dropping the extras would change more than the parser: uvloop → asyncio's loop for every request,
  and no watchfiles for the README's documented `--reload` dev command (`README.md:136`), which
  would fall back to polling.

➡️ With the extras: httptools. Without: h11. The HTTP/1.1 pin does not depend on either, because no
upgrade is sent. But removing the extras changes which parser and which event loop answer every
backend request. By the pack's own rule, that is a behaviour change, not housekeeping.

⚖️ Strongest argument against: by this code h11 is the *more* tolerant implementation for the one
failure mode on record, and nothing needs uvloop's speed at this scale. Dropping the extras would
lose nothing a user can see.

✅ Decision: facts settled. Keep-or-drop is Q28. The misattribution to h11 is a stale-text finding
(X7).

---

❓ **Q4** - **B1: is `analytics/tests/envelopes.py` imported by anything?**

🔎 Facts:
- `wc -l` → 102 lines. It defines `VALUE_ENVELOPE`, `TIMESERIES_ENVELOPE`, `BREAKDOWN_ENVELOPE`,
  `SPLIT_ENVELOPE`, `ALL_ENVELOPES` (`envelopes.py:8,21,44,66,102`).
- `git grep -n -E 'from (tests\.|\.)?envelopes|import envelopes'` → only its own docstring
  (`envelopes.py:5`).
- `git grep -n -E '\b(VALUE|TIMESERIES|BREAKDOWN|SPLIT|ALL)_ENVELOPES?\b'`, excluding the file itself
  → no hits.
- `git grep -n -w envelopes -- analytics` → the file's own docstring, plus unrelated prose in
  `analytics/tests/fixtures/seed.sql:2` and `test_executor_golden.py:1,4`.
- Before the cleanup (`git grep … 3d00643`, tag `pre-cleanup`) its importers were
  `test_llm_narrate.py:10`, `test_llm_narrate_facts.py:9`, `test_llm_narrate_route.py:11` and
  `test_llm_narration_local.py:30`. All four were deleted in `010af93`, which also rewrote the
  file's docstring ("the narration tests" → "tests") but kept the file.
- Not a test module (no `test_` prefix), so pytest never collects it. mypy checks only
  `src/analytics` (`pyproject.toml:53`).

➡️ True: dead since `010af93`.

⚖️ Strongest argument against: `010af93` edited it rather than deleting it, which could mean it was
kept on purpose as canonical per-shape fixtures.

✅ Decision: verified dead. No test asserts these envelopes, so they are not "exchanges the Python
suite asserts" (the phrase candidate 10 will rely on). Removal is Q29.

---

❓ **Q5** - **B2: is `sumAmounts` called?**

🔎 Facts: `git grep -n sumAmounts` → `frontend/src/lib/money.ts:140` (the definition) only. The body
is `money.ts:140-142`, the docblock `:136-139`. No test references it.

➡️ True: 0 callers.

⚖️ Strongest argument against: the module header (`money.ts:3-6`) sanctions display-side aggregation,
so `sumAmounts` is the kind of helper that module is for.

✅ Decision: verified dead. Removal is Q29.

---

❓ **Q6** - **B3: is `ApiError.fieldMessage` called?**

🔎 Facts: `git grep -n fieldMessage` → `frontend/src/api/client.ts:41` (the definition) only
(`:40-43` with its docblock).

➡️ True: 0 callers. The pack assigns its fate to candidate 2 (one module turns a Problem into
messages), which may either use it or delete it.

⚖️ Strongest argument against: none. Deleting it here could collide with candidate 2's design.

✅ Decision: verified, then **handed over to candidate 2**. Not designed here.

---

❓ **Q7** - **B4: is `useProfiles` used, and what happens to its query key?**

🔎 Facts:
- `git grep -n -w useProfiles` → `frontend/src/api/hooks/profiles.ts:15` (the definition) only.
- `git grep -n "'profiles'" -- frontend` → `profiles.ts:17` (its key) and four invalidations at
  `:28` (create), `:51` (rename), `:72` (delete), `:111` (restore). No other query key starts with
  `'profiles'`, so with the hook gone all four invalidations become no-ops. TanStack matches
  invalidation keys by prefix, so a longer key would still count, but none exists.
- No test references the key. `hooks.invalidation.test.tsx` asserts only
  `['insight-result', 1, 7]` (`:43`, `:53`).
- The profile list the UI renders is `SessionResponse.profiles`, which the same mutations patch with
  `setQueryData(sessionKey, …)` (`profiles.ts:29-40`, `:52-61`, `:73-81`, `:112-114`).
- `useQuery` is imported at `profiles.ts:1` and used only by `useProfiles` (`:16`), so deleting the
  hook orphans that import.

➡️ True: the hook and all four invalidations of its key are dead.

⚖️ Strongest argument against: a future profile-management screen might want `GET /api/profiles`.
But the endpoint stays in the backend. Only the unused client hook goes.

✅ Decision: verified. Removal is Q29.

---

❓ **Q8** - **B5: does `AnalyticsClient.post(String path, String body)` need its `path` parameter?**

🔎 Facts:
- `AnalyticsClient.java:83` defines `private ResponseEntity<String> post(String path, String body)`.
  The only call is `:72`, `post("/internal/v1/execute", …)`. `path` is otherwise used only in the log
  line at `:95`. `:77` already hard-codes the path in its own log line.
- At `3d00643` (pre-cleanup) there were three callers: `:76` (execute), `:98` (`/internal/v1/narrate`),
  `:118` (`/internal/v1/interpret`).
- Outside the class, `InsightService.java:95` is the only production caller, through `execute`.
  `AnalyticsClientTest` builds the client directly (`:84`, `:153`, `:176`, `:190`) and serves only
  `/internal/v1/execute` (`:51`). No test asserts log text.

➡️ True: the parameter is left over from the removed endpoints.

⚖️ Strongest argument against: a private method with an unused degree of freedom costs nothing, and
the next internal endpoint would bring it back.

✅ Decision: verified. The change is Q29.

---

❓ **Q9** - **B6: are the 12 CSS classes unused, and is `frontend/src/styles.css` meant to stay a
faithful copy of the design system?**

🔎 Facts:
- For each of `card, card-body, card-kicker, card-meta, card-title, duotone, elev-sm, elev-md,
  elev-lg, hr, radio, seg-opt`, a `git grep` for the class as a whole token in `className`/`class`
  strings across `frontend/src/**/*.{ts,tsx}` → 0 hits. Each is defined in `frontend/src/styles.css`
  (1–6 rules). `Card` renders `blueprint` (`components/Card.tsx:27`). `card-grid` and `profile-card`
  are different classes. `.seg-opt` is used three times in the mockup
  `docs/design/My Finance UI.dc.html`.
- `diff docs/design/styles.css frontend/src/styles.css` → an 11-line diff. The only difference is
  the Google Fonts `@import`, commented out in the frontend copy.
- The rule that the file is frozen is recorded in several places:
  - `docs/design/insights-explorer.md:8-13`: "`frontend/src/styles.css` carries the same tokens as
    `docs/design/styles.css`; the two differ only in the Google Fonts `@import` … New component
    classes go in `app.css`, never in `styles.css`."
  - `docs/superpowers/specs/2026-09-07-maintenance-run-design.md:235-240`: "`frontend/src/styles.css`
    is not to be modified. It is the design-system file … must also never be re-synced from
    `docs/design/styles.css`."
  - `docs/superpowers/plans/2026-09-07-maintenance-run.md:24` says the same.
  - Prettier ignores the file (`frontend/.prettierignore:6`), which `README.md:228` documents.
  - `ARCHITECTURE.md:229` and `:253` make `docs/design/styles.css` the authoritative source of the
    design tokens.

➡️ The classes are unused, but the file is a deliberately frozen copy of the design-system
stylesheet. Deleting rules from it breaks that recorded convention.

⚖️ Strongest argument against: dead CSS still ships to every browser and misleads a reader who greps
for a class.

✅ Decision: claim true, recommendation wrong. **B6 is dropped** and reported as a correction.

---

❓ **Q10** - **C1: what is left under `deploy/observability`?**

🔎 Facts:
- `find deploy/observability -exec ls -ld {} \;` → four directories: `deploy/observability`,
  `…/grafana`, `…/grafana/provisioning`, `…/grafana/dashboards`. All are `root:root`, dated
  2026-09-22 21:49, and hold no files.
- `deploy/` itself is owned by `chris`. Git does not track empty directories, so `git status` shows
  nothing. `git grep -n observability -- ':!docs/superpowers'` → no references.
- The directories were most likely created by Docker for a bind mount whose source was gone. That
  was not verified.

➡️ True. Removing them needs root: the parent `deploy/observability` is root-owned, so the owner's
user cannot unlink its children.

⚖️ Strongest argument against: none. They are inert.

✅ Decision: verified. It is an owner-run command, not a commit (Q31).

---

❓ **Q11** - **C2: what stale bytecode exists, and would a local image build copy it?**

🔎 Facts:
- `analytics/src/analytics/llm/` contains only `__pycache__/`, holding six `.pyc` files: `__init__`,
  `client`, `grounding`, `interpret`, `narrate`, `schema`.
- `analytics/tests/__pycache__/` holds 12 `test_llm_*` files (11 pytest-rewritten, 1 plain) **and**
  three more orphans the pack did not list: `test_review_probe`, `test_zz_scratch_edge`,
  `test_zzz_repro_before`. These came from a loop that flags each `.pyc` whose `.py` is gone; it
  found nothing else.
- All of it is ignored by `.gitignore:30` (`analytics/**/__pycache__/`).
- `analytics/.dockerignore:2` says `__pycache__/` and `:5` says `tests/`. Docker's documented
  `.dockerignore` rule anchors patterns at the context root; matching at any depth needs `**/`. So
  `tests/` excludes the whole test tree, including its bytecode, while `__pycache__/` covers only a
  root-level one. `Dockerfile:20` (`COPY src/ src/`) therefore copies
  `src/analytics/llm/__pycache__/` into a locally built image. Not verified by a build.
- Release images are built from a clean checkout (`release.yml:15`, `:41`), so they are unaffected.
- `git grep -n -E 'analytics\.llm|from analytics import llm|from \.llm|import llm'` → only a
  historical plan line. A directory with no `__init__.py` inside a regular package imports as an
  empty namespace package, so locally `import analytics.llm` would succeed where CI fails. Nothing
  imports it, so this is inert. Python ignores `__pycache__/*.pyc` whose source is missing (PEP 3147).

➡️ True, with two corrections: only the `src` bytecode can reach an image, because `tests/` is
already excluded; and there are 15 orphaned test `.pyc` files, not 12. All of it is inert.

⚖️ Strongest argument against: inert residue on one machine is not worth any commit.

✅ Decision: verified. Local deletion is an owner command. The one-token `.dockerignore` fix is a
commit (Q31).

---

❓ **Q12** - **D1–D3: are the three stale code comments false?**

🔎 Facts:
- D1, `frontend/src/api/types.ts:274`: "Rejected by the executor until the merchant column lands
  (Phase 4b)." This is false. `analytics/src/analytics/plan.py:33-35` sets `MERCHANT_ENABLED = True`,
  `main.py:81` passes it, and `validation.py:38-41` says the rejection is "now reachable only when the
  flag is explicitly disabled".
- D2a, `frontend/src/api/hooks.invalidation.test.tsx:42`: "(hooks.ts ~line 612)". `hooks.ts` was
  split into `hooks/` in `90e2ca8` (2026-09-08). The key now lives at `hooks/insights.ts:87`, in
  `useInsightResults`.
- D2b, `frontend/src/api/hooks/transactions.ts:117`: "mirrors useInvalidateInsights' own
  'insight-result' line above". `useInvalidateInsights` is in another file (`hooks/insights.ts:29-39`),
  not above.
- D3, `analytics/src/analytics/sql.py:79`: "Stage 1's build_query collects predicates in a
  `where: list[str]` and joins them with "\n   AND "". The substance is true: `sql.py:108` builds
  `where`, and `:152` joins with `"\n   AND "`. Only "Stage 1's" is a planning-document label, and it
  implies some other `build_query` exists.

➡️ D1, D2a and D2b are false today. D3 is true in substance, with a misleading label.

⚖️ Strongest argument against: comments rot everywhere, and fixing four does not stop the next
four.

✅ Decision: verified, with the D3 nuance recorded as a correction. The fix criterion is Q32.

---

❓ **Q13** - **D4: is `docs/INSIGHTS.md:187-189` accurate about the backend's clock?**

🔎 Facts:
- INSIGHTS.md:187-189: "'Today' is the executor's, from an injectable clock — mirroring the backend's
  `config/ClockConfig.java`, resolving the date in the instance's configured `TZ` (default `UTC`)".
- `ClockConfig.java:20` returns `Clock.systemUTC()`, and its javadoc (`:9-12`) says "One injectable
  UTC clock".
- Compose gives the backend no `TZ` (`docker-compose.yml:37-50`).

➡️ Misleading. The executor copies the backend's *injectable-clock pattern*, but not its zone. As
written, the sentence says the backend honours `TZ`, which it does not.

⚖️ Strongest argument against: "mirroring" can be read as "same pattern", and that reading is
accurate.

✅ Decision: fix the wording. The content is settled with E3 (Q34).

---

❓ **Q14** - **D5: should the historical plan's ghost reference be edited?**

🔎 Facts:
- `docs/superpowers/plans/2026-09-07-maintenance-run.md:1372` is an unchecked checklist item that
  names `AnalyticsTimeoutBudgetTest`. That test was deleted in `2c252b6`, and
  `git grep -n AnalyticsTimeoutBudgetTest` finds that line only.
- The whole plan is a done-work record from before the LLM removal. The owner's 2026-09-22 note
  keeps "done-work plans in docs/superpowers/plans".
- Dozens of other lines in `docs/superpowers/` describe removed artefacts (Ollama, `/interpret`,
  `/narrate`, …).

➡️ True, but it is history. Editing one ghost line while leaving every other historical reference
would imply the plans are maintained documents, which they are not.

⚖️ Strongest argument against: a contributor grepping for the class name lands on a dead
instruction.

✅ Decision: **D5 dropped** (left alone), recorded under Out of Scope.

---

❓ **Q15** - **E1: is the comma rule as cited?** (Handed to candidate 5; checked only so the
handover is accurate.)

🔎 Facts:
- `components/TxnModal.tsx:125` and `screens/Subscriptions.tsx:106` both call
  `.replace(',', '.')` before sending.
- `lib/schemas.ts:11` accepts only `\d{1,15}(\.\d{1,4})?` for `moneyString`, which `budgetSchema`
  uses (`:15-18`).

➡️ As cited.

⚖️ Strongest argument against: none.

✅ Decision: **handed over to candidate 5**. Not designed here.

---

❓ **Q16** - **E2: can a pinned tile draw an empty chart instead of "No transactions match this
plan"?**

🔎 Facts:
- Executor: with `filters.currency` pinned and no matching rows, `executor.py:63-67` still emits
  one entry for that currency. `_shape` then yields:
  - `breakdown` → `groups: []` (`:131-137`);
  - `timeseriesSplit` → `series: []` (`:140-173`);
  - `timeseries` with `range: all` → `points: []` (`:91-104`, `:124-128`);
  - a bounded `timeseries` → zero-filled points (not empty);
  - `value` → `"0.0000"` (`:116`).
- Dashboard tile: `components/PinnedInsights.tsx:69` renders every result when
  `envelope.results.length > 0`. It shows its own "No transactions match this plan." (`:87`) only
  when `results` is empty.
- Explorer: `insights/ResultsPanel.tsx:151` shows the empty answer when
  `results.every(isEmptyResult)` (`:88-99`).
- `ResultRenderer.tsx:30-55` has no empty-state branch, and no renderer checks for empty arrays
  (`grep` for `length === 0|length > 0|empty` in `insights/renderers/*.tsx` → none).
- The same defect was observed in the explorer as journey J15. In
  `.superpowers/sdd/2026-09-07-maintenance-run/hunt/journeys.md:128-134` (git-ignored, local),
  screenshot-verified: for `results: [{currency: "PLN", shape: "breakdown", groups: []}]` the
  explorer drew "an empty axes box with no bars". It was fixed for the explorer only, and
  `screens/Insights.test.tsx:9-10` and `:85-109` pin that fix.
- The UI always pins a currency: `defaultPlan` (`insights/planDefaults.ts:61`) and all seven
  templates (`insights/templates.ts:25,38,51,67,80,97,111`). So the empty tile is the *common* case
  for any pinned breakdown, split or `all`-range timeseries that matches nothing.
- `PinnedInsights` has no test. `screens/Dashboard.test.tsx:36` mocks it to `null`.

➡️ True, and stronger than "may": it is the J15 mechanism, observed in the explorer with the same
envelope and the same renderer. It was not reproduced on the tile itself.

⚖️ Strongest argument against: none on the facts. The tile case was not run.

✅ Decision: real bug. The fix is Q33.

---

❓ **Q17** - **E3: what does each part of the system do with `TZ`, and is there a third clock?**

🔎 Facts:
- **Plan executor (honours TZ).**
  - Compose passes `TZ: ${TZ:-UTC}` to `analytics` only (`docker-compose.yml:89`,
    `deploy/release/docker-compose.yml:101`).
  - `config.py:30` defaults `tz` to UTC, and `:38-42` computes `today()` in `ZoneInfo(settings.tz)`.
  - `today` drives `resolve_range` (`executor.py:51`: `lastMonths`, `yearToDate`) and `postprocess`
    (`:72-77`: forecast's partial bucket and drift's current bucket, INSIGHTS.md:279-283, :337-340).
  - `test_config.py:30-35` pins Europe/Warsaw, and `:53,59` pins the UTC default.
- **Backend (UTC, fixed in code).**
  - `ClockConfig.java:20` is `Clock.systemUTC()`.
  - `SubscriptionChargeScheduler.java:38` is `@Scheduled(cron = "0 5 0 * * *", zone = "UTC")`, and
    `:41` posts with `LocalDate.now(clock)`.
  - `SubscriptionService.java:147` computes `asOf`.
  - `BackupService.java:183` computes the "today" that restore re-bases on.
  - `BackupController.java:43` builds the filename date in UTC.
  - API.md records this as a decision: `asOf` "is today's date in UTC, the same clock the charge job
    uses" (`:1252`), and the job runs "at 00:05 UTC" (`:1262`).
- **`TransactionRequest.java:49` does not belong to the asymmetry.** Its bound is
  `!occurredOn.isAfter(LocalDate.now(ZoneOffset.UTC).plusDays(1))`, zone-independent by design: "the
  latest calendar date anywhere on Earth is at most UTC date + 1" (`TransactionRequest.java:38-44`,
  API.md:713-716). It is correct in every zone and would not change if the backend honoured `TZ`.
- **Browser (a third clock).** `lib/money.ts:93-96` (`todayIso`) and `:119-123` (`currentMonth`) use
  the browser's local zone. They drive the Dashboard's and Transactions' "this month" and the default
  transaction date.
- **Consequences.**
  - Default (`TZ` unset → UTC), user in Warsaw: for the first one or two hours of a month, insights'
    "this month" is still last month while the Transactions screen has moved on.
  - `TZ=Europe/Warsaw`: insights agree with the browser, but the subscription widgets (`asOf`,
    `chargedThisMonth`, `upcoming`, `overdue`) and the charge job keep UTC.
  - In both cases the effect is confined to the hours between local and UTC midnight.
- **Discoverability.** `git grep -n -w TZ` → no hit in `.env.example`, `deploy/release/.env.example`,
  `README.md` or `deploy/release/README.md`. `TZ` exists only in the two compose files, `config.py`
  and INSIGHTS.md.
- **Image zone files unverified.** `uv.lock:617` installs the `tzdata` wheel only on win32, so in the
  Linux image `ZoneInfo` depends on the base image's zone files. That was not verified.
- **Unknown zone name.** By reading: `ZoneInfo` raises on every execute → the app-wide handler returns
  500 (`main.py:49-69`) → the backend turns any non-2xx other than 400 into
  `AnalyticsUnavailableException` (`AnalyticsClient.java:76-78`) → the UI says "the analytics service
  isn't running" (`ResultsPanel.tsx:27-37`). A misleading message for a typo.
- **Shell environment.** Compose interpolates `${TZ:-UTC}` from the shell environment before `.env`
  (compose's documented precedence). A developer with `TZ` exported therefore already runs the
  executor in that zone. That is the flake the e2e comments describe (`e2e/smoke.spec.ts:14-18`).

➡️ There are three clocks. Each side's behaviour is a recorded decision (INSIGHTS.md:187-194 for the
executor; API.md:708-716, :1252, :1262 for the backend). The defects are the INSIGHTS.md sentence
(Q13) and a knob no self-hosting user can discover.

⚖️ Strongest argument against: INSIGHTS.md's own rationale ("a plain DATE the user enters in their
own local time") applies just as much to `next_billing_on` and the charge job. So the backend's UTC
is arguably the real bug.

✅ Decision: facts settled. The intended behaviour is decided in Q34.

---

❓ **Q18** - **E4: does a minimal plan pass the executor, and does the frontend then dereference
`undefined`?**

🔎 Facts:
- **Executor accepts it on purpose.** `validation.py:57-59` treats `groupBy` and `interval` as
  optional (`required=False`, and `None` returns early at `:121-125`). `:134-135` returns when
  `filters is None`. `test_validation.py:19` asserts `("a minimal plan is valid", {"version": 1,
  "metric": "net", "range": {"type": "all"}}, [])`.
- **The executor's echo spells the fields out.** `plan.py:82-104` (`to_json`) always emits
  `filters: {}`, `groupBy` and `interval`. That is the "normalized plan as executed" of
  INSIGHTS.md:202.
- **The backend stores the plan as posted.** `InsightService.java:48,55,73,78` check only that it is
  a JSON object (`:105-111`). API.md:1456-1463 records the backend as a pass-through for plans.
- **TypeScript declares all three required** (`api/types.ts:279-288`).
- **Frontend dereferences:**
  - `PinnedInsights.tsx:45-46` (`insight.plan.filters.categoryId`) and `:67` (`describePlan`);
  - `planDefaults.ts:71` (`plan.filters.merchants`) and `:76` (`plan.filters.currency`);
  - `usePlanState.ts:63-65` uses the raw saved plan when there is no `?plan=`;
  - `planDefaults.ts:94-103` (`planFromSearch`) spreads the parsed plan over `defaultPlan`. So a
    saved plan with no `groupBy` opened from the tile's Open link (`PinnedInsights.tsx:60`) becomes
    `groupBy: 'category'`, and one with no `filters` gets the profile currency pinned. Both silently
    change the question.
- **No error boundary anywhere.** `git grep -n -E
  'ErrorBoundary|componentDidCatch|getDerivedStateFromError|errorElement' -- frontend/src` → none.
  React unmounts the whole tree on an uncaught render error (its documented behaviour; not executed).
  So a pinned minimal plan blanks the dashboard route, and a bare `?insight=<id>` deep link to one
  blanks the explorer.
- **Only a hand-crafted request can create one.** `defaultPlan` (`planDefaults.ts:55-66`) and all
  seven templates carry all three fields. API.md:1480 notes that hand-crafted *unexecutable* plans
  surface as 400s. This plan *is* executable, so that note does not cover it.

➡️ True. It is reachable only by a hand-crafted `POST`/`PUT /api/insights` on the user's own
profile, and its consequences are worse than the pack says: a blank page, not a broken tile.

⚖️ Strongest argument against: someone who hand-crafts requests can fix what they broke, and a
blank page is self-inflicted.

✅ Decision: real bug, low severity. The fix location is Q35.

---

❓ **Q19** - **E5: does `"PLN\n"` pass the currency check, and is that really harmless?**

🔎 Facts:
- `validation.py:43` is `CURRENCY = re.compile(r"^[A-Z]{3}$")`, and `:185` uses `CURRENCY.match(…)`.
  Python's `$` also matches just before a trailing newline (documented `re` semantics; not executed
  here, but the insights review ran a one-line check outside the repo).
- The value is bound as a parameter (`sql.py:115-117`), so it matches no row. Then `executor.py:65-67`
  answers with one zero-shaped entry whose `currency` is `"PLN\n"`.
- `ValueTile.tsx:14` and `ResultTable.tsx:16,55,78,123` call `formatAmount(…, result.currency)`
  during render → `money.ts:13` `new Intl.NumberFormat('pl-PL', {style: 'currency', currency})`.
  ECMA-402 throws a `RangeError` for a malformed currency code (by specification, not executed).
  With no error boundary (Q18), that blanks the page.
- It is reachable without the API: the explorer takes any hand-edited `?plan=` that parses and has
  `metric` and `range` (`planDefaults.ts:89-103`).
- The backend's rule (`TransactionRequest.java:30`, `@Pattern("^[A-Z]{3}$")`) uses Bean Validation's
  full-match semantics and rejects `"PLN\n"`, so the two runtimes disagree on the same rule.

➡️ True, and "harmless" is too strong. It is a hand-edited-URL crash, low severity.

⚖️ Strongest argument against: only someone editing JSON in the address bar can reach it.

✅ Decision: real, low. The fix is Q36.

---

❓ **Q20** - **F1: are the nine end-to-end helpers really duplicated, and are the copies identical?**

🔎 Facts:
- Definition counts: `registerAndLogin` ×3 (`insights-merchant.spec.ts:16`, `merchant.spec.ts:8`,
  `smoke.spec.ts:69`), `apiPost` ×3 (`a11y:35`, `responsive:32`, `smoke:38`),
  `currentMonthBounds` ×3 (`a11y:62`, `responsive:59`, `smoke:27`), `isoToday` ×3 (`a11y:72`,
  `responsive:69`, `smoke:19`), `registerPickAndGo` ×2 (`a11y:6`, `responsive:8`), `seedData` ×2
  (`a11y:84`, `responsive:79`), `verifySeeded` ×2 (`a11y:118`, `responsive:107`),
  `createProfileAndCategory` ×2 (`insights-merchant:27`, `merchant:19`), `monthStart` ×2
  (`insights-merchant:64` over `monthKey` `:58`, `smoke:63`).
- A body-by-body `diff`:
  - **identical:** `registerAndLogin`, `apiPost`, `currentMonthBounds`, `createProfileAndCategory`;
  - **equivalent:** `isoToday` (smoke's `offsetDays = 0` is a superset) and `monthStart` (both give
    the UTC first-of-month string);
  - **different behaviour:** `registerPickAndGo` (email prefix, display name, and a11y seeds data
    before navigating), `seedData` (a11y adds a subscription), `verifySeeded` (a11y also checks
    `/subscriptions`).
- `playwright.config.ts:6` has `testDir: './e2e'` and no `testMatch`, so a helper module not named
  `*.spec.ts`/`*.test.ts` is not collected. `eslint.config.js:21-22` already lints `e2e/**/*.ts`.

➡️ Counts true. Only six of the nine are behaviourally identical.

⚖️ Strongest argument against: end-to-end specs are often kept self-contained on purpose, so each
reads top to bottom.

✅ Decision: verified, with a correction. Scope is Q37.

---

❓ **Q21** - **F2: is the tile computation duplicated, and would `formatSigned` do for the net?**

🔎 Facts:
- `screens/Dashboard.tsx:39-48` and `screens/Transactions.tsx:124-135` are the same computation:
  find the profile currency's row, three `parseFloat`s, and the sum of foreign counts. Dashboard also
  reads `count`.
- The signed net is hand-rolled identically at `Dashboard.tsx:103` and `Transactions.tsx:246`:
  `(net >= 0 ? '+' : '−') + formatAmount(Math.abs(net), currency)`.
- `formatSigned` (`money.ts:37-44`) takes a decimal string and signs it **by transaction type**
  (`'INCOME'` → `+`), not by the value's sign. It is not a drop-in for a net.
- Existing tests pin the observable result: `Dashboard.test.tsx:67` and `:83-85`, and
  `Transactions.test.tsx:102-104` and `:184-190` (tile values and the "2 foreign-currency txns
  excluded" disclosure).

➡️ Duplication true. "formatSigned exists" is imprecise.

⚖️ Strongest argument against: two copies of about nine lines is below most teams' threshold.

✅ Decision: verified, with a correction. Scope is Q38.

---

❓ **Q22** - **F3: does `ProfilePicker` hard-code the exported currency list?**

🔎 Facts:
- `screens/ProfilePicker.tsx:368-371` lists `<option>PLN/EUR/USD/GBP`, the same values in the same
  order as `CURRENCY_OPTIONS` (`money.ts:26`).
- The other two create forms use `currencyOptions(...)` (`SubscriptionForm.tsx:118`,
  `TxnModal.tsx:231`).
- `ProfilePicker.test.tsx` does not pin the option list.

➡️ True.

⚖️ Strongest argument against: none.

✅ Decision: verified. Scope is Q39.

---

❓ **Q23** - **F4, F5: sibling-owned duplication.**

🔎 Facts: the pack assigns the re-declared session and active-profile test fixtures to candidate 8,
and the twice-written JDK `HttpServer` double to candidate 10.

➡️ Record them as handed over.

⚖️ Strongest argument against: none.

✅ Decision: **handed over** (F4 → candidate 8, F5 → candidate 10).

---

❓ **Q24** - **Are there same-kind findings the pack does not list?** (Sweep sections and my own
reads.)

🔎 Facts:
- **X1.** `screens/Insights.test.tsx:17`: `plan: { filters: {}, groupBy: null, granularity: null }`.
  `granularity` was never a `Plan` field (`git log -S granularity -- frontend/src/api/types.ts`
  → no commits). The field is `interval`.
- **X2.** Two tracked comments cite a file no contributor has. `ResultsPanel.tsx:80` and
  `Insights.test.tsx:88` cite "journeys.md J15", which exists only in the git-ignored `.superpowers/`
  (`.gitignore:36`). Both also say "never a zero-length `results` array" (`ResultsPanel.tsx:81-82`,
  `Insights.test.tsx:86-88`). That is false for plans that pin no currency (INSIGHTS.md:180-184;
  `executor.py:63-67`).
- **X3.** `lib/money.ts:88-91` says a late-night entry east of UTC "may bounce with a validation
  error until UTC catches up". The UTC+1 bound makes that impossible. The bound was added in
  `2c5184f` (2026-08-17); the comment was written a week later in `6c21dfb` (2026-08-24) and has
  never been true.
- **X4.** `e2e/smoke.spec.ts:14-15`: "postgres, backend and analytics all run TZ=UTC
  (docker-compose.yml)". Compose sets `TZ` for analytics only. The backend is UTC by code.
- **X5.** Duplicate Python tests: `test_execute.py:26-29` (health needs no token) repeats
  `test_health.py:8-12`, and `test_execute_api.py:77-79` (bearer token required) repeats
  `test_execute.py:10-13`.
- **X6.** `#eeaabc` is declared as a constant in `Budgets.tsx:19`, `Dashboard.tsx:19`,
  `TimeseriesChart.tsx:15` and `ProgressBar.stories.tsx:9`, and again as "Rose" in
  `lib/categoryColor.ts:15`. `e2e/smoke.spec.ts:469` asserts the literal.
- **X7.** `AnalyticsClient.java:45-50` blames h11 (Q3).
- **X8.** Planning labels that are still true: `TimeseriesChart.tsx:30,35` ("Stage 1"),
  `plan.py:33` ("Phase 4b (MY-33)"), `sql.py:87` ("Phase 4b adds"), `hooks.invalidation.test.tsx:8`
  ("Step 4b"), `types.ts:286` ("Phase 4b (plan version 2)"), `styles.css:3` ("Phase 3 TODO", in the
  frozen file).
- Also noted: 24 LESSONS entries describe removed LLM artefacts in the present tense (insights review
  Q5 #3). LESSONS is git-ignored.

➡️ X1–X5 and X7 are false or dead today. X6 is a design-token question. X8 is true text with a
planning label.

⚖️ Strongest argument against: every addition widens a candidate the owner approved from a list.

✅ Decision: verified. The scope line is Q40.

---

## Round 2 — What to do with each verified item

Frontier: every question whose facts Round 1 settled.

---

❓ **Q25** - **Which constraints must the design not break?**

🔎 Facts:
- Brief §6, settled decisions:
  - OpenAPI stays;
  - the LLM layer and the metrics stack stay removed;
  - Storybook, ArchUnit, Testcontainers and Flyway stay;
  - candidate 5 goes to the plain form idiom;
  - candidate 8 adopts msw;
  - candidate 14 replaces MapStruct.
- **One plan validator.** The backend forwards plans it does not understand (API.md:1456-1463). The
  frontend "never validates" plans (`planDefaults.ts:5-7`).
- **Money.** It is a decimal string on the wire, parsed to float only for display
  (`money.ts:1-6`).
- **The design-system file is frozen** (Q9).
- **Done-work plans are kept as history** (Q14).
- **Formatting gates.** Spotless is bound to `verify`, and Prettier, ESLint and ruff run in CI
  (`ci.yml:19,31,48`).
- **API.md's recorded time decisions.** `asOf` and the charge job are UTC (`:1252`, `:1262`), and
  the `occurredOn` bound is UTC+1 (`:708-716`).
- **INSIGHTS.md's recorded decisions.** The executor's "today" is taken in `TZ` (`:187-194`), and
  empty data is an answer, not an error (`:180-186`).

➡️ All of the above are hard constraints. In particular:
- no fix may add a second plan validator;
- no fix may edit `frontend/src/styles.css`;
- no fix may change a wire field;
- no fix may re-litigate §6.

⚖️ Strongest argument against: none.

✅ Decision: these constraints bound every later answer.

---

❓ **Q26** - **A1: remove JaCoCo, or make it pay?** Options:
- (a) remove the plugin block;
- (b) keep it and add a threshold (`jacoco:check`) or a CI artifact upload;
- (c) leave it as is.

🔎 Facts: Q1. The pack recommends removal. The owner delegated decisions to the recommended answer,
and the brief's §6 list omits JaCoCo. The 2026-09-22 keep is on record in the owner's memory.
- Maven can run JaCoCo ad hoc without any POM entry:
  `./mvnw org.jacoco:jacoco-maven-plugin:0.8.15:prepare-agent verify org.jacoco:jacoco-maven-plugin:0.8.15:report`.
  `prepare-agent` sets the `argLine` user property, which surefire reads by default. This is standard
  Maven CLI behaviour, **not executed here**.
- Candidate 14 deletes the adjacent `maven-compiler-plugin` block (`pom.xml:145-157`) — its spec,
  `out/14-mapstruct-to-from/spec.md:115`.

➡️ (a) Remove, as its own step and its own commit, so the owner can revert it alone. Record in
Further Notes and the hand-back that this reverses the 2026-09-22 keep, and give the ad-hoc command
so the 98.3% baseline stays reproducible on demand.

⚖️ Strongest argument against: the owner kept it by name a week ago. Removing it is exactly the
"tooling may stay" decision being overridden by a reviewer.

✅ Decision: (a), flagged as a reversal. The owner can veto it in review. Nothing else in the
candidate depends on this step.

---

❓ **Q27** - **A2: what is the smallest complete removal of the frontend coverage tooling?**

🔎 Facts: Q2.

➡️ In one change:
- the `coverage` script;
- the `@vitest/coverage-v8` devDependency, removed through the package manager so the lockfile prunes
  its transitive-only packages (vitest's optional-peer metadata stays);
- the `coverage` key in the Vitest config.

No doc mentions `npm run coverage` (`git grep` in Q2), so no doc changes.

⚖️ Strongest argument against: leaving the config key without the package is harmless, because
coverage is disabled unless `--coverage` is passed.

✅ Decision: remove all three. A half-removal leaves a key that points at a missing provider.

---

❓ **Q28** - **A3: keep or drop `uvicorn[standard]`, and what to do with the h11 attribution?**
Options:
- (a) drop the extras;
- (b) keep them and fix nothing;
- (c) keep them and correct the code comment.

🔎 Facts: Q3.

➡️ (c).
- Keep `uvicorn[standard]`. Dropping it changes the parser (httptools → h11) and the event loop
  (uvloop → asyncio) behind every backend request, and degrades the documented `--reload`. That is
  behaviour, not housekeeping.
- Correct the comment at `AnalyticsClient.java:45-50` to say only what is certain:
  - the JDK default sends a cleartext h2c upgrade;
  - uvicorn supports no upgrade except WebSocket;
  - against the real service that request failed ("not JSON" → analytics-unavailable);
  - pinning HTTP/1.1 keeps the backend independent of how uvicorn's HTTP implementation (httptools
    under `[standard]`, h11 without) treats an upgrade.

Do not state a mechanism in the comment. It is inference (Q3). Commit messages are history and are
not edited.

⚖️ Strongest argument against: by this code, h11 is the more tolerant choice, so option (a) would
remove a latent fragility for free.

✅ Decision: (c). The comment fix rides with B5's step, which touches the same class. The owner may
also correct their git-ignored LESSONS entry.

---

❓ **Q29** - **B1, B2, B4, B5: what is the smallest complete change for each dead item?**

🔎 Facts: Q4, Q5, Q7, Q8, and X5 (Q24).

➡️
- **B1** — delete the module. In the same step (same directory, same kind of dead weight), delete
  the two duplicate tests of X5, keeping the copy in the file that owns the subject:
  - `test_health.py` keeps health;
  - `test_execute.py` keeps the token check.
- **B2** — delete `sumAmounts` and its docblock.
- **B4** — delete `useProfiles` and the four `['profiles']` invalidations, and the `useQuery` import
  they orphan. Leave the session updates untouched, and leave `GET /api/profiles` in the backend.
- **B5** — make the execute path a single constant used by the request and both log lines. `post`
  takes only the body, or is inlined into `execute`; the implementer picks whichever reads better in
  review. No behaviour change: `AnalyticsClientTest` survives unchanged.

⚖️ Strongest argument against: B5 is taste: a private method's parameter.

✅ Decision: as above. B5 is kept because it removes the last trace of the three-endpoint client and
shares the file with the Q28 comment fix, so it costs no extra review surface.

---

❓ **Q30** - **B6: what happens to the unused CSS classes?**

🔎 Facts: Q9.

➡️ Nothing. The design-system copy stays byte-for-byte. Record the finding and the rule under Out of
Scope.

⚖️ Strongest argument against: dead rules ship to users. But the file is tiny, and the rule protects
a design source of truth.

✅ Decision: dropped. Reported as a correction.

---

❓ **Q31** - **C1, C2: how is residue on disk handled?**

🔎 Facts: Q10, Q11.

➡️
- **Local residue: owner-run commands, not a commit** (Further Notes):
  - check `find deploy/observability -type f` prints nothing, then `sudo rm -r deploy/observability`;
  - `rm -r analytics/src/analytics/llm analytics/tests/__pycache__`. The second directory is
    regenerated by the next pytest run.
- **One tracked fix:** make the analytics image's ignore pattern match `__pycache__` at any depth, so
  a locally built image matches a CI-built one. It lands in the B1 step (analytics hygiene).
- The owner's memory also records the Docker volumes `my-finance_prometheus-data` and
  `my-finance_grafana-data` as left behind. Not verifiable here (no docker). Mention with a
  `docker volume ls` check.

⚖️ Strongest argument against: the `.dockerignore` edit protects only local builds, which nobody
ships.

✅ Decision: as above. The pattern fix is kept because it is three characters and makes "a local
image equals the released image" true.

---

❓ **Q32** - **D1–D4 and X1–X4, X7: which stale text is fixed, and by what rule?**

🔎 Facts: Q12, Q13, Q24.

➡️ Rule: **fix text that is false today, plus the one listed planning label (D3). Do not sweep
planning labels that are still true (X8).** So:
- fix D1, D2a, D2b, D3 (drop "Stage 1's"), X1, X3, X7 (Q28);
- fix X2 in the test comment now; `ResultsPanel`'s docblock is rewritten by the E2 step (Q33);
- fix X4 inside F1's step (Q37);
- D4 goes into E3's documentation step (Q34).

⚖️ Strongest argument against: the rule leaves X8's labels, which are just as meaningless to a new
reader as D3's.

✅ Decision: as above. X8 is listed under Out of Scope with the reason: true statements, and a
jargon sweep is not worth its diff.

---

❓ **Q33** - **E2: what is the intended behaviour, and where does the fix go?** Options:
- (a) copy `ResultsPanel`'s predicate into `PinnedInsights`;
- (b) export it from `ResultsPanel`;
- (c) give the question "did the plan match nothing?" one home that both callers use.

🔎 Facts:
- Q16.
- INSIGHTS.md:180-186 makes empty data an answer. The explorer's copy calls it "an empty answer"
  (`ResultsPanel.tsx:154-155`). `PinnedInsights` already has the message (`:87`), so the intended
  behaviour is plain in the code.
- `eslint.config.js:17` enables `react-refresh/only-export-components` (warn). Exporting a helper
  from a component module trips it.
- The LESSONS entry "A gate that checks the wrong level of a nested collection is a silent dead
  branch" (`docs/LESSONS.md:2145`) records the explorer's half of this bug.

➡️ (c). One small non-component function in the insights folder, **`nothingMatched(envelope)`**:
- It returns true when the envelope holds no result entry, or when every entry's collection is
  empty. A `value` result is never empty. A zero-filled bounded timeseries is not empty.
- `ResultsPanel` and `PinnedInsights` both call it. `isAllZero` stays private to `ResultsPanel`, its
  only user.
- The moved docblock states the rule correctly: no entry when the plan pins no currency, one entry
  with an empty collection when it does. It cites INSIGHTS.md, not the git-ignored `journeys.md`.
- INSIGHTS.md's empty-data bullet gains one clause: a pinned tile shows the same empty answer.

⚖️ Strongest argument against: (a) is a two-line change. A shared module for one boolean is more
structure than the bug needs.

✅ Decision: (c). The deletion test favours it: delete `nothingMatched` and the rule reappears in two
callers that already drifted apart once (J15). One function also fixes the doc drift.

---

❓ **Q34** - **E3: what is the right behaviour?** Options:
- (a) both the backend and the executor honour `TZ`;
- (b) neither does;
- (c) behaviour unchanged, and the documents say exactly what happens, recording (a) as a deferred
  decision with a trigger.

🔎 Facts: Q17, Q13. What (a) would take:
- the backend's clock zone and the scheduler's `zone` would follow configuration;
- the backup filename date would follow it too;
- compose would pass the zone to the backend, and passing it as `TZ` would also move the JVM's
  default zone;
- API.md:1252 and :1262 would change.

That is a behaviour change to a scheduled job and to a documented wire field, `asOf`. (b)
contradicts INSIGHTS.md:190-193's stated rationale.

➡️ (c).
- **INSIGHTS.md.** Correct the clock sentence: same injectable-clock pattern as the backend, but the
  backend stays UTC (API.md `asOf`, Charge posting).
- **Document the instance time zone** in the README, both env templates and the release bundle's
  README. Say what it governs:
  - `lastMonths` and `yearToDate` windows;
  - drift's current bucket;
  - forecast's partial bucket.
- Say what stays UTC:
  - the charge job at 00:05;
  - the subscriptions widgets' `asOf`, `chargedThisMonth`, `upcoming` and `overdue`;
  - restore's re-basing.
- Say that the `occurredOn` bound is UTC+1 whatever `TZ` is.
- Say the value is an IANA zone name, and what an unknown one does (every insight fails with the
  "isn't running" message).
- **API.md.** Add the deferred decision to "Open questions for implementation tickets", with a
  trigger: a user reports subscription widgets and insights disagreeing near midnight.
- **Acceptance step before the docs recommend setting it:** on a real stack, `TZ=Europe/Warsaw`
  executes a plan, because the image's zone files are unverified (Q17).

⚖️ Strongest argument against: documenting `TZ` invites exactly the users who will then hit the
backend's UTC. And the executor's rationale applies equally to the charge job, so (a) is the honest
end state.

✅ Decision: (c). Each side does what its recorded decision says, so no code is wrong. (a) is a
feature with its own tests and docs, and recording it with a trigger makes it a decision, not an
omission. There is no failing test, because nothing in the code changes. Existing `test_config.py`
and the backend's fixed-clock tests keep pinning each side.

---

❓ **Q35** - **E4: where does the fix go?** Options:
- (a) the executor makes `filters`, `groupBy` and `interval` required;
- (b) the backend normalizes plans on save;
- (c) the TypeScript type makes them optional, and every consumer guards;
- (d) the frontend normalizes a saved plan once, where it enters.

🔎 Facts:
- Q18.
- (a) changes the DSL: `test_validation.py:19` asserts the opposite, and saved insights "outlive the
  DSL" (INSIGHTS.md:102).
- (b) makes the backend a second component that knows DSL fields, which API.md:1456-1463 rejects.
- (c) touches every chip and helper.
- The read boundary is two query functions: `useInsights` and `useInsight`
  (`hooks/insights.ts:8-26`). `useInsightResults` posts the saved plan (`:88-89`).
- An explicit `filters: {}`, `groupBy: null`, `interval: null` passes validation:
  `_check_filters({})` iterates nothing, and `None` returns early for optional enums (`:121-125`).

➡️ (d). The insights hooks return insights whose plan is a **normalized plan**: an absent `filters`
becomes `{}`, an absent `groupBy` or `interval` becomes `null`, and nothing else is touched. Those are
exactly the executor's semantics (`plan.py:82-104`).

Because the plan is complete, `planFromSearch`'s spread over `defaultPlan` no longer changes its
meaning: explicit `null`s override `'category'`.

INSIGHTS.md "Plan DSL v1" states the absence semantics. The `Insight` type's comment says its plan is
normalized on read.

⚖️ Strongest argument against: (c) makes the type honest instead of making the data match a
dishonest type. Normalizing hides the fact that the stored JSON differs.

✅ Decision: (d). One change at one boundary. It keeps one validator and keeps the rest of the
frontend unaware of a hand-crafted edge.

---

❓ **Q36** - **E5: the fix.**

🔎 Facts: Q19.

➡️ Make the currency rule match the whole string (a full-match call or an end-of-string anchor, the
implementer's choice). The rule's message stays unchanged.

⚖️ Strongest argument against: none.

✅ Decision: as above. Land it before candidate 9 reshapes `validation.py`.

---

❓ **Q37** - **F1: how much of the end-to-end helper code is consolidated?**

🔎 Facts: Q20.

➡️ Move the six behaviourally identical helpers into one plain end-to-end support module, not named
`*.spec.ts`:
- `registerAndLogin`;
- `apiPost`;
- `currentMonthBounds`;
- `isoToday` (with its optional offset);
- `createProfileAndCategory`;
- `monthStart` (with `monthKey` if `insights-merchant` still needs it).

The module carries one accurate comment on why dates are computed in UTC: the executor defaults to
`TZ=UTC` in compose, and the backend is UTC by code. That fixes X4.

Leave `registerPickAndGo`, `seedData` and `verifySeeded` in their specs. They differ in behaviour,
and unifying them would change what each suite seeds.

⚖️ Strongest argument against: Playwright's idiomatic sharing is `test.extend` fixtures. Plain
helpers are the simpler, conventional choice for stateless functions like these.

✅ Decision: a plain helper module. No new fixtures.

---

❓ **Q38** - **F2: extract the tile computation, or leave it?**

🔎 Facts: Q21. The module header of `lib/money` sanctions display-side aggregation. Candidate 5
rewrites the parsing half of `lib/money`.

➡️ Extract one display helper into `lib/money`, taking the per-currency summary rows and the profile
currency. It returns expense, income, net, the profile currency's count, and the foreign count, all
as display numbers. Add a signed-net formatter beside `formatSigned`.

This is a pure refactor. The existing Dashboard and Transactions tests are the seam, and no new test
is added. It is the last step, after candidate 5, and the first to drop if contested.

⚖️ Strongest argument against: two copies is the threshold where most teams wait for a third.

✅ Decision: do it, last. The copies encode ARCHITECTURE.md §3's never-mix rule, and one home is
cheap now that there are exactly two readers.

---

❓ **Q39** - **F3.**

🔎 Facts: Q22.

➡️ Render the create-profile currency options from `CURRENCY_OPTIONS`. A new profile has no existing
currency to fold in, so it does not use `currencyOptions(extra)`. Land it after candidate 5; if
candidate 5 rewrites that form, it absorbs this item.

⚖️ Strongest argument against: none.

✅ Decision: as above.

---

❓ **Q40** - **Scope line for X1–X8.**

🔎 Facts: Q24.

➡️
- **Include** the same-kind items that sit in steps already touching their file or directory:
  - X1 and X2 in the stale-text step;
  - X3 in the stale-text step;
  - X4 in F1;
  - X5 with B1;
  - X7 with B5.
- **Out of Scope, one line each:**
  - X6: a design-token question (the proper home would be a token, but `styles.css` is frozen);
  - X8: true labels;
  - the missing error boundary: a feature;
  - LESSONS' present-tense LLM entries: the owner's git-ignored file.

⚖️ Strongest argument against: see Q24.

✅ Decision: as above.

---

## Round 3 — Structure, tests, sequence, documents

Frontier: questions whose prerequisites are the Round 2 decisions.

---

❓ **Q41** - **Dependencies by category, and seams.**

🔎 Facts: Rounds 1–2.

➡️
- **In-process** (merge and test directly):
  - `nothingMatched`;
  - plan normalization;
  - the tile totals;
  - the regex;
  - the end-to-end helper module;
  - every deletion.
- **Local-substitutable:** the analytics validation table runs against Testcontainers Postgres (the
  `conn` fixture), because `categoryId` existence needs the database.
- **Ports & adapters:**
  - browser → backend over HTTP. Production adapter: `fetch` in `api/client`. Test adapter: msw
    handlers (candidate 8), or the `api` stub fallback;
  - backend → executor over HTTP. `AnalyticsClient` and its JDK `HttpServer` double (candidate 10's
    concern). B5 and the comment fix leave both alone.
- **Mock (true third party):** none.
- **Seam discipline:** no new seam. `nothingMatched`, the normalization and the tile helper each have
  one implementation and are plain functions, not seams.

⚖️ Strongest argument against: none.

✅ Decision: as above.

---

❓ **Q42** - **Which failing test comes first for each bug, and at which seam?**

🔎 Facts:
- `PinnedInsights` depends on four exchanges:
  - `GET /api/auth/me` (`useActiveProfileId` gates every query, `hooks/auth.ts:19-39`);
  - `GET /api/insights` (`hooks/insights.ts:8-15`);
  - `GET /api/categories` (`hooks/categories.ts:8-14`);
  - `POST /api/insights/execute`, one per pinned insight (`:83-93`).
- `renderWithProviders` builds its own `QueryClient` and does not expose it
  (`test/renderWithProviders.tsx:8-37`). So the `setQueryData(sessionKey, …)` shortcut of
  `hooks.invalidation.test.tsx:41` is unavailable, and a stub must answer `/api/auth/me`.
- Prior art:
  - stubbing only the `api` function (`hooks.invalidation.test.tsx:13-16`);
  - replacing `ResultRenderer` with a marker because recharts needs real layout in jsdom
    (`Insights.test.tsx:34-39`);
  - table-driven validation (`test_validation.py:18-192`).
- A test that mocks the hooks module wholesale cannot see a fix made inside the hooks. That is the
  exact failure `hooks.invalidation.test.tsx:8-12` describes.

➡️
- **E2 — first failing test:** render `PinnedInsights` through its real hooks with the network
  substituted.
  - Exchanges: one pinned insight whose plan pins PLN, and an execute answer of
    `results: [{currency: 'PLN', shape: 'breakdown', groups: []}]`.
  - Asserts: "No transactions match this plan." is shown, and the renderer marker is absent.
  - Guards: one group → marker shown, no message; `results: []` → message (already passes).
- **E4 — first failing tests, same file and seam:**
  - (1) a pinned insight whose saved plan is `{version: 1, metric: 'spend', range: {type: 'all'}}`
    renders its tile without throwing. It shows the description "spend · all categories · all time ·
    every currency", and its Open link's `plan` parameter carries `"groupBy":null`. That link
    assertion guards the silent `'category'` substitution;
  - (2) at the same network seam, `useInsight(id)` rendered with `renderHook` returns that plan
    normalized. This covers the explorer's deep-link path.
- **E5 — first failing test:** a new row in the validation table: `filters.currency: "PLN\n"` → the
  existing currency problem string.
- **Seam choice:** the network, with msw handlers from candidate 8. It is the highest seam that runs
  the hooks, where E4's fix lives, and candidate 8 has settled that new tests for untested modules go
  there.
- **Fallback if candidate 8 has not landed:** stub `api` by path (prior art above). Candidate 8 then
  migrates the file with the rest.
- **The one internal substitution:** the `ResultRenderer` marker, because of recharts in jsdom.
- **E3:** no test. Documentation only; behaviour is unchanged and already pinned by
  `test_config.py:30-59` and the backend's fixed-clock tests.

⚖️ Strongest argument against: rendering the whole `Dashboard` would be a higher seam still. But it
needs handlers for every dashboard query, and `Dashboard.test.tsx` already mocks the tile away.

✅ Decision: as above. One seam for the frontend bugs, the existing table for E5.

---

❓ **Q43** - **Which tests survive, which are replaced, which are deleted?**

🔎 Facts: Q21, Q29, Q42.

➡️
- **Survive unchanged:**
  - `AnalyticsClientTest` (B5);
  - `Dashboard.test.tsx:67,83-85` and `Transactions.test.tsx:102-104,184-190` (F2);
  - `ProfilePicker.test.tsx` (F3);
  - `Insights.test.tsx`'s J15 tests (`:85-138`, E2: the explorer's behaviour is unchanged). Only its
    comments and one fixture token change;
  - `hooks.invalidation.test.tsx` (B4). Only its comment changes;
  - the whole Python suite except X5;
  - the end-to-end suite (F1). It must stay green; helpers move, and no assertion changes.
- **Added:**
  - one `PinnedInsights` test file (E2 and E4);
  - one `useInsight` hook test (E4). It can live in the same file;
  - one validation table row (E5).
- **Deleted:** the two duplicate Python tests (X5).
- **Replaced:** none.

⚖️ Strongest argument against: none.

✅ Decision: as above.

---

❓ **Q44** - **Which recorded-decision documents change, and in which step?**

🔎 Facts: Q33–Q35; API.md:1541-1552 is the "Open questions" list.

➡️
- **INSIGHTS.md** "Execution semantics":
  - the clock bullet (Q34, E3 step);
  - one clause in the empty-data bullet (Q33, E2 step).
- **INSIGHTS.md** "Plan DSL v1", in the paragraph after the table: absence semantics for `filters`,
  `groupBy` and `interval` (Q35, E4 step).
- **API.md** "Open questions for implementation tickets": the backend clock versus the instance time
  zone (Q34, E3 step).
- **Not recorded-decision documents, but tracked:** README, both env templates, the release bundle's
  README (E3 step).
- **Unchanged:** ARCHITECTURE.md and SCHEMA.md. Neither mentions coverage tooling, `TZ`, or anything
  else here. `git grep` confirms that for coverage and JaCoCo.
- **No ADR.** Every reversal lands in INSIGHTS.md or API.md, per the repo rule.

⚖️ Strongest argument against: none.

✅ Decision: as above. Exact wording is in `docs-proposals.md`.

---

❓ **Q45** - **Sequence, and the order relative to siblings.**

🔎 Facts: sibling overlaps found by reading:
- **Candidate 14** deletes `pom.xml:145-157`, adjacent to A1's `:158-173`.
- **Candidate 9** rewrites `validation.py` (E5) and `sql.py` (D3).
- **Candidate 10** owns `AnalyticsClientTest` and the double that the B5 comment mentions.
- **Candidate 5** rewrites `lib/money` (B2, X3, F2), the form idiom, and possibly the
  create-profile form (F3).
- **Candidate 8** provides msw, which steps 9 and 10 prefer.
- **Candidate 15** may touch the hand-written `types.ts` (D1).
- **Candidates 2 and 3** may touch `Insights.test.tsx` (X1, X2) and `ProfilePicker`.
- **Candidate 7** rewrites compose; the `TZ` lines stay wherever the definition lives.
- **Candidate 13** edits the README (Redis). The E3 step edits a different paragraph.

➡️ Steps, each one reviewable commit with a green build:
1. **Remove JaCoCo.** Independent. If candidate 14 lands first, trivially rebased.
2. **Remove the frontend coverage tooling.** Independent.
3. **Analytics hygiene.** B1, X5, and the ignore pattern.
4. **Currency full-match, test first; the `sql.py` label.** Before candidate 9.
5. **`AnalyticsClient`.** B5 and the comment. Before candidate 10.
6. **Frontend dead code.** B2, B4. Before candidate 5.
7. **Frontend stale text.** D1, D2, X1, X2 (test comment), X3.
8. **Time zone documentation.** E3, D4, with its acceptance check.
9. **Pinned tile empty answer, test first.** After candidate 8's msw setup (preferred).
10. **Normalized saved plans, test first.** Same condition as step 9.
11. **End-to-end helper module.** F1, X4.
12. **`ProfilePicker` currency options.** F3, after candidate 5.
13. **Tile totals.** F2, after candidate 5. Drop first if contested.

- **Owner-only:** the residue commands, at any time.
- **Independence:** steps are independent unless stated; the order minimizes conflicts with siblings.

⚖️ Strongest argument against: thirteen commits for housekeeping is ceremony. Squashing the trivial
ones would read faster.

✅ Decision: keep them separate. Each is separately revertable, and the owner may veto A1 alone
(Q26). A reviewer can check each against one line of this log.

---

❓ **Q46** - **Which lessons does the change teach?** (docs/LESSONS.md, git-ignored.)

🔎 Facts: related entries already exist:
- LESSONS.md:299, the injectable clock;
- :1019, the HTTP/1.1 fix, which names h11;
- :2145, the wrong-level gate;
- :2279, prefix-matched invalidation keys.

➡️
- **New entry, "Which 'today'? Three clocks in one app".** The browser's local zone, the backend's
  UTC with the zone-independent UTC+1 bound, and the executor's `TZ`. Why each exists, and why
  documenting a knob means documenting its scope.
- **New entry, "A Maven plugin can run without a POM entry".** Ad-hoc JaCoCo by coordinates, and how
  `prepare-agent` reaches surefire through `argLine`.
- **New entry, "Normalize at the boundary, not in every consumer".** The saved plan, with a Python
  comparison to parsing into a dataclass once.
- **E2: "same pattern as :2145".** Add one line there saying the dashboard tile had the same gate. No
  new entry.
- **Owner's choice:** correct the h11 attribution in :1019. The `.dockerignore` anchoring is a
  one-line note under the Docker lessons if the owner wants it.

⚖️ Strongest argument against: none.

✅ Decision: as above.

---

## Round 4 — Edge cases and failure modes

Frontier: scenarios that depend on the decided shapes.

---

❓ **Q47** - **Edge cases, with concrete scenarios.**

🔎 Facts: from the decisions above.

➡️
1. **A multi-currency envelope where one currency is empty.** It cannot happen: without a pinned
   currency, only currencies with rows appear (`executor.py:65`). With one pinned, there is exactly
   one entry. `nothingMatched` still answers "every entry empty", which is correct either way.
2. **A pinned `value` plan that matches nothing.** It shows a 0 tile, not the empty message. That is
   the same as the explorer and is intended.
3. **A zero-filled bounded timeseries on a tile.** It draws a flat line. The explorer adds "Every
   bucket in this range is zero." and the tile does not. Unchanged; noted.
4. **A hand-crafted saved plan with an unknown extra field.** Normalization passes it through. The
   executor rejects it (400), and the tile shows "Could not run this insight." That is correct: one
   validator.
5. **A hand-crafted saved plan whose `filters` is not an object** (for example a string).
   Normalization touches only *absent* fields, so the tile code could still throw. That is out of
   scope; only a hand-crafted request can do it. Recorded as a known limit.
6. **`TZ` exported in a developer's shell.** Compose uses it before `.env`. The docs say "set it in
   `.env`" and mention the precedence in one clause.
7. **An unknown `TZ`.** Every insight fails with "the analytics service isn't running". The docs say
   so. Fail-fast validation at startup is out of scope.
8. **An existing release `.env` without `TZ`.** The compose default of UTC applies, and nothing
   changes. Both launchers pass unknown template keys through (`start.sh:63-68` rewrites the template
   with `sed`; `start.bat:39` with PowerShell `-replace`).
9. **Lockfile regeneration for A2.** The package manager prunes only packages that nothing else needs.
   A reviewer checks the lockfile diff only removes entries.
10. **`pom.xml` adjacency with candidate 14.** Whichever lands second rebases one hunk.
11. **msw not landed when steps 9 and 10 start.** Use the fallback seam (Q42). Candidate 8 migrates
    the file later.
12. **A developer's local image built before the ignore fix.** It still carries the stale bytecode
    until rebuilt. Harmless.
13. **The ad-hoc JaCoCo command.** Not executed here. If it fails, the owner re-adds the plugin block
    for a one-off run.

⚖️ Strongest argument against: none.

✅ Decision: all visited. Items 3, 5 and 7 are recorded as known limits in the spec's Out of Scope or
Further Notes.

The frontier is now empty.

---

## Decisions (one page)

**Verified and changed**

- **A1 (JaCoCo): remove.** Its own step. It reverses the owner's 2026-09-22 keep, so it is flagged,
  and the ad-hoc command keeps the baseline reproducible (Q26).
- **A2 (frontend coverage): remove** the script, the devDependency (lockfile via the package
  manager) and the config key (Q27).
- **B1 + X5: delete** `envelopes.py` and the two duplicate Python tests. The image ignore pattern
  matches `__pycache__` at any depth (Q29, Q31).
- **B2, B4: delete** `sumAmounts`, and `useProfiles` with its four orphaned invalidations and the
  orphaned `useQuery` import (Q29).
- **B5 + X7:** `AnalyticsClient` loses the vestigial `path` parameter. Its HTTP/1.1 comment stops
  blaming h11 and states only what is certain (Q28, Q29).
- **D1, D2, D3, X1, X2, X3: fix** false or dangling text (Q32). **D4:** the clock sentence is
  corrected in E3's step.
- **E2: real.** One `nothingMatched(envelope)` for the explorer and the tile. Failing test first at
  the network seam (Q33, Q42).
- **E3: not a code bug.** Documents say what each clock does. The backend honouring `TZ` is recorded
  as a deferred decision in API.md, with a trigger. The acceptance check runs on a real stack (Q34).
- **E4: real, low.** Saved plans are normalized where they enter the frontend. INSIGHTS.md records
  absence semantics. Failing tests first at the same seam (Q35, Q42).
- **E5: real, low.** The currency rule matches the whole string. Failing table row first (Q36).
- **F1:** a plain helper module for the six identical helpers, carrying the corrected UTC comment
  (X4) (Q37).
- **F2:** tile totals and the signed net go to `lib/money`, last, and first to drop (Q38).
- **F3:** `ProfilePicker` uses `CURRENCY_OPTIONS` (Q39).

**Verified and dropped or left**

- **A3:** keep `uvicorn[standard]`. Removing it is a behaviour change (Q28).
- **B6:** the classes are unused, but the file is a frozen design copy (Q30).
- **D5:** history is not edited (Q14).
- **X6, X8, the missing error boundary, LESSONS:** out of scope (Q40).

**Handed over**

- **B3 `fieldMessage`** → candidate 2.
- **E1 comma** → candidate 5.
- **F4 fixtures** → candidate 8.
- **F5 double** → candidate 10.

**Owner-only (no commit)**

- `sudo rm -r deploy/observability`, after checking it holds no files.
- `rm -r analytics/src/analytics/llm analytics/tests/__pycache__`.
- Optionally, the Docker volumes: `docker volume ls` first.

**Seams**

- The network, for the frontend bugs: msw per candidate 8, with an `api`-stub fallback. The
  `ResultRenderer` marker is the one internal substitution.
- The existing validation table, for E5.
- Existing tests, for every refactor.

**Order**

Steps 1–13 as in Q45:
- 4 before candidate 9;
- 5 before candidate 10;
- 6 before candidate 5;
- 9–10 after candidate 8's msw setup (preferred);
- 12–13 after candidate 5.

**Documents**

- INSIGHTS.md: the clock, empty-data and DSL absence passages.
- API.md: open questions.
- README, both env templates, the release README.
- No ADR.
