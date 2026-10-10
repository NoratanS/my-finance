import { test, expect, type Page } from '@playwright/test';
import { apiGet, apiPost, emptyInstanceAndCreateProfileWithCategory } from './support';

// Merchant entry and backfill against the REAL backend (Spring Boot on :8080, proxied by the Vite
// dev server), same shape as smoke.spec.ts: every test starts on an instance with no profiles, so runs repeat.

/** The merchant of every transaction in the active profile, oldest page first. */
async function merchants(page: Page): Promise<Array<string | null>> {
  const body = await apiGet<{ content: Array<{ merchant: string | null }> }>(
    page,
    '/api/transactions',
  );
  return body.content.map((t) => t.merchant);
}

test('the transaction modal saves a merchant', async ({ page }) => {
  await emptyInstanceAndCreateProfileWithCategory(page, 'Personal', 'Groceries');

  await page.getByRole('button', { name: 'Add transaction' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('34.99');
  await page.getByLabel('Description').fill('weekly shop');
  await page.getByLabel('Merchant').fill('Lidl');
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.getByRole('button', { name: 'Save transaction' })).toBeHidden();

  expect(await merchants(page)).toEqual(['Lidl']);
});

test('the backfill suggester labels repeated descriptions', async ({ page }) => {
  await emptyInstanceAndCreateProfileWithCategory(page, 'Personal', 'Groceries');

  // Three transactions sharing a description and no merchant — the suggester's raw material.
  const cats = await apiGet<Array<{ id: number; name: string }>>(page, '/api/categories');
  const groceries = cats.find((c) => c.name === 'Groceries')!;
  for (const amount of ['12.00', '18.50', '9.90']) {
    await apiPost(page, '/api/transactions', {
      categoryId: groceries.id,
      amount,
      currency: 'PLN',
      type: 'EXPENSE',
      occurredOn: new Date().toISOString().slice(0, 10),
      description: 'Biedronka',
    });
  }

  await page.getByRole('link', { name: 'Transactions', exact: true }).click();
  const card = page.locator('.blueprint', { hasText: 'Set merchants from descriptions' });
  await expect(card).toContainText('Biedronka');
  await expect(card).toContainText('3 transactions');

  await card.getByRole('button', { name: 'Apply' }).first().click();
  // Nothing left to suggest, so the card takes itself off the screen.
  await expect(card).toBeHidden();

  expect(await merchants(page)).toEqual(['Biedronka', 'Biedronka', 'Biedronka']);
});
