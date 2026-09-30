# Candidate 14 — Replace MapStruct with a `from()` factory — grilling log

Repository state examined: branch `dev`, HEAD `c3e20c5` (a `-s ours` merge of `main`;
`git diff --stat 4545810 HEAD` is empty, so every line number from the brief's commit
`4545810` still holds). Read-only throughout: nothing was built, run or edited.

How facts were checked: source files read with `cat -n`/`sed -n`; history with `git log`,
`git show`; library behaviour read from the jars in `~/.m2` with `unzip` + `javap -v`/`javap -c`
(scratch copies under the session scratchpad, never inside the repository).

---

## Round 1 — constraints, the recorded reason, the target shape, the dependency category

❓ **Q1** - **What must this change not break?**: Which recorded decisions, wire contracts and
build rules bound the design? Options: treat it as (a) a pure refactor whose HTTP output is
byte-identical, or (b) a refactor that may also tidy the response shape.

🔎 Facts:
- The wire shape of `TransactionResponse` is recorded in `docs/API.md:730–754` (ten fields,
  `amount` a decimal string at scale 4, `category` an inlined `{id, name}`, `subscriptionId`
  read-only and nullable, no `profileId`). The record is `dto/TransactionResponse.java:17–30`,
  components in the order `id, category, amount, currency, type, occurredOn, description,
  merchant, subscriptionId, createdAt`.
- Money on the wire is a settled decision (brief §6; `docs/API.md:82–115`): `JacksonConfig`
  writes every `BigDecimal` as a string; scale comes from the value itself.
- Package-by-layer with ArchUnit stays (brief §6). `ArchitectureTest.java:25–39` defines only
  Controller/Service/Repository layers; no rule mentions `mapper`. `ArchitectureTest.java:53–60`
  forbids entities in *controller* signatures only — a DTO referencing an entity is allowed and
  already common (`dto/BudgetResponse.java:7,24`).
- `ARCHITECTURE.md:69–77` records "Why MapStruct"; the brief (§3) says a reversal of
  `ARCHITECTURE.md` is recorded by updating that section in the same change, not by an ADR.
- Spotless is bound to `verify` (`backend/pom.xml:121–144`); CI runs `./mvnw -B verify`
  (`.github/workflows/ci.yml:18–19`).

➡️ (a) A pure refactor: every transaction endpoint returns exactly the JSON it returns today.
The only documents that change are `ARCHITECTURE.md` §3 and code comments naming the mapper.

⚖️ Strongest argument against: while touching `TransactionResponse`, one could also fix its
OpenAPI annotations (candidate 15 removes the per-field money `@Schema`). Mixing the two would
make the refactor's proof ("same tests, same output") muddier.

✅ Decision: pure refactor, byte-identical HTTP output; the `@Schema` annotation on `amount` is
left exactly as it is (candidate 15 owns it). Unblocks Q3–Q13.

---

❓ **Q2** - **Is the recorded reason for MapStruct true?**: `ARCHITECTURE.md:73–75` says
MapStruct makes "a renamed or added field … a build error rather than a silently absent JSON
key", and `:72` cites "a partial-update path". Options: (a) the reason holds and the reversal
needs a new argument; (b) the reason is wrong and the reversal corrects the record.

🔎 Facts:
- `mapstruct-1.6.3.jar`, `org/mapstruct/Mapper.class`, `javap -v`: `unmappedTargetPolicy()`
  has `AnnotationDefault … ReportingPolicy.WARN`; `unmappedSourcePolicy()` defaults to
  `IGNORE`.
- `mapper/TransactionMapper.java:20` sets only `componentModel = "spring"`; `backend/pom.xml`
  passes no `-Amapstruct.unmappedTargetPolicy` compiler argument (the compiler plugin block at
  `:145–157` holds only `annotationProcessorPaths`), and no `failOnWarning`/`-Werror` is set.
  So under MapStruct an added record component with no matching source property compiles with
  a warning and is passed `null` — the silently absent (null) JSON value the paragraph says it
  prevents.
- A hand-written call of a record's canonical constructor fails to compile when a component is
  added (arity). Renaming an entity getter breaks a hand-written call at compile time; under
  MapStruct it becomes another unmapped target (warning, `null`).
- The "partial-update path" does not go through the mapper: `Transaction.update`
  (`model/Transaction.java:92–107`) is hand-written and `mapper/TransactionMapper.java` has one
  method, `toResponse` (`:23`).
- History: MapStruct arrived in `6a29065` (2026-09-08) under maintenance-plan Task 37, whose
  stated goal was "one clean, representative example" with "engineering value … neutral"
  (`docs/superpowers/plans/2026-09-07-maintenance-run.md:1744–1760`). The rationale paragraph
  was written afterwards in `7a02716` ("docs(architecture): record MapStruct, ArchUnit, …").
  The maintenance design itself lists "Lombok / MapStruct" under *Reject*
  (`docs/superpowers/specs/2026-09-07-maintenance-run-design.md:174–175`).

➡️ (b) The recorded reason is inverted. The record's canonical constructor already gives the
build-error guarantee; MapStruct at its default policy weakens it to a warning. The
"partial-update" clause describes code that never used the mapper.

⚖️ Strongest argument against: MapStruct is common in real Spring code and one worked example
has learning value for this learning project (card, "Against"). That is a reason to keep it,
but it is not the reason recorded, and the example as configured teaches a guarantee it does
not give.

✅ Decision: reverse the decision and correct the record in `ARCHITECTURE.md` §3 in the same
change, stating the checkable reason (default `WARN` versus a constructor arity error). The
learning value is kept by a `docs/LESSONS.md` entry (Q12). Unblocks Q3 and Q12.

---

❓ **Q3** - **Where does the mapping live afterwards?**: Options: (a) a static
`TransactionResponse.from(Transaction)` factory on the record, like its siblings; (b) a private
method in `TransactionService`; (c) a hand-written `@Component` mapper class kept in `mapper/`;
(d) keep MapStruct but set `unmappedTargetPolicy = ERROR`.

🔎 Facts:
- Ten records already use a static factory: `BudgetResponse.from` (`dto/BudgetResponse.java:24`),
  `BudgetSummary.from` (`:22`), `CategoryRef.from` (`dto/CategoryRef.java:8`),
  `InsightResponse.from` (`:13`), `PageResponse.from` (`:14`), `ProfileResponse.from` (`:9`),
  `ProfileSummary.from` (`:8`), `SubscriptionResponse.from` (`:36`), `UpcomingRenewal.from`
  (`:29`), `UserResponse.from` (`:10`) — `grep -rn "public static .* from(" dto/`.
- The pre-MapStruct factory is recoverable verbatim from `git show 6a29065 --
  …/TransactionResponse.java` (the removed lines: `id`, `CategoryRef.from(getCategory())`,
  `getAmount()`, `getCurrency()`, `getType()`, `getOccurredOn()`, `getDescription()`,
  `getMerchant()`, `getSubscriptionId()`, `getCreatedAt()`).
- Settled decision (brief §6): "Candidate 14 replaces MapStruct with a hand-written `from()`
  factory."
- Deletion test on `TransactionMapper`: deleting it, the complexity does not reappear across
  callers — it collapses into one twelve-line factory used by one service. It was a
  pass-through.

➡️ (a), restored to the shape it had before `6a29065`.

⚖️ Strongest argument against: (d) keeps the library and fixes the guarantee with one
attribute. But it keeps a dependency, an annotation processor and a package for one method and
a second mapping idiom beside ten factories — and the settled decision already chose (a).

✅ Decision: `TransactionResponse.from(Transaction)` as a static factory on the record, arguments
in component order. Unblocks Q5–Q8.

---

❓ **Q4** - **What kind of dependency is the mapping, and where is the seam?**: Categories per
brief §2: in-process, local-substitutable, ports & adapters, mock.

🔎 Facts:
- The factory copies getters and calls `CategoryRef.from` (`dto/CategoryRef.java:8–10`), which
  reads `category.getName()`. `Transaction.category` is `LAZY` (`model/Transaction.java:27–29`)
  and `spring.jpa.open-in-view=false` (`application.properties:11`), so the name must be read
  inside an open persistence context — today every call site is inside a `TransactionService`
  method, and the class is `@Transactional(readOnly = true)` (`service/TransactionService.java:44`).
- Nothing varies across the mapping: one adapter, no seam (brief §2, "one adapter means a
  hypothetical seam").

➡️ In-process pure computation; no seam, no interface, no Spring bean. It is tested through the
existing HTTP seam (MockMvc against the full stack), not directly.

⚖️ Strongest argument against: a direct unit test of the factory would be faster than an
integration test.

✅ Decision: in-process; no new seam; verification through the HTTP interface (Q9). The factory
must keep being called inside the service's transactional methods (edge case recorded in Q13).

---

## Round 2 — what the factory preserves, its call sites, the build, the package

❓ **Q5** - **What must `from()` preserve?**: The card lists four things: the scale of
`amount`, `subscriptionId` without initialising the lazy proxy, `createdAt`, and
`CategoryRef.from`. Options for `amount`: (a) copy as-is; (b) re-apply `Money.normalize`
defensively.

🔎 Facts:
- `Transaction.update` normalises on every write: `this.amount = Money.normalize(amount)`
  (`model/Transaction.java:101`); both constructors route through `update` (`:72, :88`).
  `Money.normalize` is `setScale(4, RoundingMode.UNNECESSARY)` (`model/Money.java:18–20`). The
  column is `NUMERIC(19,4)` (`model/Transaction.java:31`), so a loaded entity carries scale 4 too.
- MapStruct copied `amount` by plain assignment (commit message of `6a29065`); the sibling
  `BudgetResponse.from` copies `getAmountLimit()` as-is (`dto/BudgetResponse.java:28`).
- `Transaction.getSubscriptionId()` (`model/Transaction.java:149–156`) returns the proxy's
  identifier without a SELECT; MapStruct called this getter by name-matching (mapper Javadoc,
  `mapper/TransactionMapper.java:11–13`).
- `createdAt` comes from `AuditedEntity.getCreatedAt()` (`model/AuditedEntity.java:37–39`),
  set by `@CreationTimestamp` (`:25–27`); `TransactionControllerTest.java:129` asserts it is a
  string after `POST`.
- `category` goes through `CategoryRef.from` today via the mapper's default method
  (`mapper/TransactionMapper.java:25–27`).

➡️ (a) Copy every value as-is, exactly the ten getter calls of the pre-`6a29065` factory:
`getId()`, `CategoryRef.from(getCategory())`, `getAmount()`, `getCurrency()`, `getType()`,
`getOccurredOn()`, `getDescription()`, `getMerchant()`, `getSubscriptionId()`, `getCreatedAt()`.

⚖️ Strongest argument against: re-normalising would make the factory robust if an entity were
ever built without `update`. But the entity's only constructors go through `update`, so that is
error handling for an impossible scenario (CLAUDE.md "Simplicity first").

✅ Decision: as-is copies; `CategoryRef.from` for the category; `getSubscriptionId()` (never a
`getSubscription().getId()`, which does not exist and would couple to the proxy). Unblocks Q6, Q9.

---

❓ **Q6** - **Which call sites change, and what happens to `TransactionService`'s constructor?**:
Options: replace each call in place, or introduce a private helper in the service.

🔎 Facts: `service/TransactionService.java` — import `:26`, field `:56`, constructor parameter
and assignment `:58–69`, calls at `:86` (create), `:90` (get), `:99` (list, method reference
`transactionMapper::toResponse` passed to `PageResponse.from`), `:230` (update). `list` adds
`TransactionSpecifications.fetchCategory()` (`:97`) so the page's categories are fetched in the
same query. No other class references the mapper (`grep -rn "TransactionMapper\|transactionMapper"`:
only the mapper, its test, the service and the record's Javadoc).

➡️ Replace in place: the three direct calls become `TransactionResponse.from(...)`, the method
reference becomes `TransactionResponse::from`; remove the import, field, constructor parameter
and assignment.

⚖️ Strongest argument against: none of substance; a helper would add an indirection for a
one-liner.

✅ Decision: in-place replacement at the four call sites; `TransactionService`'s constructor
loses the mapper parameter, so it lists only its real collaborators (three repositories and
`ActiveProfile`). Unblocks Q9.

---

❓ **Q7** - **What exactly leaves `pom.xml`, and does anything else depend on the annotation
processor configuration?**: Options: (a) delete the property, the dependency and the whole
`maven-compiler-plugin` block; (b) delete the MapStruct entries but keep an explicit compiler
block (for example `<proc>none</proc>`) to pin behaviour.

🔎 Facts:
- `backend/pom.xml:16` `mapstruct.version`; `:19–23` the `mapstruct` dependency; `:145–157` the
  `maven-compiler-plugin` block, whose only configuration is `annotationProcessorPaths` naming
  `mapstruct-processor`.
- The parent `spring-boot-starter-parent-4.1.0.pom` (local repository) configures the compiler
  in `pluginManagement` with `<parameters>true</parameters>` (`:109–115`) and sets
  `maven.compiler.release=${java.version}` (`:16`); the project sets `java.version` 21
  (`backend/pom.xml:15`). Deleting the project's plugin block therefore keeps `-parameters`
  (which Spring needs for un-named `@PathVariable`/`@RequestParam`) and `--release 21`.
- With `annotationProcessorPaths` gone, JDK 21 `javac` falls back to discovering processors on
  the compile classpath. A scan of all 670 non-source jars in `~/.m2/repository` for
  `META-INF/services/javax.annotation.processing.Processor` found exactly two:
  `mapstruct-processor-1.6.3.jar` (leaves with this change) and
  `org.eclipse.sisu.inject-0.3.5.jar` (a Maven-internal plugin dependency, not a backend
  dependency). So after removal no processor is discovered and no generated sources exist.
- Build JDKs: CI `temurin 21` (`ci.yml:13–16`); the image build `eclipse-temurin:21-jdk` with
  `-DskipTests` (`backend/Dockerfile:2,12`); local OpenJDK 21.0.12.
- Spotless has no exclusion for generated sources to clean up (`backend/pom.xml:121–144`);
  `.github/dependabot.yml` has no MapStruct-specific entry.

➡️ (a) Delete all three. No replacement compiler configuration.

⚖️ Strongest argument against: (b) would guard against a future processor sneaking onto the
classpath. That is speculative configuration for a problem nobody has (CLAUDE.md "No
flexibility that wasn't requested").

✅ Decision: remove `mapstruct.version`, the `mapstruct` dependency and the entire
`maven-compiler-plugin` block; the parent's `parameters` and `release` settings keep applying.
Limit recorded: the jar scan covers what has been resolved on this machine, which includes the
backend's full compile classpath because the backend builds here (the processor jar is present).
Unblocks Q11.

---

❓ **Q8** - **What happens to the `mapper` package?**: Options: delete it, or keep it empty /
for future mappers.

🔎 Facts: `backend/src/main/java/com/myfinance/backend/mapper/` holds only
`TransactionMapper.java`; `backend/src/test/java/com/myfinance/backend/mapper/` only
`TransactionMapperTest.java`. `ARCHITECTURE.md:63` lists `mapper/ MapStruct entity <-> DTO
mappers` in the package layout.

➡️ Delete both directories; remove the line from the package layout.

⚖️ Strongest argument against: none; an empty package is dead structure.

✅ Decision: delete; `ARCHITECTURE.md` layout updated (Q12). Unblocks Q12.

---

## Round 3 — tests, TDD, and the number of steps

❓ **Q9** - **What happens to `TransactionMapperTest`'s two cases?**: Options: (a) delete, relying
on the HTTP-level tests; (b) port them to a unit test of `TransactionResponse.from`; (c) keep a
scale-only unit test.

🔎 Facts:
- The test's own Javadoc (`TransactionMapperTest.java:19–23`) says it guards "the one thing a
  hand-written `from(...)` could never get wrong by accident but a generated mapper could". With
  the generated mapper gone, the premise is gone.
- Case 1, scale (`:30–47`), is asserted over HTTP three times: `POST` "34.99" → "34.9900"
  (`TransactionControllerTest.java:124`), `GET /{id}` "12.5" → "12.5000" (`:313`), `PUT` "250" →
  "250.0000" (`:637`).
- Case 2, every field (`:49–72`, which asserts neither `amount` nor `createdAt`), is covered
  over HTTP: `id` (`:121` isNumber, `:312`, `:634` value), `category.id`/`name` (`:122–123`,
  `:635–636`), `currency` (`:125`, `:638`), `type` and `occurredOn` (`:126–127`),
  `description` (`:128`, `:641`), `merchant` present and non-null (`:280`) and present and null
  (`:291`, `:720`), `createdAt` (`:129`), `profileId` absent (`:130`); `subscriptionId`
  non-null through the list endpoint (`SubscriptionChargeServiceTest.java:169`) and null after
  the subscription is deleted (`SubscriptionControllerTest.java:384`).
- The one mistake a positional constructor call admits that name matching does not is swapping
  two same-typed arguments. Same-typed groups in the record: `{id, subscriptionId}` (`Long`) and
  `{currency, description, merchant}` (`String`). Both are pinned with distinct values over HTTP:
  `$.id` must be a number for a manual transaction whose `subscriptionId` is null (`:121`), and
  `createStoresAndEchoesMerchant` asserts merchant "Lidl" beside description "weekly shop"
  (`:280–281`) while `:125/:128` assert "PLN" beside "liquid refill".
- JSON-path presence: Spring's `JsonPathExpectationsHelper` (spring-test 7.0.8, `javap -c`)
  evaluates with `Configuration.defaultConfiguration()` and rethrows a missing path as an
  `AssertionError`, so `value(nullValue())` passes only when the key is present with `null`.
- Brief §2: "replace, don't layer" — once tests exist at the deepened module's interface,
  tests of the shallow module it absorbed are waste.

➡️ (a) Delete `TransactionMapperTest` (and its package directory). No replacement test.

⚖️ Strongest argument against: a unit test of `from()` would fail faster and name the factory
directly. But none of the ten sibling factories has one (each is covered by its controller
test), and every assertion it would make already exists at the HTTP interface.

✅ Decision: delete; the HTTP interface is the test seam; `TransactionControllerTest`,
`SubscriptionChargeServiceTest` and `SubscriptionControllerTest` survive unchanged. Unblocks Q10–Q11.

---

❓ **Q10** - **Does the TDD rule require a failing test first?**: Options: (a) write a new
failing test; (b) treat it as a refactor verified by an unchanged suite before and after.

🔎 Facts: `CLAUDE.md` §4: "Refactor X → Ensure tests pass before and after." The project rule
(brief §5) asks for test-first "for anything with real logic"; this change adds no behaviour.
The conversion commit `6a29065` recorded the suite size at the time (428 tests = 426 + 2
mapper tests); the current size was not measured (no test runs allowed in this pass).

➡️ (b) Record the suite result before the change (`./mvnw -B verify`, Maven's own `Results:`
line), make the change, and require the same result minus exactly the two deleted mapper tests.

⚖️ Strongest argument against: a refactor without a new red test can hide an equivalence gap.
The gap analysis in Q9 shows every field and both same-typed groups are pinned at the HTTP
interface.

✅ Decision: no new test; before/after comparison of the full backend suite, expecting
"previous total − 2" and zero failures. Unblocks Q11.

---

❓ **Q11** - **One step or two?**: Options: (a) one commit: factory, call sites, deletions, pom,
doc; (b) two: switch to `from()` first, delete MapStruct afterwards.

🔎 Facts: an intermediate state of (b) has MapStruct configured, its processor running, and no
user — nothing is learned from shipping it. The whole change is roughly: +12 lines
(`from()`), −28 (`TransactionMapper`), −73 (`TransactionMapperTest`), −~20 (`pom.xml`), four
call-site edits, one Javadoc and one doc paragraph.

➡️ (a) One step.

⚖️ Strongest argument against: two steps would isolate a surprising build failure (for example
a processor appearing on the classpath). Q7's scan makes that unlikely, and the build fails
loudly either way.

✅ Decision: one separately shippable step, docs in the same commit. Unblocks Q12–Q13.

---

## Round 4 — documents, edge cases, siblings

❓ **Q12** - **What do the documents say afterwards, and does the lesson go into `LESSONS.md`?**:
Options for §3: (a) delete the MapStruct paragraph silently; (b) replace it with a short
statement of the one mapping idiom and why the library left; (c) move the history into an ADR.

🔎 Facts:
- `ARCHITECTURE.md:51–52` stack line lists "MapStruct (DTO mapping)"; `:63` the `mapper/`
  package; `:69–77` the "Why MapStruct, and why only in one place" paragraph.
- Brief §3: a reversal of `ARCHITECTURE.md` is recorded by updating the section, not by an ADR.
- `dto/TransactionResponse.java:14–15` Javadoc says the record is "Built from a Transaction by
  TransactionMapper".
- `docs/LESSONS.md` is git-ignored (`.gitignore:13`) and already holds "MapStruct: an annotation
  processor that writes the mapping code for you" (`docs/LESSONS.md:2694–2722`), which ends by
  claiming a hand-rolled mapper risks resetting scale.
- The maintenance design and plan (`docs/superpowers/…`) are dated records of a past run.
- No MapStruct mention in `README.md`, `docs/API.md`, `docs/SCHEMA.md` or `CLAUDE.md` (grep).

➡️ (b). Stack line without MapStruct; layout without `mapper/` and with `dto/` described as
"request/response records; each response record has a static `from(entity)` factory"; the
paragraph replaced by "One mapping idiom: `from()` factories", stating that a record's canonical
constructor makes an added component a compile error in its factory, that MapStruct was tried
for `TransactionResponse` (2026-09-08) and removed because at its default policy an unmapped
target is only a warning, and that the factories are called inside service transactions. Fix
the record's Javadoc. Add a `LESSONS.md` entry; leave the `docs/superpowers` records alone.

⚖️ Strongest argument against: (a) is shorter. But a future contributor who knows MapStruct
would reasonably re-introduce it; the paragraph is the recorded answer.

✅ Decision: (b), in the same commit; one new lesson ("a record's canonical constructor is the
compile-time field check") that references the existing MapStruct lesson rather than repeating
it. Exact replacement text in `docs-proposals.md`.

---

❓ **Q13** - **Edge cases and failure modes**: which concrete scenarios could make the new
factory behave differently from the generated mapper?

🔎 Facts: as cited in Q4–Q9, plus `Transaction.category` is `optional = false` and
`nullable = false` (`model/Transaction.java:27–29`), `amount` is `nullable = false` (`:31`),
`subscription` is nullable (`:55–57`) and cleared by `ON DELETE SET NULL` (`docs/API.md:1206–1208`).

➡️ Scenarios and outcomes:
1. *Lazy category read outside a transaction* — if a future caller invoked `from()` from a
   controller, `CategoryRef.from` would throw `LazyInitializationException`
   (`open-in-view=false`). Same constraint as today; all four call sites stay inside
   `TransactionService` methods.
2. *N+1 on the list* — unchanged, because the list keeps `fetchCategory()` and `from()` reads
   the already-fetched category.
3. *Swapped same-typed arguments* — caught by the distinct-value HTTP assertions (Q9).
4. *A component added to `TransactionResponse` later* — compile error in `from()` until it is
   supplied (the guarantee the old paragraph attributed to MapStruct).
5. *A component renamed* — `from()` still compiles (positional), the JSON key changes, and the
   HTTP assertions on that key fail; with candidate 15 the OpenAPI drift check also fails.
6. *Subscription deleted* — `getSubscriptionId()` returns `null`, serialised as a present
   `null` (asserted at `SubscriptionControllerTest.java:384`).
7. *Transaction not yet flushed* (`create`) — `save` returns the entity with its identity id and
   `@CreationTimestamp` value; unchanged from today (the mapper was called on the same object).

⚖️ Strongest argument against: scenario 5 is a real weakness of positional construction. It is
equally a weakness of the current mapper (a renamed target property warns and nulls), and it is
caught at the HTTP interface.

✅ Decision: no new code for any scenario; scenarios 1 and 3 are written into the spec's
Further Notes as rules for implementers.

---

❓ **Q14** - **Cross-candidate effects**: does this change need anything from, or change
anything for, a sibling (brief §8)?

🔎 Facts:
- Candidate 15 (this group) edits `TransactionResponse`'s annotations: its money step removes the
  `@Schema` on `amount` (`dto/TransactionResponse.java:21`); its nullability step adds markers on
  `description`, `merchant`, `subscriptionId`. Its OpenAPI drift check (step 1) would show that
  this refactor leaves the document unchanged.
- Candidate 1 (G1) deepens `ActiveProfile`, which `TransactionService` calls
  (`service/TransactionService.java:73, 90, 94, …`); candidate 11 (G2) changes how the
  Transaction filter is bound, touching `TransactionService.list` (`:93–100`), the line that
  holds the method reference.

➡️ No dependency in either direction; only textual overlap. Recommend landing 14 early — it is
the smallest change touching `TransactionService` and `TransactionResponse` — ideally after
candidate 15's step 1 so that the committed OpenAPI document proves the refactor changed nothing
on the wire, but it does not have to wait for it.

⚖️ Strongest argument against: waiting for 15.1 delays a trivial change. The wait is optional.

✅ Decision: Depends on: none. Sequencing advice recorded in the spec.

---

Frontier after Round 4: empty. Every branch the card required (preservation, the test's fate,
pom contents and processor dependence, documents and lesson, one step or two) is settled, plus
constraints, dependency category, seam, edge cases and siblings.

---

## Decisions (one-page summary)

1. **Pure refactor.** Every transaction endpoint returns byte-identical JSON; the `@Schema` on
   `amount` is untouched (candidate 15 owns it).
2. **The recorded reason is inverted.** MapStruct 1.6.3 defaults `unmappedTargetPolicy` to
   `WARN` (verified in the jar) and the pom sets nothing stricter, so an added field is a
   warning and a `null`; a record's canonical constructor makes it a compile error.
3. **Shape.** `TransactionResponse.from(Transaction)`, a static factory on the record exactly as
   before `6a29065`: ten getter calls in component order, `CategoryRef.from` for the category,
   `getSubscriptionId()` for the proxy-safe id, `amount` copied as-is (already scale 4).
4. **Call sites.** Four in `TransactionService` (create, get, list via `TransactionResponse::from`,
   update); the mapper leaves the constructor. Calls stay inside the service's transactions.
5. **Build.** Delete `mapstruct.version`, the `mapstruct` dependency and the whole
   `maven-compiler-plugin` block. The parent keeps supplying `-parameters` and `--release 21`
   (verified in the parent POM); no other annotation processor exists on the compile classpath
   (jar scan).
6. **Package.** `mapper/` is deleted in main and test.
7. **Tests.** `TransactionMapperTest` is deleted, not replaced: its two cases and the only
   extra hazard of positional construction (swapped same-typed arguments) are pinned at the HTTP
   interface with distinct values. The seam is the HTTP interface; the rest of the suite is
   unchanged; verification is "same results minus two tests".
8. **One step**, docs in the same commit.
9. **Docs.** `ARCHITECTURE.md` §3: stack line, package layout, and the "Why MapStruct" paragraph
   replaced by "One mapping idiom: `from()` factories". `TransactionResponse` Javadoc fixed. No
   ADR. New `LESSONS.md` entry on the canonical constructor as the compile-time field check.
10. **Siblings.** Depends on nothing. Textual overlap only with candidate 15 (annotations on the
    same record), candidate 1 and candidate 11 (`TransactionService`); land early, ideally after
    15.1.

**Facts not verified (and why):**
- The current backend test count — no test runs were allowed; the spec asks the implementer to
  record it before the change.
- That the build is warning-free after removal — not built; the jar scan and parent POM reading
  are the evidence.
- The scan of `~/.m2` covers only artifacts resolved on this machine (sufficient for the
  backend's own classpath, which builds here).
