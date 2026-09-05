import { test, expect, type Page } from '@playwright/test';

// Merchant entry and backfill against the REAL backend (Spring Boot on :8080, proxied by the Vite
// dev server), same shape as smoke.spec.ts: every test registers its own user, so runs repeat.

const PASSWORD = 'sturdy-password-1'; // the API requires >= 12 chars

async function registerAndLogin(page: Page, email: string, displayName: string) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/auth/);
  await page.getByRole('link', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/picker/);
}

async function createProfileAndCategory(page: Page, profileName: string, categoryName: string) {
  await page.getByRole('button', { name: 'New profile' }).click();
  await page.getByLabel('Profile name').fill(profileName);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.getByRole('button', { name: new RegExp(profileName) }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('link', { name: 'Categories', exact: true }).click();
  await page.getByLabel('Category name').fill(categoryName);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('link', { name: categoryName, exact: true })).toBeVisible();
}

/** The merchant of every transaction in the active profile, oldest page first. */
async function merchants(page: Page): Promise<Array<string | null>> {
  return page.evaluate(async () => {
    const body: { content: Array<{ merchant: string | null }> } = await (
      await fetch('/api/transactions', { credentials: 'include' })
    ).json();
    return body.content.map((t) => t.merchant);
  });
}

test('the transaction modal saves a merchant', async ({ page }) => {
  await registerAndLogin(page, `e2e-merchant-${Date.now()}@example.com`, 'E2E Merchant');
  await createProfileAndCategory(page, 'Personal', 'Groceries');

  await page.getByRole('button', { name: 'Add transaction' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('34.99');
  await page.getByLabel('Description').fill('weekly shop');
  await page.getByLabel('Merchant').fill('Lidl');
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.getByRole('button', { name: 'Save transaction' })).toBeHidden();

  expect(await merchants(page)).toEqual(['Lidl']);
});
