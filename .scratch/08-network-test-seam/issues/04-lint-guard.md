# 04: A lint rule keeps new tests on the network seam

**What to build:** a contributor who mocks the hooks or client module in a new test file, or answers JSON without naming its wire type, gets a lint error that points at the ARCHITECTURE.md paragraph. The files that still mock those modules are named in one allowlist, the migration's visible progress. ARCHITECTURE.md says so in one sentence.

**Blocked by:** 03 — The pinned-tile tests run on the network seam

**Status:** done

- [x] A hook mock planted in a new test file fails lint (planted once, reverted)
- [x] A JSON answer without a type argument fails lint (planted once, reverted)
- [x] A misspelt field in a typed answer fails `npm run build` (planted once, reverted)
- [x] The allowlist names exactly the twelve hook-mocked files and the old invalidation test
- [x] lint, format, test and build stay green

## Comments

- **Planted, each seen failing and reverted:**
  - a new test file with `vi.mock('../api/hooks')` and `vi.mock('../api/client')`: both lines are
    lint errors; a `vi.mock` of a component in the same file is not;
  - `HttpResponse.json([...])` without a type argument, in that new file and in an allowlisted
    file (`Budgets.test.tsx`): lint errors in both — the allowlist relaxes only the mock ban;
  - the allowlist emptied: exactly the thirteen allowlisted files fail, one error each, which
    proves the specifier pattern matches both `'../api/hooks'` and `'./client'`;
  - `colour` instead of `color` in a typed `CategoryNode[]` answer: `npm run build` fails with
    TS2561.
- **Allowlist at thirteen**, as the spec says: the twelve hook-mocked files and the old
  invalidation test. The pinned-tile test that spec 17 added on the client-stub seam was converted
  (ticket 03) rather than allowlisted.
