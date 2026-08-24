import { test, expect, type Page } from '@playwright/test';

// End-to-end smoke against the REAL backend (Spring Boot on :8080, proxied by
// the Vite dev server). Each test registers its own user so runs are
// independent and repeatable (emails are unique per run).

const PASSWORD = 'sturdy-password-1'; // the API requires >= 12 chars
const SHOTS = '/root/fe-shots';

function isoToday(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function currentMonthBounds(): { from: string; to: string } {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return {
    from: `${now.getFullYear()}-${mm}-01`,
    to: `${now.getFullYear()}-${mm}-${String(last).padStart(2, '0')}`,
  };
}

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

async function createProfile(page: Page, name: string) {
  await page.getByRole('button', { name: 'New profile' }).click();
  await page.getByLabel('Profile name').fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  // Creating does not switch — the new card just appears.
  await expect(page.getByRole('button', { name: new RegExp(name) })).toBeVisible();
}

async function addCategory(page: Page, name: string, swatch?: string) {
  await page.getByLabel('Category name').fill(name);
  if (swatch) await page.getByRole('button', { name: swatch, exact: true }).click();
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('link', { name, exact: true })).toBeVisible();
}

test('happy path: register -> profile -> category -> transaction -> budget -> subscription', async ({
  page,
}) => {
  const email = `e2e-happy-${Date.now()}@example.com`;
  await registerAndLogin(page, email, 'E2E Happy');

  // — profile picker —
  await expect(page.getByRole('heading', { name: 'Choose a profile' })).toBeVisible();
  await createProfile(page, 'Personal');
  await page.screenshot({ path: `${SHOTS}/01-picker.png`, fullPage: true });
  await page.getByRole('button', { name: /Personal/ }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // — categories: root with a color, then a child —
  await page.getByRole('link', { name: 'Categories', exact: true }).click();
  await addCategory(page, 'Groceries', 'Mint');
  await page.getByLabel('Category name').fill('Supermarket');
  await page.getByLabel('Parent category').selectOption({ label: 'Groceries' });
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Supermarket' })).toBeVisible();
  await expect(page.getByText('L2')).toBeVisible();

  // — transaction through the global modal —
  await page.getByRole('button', { name: 'Add transaction' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('34.99');
  // Options are depth-first: [0] Groceries, [1] its child Supermarket
  // (indented with figure spaces, so select by index).
  await page.getByLabel('Category', { exact: true }).selectOption({ index: 1 });
  await page.getByLabel('Description').fill('Biedronka');
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.getByRole('button', { name: 'Save transaction' })).toBeHidden();

  // Visible on the dashboard (KPI + recent list)…
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  await expect(
    page.locator('.blueprint', { hasText: 'Spent this month' }).first(),
  ).toContainText('34,99');
  await expect(page.getByText('Biedronka')).toBeVisible();

  // …and on the transactions screen (category path, expense tag, amount).
  await page.getByRole('link', { name: 'Transactions', exact: true }).click();
  const row = page.locator('tbody tr', { hasText: 'Biedronka' });
  await expect(row).toContainText('Groceries › Supermarket');
  await expect(row).toContainText('34,99');
  await expect(row.getByText('expense')).toBeVisible();

  // — budget: not creatable in the UI (by design) — seed via the API using the
  //   browser's own session + CSRF cookie, then look at the Budgets screen.
  const { from, to } = currentMonthBounds();
  await page.evaluate(
    async ({ from, to }) => {
      const xsrf = document.cookie
        .split('; ')
        .find((c) => c.startsWith('XSRF-TOKEN='))!
        .split('=')[1];
      const cats: Array<{ id: number; name: string }> = await (
        await fetch('/api/categories', { credentials: 'include' })
      ).json();
      const groceries = cats.find((c) => c.name === 'Groceries')!;
      const res = await fetch('/api/budgets', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-XSRF-TOKEN': decodeURIComponent(xsrf),
        },
        body: JSON.stringify({
          categoryId: groceries.id,
          amountLimit: '600.00',
          currency: 'PLN',
          periodStart: from,
          periodEnd: to,
        }),
      });
      if (!res.ok) throw new Error(`budget seed failed: ${res.status} ${await res.text()}`);
    },
    { from, to },
  );
  await page.goto('/budgets');
  const budgetCard = page.locator('.blueprint', { hasText: 'Groceries' }).first();
  await expect(budgetCard).toContainText('% used');
  await expect(budgetCard).toContainText('600,00');
  await expect(budgetCard).toContainText('34,99'); // subtree spend counts the Supermarket txn

  // Dashboard budget snapshot uses the same data.
  await page.goto('/');
  await expect(page.locator('.blueprint', { hasText: 'Budgets' }).first()).toContainText(
    '600,00',
  );
  await page.screenshot({ path: `${SHOTS}/02-dashboard.png`, fullPage: true });

  // — subscription with QUARTERLY cadence (the segment the mockup lacked) —
  await page.getByRole('link', { name: 'Subscriptions', exact: true }).click();
  await page.getByLabel('Service name').fill('Spotify');
  await page.getByLabel('Price', { exact: true }).fill('23.99');
  await page.getByLabel('Next charge date').fill(isoToday(7));
  await page.getByRole('button', { name: 'quarterly' }).click();
  await page.getByRole('button', { name: 'monthly' }).click(); // both segments exist
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const subRow = page.locator('tbody tr', { hasText: 'Spotify' });
  await expect(subRow).toContainText('monthly');
  await expect(subRow.getByText('active')).toBeVisible();

  // The dashboard-endpoint tile shows the server-computed monthly total,
  // and the renewal shows up in "Upcoming renewals".
  const tile = page.locator('.blueprint', { hasText: 'Monthly equivalent' }).first();
  await expect(tile).toContainText('23,99');
  await expect(
    page.locator('.blueprint', { hasText: 'Upcoming renewals' }).first(),
  ).toContainText('Spotify');
  await page.screenshot({ path: `${SHOTS}/03-subscriptions.png`, fullPage: true });

  // — pause via the status control (PUT with status) —
  await page.getByRole('button', { name: 'Pause Spotify' }).click();
  await expect(subRow.getByText('paused')).toBeVisible();
  await expect(tile).not.toContainText('23,99'); // paused subs leave the totals
});

test('profile isolation: data does not leak across profiles', async ({ page }) => {
  const email = `e2e-iso-${Date.now()}@example.com`;
  await registerAndLogin(page, email, 'E2E Iso');
  await createProfile(page, 'Personal');
  await createProfile(page, 'Work');
  await page.getByRole('button', { name: /Personal/ }).click();
  await expect(page).toHaveURL('/');

  await page.getByRole('link', { name: 'Categories', exact: true }).click();
  await addCategory(page, 'Food');
  await page.getByRole('button', { name: 'Add transaction' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('12.50');
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.getByRole('button', { name: 'Save transaction' })).toBeHidden();

  // Switch to Work through the picker ("Switch profile…" does not clear the
  // server-side profile — picking re-scopes).
  await page.getByLabel('Active profile').selectOption({ label: 'Switch profile…' });
  await expect(page).toHaveURL(/\/picker/);
  await page.getByRole('button', { name: /Work/ }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByText('Nothing yet — this profile has no transactions.')).toBeVisible();
  await page.getByRole('link', { name: 'Categories', exact: true }).click();
  await expect(page.getByText('No categories yet')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Food', exact: true })).toHaveCount(0);

  // Switch straight back via the nav select — Personal's data is still there.
  await page.getByLabel('Active profile').selectOption({ label: 'Personal · PLN' });
  await expect(page.getByRole('link', { name: 'Food', exact: true })).toBeVisible();
  await page.goto('/');
  await expect(
    page.locator('.blueprint', { hasText: 'Spent this month' }).first(),
  ).toContainText('12,50');
});

test('category name collision shows the 409 in the form error box', async ({ page }) => {
  const email = `e2e-err-${Date.now()}@example.com`;
  await registerAndLogin(page, email, 'E2E Err');
  await createProfile(page, 'Personal');
  await page.getByRole('button', { name: /Personal/ }).click();

  await page.getByRole('link', { name: 'Categories', exact: true }).click();
  await addCategory(page, 'Food');
  // Same sibling name again -> 409 /errors/category-name-taken inline.
  await page.getByLabel('Category name').fill('Food');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  const errorBox = page.locator('.error-box');
  await expect(errorBox).toBeVisible();
  await expect(errorBox).toContainText('409');
  await expect(errorBox).toContainText('category-name-taken');
  await page.screenshot({ path: `${SHOTS}/04-category-collision.png`, fullPage: true });
});
