# Build `TransactionResponse` with a `from()` factory and remove MapStruct

Status: ready-for-agent
Candidate: 14 — Replace MapStruct with a `from()` factory
Strength: Strong
Depends on: none

## Problem Statement

The backend carries a dependency (MapStruct), an annotation processor wired into the compiler
configuration, a `mapper` package and a dedicated unit test — all for one mapping method,
`TransactionMapper.toResponse(Transaction)`. Ten other response records beside it build
themselves with a hand-written static `from(entity)` factory, so the codebase has two mapping
idioms for the same job, and `TransactionService` takes an extra constructor collaborator that
exists only to copy ten getters into a record.

The reason recorded in ARCHITECTURE.md §3 for keeping MapStruct is the opposite of what the
build does. It says MapStruct turns "a renamed or added field" into "a build error rather than
a silently absent JSON key". MapStruct 1.6.3's default for an unmapped target property is a
*warning* (and a `null` value), and the project configures nothing stricter; it is the record's
canonical constructor, called by hand, that turns an added field into a compile error. The same
paragraph cites "a partial-update path" that has never gone through the mapper. For the owner —
who is learning Spring from this codebase — the document teaches a guarantee the code does not
give, and a future contributor who trusts it is steered toward the weaker idiom.

## Solution

`TransactionResponse` gets a static `from(Transaction)` factory like its ten siblings — the
same factory the record had before MapStruct was introduced — and `TransactionService` calls it
at its four existing call sites. MapStruct, its annotation processor configuration, the
`mapper` package and the mapper's unit test are deleted. ARCHITECTURE.md §3 is corrected in the
same change: one mapping idiom, the real reason (the canonical constructor is the compile-time
field check), and a one-sentence record of why MapStruct was tried and removed.

Nothing changes on the wire: every transaction endpoint returns byte-identical JSON, verified by
the existing HTTP-level tests, which stay exactly as they are.

## User Stories

1. As the owner, I want every response record to be built the same way, so that I never have to
   remember which mapping style a given DTO uses.
2. As the owner, I want adding a component to `TransactionResponse` to fail compilation until its
   factory supplies a value, so that a JSON key can never silently become `null`.
3. As the owner, I want ARCHITECTURE.md to state the mechanism that actually provides the
   compile-time guarantee, so that the document teaches me something true about Java records.
4. As the owner, I want the backend build to run no annotation processor, so that compilation is
   plain `javac` with nothing generated behind my back.
5. As the owner, I want one fewer dependency for Dependabot to propose updates for, so that
   maintenance stays proportionate to a single-user project.
6. As the owner, I want the knowledge of how MapStruct works kept in my lessons log, so that
   removing the example does not remove what I learned from it.
7. As a future contributor, I want `TransactionResponse` to look like `BudgetResponse` and
   `SubscriptionResponse`, so that I learn the response-building pattern once.
8. As a future contributor, I want "go to definition" on the response-building call to land on
   real source code, so that I can read and step through the mapping without looking in
   generated sources.
9. As a future contributor, I want `TransactionService`'s constructor to list only its real
   collaborators, so that I can see at a glance what the service depends on.
10. As a future contributor, I want the package layout in ARCHITECTURE.md to match the source
    tree, so that I do not search for a `mapper` package that no longer exists.
11. As a future contributor, I want the factory's arguments in the record's component order, so
    that a swapped argument stands out in review.
12. As a future contributor who knows MapStruct, I want ARCHITECTURE.md to say why it is not
    used here, so that I do not reintroduce it on the reasoning the old paragraph gave.
13. As an AI agent reading the code for the first time, I want a single idiom with a single
    documented rule, so that I extend the code in the way the project intends.
14. As a reviewer, I want the refactor proven by the same HTTP tests before and after, so that I
    can trust that the wire contract did not move.
15. As a reviewer, I want the code change and the ARCHITECTURE.md correction in one commit, so
    that the code and the recorded decision never disagree on any commit.
16. As a reviewer, I want the deleted unit test's cases shown to be covered elsewhere, so that I
    can accept a deletion without a replacement.
17. As a self-hosting user, I want every transaction endpoint to return exactly the same JSON as
    before, so that my frontend and any scripts I wrote keep working.
18. As a self-hosting user, I want amounts to keep arriving as decimal strings at scale four
    ("34.9900"), so that no client ever sees a rounded or re-scaled value.
19. As a self-hosting user, I want transactions posted by the subscription charge job to keep
    their `subscriptionId`, and manual ones to keep an explicit `null`, so that the "sub" tag in
    my transaction list stays correct.
20. As a self-hosting user, I want each transaction to keep its inlined `{id, name}` category, so
    that lists still render category names without extra requests.
21. As a self-hosting user, I want the transaction list to stay a single query for the page and
    its categories, so that a large profile does not get slower.
22. As a self-hosting user, I want `createdAt` to keep appearing on every transaction, so that
    nothing that sorts or displays it breaks.

## Implementation Decisions

- **Module built:** a static factory `TransactionResponse.from(Transaction)` on the existing
  `TransactionResponse` record, identical in shape to the factory the record had before commit
  `6a29065`. It passes, in component order: the transaction's id; `CategoryRef.from` of its
  category; its amount as stored; its currency; its type; its occurred-on date; its
  description; its merchant; `getSubscriptionId()`; and `getCreatedAt()`.
- **Amount is copied as-is.** The entity normalises every amount to scale four on write
  (`Transaction.update` through `Money.normalize`) and the column is `NUMERIC(19,4)`, so the
  factory neither re-normalises nor rounds — the same behaviour as the sibling factories and as
  the generated mapper.
- **Subscription id without touching the proxy.** The factory reads `Transaction.getSubscriptionId()`,
  which answers from the lazy proxy's identifier and never issues a SELECT; there is no getter for
  the subscription itself and none is added.
- **Category through `CategoryRef.from`.** Unchanged: `CategoryRef.from` stays the single factory
  shared by transaction, budget and subscription responses.
- **Module modified:** `TransactionService`. Its create, get, update and list operations call
  `TransactionResponse.from` (the list passes it as a method reference to `PageResponse.from`).
  The `TransactionMapper` constructor parameter, field and import are removed; the service's
  collaborators become `TransactionRepository`, `CategoryRepository`, `ProfileRepository` and
  `ActiveProfile`.
- **Transaction boundary is part of the interface.** The factory reads the lazily loaded category's
  name, and open-in-view is off, so it must be called inside a service method's transaction — as
  all four call sites are today. Controllers keep receiving finished `TransactionResponse`
  records from the service.
- **Modules deleted:** the `mapper` package (`TransactionMapper`) and its test package
  (`TransactionMapperTest`).
- **Build:** the backend POM loses the `mapstruct.version` property, the `mapstruct` dependency
  and the entire `maven-compiler-plugin` block (its only content was the MapStruct processor
  path). No replacement compiler configuration is added: the Spring Boot parent's plugin
  management keeps supplying `-parameters` and the Java 21 release level, and no other
  annotation processor is present on the compile classpath.
- **ArchitectureTest is unaffected:** its layers are Controller, Service and Repository; no rule
  names the mapper package; a DTO referencing an entity is already the norm for response records.
- **Recorded decision reversed in place (no ADR):** ARCHITECTURE.md §3 is updated in the same
  commit — the stack line drops MapStruct, the package layout drops `mapper/` and describes
  `dto/` as request/response records with a static `from(entity)` factory on each response, and
  the "Why MapStruct, and why only in one place" paragraph is replaced by a short "One mapping
  idiom" paragraph (text in this candidate's docs proposals).
- **Code comments:** `TransactionResponse`'s Javadoc stops naming the mapper and says the record
  is built by its `from` factory.
- **Lesson:** after implementing, add a `docs/LESSONS.md` entry, "A record's canonical constructor
  is the compile-time field check", referencing (not repeating) the existing MapStruct entry.
- **Ordered steps:**
  1. *Only step.* Record the current backend suite result (Maven's own `Results:` line from
     `./mvnw -B verify`). Add the factory, switch the four call sites, delete the mapper and its
     test, remove the three POM entries, update ARCHITECTURE.md §3 and the record's Javadoc, run
     `./mvnw spotless:apply` and `./mvnw -B verify`. The build is green with the same results
     minus exactly the two deleted mapper tests. One commit.

## Testing Decisions

- **What makes a good test here:** the change is a pure refactor with no new behaviour, so the
  test is the existing suite asserting the observable JSON through the HTTP interface before and
  after. No test may be edited: if one needs editing, the factory is not equivalent — stop and
  compare it with the pre-`6a29065` factory.
- **Seam chosen:** the HTTP interface (MockMvc through the full security chain against
  Testcontainers Postgres, via the project's `@IntegrationTest`). It is the highest existing seam,
  it is where the wire contract is observable, and it already pins every component of the
  response: id, category id and name, amount at scale four (POST, GET and PUT), currency, type,
  occurred-on, description, merchant present with a value and present as `null`, `createdAt`,
  absence of `profileId`, and `subscriptionId` both set (charge job, through the list endpoint)
  and `null` (after its subscription is deleted). The only error a positional constructor call
  can make that name matching cannot — swapping two same-typed arguments (`id`/`subscriptionId`,
  or `currency`/`description`/`merchant`) — is caught because those assertions use distinct
  values in the same response.
- **Deleted:** `TransactionMapperTest` (two cases). Its own Javadoc says it guarded what "a
  generated mapper could" get wrong; with the generated mapper gone its premise is gone, and both
  its cases are asserted at the HTTP interface (replace, don't layer). No direct unit test of the
  factory is added, consistent with the ten sibling factories, each covered through its
  controller tests.
- **Survive unchanged:** `TransactionControllerTest`, `SubscriptionChargeServiceTest`,
  `SubscriptionControllerTest`, `TransactionAggregateControllerTest`,
  `MerchantBackfillControllerTest`, `ArchitectureTest` and the rest of the backend suite.
- **Prior art:** the ten existing `from()` factories and their controller tests
  (`BudgetControllerTest`, `SubscriptionControllerTest`, …); the pre-`6a29065`
  `TransactionResponse.from`.
- **Optional extra check:** if candidate 15's step 1 (the committed, CI-checked OpenAPI document)
  has landed, it must also pass unchanged — a second proof that the wire contract did not move.

## Out of Scope

- The `@Schema` annotation on `TransactionResponse.amount` and any other OpenAPI annotation —
  candidate 15 decides those.
- Converting or restructuring any other mapping (`CategoryRef.from` and the ten sibling factories
  stay exactly as they are).
- Changes to `Transaction.update`, `Money`, the list query's fetch strategy or any controller.
- Editing the dated maintenance-run design and plan documents, which describe the run that
  introduced MapStruct; they remain historical records.
- Any change to the response shape, field names or order on the wire.

## Further Notes

- **Rule for implementers:** keep calling `TransactionResponse.from` inside `TransactionService`'s
  transactional methods. Calling it from a controller would read the lazy category after the
  transaction closed and fail with a lazy-initialisation error (open-in-view is off).
- **Why the old rationale was wrong (checked, not assumed):** in the MapStruct 1.6.3 jar,
  `@Mapper.unmappedTargetPolicy` defaults to `WARN`, and the backend passes no processor option or
  warnings-as-errors flag. The "partial-update path" is `Transaction.update`, which is hand-written.
- **Build facts checked:** the Spring Boot 4.1.0 parent POM configures `maven-compiler-plugin` with
  `parameters=true` and sets the release from `java.version`; a scan of every jar in the local
  Maven repository found annotation-processor service files only in `mapstruct-processor` and in a
  Maven-internal `sisu.inject` jar, so removing the processor path leaves nothing for `javac` to
  discover.
- **Not verified (no builds or test runs in the design pass):** the current test count and a
  warning-free compile after the change; the implementer records the "before" result first.
- **Sequencing with siblings:** no dependency. Textual overlap only — candidate 15 edits
  annotations on the same record (its money and nullability steps), candidate 1 (G1) edits
  `TransactionService`'s use of `ActiveProfile`, candidate 11 (G2) edits the list operation that
  passes the factory as a method reference. Landing 14 early keeps those rebases trivial; landing
  it after 15's step 1 gives an extra, automatic proof that the OpenAPI document is unchanged.
- **Lesson to write** (`docs/LESSONS.md`, git-ignored): "A record's canonical constructor is the
  compile-time field check" — a Java record's constructor takes every component positionally, so a
  factory that calls it stops compiling when a component is added; the remaining risk of positional
  calls is two same-typed arguments swapped, which is why the HTTP tests assert distinct values;
  MapStruct's name matching avoids swaps but, at its default `WARN` policy, reports a missing field
  only as a warning. Python comparison: a `@dataclass` without defaults called with a missing
  positional argument raises `TypeError` — but only when that line runs, whereas Java rejects it at
  compile time; and keyword arguments are what prevent swaps in Python — Java records have none.
