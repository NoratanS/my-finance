import { test, expect, type Page } from '@playwright/test';
import { createProfileAndCategory, monthKey, monthStart, registerAndLogin } from './support';

// The Phase 4b acceptance run (MY-33 stage gate): the canonical "Lidl vs
// Biedronka, monthly" plan (docs/INSIGHTS.md "Template gallery" #5), seeded
// through the real Add Transaction dialog — browser -> backend -> Postgres,
// same as merchant.spec.ts — then executed both through the explorer's
// template and directly via POST /api/insights/execute, asserting the exact
// timeseriesSplit the executor is contracted to return: the right series, the
// right per-bucket decimal strings, and the ranking order (docs/INSIGHTS.md
// "Result shapes"). Against the REAL backend (Spring Boot on :8080, proxied
// by the Vite dev server), same shape as smoke.spec.ts.

const SHOTS = `${process.env.HOME}/fe-shots`; // the path smoke.spec.ts already writes to

/** Only one category exists in this profile, so the modal's own default picks it. */
async function addTransaction(
  page: Page,
  { amount, date, merchant }: { amount: string; date: string; merchant: string },
) {
  await page.getByRole('button', { name: 'Add transaction' }).click();
  await page.getByLabel('Amount', { exact: true }).fill(amount);
  await page.getByLabel('Date', { exact: true }).fill(date);
  await page.getByLabel('Merchant').fill(merchant);
  await page.getByRole('button', { name: 'Save transaction' }).click();
  await expect(page.getByRole('button', { name: 'Save transaction' })).toBeHidden();
}

const toScale4 = (amount: string) => Number(amount).toFixed(4);

/** POST /api/insights/execute with the browser's own session + CSRF cookie —
 * the exact path the explorer's Run button uses. */
async function executePlan(page: Page, plan: unknown) {
  return page.evaluate(async (plan) => {
    const xsrf = document.cookie
      .split('; ')
      .find((c) => c.startsWith('XSRF-TOKEN='))!
      .split('=')[1];
    const res = await fetch('/api/insights/execute', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': decodeURIComponent(xsrf) },
      body: JSON.stringify(plan),
    });
    if (!res.ok) throw new Error(`execute failed: ${res.status} ${await res.text()}`);
    return res.json();
  }, plan);
}

test('insights: the merchant comparison template returns a correct timeseriesSplit end to end', async ({
  page,
}) => {
  const email = `e2e-merchant-cmp-${Date.now()}@example.com`;
  await registerAndLogin(page, email, 'E2E Merchant Cmp');
  await createProfileAndCategory(page, 'Personal', 'Groceries');

  // Three months, one Lidl + one Biedronka transaction each, distinct amounts
  // so the executor's ranking (absolute total descending) is provable rather
  // than coincidental: Lidl totals 450.00, Biedronka totals 180.00 — if the
  // executor ranked alphabetically instead, Biedronka would sort first.
  const seed = [
    { monthsAgo: 2, lidl: '100.00', biedronka: '50.00' },
    { monthsAgo: 1, lidl: '150.00', biedronka: '60.00' },
    { monthsAgo: 0, lidl: '200.00', biedronka: '70.00' },
  ];
  for (const { monthsAgo, lidl, biedronka } of seed) {
    const date = monthStart(monthsAgo);
    await addTransaction(page, { amount: lidl, date, merchant: 'Lidl' });
    await addTransaction(page, { amount: biedronka, date, merchant: 'Biedronka' });
  }
  // A seventh, merchantless transaction: proves two things at once —
  // "Unspecified" is unreachable by any `filters.merchants` value (the
  // filtered plan below must still return exactly 2 series, not 3), and
  // clearing the chip later genuinely re-executes rather than showing stale
  // content (only the unfiltered run's table can contain "Unspecified").
  await addTransaction(page, { amount: '10.00', date: monthStart(0), merchant: '' });

  // — open the template, confirm the pre-filled chips (Task 8's carried note:
  // the merchant chip commits on blur; the template sets filters.merchants
  // directly, so there is nothing to blur here) —
  await page.getByRole('link', { name: 'Insights', exact: true }).click();
  await page
    .getByRole('button', { name: 'Two merchants compared, monthly — last 12 months' })
    .click();
  await expect(page.getByLabel('Merchant filter')).toHaveValue('Lidl, Biedronka');
  await expect(page.getByLabel('Group by')).toHaveValue('merchant');

  // exact: true — "Run" without it also matches the "Monthly spending in a
  // category" template button, whose blurb contains the word "run".
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  const resultCard = page
    .locator('.blueprint')
    .filter({ has: page.locator('.seg') })
    .first();
  await expect(resultCard.locator('.recharts-wrapper')).toBeVisible();

  // Table view is the one renderer that can't lose a digit (docs/INSIGHTS.md
  // "Result shapes") — spot-check both series' labels and one known figure.
  await page.getByRole('button', { name: 'table', exact: true }).click();
  await expect(resultCard).toContainText('Lidl');
  await expect(resultCard).toContainText('Biedronka');
  await expect(resultCard).toContainText('200,00'); // Lidl, current month
  await expect(resultCard).toContainText('70,00'); // Biedronka, current month
  await page.getByRole('button', { name: 'chart', exact: true }).click();
  await page.screenshot({ path: `${SHOTS}/06-insights-merchants.png`, fullPage: true });

  // — clear the merchants chip: the split broadens to every merchant present
  // in the profile, including "Unspecified" for the merchantless row — a
  // string that cannot appear from stale content, since the filtered result
  // never contains it, so this also proves the re-run is not just showing
  // the previous screen (Insights.tsx deliberately keeps the last result on
  // screen while a new run is pending) —
  await page.getByLabel('Merchant filter').fill('');
  await page.getByLabel('Merchant filter').blur();
  await expect(page.getByLabel('Merchant filter')).toHaveValue('');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await page.getByRole('button', { name: 'table', exact: true }).click();
  await expect(resultCard).toContainText('Lidl');
  await expect(resultCard).toContainText('Biedronka');
  await expect(resultCard).toContainText('Unspecified');

  // — the full path, asserted precisely: browser -> backend proxy -> Python
  // executor -> Postgres, via the exact endpoint the Run button just used.
  // Includes `filters.categoryId` too — the flagship plan composes the
  // category-subtree filter with `merchants` and `groupBy: merchant` in one
  // query, which is the SQL path this stage gate exists to prove. —
  const categoryId: number = await page.evaluate(async () => {
    const cats: Array<{ id: number; name: string }> = await (
      await fetch('/api/categories', { credentials: 'include' })
    ).json();
    return cats.find((c) => c.name === 'Groceries')!.id;
  });
  const plan = {
    version: 1,
    metric: 'spend',
    filters: {
      categoryId,
      includeDescendants: true,
      currency: 'PLN',
      merchants: ['Lidl', 'Biedronka'],
    },
    groupBy: 'merchant',
    interval: 'month',
    range: { type: 'lastMonths', n: 12 },
  };
  const envelope = await executePlan(page, plan);
  expect(envelope.meta.truncatedGroups).toBe(false);
  expect(envelope.results).toHaveLength(1);
  const result = envelope.results[0];
  expect(result.currency).toBe('PLN');
  expect(result.shape).toBe('timeseriesSplit');
  // Exactly 2 series, not 3: the merchantless row exists (seeded above) but
  // is unreachable by any `filters.merchants` value — "Unspecified" is a
  // display label, never a filter (docs/INSIGHTS.md, carried from Task 8).
  expect(result.series).toHaveLength(2);

  // Ordering: absolute total descending (450.00 > 180.00), key as tiebreaker
  // (executor.py `_rank_and_cap`) — proven by amount choice, not alphabetical
  // order, since 'Biedronka' < 'Lidl' would win a tie-break.
  expect(result.series[0].key).toBe('Lidl');
  expect(result.series[0].label).toBe('Lidl');
  expect(result.series[1].key).toBe('Biedronka');
  expect(result.series[1].label).toBe('Biedronka');

  // Gap-free periods ending in the current month, exactly 12 points per series.
  const expectedPeriods = Array.from({ length: 12 }, (_, i) => monthKey(11 - i));
  for (const series of result.series as { points: { period: string }[] }[]) {
    expect(series.points.map((p) => p.period)).toEqual(expectedPeriods);
  }

  // Exact decimal-string values (scale 4): the seeded amount in the seeded
  // month, "0.0000" everywhere else — never a float.
  const byPeriod = (series: { points: { period: string; value: string }[] }) =>
    Object.fromEntries(series.points.map((p) => [p.period, p.value])) as Record<string, string>;
  const lidlByPeriod = byPeriod(result.series[0]);
  const biedronkaByPeriod = byPeriod(result.series[1]);
  for (const period of expectedPeriods) {
    const known = seed.find((s) => monthKey(s.monthsAgo) === period);
    expect(lidlByPeriod[period]).toBe(known ? toScale4(known.lidl) : '0.0000');
    expect(biedronkaByPeriod[period]).toBe(known ? toScale4(known.biedronka) : '0.0000');
  }

  // — dropping `filters.merchants` broadens the split to every merchant in
  // the profile, "Unspecified" included, still ranked by absolute total
  // descending (450.00 > 180.00 > 10.00) —
  const filtersWithoutMerchants = { ...plan.filters };
  delete filtersWithoutMerchants.merchants;
  const unfilteredEnvelope = await executePlan(page, { ...plan, filters: filtersWithoutMerchants });
  const unfilteredSeries = unfilteredEnvelope.results[0].series as { key: string; label: string }[];
  expect(unfilteredSeries.map((s) => s.label)).toEqual(['Lidl', 'Biedronka', 'Unspecified']);
});
