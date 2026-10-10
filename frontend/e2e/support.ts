import { expect, type APIRequestContext, type Page } from '@playwright/test';

// Helpers shared by the end-to-end specs. Not named *.spec.ts, so Playwright
// does not collect it as a test file.
//
// The suite needs an instance of its own. An instance has profiles and nothing
// above them, and profile names are unique in it, so every test starts by
// deleting the profiles it finds (createFirstProfile) and so begins on the
// first-profile screen, exactly like a fresh install. global-setup.ts refuses to
// start on an instance that already has profiles: those would be somebody's data.

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

/**
 * Every request that changes something must carry the X-Profile-Id header; the endpoints above
 * the profile boundary (the profile list and its changes) never read its value, so it is sent
 * empty, as the app does while no profile is chosen.
 */
const NO_PROFILE = { 'X-Profile-Id': '' };

/** Deletes every profile of the instance, through the API. The suite's own instance only. */
export async function deleteAllProfiles(request: APIRequestContext) {
  const list = await request.get('/api/profiles');
  if (!list.ok()) throw new Error(`GET /api/profiles answered ${list.status()}`);
  for (const profile of (await list.json()) as { id: number }[]) {
    const deleted = await request.delete(`/api/profiles/${profile.id}`, { headers: NO_PROFILE });
    if (!deleted.ok()) {
      throw new Error(`DELETE /api/profiles/${profile.id} answered ${deleted.status()}`);
    }
  }
}

/**
 * A JSON request from the page, naming the profile the app is working in: the app keeps its last
 * choice in localStorage, and a seed request carries it in X-Profile-Id as the app's own do.
 */
async function apiCall<T>(page: Page, method: 'GET' | 'POST', path: string, body?: unknown) {
  const result = await page.evaluate(
    async ({ method, path, body }) => {
      const profileId = window.localStorage.getItem('my-finance:active-profile-id');
      if (profileId === null) throw new Error(`${method} ${path}: the app has no active profile`);
      const headers: Record<string, string> = { 'X-Profile-Id': profileId };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const res = await fetch(path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`);
      return res.json();
    },
    { method, path, body },
  );
  return result as T;
}

/** Reads from the active profile through the API. */
export function apiGet<T>(page: Page, path: string): Promise<T> {
  return apiCall<T>(page, 'GET', path);
}

/** Seeds the active profile through the API. */
export function apiPost<T>(page: Page, path: string, body: unknown): Promise<T> {
  return apiCall<T>(page, 'POST', path, body);
}

/**
 * Starts the test where a fresh install starts: on an instance with no profiles the app shows
 * the first-profile screen, and creating the profile opens it.
 */
export async function createFirstProfile(page: Page, name: string) {
  await deleteAllProfiles(page.request);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Create your first profile' })).toBeVisible();
  await page.getByLabel('Profile name').fill(name);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL('/');
}

/** Creates the first profile and opens it, then creates one root category in it. */
export async function createProfileAndCategory(
  page: Page,
  profileName: string,
  categoryName: string,
) {
  await createFirstProfile(page, profileName);
  await page.getByRole('link', { name: 'Categories', exact: true }).click();
  await page.getByLabel('Category name').fill(categoryName);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.getByRole('link', { name: categoryName, exact: true })).toBeVisible();
}
