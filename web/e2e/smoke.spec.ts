import { expect, test } from '@playwright/test'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

test('the smoke user signs in, sees the empty dashboard and signs out', async ({
  page,
}) => {
  // The menu shows the stored email, which the api strips and downcases.
  const email = required('SMOKE_EMAIL').trim().toLowerCase()
  const password = required('SMOKE_PASSWORD')

  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(
    page.getByRole('heading', { name: 'Dashboard', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Start with your first transaction' }),
  ).toBeVisible()

  await page.getByRole('button', { name: `${email}, account menu` }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()

  await expect(
    page.getByRole('heading', { name: 'Sign in', exact: true }),
  ).toBeVisible()
})
