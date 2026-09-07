import { test, expect, type Page } from '@playwright/test';

// The AI search box (MY-37): free text drafts a plan into the chips and
// never runs it on its own. Capabilities, /interpret and /execute are all
// stubbed in the browser, so this needs the backend running (for
// register/login) but never an analytics service and never a model.

const PASSWORD = 'sturdy-password-1'; // the API requires >= 12 chars

async function registerAndPickProfile(page: Page, email: string) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/auth/);
  await page.getByRole('link', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill('E2E AI Search');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/picker/);
  await page.getByRole('button', { name: 'New profile' }).click();
  await page.getByLabel('Profile name').fill('Personal');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: /Personal/ }).click();
  await expect(page).toHaveURL('/');
}

async function stubCapabilities(page: Page, body: { interpret: boolean; model: string | null }) {
  await page.route('**/api/insights/capabilities', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

async function stubInterpret(page: Page, status: number, body: Record<string, unknown>) {
  await page.route('**/api/insights/interpret', (route) =>
    route.fulfill({
      status,
      contentType: status === 200 ? 'application/json' : 'application/problem+json',
      body: JSON.stringify(body),
    }),
  );
}

/** Counts calls to /execute — proof the drafted plan was never run on its own. */
async function countExecuteCalls(page: Page): Promise<() => number> {
  let calls = 0;
  await page.route('**/api/insights/execute', (route) => {
    calls += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ plan: {}, results: [], meta: { truncatedGroups: false } }),
    });
  });
  return () => calls;
}

test('a draft lands as chips, unrun, and the notes explain it', async ({ page }) => {
  await registerAndPickProfile(page, `e2e-ai-search-${Date.now()}@example.com`);
  await stubCapabilities(page, { interpret: true, model: 'qwen3:4b' });
  const executeCalls = await countExecuteCalls(page);
  await stubInterpret(page, 200, {
    plan: {
      version: 1,
      metric: 'income',
      filters: { includeDescendants: true, currency: 'USD' },
      groupBy: null,
      interval: 'year',
      range: { type: 'yearToDate' },
    },
    notes: ['Grouped by year because you said "yearly".'],
  });

  await page.goto('/insights');
  await page.getByLabel('Ask about your money').fill('how much did I earn this year, yearly');
  await page.getByRole('button', { name: 'Ask' }).click();

  // The note explaining the draft.
  await expect(page.getByText('Grouped by year because you said "yearly".')).toBeVisible();
  // The draft landed in the chips' own sentence, not just internal state.
  await expect(
    page.getByText('income · all categories · per year · year to date · USD'),
  ).toBeVisible();
  // Never auto-run: no call to /execute, and Run still reads "Run".
  expect(executeCalls()).toBe(0);
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
});

test('422 reads as the feature declining, not an error box', async ({ page }) => {
  await registerAndPickProfile(page, `e2e-ai-declined-${Date.now()}@example.com`);
  await stubCapabilities(page, { interpret: true, model: 'qwen3:4b' });
  await stubInterpret(page, 422, {
    type: '/errors/interpret-failed',
    title: 'Could not interpret that',
    status: 422,
    detail: 'The model could not produce a usable plan.',
    problems: ['no usable plan after one retry'],
  });

  await page.goto('/insights');
  await page.getByLabel('Ask about your money').fill('asdkjhasdkjh nonsense query');
  await page.getByRole('button', { name: 'Ask' }).click();

  await expect(
    page.getByText("Couldn't turn that into a plan — try rephrasing, or use the chips below."),
  ).toBeVisible();
  // Not the boxed "something is broken" treatment.
  await expect(page.locator('.error-box')).toHaveCount(0);
  // The templates are still right there.
  await expect(page.getByText('Start from a template')).toBeVisible();
});

test('503 reads as something actually broken, in the boxed treatment', async ({ page }) => {
  await registerAndPickProfile(page, `e2e-ai-503-${Date.now()}@example.com`);
  await stubCapabilities(page, { interpret: true, model: 'qwen3:4b' });
  await stubInterpret(page, 503, {
    type: '/errors/analytics-unavailable',
    title: 'Analytics service unavailable',
    status: 503,
    detail: 'The analytics service is not reachable.',
  });

  await page.goto('/insights');
  await page.getByLabel('Ask about your money').fill('how much did I spend on groceries');
  await page.getByRole('button', { name: 'Ask' }).click();

  const box = page.locator('.error-box');
  await expect(box).toBeVisible();
  await expect(box).toContainText("Analytics is offline right now — the analytics service isn't running.");
});

test('the 500-character limit is enforced on the input itself', async ({ page }) => {
  await registerAndPickProfile(page, `e2e-ai-limit-${Date.now()}@example.com`);
  await stubCapabilities(page, { interpret: true, model: 'qwen3:4b' });

  await page.goto('/insights');
  const input = page.getByLabel('Ask about your money');
  await input.fill('a'.repeat(900));

  await expect(input).toHaveValue('a'.repeat(500));
  await expect(page.getByText('0 left')).toBeVisible();
});

test('with the AI layer off the search box is absent and templates still work', async ({
  page,
}) => {
  await registerAndPickProfile(page, `e2e-ai-search-off-${Date.now()}@example.com`);
  await stubCapabilities(page, { interpret: false, model: null });

  await page.goto('/insights');

  await expect(page.getByLabel('Ask about your money')).toHaveCount(0);
  await expect(page.getByText('Start from a template')).toBeVisible();
});

// Task 12's `if (interpret.isPending) return;` guard (Insights AI review) had
// no regression test of its own — closed here.
test('the search box never double-submits on Enter or Enter-then-click', async ({ page }) => {
  await registerAndPickProfile(page, `e2e-ai-doubleenter-${Date.now()}@example.com`);
  await stubCapabilities(page, { interpret: true, model: 'qwen3:4b' });

  let calls = 0;
  await page.route('**/api/insights/interpret', async (route) => {
    calls += 1;
    // Hold the request open so "Thinking…" is still on screen when the second
    // Enter (or the click) arrives — otherwise the race never actually happens.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      json: {
        plan: {
          version: 1,
          metric: 'income',
          filters: { includeDescendants: true, currency: 'USD' },
          groupBy: null,
          interval: 'year',
          range: { type: 'yearToDate' },
        },
        notes: [],
      },
    });
  });

  await page.goto('/insights');
  const input = page.getByLabel('Ask about your money');

  // Rapid double-Enter.
  await input.fill('how much did I earn this year');
  await input.press('Enter');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: 'Thinking…' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask' })).toBeVisible({ timeout: 5000 });
  expect(calls).toBe(1);

  // Enter, then a click while still pending.
  calls = 0;
  await input.fill('how much did I spend this year');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: 'Thinking…' })).toBeVisible();
  await page.getByRole('button', { name: 'Thinking…' }).click({ force: true });
  await expect(page.getByRole('button', { name: 'Ask' })).toBeVisible({ timeout: 5000 });
  expect(calls).toBe(1);
});
