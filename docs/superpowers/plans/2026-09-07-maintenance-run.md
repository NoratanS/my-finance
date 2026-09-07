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

This asserts the empty state, which is what the screen renders today with no budgets. It is a real regression test, not a smoke test: Task 11 will change this screen and this test must keep passing.

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
        run: cd frontend && npm ci && npm run lint && npm run format:check && npm test && npm run build
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
npm ci && npm run lint && npm run format:check && npm test && npm run build
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

Closes G1–G9. Every task in this phase changes user-visible behaviour, so every task adds a test that fails before the change.

### Task 9: Budget update and delete (backend) — G1, part 1

**Files:**
- Modify: `backend/src/main/java/com/myfinance/backend/service/BudgetService.java`, `backend/src/main/java/com/myfinance/backend/controller/BudgetController.java`, `docs/API.md`
- Create: `backend/src/main/java/com/myfinance/backend/dto/UpdateBudgetRequest.java`
- Test: `backend/src/test/java/com/myfinance/backend/controller/BudgetControllerTest.java` (modify if it exists, create if not — check first)

**Interfaces:**
- Produces: `PUT /api/budgets/{id}` returning `200 BudgetResponse`; `DELETE /api/budgets/{id}` returning `204 No Content`. Task 10's frontend hooks consume both.

Budgets are the only user-owned resource without update or delete. `SubscriptionService.update`/`delete` (lines 100–120) is the pattern to follow: load scoped to the profile, mutate the managed entity, let the transaction flush.

- [ ] **Step 1: Create `UpdateBudgetRequest`**

Mirrors `CreateBudgetRequest` exactly — same fields, same validation, same class-level period check. It is a separate record because create and update are separate contracts that may diverge.

```java
package com.myfinance.backend.dto;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;
import java.time.LocalDate;

public record UpdateBudgetRequest(
        @NotNull Long categoryId,
        @NotNull @DecimalMin(value = "0", inclusive = false) @Digits(integer = 15, fraction = 4) BigDecimal amountLimit,
        @NotBlank @Pattern(regexp = "^[A-Z]{3}$", message = "must be a 3-letter ISO 4217 code") String currency,
        @NotNull LocalDate periodStart,
        @NotNull LocalDate periodEnd) {

    @JsonIgnore
    @AssertTrue(message = "periodEnd must be on or after periodStart")
    public boolean isPeriodValid() {
        return periodStart == null || periodEnd == null || !periodEnd.isBefore(periodStart);
    }
}
```

- [ ] **Step 2: Write the failing tests**

Add to the budget controller test class. Match the existing test style in that file (harness annotation, MockMvc setup, helper names) — read it first and follow it.

The four behaviours that matter:

```java
    @Test
    void updateChangesTheLimitAndReturnsTheBudget() throws Exception {
        // create a budget, then PUT a new amountLimit, expect 200 and the new value
    }

    @Test
    void updateRejectsAPeriodCollisionWithAnotherBudget() throws Exception {
        // two budgets on the same category, different periods; PUT one onto the
        // other's exact period -> 409, the same shape POST returns
    }

    @Test
    void updateOfAnotherProfilesBudgetIs404() throws Exception {
        // profile scoping is a security boundary: cross-profile is 404, never 403
    }

    @Test
    void deleteRemovesTheBudgetAndIsIdempotentlyGone() throws Exception {
        // DELETE -> 204; the following GET /api/budgets no longer lists it;
        // a second DELETE -> 404
    }
```

Write these out fully against the existing test file's helpers. Each must assert concrete values, not just status codes.

- [ ] **Step 3: Run them and watch them fail**

Run: `cd backend && ./mvnw -B test -Dtest=BudgetControllerTest`
Expected: FAIL — the endpoints do not exist, so the PUT/DELETE calls return 405 or 404.

- [ ] **Step 4: Add `update` and `delete` to `BudgetService`**

```java
    @Transactional
    public BudgetResponse update(Long id, UpdateBudgetRequest request) {
        Long profileId = activeProfile.requireId();
        Budget budget = requireBudget(id, profileId);
        Category category = requireCategory(request.categoryId(), profileId);
        // Moving a budget onto another budget's exact (category, period) is the same
        // collision POST rejects. Landing back on its own current slot is not.
        boolean sameSlot = budget.getCategory().getId().equals(category.getId())
                && budget.getPeriodStart().equals(request.periodStart())
                && budget.getPeriodEnd().equals(request.periodEnd());
        if (!sameSlot && budgetRepository.existsByProfileIdAndCategoryIdAndPeriodStartAndPeriodEnd(
                profileId, category.getId(), request.periodStart(), request.periodEnd())) {
            throw new BudgetExistsException();
        }
        budget.update(category, request.amountLimit(), request.currency(),
                request.periodStart(), request.periodEnd());
        // Managed entity: the change is flushed on commit, no explicit save() needed.
        return BudgetResponse.from(budget);
    }

    @Transactional
    public void delete(Long id) {
        Budget budget = requireBudget(id, activeProfile.requireId());
        budgetRepository.delete(budget);
    }
```

- [ ] **Step 5: Add the `update` method to the `Budget` entity**

Open `backend/src/main/java/com/myfinance/backend/model/Budget.java` and add a method mirroring the constructor's assignments (follow `Subscription.update`'s style):

```java
    public void update(Category category, BigDecimal amountLimit, String currency,
                       LocalDate periodStart, LocalDate periodEnd) {
        this.category = category;
        this.amountLimit = amountLimit;
        this.currency = currency;
        this.periodStart = periodStart;
        this.periodEnd = periodEnd;
    }
```

Check the actual field names in that file and match them.

- [ ] **Step 6: Add the endpoints to `BudgetController`**

```java
    @PutMapping("/{id}")
    public BudgetResponse update(@PathVariable Long id, @Valid @RequestBody UpdateBudgetRequest request) {
        return budgetService.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable Long id) {
        budgetService.delete(id);
    }
```

Add the imports: `org.springframework.http.HttpStatus`, `org.springframework.web.bind.annotation.DeleteMapping`, `PutMapping`, `ResponseStatus`, and `com.myfinance.backend.dto.UpdateBudgetRequest`.

- [ ] **Step 7: Run the tests**

Run: `cd backend && ./mvnw -B verify`
Expected: BUILD SUCCESS, all four new tests passing. Read the count from Maven's `Results:` line.

- [ ] **Step 8: Update `docs/API.md`**

In the `## Budgets` section (around line 750), after the `GET /api/budgets/{id}/status` subsection, add `### PUT /api/budgets/{id}` and `### DELETE /api/budgets/{id}` documenting the request table (identical to `POST`), `200 OK` with `BudgetResponse`, `204 No Content`, the `409` collision, and the `404` for another profile's budget. Match the surrounding formatting exactly.

- [ ] **Step 9: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add backend/src docs/API.md
git commit -m "$(cat <<'EOF'
feat(api): budgets can be updated and deleted

Budgets were the only user-owned resource with no update or delete, at
either layer -- a budget could be created only by curling the API and
then never changed. Cross-profile access is 404, matching the rest of
the API.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

### Task 10: Budget create, edit and delete UI — G1, part 2

**Files:**
- Modify: `frontend/src/api/hooks.ts`, `frontend/src/api/types.ts`, `frontend/src/screens/Budgets.tsx`
- Create: `frontend/src/lib/schemas.ts`, `frontend/src/screens/BudgetForm.tsx`
- Test: `frontend/src/screens/Budgets.test.tsx` (modify), `frontend/src/screens/BudgetForm.test.tsx` (create)

**Interfaces:**
- Consumes: `PUT /api/budgets/{id}`, `DELETE /api/budgets/{id}` from Task 9.
- Produces: `useCreateBudget()`, `useUpdateBudget()`, `useDeleteBudget()` mutation hooks; `budgetSchema` in `lib/schemas.ts`.

This is where `react-hook-form` and `zod` enter. The existing screens hand-roll forms; this establishes the pattern the later form work follows.

- [ ] **Step 1: Install**

```bash
cd /home/chris/side-projects/my-finance/frontend
npm install react-hook-form@7.87.0 zod@4.5.4 @hookform/resolvers@5.9.1
```

- [ ] **Step 2: Create `frontend/src/lib/schemas.ts`**

Money stays a **string** all the way to the wire — the API takes decimal strings at scale 4, and routing it through a JS `number` is how scale gets lost.

```ts
import { z } from 'zod';

/** Money as the API wants it: a decimal string, positive, at most 4 dp. */
const moneyString = z
  .string()
  .trim()
  .min(1, 'Required')
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

- [ ] **Step 3: Add the mutation hooks to `frontend/src/api/hooks.ts`**

Place them directly after `useBudgetStatuses`, following the shape of `useCreateSubscription` / `useUpdateSubscription` / `useDeleteSubscription` in the same file (read those three first and match them — same `useMutation` form, same invalidation style).

```ts
export function useCreateBudget() {
  const profileId = useActiveProfileId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: BudgetFormValues) =>
      api<BudgetResponse>('/api/budgets', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budgets', profileId] }),
  });
}

export function useUpdateBudget() {
  const profileId = useActiveProfileId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: BudgetFormValues & { id: number }) =>
      api<BudgetResponse>(`/api/budgets/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budgets', profileId] });
      queryClient.invalidateQueries({ queryKey: ['budget-status', profileId] });
    },
  });
}

export function useDeleteBudget() {
  const profileId = useActiveProfileId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/api/budgets/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budgets', profileId] }),
  });
}
```

Check `api()`'s real signature in `frontend/src/api/client.ts` and match it — the calls above assume `api(path, init)`.

- [ ] **Step 4: Write the failing test for the form**

`frontend/src/screens/BudgetForm.test.tsx`:

```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import { BudgetForm } from './BudgetForm';

const CATEGORIES = [{ id: 7, name: 'Groceries', parentId: null, color: '#a4d9c6', depth: 1, children: [] }];

test('rejects a zero limit and does not submit', async () => {
  const onSubmit = vi.fn();
  renderWithProviders(
    <BudgetForm categories={CATEGORIES} currency="PLN" onSubmit={onSubmit} onCancel={() => {}} />,
  );
  await userEvent.type(screen.getByLabelText(/limit/i), '0');
  await userEvent.click(screen.getByRole('button', { name: /save|create/i }));
  expect(await screen.findByText(/greater than zero/i)).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});

test('submits a valid budget with the amount as a string', async () => {
  const onSubmit = vi.fn();
  renderWithProviders(
    <BudgetForm categories={CATEGORIES} currency="PLN" onSubmit={onSubmit} onCancel={() => {}} />,
  );
  await userEvent.selectOptions(screen.getByLabelText(/category/i), '7');
  await userEvent.type(screen.getByLabelText(/limit/i), '1500.50');
  await userEvent.type(screen.getByLabelText(/start/i), '2026-09-01');
  await userEvent.type(screen.getByLabelText(/end/i), '2026-09-30');
  await userEvent.click(screen.getByRole('button', { name: /save|create/i }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  expect(onSubmit.mock.calls[0][0]).toMatchObject({
    categoryId: 7,
    amountLimit: '1500.50',
    currency: 'PLN',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
  });
});
```

- [ ] **Step 5: Run it and watch it fail**

Run: `cd frontend && npm test -- BudgetForm`
Expected: FAIL — `./BudgetForm` does not exist.

- [ ] **Step 6: Create `frontend/src/screens/BudgetForm.tsx`**

A controlled form using `useForm` with `zodResolver(budgetSchema)`. Requirements:
- Props: `{ categories: CategoryNode[]; currency: string; initial?: BudgetFormValues & { id: number }; onSubmit: (values: BudgetFormValues) => void; onCancel: () => void }`.
- Every field has a real `<label htmlFor>` bound to its input's `id` — the tests select by label, and Task 7's axe gate requires accessible names.
- Field errors render next to their field, using the existing `.error-box` class already in `app.css`.
- Category `<select>` is built from the flattened tree with `categoryOptions` from `lib/categoryColor` (the same helper `Transactions.tsx` uses).
- Reuse the existing `.input`, `.btn`, `.btn-primary`, `.btn-secondary` classes from `styles.css`. Add no new CSS.
- Submit button reads "Create budget" with no `initial`, "Save changes" with one.

- [ ] **Step 7: Run the form tests**

Run: `cd frontend && npm test -- BudgetForm`
Expected: PASS, 2 tests.

- [ ] **Step 8: Wire the form into `Budgets.tsx`**

- A "New budget" button in the header opens the form.
- Each budget `Card` gains "Edit" and "Delete" buttons. Follow `Subscriptions.tsx`'s row-action pattern — but give each button a **visible text label or an `aria-label` naming the budget** (`aria-label={`Edit ${budget.category.name} budget`}`), the way `Subscriptions.tsx` labels "Edit Spotify".
- Delete asks for confirmation before firing. Use the same confirmation approach `Subscriptions.tsx` already uses for "Cancel subscription"; do not invent a new modal.
- The empty state gains a "Create your first budget" button opening the same form.

- [ ] **Step 9: Extend `Budgets.test.tsx`**

Keep the existing empty-state test passing, and add one that proves the create path is reachable:

```tsx
test('the empty state offers a way to create the first budget', async () => {
  renderWithProviders(<Budgets />);
  expect(screen.getByRole('button', { name: /create your first budget/i })).toBeInTheDocument();
});
```

Update the `vi.mock` at the top of the file to also stub `useCreateBudget`, `useUpdateBudget` and `useDeleteBudget` as `() => ({ mutate: vi.fn(), isPending: false })`.

- [ ] **Step 10: Verify everything**

```bash
cd frontend && npm run lint && npm test && npm run build
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d
cd frontend && npx playwright test a11y.spec.ts
```
Expected: all green. The axe gate must still pass — new form controls without labels would fail it.

- [ ] **Step 11: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/src frontend/package.json frontend/package-lock.json
git commit -m "$(cat <<'EOF'
feat(frontend): create, edit and delete budgets from the UI

The Budgets screen rendered nine controls, six of which were the nav bar
-- it had none of its own. Budgets could only be created by curling the
API, which is why the e2e suite calls its raw-fetch helper "the budget
-seed trick".

Introduces react-hook-form + zod as the form pattern. Money stays a
decimal string end to end; routing it through a JS number is how scale
gets lost.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

### Task 11: A responsive layout — G2

**Files:**
- Modify: `frontend/src/app.css`, `frontend/src/components/Nav.tsx`
- Create: `frontend/e2e/responsive.spec.ts`

**Interfaces:**
- Produces: `frontend/e2e/responsive.spec.ts`, which every later UI task must keep green.

**`frontend/src/styles.css` must not be touched.** All of this goes in `app.css`, which loads after it and overrides it.

Measured before this plan: `grep -rn "@media" frontend/src/` returns nothing — there is not one media query in the codebase. The nav row (6 links + profile select + "Add transaction" + "Log out", `gap: var(--space-4)`, no wrap) pins every page to a ~1094px minimum, so all six screens scroll sideways at 820px and at 390px.

- [ ] **Step 1: Write the failing test — `frontend/e2e/responsive.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'sturdy-password-1';
const SCREENS = ['/', '/transactions', '/budgets', '/categories', '/subscriptions', '/insights'];
const WIDTHS = [390, 820];

async function registerAndPick(page: Page) {
  const email = `resp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto('/');
  await page.getByRole('button', { name: /create an account|register|sign up/i }).first().click();
  await page.getByLabel(/display name/i).fill('Responsive User');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /create account|register|sign up/i }).last().click();
  await page.getByLabel(/profile name|name/i).first().fill('Household');
  await page.getByRole('button', { name: /create|save/i }).first().click();
  await page.waitForURL(/\/(?!picker)/);
}

for (const width of WIDTHS) {
  test(`no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await registerAndPick(page);
    const offenders: string[] = [];
    for (const path of SCREENS) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth,
        vw: window.innerWidth,
      }));
      // A 1px rounding slack; anything more is real sideways scroll.
      if (overflow.doc > overflow.vw + 1) {
        offenders.push(`${path}: content ${overflow.doc}px wide in a ${overflow.vw}px viewport`);
      }
    }
    expect(offenders, `screens scrolling sideways at ${width}px`).toEqual([]);
  });
}
```

Correct the registration helper against the real markup, exactly as in Task 7 Step 3.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /home/chris/side-projects/my-finance
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d
cd frontend && npx playwright test responsive.spec.ts
```
Expected: FAIL, both tests, listing all six screens — content ~1094px in a 390px viewport and in an 820px viewport.

- [ ] **Step 3: Make the nav responsive, in `app.css` only**

Append to `frontend/src/app.css`:

```css
/* — responsive —
   styles.css is the design system and is not edited; app.css loads after it,
   so these overrides win. The nav is the whole problem: six links plus a
   profile select plus two buttons in one non-wrapping row pinned every page
   to ~1094px, so every screen scrolled sideways below a laptop. */
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

- [ ] **Step 4: Re-run and find what still overflows**

Run: `cd frontend && npx playwright test responsive.spec.ts`
Expected: fewer offenders, but probably not zero — wide tables (Transactions, Subscriptions) and the Insights chip bar are the likely remainder.

- [ ] **Step 5: Contain the remaining offenders**

For each screen still listed, add a rule to `app.css`. Wide content scrolls **inside its own container**, never the page:

```css
/* Wide tables scroll inside their own box rather than pushing the page wide. */
.table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }

@media (max-width: 900px) {
  /* Two-column card grids collapse to one. */
  .grid-2 { grid-template-columns: 1fr !important; }
}
```

Add the `table-scroll` wrapper `<div>` around the `<table>` elements in `Transactions.tsx` and `Subscriptions.tsx`, and give the two-column grid in `Budgets.tsx` (`gridTemplateColumns: 'repeat(2, 1fr)'`) the `grid-2` class so the media query can reach it. Repeat this loop — run, read the offenders, contain them — until the test passes. **Do not** fix it by setting `overflow-x: hidden` on the page; that hides content instead of fitting it.

- [ ] **Step 6: Verify**

```bash
cd frontend && npx playwright test responsive.spec.ts a11y.spec.ts smoke.spec.ts && npm test && npm run lint && npm run build
```
Expected: all green. Confirm `styles.css` is untouched: `git status --short frontend/src/styles.css` prints nothing.

- [ ] **Step 7: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/src/app.css frontend/src/components/Nav.tsx frontend/src/screens frontend/e2e/responsive.spec.ts
git commit -m "$(cat <<'EOF'
fix(frontend): make the app usable below 1100px

There was not a single @media query in the codebase. The nav row -- six
links, a profile select and two buttons, no wrap -- pinned every page to
a ~1094px minimum, so all six screens scrolled sideways on a tablet and
on a phone.

All of it lands in app.css; styles.css is the design system and stays
untouched. Wide tables now scroll inside their own container rather than
pushing the page wide, and a regression test asserts no horizontal
overflow at 390px and 820px.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

### Task 12: Server-side transaction summary — G3, part 1

**Files:**
- Create: `backend/src/main/java/com/myfinance/backend/dto/TransactionSummary.java`
- Modify: `backend/src/main/java/com/myfinance/backend/repository/TransactionRepository.java`, `service/TransactionService.java`, `controller/TransactionController.java`, `docs/API.md`
- Test: `backend/src/test/java/com/myfinance/backend/controller/TransactionControllerTest.java`

**Interfaces:**
- Produces: `GET /api/transactions/summary` taking the same filter parameters as `GET /api/transactions` (`from`, `to`, `categoryId`, `includeDescendants`, `type`) and returning `List<TransactionSummary>` — one row per currency:
  ```json
  [{ "currency": "PLN", "income": "1234.5600", "expense": "999.0000", "net": "235.5600", "count": 235 }]
  ```
  Amounts are decimal strings at scale 4. Task 14 consumes this.

`frontend/src/screens/Transactions.tsx:66` computes the money tiles by summing a **separate `size: 200` query**. Past 200 matching rows the tiles silently describe a subset while presenting as the total. This is a wrong number in a finance app; the fix is to aggregate in the database, not to raise the cap.

- [ ] **Step 1: Write the failing test**

In the transaction controller test class, following its existing style and harness:

```java
    @Test
    void summaryCountsEveryMatchingRowNotJustTheFirstPage() throws Exception {
        // Seed 205 EXPENSE transactions of 1.0000 PLN each in one category.
        // GET /api/transactions/summary must report expense "205.0000" and count 205.
        // This is the whole point: a 200-row cap would report "200.0000".
    }

    @Test
    void summaryReportsEachCurrencySeparately() throws Exception {
        // PLN and EUR rows in the same period -> two entries, never summed together.
    }

    @Test
    void summaryRespectsTheCategoryFilterAndItsSubtree() throws Exception {
        // parent + child category; includeDescendants=true includes the child's rows,
        // includeDescendants=false does not.
    }

    @Test
    void summaryOnlySeesTheActiveProfilesRows() throws Exception {
        // rows in another profile must not appear in any total
    }
```

Write these out fully. **The 205-row test is the one that matters** — with fewer than 201 rows it cannot detect the bug it exists to prevent.

- [ ] **Step 2: Run and watch it fail**

Run: `cd backend && ./mvnw -B test -Dtest=TransactionControllerTest`
Expected: FAIL — `/api/transactions/summary` does not exist (404).

- [ ] **Step 3: Add the DTO**

```java
package com.myfinance.backend.dto;

import java.math.BigDecimal;

/** Totals for one currency over a filtered set. Currencies never mix (ARCHITECTURE.md §3). */
public record TransactionSummary(
        String currency, BigDecimal income, BigDecimal expense, BigDecimal net, long count) {
}
```

- [ ] **Step 4: Implement the aggregate**

Add a projection interface and a `@Query` to `TransactionRepository` that groups by currency and uses `SUM(...) FILTER`-equivalent conditional aggregation, returning income, expense and count per currency. Reuse the subtree CTE approach already in `sumExpensesBySubtreeAndPeriod` (lines 27–42) when `includeDescendants` is set — **read that query and follow it**, including its `profile_id` predicate in both terms of the recursive CTE.

Then add `TransactionService.summary(TransactionFilter filter)` returning `List<TransactionSummary>`, normalising every amount through `Money.normalize` so it serialises at scale 4, and computing `net = income - expense`.

Add to `TransactionController`, **above** the `@GetMapping("/{id}")` mapping so the literal path wins:

```java
    @GetMapping("/summary")
    public List<TransactionSummary> summary(@RequestParam(required = false) LocalDate from,
                                            @RequestParam(required = false) LocalDate to,
                                            @RequestParam(required = false) Long categoryId,
                                            @RequestParam(defaultValue = "false") boolean includeDescendants,
                                            @RequestParam(required = false) TransactionType type) {
        return transactionService.summary(new TransactionFilter(from, to, categoryId, includeDescendants, type, 0, 1));
    }
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && ./mvnw -B verify`
Expected: BUILD SUCCESS with all four new tests passing.

- [ ] **Step 6: Document it in `docs/API.md`**

Add `### GET /api/transactions/summary` to the Transactions section: the parameter table (identical to `GET /api/transactions` minus `page`/`size`), the response shape, and a sentence saying totals cover **every** matching row regardless of pagination.

- [ ] **Step 7: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add backend/src docs/API.md
git commit -m "$(cat <<'EOF'
feat(api): aggregate transaction totals in the database

The UI computed its money tiles by summing a separate size=200 query, so
past 200 matching rows the totals silently described a subset while
presenting as the whole. Aggregating server-side is the fix; raising the
cap would only move the number at which it lies.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

### Task 13: Wire the tiles to the aggregate, and delete the cap — G3, part 2

**Files:**
- Modify: `frontend/src/api/hooks.ts`, `frontend/src/api/types.ts`, `frontend/src/screens/Transactions.tsx`
- Test: `frontend/src/screens/Transactions.test.tsx` (create)

**Interfaces:**
- Consumes: `GET /api/transactions/summary` from Task 12.
- Produces: `useTransactionSummary(query: TransactionQuery)`.

- [ ] **Step 1: Write the failing test**

`frontend/src/screens/Transactions.test.tsx` — assert the tiles render the summary endpoint's numbers, not a sum of the listed rows. Mock `../api/hooks` so `useTransactions` returns 2 rows totalling 30 while `useTransactionSummary` returns `expense: '9999.0000'`, then assert the tile shows the 9999 figure. That test fails on today's code, which would show 30.

- [ ] **Step 2: Run it and watch it fail**

Run: `cd frontend && npm test -- Transactions`
Expected: FAIL.

- [ ] **Step 3: Add the hook**

```ts
export function useTransactionSummary(query: TransactionQuery) {
  const profileId = useActiveProfileId();
  const { page: _page, size: _size, ...filters } = query;
  return useQuery({
    queryKey: ['transaction-summary', profileId, filters],
    queryFn: () => api<TransactionSummary[]>(`/api/transactions/summary${queryString(filters)}`),
    enabled: profileId !== null,
  });
}
```

Add the matching `TransactionSummary` type to `frontend/src/api/types.ts` with `income`, `expense`, `net` as `string` (decimal strings) and `count` as `number`.

- [ ] **Step 4: Replace the capped query in `Transactions.tsx`**

Delete these two lines (currently at `Transactions.tsx:64-66`):

```tsx
  // The money tiles sum a SEPARATE size-200 query over the same filters (like the
  // dashboard) — summing only the visible page would silently undercount.
  const summary = useTransactions({ ...query, page: undefined, size: 200 });
```

and use `useTransactionSummary(query)` instead. Update the tiles to read the profile-currency row from the returned array. If the response holds more than one currency, show the active profile's `defaultCurrency` row and note the others — do not add them together.

- [ ] **Step 5: Verify**

```bash
cd frontend && npm test && npm run lint && npm run build
```
Expected: all pass.

- [ ] **Step 6: Prove it against real data**

```bash
cd /home/chris/side-projects/my-finance
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up -d
cd frontend && npx playwright test smoke.spec.ts responsive.spec.ts a11y.spec.ts
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add frontend/src
git commit -m "$(cat <<'EOF'
fix(frontend): money tiles report every matching transaction

The tiles summed a separate size=200 query, so a profile with more than
200 matching rows saw a total that was quietly short. They now read the
server-side aggregate.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

### Task 14: Honest category transaction counts — G3, part 3

**Files:**
- Create: `backend/src/main/java/com/myfinance/backend/dto/CategoryTransactionCount.java`
- Modify: `backend/.../repository/TransactionRepository.java`, `service/TransactionService.java`, `controller/TransactionController.java`, `docs/API.md`, `frontend/src/api/hooks.ts`, `frontend/src/api/types.ts`, `frontend/src/screens/Categories.tsx`
- Test: backend controller test; `frontend/src/screens/Categories.test.tsx` (create)

**Interfaces:**
- Produces: `GET /api/transactions/category-counts` returning `[{ "categoryId": 7, "count": 43 }]`, covering every transaction in the profile. Frontend hook `useCategoryCounts()`.

This is the bug the user actually hit. `Categories.tsx:26` loads `useTransactions({ size: 200 })` and counts client-side; line 29 sets `countsTruncated`, line 169 attaches `title="counted from the latest 200 transactions"`. **The caveat only exists on hover** — the number reads as fact until you happen to point at it.

- [ ] **Step 1: Write the failing backend test**

Seed 205 transactions across two categories and assert the endpoint's counts sum to 205. As in Task 12, a fixture under 201 rows cannot catch the regression.

- [ ] **Step 2: Run and watch it fail** — `cd backend && ./mvnw -B test -Dtest=TransactionControllerTest`; expected 404.

- [ ] **Step 3: Implement**

A `GROUP BY category_id` count scoped to the profile, exposed at `/api/transactions/category-counts` (declared above `@GetMapping("/{id}")`). Counts are per category **as filed**, not rolled up — `Categories.tsx` already does its own subtree roll-up and must keep doing exactly one.

- [ ] **Step 4: Run tests** — `cd backend && ./mvnw -B verify`; expected BUILD SUCCESS.

- [ ] **Step 5: Update `Categories.tsx`**

Replace `useTransactions({ size: 200 })` with `useCategoryCounts()`. Then **delete all three pieces of the old apology**: the `countsTruncated` variable (line 29), the `' · txn counts from the latest 200'` header text (line 107), and the `title` attribute (line 169). They described a limitation that no longer exists — leaving them would be a second lie.

- [ ] **Step 6: Write the frontend regression test**

`frontend/src/screens/Categories.test.tsx`: mock `useCategoryCounts` to return a count of 205 for one category and assert `205 txn` renders. Add a second assertion that **no element on the screen has a `title` mentioning 200**:

```tsx
test('does not hide a caveat about capped counts in a tooltip', () => {
  renderWithProviders(<Categories />);
  const titled = document.querySelectorAll('[title]');
  for (const el of titled) {
    expect(el.getAttribute('title')).not.toMatch(/latest 200|200 transactions/i);
  }
});
```

- [ ] **Step 7: Verify** — `cd frontend && npm test && npm run lint && npm run build`; expected all pass.

- [ ] **Step 8: Update `docs/API.md`** with `### GET /api/transactions/category-counts`.

- [ ] **Step 9: Commit**

```bash
cd /home/chris/side-projects/my-finance
git add backend/src frontend/src docs/API.md
git commit -m "$(cat <<'EOF'
fix: category transaction counts are complete, not the latest 200

Each category showed a count computed from one 200-row page. The only
disclosure was a native title tooltip -- "counted from the latest 200
transactions" -- which does not exist until the pointer lands on it, so
the number read as fact.

Counted in the database now, and the apology text and tooltip are gone
with the limitation that produced them.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015QATR5r9dwcyCS4AYsV2JD
EOF
)"
```

### Task 15: Reach the transaction editor — G4

**Files:**
- Modify: `frontend/src/components/TxnModal.tsx`, `frontend/src/screens/Transactions.tsx`, `frontend/src/api/hooks.ts`
- Test: `frontend/src/screens/Transactions.test.tsx`

`PUT /api/transactions/{id}` exists, is tested and has no UI. Rows offer only "Delete transaction", so correcting a typo means deleting and re-entering — losing the row's identity and its subscription link.

- [ ] **Step 1: Write the failing test** — render `Transactions` with one row and assert `getByRole('button', { name: /edit/i })` exists. It fails today.
- [ ] **Step 2: Run it** — `cd frontend && npm test -- Transactions`; expected FAIL.
- [ ] **Step 3: Add `useUpdateTransaction()`** to `hooks.ts`, mirroring `useUpdateSubscription` exactly (same `useMutation` shape, invalidating `['transactions', profileId]` and `['transaction-summary', profileId]`).
- [ ] **Step 4: Give `TxnModal` an edit mode** — accept an optional `initial?: TransactionResponse`, prefill every field from it, and call the update mutation instead of create when present. Change nothing about the create path.
- [ ] **Step 5: Add the row action** — an "Edit" button beside each row's delete, labelled `aria-label={`Edit transaction ${t.description ?? t.id}`}` so the axe gate passes and the button is distinguishable.
- [ ] **Step 6: Verify** — `cd frontend && npm test && npm run lint && npm run build && npx playwright test a11y.spec.ts responsive.spec.ts`; expected all pass.
- [ ] **Step 7: Commit** with subject `feat(frontend): edit a transaction instead of deleting and re-adding` and the two standard trailers.

### Task 16: Rename and delete categories from the UI — G5

**Files:**
- Modify: `frontend/src/screens/Categories.tsx`, `frontend/src/api/hooks.ts`
- Test: `frontend/src/screens/Categories.test.tsx`

`PATCH /api/categories/{id}` and `DELETE /api/categories/{id}` both exist. The UI offers create and colour-change only.

- [ ] **Step 1: Write the failing tests** — a rename control and a delete control exist for a category row.
- [ ] **Step 2: Run them** — expected FAIL.
- [ ] **Step 3: Add `useDeleteCategory()`** to `hooks.ts` (`useUpdateCategory` already exists — reuse it for rename).
- [ ] **Step 4: Add the controls.** Rename edits in place on the existing row; delete confirms first. **The backend already rejects deleting a category that is in use** (`CategoryInUseException`) — surface that message in the existing `.error-box` rather than pre-checking client-side, so the UI cannot disagree with the server.
- [ ] **Step 5: Verify** — `npm test && npm run lint && npm run build && npx playwright test a11y.spec.ts`; expected all pass.
- [ ] **Step 6: Commit** — `feat(frontend): rename and delete categories`.

### Task 17: Rename and delete profiles — G6

**Files:**
- Modify: `backend/.../controller/ProfileController.java`, `service/ProfileService.java`, `docs/API.md`, `frontend/src/screens/ProfilePicker.tsx`, `frontend/src/api/hooks.ts`
- Create: `backend/src/main/java/com/myfinance/backend/dto/UpdateProfileRequest.java`
- Test: backend profile controller test; `frontend/src/screens/ProfilePicker.test.tsx`

Profiles can be created and never renamed or deleted, at either layer.

- [ ] **Step 1: Write the failing backend tests** — `PUT /api/profiles/{id}` renames and returns 200; renaming to an existing name is 409 (`ProfileNameTakenException` already exists); `DELETE /api/profiles/{id}` returns 204; another user's profile is 404.
- [ ] **Step 2: Decide and record the delete semantics.** A profile owns categories, transactions, budgets, subscriptions and insights. **Check `docs/SCHEMA.md` for the existing cascade behaviour and follow it** — do not invent one. If the schema already cascades from `profile`, delete is a simple `repository.delete`. If it does not, this task is **update only**: implement `PUT`, skip `DELETE`, and record in the task report that delete needs a schema decision. Do not add a migration in this task.
- [ ] **Step 3: Run and watch fail**, then implement, then run again — `cd backend && ./mvnw -B verify`.
- [ ] **Step 4: Guard the last profile.** Deleting the profile you are currently using, or your only profile, must not strand the session. Reject deleting the last remaining profile with a 409 and a clear message.
- [ ] **Step 5: Add the UI** to `ProfilePicker.tsx` — rename inline, delete with confirmation naming the profile and what is lost.
- [ ] **Step 6: Update `docs/API.md`.**
- [ ] **Step 7: Verify** — backend `verify`, frontend `npm test && npm run lint && npm run build`, then `npx playwright test`.
- [ ] **Step 8: Commit** — `feat: rename and delete profiles`.

### Task 18: Deep links keep their destination — G7

**Files:**
- Modify: `frontend/src/App.tsx` (or wherever the profile-required redirect lives — find it first), `frontend/src/screens/ProfilePicker.tsx`
- Test: `frontend/src/screens/ProfilePicker.test.tsx`

Visiting `/budgets` with no active profile in the browser session redirects to `/picker`, and picking a profile lands you on `/` — the destination is thrown away. Measured during the design audit: every screen bounced to `/picker` and none of them remembered where it was going.

- [ ] **Step 1: Write the failing test** — render the picker at `/picker` with router state `{ from: '/budgets' }` and assert that choosing a profile navigates to `/budgets`.
- [ ] **Step 2: Run it** — expected FAIL.
- [ ] **Step 3: Carry the destination.** Where the redirect is issued, pass the attempted location: `<Navigate to="/picker" replace state={{ from: location.pathname + location.search }} />`. In `ProfilePicker`, after `setActiveProfile` succeeds, navigate to `state?.from ?? '/'`.
- [ ] **Step 4: Guard the obvious hole** — only accept a `from` that starts with a single `/` and not `//`, so the value can never become an off-site redirect.
- [ ] **Step 5: Verify** — `npm test && npm run lint && npm run build`.
- [ ] **Step 6: Commit** — `fix(frontend): picking a profile returns you to where you were going`.

### Task 19: One update verb across the API — G8

**Files:**
- Modify: `backend/.../controller/CategoryController.java`, `docs/API.md`, `frontend/src/api/hooks.ts`
- Test: backend category controller test

`categories` updates via `PATCH`; `transactions`, `subscriptions`, `insights` and (as of Task 9) `budgets` all use `PUT`. One resource disagrees with its siblings for no stated reason.

- [ ] **Step 1: Check whether the update is partial.** Read `UpdateCategoryRequest` and `CategoryService.update`. **If the request genuinely supports partial updates** (nullable fields meaning "leave alone"), `PATCH` is the correct verb and this task is documentation only: add a line to `docs/API.md` explaining why categories differ, and stop. Record that finding in the report.
- [ ] **Step 2: If it is a full replacement**, add `@PutMapping("/{id}")` delegating to the same service method, and keep `@PatchMapping("/{id}")` as a deprecated alias so nothing breaks mid-run.
- [ ] **Step 3: Write the test** — `PUT /api/categories/{id}` renames and returns 200; the existing `PATCH` test still passes.
- [ ] **Step 4: Run** — `cd backend && ./mvnw -B verify`.
- [ ] **Step 5: Point the frontend at `PUT`** in `useUpdateCategory`.
- [ ] **Step 6: Update `docs/API.md`**, noting `PATCH` is retained as a deprecated alias.
- [ ] **Step 7: Verify** — backend `verify`, frontend `npm test && npm run lint && npm run build`, `npx playwright test smoke.spec.ts`.
- [ ] **Step 8: Commit** — `refactor(api): categories accept PUT like every other resource`.

### Task 20: Transaction search that searches everything — G9

**Files:**
- Modify: `backend/.../repository/TransactionSpecifications.java`, `service/TransactionService.java`, `service/TransactionFilter.java`, `controller/TransactionController.java`, `docs/API.md`, `frontend/src/api/hooks.ts`, `frontend/src/api/types.ts`, `frontend/src/screens/Transactions.tsx`
- Test: backend controller test; `frontend/src/screens/Transactions.test.tsx`

`Transactions.tsx` filters client-side over the loaded page, with the comment "the API has no search". Searching for a merchant that sits on page 3 returns nothing while you are on page 1 — the row is there and the app says it is not.

- [ ] **Step 1: Write the failing backend test** — seed 60 transactions where the only one matching `"Kaufland"` sits well past the first page of 50; `GET /api/transactions?q=Kaufland` must return exactly that row.
- [ ] **Step 2: Run and watch fail** — the parameter does not exist, so the filter is ignored and the first page comes back.
- [ ] **Step 3: Add `q` to `TransactionFilter`.** This changes the record's constructor arity, so **every call site must be updated in the same commit** — including the `summary` and `category-counts` controllers added in Tasks 12 and 14, which construct it as `new TransactionFilter(from, to, categoryId, includeDescendants, type, 0, 1)`. Compile after this step (`./mvnw -B compile`) before writing anything else.

  Then add and a specification matching `description` **or** `merchant`, case-insensitively, using `LOWER(col) LIKE LOWER(CONCAT('%', :q, '%'))`. Escape `%` and `_` in the input so a user typing `%` does not match everything. Cap `q` at 100 characters.
- [ ] **Step 4: Add `@RequestParam(required = false) String q`** to the controller's `list` **and** to `summary` and `category-counts` from Tasks 12 and 14, so the tiles and counts agree with the filtered list.
- [ ] **Step 5: Run** — `cd backend && ./mvnw -B verify`.
- [ ] **Step 6: Move the frontend search server-side.** Delete the client-side `content.filter(...)` block in `Transactions.tsx` and pass `q` into the query instead. **Debounce it (300ms)** so typing does not fire a request per keystroke, and reset to `page: 0` whenever `q` changes — otherwise a search from page 3 lands on an empty page 3 of the new result set.
- [ ] **Step 7: Write the frontend test** — typing in the search box eventually issues a query carrying `q`, and the page resets to 0.
- [ ] **Step 8: Update `docs/API.md`** with the `q` parameter on all three endpoints.
- [ ] **Step 9: Verify** — backend `verify`; `cd frontend && npm test && npm run lint && npm run build && npx playwright test`.
- [ ] **Step 10: Commit** — `feat: search transactions across every page, not just the loaded one`.

---

# Phase M2 — Structure

**Harness gate (user decision):** a file may be refactored **only if it has test coverage written earlier in this run**. Before starting each task, verify the coverage exists. If it does not, **do not refactor that file** — record it in the ledger as deferred and move to the next task. Splitting untested code overnight is how a green suite starts lying.

Every task in this phase is a pure refactor: **no behaviour changes, no new features, no renamed public API**. The test suites must pass before and after with no test edits other than import paths.

### Task 21: Split `api/hooks.ts` by domain

**Files:**
- Create: `frontend/src/api/hooks/auth.ts`, `profiles.ts`, `categories.ts`, `transactions.ts`, `budgets.ts`, `subscriptions.ts`, `insights.ts`, `index.ts`
- Delete: `frontend/src/api/hooks.ts`
- Modify: every file importing from `../api/hooks`

**Harness gate:** requires the component tests written in Tasks 1, 10, 13, 14, 15, 16, 20. Confirm with `ls frontend/src/screens/*.test.tsx` before starting.

One 510-line module holds 35 hooks spanning every domain in the app. The file is already organised by `// — Subscriptions —` style comments; those comments are the split lines.

- [ ] **Step 1: Record the baseline** — `cd frontend && npm test 2>&1 | tail -3`. Write the exact pass count in the task report; it must be identical at the end.
- [ ] **Step 2: Create `frontend/src/api/hooks/index.ts`** re-exporting everything: `export * from './auth'; export * from './profiles';` and so on. **Every existing `import { … } from '../api/hooks'` keeps working unchanged** — that is what makes this safe.
- [ ] **Step 3: Move the hooks**, one domain per commit, following the existing section comments. Shared internals (`api`, `queryString`, `useActiveProfileId`) stay importable — put `useActiveProfileId` and `useSession` in `auth.ts` and import them where needed.
- [ ] **Step 4: After each domain moves, run** `npm test && npm run lint && npm run build`. Expected: the same pass count as Step 1, every time.
- [ ] **Step 5: Delete the old `hooks.ts`** once it is empty, and confirm nothing imports it: `grep -rn "api/hooks'" frontend/src | grep -v "api/hooks/"` should show imports resolving to the directory's `index.ts`.
- [ ] **Step 6: Final verification** — `npm test && npm run lint && npm run build && npx playwright test`. The pass count must equal Step 1's.
- [ ] **Step 7: Commit** — `refactor(frontend): split api/hooks.ts into one module per domain`, noting in the body that `index.ts` re-exports everything so no call site changed.

### Task 22: Split `screens/Insights.tsx`

**Files:** `frontend/src/screens/Insights.tsx` (528 lines) → the screen plus extracted pieces under `frontend/src/insights/`.

**Harness gate:** Insights has **no component test** as of M0. Before refactoring, **write one** — render the screen with mocked hooks and assert the chip bar and the Run button appear, plus one test pinning the behaviour fixed just before this run: *the caption and series colours follow the executed plan (`lastEnvelope.plan`), not the live chip state*. That regression is subtle, was shipped once, and a blind refactor can reintroduce it.

- [ ] **Step 1: Write those two tests and get them passing against the current code.** Record the count.
- [ ] **Step 2: Extract** the plan-state reducer, the save/pin controls, and the results panel into their own modules under `frontend/src/insights/`. Keep `Insights.tsx` as the composition root.
- [ ] **Step 3: Preserve the two behaviours the tests pin** — `ResultRenderer` and `Caption` read `lastEnvelope.plan`; `FollowUp` deliberately reads the **live** `plan`. Do not "tidy" that asymmetry: it is correct and was a bug fix.
- [ ] **Step 4: Verify** — `npm test && npm run lint && npm run build && npx playwright test smoke.spec.ts insights-ai.spec.ts insights-merchant.spec.ts insights-ai-search.spec.ts`. Same counts as Step 1.
- [ ] **Step 5: Commit** — `refactor(frontend): break Insights.tsx into focused modules`.

### Task 23: Split `screens/Subscriptions.tsx`

**Files:** `frontend/src/screens/Subscriptions.tsx` (488 lines).

**Harness gate:** write a component test first (the dashboard summary and the row actions render), get it green, record the count, then extract the form and the row into their own modules. Verify with `npm test && npm run lint && npm run build && npx playwright test`. Commit as `refactor(frontend): break Subscriptions.tsx into focused modules`.

### Task 24: Split `analytics/llm/narrate.py`

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

### Task 25: Enforce the layering with ArchUnit

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

### Task 26: OpenAPI via springdoc

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

### Task 27: Generate the frontend's API types from the schema

**Files:**
- Create: `frontend/scripts/generate-types.mjs`, `frontend/src/api/schema.d.ts`
- Modify: `frontend/package.json`, `frontend/src/api/types.ts`, `docs/API.md`

**Interfaces:**
- Consumes: `/v3/api-docs` from Task 26.

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

### Task 28: `pydantic-settings` for the analytics config

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

### Task 29: Type-check analytics with mypy

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

### Task 30: Correct the false rationale in `plan.py`

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

### Task 31: Dependabot

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

### Task 32: lefthook — installed last, on purpose

**Files:** Create `lefthook.yml`; modify `README.md`.

**This is deliberately the final task.** A pre-commit hook installed earlier would intercept every subsequent commit in this run and could block on pre-existing issues in files a task touches mid-refactor. It goes in once nothing else needs to commit.

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

### Task 33: Close out the run

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

- [ ] **Step 4: Report.** Summarise: every task's outcome, the JaCoCo baseline versus final coverage, the frontend test count (0 at the start), which gaps closed, anything deferred by the M2 harness gate or by Task 17's schema check, and — explicitly — that **no CI job was ever observed running**, because the branch is never pushed.

- [ ] **Step 5: Stop.** Use `superpowers:finishing-a-development-branch` and **present the menu**. Do not merge. The branch stays unmerged for review; integration is the user's decision.
