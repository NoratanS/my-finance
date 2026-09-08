import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const PASSWORD = 'sturdy-password-1';

async function registerPickAndGo(page: Page, path: string) {
  const email = `a11y-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await page.goto('/');
  await page.getByRole('link', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill('A11y User');
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
  // Task 23a: a freshly registered account has no categories, transactions,
  // budgets or subscriptions, so every scan below used to run against an
  // empty screen — never a table row, a category row, or a data-bearing
  // control. Seed before navigating to the target screen so axe actually
  // sees the same markup a real profile renders.
  await seedData(page);
  await verifySeeded(page);
  await page.goto(path);
}

// Copied from responsive.spec.ts (itself copied from smoke.spec.ts's
// "budget-seed trick"): POST JSON with the browser's own session + CSRF
// cookie so Budgets/Categories render their card grids and Transactions
// renders real rows instead of an empty-state branch.
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

// Copied from responsive.spec.ts: computed in UTC to match the compose
// stack's TZ=UTC, so "this month" seeded here is the same month the Budgets
// screen's default "active" filter checks.
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

/** A category, a transaction against it, and a budget — enough for every
 * screen scanned below to render real rows/cards instead of an empty state. */
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

// Copied from responsive.spec.ts: apiPost throws on a non-2xx, but nothing
// upstream of it checks the seeded records actually render — fail loudly
// here, before any scan runs, rather than letting a rendering regression
// scan an accidentally-empty screen and pass vacuously.
async function verifySeeded(page: Page) {
  await page.goto('/categories');
  await expect(page.getByRole('link', { name: 'Groceries', exact: true })).toBeVisible();

  await page.goto('/budgets');
  const budgetCard = page.locator('.blueprint', { hasText: 'Groceries' }).first();
  await expect(budgetCard).toContainText('% used');

  await page.goto('/transactions');
  await expect(page.locator('tbody tr', { hasText: 'Biedronka' })).toBeVisible();
}

async function scan(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  // Print the offenders rather than only a count, so a failure is actionable.
  return results.violations.map((v) => `${v.id} (${v.nodes.length}x): ${v.help}`);
}

const SCREENS = ['/', '/transactions', '/budgets', '/categories', '/subscriptions', '/insights'];

for (const path of SCREENS) {
  test(`no WCAG A/AA violations on ${path}`, async ({ page }) => {
    await registerPickAndGo(page, path);
    const summary = await scan(page);
    expect(summary, `axe violations on ${path}`).toEqual([]);
  });
}

// Task 23a: the gate above scans six routes with no dialog open, so
// ConfirmDialog, BudgetForm and TxnModal have never been checked against
// axe's rule set — only against hand-written ARIA assertions. Open one of
// each inside the seeded app (not an isolated component mount, so portals,
// focus trapping and real CSS are all in play) and scan.

test('no WCAG A/AA violations with the Add Transaction dialog (TxnModal) open', async ({ page }) => {
  await registerPickAndGo(page, '/transactions');
  await page.getByRole('button', { name: 'Add transaction' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const summary = await scan(page);
  expect(summary, 'axe violations with TxnModal open').toEqual([]);
});

test('no WCAG A/AA violations with the delete-transaction confirm dialog (ConfirmDialog) open', async ({
  page,
}) => {
  await registerPickAndGo(page, '/transactions');
  await page.getByRole('button', { name: 'Delete transaction' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const summary = await scan(page);
  expect(summary, 'axe violations with ConfirmDialog open').toEqual([]);
  // Dismiss without deleting the seeded row.
  await page.getByRole('button', { name: 'Cancel' }).click();
});

test('no WCAG A/AA violations with the New Budget dialog (BudgetForm) open', async ({ page }) => {
  await registerPickAndGo(page, '/budgets');
  await page.getByRole('button', { name: 'New budget' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const summary = await scan(page);
  expect(summary, 'axe violations with BudgetForm open').toEqual([]);
});
