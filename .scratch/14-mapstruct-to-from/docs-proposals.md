# Candidate 14 — documentation proposals

## (a) Proposed glossary terms

None. This is a build and code-structure change; it introduces no domain concept. (The phrase
"response record" and the `from(entity)` factory are implementation vocabulary and belong in
ARCHITECTURE.md, not in the domain glossary.)

## (b) Proposed ADRs

None. The change reverses a decision recorded in ARCHITECTURE.md §3. Per the shared brief's repo
rule, the reversal is recorded by updating that section in the same change (below), not by a
separate ADR, so there stays one source of truth.

## (c) Required updates to recorded-decision documents

All in the same commit as the code change.

### ARCHITECTURE.md — §3 "Backend", stack line (currently line 51–52)

Now: "**Stack:** Java 21, Spring Boot, Spring Data JPA, Spring Security, PostgreSQL, Flyway,
MapStruct (DTO mapping), ArchUnit (structural tests)."

After: "**Stack:** Java 21, Spring Boot, Spring Data JPA, Spring Security, PostgreSQL, Flyway,
ArchUnit (structural tests)."

### ARCHITECTURE.md — §3, package layout block (currently line 63)

Remove the line `├── mapper/       MapStruct entity <-> DTO mappers`.

Change the `dto/` line to:
`├── dto/          request/response records (each response record has a static from(entity) factory)`

### ARCHITECTURE.md — §3, the paragraph "Why MapStruct, and why only in one place" (currently lines 69–77)

Replace the whole paragraph with:

> **One mapping idiom: `from()` factories.** Every response DTO is a record with a static
> `from(entity)` factory that calls the record's canonical constructor, and services call it
> inside their transactions (some entity associations are lazy and open-in-view is off). The
> canonical constructor is the compile-time check: add a component to a response record and its
> factory stops compiling until it supplies a value. The remaining risk of a positional call —
> two same-typed arguments swapped — is caught by the controller tests, which assert each field
> with distinct values. MapStruct generated `TransactionResponse`'s mapping from 2026-09-08 until
> its removal: at its default `unmappedTargetPolicy` a missing target field is only a compiler
> warning (and a `null` on the wire), so it was a weaker check than the constructor it replaced,
> at the cost of a dependency, an annotation processor and a package for one method.

(Replace "until its removal" with the commit date when implementing.)

### No other recorded-decision document changes

- `docs/API.md`, `docs/SCHEMA.md`, `docs/INSIGHTS.md`: no mention of MapStruct or the mapper
  (checked by grep); the wire contract does not change.
- `README.md`, `CLAUDE.md`: no mention (checked).
- `docs/superpowers/specs/2026-09-07-maintenance-run-design.md` and
  `docs/superpowers/plans/2026-09-07-maintenance-run.md`: dated records of the run that added
  MapStruct (plan Task 37); left as history.

### Code comments that document the old design (not recorded-decision documents, but must not drift)

- `TransactionResponse`'s class Javadoc: replace "Built from a Transaction by TransactionMapper"
  with "Built from a Transaction by `from`, like every response record."
- The mapper's own Javadoc is deleted with the class.

### docs/LESSONS.md (git-ignored; local only)

Add one entry after implementing:

- **What** — a record's canonical constructor is the compile-time field check; a hand-written
  `from()` factory therefore fails to compile when a component is added, which is stronger than
  MapStruct's default (`unmappedTargetPolicy = WARN`).
- **Where** — `TransactionResponse.from`, called by `TransactionService`.
- **Why it's this way** — positional construction's one weakness (swapped same-typed arguments)
  is covered by distinct-value assertions in `TransactionControllerTest`; see the earlier entry
  "MapStruct: an annotation processor that writes the mapping code for you" for how the removed
  library worked (reference it rather than repeat it). Python comparison: a dataclass fails on a
  missing argument only when the call runs; Java rejects it at compile time, and has no keyword
  arguments to prevent swaps.
