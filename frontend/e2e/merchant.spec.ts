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

test('the backfill suggester labels repeated descriptions', async ({ page }) => {
  await registerAndLogin(page, `e2e-backfill-${Date.now()}@example.com`, 'E2E Backfill');
  await createProfileAndCategory(page, 'Personal', 'Groceries');

  // Three transactions sharing a description and no merchant — the suggester's raw material.
  await page.evaluate(async () => {
    const xsrf = document.cookie
      .split('; ')
      .find((c) => c.startsWith('XSRF-TOKEN='))!
      .split('=')[1];
    const cats: Array<{ id: number; name: string }> = await (
      await fetch('/api/categories', { credentials: 'include' })
    ).json();
    const groceries = cats.find((c) => c.name === 'Groceries')!;
    for (const amount of ['12.00', '18.50', '9.90']) {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': decodeURIComponent(xsrf) },
        body: JSON.stringify({
          categoryId: groceries.id,
          amount,
          currency: 'PLN',
          type: 'EXPENSE',
          occurredOn: new Date().toISOString().slice(0, 10),
          description: 'Biedronka',
        }),
      });
      if (!res.ok) throw new Error(`txn seed failed: ${res.status} ${await res.text()}`);
    }
  });

  await page.getByRole('link', { name: 'Transactions', exact: true }).click();
  const card = page.locator('.blueprint', { hasText: 'Set merchants from descriptions' });
  await expect(card).toContainText('Biedronka');
  await expect(card).toContainText('3 transactions');

  await card.getByRole('button', { name: 'Apply' }).first().click();
  // Nothing left to suggest, so the card takes itself off the screen.
  await expect(card).toBeHidden();

  expect(await merchants(page)).toEqual(['Biedronka', 'Biedronka', 'Biedronka']);
});
