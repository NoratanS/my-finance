import { expect, type Page } from '@playwright/test';

// Helpers shared by the end-to-end specs. Not named *.spec.ts, so Playwright
// does not collect it as a test file.

export const PASSWORD = 'sturdy-password-1'; // the API requires >= 12 chars

// Every date here is computed in UTC, never in the runner's local zone. Compose
// defaults the plan executor's TZ to UTC (docker-compose.yml), and the backend
// is UTC in code (config/ClockConfig.java). Using the runner's local date
// instead made the suite fail whenever it ran between local midnight and
// midnight UTC — on a CEST host that is a two-hour window in which a test seeds
// "today" as the 7th while the executor buckets it as the 6th.

/** Today's UTC date as YYYY-MM-DD, shifted by `offsetDays`. */
export function isoToday(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`;
}

/** The current UTC month's first and last day, inclusive. */
export function currentMonthBounds(): { from: string; to: string } {
  const now = new Date();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return {
    from: `${now.getUTCFullYear()}-${mm}-01`,
    to: `${now.getUTCFullYear()}-${mm}-${String(last).padStart(2, '0')}`,
  };
}

/** The month `monthsAgo` back, as YYYY-MM. */
export function monthKey(monthsAgo: number): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** First day of the month `monthsAgo` back — never in the future, so the API accepts it. */
export function monthStart(monthsAgo: number): string {
  return `${monthKey(monthsAgo)}-01`;
}

/** POST JSON with the browser's own session + CSRF cookie (the budget-seed trick). */
export async function apiPost<T>(page: Page, path: string, body: unknown): Promise<T> {
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

/** Registers a fresh account through the UI and lands on the profile picker. */
export async function registerAndLogin(page: Page, email: string, displayName: string) {
  await page.goto('/');
  await expect(page).toHaveURL(/\/auth/);
  await page.getByRole('link', { name: 'Create account' }).click();
  await page.getByLabel('Display name').fill(displayName);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/picker/);
}

/** From the picker: creates and picks a profile, then creates one root category in it. */
export async function createProfileAndCategory(
  page: Page,
  profileName: string,
  categoryName: string,
) {
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
