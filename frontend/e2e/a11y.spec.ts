import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { apiPost, currentMonthBounds, isoToday, PASSWORD } from './support';

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

/** A category, a transaction against it, a budget and a subscription — enough
 * for every screen scanned below to render real rows/cards instead of an
 * empty state, including /subscriptions (Subscriptions.tsx renders its
 * empty-state paragraph whenever list.length === 0, same as the other
 * screens' empty branches). */
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
  await apiPost(page, '/api/subscriptions', {
    name: 'Netflix',
    categoryId: category.id,
    amount: '9.99',
    currency: 'PLN',
    billingPeriod: 'MONTHLY',
    nextBillingOn: isoToday(),
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

  await page.goto('/subscriptions');
  await expect(page.locator('tbody tr', { hasText: 'Netflix' })).toBeVisible();
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
//
// Known blind spot, confirmed while proving this guard can fail: BudgetForm's
// amount field pairs a <label htmlFor> with a placeholder and NO aria-label —
// emptying that <label> did not trip axe (verified directly), because
// accessible-name computation falls back to the placeholder and still finds a
// non-empty name, so the "label" rule stays silent. TxnModal's amount/
// description/merchant fields normally sit one layer safer (each also carries
// an explicit aria-label, which wins over both the <label> and the
// placeholder) — but emptying BOTH the <label> text and the aria-label
// together on TxnModal's merchant field reproduced the identical silent pass
// (also verified directly: placeholder="e.g. Lidl" rescued it). So the scan
// catches structural and style problems (proven below: a dark-on-dark title
// color trips color-contrast) but is blind to a missing/wrong accessible name
// on any placeholder-bearing field, whenever every labelling layer above the
// placeholder is broken at once. The getByLabelText assertions in
// BudgetForm.test.tsx / Transactions.test.tsx remain the only guard for that.

test('no WCAG A/AA violations with the Add Transaction dialog (TxnModal) open', async ({
  page,
}) => {
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
