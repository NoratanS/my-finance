import { expect, test } from '@playwright/test'

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is not set`)
  return value
}

test('the smoke user signs in, sees the empty dashboard and signs out', async ({
  page,
}) => {
  const email = required('SMOKE_EMAIL')
  const password = required('SMOKE_PASSWORD')

  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(
    page.getByRole('heading', { name: 'Start with your first transaction' }),
  ).toBeVisible()

  await page.getByRole('button', { name: `${email}, account menu` }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})
