# Repo-wide Maintenance Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `my-finance` to production grade — a real frontend test harness, the nine user-visible gaps closed, focused files, and the libraries that earn their place.

**Architecture:** Four phases in strict order. **M0** builds the verification net (Vitest/RTL/MSW, ESLint, formatters, coverage, e2e-in-CI) and changes no behaviour. **M1** closes gaps G1–G9 against that net. **M2** refactors — but only files the net already covers. **M3** adds the library/DX layer. Each phase leaves every suite green.

**Tech Stack:** Java 21 / Spring Boot 4.1.0 (Jackson 3), Python 3.12 / FastAPI / psycopg 3 / uv / ruff, React 19.2 / Vite 7 / TypeScript 5.9, PostgreSQL 16, Playwright 1.56.

**Spec:** `docs/superpowers/specs/2026-09-07-maintenance-run-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **All work stays local.** Never `git push`, never open a PR, never invoke `gh`. The run ends on an unmerged branch.
- Every commit ends with these two trailers, exactly:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD`
- **Never create a database on the host.** Use Testcontainers or the repo's `docker compose`. **Never pass `-v` to `docker compose down`** — it is project-scoped, not service-scoped, and has destroyed the dev volume twice.
- `docs/LESSONS.md` is gitignored: write entries, **never `git add` it**. Verify with `git status --short docs/LESSONS.md` printing nothing.
- **Never run a formatter the repo does not configure.** Task 3 (Prettier), Task 4 (Spotless) and Task 5 (`ruff format`) configure them; before each lands, that formatter may not be run.
- **`frontend/src/styles.css` must not be modified.** It is the design-system file; app CSS is confined to `app.css`. All responsive work goes in `app.css`. Never re-sync `styles.css` from `docs/design/styles.css` — they differ by a Google Fonts `@import` deliberately disabled in Phase 3.
- Read Maven's own `Results:` aggregate line for test counts. **Never** sum `target/surefire-reports/*.xml` — it accumulates stale files and has produced a wrong count before.
- Throwaway probe classes go in the scratchpad, never `src/test`.
- `docs/SCHEMA.md` and `docs/API.md` are binding. Any new endpoint, parameter or error shape updates `docs/API.md` **in the same task**.
- Profile scoping is a security boundary (ARCHITECTURE.md §3). Every query is scoped server-side to the authenticated profile. Cross-profile access is **404, never 403**.
- Money is `NUMERIC(19,4)` and crosses the wire as a **decimal string at scale 4** (`"243.5000"`), never a float.
- **Node: every shell that runs `node`, `npm` or `npx` MUST start with these two lines.** Not optional, not only the first command in a task — every separate bash invocation:

  ```bash
  export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm use 24
  ```

  Both halves are needed, for two different reasons. `~/.bashrc` returns early for non-interactive shells (its standard `case $- in *i*)` guard), so nvm is never loaded on its own. And sourcing alone is **not** enough either: the inherited `PATH` already contains `~/.nvm/versions/node/v20.20.2/bin`, which sourcing does not displace — without the explicit `nvm use 24` you silently get **v20.20.2**. (With no PATH at all you would get the system **v18.19.1**.) **Confirm `node -v` prints `v24.x` before running any install, build or test.** Anything else means the line was skipped.
- The e2e suite needs the backend on `localhost:8080`, which plain `docker compose up` does not publish. Use `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d` (created in Task 8).

## File Structure

**Created in M0:** `frontend/vitest.config.ts`, `frontend/eslint.config.js`, `frontend/.prettierrc.json`, `frontend/src/test/setup.ts`, `frontend/src/test/msw.ts`, `frontend/src/test/renderWithProviders.tsx`, `frontend/e2e/a11y.spec.ts`, `frontend/e2e/responsive.spec.ts`, `.git-blame-ignore-revs`, `.editorconfig`.

**Created in M1:** `frontend/src/screens/BudgetForm.tsx`, `frontend/src/lib/schemas.ts`, plus per-screen test files alongside the screens they cover.

**Created in M2:** `frontend/src/api/hooks/` (one module per domain: `auth.ts`, `profiles.ts`, `categories.ts`, `transactions.ts`, `budgets.ts`, `subscriptions.ts`, `insights.ts`, `index.ts` re-exporting all), `frontend/src/insights/` sub-modules, `analytics/src/analytics/llm/grounding.py`.

**Created in M3:** `backend/src/main/java/com/myfinance/backend/config/OpenApiConfig.java`, `backend/src/test/java/com/myfinance/backend/ArchitectureTest.java`, `frontend/scripts/generate-types.mjs`, `.github/dependabot.yml`, `lefthook.yml`.

---

# Phase M0 — Verification

No behaviour changes in this phase. Its only job is to make the next three phases safe.

### Task 0: Upgrade the runtime to Node 24 LTS

**Files:**
- Create: `.nvmrc`
- Modify: `.github/workflows/ci.yml:27`, `frontend/Dockerfile:2`

**Interfaces:**
- Produces: Node 24.20.0 as the repo's runtime. Every later frontend task depends on it — vitest 5 requires Node `>=22.12` and jsdom 30's `undici@8` requires `>=22.19`.

Node 20 is in maintenance and is the only thing forcing older majors. `nvm` is
already installed, so this is user-space and reverts with `nvm use 20`.

- [ ] **Step 1: Install and select Node 24**

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
nvm install 24 && nvm use 24
nvm alias default 24
node -v
```
Expected: `v24.20.0` (or a later 24.x).

`nvm alias default 24` is load-bearing, not tidiness: every later task runs in a
fresh shell that reads the default alias. Without it they would all silently get
Node 20 again and the vitest 5 / jsdom 30 pins would fail. Reversible with
`nvm alias default 20`.

- [ ] **Step 2: Record the runtime in the repo**

```bash
echo "24" > .nvmrc
```

- [ ] **Step 3: Verify the existing repo is unaffected**

```bash
cd /home/chris/side-projects/my-finance/frontend
rm -rf node_modules && npm ci && npm run build
```
Expected: install reports `found 0 vulnerabilities`, build ends `✓ built in …`. An `npm warn install-scripts` note about `esbuild` is npm 11 behaviour and is expected.

- [ ] **Step 4: Bump CI**

In `.github/workflows/ci.yml`, in the `frontend` job, change `node-version: '20'` to `node-version: '24'`.

- [ ] **Step 5: Bump the frontend image**

In `frontend/Dockerfile` line 2, change `FROM node:20-alpine AS build` to `FROM node:24-alpine AS build`.

- [ ] **Step 6: Verify the image still builds**

```bash
cd /home/chris/side-projects/my-finance && docker compose build frontend
```
Expected: build completes successfully.

- [ ] **Step 7: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add .nvmrc .github/workflows/ci.yml frontend/Dockerfile
git commit -m "$(cat <<'EOF'
chore: upgrade the runtime to Node 24 LTS

Node 20 is in maintenance and was the only thing forcing older majors of
vitest and jsdom. The version was pinned in three places -- nvm, ci.yml and
the frontend Dockerfile -- now including .nvmrc so the runtime lives in the
repo rather than in one machine's shell.

Verified before committing: npm ci and npm run build clean, and the existing
Playwright suite passes 7/7 on 24.20.0.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

### Task 1: Frontend test harness (Vitest + RTL + MSW)

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`, `frontend/src/test/setup.ts`, `frontend/src/test/renderWithProviders.tsx`
- Test: `frontend/src/screens/Budgets.test.tsx`

**Interfaces:**
- Produces: `renderWithProviders(ui: React.ReactElement): RenderResult` — wraps a component in a fresh `QueryClientProvider` and `MemoryRouter`. Every later component test uses it.

**Interfaces (cont.):**
- Consumes: Node 24 from Task 0.

The versions below were installed together and executed on Node 24.20.0 before this plan was written — a React render, a `user-event` click and an msw-intercepted `fetch`, 2/2 passing. Use them as given.

- [ ] **Step 1: Install the harness**

```bash
cd /home/chris/side-projects/my-finance/frontend
npm install -D vitest@5.0.0 @vitest/coverage-v8@5.0.0 jsdom@30.0.1 \
  @testing-library/react@16.3.3 @testing-library/user-event@14.6.7 \
  @testing-library/jest-dom@7.0.1 msw@2.15.0
```

Expected: installs with no `npm error` and **no `EBADENGINE` warning** — if one appears, you are on Node 20; run `nvm use 24` and reinstall.

- [ ] **Step 2: Create `frontend/vitest.config.ts`**

```ts
import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // Vitest's default glob would otherwise collect frontend/e2e/*.spec.ts,
    // which are Playwright specs and crash under the Vitest runner.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    coverage: { provider: 'v8', reporter: ['text', 'lcov'], include: ['src/**/*.{ts,tsx}'] },
  },
});
```

- [ ] **Step 3: Create `frontend/src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 4: Create `frontend/src/test/renderWithProviders.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

/** A fresh QueryClient per test: retries off so a failed query surfaces immediately
    instead of hanging the test for three backoffs. */
export function renderWithProviders(ui: ReactElement): RenderResult {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}
```

- [ ] **Step 5: Add the scripts to `frontend/package.json`**

Add to the `"scripts"` object, keeping the existing entries:

```json
    "test": "vitest run",
    "test:watch": "vitest",
    "coverage": "vitest run --coverage"
```

- [ ] **Step 6: Write the first real test — `frontend/src/screens/Budgets.test.tsx`**

This asserts the empty state, which is what the screen renders today with no budgets. It is a real regression test, not a smoke test: Task 13 will change this screen and this test must keep passing.

```tsx
import { screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { Budgets } from './Budgets';

vi.mock('../api/hooks', () => ({
  useActiveProfile: () => ({ id: 1, name: 'Household', defaultCurrency: 'PLN' }),
  useCategories: () => ({ data: [] }),
  useBudgets: () => ({ data: [] }),
  useBudgetStatuses: () => [],
}));

test('shows the empty state when the profile has no budgets', () => {
  renderWithProviders(<Budgets />);
  expect(screen.getByText(/No budgets yet for Household/)).toBeInTheDocument();
});
```

- [ ] **Step 7: Run the test**

Run: `cd frontend && npm test`
Expected: PASS — `1 passed`.

- [ ] **Step 8: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts \
        frontend/src/test frontend/src/screens/Budgets.test.tsx
git commit -m "$(cat <<'EOF'
test(frontend): add the Vitest + RTL + MSW harness

The frontend had no unit tests and no linter; CI proved only that it
compiled. This is the net the rest of the maintenance run depends on.

The harness was proven before being written into the plan: a React render,
a user-event click and an msw-intercepted fetch, all green on Node 24.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

### Task 2: ESLint flat config

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/eslint.config.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run lint` in `frontend/`, used by CI in Task 8 and by lefthook in the final task.

The config below was executed against a file with three planted defects and reported all three. Use it verbatim.

- [ ] **Step 1: Install**

```bash
cd /home/chris/side-projects/my-finance/frontend
npm install -D eslint@10.10.0 @eslint/js@10.0.1 typescript-eslint@8.69.0 \
  eslint-plugin-react-hooks@7.1.1 eslint-plugin-react-refresh@0.5.6 globals@17.12.0
```

- [ ] **Step 2: Create `frontend/eslint.config.js`**

```js
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['e2e/**/*.ts', 'playwright.config.ts', '**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
);
```

- [ ] **Step 3: Add the script to `frontend/package.json`**

```json
    "lint": "eslint src e2e"
```

- [ ] **Step 4: Run it and see the real state of the codebase**

Run: `cd frontend && npm run lint`
Expected: a non-empty list of problems. This is the first time this code has been linted, so findings are expected.

- [ ] **Step 5: Fix every reported error**

Fix errors (not warnings) reported in Step 4. **Rules for fixing:** correct the code, never silence the rule. Do not add `eslint-disable` comments. Do not change behaviour — if a fix would change what the app does, that is a Task-for-M1 finding: leave the code, and record it in the task report instead.

If `react-hooks/exhaustive-deps` fires with a genuinely intentional omission, add the dependency and verify the screen still behaves; if adding it causes a loop, leave the warning (it is a warning, not an error) and note it in the report.

- [ ] **Step 6: Verify clean and unbroken**

Run: `cd frontend && npm run lint && npm test && npm run build`
Expected: lint reports 0 errors; tests pass; build succeeds.

- [ ] **Step 7: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/package.json frontend/package-lock.json frontend/eslint.config.js frontend/src frontend/e2e
git commit -m "$(cat <<'EOF'
chore(frontend): add ESLint flat config and fix what it found

No linter existed anywhere in the repo. react-hooks alone catches the
dependency-array class of bug that nothing here was catching.

Errors are fixed by correcting the code; no rules were silenced and no
eslint-disable comments were added.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

> **EXECUTION ORDER — Tasks 3, 4 and 5 run LATE, immediately before Task 39.**
> They perform whole-repo reformats. Every M1 task's requirements live in the hunt
> findings files, which cite `file:line` as evidence; reformatting first would shift
> every one of those line numbers and turn precise findings into a search. Formatting
> is order-independent, so it costs nothing to run it after the work that depends on
> those citations. **Each of these three tasks adds its own CI check when it runs** —
> Task 8 deliberately does not reference `format:check`, because Prettier does not
> exist yet at that point.

### Task 3: Prettier, and the frontend reformat commit

**Files:**
- Create: `frontend/.prettierrc.json`, `frontend/.prettierignore`, `.git-blame-ignore-revs`, `.editorconfig`
- Modify: `frontend/package.json`, then every file under `frontend/src` and `frontend/e2e`

This retires the standing "never run an unconfigured formatter" hazard by removing its cause. Settings match the code's existing style (single quotes, trailing commas, 100 columns) so the reformat is small.

**The reformat is its own commit with no logic change.** Two commits come out of this task.

- [ ] **Step 1: Install**

```bash
cd /home/chris/side-projects/my-finance/frontend && npm install -D prettier@3.9.6
```

- [ ] **Step 2: Create `frontend/.prettierrc.json`**

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "semi": true
}
```

- [ ] **Step 3: Create `frontend/.prettierignore`**

```
dist
node_modules
test-results
playwright-report
package-lock.json
```

- [ ] **Step 4: Add scripts to `frontend/package.json`**

```json
    "format": "prettier --write src e2e",
    "format:check": "prettier --check src e2e"
```

- [ ] **Step 5: Commit the configuration alone, before any reformatting**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/.prettierrc.json frontend/.prettierignore frontend/package.json frontend/package-lock.json
git commit -m "$(cat <<'EOF'
chore(frontend): configure Prettier

Settings match the code's existing style, so the reformat that follows is
small. Configuring the formatter is what makes running it safe.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

- [ ] **Step 6: Reformat, and verify nothing broke**

```bash
cd frontend && npm run format && npm run lint && npm test && npm run build
```
Expected: all four succeed. **`frontend/src/styles.css` must not appear in the diff** — confirm with `git status --short frontend/src/styles.css` printing nothing (Prettier ignores CSS here because the scripts target `src e2e` for JS/TS; if it did reformat CSS, revert that file specifically).

- [ ] **Step 7: Commit the reformat by itself**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/src frontend/e2e
git commit -m "$(cat <<'EOF'
style(frontend): apply Prettier

Formatting only, no logic change. Recorded in .git-blame-ignore-revs so
git blame skips it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

- [ ] **Step 8: Record that commit in `.git-blame-ignore-revs`**

Create `.git-blame-ignore-revs` at the repo root:

```
# Bulk reformats — `git blame --ignore-revs-file .git-blame-ignore-revs`
# (or set blame.ignoreRevsFile once: git config blame.ignoreRevsFile .git-blame-ignore-revs)
```

Then append the hash of the commit made in Step 7:

```bash
cd /home/chris/side-projects/my-finance
git log -1 --format='%H  # style(frontend): apply Prettier' >> .git-blame-ignore-revs
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

- [ ] **Step 8b: Add the formatting check to CI.** In `.github/workflows/ci.yml`, extend the frontend job's run line to include `npm run format:check` after `npm run lint`. (Task 8 left it out deliberately — Prettier did not exist when that task ran.)

- [ ] **Step 9: Create `.editorconfig` at the repo root**

```
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space

[*.{ts,tsx,js,jsx,json,css,html,yml,yaml}]
indent_size = 2

[*.java]
indent_size = 4

[*.py]
indent_size = 4

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 10: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add .git-blame-ignore-revs .editorconfig
git commit -m "$(cat <<'EOF'
chore: add .editorconfig and .git-blame-ignore-revs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

### Task 4: Spotless on the backend

**Files:**
- Modify: `backend/pom.xml`, then every file under `backend/src`
- Modify: `.git-blame-ignore-revs`

Palantir's format is close to the existing style and, unlike google-java-format's 100-column AOSP variant, keeps the 4-space indentation this code already uses.

- [ ] **Step 1: Add the plugin to `backend/pom.xml`**

Inside `<build><plugins>`, alongside `spring-boot-maven-plugin`:

```xml
            <plugin>
                <groupId>com.diffplug.spotless</groupId>
                <artifactId>spotless-maven-plugin</artifactId>
                <version>3.10.2</version>
                <configuration>
                    <java>
                        <palantirJavaFormat>
                            <version>2.97.0</version>
                        </palantirJavaFormat>
                        <removeUnusedImports/>
                        <importOrder>
                            <order>java,javax,jakarta,org,com,</order>
                        </importOrder>
                    </java>
                </configuration>
                <executions>
                    <execution>
                        <goals>
                            <goal>check</goal>
                        </goals>
                        <phase>verify</phase>
                    </execution>
                </executions>
            </plugin>
```

- [ ] **Step 2: Commit the configuration alone**

```bash
cd /home/chris/side-projects/my-finance
git add backend/pom.xml
git commit -m "$(cat <<'EOF'
chore(backend): configure Spotless with palantir-java-format

Bound to the verify phase, so unformatted code fails the build the same
way a failing test does.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

- [ ] **Step 3: Apply the format**

```bash
cd /home/chris/side-projects/my-finance/backend && ./mvnw -B spotless:apply
```

- [ ] **Step 4: Verify the suite still passes**

Run: `cd backend && ./mvnw -B verify`
Expected: BUILD SUCCESS. Read the test count from Maven's own `Results:` aggregate line — **never** from `target/surefire-reports/*.xml`, which accumulates stale files. Record that number in the task report; it must not decrease.

- [ ] **Step 5: Commit the reformat and record it**

```bash
cd /home/chris/side-projects/my-finance
git add backend/src
git commit -m "$(cat <<'EOF'
style(backend): apply Spotless

Formatting only, no logic change.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
git log -1 --format='%H  # style(backend): apply Spotless' >> .git-blame-ignore-revs
git add .git-blame-ignore-revs && git commit -m "$(cat <<'EOF'
chore: record the backend reformat in .git-blame-ignore-revs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

### Task 5: `ruff format` on analytics

**Files:**
- Modify: `analytics/pyproject.toml`, then every file under `analytics/src` and `analytics/tests`
- Modify: `.git-blame-ignore-revs`

ruff is already the analytics linter and already runs in CI; this adds its formatter, so no new tool enters the toolchain.

- [ ] **Step 1: Add the formatter's settings to `analytics/pyproject.toml`**

Append after the `[tool.ruff.lint.isort]` block:

```toml
[tool.ruff.format]
# The codebase already uses double quotes; say so explicitly rather than
# relying on the default staying put across ruff versions.
quote-style = "double"
```

- [ ] **Step 2: Check what would change, without changing it**

```bash
cd /home/chris/side-projects/my-finance/analytics && uv run ruff format --diff .
```
Expected: a diff. Read it — if it proposes anything that is not whitespace, quotes or line wrapping, stop and report it.

- [ ] **Step 3: Commit the configuration alone**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/pyproject.toml
git commit -m "$(cat <<'EOF'
chore(analytics): configure ruff format

ruff is already the linter and already runs in CI, so this adds a
formatter without adding a tool.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

- [ ] **Step 4: Apply and verify**

```bash
cd analytics && uv run ruff format . && uv run --locked ruff check . && uv run --locked pytest -q
```
Expected: ruff check clean; pytest all-pass. Record the test count in the report; it must not decrease.

- [ ] **Step 5: Commit the reformat and record it**

```bash
cd /home/chris/side-projects/my-finance
git add analytics/src analytics/tests
git commit -m "$(cat <<'EOF'
style(analytics): apply ruff format

Formatting only, no logic change.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
git log -1 --format='%H  # style(analytics): apply ruff format' >> .git-blame-ignore-revs
git add .git-blame-ignore-revs && git commit -m "$(cat <<'EOF'
chore: record the analytics reformat in .git-blame-ignore-revs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

### Task 6: JaCoCo coverage on the backend

**Files:**
- Modify: `backend/pom.xml`

Coverage becomes a number anyone can read. No threshold is enforced yet — a failing gate on day one would block the run; the number is the deliverable.

- [ ] **Step 1: Add the plugin to `backend/pom.xml`**

```xml
            <plugin>
                <groupId>org.jacoco</groupId>
                <artifactId>jacoco-maven-plugin</artifactId>
                <version>0.8.15</version>
                <executions>
                    <execution>
                        <id>prepare-agent</id>
                        <goals><goal>prepare-agent</goal></goals>
                    </execution>
                    <execution>
                        <id>report</id>
                        <phase>verify</phase>
                        <goals><goal>report</goal></goals>
                    </execution>
                </executions>
            </plugin>
```

- [ ] **Step 2: Run and read the number**

```bash
cd backend && ./mvnw -B verify
```
Expected: BUILD SUCCESS, and `backend/target/site/jacoco/index.html` exists. Extract the headline instruction coverage:

```bash
python3 -c "
import csv
rows=list(csv.DictReader(open('backend/target/site/jacoco/jacoco.csv')))
m=sum(int(r['INSTRUCTION_MISSED']) for r in rows); c=sum(int(r['INSTRUCTION_COVERED']) for r in rows)
print(f'instruction coverage: {100*c/(c+m):.1f}%  ({c}/{c+m})')"
```
Record that percentage in the task report — it is the M0 baseline.

- [ ] **Step 3: Ignore the report output**

Confirm `backend/target/` is already gitignored (`git check-ignore backend/target && echo ignored`). If it is not, add `target/` to `backend/.gitignore`.

- [ ] **Step 4: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add backend/pom.xml
git commit -m "$(cat <<'EOF'
chore(backend): add JaCoCo coverage reporting

No threshold is enforced yet; the point is that the number is now visible
rather than assumed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

### Task 7: Accessibility gate in the e2e suite

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/e2e/a11y.spec.ts`

**Interfaces:**
- Produces: `frontend/e2e/a11y.spec.ts`, wired into CI by Task 8.

An axe sweep was run by hand over all six screens while this plan was written and reported **zero** WCAG 2.0/2.1 A+AA violations. This task makes that a permanent gate: the suite is green today and stays that way. Do not "fix" contrast — there is nothing failing.

- [ ] **Step 1: Install**

```bash
cd /home/chris/side-projects/my-finance/frontend && npm install -D @axe-core/playwright@4.13.0
```

- [ ] **Step 2: Create `frontend/e2e/a11y.spec.ts`**

The login/seed helpers here are deliberately self-contained: `smoke.spec.ts` keeps its helpers private, and copying six short lines is better than exporting internals from a spec file.

```ts
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'sturdy-password-1';

async function registerPickAndGo(page: Page, path: string) {
  const email = `a11y-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto('/');
  await page.getByRole('button', { name: /create an account|register|sign up/i }).first().click();
  await page.getByLabel(/display name/i).fill('A11y User');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /create account|register|sign up/i }).last().click();
  await page.getByLabel(/profile name|name/i).first().fill('Household');
  await page.getByRole('button', { name: /create|save/i }).first().click();
  await page.waitForURL(/\/(?!picker)/);
  await page.goto(path);
}

const SCREENS = ['/', '/transactions', '/budgets', '/categories', '/subscriptions', '/insights'];

for (const path of SCREENS) {
  test(`no WCAG A/AA violations on ${path}`, async ({ page }) => {
    await registerPickAndGo(page, path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    // Print the offenders rather than only a count, so a failure is actionable.
    const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}x): ${v.help}`);
    expect(summary, `axe violations on ${path}`).toEqual([]);
  });
}
```

- [ ] **Step 3: Adjust the registration helper to the real markup**

The selectors above are a best-effort reading of `AuthScreen.tsx` and `ProfilePicker.tsx`. Open both files and correct the helper to match the actual labels and button text. **Do not change the app's markup to fit the test** — if a control genuinely has no accessible name, that is an M1 finding: record it in the report and use a different selector here.

- [ ] **Step 4: Run it**

```bash
cd /home/chris/side-projects/my-finance
docker compose up -d
cd frontend && npx playwright test a11y.spec.ts
```
Expected: 6 passed. If a violation appears, fix the markup — it is a real defect this task exists to catch.

- [ ] **Step 5: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/package.json frontend/package-lock.json frontend/e2e/a11y.spec.ts
git commit -m "$(cat <<'EOF'
test(e2e): gate every screen on axe WCAG A/AA

A manual sweep during design found zero violations across all six screens.
This keeps it that way rather than rediscovering it later.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

### Task 8: Make the e2e suite runnable against compose, and put the real checks in CI

**Files:**
- Create: `docker-compose.e2e.yml`
- Modify: `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Consumes: `frontend/e2e/a11y.spec.ts` from Task 7.
- Produces: `docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d` as the documented way to run e2e.

This closes **G10**. `playwright.config.ts` proxies `/api` to `localhost:8080`, but `docker-compose.yml` publishes only nginx on 3000, so the suite fails 7/7 against a running stack with connection errors that look like product bugs. Publishing 8080 makes the same suite pass 7/7 — verified while this plan was written.

**CI note for the executor:** this repository is never pushed during this run, so **the CI job cannot be observed running**. Verify each CI change by executing the equivalent command locally and say so explicitly in your report. Do not claim CI passed.

- [ ] **Step 1: Create `docker-compose.e2e.yml`**

```yaml
# Publishes the backend so Playwright's Vite dev-server proxy can reach it.
# The default stack keeps 8080 container-internal; the e2e suite points at
# localhost:8080 (frontend/playwright.config.ts), so without this the whole
# suite fails with connection errors that look like product bugs.
#
#   docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d
services:
  backend:
    ports:
      - "8080:8080"
```

- [ ] **Step 2: Verify it works**

```bash
cd /home/chris/side-projects/my-finance
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d
sleep 8
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/auth/me
```
Expected: `401` — the backend is reachable and correctly refusing an unauthenticated call. `000` means it is not published.

- [ ] **Step 3: Run the whole e2e suite**

```bash
cd frontend && npx playwright test
```
Expected: all specs pass. Record the count in the report.

- [ ] **Step 4: Document it in `README.md`**

Find the section describing how to run the app and add, immediately after it:

```markdown
### Running the end-to-end tests

The Playwright suite drives the Vite dev server, which proxies `/api` to
`localhost:8080`. The default compose stack keeps the backend
container-internal, so bring it up with the e2e overlay:

```bash
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d
cd frontend && npx playwright test
```

Without the overlay every spec fails on connection errors rather than on
anything real.
```

- [ ] **Step 5: Add the frontend checks to CI**

In `.github/workflows/ci.yml`, replace the `frontend` job's build step so lint and unit tests run too:

```yaml
      - name: Lint, test and build
        run: cd frontend && npm ci && npm run lint && npm test && npm run build
```

- [ ] **Step 6: Add the e2e job to CI**

Append as a new job in `.github/workflows/ci.yml`:

```yaml
  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - name: Start the stack
        # The e2e overlay publishes the backend on 8080, which the Vite dev
        # server proxies to. Without it every spec fails on connection errors.
        run: docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build
      - name: Wait for the backend
        run: |
          for i in $(seq 1 60); do
            code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/api/auth/me || true)
            if [ "$code" = "401" ]; then echo "backend up"; exit 0; fi
            sleep 5
          done
          echo "backend never became ready"; docker compose logs backend; exit 1
      - name: Install and run Playwright
        run: cd frontend && npm ci && npx playwright install --with-deps chromium && npx playwright test
      - name: Stack logs on failure
        if: failure()
        run: docker compose logs --no-color --tail 200
```

- [ ] **Step 7: Verify locally what CI would run**

```bash
cd /home/chris/side-projects/my-finance/frontend
npm ci && npm run lint && npm test && npm run build
npx playwright test
```
Expected: every command succeeds. This is the local equivalent of both jobs; state in your report that CI itself was not observed.

- [ ] **Step 8: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add docker-compose.e2e.yml .github/workflows/ci.yml README.md
git commit -m "$(cat <<'EOF'
ci: run lint, unit tests and e2e, and make e2e reachable at all

The frontend job proved only that TypeScript compiled. It now lints,
checks formatting, runs the unit suite and builds, and a new job runs
Playwright against the real stack.

The e2e suite could not reach the backend against compose at all: the
suite points at localhost:8080 and the stack never published it, so it
failed 7/7 on connection errors. docker-compose.e2e.yml publishes it,
and the README says so.

Verified by running both jobs' commands locally; CI itself was not
observed, since this branch is never pushed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

---

# Phase M1 — Gaps

**Rebuilt 2026-09-07 from a three-lens deep hunt** (user-journeys, API contracts, data
correctness), replacing an earlier list drawn from a much shallower sample. The evidence for
every finding — repro steps, expected/actual, and the `file:line` that causes it — lives in:

- `.superpowers/sdd/2026-09-07-maintenance-run/hunt/journeys.md` (J1–J15)
- `.superpowers/sdd/2026-09-07-maintenance-run/hunt/contracts.md` (C1–C12)
- `.superpowers/sdd/2026-09-07-maintenance-run/hunt/correctness.md` (D1–D7)

**Every task below names the findings it closes. Read those findings first — they are the
requirement.** Do not re-derive the diagnosis; it is already done and verified.

Tasks are ordered by severity, so stopping early still banks the valuable work. Every task in
this phase changes user-visible behaviour, so every task begins with a test that fails first.

**Fixtures already in the dev database** (deliberately kept — do not delete):
profile "Household" with **235 transactions**, profile 46 "Audit Probe" with **208**, profile
45 "Audit Probe B", profile "Audit Empty", user 41. The two large profiles are what make
200-cap regressions detectable; a fixture under 201 rows cannot fail these tests.

---

### Task 9: Kill the 200-row cap at every display site

**Closes:** D2, D4 (significant); D3, D5, J6, J7 (minor/significant) — read all six.

**Files:**
- Create: `backend/src/main/java/com/myfinance/backend/dto/TransactionSummary.java`, `dto/CategoryTransactionCount.java`
- Modify: `backend/.../repository/TransactionRepository.java`, `service/TransactionService.java`, `controller/TransactionController.java`, `docs/API.md`
- Modify: `frontend/src/api/hooks.ts`, `frontend/src/api/types.ts`, `frontend/src/screens/Transactions.tsx`, `frontend/src/screens/Categories.tsx`, `frontend/src/screens/Dashboard.tsx`
- Test: backend controller tests; `frontend/src/screens/Transactions.test.tsx`, `Categories.test.tsx`, `Dashboard.test.tsx`

**Interfaces produced:**
- `GET /api/transactions/summary` — same filters as `GET /api/transactions` (`from`, `to`, `categoryId`, `includeDescendants`, `type`, and `q` once Task 19 lands), returning one row per currency:
  `[{ "currency": "PLN", "income": "1234.5600", "expense": "999.0000", "net": "235.5600", "count": 235 }]` — decimal strings at scale 4.
- `GET /api/transactions/category-counts` — `[{ "categoryId": 7, "count": 43 }]`, counts per category **as filed** (no roll-up; the UI does its own).
- `GET /api/transactions/category-totals` — `[{ "categoryId": 7, "currency": "PLN", "total": "812.3400" }]`, for the Dashboard chart.
- Frontend: `useTransactionSummary(query)`, `useCategoryCounts()`, `useCategoryTotals(query)`.

**This is the most important task in the phase.** The same root cause — computing a total by
summing one bounded page — appears at four display sites. D2 is the worst: on the Dashboard,
an entire category worth 1117.99 PLN disappeared from the chart with no disclosure at all.

- [ ] **Step 1: Write the failing backend tests.** For each of the three endpoints, seed **more than 200 rows** and assert the aggregate covers all of them. Also: per-currency separation (two currencies never summed), the category filter with and without `includeDescendants`, and that another profile's rows never appear. **A fixture of 200 rows or fewer cannot detect the bug these tests exist to prevent** — use 205+.
- [ ] **Step 2: Run them and watch them fail** — `cd backend && ./mvnw -B test -Dtest=TransactionControllerTest`. Expected: 404, the endpoints do not exist.
- [ ] **Step 3: Implement the three aggregates.** Group in SQL. For subtree filtering, follow the existing recursive CTE in `TransactionRepository.sumExpensesBySubtreeAndPeriod` (read it first) including its `profile_id` predicate in **both** terms. Normalise every amount through `Money.normalize` so it serialises at scale 4. Declare all three `@GetMapping`s **above** `@GetMapping("/{id}")` so the literal paths win.
- [ ] **Step 4: Run backend tests** — `./mvnw -B verify`. BUILD SUCCESS; record the count from Maven's `Results:` line (baseline: 356).
- [ ] **Step 5: Replace every capped client-side computation.** Delete the `size: 200` queries and the client-side summing in `Transactions.tsx` (the money tiles), `Categories.tsx` (per-row counts), and `Dashboard.tsx` (spend-by-category, and the Net tile's excluded-currency count). Each becomes a call to the matching aggregate.
- [ ] **Step 6: Delete the apologies along with the limitation.** These strings described a cap that no longer exists and must not survive it: the `title="counted from the latest 200 transactions"` tooltip and the `' · txn counts from the latest 200'` header in `Categories.tsx`, and any equivalent caption in `Transactions.tsx`/`Dashboard.tsx`. Grep for `200` across `frontend/src` and justify every remaining hit in your report.
- [ ] **Step 7: Fix the search caption (J6).** It currently claims `"21 of 235 transactions match"` while having searched only the loaded page — the true count was 91. Until Task 19 makes search server-side, the caption **must not assert a whole-dataset count**. Either drive it from the summary endpoint's `count`, or reword it to describe only what it actually knows. Do not leave a confident wrong number.
- [ ] **Step 8: Give the Net tile the same disclosure as its neighbours (J7)** and make tile captions respect the active type filter.
- [ ] **Step 9: Write the frontend regression tests.** For each screen, mock the aggregate hooks to return a total far larger than the mocked row list, and assert the screen renders the **aggregate's** number. That is the assertion that fails on today's code. Add the Categories tooltip test:
```tsx
test('no tooltip hides a caveat about capped counts', () => {
  renderWithProviders(<Categories />);
  for (const el of document.querySelectorAll('[title]')) {
    expect(el.getAttribute('title')).not.toMatch(/latest 200|200 transactions/i);
  }
});
```
- [ ] **Step 10: Verify against the real fixtures.** With the stack up, log in as the seeded "Household" profile (235 transactions) and confirm by hand that the Transactions tiles, the Categories counts and the Dashboard chart now agree with SQL. Put the before/after numbers in your report.
- [ ] **Step 11: Update `docs/API.md`** with all three endpoints, stating that totals cover every matching row regardless of pagination.
- [ ] **Step 12: Verify and commit** — `./mvnw -B verify`; `cd frontend && npm run lint && npm test && npm run build && npx playwright test`. Commit subject: `fix: report totals over every matching row, not the first page`.

### Task 10: Confirm before destroying anything

**Closes:** J3 (significant).

**Files:** `frontend/src/screens/Transactions.tsx`, `Subscriptions.tsx`, `frontend/src/components/PinnedInsights.tsx` (and wherever insight delete lives — find it), plus a new shared component; tests alongside.

Four irreversible actions fire on a single click with no confirmation and no undo: deleting a
transaction, deleting a saved insight, cancelling a subscription, and permanently deleting a
subscription. In a finance app, a mis-click silently destroys records.

- [ ] **Step 1: Write the failing tests** — for each of the four, assert that clicking the control does **not** call the mutation until a confirmation is accepted, and that dismissing it calls nothing.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Build one shared confirmation component.** One component, used four times — not four bespoke dialogs. It must: name the specific record ("Delete the transaction 'Biedronka — 43.20 zł'?"), state what is lost, use the existing `.btn`/`.btn-primary`/`.btn-secondary` classes, be dismissible with Escape, and put initial focus on the **cancel** action, not the destructive one.
- [ ] **Step 4: Distinguish cancel from delete for subscriptions.** Cancelling is reversible (see Task 20) and permanent deletion is not. The two confirmations must not read the same.
- [ ] **Step 5: Keep the axe gate green** — the dialog needs `role="dialog"`, `aria-modal="true"` and an accessible name. Run `npx playwright test a11y.spec.ts`.
- [ ] **Step 6: Verify and commit** — `npm run lint && npm test && npm run build && npx playwright test`. Subject: `feat(frontend): confirm before destroying a record`.

### Task 11: Stop compounding rounding in `yearlyCost`

**Closes:** D1 (significant).

**Files:** `backend/.../service/SubscriptionService.java` (~line 146), `docs/API.md` (~line 992), subscription service tests.

`yearlyCost` sums **already-rounded** monthly equivalents and multiplies by 12, so a YEARLY
100.00 subscription reports `99.9996`. The defective formula is written into `docs/API.md`, so
the doc is part of the fix, not a bystander.

- [ ] **Step 1: Write the failing test** — a single YEARLY subscription of `100.0000` must report `yearlyCost` exactly `"100.0000"`. Add a WEEKLY case, whose 52.18-week year is the other rounding trap. Assert on exact strings, never on a float comparison.
- [ ] **Step 2: Run and watch it fail** — expect `99.9996`.
- [ ] **Step 3: Fix the arithmetic.** Compute the annual figure from the **unrounded** amount and round **once**, at the end. Keep `BigDecimal` throughout with the existing `RoundingMode`; never route through `double`.
- [ ] **Step 4: Check the monthly figure too** — verify `monthlyCost` is not double-rounded by the same pattern, and fix it if it is.
- [ ] **Step 5: Correct `docs/API.md`** — the documented formula is wrong; replace it with the corrected one and say what changed.
- [ ] **Step 6: Verify and commit** — `./mvnw -B verify`. Subject: `fix(backend): round subscription cost once, at the end`.

### Task 12: Budget update and delete (backend)

**Closes:** C2 (backend half).

**Files:** `backend/.../service/BudgetService.java`, `controller/BudgetController.java`, new `dto/UpdateBudgetRequest.java`, `docs/API.md`; budget controller tests.

**Interfaces produced:** `PUT /api/budgets/{id}` → `200 BudgetResponse`; `DELETE /api/budgets/{id}` → `204`. Task 13 consumes both.

Follow `SubscriptionService.update`/`delete` (lines 100–120) — load scoped to the profile,
mutate the managed entity, let the transaction flush.

- [ ] **Step 1: Create `UpdateBudgetRequest`** mirroring `CreateBudgetRequest` exactly: `categoryId`, `amountLimit`, `currency`, `periodStart`, `periodEnd`, same validation annotations, same class-level `@AssertTrue` period check.
- [ ] **Step 2: Write the failing tests** — update changes the limit and returns 200; moving a budget onto another budget's exact (category, period) is 409; landing back on its **own** current slot is **not** a collision; another profile's budget is **404, never 403**; delete returns 204, the budget leaves `GET /api/budgets`, and a second delete is 404.
- [ ] **Step 3: Run and watch them fail** (405/404 — the endpoints do not exist).
- [ ] **Step 4: Add `update` and `delete` to `BudgetService`**, with the same-slot exemption:
```java
boolean sameSlot = budget.getCategory().getId().equals(category.getId())
        && budget.getPeriodStart().equals(request.periodStart())
        && budget.getPeriodEnd().equals(request.periodEnd());
if (!sameSlot && budgetRepository.existsByProfileIdAndCategoryIdAndPeriodStartAndPeriodEnd(
        profileId, category.getId(), request.periodStart(), request.periodEnd())) {
    throw new BudgetExistsException();
}
```
- [ ] **Step 5: Add an `update` method to the `Budget` entity**, mirroring the constructor's assignments in the style of `Subscription.update`. Read the real field names first.
- [ ] **Step 6: Add the endpoints** (`@PutMapping("/{id}")`, `@DeleteMapping("/{id}")` with `@ResponseStatus(HttpStatus.NO_CONTENT)`).
- [ ] **Step 7: Add `GET /api/budgets/{id}`** — closes half of C8: `POST` already returns a `Location` header pointing at a URL that does not exist.
- [ ] **Step 8: Verify and commit** — `./mvnw -B verify`, update `docs/API.md`. Subject: `feat(api): budgets can be read by id, updated and deleted`.

### Task 13: Budget UI — create, edit, delete, and show budgets that aren't active today

**Closes:** C2 (frontend half), **J9** (significant).

**Files:** `frontend/src/screens/Budgets.tsx`, new `screens/BudgetForm.tsx`, new `lib/schemas.ts`, `api/hooks.ts`, `api/types.ts`; `Budgets.test.tsx`, new `BudgetForm.test.tsx`.

Two defects, one screen. Budgets has **no controls of its own** — measured: 9 interactive
elements, 6 of them the nav bar. And J9: `useBudgets(todayIso())` asks only for budgets active
*today*, so the day a period ends the budget vanishes and the screen announces "No budgets yet
for Household" — the user's history appears deleted.

This task introduces `react-hook-form` + `zod`, the form pattern later tasks reuse.

- [ ] **Step 1: Install** — `npm install react-hook-form@7.87.0 zod@4.5.4 @hookform/resolvers@5.9.1` (source nvm, `nvm use 24` first).
- [ ] **Step 2: Create `frontend/src/lib/schemas.ts`.** Money stays a **string** to the wire — the API takes decimal strings at scale 4, and a JS `number` is where scale dies:
```ts
import { z } from 'zod';

const moneyString = z
  .string().trim().min(1, 'Required')
  .regex(/^\d{1,15}(\.\d{1,4})?$/, 'Use digits, up to 4 decimal places')
  .refine((v) => Number(v) > 0, 'Must be greater than zero');

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const budgetSchema = z
  .object({
    categoryId: z.coerce.number().int().positive('Pick a category'),
    amountLimit: moneyString,
    currency: z.string().regex(/^[A-Z]{3}$/, 'Three-letter code, e.g. PLN'),
    periodStart: isoDate,
    periodEnd: isoDate,
  })
  .refine((v) => v.periodEnd >= v.periodStart, {
    message: 'End date must be on or after the start date',
    path: ['periodEnd'],
  });

export type BudgetFormValues = z.infer<typeof budgetSchema>;
```
- [ ] **Step 3: Write the failing form tests** — a zero limit shows "greater than zero" and does not submit; a valid submission passes `amountLimit` through as the **string** `'1500.50'`, never a number.
- [ ] **Step 4: Run and watch them fail.**
- [ ] **Step 5: Add `useCreateBudget`, `useUpdateBudget`, `useDeleteBudget`** to `hooks.ts`, following `useCreateSubscription`/`useUpdateSubscription`/`useDeleteSubscription` in the same file. Invalidate both `['budgets', profileId]` and `['budget-status', profileId]` on update.
- [ ] **Step 6: Build `BudgetForm.tsx`** with `zodResolver(budgetSchema)`. Every field gets a real `<label htmlFor>` bound to its input `id` — the tests select by label and the axe gate requires accessible names. Errors render next to their field in the existing `.error-box`. Reuse `.input`/`.btn` classes; add no new CSS.
- [ ] **Step 7: Fix J9 — stop hiding inactive budgets.** Replace the unconditional `useBudgets(todayIso())` with a period filter the user controls, defaulting to active-today but offering past and upcoming. The empty state must distinguish **"no budgets exist"** from **"none active in this period"** — the current copy asserts the former while only knowing the latter.
- [ ] **Step 8: Wire in the controls** — "New budget" in the header; "Edit" and "Delete" per card, each with an `aria-label` naming the budget (`Edit Groceries budget`); delete goes through Task 10's shared confirmation; the empty state offers "Create your first budget".
- [ ] **Step 9: Verify** — `npm run lint && npm test && npm run build && npx playwright test a11y.spec.ts`. Subject: `feat(frontend): manage budgets from the UI, including past periods`.

### Task 14: Edit transactions, and make merchant visible

**Closes:** J1, C4 (significant); **J5** (significant).

**Files:** `frontend/src/components/TxnModal.tsx`, `screens/Transactions.tsx`, `api/hooks.ts`; `Transactions.test.tsx`.

`PUT /api/transactions/{id}` exists and is tested but has no caller. J5 is the sharper half:
`merchant` can be **set** (including in bulk, via merchant-backfill) but is displayed nowhere and
can never be viewed, corrected or cleared — so a typo applied by backfill is permanent and
invisible.

- [ ] **Step 1: Write the failing tests** — an "Edit" control exists per row; opening it prefills every field **including merchant**; saving calls the update mutation with the edited values; the merchant column renders.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Add `useUpdateTransaction()`**, mirroring `useUpdateSubscription`. Invalidate `['transactions', profileId]` **and** `['transaction-summary', profileId]` and `['category-counts', profileId]` — Task 9's aggregates go stale otherwise.
- [ ] **Step 4: Give `TxnModal` an edit mode** — optional `initial?: TransactionResponse`, prefilling all fields; calls update instead of create when present. Do not disturb the create path.
- [ ] **Step 5: Surface merchant** — show it in the transactions table, and make it editable (and clearable to empty) in the modal. Clearing must send an actual clear, not silently keep the old value.
- [ ] **Step 6: Add the row action** with `aria-label={`Edit transaction ${t.description ?? t.id}`}`.
- [ ] **Step 7: Verify and commit** — full frontend suite plus `npx playwright test`. Subject: `feat(frontend): edit transactions and see the merchant field`.

### Task 15: Rename, re-parent and delete categories

**Closes:** J2, C3 (significant).

**Files:** `frontend/src/screens/Categories.tsx`, `api/hooks.ts`; `Categories.test.tsx`.

`PATCH /api/categories/{id}` and `DELETE /api/categories/{id}` both exist, and the backend has
fully built category-in-use rejection with counts. The screen's own help card **describes the
delete rules** — for an action the UI never offers.

- [ ] **Step 1: Write the failing tests** — rename, re-parent and delete controls exist and call their mutations; the in-use rejection surfaces as a visible message.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Add `useDeleteCategory()`** (`useUpdateCategory` already exists — reuse it for rename and re-parent).
- [ ] **Step 4: Add the controls** — rename in place on the row; a parent selector honouring the documented max depth of 5; delete via Task 10's confirmation.
- [ ] **Step 5: Let the server own the rules.** The backend already returns a 409 with counts when a category is in use. **Surface that message; do not pre-check client-side** — a client-side guess can disagree with the server, and the server is right.
- [ ] **Step 6: Verify and commit** — full frontend suite + axe. Subject: `feat(frontend): rename, re-parent and delete categories`.

### Task 16: Make the analytics boundary honest and reliable

**Closes:** C5, C6, C7 (significant).

**Files:** `backend/src/main/resources/application.properties` (~line 58), `backend/.../service/AnalyticsClient.java`, `analytics/src/analytics/llm/interpret.py` (~line 195), `analytics/src/analytics/llm/client.py` (~lines 118–126), `docs/API.md`; tests both sides.

Three defects on one boundary:
- **C5** — the backend's read timeout is **10s** while analytics allows the model **60s plus a retry**. Every generation between those figures becomes a spurious 503 telling the user analytics isn't running, while it is in fact still working.
- **C6** — raw internals reach the browser. Live: `problems: ["the language model is not reachable (chat call failed: [Errno -3] Temporary failure in name resolution)"]`. `docs/API.md:143` promises these strings are "safe to show a user".
- **C7** — a malformed `currentPlan` returns 422 "Could not interpret that" where 400 is correct.

- [ ] **Step 1: Write the failing tests.** Backend: a stub that responds slower than the current read timeout but inside the model budget must **not** produce a 503. Analytics: `interpret` failing with an exception carrying `[Errno -3] ...` must yield a `problems` string containing **none** of the exception text — assert the errno string is absent, not merely that some message exists. Malformed `currentPlan` → 400.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Align the timeouts.** Make the backend's read timeout exceed the analytics-side budget (60s + retry) with headroom, or reduce the analytics budget to fit — **decide, state which and why in the commit message, and make the two numbers reference each other in comments** so the next person cannot change one alone.
- [ ] **Step 4: Sanitise the error channel.** User-facing `problems` strings become fixed, human-readable text. Log the detail server-side at WARN with the exception attached. Remove the `f"...({exc})"` interpolation at `interpret.py:195` and the `{data!r}` embedding at `client.py:118-126`.
- [ ] **Step 5: Fix the status code** for malformed `currentPlan`.
- [ ] **Step 6: Verify** — `./mvnw -B verify`; `cd analytics && uv run --locked ruff check . && uv run --locked pytest -q`. Subject: `fix: stop leaking internals and mis-reporting analytics as down`.

### Task 17: Honest empty and error states

**Closes:** J15 (significant), J10 (minor).

**Files:** `frontend/src/insights/renderers/*.tsx`, `frontend/src/screens/Insights.tsx`; tests.

An insight run matching zero transactions renders a **blank axes-only chart** that reads as a
rendering failure — and the designed "empty answer" message can never fire for the default
plan. J10: deep-linking to a deleted insight fails silently and quietly shows a default plan,
so the user believes they are looking at their saved insight.

- [ ] **Step 1: Write the failing tests** — a zero-row envelope renders an explanatory empty state, not empty axes; a 404 on a saved insight renders a visible "this insight no longer exists" message rather than a silent default.
- [ ] **Step 2: Run and watch them fail.**
- [ ] **Step 3: Find why the designed empty state is unreachable** — read the renderers and the condition that gates it. Fix the condition rather than adding a second parallel empty state.
- [ ] **Step 4: Handle the deleted-insight deep link** explicitly.
- [ ] **Step 5: Verify and commit** — full frontend suite + `npx playwright test`. Subject: `fix(frontend): say when there is nothing to show`.

### Task 18: A responsive layout

**Closes:** G2 (from the original design audit; the hunters ran at 1280 and did not re-cover it).

**Files:** `frontend/src/app.css`, `frontend/src/components/Nav.tsx`, some screens; new `frontend/e2e/responsive.spec.ts`.

**`frontend/src/styles.css` must not be touched** — it is the design system, app CSS lives in
`app.css`, which loads after it and overrides it.

Measured: `grep -rn "@media" frontend/src/` returns **nothing**. The nav row (6 links + profile
select + two buttons, `gap: var(--space-4)`, no wrap) pins every page to ~1094px, so all six
screens scroll sideways at 820px and 390px.

- [ ] **Step 1: Write the failing test** — `responsive.spec.ts` registers an account, then for each of the six screens at 390px and 820px asserts `document.documentElement.scrollWidth <= window.innerWidth + 1`, collecting **all** offenders into one array so a failure names every screen at once. Copy the working registration helper from `frontend/e2e/a11y.spec.ts` (Task 7 already corrected it against the real markup — the "Create account" toggle is an `<a>` with role `link`, and a new profile must be clicked explicitly because creating it does not activate it).
- [ ] **Step 2: Run and watch it fail** — expect content ~1094–1151px in a 390px viewport, on all six.
- [ ] **Step 3: Make the nav wrap**, in `app.css` only:
```css
/* styles.css is the design system and is not edited; app.css loads after it. The nav is
   the whole problem: six links, a profile select and two buttons in one non-wrapping row
   pinned every page to ~1094px. */
.nav { flex-wrap: wrap; row-gap: var(--space-2); }

@media (max-width: 900px) {
  .nav { gap: var(--space-3); }
  .nav-brand { margin-right: 0; flex: 1 0 100%; }
}

@media (max-width: 620px) {
  .nav { justify-content: center; }
  .nav a { font-size: 13px; }
}
```
- [ ] **Step 4: Re-run and contain what remains** — wide tables and the Insights chip bar are the likely holdouts. Wide content scrolls **inside its own container**, never the page: add a `.table-scroll { overflow-x: auto; }` wrapper around the tables in `Transactions.tsx` and `Subscriptions.tsx`, and collapse the two-column card grids at `max-width: 900px`. Loop — run, read the offenders, contain them — until green. **Never** reach for `overflow-x: hidden` on the page; that hides content rather than fitting it.
- [ ] **Step 5: Verify** — `npx playwright test responsive.spec.ts a11y.spec.ts smoke.spec.ts && npm test && npm run lint && npm run build`. Confirm `git status --short frontend/src/styles.css` prints nothing.
- [ ] **Step 6: Commit** — `fix(frontend): make the app usable below 1100px`.

### Task 19: Search every transaction, not the loaded page

**Closes:** G9, and the root cause behind J6.

**Files:** `backend/.../repository/TransactionSpecifications.java`, `service/TransactionFilter.java`, `service/TransactionService.java`, `controller/TransactionController.java`, `docs/API.md`, `frontend/src/screens/Transactions.tsx`, `api/hooks.ts`; tests both sides.

- [ ] **Step 1: Write the failing backend test** — seed 60 transactions where the only match for `"Kaufland"` sits past the first page of 50; `GET /api/transactions?q=Kaufland` must return exactly that row.
- [ ] **Step 2: Run and watch it fail** (the parameter is ignored, so page 1 comes back).
- [ ] **Step 3: Add `q` to `TransactionFilter`.** **This changes the record's constructor arity, so every call site must be updated in the same commit** — including the three aggregate endpoints Task 9 added. Run `./mvnw -B compile` immediately after, before writing anything else.
- [ ] **Step 4: Implement the predicate** — match `description` **or** `merchant`, case-insensitively, via `LOWER(col) LIKE LOWER(CONCAT('%', :q, '%'))`. **Escape `%` and `_` in the input** so a user typing `%` does not match everything. Cap `q` at 100 characters.
- [ ] **Step 5: Thread `q` through the aggregates too** — `summary`, `category-counts` and `category-totals` must accept it, or the tiles will describe a different set than the list.
- [ ] **Step 6: Move the frontend search server-side.** Delete the client-side `content.filter(...)`; pass `q` into the query. **Debounce 300ms**, and **reset to `page: 0` whenever `q` changes** — searching from page 3 otherwise lands on an empty page 3 of a smaller result set. The caption may now state a true whole-dataset count.
- [ ] **Step 7: Verify and commit** — `./mvnw -B verify`; full frontend suite; `npx playwright test`. Subject: `feat: search transactions across every page`.

### Task 20: Un-cancel a subscription, and show its notes

**Closes:** J4, J12 (significant/minor).

**Files:** `frontend/src/screens/Subscriptions.tsx`, `api/hooks.ts`; tests.

A cancelled subscription is a dead end: the API supports restoring it, but the UI's only offer
is permanent deletion. And `notes` is accepted by the API, stored, and never shown or edited.

- [ ] **Step 1: Read the API first.** Confirm from `SubscriptionController`/`SubscriptionService` and `docs/API.md` exactly how status transitions work (`PUT /api/subscriptions/{id}` with a status field, per `UpdateSubscriptionRequest`). Build on what exists; do not add an endpoint.
- [ ] **Step 2: Write the failing tests** — a cancelled row offers a restore action that calls update with the active status; notes render on the row and are editable in the form.
- [ ] **Step 3: Run and watch them fail.**
- [ ] **Step 4: Implement**, reusing the existing update mutation.
- [ ] **Step 5: Verify and commit** — frontend suite + axe. Subject: `feat(frontend): restore a cancelled subscription and edit its notes`.

### Task 21: Profiles and navigation

**Closes:** J14 (minor), J13 (minor), and G7 from the original audit.

**Files:** `backend/.../controller/ProfileController.java`, `service/ProfileService.java`, new `dto/UpdateProfileRequest.java`, `docs/API.md`, `frontend/src/screens/ProfilePicker.tsx`, `frontend/src/App.tsx`, `frontend/src/screens/Transactions.tsx`; tests.

- [ ] **Step 1: Add `PUT /api/profiles/{id}` (rename) and `GET /api/profiles/{id}`.** Write failing tests first: rename returns 200; a duplicate name is 409 (`ProfileNameTakenException` exists); another user's profile is 404. `GET` by id also closes the other half of C8's dangling `Location` header.
- [ ] **Step 2: Decide delete against the schema, do not invent it.** A profile owns categories, transactions, budgets, subscriptions and insights. **Read `docs/SCHEMA.md` for the existing cascade behaviour.** If it already cascades from `profile`, implement `DELETE` as a plain repository delete. **If it does not, implement rename only, skip delete, and record in your report that delete needs a schema migration** — do not add a migration in this task. That is the correct outcome, not a failure.
- [ ] **Step 3: If delete ships, guard the last profile** — deleting the profile you are currently using, or your only one, must not strand the session. Reject deleting the last remaining profile with a 409 and a clear message.
- [ ] **Step 4: Fix the one-way picker (J14)** — the picker must be reachable and leaveable without a dead end.
- [ ] **Step 5: Preserve deep-link destinations (G7).** Visiting `/budgets` with no active profile redirects to `/picker` and then lands on `/`, discarding the destination. Pass the attempted path in router state and navigate to it after picking. **Accept only a value starting with a single `/` and not `//`**, so it can never become an off-site redirect.
- [ ] **Step 6: Fix out-of-range pagination (J13)** — "page 100 of 5" with an empty state blaming the profile. Clamp the page to the available range and make the empty state say which case it is.
- [ ] **Step 7: Verify and commit** — `./mvnw -B verify`; frontend suite; `npx playwright test`. Subject: `feat: rename profiles, and stop losing where the user was going`.

### Task 22: One consistent REST surface

**Closes:** C8 (remainder), C9, C11, and G8 from the original audit.

**Files:** `backend/.../controller/CategoryController.java`, `GlobalExceptionHandler.java`, money DTOs, `docs/API.md`, `frontend/src/api/hooks.ts`; tests.

- [ ] **Step 1: `PATCH` vs `PUT` on categories (G8).** First **check whether the update is genuinely partial** — read `UpdateCategoryRequest` and `CategoryService.update`. If nullable fields really mean "leave alone", `PATCH` is correct and this is a **documentation** fix: say so in `docs/API.md` and stop. If it is a full replacement, add `@PutMapping("/{id}")` delegating to the same service method and keep `@PatchMapping` as a deprecated alias. Record which you found.
- [ ] **Step 2: Money fields accept JSON numbers (C11)** — the contract says decimal string. Write a failing test posting `"amount": 12.34` as a **number**, then decide and implement: either reject non-strings with 400, or accept and document it. **Whichever you choose, `docs/API.md` and the code must agree when you are done.** Rejecting is the safer choice for a money field; say why in the commit.
- [ ] **Step 3: Unknown-path 404s (C9)** use the framework's shape with no `type` slug and "static resource" wording. Bring them into the documented problem+json shape.
- [ ] **Step 4: Verify** every `Location` header now points at a URL that resolves (`GET` by id exists) — Tasks 12 and 21 added the missing ones; confirm none remain.
- [ ] **Step 5: Verify and commit** — `./mvnw -B verify`; frontend suite; `npx playwright test smoke.spec.ts`. Subject: `refactor(api): one consistent shape across resources`.

### Task 23: The minor batch

**Closes:** J8, J11, D6, D7, C12 — five small, independent items. **One dispatch, one review.**

- [ ] **J8 — dialog behaviour** (`frontend/src/components/TxnModal.tsx`): Enter does not submit, focus escapes the dialog, and closing returns focus to `<body>`. Add submit-on-Enter, a focus trap, and focus restoration to the control that opened it. Keep the axe gate green.
- [ ] **J11 — foreign-currency records cannot be created** though the whole app displays and warns about them. Let the create forms choose a currency, defaulting to the profile's.
- [ ] **D6 — `groupBy: "merchant"` merges a real merchant literally named "Unspecified" with merchant-less transactions** (`analytics/src/analytics/sql.py`, `MERCHANT_GROUP_EXPR`). Distinguish them — group on a null-ness flag rather than a display string that a real value can collide with. Update `docs/INSIGHTS.md` in the same change.
- [ ] **D7 — the forecast baseline includes the partial current month**, dragging projections down. **The code matches `docs/INSIGHTS.md`, so the defect is in the design**: exclude the incomplete current month from the baseline and update the doc to match, in the same commit.
- [ ] **C12 — both halves of the analytics boundary default to the same well-known token.** Mitigated (port 8000 is unpublished; `compare_digest` is enforced), so this is defence-in-depth: make the deployment path require an explicit `ANALYTICS_TOKEN` rather than silently falling back to the public default, and document it. Keep the dev default working for local runs.
- [ ] **Verify** — `./mvnw -B verify`; `cd analytics && uv run --locked ruff check . && uv run --locked pytest -q`; frontend suite; `npx playwright test`. Commit each item separately with its own subject so they can be reverted independently.
# Phase M2 — Structure

**Harness gate (user decision):** a file may be refactored **only if it has test coverage written earlier in this run**. Before starting each task, verify the coverage exists. If it does not, **do not refactor that file** — record it in the ledger as deferred and move to the next task. Splitting untested code overnight is how a green suite starts lying.

Every task in this phase is a pure refactor: **no behaviour changes, no new features, no renamed public API**. The test suites must pass before and after with no test edits other than import paths.

### Task 24: Split `api/hooks.ts` by domain

**Files:**
- Create: `frontend/src/api/hooks/auth.ts`, `profiles.ts`, `categories.ts`, `transactions.ts`, `budgets.ts`, `subscriptions.ts`, `insights.ts`, `index.ts`
- Delete: `frontend/src/api/hooks.ts`
- Modify: every file importing from `../api/hooks`

**Harness gate:** requires the component tests written in Tasks 1, 9, 13, 14, 15, 17, 19 and 20. Confirm with `ls frontend/src/screens/*.test.tsx` before starting.

One 510-line module holds 35 hooks spanning every domain in the app. The file is already organised by `// — Subscriptions —` style comments; those comments are the split lines.

- [ ] **Step 1: Record the baseline** — `cd frontend && npm test 2>&1 | tail -3`. Write the exact pass count in the task report; it must be identical at the end.
- [ ] **Step 2: Create `frontend/src/api/hooks/index.ts`** re-exporting everything: `export * from './auth'; export * from './profiles';` and so on. **Every existing `import { … } from '../api/hooks'` keeps working unchanged** — that is what makes this safe.
- [ ] **Step 3: Move the hooks**, one domain per commit, following the existing section comments. Shared internals (`api`, `queryString`, `useActiveProfileId`) stay importable — put `useActiveProfileId` and `useSession` in `auth.ts` and import them where needed.
- [ ] **Step 4: After each domain moves, run** `npm test && npm run lint && npm run build`. Expected: the same pass count as Step 1, every time.
- [ ] **Step 5: Delete the old `hooks.ts`** once it is empty, and confirm nothing imports it: `grep -rn "api/hooks'" frontend/src | grep -v "api/hooks/"` should show imports resolving to the directory's `index.ts`.
- [ ] **Step 6: Final verification** — `npm test && npm run lint && npm run build && npx playwright test`. The pass count must equal Step 1's.
- [ ] **Step 7: Commit** — `refactor(frontend): split api/hooks.ts into one module per domain`, noting in the body that `index.ts` re-exports everything so no call site changed.

### Task 25: Split `screens/Insights.tsx`

**Files:** `frontend/src/screens/Insights.tsx` (528 lines) → the screen plus extracted pieces under `frontend/src/insights/`.

**Harness gate:** Insights has **no component test** as of M0. Before refactoring, **write one** — render the screen with mocked hooks and assert the chip bar and the Run button appear, plus one test pinning the behaviour fixed just before this run: *the caption and series colours follow the executed plan (`lastEnvelope.plan`), not the live chip state*. That regression is subtle, was shipped once, and a blind refactor can reintroduce it.

- [ ] **Step 1: Write those two tests and get them passing against the current code.** Record the count.
- [ ] **Step 2: Extract** the plan-state reducer, the save/pin controls, and the results panel into their own modules under `frontend/src/insights/`. Keep `Insights.tsx` as the composition root.
- [ ] **Step 3: Preserve the two behaviours the tests pin** — `ResultRenderer` and `Caption` read `lastEnvelope.plan`; `FollowUp` deliberately reads the **live** `plan`. Do not "tidy" that asymmetry: it is correct and was a bug fix.
- [ ] **Step 4: Verify** — `npm test && npm run lint && npm run build && npx playwright test smoke.spec.ts insights-ai.spec.ts insights-merchant.spec.ts insights-ai-search.spec.ts`. Same counts as Step 1.
- [ ] **Step 5: Commit** — `refactor(frontend): break Insights.tsx into focused modules`.

### Task 26: Split `screens/Subscriptions.tsx`

**Files:** `frontend/src/screens/Subscriptions.tsx` (488 lines).

**Harness gate:** write a component test first (the dashboard summary and the row actions render), get it green, record the count, then extract the form and the row into their own modules. Verify with `npm test && npm run lint && npm run build && npx playwright test`. Commit as `refactor(frontend): break Subscriptions.tsx into focused modules`.

### Task 27: Split `analytics/llm/narrate.py`

**Files:**
- Modify: `analytics/src/analytics/llm/narrate.py` (516 lines)
- Create: `analytics/src/analytics/llm/grounding.py`

**Harness gate:** already satisfied — `test_llm_narrate.py`, `test_llm_narrate_facts.py`, `test_llm_narrate_grounding.py` and `test_llm_golden.py` cover this module heavily.

The grounding check (`ungrounded_numbers`, `number_tokens`, `_grounds`, and the magnitude/separator regexes) is a self-contained unit with its own vocabulary; narration assembly (`narration_facts`, `fallback_caption`, `narrate`) is a different job.

- [ ] **Step 1: Record the baseline** — `cd analytics && uv run --locked pytest -q 2>&1 | tail -3`. Exact count into the report.
- [ ] **Step 2: Move the grounding functions and their regexes** to `grounding.py`, unchanged. Re-export from `narrate.py` so existing imports keep working: `from analytics.llm.grounding import ungrounded_numbers, number_tokens  # noqa: F401`.
- [ ] **Step 3: Do not touch the regexes.** `_MAGNITUDE_WORD` / `_MAGNITUDE_MARKER` / `_MAGNITUDE_NUMBER` are split the way they are so `mil` and `k` cannot combine to match "milk". They took four fix rounds and a 48,384-caption differential to get right. Move them verbatim.
- [ ] **Step 4: Verify** — `cd analytics && uv run ruff format --check . && uv run --locked ruff check . && uv run --locked pytest -q`. The pass count must equal Step 1's.
- [ ] **Step 5: Commit** — `refactor(analytics): separate the grounding check from narration assembly`.

### Task 28: Enforce the layering with ArchUnit

**Files:**
- Modify: `backend/pom.xml`
- Create: `backend/src/test/java/com/myfinance/backend/ArchitectureTest.java`

ArchUnit enforces **structure**, not semantics. It cannot verify "every query is profile-scoped" — that stays a review concern. Do not claim otherwise in the commit message.

- [ ] **Step 1: Add the dependency**

```xml
        <dependency>
            <groupId>com.tngtech.archunit</groupId>
            <artifactId>archunit-junit5</artifactId>
            <version>1.5.0</version>
            <scope>test</scope>
        </dependency>
```

- [ ] **Step 2: Write the rules**

```java
package com.myfinance.backend;

import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.library.Architectures.layeredArchitecture;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

@AnalyzeClasses(packages = "com.myfinance.backend")
class ArchitectureTest {

    @ArchTest
    static final ArchRule layers = layeredArchitecture().consideringOnlyDependenciesInLayers()
            .layer("Controller").definedBy("..controller..")
            .layer("Service").definedBy("..service..")
            .layer("Repository").definedBy("..repository..")
            .whereLayer("Controller").mayNotBeAccessedByAnyLayer()
            .whereLayer("Service").mayOnlyBeAccessedByLayers("Controller", "Service")
            .whereLayer("Repository").mayOnlyBeAccessedByLayers("Service", "Repository");

    @ArchTest
    static final ArchRule controllersDoNotTouchRepositories = noClasses()
            .that().resideInAPackage("..controller..")
            .should().dependOnClassesThat().resideInAPackage("..repository..")
            .because("controllers go through services, which own the profile scoping");

    // Entities specifically, NOT the whole model package: controllers legitimately
    // take model enums as request parameters (TransactionType, SubscriptionStatus),
    // which is idiomatic Spring rather than a layering violation.
    @ArchTest
    static final ArchRule entitiesStayOutOfControllers = noClasses()
            .that().resideInAPackage("..controller..")
            .should().dependOnClassesThat().areAnnotatedWith(jakarta.persistence.Entity.class)
            .because("controllers speak DTOs; leaking entities leaks the schema onto the wire");
}
```

- [ ] **Step 3: Run them** — `cd backend && ./mvnw -B test -Dtest=ArchitectureTest`.
- [ ] **Step 4: Handle real violations honestly.** If a rule fails, **fix the code** if the fix is small and behaviour-preserving. If a violation is deliberate and defensible, do not delete the rule — narrow it with `.ignoreDependency(...)` and a `because(...)` explaining why, and record it in the report.
- [ ] **Step 5: Verify** — `cd backend && ./mvnw -B verify`; BUILD SUCCESS, count not decreased.
- [ ] **Step 6: Commit** — `test(backend): enforce the layering with ArchUnit`, stating plainly that this covers structure and not profile-scoping semantics.

---

# Phase M3 — Libraries and developer experience

### Task 29: OpenAPI via springdoc

**Files:**
- Modify: `backend/pom.xml`, `backend/src/main/resources/application.yml` (or `.properties` — check which exists), `backend/.../config/SecurityConfig.java`, `README.md`
- Create: `backend/src/main/java/com/myfinance/backend/config/OpenApiConfig.java`

springdoc **3.1.1** is the Spring Boot 4 line (springdoc 3.x ↔ Boot 4.x per their compatibility matrix); this repo is on Boot 4.1.0.

- [ ] **Step 1: Add the dependency**

```xml
        <dependency>
            <groupId>org.springdoc</groupId>
            <artifactId>springdoc-openapi-starter-webmvc-ui</artifactId>
            <version>3.1.1</version>
        </dependency>
```

- [ ] **Step 2: Add `OpenApiConfig`** with an `@Bean OpenAPI` giving the API a title, version and short description.
- [ ] **Step 3: Permit the doc endpoints in `SecurityConfig`** — `/v3/api-docs/**` and `/swagger-ui/**`. **Keep every `/api/**` rule exactly as it is.** Read the existing chain and add to it; do not restructure it.
- [ ] **Step 4: Verify the schema is served**

```bash
docker compose up -d --build backend
sleep 20
curl -s http://localhost:8080/v3/api-docs | python3 -m json.tool | head -30
```
(Uses the e2e overlay from Task 8 for port 8080.) Expected: a valid OpenAPI 3.1 document listing the `/api/...` paths.

- [ ] **Step 5: Check the whole suite still passes** — `cd backend && ./mvnw -B verify`, and `npx playwright test smoke.spec.ts` to prove the security change broke nothing.
- [ ] **Step 6: Document it in `README.md`** — Swagger UI at `/swagger-ui.html` when the backend is running.
- [ ] **Step 7: Commit** — `feat(backend): serve an OpenAPI schema and Swagger UI`.

### Task 30: Generate the frontend's API types from the schema

**Files:**
- Create: `frontend/scripts/generate-types.mjs`, `frontend/src/api/schema.d.ts`
- Modify: `frontend/package.json`, `frontend/src/api/types.ts`, `docs/API.md`

**Interfaces:**
- Consumes: `/v3/api-docs` from Task 29.

**The trap in this task:** springdoc types `BigDecimal` as `number`. This API's contract is scale-4 **decimal strings** (`"243.5000"`), and money as a JS `number` is exactly the bug this codebase has been careful to avoid everywhere else. Generated types that say `amount: number` are worse than hand-written ones.

- [ ] **Step 1: Install** — `cd frontend && npm install -D openapi-typescript@7.13.0`.
- [ ] **Step 2: Make the schema tell the truth about money.** In the backend, annotate the money-carrying fields so springdoc emits `type: string`. Add to each `BigDecimal` DTO component:

```java
    @Schema(type = "string", format = "decimal", example = "243.5000")
```

from `io.swagger.v3.oas.annotations.media.Schema`. Apply to every `BigDecimal` field on the response DTOs (`TransactionResponse`, `BudgetResponse`, `BudgetStatusResponse`, `SubscriptionResponse`, `TransactionSummary`, `CurrencyAmount`, and any other the grep finds: `grep -rln "BigDecimal" backend/src/main/java/com/myfinance/backend/dto/`).

- [ ] **Step 3: Verify the schema changed** — restart the backend and confirm `curl -s http://localhost:8080/v3/api-docs | grep -c '"format":"decimal"'` is greater than zero.
- [ ] **Step 4: Generate**

```bash
cd frontend
npx openapi-typescript http://localhost:8080/v3/api-docs -o src/api/schema.d.ts
```

- [ ] **Step 5: Prove the generated types match reality.** This is the verification that matters — compare a generated type against a live response body:

```bash
curl -s -c /tmp/j -b /tmp/j http://localhost:8080/api/auth/me > /dev/null
grep -n "amount" frontend/src/api/schema.d.ts | head
```
Every money field must read `string`, never `number`. If any reads `number`, go back to Step 2 — that DTO was missed.

- [ ] **Step 6: Adopt the generated types gradually.** Re-express the types in `frontend/src/api/types.ts` as aliases of the generated components, e.g. `export type BudgetResponse = components['schemas']['BudgetResponse'];`. Fix whatever `tsc` then reports. If a generated type is genuinely wrong, fix the **backend annotation**, not the alias.
- [ ] **Step 7: Add the script** to `package.json`: `"generate:types": "openapi-typescript http://localhost:8080/v3/api-docs -o src/api/schema.d.ts"`, and document in `README.md` that it needs the stack running.
- [ ] **Step 8: Verify** — `cd frontend && npm run lint && npm test && npm run build && npx playwright test`.
- [ ] **Step 9: Commit** — `feat(frontend): generate API types from the backend's OpenAPI schema`, with a body explaining the money-as-string annotation and why it is load-bearing.

### Task 31: `pydantic-settings` for the analytics config

**Files:**
- Modify: `analytics/pyproject.toml`, `analytics/src/analytics/config.py`
- Test: `analytics/tests/test_config.py`, `analytics/tests/test_db.py`

**The constraint that will break this task if ignored:** `config.py`'s own comment warns that `tests/test_db.py` constructs `Settings(database_url=..., analytics_token=..., tz=...)` with exactly those three positional-or-keyword fields. **The constructor shape must survive.** Run `grep -n "Settings(" analytics/tests/*.py` first and satisfy every call site.

- [ ] **Step 1: Record the baseline** — `cd analytics && uv run --locked pytest -q 2>&1 | tail -3`.
- [ ] **Step 2: Add the dependency** — `cd analytics && uv add 'pydantic-settings>=2.15'`.
- [ ] **Step 3: Rewrite `Settings` as a `BaseSettings`** with the same five fields, the same defaults, and the same env var names (`DATABASE_URL`, `ANALYTICS_TOKEN`, `TZ`, `OLLAMA_URL`, `OLLAMA_MODEL`). Keep `ollama_url` normalising empty string to `None`. Keep `@lru_cache` on `get_settings` and keep `today(settings)` exactly as it is.
- [ ] **Step 4: Run the tests** — `uv run --locked pytest -q`. Same count as Step 1, no test edits beyond what the constructor genuinely requires.
- [ ] **Step 5: Prove the real service still starts** — `docker compose up -d --build analytics && sleep 10 && curl -s http://localhost:3000/api/insights/capabilities`. Expected: a response, not a 503.
- [ ] **Step 6: Verify** — `uv run ruff format --check . && uv run --locked ruff check . && uv run --locked pytest -q`.
- [ ] **Step 7: Commit** — `refactor(analytics): read settings through pydantic-settings`.

### Task 32: Type-check analytics with mypy

**Files:** `analytics/pyproject.toml`, `.github/workflows/ci.yml`, plus type fixes.

- [ ] **Step 1: Add it** — `cd analytics && uv add --dev 'mypy>=2.3'`.
- [ ] **Step 2: Configure it** in `pyproject.toml` — start lenient so the task can finish:

```toml
[tool.mypy]
python_version = "3.12"
files = ["src/analytics"]
ignore_missing_imports = true
warn_unused_ignores = true
warn_redundant_casts = true
```

- [ ] **Step 3: Run it** — `cd analytics && uv run mypy`. Record the error count.
- [ ] **Step 4: Fix what it finds**, or, where a fix would change behaviour, add a narrow `# type: ignore[code]` with a one-line reason. **Do not** loosen the config to make errors disappear.
- [ ] **Step 5: Add it to CI** — extend the analytics job's run line to `uv run --locked ruff check . && uv run mypy && uv run --locked pytest -q`. Note in the report that CI was not observed.
- [ ] **Step 6: Verify** — `uv run mypy && uv run --locked pytest -q`.
- [ ] **Step 7: Commit** — `chore(analytics): type-check with mypy`.

### Task 33: Correct the false rationale in `plan.py`

**Files:** `analytics/src/analytics/plan.py`

The module docstring says frozen dataclasses were chosen over Pydantic because *"Pydantic's fail-fast exceptions would collapse that list into whichever error it hit first."* **That is false** — Pydantic v2's `ValidationError.errors()` returns every error. The decision to keep dataclasses is still right, for two real reasons; the docstring should give those instead.

- [ ] **Step 1: Replace the docstring's second paragraph** with:

```python
"""The plan DSL v1 object model (docs/INSIGHTS.md "Plan DSL v1").

Frozen dataclasses rather than Pydantic models, for two reasons that are about
this API rather than about Pydantic. First, `docs/API.md` pins the exact
problem strings the executor returns ("groupBy: unknown field"), and mapping
Pydantic's error objects onto that contract is more code than the hand-written
check it would replace. Second, `validation.validate_plan` needs a live
database connection to confirm a categoryId belongs to the profile, which is
not something a field validator should be doing.

(An earlier version of this note claimed Pydantic fails fast and would collapse
the problem list. That is wrong -- ValidationError.errors() returns them all --
and it is recorded here so the argument is not re-made from a false premise.)
"""
```

- [ ] **Step 2: Verify nothing else changed** — `cd analytics && uv run --locked pytest -q && uv run --locked ruff check .`.
- [ ] **Step 3: Commit** — `docs(analytics): correct why plan.py uses dataclasses over Pydantic`.

### Task 34: Dependabot

**Files:** Create `.github/dependabot.yml`.

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /frontend
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
    groups:
      dev-dependencies:
        dependency-type: development
  - package-ecosystem: maven
    directory: /backend
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
  - package-ecosystem: uv
    directory: /analytics
    schedule: { interval: weekly }
    open-pull-requests-limit: 5
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly }
  - package-ecosystem: docker
    directory: /frontend
    schedule: { interval: weekly }
```

- [ ] **Step 1: Create the file.**
- [ ] **Step 2: Validate the YAML** — `python3 -c "import yaml,sys; yaml.safe_load(open('.github/dependabot.yml')); print('valid')"`.
- [ ] **Step 3: Commit** — `chore: track dependency updates with Dependabot`. Note in the body that this only takes effect once the branch reaches the remote, which this run never does.

### Task 35: Persist sessions in Redis

**Closes:** G11 — a live defect found while assessing this library, not a portfolio addition.

**Files:** `backend/pom.xml`, `backend/src/main/resources/application.properties`, `docker-compose.yml`, `deploy/release/` (check what exists), `ARCHITECTURE.md`; a new integration test.

`SecurityConfig.java:97` returns `HttpSessionSecurityContextRepository` and the pom has **no
Spring Session dependency**, so sessions live in the servlet container's memory. **Every backend
restart logs out every user** — and updating a self-hosted deployment means
`docker compose up -d --build`, so every update does exactly that. It also makes running a
second backend instance impossible.

Versions: `spring-boot-starter-data-redis` and `spring-session-data-redis` take **no explicit
version** — Spring Boot 4.1's BOM manages them and pinning fights it. Image: `redis:8.10-alpine`.

- [ ] **Step 1: Write the failing test first.** Using Testcontainers with a Redis container: authenticate, capture the session, then build a **fresh application context** against the same Redis and assert the session still authenticates. **A test that only checks Redis is reachable does not prove the defect is fixed** — the assertion must be about session survival.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Add the dependencies** (no versions) and set `spring.session.store-type=redis`, with host/port from env carrying dev defaults — follow how `DB_URL`/`DB_USERNAME` already do it.
- [ ] **Step 4: Add the compose service** — `redis:8.10-alpine` with a healthcheck and a named volume; `backend` depends on it being healthy. Mirror the existing `postgres` declaration.
- [ ] **Step 5: Prove it by hand** — log in through the UI, `docker compose restart backend`, reload. You must still be logged in. Put the before/after in the report.
- [ ] **Step 6: Update `ARCHITECTURE.md`** to say where sessions live and why.
- [ ] **Step 7: Verify and commit** — `./mvnw -B verify`; `npx playwright test smoke.spec.ts`. Subject: `fix: keep users logged in across a backend restart`.

### Task 36: Metrics with Micrometer, Prometheus and Grafana

**Files:** `backend/pom.xml`, `application.properties`, `docker-compose.yml`, `deploy/observability/prometheus.yml`, `deploy/observability/grafana/`, `README.md`.

`spring-boot-starter-actuator` is already a dependency; this completes it.
`micrometer-registry-prometheus` takes **no explicit version** (BOM-managed — note its
Maven "latest", 1.18.0-M1, is a milestone; do not pin it). Images: `prom/prometheus:v3.14.0`,
`grafana/grafana:13.2.1`.

- [ ] **Step 1: Add the registry dependency** and set `management.endpoints.web.exposure.include=health,info,prometheus`. **Expose only those three** — not `*`.
- [ ] **Step 2: Do not make the scrape endpoint world-readable.** Bind management to a separate port that compose does not publish to the host. Read `SecurityConfig` and **keep every existing `/api/**` rule exactly as it is** — add to the chain, do not restructure it. State the decision in the commit message.
- [ ] **Step 3: Add both services behind a compose profile named `observability`**, so the default stack is unchanged. Mirror how the existing `ai` profile gates Ollama.
- [ ] **Step 4: Provision one dashboard as code** — JSON committed in the repo and auto-loaded by Grafana, showing HTTP request rate, error rate, p95 latency and JVM heap. **A dashboard clicked together by hand and not committed does not count** — nobody reading the repo can see it.
- [ ] **Step 5: Verify** — `docker compose --profile observability up -d`; Prometheus lists the backend target as UP; Grafana renders the dashboard. Screenshot into the report. Then confirm the **default** stack is untouched: `docker compose up -d` starts no Prometheus or Grafana.
- [ ] **Step 6: Document in `README.md`**, including that the profile is opt-in. Subject: `feat: expose metrics and ship a provisioned Grafana dashboard`.

### Task 37: MapStruct for one mapping family

**Files:** `backend/pom.xml`, one new mapper interface, the DTOs/service it serves, its tests.

**Scope this narrowly and stop.** The engineering value here is neutral — Java 21 records with
explicit mapping already read well — and the way this goes wrong is half-converting the codebase
so it carries two mapping idioms at once. **One clean, representative example is the goal.**
Version `1.6.3` (note: Maven's "latest" is `1.7.0.Beta2`, a beta — do not use it).

- [ ] **Step 1: Add `mapstruct` 1.6.3** and wire `mapstruct-processor` into `maven-compiler-plugin`'s `annotationProcessorPaths`.
- [ ] **Step 2: Check it coexists with Spotless** (Task 4) — run `./mvnw -B verify` and confirm generated sources are neither reformatted nor flagged. If Spotless tries to format generated code, exclude `target/generated-sources` from it.
- [ ] **Step 3: Convert the Transaction mapping family** (`TransactionResponse.from(...)` and friends) to a `@Mapper(componentModel = "spring")` interface.
- [ ] **Step 4: The existing tests must pass completely unchanged.** This is a pure refactor. **If a test needs editing, the mapping is not equivalent — stop and report rather than adjusting the test.**
- [ ] **Step 5: Assert scale is preserved.** Money is `BigDecimal` normalised through `Money.normalize`; add an explicit assertion that a mapped value still serialises as `"243.5000"`.
- [ ] **Step 6: Leave every other mapping alone**, and say so in the commit message with the reason. Subject: `refactor(backend): map transactions with MapStruct`.

### Task 38: Storybook for the component catalogue

**Files:** `frontend/package.json`, `frontend/.storybook/`, `frontend/src/components/*.stories.tsx`, `README.md`, `.github/workflows/ci.yml`.

Versions `storybook@10.6.0` and `@storybook/react-vite@10.6.0`. **Node 24 required** — source nvm and `nvm use 24` in every shell.

- [ ] **Step 1: Install and initialise**, configuring Storybook to reuse the existing `vite.config.ts` rather than duplicating build config.
- [ ] **Step 2: Import `frontend/src/styles.css` in the Storybook preview** so components render with the real design tokens. **The file itself must not be modified.**
- [ ] **Step 3: Write stories for the reusable primitives only** — `Card`, `ProgressBar`, `CategoryDot`, and the `chips/` family. **Not** whole screens: they need routing and query providers and the stories would be brittle.
- [ ] **Step 4: Cover the states that matter, not just the happy one.** `ProgressBar` needs 0%, 50%, 100% **and over 100%** — the over-budget case uses a different colour and is exactly what a catalogue should document.
- [ ] **Step 5: Add `build-storybook` to CI** so a broken story fails the build.
- [ ] **Step 6: Verify** — `npm run storybook` renders; `npm run build-storybook` produces static output; `npm test`, `npm run lint` and `npm run build` all still pass.
- [ ] **Step 7: Document in `README.md`** that the static build can be published — that is where the portfolio value is. Subject: `feat(frontend): catalogue the component primitives in Storybook`.

### Task 39: lefthook — installed last, on purpose

**Files:** Create `lefthook.yml`; modify `README.md`.

**This is deliberately the last task that changes anything.** A pre-commit hook installed earlier would intercept every subsequent commit in this run and could block on pre-existing issues in files a task touches mid-refactor. It goes in once nothing else needs to commit; only the close-out task follows.

- [ ] **Step 1: Install** — `cd frontend && npm install -D lefthook@2.1.12`.
- [ ] **Step 2: Create `lefthook.yml`** at the repo root. **Formatting auto-fixes and re-stages; linting only reports.** A hook that blocks a commit on a lint error people cannot quickly fix is a hook people disable.

```yaml
pre-commit:
  parallel: true
  jobs:
    - name: prettier
      glob: "frontend/{src,e2e}/**/*.{ts,tsx,css,json}"
      root: "frontend/"
      run: npx prettier --write {staged_files}
      stage_fixed: true
    - name: ruff-format
      glob: "analytics/**/*.py"
      root: "analytics/"
      run: uv run ruff format {staged_files}
      stage_fixed: true
    - name: spotless
      glob: "backend/**/*.java"
      root: "backend/"
      run: ./mvnw -q spotless:apply
      stage_fixed: true
```

- [ ] **Step 3: Install the hooks** — `cd frontend && npx lefthook install`.
- [ ] **Step 4: Prove it works and does not block** — touch a badly formatted line in a scratch file inside `frontend/src`, stage it, commit, and confirm the commit succeeds with the file reformatted. Then revert that scratch change.
- [ ] **Step 5: Document it in `README.md`** — what the hook does, and that `LEFTHOOK=0 git commit` skips it.
- [ ] **Step 6: Commit** — `chore: format staged files on commit with lefthook`.

### Task 40: Close out the run

- [ ] **Step 1: Run every suite one last time**

```bash
cd /home/chris/side-projects/my-finance
cd backend && ./mvnw -B verify && cd ..
cd analytics && uv run ruff format --check . && uv run --locked ruff check . && uv run mypy && uv run --locked pytest -q && cd ..
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d --build
cd frontend && npm run lint && npm run format:check && npm test && npm run build && npx playwright test
```
Every one must pass. Record each count in the ledger.

- [ ] **Step 2: Write the LESSONS entries.** Add short entries to `docs/LESSONS.md` for the genuinely new concepts: Vitest/RTL/MSW versus pytest fixtures, zod + react-hook-form as a validation boundary, ArchUnit as an executable architecture rule, and OpenAPI-driven type generation. **`docs/LESSONS.md` is gitignored — write it, never `git add` it.** Verify: `git status --short docs/LESSONS.md` prints nothing.

- [ ] **Step 3: Tear down what the run started**

```bash
cd /home/chris/side-projects/my-finance && docker compose down
```
**Never `-v`.** It is project-scoped and would destroy the dev database volume.

- [ ] **Step 4: Report.** Summarise: every task's outcome, the JaCoCo baseline (**356 tests, 98.3% instruction coverage**, recorded in Task 6) versus final coverage, the frontend test count (**0 at the start of this run**), which of the 33 hunt findings closed and which remain, anything deferred by the M2 harness gate or by Task 21's schema check, and — explicitly — that **no CI job was ever observed running**, because the branch is never pushed.

- [ ] **Step 5: Stop.** Use `superpowers:finishing-a-development-branch` and **present the menu**. Do not merge. The branch stays unmerged for review; integration is the user's decision.
