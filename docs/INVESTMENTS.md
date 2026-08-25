# Investments tracking — research & design direction (Phase 6)

Savings and investments tracking for the app's actual user: a buy-and-hold
investor holding UCITS ETFs (GPW / Xetra / LSE listed), Polish retail
treasury bonds, occasional individual stocks — not a day trader. The
defining requirement: **valuations update themselves**; asking the user to
type in prices is the failure mode this phase exists to avoid.

**Status of this document.** Research is done (2026-08-25, verified against
primary sources) and the design direction is settled; the concrete contracts
(`SCHEMA.md` tables, `API.md` endpoints) get written when Phase 6 starts,
after Phases 4–5 land — same design-before-code rhythm as every phase.
Sections below marked *settled* are decisions; *open* items are listed at
the end.

---

## Contents

- [The core problem: three valuation strategies](#the-core-problem-three-valuation-strategies)
- [Lessons from prior art](#lessons-from-prior-art)
- [Market data: sources and the provider posture](#market-data-sources-and-the-provider-posture)
- [Polish retail treasury bonds: a computation, not a quote](#polish-retail-treasury-bonds-a-computation-not-a-quote)
- [Design direction](#design-direction)
- [Deliberately deferred](#deliberately-deferred)
- [Open questions for the phase-start design ticket](#open-questions-for-the-phase-start-design-ticket)

---

## The core problem: three valuation strategies

Every holding needs a current value, but the value comes from three
fundamentally different places (*settled*):

| Strategy | Assets | How the value updates |
|---|---|---|
| **MARKET** | ETFs, stocks | Daily close fetched from a price provider into a local price series |
| **COMPUTED** | Polish retail treasury bonds (EDO, COI, …) | No market price exists anywhere — value is derived from the bond's legally published terms plus two public data series (CPI, NBP reference rate) |
| **MANUAL** | Savings accounts, deposits, anything else | User-entered value snapshots |

The design consequence (confirmed by every mature open-source tracker):
these are **not three kinds of asset** — they are one kind of asset with
three kinds of *price source*, all landing in the same price-series table.
Valuation, allocation, and performance code never branches on the strategy.
Ghostfolio tried the alternative (a special activity type for manually
valued assets) and spent years deprecating and deleting it.

## Lessons from prior art

Researched: Ghostfolio (Prisma schema + calculator sources + issue
tracker), Portfolio Performance (concept docs + forum), Wealthfolio
(activity-type docs), Maybe (data-model discussions), Firefly III (which
deliberately refuses to do investments — a scope lesson in itself, and the
same call our own `txn` domain makes: spending ledger and priced-position
ledger have different cores, so this phase is a **separate domain**, not a
transaction subtype).

What transfers (*settled*):

1. **An activity ledger is the single source of truth; positions, cost
   basis, and performance are pure functions of it** (plus prices and FX).
   No tracker stores holdings authoritatively; they differ only in caching.
   Rebuild-from-ledger must always be possible.
2. **Activity taxonomy for v1**: `BUY, SELL, DIVIDEND, INTEREST, FEE, TAX,
   DEPOSIT, WITHDRAWAL, TRANSFER_IN, TRANSFER_OUT` — the last pair (in-kind,
   carrying acquisition date + cost) is the sneaky-critical one, because
   every real user starts mid-stream and "fake BUY at today's price"
   corrupts both cost basis and returns. Wealthfolio's discipline is worth
   copying wholesale: before writing code, document each type's effect on
   exactly four derived quantities — cash, quantity, cost basis, net
   contribution.
3. **Model the portfolio boundary explicitly**: DEPOSIT/WITHDRAWAL/TRANSFER
   are *external* flows; BUY/SELL/DIVIDEND are *internal* reallocation.
   This one distinction is what makes both money-weighted and time-weighted
   returns computable later.
4. **Performance v1 = simple return (value vs. net contributions) + XIRR
   (money-weighted), clearly labeled.** For a DCA buy-and-hold investor,
   XIRR answers the question actually being asked ("what did *my money*
   earn?"). TWR — which needs daily whole-portfolio valuation — is the
   single biggest source of user revolt in Ghostfolio's tracker
   ("performance makes no sense for DCA"); Portfolio Performance escapes by
   showing both metrics with docs. TWR is deferred, but the boundary flows
   (lesson 3) keep it a pure later addition.
5. **Decide, symmetrically and in writing, which activity types count
   toward performance.** Ghostfolio counted dividend *fees* but not
   dividends for years — a bug class that is really a spec omission.
6. **Every money field carries its currency; conversion happens at
   calculation time from a stored daily FX series.** FX rates are just
   another price series. Never store pre-converted amounts. (This is
   already this project's rule.)
7. **Cost basis: average cost in v1**, with the ledger kept rich enough
   (dates, per-trade fees) that FIFO becomes a pure function later — the
   method is a tax-jurisdiction concern (Portfolio Performance makes it
   configurable for exactly that reason), not a math preference.

## Market data: sources and the provider posture

Verified empirically during research (see dates/caveats per item):

- **Yahoo Finance v8 chart endpoint** —
  `https://query1.finance.yahoo.com/v8/finance/chart/{symbol}` — is the
  **default provider**. Keyless, works today with just a browser
  User-Agent, and is the only free source covering the whole instrument
  set in one namespace: `CDR.WA` (GPW), `ETFBM40TR.WA` (GPW-listed ETF),
  `VWCE.DE`/`EUNL.DE` (Xetra UCITS), `SWDA.L` (LSE) — all verified live.
  It is *unofficial*: no ToS, recurring breakage waves (Feb 2025, Dec 2025,
  Feb 2026). The posture, copied from Ghostfolio's precedent: ship it as
  the default at personal volumes, document its unofficial status, and
  design for its death rather than around it. Never proxy Yahoo data
  through any central infrastructure.
- **Stooq is dead as an automated source** (verified: its CSV endpoints now
  sit behind a JavaScript proof-of-work anti-bot wall, and returned "Access
  denied" even after solving the challenge programmatically). It remains
  excellent as a *user-initiated* browser CSV download → manual import.
  Building the PoW solver into the app would be deliberate circumvention —
  wrong posture for an open-source project.
- **No keyed provider covers GPW + Xetra on a free tier** (Alpha Vantage:
  25 req/day; Marketstack: 100 req/month; Twelve Data free: US only; FMP
  free: US only). **EODHD All-World (~$20/mo)** is the one clean paid
  option with official GPW coverage — supported as an *optional
  user-supplied key*, never a requirement.
- **FX: NBP Web API** (`api.nbp.pl`, table A mid rates, business days
  ~11:45–12:15, history from 2002, 93-day query windows, keyless JSON).
  Not merely convenient — the NBP mid rate of the preceding business day is
  the rate Polish tax rules prescribe, so it's the *correct* source for
  this user. ECB `eurofxref` as trivial fallback.
- **Symbol mapping**: brokers report ISINs; Yahoo wants exchange-suffixed
  tickers. Plan an ISIN → symbol resolution step (Yahoo's search endpoint,
  or OpenFIGI's free mapping API) instead of making users guess suffixes.
  Trap catalogued for the implementer: LSE lines quote in **pence
  (`GBp`)** — instrument currency must come from the provider's metadata,
  and pence normalized once at ingestion.

Provider-death design (*settled*): a `PriceProvider` interface; fetched
prices persisted permanently in the local price series (never re-fetch what
you have — history survives any provider dying); staleness always visible
in the UI ("price as of 2026-08-22"); manual price entry and CSV import as
the always-available fallback.

## Polish retail treasury bonds: a computation, not a quote

The research's biggest finding, verified against the Ministry of Finance
**letters of issue** (listy emisyjne — the legally binding term sheets) for
the August 2026 series: retail bonds (obligacjeskarbowe.pl) have no market
price, but their value is *exactly computable* from per-series constants
plus two public data series. A deterministic valuation engine needs:

**Per holding (user-entered once):** series symbol (e.g. `EDO0836` — type +
maturity MMYY), purchase date (period boundaries anchor to it, month-end
clamped), quantity, and the series' constants: first-period rate, margin,
early-redemption fee. **No parameter API exists** (confirmed — also by the
one prior-art implementation, a GnuCash Finance::Quote module that encodes
parameters into the symbol string); parameters live in per-series PDF
letters at a stable URL pattern. v1: manual entry of the 3–4 numbers per
held series, optionally validated against the issuer's daily accrued-value
tables (`obligacjeskarbowe.pl/tabela-odsetkowa/` — which double as the
**golden reference** for testing the engine against the issuer's own
rounding).

**Global series (auto-fetchable, both verified live):**
- CPI y/y: **GUS DBW API** (`api-dbw.stat.gov.pl`, keyless JSON, CC-BY 4.0;
  variable 305, y/y measure id 5; note the 2026 COICOP section switch:
  splice section 909 (≤2025) with 1698 (≥2026)).
- NBP reference rate history: **`static.nbp.pl/dane/stopy/stopy_procentowe_archiwum.xml`**
  (the main NBP API does *not* expose interest rates).

**Mechanics the engine implements** (full formulas verified; summarized):
- Fixed types: OTS (3m, fixed amount at maturity), TOS (3y, annual
  capitalization, `W = 100·(1+r)³`).
- NBP-ref floaters: ROR/DOR (1y/2y, monthly coupons, rate = ref rate on the
  10th business day before the period's month + margin).
- CPI floaters: COI (4y, annual coupons on plain nominal), EDO (10y,
  **annually capitalized**: `W = 100·(1+r₁)·…·(1+r₁₀)`), ROS/ROD (800+
  variants). Subsequent-period rate = **CPI y/y announced in the month
  preceding the period's first month** (in practice month M−2's figure) +
  the series margin, with the CPI component **floored at 0** (deflation ⇒
  rate = margin). No principal indexation — it's a rate formula.
- Day-count: ACT/ACT within the period for annual types; `a/(D·12)` for
  monthly types; period boundaries are purchase-date anniversaries.
- Early redemption ("liquidation value" — worth showing in the UI): accrued
  value minus the per-series fee, where capitalizing types deduct
  `min(accrued, fee)` and floor at nominal in *every* period, while
  COI/ROR/DOR floor only in period 1 and deduct the full fee afterwards.
  Interest accrues 5 business days past the request (Saturdays are not
  business days per the letters).
- Optionally report net of the 19% capital-gains tax on interest.

## Design direction

*Settled direction; concrete contracts at phase start.*

- **A separate domain, backend-owned.** New tables (names indicative):
  `instrument` (profile-scoped; ticker/ISIN, type, currency, price source
  MARKET/COMPUTED/MANUAL), `investment_activity` (the ledger — taxonomy
  above), `price` (`(instrument_id, date)` unique — the one series shared
  by all three strategies), `bond_series` (per-series constants). Spending
  (`txn`) stays untouched; the two ledgers meet only in future reporting
  (net worth), not in the schema.
- **One writer, as always**: the backend owns all writes, including a daily
  `@Scheduled` price-fetch job (same pattern and idempotency discipline as
  the subscription charge job) and the bond-valuation computation (writes
  computed values into `price` so downstream code sees one series). The
  analytics service reads for insights later; Phase 4's read-only role
  already covers the new tables via default privileges.
- **Money discipline unchanged**: `NUMERIC(19,4)`, decimal strings on the
  wire, per-currency aggregation, NBP daily FX series stored like any other
  price data.
- **UI shape**: a portfolio screen (holdings, value, cost, simple return +
  XIRR, staleness indicators), an activity entry flow with TRANSFER_IN as
  the onboarding path ("I already hold 40 units bought on…"), and a bond
  holding form that asks for series + purchase date + the letter-of-issue
  numbers with a link to the official table for verification.
- **Insights integration deferred but anticipated**: portfolio value as a
  plan metric is a natural later DSL addition (`INSIGHTS.md` versioning
  rule covers it); nothing in Phase 6 should preclude it.

## Deliberately deferred

Recorded so each is a decision with a trigger, not an omission. The prior
art is unambiguous that each of these cost years:

| Deferred | Add it when |
|---|---|
| Corporate actions (splits, mergers, symbol changes) | A held instrument actually splits. Then copy Ghostfolio's late design: per-instrument split table with exact integer ratio, adjust activities at read time, never touch provider-adjusted prices. |
| FIFO / tax-lot cost basis | Tax reporting becomes a feature. Ledger already carries everything needed. |
| TWR with daily portfolio valuation | Someone genuinely needs to compare against a benchmark. Boundary flows already recorded. |
| Broker statement / CSV auto-import | Manual entry proves too painful for the actual volume (a buy-and-hold investor logs a few activities per month). |
| Intraday prices, multiple listings per instrument | Never, plausibly. Daily close only, one listing per instrument. |
| Legacy bond types (DOS, TOZ, POS, KOS) | The user actually holds one. Engine structure already fits them. |
| Crypto | Explicitly out of scope for this user. |

## Open questions for the phase-start design ticket

1. **Bond engine rounding**: the TOS letter rounds the capitalized base to
   2 dp per period; EDO's letter rounds once at the end. Reconcile
   per-type against the official tabela-odsetkowa values (sub-grosz
   differences; golden tests decide).
2. DOR/ROS/ROD letters were not individually parsed (mechanics taken from
   product pages + structural analogy) — parse once at implementation.
3. Adjusted vs. raw close from Yahoo (`adjclose` vs `close`) — decide
   explicitly how dividends interact with price series before writing the
   P/L math (ties to lesson 5).
4. Seed a small maintained table of recent bond-series parameters vs. pure
   manual entry — decide by how annoying manual entry proves with real
   holdings.
5. Whether `DIVIDEND` cash lands as an investment-ledger activity only, or
   optionally mirrors into `txn` as INCOME (one-way, explicit) — touches
   the spending/investing boundary; needs a real user answer at phase
   start.
