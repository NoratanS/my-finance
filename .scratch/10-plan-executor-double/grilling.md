# Grilling log: candidate 10, one faithful double for the plan executor

Scope read in full at `dev` (`c3e20c5`; tree identical to `4545810`): the backend's
`AnalyticsClient`, `InsightService`, `InsightController`, `InvalidPlanException`,
`AnalyticsUnavailableException`, `ApiException`, `GlobalExceptionHandler` (head),
`AnalyticsProperties`, the analytics section of `application.properties`, `AnalyticsClientTest`,
`InsightExecuteControllerTest`, `InsightExecuteUnavailableTest`, the test support package
(`IntegrationTest`, `TestcontainersConfiguration`, `DatabaseCleaner`, `TestFixtures` head),
`ArchitectureTest`, `pom.xml`, both Dockerfiles, `.github/workflows/ci.yml`; on the analytics
side every module and every test file (see candidate 9's log). Governing docs: `docs/INSIGHTS.md`
(all), `ARCHITECTURE.md` §5–§6, `docs/API.md` "Errors" and "Insights", `docs/SCHEMA.md` read-only
role. Nothing was executed.

**How library facts were checked** (the brief asks for this explicitly):
- JDK `HttpServer`: the local JDK is 21.0.12 (Ubuntu build, `release` file). Its `src.zip` is a
  dangling symlink (the source package is not installed; `ls -la` shows
  `lib/src.zip -> ../../openjdk-21/src.zip -> lib/src.zip`). So: `javap -v -p` on the installed
  classes `sun.net.httpserver.ServerImpl`, `ServerImpl$Exchange`, `ExchangeImpl`, grepping their
  constant pools; cross-checked against `ServerImpl.java` from `openjdk/jdk21u` on GitHub (read
  with WebFetch).
- JDK `HttpClient`: `Exchange.java`, `ExchangeImpl.java`, `HttpRequestImpl.java` from
  `openjdk/jdk21u` on GitHub (WebFetch), corroborated by commit `a02bc94`.
- uvicorn 0.52.4, httptools 0.8.0, h11 0.16.0, FastAPI 0.141.1, Starlette 1.6.0, psycopg 3.3.5:
  read from `analytics/.venv/lib/python3.12/site-packages`, versions confirmed in `uv.lock`
  (and at the incident commit with `git show eafc8f8:analytics/uv.lock`). llhttp's callback
  contract: the `nodejs/llhttp` README on GitHub (WebFetch).

Settled and not re-opened: the plan executor stays a separate Python process; the exact problem
strings stay; the four result shapes stay; OpenAPI stays; candidate 13 replaces Redis.

## Design tree

```
Constraints (Q1) ── Dependency category (Q2)
Facts: JDK server vs Upgrade (Q3) · shipped executor vs h2c (Q4) · FastAPI order and bodies (Q5)
 ├─ What "faithful" means (Q6) ◄── Q3, Q4, Q5
 ├─ Real Python process in backend tests? (Q7)
 └─ Where exchanges live, who proves them (Q8)
      ├─ Format and matching key (Q9)
      │    └─ Which exchanges, exact contents (Q10)
      ├─ The double's interface (Q11) ── upgrade refusal and guard (Q12) ── home and name (Q13)
      └─ The Python verifier (Q14)
Assertions that change (Q15) · Python tests replaced (Q16) · Step 1's worth (Q17)
Order (Q18) · Docs and ADR (Q19) · Edge cases (Q20) · Siblings (Q21)
```

---

## Round 1: constraints and facts

Frontier: Q1 to Q5. None depends on another open question.

❓ **Q1** - **What must the change not break?**

🔎 Facts:
- The backend's HTTP interface for execute: `docs/API.md:1451-1471`. `200` envelope passed
  through verbatim; `400` `/errors/invalid-plan` with `problems` (non-object body, or executor
  rejection); `401`/`409`; `503` `/errors/analytics-unavailable`.
- Deliberate mapping: any non-2xx other than 400, any transport failure, any non-JSON body
  becomes `AnalyticsUnavailableException` (`AnalyticsClient.java:73-81`, `:94-97`, `:100-107`);
  documented on the executor side (`main.py:59-62`) and pinned (`AnalyticsClientTest.java:143-149`).
- HTTP/1.1 is pinned, with the reason, at `AnalyticsClient.java:45-54`.
- Profile scoping is a security rule: the profile id comes from the session only
  (`InsightService.java:92-96`); `InsightExecuteControllerTest.java:132-142` is the test that a
  smuggled id is ignored.
- Card: no new test dependency unless it clearly earns its keep. `pom.xml` has none for HTTP
  doubles (no WireMock, no MockWebServer).
- ArchUnit analyses production classes only (`ArchitectureTest.java:22`,
  `ImportOption.DoNotIncludeTests`), so test support classes are not bound by the layer rules.
- Gates: backend `./mvnw -B verify` with Spotless bound to `verify` (`ci.yml:18-19`,
  `pom.xml:121-144`); analytics `ruff check`, `ruff format --check`, `mypy`, `pytest`
  (`ci.yml:48`); e2e Playwright against the compose stack (`ci.yml:50-75`).
- Settled: separate process, exact strings, four shapes.

➡️ No production behaviour changes in the backend (one comment in `AnalyticsClient` changes,
Q12). The backend's HTTP interface, the 503 mapping, the HTTP/1.1 pin and every executor string
stay. The profile-scoping assertion survives in every form of the smuggled-id test. No new
dependency.

⚖️ Strongest argument against: "no production change" means the double cannot be simplified
by, say, an injectable transport in `AnalyticsClient`. The client is already tested through its
real HTTP stack, which is exactly what caught nothing in the h2c incident; a transport seam
would test less, not more.

✅ Decision: as recommended. Unblocks every later question.

---

❓ **Q2** - **Which dependency category is the executor, and what are the port and the
adapters?**

🔎 Facts:
- The executor is the project's own process across a network: compose service `analytics`,
  reached at `analytics.base-url` (`application.properties:75`, `docker-compose.yml:48`).
- Port: `POST /internal/v1/execute`, bearer token, wrapper `{profileId, plan}`
  (`AnalyticsClient.java:67-72`, `main.py:30-39`, `:72-82`, `auth.py:16-29`).
- Production adapter: the FastAPI app under uvicorn (`analytics/Dockerfile:36`, CMD).
- Test adapters: a JDK `HttpServer`, written out twice (`AnalyticsClientTest.java:48-69`,
  `InsightExecuteControllerTest.java:58-74`); a closed port for "down", also written twice
  (`AnalyticsClientTest.java:201-206`, `InsightExecuteUnavailableTest.java:34-41`).
- The Python suite exercises the production adapter in-process through FastAPI's `TestClient`
  (ASGI, not uvicorn): `test_execute_api.py:25-33`.

➡️ *Ports & adapters*. Two adapters, so the seam is real (brief's seam discipline). The work is
fidelity and duplication, not existence: the deletion test keeps the double, since without it
delay, non-JSON and 401 injection would need the real service.

⚖️ Strongest argument against: the backend forwards plans opaquely (`docs/API.md:1456-1462`),
so little contract can drift. The h2c incident is the counter-example: the drift that shipped
was in the transport, which "opaque forwarding" does not protect.

✅ Decision: as recommended. Unblocks Q6, Q7.

---

❓ **Q3** - **What does the JDK `HttpServer` do with an `Upgrade: h2c` header, and what does the
JDK `HttpClient` send?**

🔎 Facts:
- `javap -v -p 'sun.net.httpserver.ServerImpl$Exchange'` (JDK 21.0.12): the string constants
  are `Connection`, `close`, `keep-alive`, `Keep-Alive`, `Connection: close\r\n` and the SSL
  message; there is no `Upgrade` and no `h2c`. `ExchangeImpl` holds `Connection`, `close`,
  `Connection: close requested by handler`. `ServerImpl` holds none.
- `ServerImpl.java` in `openjdk/jdk21u` (GitHub): the request's `Connection` header is inspected
  only for `close` (and `keep-alive` on HTTP/1.0); the file never mentions `Upgrade`;
  `Expect: 100-continue` is honoured; conflicting `Content-Length`/`Transfer-Encoding` is
  rejected with 400.
- So the JDK server ignores an upgrade offer and dispatches the request to the context's
  handler as plain HTTP/1.1, for every method. The handler can read the header: the current
  test already records it (`AnalyticsClientTest.java:54`).
- Client side (`openjdk/jdk21u`): for a request whose version is `HTTP_2` with no existing
  HTTP/2 connection, `ExchangeImpl` creates an HTTP/1.1 exchange and calls
  `exchange.h2Upgrade()`; `HttpRequestImpl.setH2Upgrade` sets `Connection: Upgrade,
  HTTP2-Settings`, `Upgrade: h2c` and `HTTP2-Settings`; no condition on method or body was
  found. A non-101 answer is returned as the normal response (`Exchange.checkForUpgradeAsync`).
  The client's default version is `HTTP_2` (the reason for the pin at
  `AnalyticsClient.java:45-54`).
- Commit `a02bc94`: the guard test "Verified red before the fix, green after" with
  `.version(HTTP_1_1)` temporarily reverted. So the default client does send the header on
  these POSTs through `JdkClientHttpRequestFactory`.

➡️ The JDK server cannot be *configured* to refuse upgrades, but a handler can refuse them
explicitly, with no new dependency.

⚖️ Strongest argument against: a handler-level refusal imitates the executor rather than
reproducing its parser. Reproducing uvicorn's parser needs uvicorn; the imitation only has to
produce the same observable result for the backend (Q4).

✅ Decision: the double's handler refuses any request that carries an `Upgrade` header (details
in Q12). Unblocks Q6, Q12.

---

❓ **Q4** - **What does the shipped executor do with a POST that offers an h2c upgrade?**

🔎 Facts:
- The image runs `uvicorn analytics.main:app --host 0.0.0.0 --port 8000`
  (`analytics/Dockerfile:36`), so `--http auto`. uvicorn's `protocols/http/auto.py` selects
  `HttpToolsProtocol` whenever `httptools` imports; `uvicorn[standard]` installs it
  (`pyproject.toml:11`; `uv.lock`: httptools 0.8.0).
- httptools 0.8.0 `parser.pyx`: `cb_on_headers_complete` returns `1` whenever the parser's
  `upgrade` flag is set. llhttp's README: returning 1 means "Assume that request/response has
  no body, and proceed to parsing the next message"; for an Upgrade request `HPE_PAUSED_UPGRADE`
  is returned "after fully parsing the request". `feed_data` then resumes the parser and raises
  `HttpParserUpgrade` (`parser.pyx:233-246`).
- uvicorn `httptools_impl.py`: `on_headers_complete` has already started the ASGI cycle, since
  `_should_upgrade()` is true only for websocket (`:166-168`, `:248-297`). `data_received`
  catches `HttpParserUpgrade` and, for anything but websocket, only logs `Unsupported upgrade
  request.` (`:170-184`). The POST body is never delivered to the app. Bytes fed afterwards are
  parsed as a new request; a JSON body is not a request line, so `HttpParserError`, and
  `send_400_response("Invalid HTTP request received.")` writes `400`,
  `content-type: text/plain; charset=utf-8`, `connection: close` (`:174-178`, `:202-216`).
  If the body arrives in the same read as the headers, the leftover is simply dropped, the app
  waits for a body that never comes, and the backend's 10 s read timeout fires.
- The incident, commit `eafc8f8`: uvicorn logged "Unsupported upgrade request" / "Invalid HTTP
  request received"; the backend reported "not JSON", so `AnalyticsUnavailableException` and 503
  for every call. That matches the 400 text/plain path: `AnalyticsClient` treats a 400 as a
  problem list, fails to parse it, and throws the 503 (`AnalyticsClient.java:73-75`, `:100-117`).
- Locked versions then and now are identical: uvicorn 0.52.4, httptools 0.8.0, h11 0.16.0
  (`git show eafc8f8:analytics/uv.lock`, current `uv.lock:330-331`, `:352-353`, `:981-982`).
- The h11 path (used only without httptools) logs the same warning and serves the request
  (`h11_impl.py:140-171`); it is not what ships.
- Not executed: this chain is read from source, and it agrees with the incident record.

➡️ The recorded failure mode of the shipped executor is `400`, `text/plain`,
`Invalid HTTP request received.`, `Connection: close`, which the backend reports as 503. The
double reproduces exactly that.

⚖️ Strongest argument against: the other branch (headers and body in one read) ends in a
timeout, not a 400. Both end in 503 for the backend. The double picks the branch the incident
actually showed, and the test's point is "the call fails", which both branches satisfy.

✅ Decision: as recommended. Unblocks Q6, Q12.

---

❓ **Q5** - **What does FastAPI answer, and in which order, for a malformed body, a wrong token,
a malformed wrapper and a wrong method?**

🔎 Facts (FastAPI 0.141.1, Starlette 1.6.0):
- `fastapi/routing.py:425-469`: the body is read first. When the content type is JSON (or
  `+json`), it is decoded; a `JSONDecodeError` becomes a 422 (`json_invalid`) *before*
  dependencies. `strict_content_type` defaults to true (`:389`, `:437-439`), so with no content
  type, or a non-JSON one, the body is not decoded and stays bytes.
- Then `solve_dependencies` (`routing.py:481-488`): sub-dependencies first
  (`dependencies/utils.py:619-676`, where `require_token` raises the 401), then body validation
  (`:697-708`); collected errors become a 422 (`routing.py:751-755`).
- Bodies: `HTTPException` becomes `{"detail": exc.detail}` (`fastapi/exception_handlers.py:11-17`),
  so a bad or missing token gives `401 {"detail":"Missing or invalid bearer token"}`
  (`auth.py:26-29`; missing and wrong are the same because `auto_error=False`, `auth.py:11-13`).
  `RequestValidationError` becomes `422 {"detail": [...]}` (`exception_handlers.py:20-26`). A
  wrong method raises `HTTPException(405, headers={"Allow": ...})` inside the app
  (`starlette/routing.py:271-278`), rendered as `{"detail": ...}` with an `Allow` header.
- `ExecuteRequest`: `profile_id: int` (alias `profileId`) and `plan: Any`, both required; extra
  keys ignored (`main.py:30-39`).
- `PlanProblems` gives `400 {"problems": [...]}` (`main.py:42-46`); anything else gives
  `500 {"problems": ["an unexpected error occurred"]}` (`main.py:49-69`).
- Serialization: Starlette's `JSONResponse` is compact (`starlette/responses.py:194-201`); the
  route's `dict` return goes through Pydantic's `serialize_json` fast path
  (`routing.py:719-747`), also compact. The backend parses whatever it gets
  (`AnalyticsClient.java:100-107`) and re-serializes through Spring's Jackson.

➡️ The executor's order is: JSON decode, then token, then wrapper validation, then the plan.
The double checks in the same order.

⚖️ Strongest argument against: modelling the decode-before-token order is fidelity for
requests the backend never sends (malformed JSON). It costs nothing: the double must decode the
body to check the wrapper anyway.

✅ Decision: as recommended. Unblocks Q6, Q11.

---

## Round 2: what "faithful" means, and where it is proved

Frontier: Q6 (needs Q3, Q4, Q5), Q7 (needs Q1, Q2), Q8 (needs Q1, Q2).

❓ **Q6** - **What does "faithful" mean concretely? Which behaviours must the double share, and
which are out of reach?**

🔎 Facts: Q3 to Q5. The four known infidelities: the token is stored, never checked
(`AnalyticsClientTest.java:53`); any body is accepted; the h2c header is tolerated (commit
`eafc8f8`); canned wording the executor never emits (`InsightExecuteControllerTest.java:175`,
"version: 7 is not supported" against `validation.py:115`'s "version: unsupported plan version
7"); and a plan with a `profileId` field answered 200 (`InsightExecuteControllerTest.java:133-142`)
where the executor answers 400 `profileId: unknown field` (`validation.py:52-54`).

➡️ **Shared**, in the executor's order, for every request the backend could plausibly send:
1. *Transport*: HTTP/1.1 only. A request carrying `Upgrade` is refused as the shipped executor
   refused it (Q4).
2. *Route*: `POST` on the execute path. Another method gives 405; another path gives the JDK
   server's own 404 (the body differs from FastAPI's `{"detail":"Not Found"}`, and the backend
   reads neither).
3. *Decoding*: JSON content type with a malformed body gives 422.
4. *Token*: a missing or wrong bearer token gives 401 with FastAPI's body.
5. *Wrapper*: a non-JSON content type, a non-object body, a `profileId` that is not an integer,
   or no `plan` member gives 422 `{"detail": [...]}`. The list content is not reproduced.
6. *The answer to a plan*: the recorded status and body for that plan in the current database
   state.
7. *Wording*: every body the backend *reads* comes from a recorded exchange proved by the Python
   suite. Bodies the backend never reads (401, 422, 405, the upgrade refusal) are written in the
   double, each citing its source.

**Out of reach**, and where each is covered:
- Computing an envelope for a plan nobody recorded. The double fails the test instead; the
  Python goldens own computation.
- Answers that depend on a profile's data. The double checks `profileId`'s type, never its
  value; profile scoping is proved in Python (`test_execute_api.py:47-56`) and, for the
  forwarded id, in the backend.
- The route's own clock. Exchanges must not depend on it (Q9).
- uvicorn's real parser, timing and keep-alive, and real database failures. The e2e job covers
  the real pair; a recorded "database failing" exchange covers the 500 body.
- Pydantic's lax coercion (a `"3"` string accepted as `profileId`). The double is stricter; the
  backend always sends a JSON integer (`AnalyticsClient.java:69`).

⚖️ Strongest argument against: every added refusal is test-support code with its own bugs. Each
rule is a few lines, each corresponds to a way the backend could regress, and one of them (the
upgrade) already shipped a production bug.

✅ Decision: as listed. Unblocks Q9, Q11.

---

❓ **Q7** - **Should any backend test run against the real Python process? What would it cost
`./mvnw verify` and CI?** Options: (a) Testcontainers `GenericContainer` built from
`analytics/Dockerfile` during `mvn verify`, on a shared network with the backend's Postgres;
(b) a compose-based Testcontainers setup; (c) none: recorded exchanges proved by the Python
suite, plus the existing e2e job.

🔎 Facts:
- The backend CI job runs only `./mvnw -B verify` on a JDK runner (`ci.yml:9-19`); no Python
  toolchain. Building the analytics image resolves dependencies with `uv sync` twice
  (`analytics/Dockerfile:17`, `:21`), a network-bound cold build on every CI run.
- The backend's Postgres is a `@ServiceConnection` bean without a shared network
  (`TestcontainersConfiguration.java`). An analytics container needs a `DATABASE_URL` reaching
  it as the `myfinance_ro` role that V4 creates (`docs/SCHEMA.md:505-514`).
- Every local `./mvnw verify` would build a Python image as well; the Java suite would depend
  on the Python toolchain's image.
- The e2e job already runs the real backend and executor together: 4 Insight specs
  (`frontend/e2e/smoke.spec.ts:319`, `:412`, `:497`; `insights-merchant.spec.ts:86`), all
  success paths, all on `interval: month`.
- It was the e2e job that caught the h2c bug (commit `eafc8f8`).

➡️ (c). Recorded exchanges verified by the Python suite give the request/response pairing; the
double's refusals give the transport and token behaviour; the e2e job stays the one real-pair
run.

⚖️ Strongest argument against: only a real process proves real uvicorn behaviour, which is where
the one shipped bug lived. True, and the e2e job does that on every push. Duplicating it in
`mvn verify` couples two builds for no new failure it could catch that the e2e job does not.

✅ Decision: (c). Optional follow-up, not in scope: one e2e spec that drives a rejected plan (a
400) through the real pair.

---

❓ **Q8** - **Where do the exchanges live so that both suites read the same files, and which
suite proves them true?** Options: (a) the backend's test resources (classpath), read by the
Python suite across the tree; (b) the analytics test fixtures, read by Maven across the tree
(an extra `<testResources>` entry or a relative path); (c) a new top-level directory.

🔎 Facts:
- Precedent: the analytics harness already reads backend-owned files across the tree,
  `REPO_ROOT / "backend" / "src" / "main" / "resources" / "db" / "migration"`
  (`conftest.py:47-48`), because "the executor is only ever trusted against the schema the
  backend actually ships" (`conftest.py:3-6`).
- Java idiom: test data on the classpath; Spring's `PathMatchingResourcePatternResolver` lists
  `classpath:<dir>/*.json` (spring-core, already a dependency). `backend/src/test/resources`
  does not exist yet; it is Maven's default test-resource directory, picked up with no
  configuration.
- The backend image copies only `backend/src` and skips test execution
  (`backend/Dockerfile:11-12`); the analytics image excludes `tests/`
  (`analytics/.dockerignore:5`). Neither image needs the files.
- CI has no path filters (`ci.yml:3-6`): every job runs on every push, so a change to a file
  under `backend/` runs the analytics job too.
- The suite that runs the real app, real validation and real Postgres is the analytics suite
  (`test_execute_api.py` style, `TestClient` plus the `conn` fixture).

➡️ (a). A directory of exchange files in the backend's test resources; the analytics suite
proves each file against the real route; the backend's double replays them. An executor wording
change fails the analytics job with the file's name; updating the file needs no Java edit,
because the backend's tests read their expectations from the exchange.

⚖️ Strongest argument against: the files describe the executor's behaviour, so ownership says
they belong under `analytics/`. Placing them there needs non-default Maven configuration or a
path-relative read in Java, both less idiomatic than a classpath resource; and the repository
already shares files in exactly this direction.

✅ Decision: (a); directory name `plan-executor-exchanges`. Unblocks Q9, Q14.

---

## Round 3: the exchanges and the double

Frontier: Q9 (needs Q6, Q8), then Q10 (needs Q9); Q11 (needs Q5, Q6, Q8), Q12 (needs Q3, Q4,
Q11), Q13 (needs Q11).

❓ **Q9** - **What is in an exchange file, and what does the double match on?**

🔎 Facts:
- The backend test's session profile id comes from the backend's own test database
  (`TestFixtures`, `DatabaseCleaner.java:16`), unrelated to the analytics seed's profile 1.
- The route reads its own clock (`main.py:81`), which is why the route tests restrict themselves
  to absolute ranges (`test_execute_api.py:1-2`). `postprocess` derives the current bucket from
  today (`postprocess.py:259`), which affects forecast fallback and drift.
- Jackson compares `IntNode(1)` and `LongNode(1)` as unequal, so the incoming wrapper and the
  files must be parsed by one mapper.

➡️ One JSON object per file, four members:
- `database`: `"seeded"` or `"failing"`, the executor's database state during the exchange.
- `plan`: the plan JSON as the backend would forward it.
- `status`: the HTTP status.
- `body`: the response body as JSON.

The file name is the exchange's name, in kebab case, describing the behaviour. The double's
matching key is (current database state, plan), with the plan compared as JSON trees parsed by
the double's one `JsonMapper`; `profileId` is checked for type and never matched by value. Two
files with the same key make the double refuse to start. **Clock rule:** an exchange's plan uses
an absolute range or no time axis, and no forecast, and is not a `timeseriesSplit`. The Python
verifier enforces this. Files are stored pretty-printed; the double sends the body in Jackson's
compact form and exposes that exact text to tests.

⚖️ Strongest argument against: matching on the plan forces every backend test to send a recorded
plan, which is more ceremony than today's "any plan, canned answer". That ceremony *is* the
fidelity: today's canned answers are how "version: 7 is not supported" and the 200 for a
smuggled `profileId` got in.

✅ Decision: as recommended. Unblocks Q10, Q11, Q14.

---

❓ **Q10** - **Which exchanges, with exact contents?**

🔎 Facts: seed rows (`fixtures/seed.sql:28-46`): profile 1, Groceries (10) with Lidl (11) and
Biedronka (12). PLN expenses in 2026-06..2026-08: 103 Lidl 100.00 on 07-05, 104 Biedronka 50.00
on 07-20, 105 Lidl 200.00 on 08-03. Row 109 is EUR (excluded by a PLN filter). The echo writes
`version, metric, filters{categoryId, includeDescendants, currency}, groupBy, interval, range`
in that order (`plan.py:86-104`); a result entry is `currency, shape, points`
(`executor.py:71`, `:113`). With fewer than 6 points the anomaly pass flags nothing
(`postprocess.py:126-127`). A non-split timeseries gets no drift (`:264-268`). Validation
touches the database first through the `categoryId` lookup (`validation.py:144-149`, `:189-196`).

➡️ Five exchanges. The backend tests need no others.

| Name | database | plan | status | body |
|---|---|---|---|---|
| `executes-a-monthly-timeseries` | seeded | spend; filters categoryId 10, includeDescendants true, currency PLN; groupBy null; interval month; range absolute 2026-06-01 … 2026-08-31 | 200 | the envelope below |
| `rejects-an-unknown-category` | seeded | `{"version":1,"metric":"spend","filters":{"categoryId":999},"range":{"type":"all"}}` | 400 | `{"problems":["filters.categoryId: 999 does not exist in this profile"]}` |
| `rejects-an-unsupported-version` | seeded | `{"version":7,"metric":"spend","range":{"type":"all"}}` | 400 | `{"problems":["version: unsupported plan version 7"]}` |
| `rejects-a-profile-id-inside-the-plan` | seeded | `{"version":1,"metric":"spend","range":{"type":"all"},"profileId":999999}` | 400 | `{"problems":["profileId: unknown field"]}` |
| `fails-when-the-database-fails` | failing | same plan as the first row | 500 | `{"problems":["an unexpected error occurred"]}` |

The first exchange's body, compact:

```json
{"plan":{"version":1,"metric":"spend","filters":{"categoryId":10,"includeDescendants":true,"currency":"PLN"},"groupBy":null,"interval":"month","range":{"type":"absolute","from":"2026-06-01","to":"2026-08-31"}},"results":[{"currency":"PLN","shape":"timeseries","points":[{"period":"2026-06","value":"0.0000"},{"period":"2026-07","value":"150.0000"},{"period":"2026-08","value":"200.0000"}]}],"meta":{"truncatedGroups":false}}
```

Why each: the first is a real envelope with a zero-filled bucket (the existing `"0.0000"`
pass-through check survives), nested arrays for the verbatim check, and no dependence on the
clock. The second is the rejection the backend tests already use, now proved. The third is the
exchange `test_execute_api.py:59-66` already asserts byte for byte; it fixes the wrong wording.
The fourth is what the real executor says to a smuggled `profileId`. The fifth is the one non-400
answer whose body also carries `problems`: the trap for a client that classifies by body.

Not recorded: 401, 422, 405 and the upgrade refusal. The backend never reads those bodies (Q6,
rule 7).

⚖️ Strongest argument against: the 500 needs a second database state, which complicates the
format for one file. It is also the only way to prove the executor's 500 body. Without it the
backend would have no test that a `problems`-carrying 500 stays a 503; today it has none.

✅ Decision: these five. The four strings in them are the facts candidate 9 must keep
byte-identical. Unblocks Q14, Q15.

---

❓ **Q11** - **The double's interface: lifecycle, fault injection, unmatched plans, recorded
requests.** Options: (a) a plain class, with each test class calling start, reset, stop and an
"all requests matched" assertion itself; (b) a JUnit 5 extension held in a static field, which
starts the server when the field is initialized, resets before each test, fails a test that sent
an unrecorded plan, and stops after the class; (c) WireMock or OkHttp's MockWebServer.

🔎 Facts:
- Today: `AnalyticsClientTest` starts in `@BeforeAll` and resets in `@BeforeEach`
  (`:48-69`, `:76-86`); `InsightExecuteControllerTest` starts in a static initializer so the
  server exists before Spring builds the context, and points `analytics.base-url` at it through
  `@DynamicPropertySource` (`:51`, `:76-81`); both stop in `@AfterAll`.
- The controller test's context gets `analytics.token` from
  `${ANALYTICS_TOKEN:dev-analytics-token}` (`application.properties:76`), so an exported
  environment variable would change it.
- JUnit 5 is on the test classpath via the Spring Boot test starters (`pom.xml:67-96`).
  `@RegisterExtension` on a static field is JUnit's standard way to register a programmatically
  built extension (WireMock's JUnit 5 support uses the same pattern).
- No HTTP-double library is in `pom.xml`.

➡️ (b). `PlanExecutorDouble`'s interface, everything a test must know:
- A static factory that binds `127.0.0.1` on a free port, loads every exchange from the
  classpath, and throws at once if it finds none or finds a duplicate key. It answers until
  the class ends.
- The accepted token (a constant) and the base URL.
- A lookup by exchange name returning the recorded plan (JSON), the status, and the exact body
  text the double sends.
- Per-test state, reset before each test: database state "seeded", no delay, no fault, no
  recorded requests.
- `databaseFails()`: answer from the "failing" exchanges for the rest of the test.
- A delay before answering (for the read-timeout tests).
- A non-JSON answer for the next call: a 200 with an HTML page, labelled as what a proxy in
  front of the executor might return, never an executor answer.
- The wrapper bodies received during the test, in order (for the profile-id and "never called"
  assertions).
- A static unreachable base URL: loopback on a port that was free a moment ago (today's
  closed-port helper, now shared).
- An unrecorded plan: the double answers 500 with a `problems` body saying no exchange is
  recorded, remembers the plan, and after the test fails it with a message quoting the plan and
  listing the recorded names. A bare 503 in a MockMvc assertion would not explain itself.
- Checks in the executor's order (Q5): upgrade, method, JSON decode, token, wrapper, plan.

⚖️ Strongest argument against: an extension that fails tests after the fact is less explicit
than a visible assertion. It is conventional JUnit 5, it removes three lifecycle methods from
each class, and "an unrecorded plan fails the test" is too important to leave to each class
remembering to assert it.

✅ Decision: (b). No new dependency. Unblocks Q12, Q13, Q15.

---

❓ **Q12** - **How is the upgrade refused, and what becomes of the h2c regression guard?**

🔎 Facts: Q3, Q4. The guard today asserts only that the recorded `Upgrade` header is null, and
says of itself that it "can only catch a revert by asserting on the request it received, not by
the call failing" (`AnalyticsClientTest.java:106-119`, quote at `:111-112`). The comment in
production code says "The in-process JDK HttpServer used by AnalyticsClientTest tolerates the
same upgrade header" (`AnalyticsClient.java:48-50`).

➡️ The handler drains the request body, then answers `400` with
`Content-Type: text/plain; charset=utf-8`, body `Invalid HTTP request received.` and
`Connection: close`: the shipped executor's recorded answer. The guard test is rewritten into
two assertions:
1. A JDK `HttpClient` left at its default version posts a recorded plan to the double over plain
   http and is refused (400, that text), which proves the double would catch an upgrade offer.
2. `AnalyticsClient`'s call on the same double returns the envelope.

A revert of the HTTP/1.1 pin now fails every test that calls the double, the way production
failed. The `lastUpgradeHeader` field and its assertion go. The production comment's last
sentence changes to say the test double refuses upgrade offers the way the shipped executor
did.

⚖️ Strongest argument against: assertion 1 tests the test double. Without it, a broken refusal
would silently remove the guard; one self-check of a support class is cheap insurance for the
one rule that has already shipped a bug.

✅ Decision: as recommended.

---

❓ **Q13** - **Where does the double live, and what is it called?**

🔎 Facts: test support lives in `com.myfinance.backend.support` (`IntegrationTest`,
`TestFixtures`, `TestcontainersConfiguration`, `DatabaseCleaner`). The domain term is "Plan
executor" (brief §7); the backend's code says "analytics service" (`AnalyticsClient`,
`AnalyticsUnavailableException`, `analytics.base-url`).

➡️ `PlanExecutorDouble` in the support package, its Javadoc saying it stands in for the analytics
service's plan executor. Exchanges in `plan-executor-exchanges`.

⚖️ Strongest argument against: `AnalyticsDouble` would match `AnalyticsClient`. The domain term
names what is doubled, not the Java class that calls it.

✅ Decision: as recommended.

---

## Round 4: the verifier, tests, order, docs, edges, siblings

Frontier: Q14 to Q21.

❓ **Q14** - **The Python verifier.**

🔎 Facts:
- Overrides prior art: `test_execute_api.py:25-33` (`get_conn` becomes the `conn` fixture;
  `get_settings` a namespace with `tz` and `analytics_token`).
- A 500 through `TestClient` needs `raise_server_exceptions=False`, or the exception is
  re-raised into the test (`test_error_handling.py:1-8`, `:31-35`).
- Failing-connection prior art: `ExplodingConn.cursor()` raises (`test_error_handling.py:38-42`),
  but takes no arguments. Candidate 9's step 3 adds `row_factory=` to the executor's cursor
  call.
- A pytest parametrization over an empty list is reported as skipped, not failed.
- The seeded profile is 1 (`fixtures/seed.sql:10-12`).

➡️ A new route-level test module:
- One parametrized test over the exchange files, sorted, with the file names as ids.
- Before each run, the exchange's plan is checked against the clock rule (Q9); a violation fails
  with a message.
- A `TestClient` with `raise_server_exceptions=False`; settings overridden with a test token and
  `tz` UTC.
- The connection overridden with the `conn` fixture for `seeded`, or with a small failing
  stand-in whose `cursor(*args, **kwargs)` raises, for `failing`.
- A POST of `{"profileId": 1, "plan": <plan>}` with the bearer token. Assert the status, and
  assert the parsed JSON body equals the file's `body`.
- A missing or empty exchange directory is a failure, never an empty parametrization.
- Overrides cleared afterwards.

⚖️ Strongest argument against: comparing parsed JSON rather than bytes lets key order drift
unseen. The backend parses and re-serializes anyway; the byte-for-byte guarantee that matters is
the backend's own pass-through, asserted on the Java side against the double's exact text.

✅ Decision: as recommended.

---

❓ **Q15** - **Which assertions in the three Java test classes change because the double starts
refusing things it used to accept?**

🔎 Facts: the three classes as read (`AnalyticsClientTest.java:96-199`,
`InsightExecuteControllerTest.java:107-205`, `InsightExecuteUnavailableTest.java:62-71`); the
exchanges of Q10; the double of Q11; the controller context's token source
(`application.properties:76`).

➡️

`AnalyticsClientTest` (9 tests, becomes 10):

| Test | Change |
|---|---|
| wraps the plan with the profile id and sends the bearer token | Sends the recorded timeseries plan; asserts the received wrapper's `profileId` is 3 and its `plan` equals the sent plan. The token is proved by the double accepting the call. Rename, since "sends the bearer token" is now implicit. |
| never sends an h2c upgrade | Rewritten per Q12. |
| returns the envelope verbatim | Recorded timeseries exchange; asserts the result equals the double's exact body text; spot check `"0.0000"` at 2026-06 instead of `"1243.5000"`. |
| maps an executor rejection to InvalidPlan | Recorded unknown-category exchange; expected problems read from the exchange. |
| maps an unexpected status (canned 401) | A client built with a wrong token; the double's own 401 gives `AnalyticsUnavailableException`. No canned 401. |
| maps an unreachable service | Unchanged apart from the shared unreachable URL. |
| maps a 200 with a non-JSON body | Uses the double's non-JSON (proxy page) fault. |
| slower than the read timeout / inside the read timeout | Use the double's delay; the plan is the recorded timeseries plan. |
| **new**: an executor failure is AnalyticsUnavailable, not InvalidPlan | `databaseFails()`, then the recorded timeseries plan; the 500 body carries `problems` and must still become `AnalyticsUnavailableException`. |

`InsightExecuteControllerTest` (8 tests, stays 8). `@DynamicPropertySource` also registers
`analytics.token` as the double's token.

| Test | Change |
|---|---|
| returns the envelope verbatim | Posts the recorded plan; the content equals the double's exact body text; `jsonPath` spot check on the zero-filled point. |
| forwards the session profile and the plan | Asserts the forwarded `profileId` is the session profile's id and the forwarded plan equals the posted plan. |
| a profile id smuggled into the body is ignored | Posts the recorded smuggled-id plan. Now expects 400 `/errors/invalid-plan` with the exchange's `profileId: unknown field`, **and** still asserts the forwarded `profileId` is the session's, not 999999. Renamed to say it is neither trusted nor accepted. |
| non-object body is 400 without calling analytics | Unchanged; "not called" is the double's empty request list. |
| executor rejection is 400 with problems passed through | Recorded unknown-category exchange; problems read from it. |
| unsupported version is the executor's rejection | Recorded version-7 exchange; the wording becomes `version: unsupported plan version 7`, read from the file. |
| without active profile is 409; unauthenticated is 401 | Unchanged; they never reach the double. |

`InsightExecuteUnavailableTest` (1): unchanged behaviour; its closed-port helper is replaced by
the double's static unreachable URL.

⚖️ Strongest argument against: the smuggled-id test changes its expected status from 200 to 400,
which reads like weakening a security test. The security assertion (the forwarded id is the
session's) is kept verbatim; only the executor's answer becomes the real one.

✅ Decision: as tabled.

---

❓ **Q16** - **Which Python tests are replaced by the verifier?**

🔎 Facts: `test_execute_api.py:36-44` (a 200 for the value-shape plan `AUGUST_GROCERIES`),
`:59-66` (version 7: the same request and body as the recorded exchange), `:47-56`, `:69-74`,
`:77-79` (profile scoping, non-object plan, token); `test_error_handling.py:45-55` (the 500
body), and its two tests on leaking and logging.

➡️ Replaced ("replace, don't layer"):
- `test_execute_api.py`'s route success test: the timeseries exchange asserts a full 200 body.
- `test_execute_api.py`'s version-7 rejection: the identical exchange.
- `test_error_handling.py`'s 500-body test: the "failing" exchange.

Kept: `test_execute_api.py`'s profile-scoping (profile 2), non-object plan and token-required
tests; `test_error_handling.py`'s "never repeats the exception message" and "logged server-side";
`test_execute.py`; `test_health.py`.

⚖️ Strongest argument against: the value-shape success test used a different plan
(`AUGUST_GROCERIES`). Its value is covered by the goldens; its route-level role (a 200 with an
envelope) is covered more strongly by the exchange. `AUGUST_GROCERIES` stays in use by the
profile-scoping test.

✅ Decision: as listed.

---

❓ **Q17** - **The small first step: merging the two copies into one support class. What is it
worth on its own?**

🔎 Facts: two JDK `HttpServer` stubs (`AnalyticsClientTest.java:48-74`,
`InsightExecuteControllerTest.java:58-86`) and two closed-port helpers
(`AnalyticsClientTest.java:201-206`, `InsightExecuteUnavailableTest.java:34-41`), about 60 lines
between them.

➡️ Step 1 moves them into the support class, behaviour-preserving: still scripted responses,
still permissive, same assertions, same counts. Worth on its own: one home for the double and
one for "down", so every later fidelity rule is written once; zero risk. Modest by itself; it is
the foundation, and the owner can stop here if the rest is not wanted.

⚖️ Strongest argument against: a support class that is still permissive gives no fidelity. True;
that is steps 3 and 4.

✅ Decision: as recommended.

---

❓ **Q18** - **The order of steps, each leaving `./mvnw verify` and the analytics gate green.**

➡️
1. *One double, same behaviour.* Merge the two stubs and the two closed-port helpers into
   `PlanExecutorDouble` (scripted answers, recorded requests). Backend green; no assertion
   changes.
2. *Record and prove the exchanges.* Add the five files to the backend's test resources and the
   Python verifier; delete the three replaced Python tests. Add the ARCHITECTURE.md §5 clause.
   Analytics green; the backend does not read the files yet.
3. *Replay.* The double answers by (database state, plan) from the files, and an unrecorded plan
   fails the test. The backend tests switch to recorded plans and expectations: wording fixed,
   smuggled-id test becomes 400 plus the scoping assertion, new 500 test. Rewrite the Backend
   bullet of INSIGHTS.md "Testing strategy". Backend green.
4. *Refuse what the executor refuses.* Token (with the controller test registering
   `analytics.token`), JSON decoding and wrapper, method, and upgrade offers. The h2c guard is
   rewritten and the `AnalyticsClient` comment updated; the Testing strategy bullet is
   completed. Backend green.

⚖️ Strongest argument against: steps 3 and 4 could be one. Keeping them apart separates "the
answers are real" from "the refusals are real", and each step's failures point at one idea.

✅ Decision: as listed.

---

❓ **Q19** - **Docs, and is an ADR warranted?**

🔎 Facts: `docs/INSIGHTS.md:458-460` ("Backend: … execute proxying, 503 when analytics is down
(stub server)"); `ARCHITECTURE.md:352-354` (the analytics CI job's description); `docs/API.md`
and `docs/SCHEMA.md` describe nothing this candidate changes.

➡️ Update `docs/INSIGHTS.md` "Testing strategy" (Backend bullet, which also defines "recorded
exchange") and `ARCHITECTURE.md` §5 (the analytics job also proves the recorded exchanges the
backend's tests replay). No change to `docs/API.md` or `docs/SCHEMA.md`. No ADR: this is test
infrastructure, easy to reverse, and its recorded home is INSIGHTS.md's testing strategy.
"Recorded exchange" is test vocabulary, so it goes into that document rather than the domain
glossary.

⚖️ Strongest argument against: a cross-job dependency recorded only as a clause in
ARCHITECTURE.md is easy to overlook, and an ADR would be more visible. The brief's repo rule
forbids a second source of truth, and the clause sits exactly where someone editing the CI jobs
reads.

✅ Decision: as recommended. Texts in `docs-proposals.md`.

---

❓ **Q20** - **Edge cases and failure modes, with concrete scenarios.**

🔎 Facts: Q3 to Q14. The JDK servers are created without an executor
(`AnalyticsClientTest.java:50`, `InsightExecuteControllerTest.java:60`), so one handler runs at a
time. The backend's tests configure no parallel execution (no test resources directory, no
parallel setting in `pom.xml`).

➡️
- *Exchange directory missing or empty*: the Python verifier fails; the Java double refuses to
  start, so every test using it errors with the reason.
- *Two files with the same (database, plan)*: the double refuses to start, naming both.
- *An exchange that depends on the clock* (say `lastMonths`): the verifier rejects it before
  posting; otherwise it would flake on the first of a month.
- *Seed data changes*: the timeseries exchange fails in Python; the file is updated; the Java
  tests follow automatically, since they read the file.
- *An executor wording change* (candidate 9 by mistake, or on purpose): the analytics job fails
  naming the exchange; a deliberate change updates the file and the backend follows.
- *A backend test posts an unrecorded plan*: 500 from the double, then an after-test failure
  quoting the plan.
- *`ANALYTICS_TOKEN` exported in a developer's shell*: harmless, because the controller test
  registers the double's token explicitly.
- *A revert of the HTTP/1.1 pin*: every double-backed test fails with 503, and the guard's
  message explains why.
- *Delay tests*: the JDK server's default executor runs one handler at a time; a request that
  times out leaves the handler sleeping for its remaining delay. Unchanged from today; the tests
  run sequentially (no parallel configuration in the backend's tests).
- *Refusing without reading the body*: the double drains the body before answering, so the
  client's write does not fail first.
- *Spring context caching*: each class with `@DynamicPropertySource` gets its own context; after
  the class the double is stopped while the cached context remains. Harmless, since nothing else
  uses that context.
- *Non-ASCII in bodies*: none in the five exchanges. Jackson and Starlette both write raw UTF-8;
  the Python side compares parsed JSON.

⚖️ Strongest argument against: the unrecorded-plan failure is raised after the test's own
assertion has already failed, so the first message a developer reads is still a status mismatch.
JUnit attaches the extension's message (quoting the plan) to the same report. That is the
clearest option short of throwing inside the request, which would only turn the answer into a
dropped connection.

✅ Decision: all resolved by the decisions above.

---

❓ **Q21** - **Cross-candidate effects.**

🔎 Facts: brief §8; candidate 9's decisions (its grilling log, Q20); `AnalyticsClient.java:83`
(the post method still takes a path); `analytics/tests/envelopes.py` (no importers: `grep` for
`envelopes` finds only its own docstring and the golden test's prose).

➡️
- **Candidate 9 (internal seams).** The shared fact is the problem strings. The exchanges carry
  `filters.categoryId: 999 does not exist in this profile`, `version: unsupported plan version 7`,
  `profileId: unknown field` and `an unexpected error occurred`. Candidate 9 must keep them (and
  every other string) byte-identical; this candidate's verifier is a tripwire for its validation
  refactor. The failing stand-in accepts any cursor arguments because candidate 9 adds
  `row_factory=`. File sets are disjoint: this candidate removes tests from `test_execute_api.py`
  and `test_error_handling.py` and adds a module; candidate 9 changes `main.py`'s call and does
  not touch those files. Recommended order: this candidate's steps 1–2 before candidate 9's
  step 5; otherwise independent.
- **Candidate 17 (housekeeping).** `AnalyticsClient.post(String path, ...)`'s vestigial path
  parameter and the unused `analytics/tests/envelopes.py` are its. The latter is not reused
  here: its envelopes are hand-written and never executed, which is what recorded exchanges
  replace.
- **Candidate 8 (msw at the frontend network seam).** The frontend sees the backend's HTTP
  interface, which passes the executor's envelope through verbatim. An msw handler for a
  successful execute may reuse the timeseries exchange's body. Optional, not designed here.
- **Candidate 13 (sessions in Postgres).** It changes `IntegrationTest`'s containers; the double
  does not depend on sessions. No conflict.
- **Candidates 1 and 15.** The controller tests use `fixtures.in(profile)` and a `JsonNode`
  endpoint; neither candidate changes what these tests rely on.

⚖️ Strongest argument against: recommending that this candidate land first couples two
schedules. It is a recommendation, not a dependency: candidate 9's own validation table and
goldens pin its strings either way.

✅ Decision: Depends on: none.

Frontier after round 4: empty.

---

## Decisions

1. **Faithful means**: HTTP/1.1 only, with an upgrade offer refused as the shipped executor
   refused it (`400`, text/plain, `Invalid HTTP request received.`, `Connection: close`);
   `POST` only; JSON decoded before the token; bearer token checked (401); wrapper checked
   (422); each plan answered with its recorded status and body; an unrecorded plan fails the
   test (Q6).
2. **Recorded exchanges** live in the backend's test resources under `plan-executor-exchanges`,
   one JSON file each with `database`, `plan`, `status`, `body`, matched on (database state,
   plan), never on the profile id; clock-independent by rule, enforced by the verifier (Q8, Q9).
3. **Five exchanges**: a monthly timeseries (200, with a zero-filled June), an unknown category,
   an unsupported version 7, a smuggled `profileId` (all 400), and the same timeseries plan with
   a failing database (500). They carry the four strings candidate 9 must keep (Q10).
4. **The Python suite proves them**: one parametrized route-level test with the real app and
   seeded Postgres (or a failing connection); it fails on an empty directory; it compares parsed
   JSON. It replaces three Python tests (Q14, Q16).
5. **One double**: `PlanExecutorDouble`, a JUnit 5 extension in the backend's test support
   package; JDK `HttpServer`; no new dependency; delay, proxy-page and unreachable-URL faults;
   received requests for scoping assertions (Q11, Q13).
6. **The h2c guard fails the way production failed**: a default-version JDK client is refused
   by the double, and `AnalyticsClient` succeeds on it; the production comment is updated (Q12).
7. **Assertions that change**: canned wording gone, the smuggled-id test becomes 400 while
   keeping the profile assertion, the 401 comes from a real token check, a new 500-to-503 test
   is added, and the controller test registers the token (Q15).
8. **No real Python process in `mvn verify`**; the e2e job remains the one real-pair run (Q7).
9. **Order**: 1 one class → 2 exchanges and verifier → 3 replay → 4 refusals (Q18).
10. **Docs**: INSIGHTS.md "Testing strategy" and ARCHITECTURE.md §5; no ADR; "recorded exchange"
    defined in INSIGHTS.md, not the glossary (Q19).
