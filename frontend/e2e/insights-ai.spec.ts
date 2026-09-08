import { test, expect, type Page } from '@playwright/test';

// The AI badge in the insights header, in both capability states. The
// capabilities endpoint is stubbed in the browser, so this test needs the
// backend running (for register/login) but never an analytics service and
// never a model.

const PASSWORD = 'sturdy-password-1'; // the API requires >= 12 chars

async function registerAndPickProfile(page: Page, email: string) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/auth/);
  await page.getByRole('link', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill('E2E AI');
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

const ENVELOPE = {
  plan: {
    version: 1,
    metric: 'spend',
    filters: { currency: 'PLN' },
    groupBy: null,
    interval: 'month',
    range: { type: 'lastMonths', n: 12 },
  },
  results: [
    {
      currency: 'PLN',
      shape: 'timeseries',
      points: [
        { period: '2026-08', value: '980.2100' },
        { period: '2026-09', value: '1243.5000' },
      ],
    },
  ],
  meta: { truncatedGroups: false },
};

const CAPTION = 'PLN total 2223.71, averaging 1111.86 per month.';

/**
 * Stubs the whole /api/insights/* surface this spec's tests touch — one
 * helper, one shape, so Task 20's follow-up test has a single set to build
 * on. `caps` drives the capabilities badge; execute/narrate/insights are
 * fixed, since only the caption test below exercises them.
 */
async function stubInsightsApi(page: Page, caps: { interpret: boolean; model: string | null }) {
  await page.route('**/api/insights/capabilities', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(caps) }),
  );
  await page.route('**/api/insights/execute', (route) => route.fulfill({ json: ENVELOPE }));
  await page.route('**/api/insights/narrate', (route) =>
    route.fulfill({ json: { caption: CAPTION } }),
  );
  await page.route('**/api/insights', (route) => route.fulfill({ json: [] }));
}

test('the insights header names the model when interpretation is available', async ({ page }) => {
  await registerAndPickProfile(page, `e2e-ai-on-${Date.now()}@example.com`);
  await stubInsightsApi(page, { interpret: true, model: 'qwen3:4b' });

  await page.goto('/insights');

  await expect(page.getByText('AI · qwen3:4b')).toBeVisible();
});

test('with the AI layer off the explorer still works and shows no AI badge', async ({ page }) => {
  await registerAndPickProfile(page, `e2e-ai-off-${Date.now()}@example.com`);
  await stubInsightsApi(page, { interpret: false, model: null });

  await page.goto('/insights');

  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible();
  await expect(page.getByText(/^AI · /)).toHaveCount(0);
});

// The Phase 5 layer of the insights explorer, continued: the caption beside
// the chart. The REAL backend is used for auth (as every test above does),
// but /api/insights/* is fulfilled in the browser, so this test needs
// neither the analytics service nor a model. What it checks is this layer's
// own promise — the caption appears beside the chart it describes.
// Executor behaviour has golden tests in analytics/tests and is deliberately
// not re-tested here.
test('the caption appears beside the chart it describes', async ({ page }) => {
  await registerAndPickProfile(page, `e2e-caption-${Date.now()}@example.com`);
  await stubInsightsApi(page, { interpret: true, model: 'qwen3:4b' });

  await page.goto('/insights');

  // Nothing is asserted until the user asks — a caption is not free output.
  await expect(page.getByText(CAPTION)).toHaveCount(0);

  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'Explain this chart' }).click();
  await expect(page.getByText(CAPTION)).toBeVisible();
});

// The follow-up input (MY-38): refining a plan you already have, rather than
// re-deriving it from scratch. The point of the feature is structural: the
// plan being edited has to travel with the text on the wire.
test('a follow-up edits the plan instead of starting over', async ({ page }) => {
  await registerAndPickProfile(page, `e2e-followup-${Date.now()}@example.com`);
  await stubInsightsApi(page, { interpret: true, model: 'qwen3:4b' });

  const sent: Array<{ text: string; currentPlan: unknown }> = [];
  await page.route('**/api/insights/interpret', async (route) => {
    sent.push(route.request().postDataJSON());
    await route.fulfill({
      json: { plan: { ...ENVELOPE.plan, range: { type: 'yearToDate' } }, notes: [] },
    });
  });
  // Overrides stubInsightsApi's own /execute route (last-registered wins) so
  // this test can assert the refined plan lands as chips only — never a run.
  let executeCalls = 0;
  await page.route('**/api/insights/execute', (route) => {
    executeCalls += 1;
    return route.fulfill({ json: ENVELOPE });
  });

  await page.goto('/insights');

  await page.getByLabel('Follow-up question').fill('and only this year?');
  await page.getByRole('button', { name: 'refine' }).click();

  // The input clears on success — the chips now hold the refined plan.
  await expect(page.getByLabel('Follow-up question')).toHaveValue('');
  expect(sent).toHaveLength(1);
  expect(sent[0].text).toBe('and only this year?');
  // The whole point: the follow-up travels with the plan it is editing.
  // defaultPlan() sets metric: 'spend', groupBy: 'category', interval: null
  // (Stage 1 Task 31) — assert the fields the explorer actually starts with.
  expect(sent[0].currentPlan).toMatchObject({ metric: 'spend', groupBy: 'category' });
  // Never auto-run: the refined plan lands as chips, unrun, exactly like a
  // fresh draft — the same property insights-ai-search.spec.ts asserts.
  expect(executeCalls).toBe(0);
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeVisible();
});

// Same structural distinction insights-ai-search.spec.ts asserts for the
// search box: 422 is the feature declining (plain text, no box), 503 is
// something actually broken (boxed) — never conflated.
test('a follow-up 422 reads as the feature declining, not an error box', async ({ page }) => {
  await registerAndPickProfile(page, `e2e-followup-422-${Date.now()}@example.com`);
  await stubInsightsApi(page, { interpret: true, model: 'qwen3:4b' });
  await page.route('**/api/insights/interpret', (route) =>
    route.fulfill({
      status: 422,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        type: '/errors/interpret-failed',
        title: 'Could not interpret that',
        status: 422,
        detail: 'The model could not produce a usable plan.',
        problems: ['no usable plan after one retry'],
      }),
    }),
  );

  await page.goto('/insights');
  await page.getByLabel('Follow-up question').fill('asdkjhasdkjh nonsense');
  await page.getByRole('button', { name: 'refine' }).click();

  await expect(
    page.getByText("Couldn't refine this one — try rephrasing, or edit the chips directly."),
  ).toBeVisible();
  await expect(page.locator('.error-box')).toHaveCount(0);
});

test('a follow-up 503 reads as something actually broken, in the boxed treatment', async ({
  page,
}) => {
  await registerAndPickProfile(page, `e2e-followup-503-${Date.now()}@example.com`);
  await stubInsightsApi(page, { interpret: true, model: 'qwen3:4b' });
  await page.route('**/api/insights/interpret', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        type: '/errors/analytics-unavailable',
        title: 'Analytics service unavailable',
        status: 503,
        detail: 'The analytics service is not reachable.',
      }),
    }),
  );

  await page.goto('/insights');
  await page.getByLabel('Follow-up question').fill('and only this year?');
  await page.getByRole('button', { name: 'refine' }).click();

  const box = page.locator('.error-box');
  await expect(box).toHaveCount(1);
  await expect(box).toContainText(
    "Analytics is offline right now — the analytics service isn't running.",
  );
});

// Task 12's fix (`if (interpret.isPending) return;`) had no regression test of
// its own — closed here, for both AI inputs on this screen, since both use the
// same useInterpret() mutation and the same shape of bug is possible in either.
test('the follow-up input never double-submits on Enter or Enter-then-click', async ({ page }) => {
  await registerAndPickProfile(page, `e2e-followup-doubleenter-${Date.now()}@example.com`);
  await stubInsightsApi(page, { interpret: true, model: 'qwen3:4b' });

  let calls = 0;
  await page.route('**/api/insights/interpret', async (route) => {
    calls += 1;
    // Hold the request open so "refining…" is still on screen when the second
    // Enter (or the click) arrives — otherwise the race the fix guards against
    // never actually happens within the test.
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ json: { plan: ENVELOPE.plan, notes: [] } });
  });

  await page.goto('/insights');
  const input = page.getByLabel('Follow-up question');

  // Rapid double-Enter.
  await input.fill('and only this year?');
  await input.press('Enter');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: 'refining…' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'refine' })).toBeVisible({ timeout: 5000 });
  expect(calls).toBe(1);

  // Enter, then a click while still pending.
  calls = 0;
  await input.fill('and by merchant?');
  await input.press('Enter');
  await expect(page.getByRole('button', { name: 'refining…' })).toBeVisible();
  await page.getByRole('button', { name: 'refining…' }).click({ force: true });
  await expect(page.getByRole('button', { name: 'refine' })).toBeVisible({ timeout: 5000 });
  expect(calls).toBe(1);
});

test('the caption describes the chart on screen, not an edited plan', async ({ page }) => {
  // A chip edit does not clear the rendered envelope, so the chart keeps showing
  // the last Run. If the caption were anchored to the live chip plan, pressing
  // explain after an edit would render a true, grounded sentence about data the
  // reader cannot see — the one thing the grounding chain exists to prevent,
  // reintroduced at the last step.
  await registerAndPickProfile(page, `e2e-caption-plan-${Date.now()}@example.com`);
  await stubInsightsApi(page, { interpret: true, model: 'qwen3:4b' });
  const narrated: { interval: string }[] = [];
  await page.route('**/api/insights/narrate', (route) => {
    narrated.push(route.request().postDataJSON());
    return route.fulfill({ json: { caption: CAPTION } });
  });

  await page.goto('/insights');
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  // Edit a chip *after* running: the chart still shows the executed plan.
  await page.getByLabel('Interval').selectOption('year');
  await page.getByRole('button', { name: 'Explain this chart' }).click();
  await expect(page.getByText(CAPTION)).toBeVisible();

  // The narrate call must carry the plan that was executed, not the edited one.
  expect(narrated).toHaveLength(1);
  expect(narrated[0].interval).toBe('month');
});
