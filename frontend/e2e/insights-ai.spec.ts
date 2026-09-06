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

async function stubCapabilities(page: Page, body: { interpret: boolean; model: string | null }) {
  await page.route('**/api/insights/capabilities', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  );
}

test('the insights header names the model when interpretation is available', async ({ page }) => {
  await registerAndPickProfile(page, `e2e-ai-on-${Date.now()}@example.com`);
  await stubCapabilities(page, { interpret: true, model: 'qwen3:4b' });

  await page.goto('/insights');

  await expect(page.getByText('AI · qwen3:4b')).toBeVisible();
});

test('with the AI layer off the explorer still works and shows no AI badge', async ({ page }) => {
  await registerAndPickProfile(page, `e2e-ai-off-${Date.now()}@example.com`);
  await stubCapabilities(page, { interpret: false, model: null });

  await page.goto('/insights');

  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible();
  await expect(page.getByText(/^AI · /)).toHaveCount(0);
});
