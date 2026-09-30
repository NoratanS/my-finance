# my-finance

A self-hosted personal finance tracker: one instance holds fully separate profiles, each with its
own transactions, categories, budgets, subscriptions and insights. This glossary fixes the words
the code, the documents and the specs use for them.

## Language

### Accounts, profiles and sign-in

**Instance**:
One self-hosted installation of my-finance, with its own database and its own users.
_Avoid_: deployment, server, tenant, environment

**User**:
A person's account on an instance. A user signs in and owns one or more profiles.
_Avoid_: account (on its own), member, login

**Profile**:
A fully separate set of financial data owned by one user — for example "Personal" and "Company" —
with its own default currency.
_Avoid_: workspace, ledger, tenant, book

**Active profile**:
The profile a session is currently working in. The user chooses it; the server holds it; every
request for financial data is answered from it alone.
_Avoid_: current profile, selected profile, profile context

**Dangling active profile**:
A session's active profile whose profile no longer exists, or no longer belongs to the session's
user — typically because it was deleted from another session. It is the same state as having no
active profile.
_Avoid_: stale active profile, orphaned profile, deleted active profile

**Session**:
A signed-in browser's state kept on the server between requests: who is signed in, and which
profile is active. It ends at sign-out or after eight hours without a request.
_Avoid_: login (as a noun), token, auth state, "the cookie" (the cookie only carries the session's id)

**Sign-in mode**:
Whether an instance asks for a password (`password`) or serves a single local account without any
sign-in (`none`).
_Avoid_: auth mode, passwordless flag, login mode

**Local account**:
The one user an instance in sign-in mode `none` runs as.
_Avoid_: default user, anonymous user, guest

**Switch-back**:
Moving an instance from sign-in mode `none` back to `password`, after its local account has been
given a password so that it can still sign in.
_Avoid_: mode migration, re-enabling authentication, password restore

### Money

**Money amount**:
A positive decimal with at most 15 integer and 4 decimal digits, always paired with a currency
code. It travels as a decimal string, never as a number.
_Avoid_: price, sum, value, float

**Currency code**:
The three uppercase letters of an ISO 4217 currency (for example `PLN`) that say which currency a
money amount is in. Amounts in different currencies are never added together.
_Avoid_: currency symbol, currency name, ccy

**Entered amount**:
An amount as a user types it into a form — digits with an optional comma or dot and up to four
decimals — before it has been checked and turned into a money amount.
_Avoid_: typed amount, amount text, raw amount, input value

**Value rule**:
The condition a single value must meet to be accepted anywhere it enters the instance — in a
request or in a restored backup. "A money amount is greater than zero" is a value rule.
_Avoid_: validator, constraint, format check

### Transactions and categories

**Transaction**:
A single expense or income in a profile: a money amount, a currency code, a date, a category and,
optionally, a description and a merchant.
_Avoid_: entry, payment, record, txn (that is only the table's name)

**Merchant**:
The free-text name of whom a transaction was paid to or received from.
_Avoid_: vendor, payee, counterparty, shop

**Category**:
A named node in a profile's category tree, used to file transactions, budgets and subscriptions.
_Avoid_: tag, label, group, bucket

**Category tree**:
The hierarchy of a profile's categories, at most five levels deep. Sibling names are unique.
_Avoid_: category hierarchy, taxonomy, category list

**Category colour**:
A category's own display colour, or none, in which case the category shows the colour of its
nearest ancestor that has one.
_Avoid_: colour code, tint, inherited colour (for the stored value)

**Transaction filter**:
The optional criteria that select a profile's transactions: a date range, a category (optionally
with all its subcategories), a direction (expense or income) and a search term. A list and its
aggregates apply the same filter.
_Avoid_: query, criteria, search parameters

**Search term**:
Text matched literally and without regard to case against a transaction's description or merchant.
A blank search term means no search.
_Avoid_: query, keyword

**Aggregate**:
A figure computed over every transaction a transaction filter matches — never over one page — and
kept per currency.
_Avoid_: stats, report, roll-up (the roll-up is the sum over a category's subtree)

### Budgets and subscriptions

**Budget**:
A spending limit for one category, including its subcategories, over a period, in one currency.
_Avoid_: allowance, envelope, target

**Subscription**:
A recurring charge with a billing period and a next billing date. It can be active, paused or
cancelled.
_Avoid_: recurring payment, standing order, plan (a plan is an Insight's question)

**Billing period**:
How often a subscription bills: weekly, monthly, quarterly or yearly.
_Avoid_: cadence, frequency, cycle, interval (an interval is a plan's bucket size)

**Charge posting**:
Turning each due charge of an active subscription into an expense transaction, dated on its
billing date.
_Avoid_: billing run, charge job (the job is what performs charge posting), auto-pay

### Insights

**Insight**:
A saved question about a profile's transactions: a name plus a plan. It can be pinned to the
dashboard.
_Avoid_: report, chart, widget, query

**Plan**:
The description of a question — what to measure, over which transactions, grouped how, over which
range of time. A plan says what is asked, never how to compute it.
_Avoid_: query, query plan, request, spec

**Normalized plan**:
A plan with every optional part spelled out. It is the form in which a plan is executed and
echoed back with its answer.
_Avoid_: complete plan, full plan, canonical plan

**Plan executor**:
The read-only part of an instance that answers a plan, per currency, and does nothing else.
_Avoid_: analytics service, analytics engine, reporting service

**Plan problem**:
One human-readable statement naming a part of a plan and what is wrong with it. The plan executor
reports every plan problem it finds, together.
_Avoid_: error, validation error, problem (on its own — that is a Problem)

**Result shape**:
One of the four forms an answer takes: a single value, a time series, a breakdown by group, or a
time series per group.
_Avoid_: chart type, result type, format

**Empty answer**:
The outcome of executing a valid plan over no matching transactions. It is an answer, not an
error.
_Avoid_: empty result, no data, blank chart

**Bucket**:
One step of a plan's time axis: a day, a week starting on Monday, a month, a quarter or a year.
Every bucket in the plan's range appears on the axis, with zero when nothing falls in it.
_Avoid_: bin, slot, period, interval (the interval chooses the bucket size)

**Period key**:
The text that names a bucket: `2026-07-13` for a day or a week (the week's Monday), `2026-07` for
a month, `2026-Q3` for a quarter, `2026` for a year.
_Avoid_: bucket key, label, date

**Bucket cap**:
The limit of 1,000 buckets a plan's time axis may draw. A plan over the limit is refused with a
plan problem rather than drawn.
_Avoid_: bucket limit, max buckets

**Instance time zone**:
The time zone an instance is configured with. It decides what "today" is for an Insight's range
of time.
_Avoid_: server time zone, local time, system time zone

### Backup

**Backup**:
A file a user exports from chosen profiles and keeps wherever they like. Restoring it always
creates new profiles; it never merges into existing ones.
_Avoid_: dump, snapshot, export file, archive

### Wire contract

**Problem**:
An error answer from the instance, in RFC 9457 problem-detail form.
_Avoid_: error, error response, exception

**Problem type**:
The stable name of what kind of failure a Problem is, for example `category-name-taken`. It is the
only part of a Problem that may be branched on; the rest is prose.
_Avoid_: error code, error slug, error type

**Field violation**:
One entry of a validation Problem: the name of a field and a message saying which value rule it
broke.
_Avoid_: field error, validation error, field message (a field message is what a screen shows)

**Pseudo-field**:
The name a field violation is reported under when its rule concerns no single field — a rule
across several fields, for example `periodValid`.
_Avoid_: virtual field, cross-field name, error key

**Problem list**:
The list of human-readable statements carried by a Problem about a backup or a plan, each
pinpointing one bad entry.
_Avoid_: problems (on its own), errors, details

**OpenAPI document**:
The generated description of the instance's HTTP interface — its paths and the shape of every
request and answer — kept beside the human-written design and checked against the running code.
_Avoid_: OpenAPI schema, API schema, spec, swagger (schema means the database schema here)

### Deployment

**Stack definition**:
The one description of which parts make up an instance and how they connect.
_Avoid_: release compose, prod compose, topology file

**Release bundle**:
What a self-hosting user downloads for a release, unpacks and starts with a launcher.
_Avoid_: distribution, installer, package

**Launcher**:
The script in a release bundle that prepares an instance's settings and starts it.
_Avoid_: start script, installer, wrapper

**Development layer**:
What development adds to the stack definition: building from source instead of downloading a
release.
_Avoid_: dev override, dev compose, dev stack
