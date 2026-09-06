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
