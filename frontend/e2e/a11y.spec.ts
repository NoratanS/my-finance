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
  await page.goto(path);
}

const SCREENS = ['/', '/transactions', '/budgets', '/categories', '/subscriptions', '/insights'];

for (const path of SCREENS) {
  test(`no WCAG A/AA violations on ${path}`, async ({ page }) => {
    await registerPickAndGo(page, path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    // Print the offenders rather than only a count, so a failure is actionable.
    const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}x): ${v.help}`);
    expect(summary, `axe violations on ${path}`).toEqual([]);
  });
}
