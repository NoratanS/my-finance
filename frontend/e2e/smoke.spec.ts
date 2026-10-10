import { test, expect, type Page } from '@playwright/test';
import {
  apiGet,
  apiPost,
  emptyInstanceAndCreateFirstProfile,
  currentMonthBounds,
  isoToday,
  monthStart,
} from './support';

// End-to-end smoke against the REAL backend (Spring Boot on :8080, proxied by
// the Vite dev server). Each test starts on an instance with no profiles
// (support.ts) and creates its own, so runs are independent and repeatable.

// /root/fe-shots assumes a root-run sandbox; this host runs Playwright as an
// unprivileged user with no access to /root, so the shots dir lives under
// $HOME instead. Substance of the tests is unchanged — this is an artifact
// path only.
const SHOTS = `${process.env.HOME}/fe-shots`;

/** From the picker: another profile beside the first one. */
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

test('happy path: first profile -> category -> transaction -> budget -> subscription', async ({
  page,
}) => {
  // — first run: an instance with no profiles asks for the first one and opens it —
  await emptyInstanceAndCreateFirstProfile(page, 'Personal');
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
  await expect(page.locator('.blueprint', { hasText: 'Spent this month' }).first()).toContainText(
    '34,99',
  );
  await expect(page.getByText('Biedronka')).toBeVisible();

  // …and on the transactions screen (category path, expense tag, amount).
  await page.getByRole('link', { name: 'Transactions', exact: true }).click();
  const row = page.locator('tbody tr', { hasText: 'Biedronka' });
  await expect(row).toContainText('Groceries › Supermarket');
  await expect(row).toContainText('34,99');
  await expect(row.getByText('expense')).toBeVisible();

  // — budget: not creatable in the UI (by design) — seed via the API, naming
  //   the active profile as the app does, then look at the Budgets screen.
  const { from, to } = currentMonthBounds();
  const groceries = (
    await apiGet<Array<{ id: number; name: string }>>(page, '/api/categories')
  ).find((c) => c.name === 'Groceries')!;
  await apiPost(page, '/api/budgets', {
    categoryId: groceries.id,
    amountLimit: '600.00',
    currency: 'PLN',
    periodStart: from,
    periodEnd: to,
  });
  await page.goto('/budgets');
  const budgetCard = page.locator('.blueprint', { hasText: 'Groceries' }).first();
  await expect(budgetCard).toContainText('% used');
  await expect(budgetCard).toContainText('600,00');
  await expect(budgetCard).toContainText('34,99'); // subtree spend counts the Supermarket txn

  // Dashboard budget snapshot uses the same data.
  await page.goto('/');
  await expect(page.locator('.blueprint', { hasText: 'Budgets' }).first()).toContainText('600,00');
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
  await expect(page.locator('.blueprint', { hasText: 'Upcoming renewals' }).first()).toContainText(
    'Spotify',
  );

  // — a second, YEARLY subscription: the tile must show the SUMMED normalized
  //   monthly equivalent (23,99 + 120/12 = 33,99), not just segment presence.
  await page.getByLabel('Service name').fill('Backup Cloud');
  await page.getByLabel('Price', { exact: true }).fill('120');
  await page.getByLabel('Next charge date').fill(isoToday(20));
  await page.getByRole('button', { name: 'yearly' }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const yearlyRow = page.locator('tbody tr', { hasText: 'Backup Cloud' });
  await expect(yearlyRow).toContainText('yearly');
  await expect(yearlyRow).toContainText('10,00'); // 120 / 12, server-normalized
  await expect(tile).toContainText('33,99'); // 23,99 (monthly) + 10,00 (yearly/12)
  await page.screenshot({ path: `${SHOTS}/03-subscriptions.png`, fullPage: true });

  // — pause via the status control (PUT with status) —
  await page.getByRole('button', { name: 'Pause Spotify' }).click();
  await expect(subRow.getByText('paused')).toBeVisible();
  await expect(tile).not.toContainText('33,99'); // paused subs leave the totals…
  await expect(tile).toContainText('10,00'); // …but the yearly one stays
});

test('profile isolation: data does not leak across profiles', async ({ page }) => {
  await emptyInstanceAndCreateFirstProfile(page, 'Personal');
  // The second profile is made from the picker; creating it there does not switch to it.
  await page.getByLabel('Active profile').selectOption({ label: 'Switch profile…' });
  await expect(page).toHaveURL(/\/picker/);
  await createProfile(page, 'Work');
  await page.getByRole('button', { name: /Personal/ }).click();
  await expect(page).toHaveURL('/');

  await page.getByRole('link', { name: 'Categories', exact: true }).click();
  await addCategory(page, 'Food');
  await page.getByRole('button', { name: 'Add transaction' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('12.50');
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.getByRole('button', { name: 'Save transaction' })).toBeHidden();

  // Switch to Work through the picker ("Switch profile…" leaves the active
  // profile as it is — picking changes it).
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
  await expect(page.locator('.blueprint', { hasText: 'Spent this month' }).first()).toContainText(
    '12,50',
  );
});

test('backup roundtrip: export a profile, restore it, "(restored)" card appears', async ({
  page,
}) => {
  await emptyInstanceAndCreateFirstProfile(page, 'Personal');

  // Seed a category + transaction so the restore summary has real counts.
  await page.getByRole('link', { name: 'Categories', exact: true }).click();
  await addCategory(page, 'Groceries');
  await page.getByRole('button', { name: 'Add transaction' }).click();
  await page.getByLabel('Amount', { exact: true }).fill('34.99');
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.getByRole('button', { name: 'Save transaction' })).toBeHidden();

  // Backup controls live on the profile picker.
  await page.getByLabel('Active profile').selectOption({ label: 'Switch profile…' });
  await expect(page).toHaveURL(/\/picker/);

  // Export: the multi-select is revealed with every profile checked.
  await page.getByRole('button', { name: 'Download backup' }).click();
  await expect(page.getByRole('checkbox', { name: 'Personal' })).toBeChecked();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^my-finance-backup-.+\.json$/);
  const backupPath = await download.path();

  // Restore the same file — always creates a NEW profile: "Personal (restored)".
  await page.getByLabel('Backup file').setInputFiles(backupPath);
  await expect(page.getByText('Backup restored')).toBeVisible();
  await expect(
    page.getByText(/1 categories, 1 transactions, 0 budgets, 0 subscriptions/),
  ).toBeVisible();
  // The restored profile shows up as a picker card without a reload.
  await expect(page.getByRole('button', { name: /Personal \(restored\)/ })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/05-backup-restore.png`, fullPage: true });
});

test('category name collision shows the 409 in the form error box', async ({ page }) => {
  await emptyInstanceAndCreateFirstProfile(page, 'Personal');

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

test('insights: chips build a plan, it charts, saves, pins, and lands on the dashboard', async ({
  page,
}) => {
  await emptyInstanceAndCreateFirstProfile(page, 'Personal');

  await page.getByRole('link', { name: 'Categories', exact: true }).click();
  await addCategory(page, 'Groceries', 'Mint');

  // Three months of expenses, seeded through the API — the chart needs dated
  // rows the UI would be slow to enter one at a time.
  // Offsets chosen so all three rows land inside "last 3 months" whatever the
  // day of the month is when the suite runs.
  const dates = [isoToday(0), isoToday(-20), isoToday(-35)];
  const groceries = (
    await apiGet<Array<{ id: number; name: string }>>(page, '/api/categories')
  ).find((c) => c.name === 'Groceries')!;
  for (const date of dates) {
    await apiPost(page, '/api/transactions', {
      categoryId: groceries.id,
      amount: '120.00',
      currency: 'PLN',
      type: 'EXPENSE',
      occurredOn: date,
      description: 'Seeded for insights',
    });
  }

  // — build the plan with the chips: monthly spend, no grouping, last 3 months —
  await page.getByRole('link', { name: 'Insights', exact: true }).click();
  await page.getByLabel('Metric').selectOption('spend');
  await page.getByLabel('Group by').selectOption('none');
  await page.getByLabel('Interval').selectOption('month');
  await page.getByLabel('Range').selectOption('lastMonths-3');
  await page.getByLabel('Currency').selectOption('PLN');
  // The plan is linkable: the chips wrote it into the URL.
  await expect(page).toHaveURL(/plan=/);
  await expect(
    page.getByText('spend · all categories · per month · last 3 months · PLN'),
  ).toBeVisible();

  // exact: true — "Run" without it also matches the "Monthly spending in a
  // category" template button, whose blurb contains the word "run".
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  // — the chart renders (Recharts mounts .recharts-wrapper) —
  // Scoped by the chart/table segmented control rather than by "PLN": the plan
  // card's currency chip contains that text too.
  const resultCard = page
    .locator('.blueprint')
    .filter({ has: page.locator('.seg') })
    .first();
  await expect(resultCard.locator('.recharts-wrapper')).toBeVisible();

  // — the same result as a table, in pl-PL formatting —
  await page.getByRole('button', { name: 'table', exact: true }).click();
  await expect(resultCard).toContainText('120,00');
  await page.getByRole('button', { name: 'chart', exact: true }).click();

  // — save, then pin —
  await page.getByLabel('Insight name').fill('Groceries, monthly');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/insight=\d+/);
  await page.getByRole('button', { name: 'Pin Groceries, monthly' }).click();
  await expect(page.getByRole('button', { name: 'Unpin Groceries, monthly' })).toBeVisible();

  // — the pinned tile executes on the dashboard, with no extra click —
  await page.getByRole('link', { name: 'Dashboard', exact: true }).click();
  const tile = page.locator('.blueprint', { hasText: 'Groceries, monthly' }).first();
  await expect(tile).toBeVisible();
  await expect(tile.locator('.recharts-wrapper')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/06-insights.png`, fullPage: true });
});

test('insights: a pinned forecast tile draws a dashed projection and marks the outlier', async ({
  page,
}) => {
  await emptyInstanceAndCreateFirstProfile(page, 'Forecast');

  const category = await apiPost<{ id: number }>(page, '/api/categories', { name: 'Groceries' });

  // One expense per month for twelve months. The value multiset
  // {90, 95, 95, 100, 100, 105, 105, 110, 110, 115, 120, 900} has median 105 and
  // MAD 7.5, so only the 900 clears |z| > 3.5.
  const amounts = [
    '100.00',
    '110.00',
    '105.00',
    '95.00',
    '100.00',
    '120.00',
    '900.00',
    '115.00',
    '90.00',
    '105.00',
    '110.00',
    '95.00',
  ];
  for (let i = 0; i < amounts.length; i++) {
    await apiPost(page, '/api/transactions', {
      categoryId: category.id,
      amount: amounts[i],
      currency: 'PLN',
      type: 'EXPENSE',
      occurredOn: monthStart(amounts.length - 1 - i),
      description: 'monthly shop',
    });
  }

  await apiPost(page, '/api/insights', {
    name: 'Monthly groceries, forecast',
    pinned: true,
    plan: {
      version: 2,
      metric: 'spend',
      filters: { currency: 'PLN' },
      groupBy: null,
      interval: 'month',
      range: { type: 'lastMonths', n: 12 },
      forecast: { months: 3 },
    },
  });

  await page.goto('/');
  // The dashed tail is the only <path> with a dash pattern — the grid draws <line>s.
  await expect(page.locator('path[stroke-dasharray="4 4"]').first()).toBeVisible();
  // The outlier ring.
  await expect(page.locator('circle[stroke="#eeaabc"]').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/06-insights-forecast.png`, fullPage: true });

  // …and the explorer offers the horizon as a chip. `exact: true` — a
  // substring match on "Forecast" also catches the pinned insight's own
  // "Unpin Monthly groceries, forecast" button.
  await page.getByRole('link', { name: 'Insights', exact: true }).click();
  await expect(page.getByLabel('Forecast', { exact: true })).toBeVisible();

  // The chip only turns a plan into v2 once it can actually run: selecting a
  // horizon on a monthly plan bumps `version` to 2 and sets `forecast`...
  await page.getByLabel('Interval').selectOption('month');
  await page.getByLabel('Forecast', { exact: true }).selectOption('3');
  await expect(page).toHaveURL(/plan=/);
  const readPlan = () => {
    const raw = new URL(page.url()).searchParams.get('plan')!;
    return JSON.parse(raw) as { version: number; forecast?: { months: number } };
  };
  await expect.poll(() => readPlan().version).toBe(2);
  expect(readPlan().forecast).toEqual({ months: 3 });

  // ...and clearing it (or leaving `month`) drops `forecast` and returns the
  // plan to v1 — a v2 plan without `forecast` would be legal but pointless.
  await page.getByLabel('Forecast', { exact: true }).selectOption('off');
  await expect.poll(() => readPlan().version).toBe(1);
  expect(readPlan().forecast).toBeUndefined();
});

test('insights: a pinned split tile reports the lead change', async ({ page }) => {
  await emptyInstanceAndCreateFirstProfile(page, 'Drift');

  // groupBy "category" splits on the children of the filtered category.
  const shops = await apiPost<{ id: number }>(page, '/api/categories', { name: 'Shops' });
  const lidl = await apiPost<{ id: number }>(page, '/api/categories', {
    name: 'Lidl',
    parentId: shops.id,
  });
  const biedronka = await apiPost<{ id: number }>(page, '/api/categories', {
    name: 'Biedronka',
    parentId: shops.id,
  });

  // Two complete months: Lidl leads two months back, Biedronka leads last month.
  // The current (partial) month is excluded from the comparison, so a run on the
  // 1st reports the same thing as a run on the 28th.
  const seeded: Array<[number, number, string]> = [
    [lidl.id, 2, '500.00'],
    [biedronka.id, 2, '400.00'],
    [lidl.id, 1, '300.00'],
    [biedronka.id, 1, '600.00'],
  ];
  for (const [categoryId, monthsAgo, amount] of seeded) {
    await apiPost(page, '/api/transactions', {
      categoryId,
      amount,
      currency: 'PLN',
      type: 'EXPENSE',
      occurredOn: monthStart(monthsAgo),
      description: 'shop',
    });
  }

  await apiPost(page, '/api/insights', {
    name: 'Lidl vs Biedronka',
    pinned: true,
    plan: {
      version: 1,
      metric: 'spend',
      filters: { categoryId: shops.id, includeDescendants: true, currency: 'PLN' },
      groupBy: 'category',
      interval: 'month',
      range: { type: 'lastMonths', n: 3 },
    },
  });

  await page.goto('/');
  await expect(page.getByText('Biedronka overtook Lidl')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/07-insights-drift.png`, fullPage: true });
});

// G7: a deep link visited with no active profile used to redirect through the
// picker and drop the destination, always landing on the dashboard.

test('deep link: visiting a route with no active profile lands there after picking a profile', async ({
  page,
}) => {
  await emptyInstanceAndCreateFirstProfile(page, 'Personal');

  // A browser that remembers no profile, as on its first visit to an instance
  // that already has one: this deep link goes through the picker.
  await page.evaluate(() => window.localStorage.clear());
  await page.goto('/budgets');
  await expect(page).toHaveURL(/\/picker/);
  await page.getByRole('button', { name: /Personal/ }).click();
  await expect(page).toHaveURL('/budgets');
  await expect(page.getByRole('heading', { name: 'Budgets' })).toBeVisible();
});

// J14: the picker used to be a one-way door with no rename/delete for a
// mis-created profile.

test('profile picker: a profile can be renamed and a mis-created one deleted', async ({ page }) => {
  await emptyInstanceAndCreateFirstProfile(page, 'Personal');
  await page.getByLabel('Active profile').selectOption({ label: 'Switch profile…' });
  await expect(page).toHaveURL(/\/picker/);
  await expect(page.getByRole('heading', { name: 'Choose a profile' })).toBeVisible();
  await createProfile(page, 'Oops');
  await page.screenshot({ path: `${SHOTS}/01-picker.png`, fullPage: true });

  // Rename "Oops" to something real.
  const oopsCard = page.locator('.profile-card', { hasText: 'Oops' });
  await oopsCard.getByRole('button', { name: 'Rename profile' }).click();
  await oopsCard.getByRole('textbox').fill('Renamed');
  await oopsCard.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: /Renamed/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Oops/ })).toHaveCount(0);

  // Delete it — through the confirmation dialog, which wants the name typed.
  const renamedCard = page.locator('.profile-card', { hasText: 'Renamed' });
  await renamedCard.getByRole('button', { name: 'Delete profile' }).click();
  await expect(page.getByRole('dialog')).toContainText('Renamed');
  const confirm = page.getByRole('button', { name: 'Delete', exact: true });
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/to confirm/).fill('Renamed');
  await confirm.click();
  await expect(page.getByRole('button', { name: /Renamed/ })).toHaveCount(0);

  // "Personal" is still there, and picking it works normally.
  await page.getByRole('button', { name: /Personal/ }).click();
  await expect(page).toHaveURL('/');
});
