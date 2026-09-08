import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'sturdy-password-1';

// Copied from a11y.spec.ts (Task 7): "Create account" is a link (role
// "link", not "button"), and creating a profile does not activate it — the
// new profile card must be clicked explicitly before navigating.
async function registerPickAndGo(page: Page, path: string) {
  const email = `resp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto('/');
  await page.getByRole('link', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill('Responsive User');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/picker/);
  await page.getByRole('button', { name: 'New profile' }).click();
  await page.getByLabel('Profile name').fill('Household');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  // Creating a profile does not switch to it — click the new card to pick it.
  await page.getByRole('button', { name: /Household/ }).click();
  await page.waitForURL('/');
  await page.goto(path);
}

// Copied from smoke.spec.ts's "budget-seed trick": POST JSON with the
// browser's own session + CSRF cookie, reused here so Budgets/Categories
// render their card grids and Transactions renders real rows — an empty
// account never exercises those grids (Budgets.tsx only renders its grid
// when filtered.length > 0), which let a real overflow hide behind a
// "no data yet" branch.
async function apiPost<T>(page: Page, path: string, body: unknown): Promise<T> {
  const result = await page.evaluate(
    async ({ path, body }) => {
      const xsrf = document.cookie
        .split('; ')
        .find((c) => c.startsWith('XSRF-TOKEN='))!
        .split('=')[1];
      const res = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-XSRF-TOKEN': decodeURIComponent(xsrf),
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${path} seed failed: ${res.status} ${await res.text()}`);
      return res.json();
    },
    { path, body },
  );
  return result as T;
}

// Copied from smoke.spec.ts: computed in UTC to match the compose stack's
// TZ=UTC, so "this month" seeded here is the same month the Budgets screen's
// default "active" filter checks.
function currentMonthBounds(): { from: string; to: string } {
  const now = new Date();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return {
    from: `${now.getUTCFullYear()}-${mm}-01`,
    to: `${now.getUTCFullYear()}-${mm}-${String(last).padStart(2, '0')}`,
  };
}

function isoToday(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
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
        await registerPickAndGo(page, path);
        await seedData(page);
        await verifySeeded(page);
        await page.goto(path);
      } else {
        await page.goto(path);
      }
      // Nav renders once the session query resolves; wait for it so the
      // overflow measurement below isn't racing the initial render.
      await page.locator('nav.nav').waitFor();
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      if (scrollWidth > innerWidth + 1) {
        offenders.push(`${path} @ ${width}px: scrollWidth=${scrollWidth} > innerWidth=${innerWidth}`);
      }
    }
  }

  expect(offenders, `screens with horizontal overflow`).toEqual([]);
});
