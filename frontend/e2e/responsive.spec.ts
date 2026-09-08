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

const SCREENS = ['/', '/transactions', '/budgets', '/categories', '/subscriptions', '/insights'];
const WIDTHS = [390, 820];

test('no horizontal overflow on any screen at phone or tablet width', async ({ page }) => {
  const offenders: string[] = [];

  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 800 });
    for (const path of SCREENS) {
      if (path === SCREENS[0] && width === WIDTHS[0]) {
        await registerPickAndGo(page, path);
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
