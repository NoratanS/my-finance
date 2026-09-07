# Local model comparison

Design delta D10: `INSIGHTS.md` said "a small instruct model ~2–4 GB,
configurable" without naming one, so the default is chosen by measurement
rather than assertion. The benchmark is the two suites that already exercise
a real model, both gated behind `RUN_LLM_GOLDEN=1`:

- `tests/test_llm_golden.py` (Task 13) — 8 sentence → plan cases. Each
  candidate is asked to interpret every fixture sentence
  (`tests/fixtures/golden_llm/sentences.json`); the returned plan is compared
  to the expected one key-sorted (field order is not part of a plan). **Exact**
  is the count of sentences that produced the exact expected plan.
- `tests/test_llm_narration_local.py` (Task 21) — 8 narration cases across the
  four result shapes (value, timeseries, breakdown, split), run twice: once
  checking the model's raw caption never invents a number not present in the
  facts it was handed, once checking whether the guarded pipeline actually
  used the model's caption rather than degrading to Python's computed one.

**Neither failure mode is dangerous.** A plan that fails schema/category
validation is rejected and the explorer falls back to chips — the user keeps
a working (if less convenient) search. A caption that invents a number is
thrown away by the grounding check before it reaches anyone, and the pipeline
substitutes a caption Python computed directly from the same figures — always
true, just duller prose. So every score below measures *usefulness*
(does the AI layer save the user work), never *safety*.

**A caveat on the golden suite's coverage:** 4 of its 8 cases duplicate
`FEW_SHOT`'s plan *shapes* (though all 8 sentences are distinct paraphrases —
see Task 13's review). A model can score partly by pattern-matching the
prompt's own examples, so 5/8 or 6/8 is not evidence the model generalizes
that well to a *ninth* shape.

**A caveat on what a golden "failure" means in production**, sharper than the
"safe rejection" framing above: this suite calls `interpret()` with
`validate=lambda _plan: []` (validation disabled by design — Task 13's own
docstring explains why: the suite is measuring emission quality, not the
retry path). Most of the mismatches recorded below are *schema-valid but
semantically wrong* plans (e.g. `metric: net` where `income` was asked for) —
not malformed JSON. In the real pipeline, `validate_plan()` checks structure
and that a `categoryId` exists for the profile; it has no way to know the
sentence meant "income" and not "net". A schema-valid wrong plan is **not**
caught by validation and would be served to the user as an unexpected chart,
not a 422. It's a wrong answer, not a crash — still not dangerous (nothing is
written, the user can see the chart doesn't match and re-ask), but it is a
different, and more common, failure mode here than a clean rejection.

## Hardware

AMD Ryzen 7 9700X (16 threads), 15 GiB RAM, WSL2 on Windows, Docker Engine
(not Desktop). The `ollama` compose service declares no GPU device
reservation, so inference ran **CPU-only** — confirmed with
`docker compose --profile ai exec ollama ollama ps` showing `100% CPU` while
a request was in flight. A host GPU is present (`nvidia-smi` sees it) but is
not wired into the container; that's out of scope for this task.

`ollama` has no published port in `docker-compose.yml` by design
(compose-network only). Direct container-IP access from the host timed out
under this Docker setup, so the suites were run from the host against a
**local-only, temporary** compose override
(`ports: ["127.0.0.1:11434:11434"]`, kept outside the repo, never merged into
`docker-compose.yml`) — the same `localhost:11434` target `scripts/golden-llm.sh`
already assumes.

## Candidates

Two candidates, not three — the user narrowed scope to "two or three models,
roughly 2–5 GB each" rather than an exhaustive sweep:

- **`qwen3:4b`** (2.5 GB) — Task 1's provisional default.
- **`llama3.2:3b`** (2.0 GB) — the alternative this same plan document names
  for JSON reliability (see the plan's `golden-llm.sh` comment).

**Dropped:** the brief that scaffolded this task also listed `gemma3:4b` and
`llama3.1:8b`. `llama3.1:8b` is roughly double the size of the other two and
outside the "2–5 GB" band the user set for this task, so it was dropped
without pulling it. `gemma3:4b` was dropped for time, not disqualification:
with two candidates run twice each, the two runs per model matched exactly
(see below) — that reproducibility, plus the size of the gap between the two
candidates on both suites, made a third candidate unlikely to change the
decision, and an afternoon of local CPU inference has a cost too.

## Results

Each suite run twice per candidate (separate `uv run pytest` process each
time, one fresh Ollama request per case, no warm cache reused across runs
beyond the model already being loaded).

| Model | Golden exact (run 1) | Golden exact (run 2) | Narration: grounded (run 1 / run 2) | Narration: beat fallback (run 1 / run 2) | Mean per case |
|---|---|---|---|---|---|
| `qwen3:4b` | 5/8 | 5/8 | 0/4 / 0/4 | 0/4 / 0/4 | interpret ~4.4s; narrate: **timed out every case** |
| `llama3.2:3b` | 1/8 | 1/8 | 4/4 / 4/4 | 4/4 / 4/4 | interpret ~2.8s; narrate ~1.9s |

**Zero variance across runs for both candidates** — same pass/fail set, same
failing sentences, both times, for both models. That's a stronger claim than
"no variance was observed" would usually license from two runs of eight
cases; the reason is visible in the raw output: qwen3's narration failures
are a hard 60-second client timeout (`analytics/src/analytics/llm/client.py`
sets `timeout=httpx.Timeout(60.0, connect=2.0)`, out of scope to change per
this task's constraints), not a stochastic generation outcome, and both
models' golden misses were the same *shape* of sentence both times, not a
coin-flip near the decision boundary.

### `qwen3:4b` — golden misses (identical both runs)

- *"What have I earned so far this year?"* → produced `metric: net` +
  `interval: month` instead of `metric: income` (no interval expected).
- *"eating out, week by week, last 3 months"* → produced `groupBy: category`
  instead of `interval: week`.
- *"And only this year?"* (a follow-up narrowing an existing plan) → left the
  prior plan's `range: {type: lastMonths, n: 12}` unchanged instead of
  narrowing to `yearToDate`.

### `qwen3:4b` — narration: every case timed out

All 8 narration cases (4 shapes × 2 checks) failed with
`httpx.ReadTimeout` at ~60.0–60.1s, both runs. The interpret path (`chat_json`,
same client, same 60s timeout, same "thinking" suppressed via `think: false`)
consistently answered in 2–10s for the same model. Whatever the difference —
a longer narration prompt, or `think: false` not fully suppressing reasoning
tokens for `generate()` the way it does for the schema-constrained
`chat_json()` — the observed result is unambiguous: **on this hardware,
narration with `qwen3:4b` never completes inside the pipeline's own timeout.**
Every narration attempt would silently and consistently fall back to Python's
computed caption. That's safe (see above), but it means the "AI layer"
currently narrates zero of the time with this model on comparable hardware —
a real limitation worth a follow-up, not something this task's scope permits
fixing (it would mean editing `client.py`).

### `llama3.2:3b` — golden misses (identical both runs)

Only *"Compare how much I spent on groceries at Lidl vs Biedronka..."* matched
exactly, both runs. The other 7 sentences each produced a schema-valid but
different plan — wrong `metric` (`net` instead of `income`), wrong or missing
`groupBy`/`interval`, extra or missing `filters`, and (for the follow-up case)
failure to apply the follow-up's narrowing to the current plan. This is the
same category of error qwen3 made, just on 7 of 8 sentences instead of 3.

### `llama3.2:3b` — narration: fast and consistently grounded

All 8 cases passed both runs — no invented numbers, and the model's caption
was used over the Python fallback every time, in 0.6–3.7s per case.

## The decision

**`qwen3:4b` stays the default — a real result, not a non-event.** Its
provisional default from Task 1 is now the benchmarked one, not merely
assumed: it more than triples `llama3.2:3b`'s exact-match rate on the
primary "free-text search" capability (5/8 vs 1/8, reproduced identically
across two runs each), which is the harder and more central of the two
capabilities the AI layer exists for. `llama3.2:3b`'s 87.5% miss rate on
that same suite would mean the free-text explorer usually hands back an
unexpected chart rather than the one asked for — a worse outcome for the
feature's core purpose than a caption that degrades to Python's fallback
sentence.

This is not a clean sweep, and it should not be read as one: `qwen3:4b`'s
narration is currently non-functional on CPU-only hardware like the author's,
timing out on every single case, while `llama3.2:3b` narrates quickly and
accurately. If narration quality were the only criterion, `llama3.2:3b` would
win outright. The two suites point in different directions; this decision
weighs interpretation accuracy as the more load-bearing capability and treats
the narration gap as a known, accepted cost (see LESSONS.md) rather than a
disqualifier — narration's failure mode is a duller sentence, never a wrong
one.

**Follow-up, out of this task's scope:** the fixed 60s client timeout
(`analytics/src/analytics/llm/client.py`) is too tight for `qwen3:4b`'s
narration path on CPU-only hardware. Worth a future look at either why
`generate()` is so much slower than `chat_json()` for the same model, or
whether the timeout should be model- or endpoint-specific.

Re-run after an Ollama upgrade or a model change:

```bash
cd /home/chris/side-projects/my-finance
docker compose --profile ai up -d ollama
export ANALYTICS_TOKEN=dev-analytics-token   # or your .env value
for m in qwen3:4b llama3.2:3b; do
  docker compose --profile ai exec -T ollama ollama pull "$m"
  cd analytics
  RUN_LLM_GOLDEN=1 OLLAMA_URL=http://localhost:11434 OLLAMA_MODEL="$m" \
    uv run pytest tests/test_llm_golden.py tests/test_llm_narration_local.py -v --durations=0
  cd ..
done
```

(`ollama` publishes no port by default — see `scripts/golden-llm.sh`, which
assumes `http://localhost:11434`; add a temporary local port-forward if
running from outside the compose network, as this benchmark did.)
