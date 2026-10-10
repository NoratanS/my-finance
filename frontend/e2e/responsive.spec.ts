import { expect, test, type Page } from '@playwright/test';
import {
  apiPost,
  emptyInstanceAndCreateFirstProfile,
  currentMonthBounds,
  isoToday,
} from './support';

async function emptyInstanceOpenAProfileAndGo(page: Page, path: string) {
  await emptyInstanceAndCreateFirstProfile(page, 'Household');
  await page.goto(path);
}

/** A category, a transaction against it, and a budget — enough for Budgets
 * and Categories to render their card grids (not just an empty-state
 * message) and for Transactions to render real table rows. */
async function seedData(page: Page) {
  const category = await apiPost<{ id: number }>(page, '/api/categories', {
    name: 'Groceries',
  });
  await apiPost(page, '/api/transactions', {
    categoryId: category.id,
    amount: '34.99',
    currency: 'PLN',
    type: 'EXPENSE',
    occurredOn: isoToday(),
    description: 'Biedronka',
  });
  const { from, to } = currentMonthBounds();
  await apiPost(page, '/api/budgets', {
    categoryId: category.id,
    amountLimit: '600.00',
    currency: 'PLN',
    periodStart: from,
    periodEnd: to,
  });
}

// apiPost throws on a non-2xx, but nothing upstream of it checks the seeded
// records actually render — a date-format drift or a filter default change
// (e.g. Budgets.tsx's "active" window no longer matching
// currentMonthBounds()) could leave seeding a 201-success no-op in the UI,
// and the scan below would then find nothing to overflow and pass
// vacuously. Fail loudly here instead, before the scan runs.
async function verifySeeded(page: Page) {
  await page.goto('/categories');
  await expect(page.getByRole('link', { name: 'Groceries', exact: true })).toBeVisible();

  await page.goto('/budgets');
  const budgetCard = page.locator('.blueprint', { hasText: 'Groceries' }).first();
  await expect(budgetCard).toContainText('% used');

  await page.goto('/transactions');
  await expect(page.locator('tbody tr', { hasText: 'Biedronka' })).toBeVisible();
}

const SCREENS = ['/', '/transactions', '/budgets', '/categories', '/subscriptions', '/insights'];
const WIDTHS = [390, 820];

test('no horizontal overflow on any screen at phone or tablet width', async ({ page }) => {
  const offenders: string[] = [];

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of SCREENS) {
      if (path === SCREENS[0] && width === WIDTHS[0]) {
        await emptyInstanceOpenAProfileAndGo(page, path);
        await seedData(page);
        await verifySeeded(page);
        await page.goto(path);
      } else {
        await page.goto(path);
      }
      // Nav renders once the profile list resolves; wait for it so the
      // overflow measurement below isn't racing the initial render.
      await page.locator('nav.nav').waitFor();
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      if (scrollWidth > innerWidth + 1) {
        offenders.push(
          `${path} @ ${width}px: scrollWidth=${scrollWidth} > innerWidth=${innerWidth}`,
        );
      }
    }
  }

  expect(offenders, `screens with horizontal overflow`).toEqual([]);
});
