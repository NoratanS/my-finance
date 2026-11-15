import { screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import type { RequestBody } from '@/api/client'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { type Problem, signedInAs } from '@/test/sessionHandlers'
import {
  type Tag,
  tag,
  tagDetail,
  tagDetailShown,
  tagDetailUntilGone,
  tagsListed,
} from '@/test/tagHandlers'

const restaurant = tag(7, 'Restaurant', { colour: 'sky', transaction_count: 3 })
const eatingOut = tag(8, 'Eating out')
const alcohol = tag(9, 'Alcohol')

const detailsOf = (name: string) =>
  screen.findByRole('complementary', { name: `Tag details: ${name}` })

const openTagMenu = async (
  user: ReturnType<typeof renderApp>['user'],
  name: string,
) => {
  const details = await detailsOf(name)
  await user.click(
    await within(details).findByRole('button', {
      name: `More actions for ${name}: rename, change colour, merge, delete`,
    }),
  )
  return within(details).getByRole('menu', { name: `Actions for ${name}` })
}

test('the tag menu offers Rename, Change colour, Merge into… and Delete tag', async () => {
  server.use(
    signedInAs(),
    tagsListed([restaurant, eatingOut]),
    tagDetailShown(),
  )
  const { user } = renderApp('/tags?tag=7')

  const menu = await openTagMenu(user, 'Restaurant')

  expect(
    within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent),
  ).toEqual(['Rename', 'Change colour', 'Merge into…', 'Delete tag'])
})

test('Rename starts from the current name, says how many transactions follow it, and saves the new one', async () => {
  let sent: RequestBody<'updateTag'> | undefined
  server.use(
    signedInAs(),
    tagsListed([restaurant]),
    tagDetailShown(tagDetail({ transaction_count: 7 })),
    http.patch('/api/tags/:id', async ({ request }) => {
      sent = (await request.json()) as RequestBody<'updateTag'>
      server.use(tagsListed([{ ...restaurant, name: 'Restaurants' }]))
      return HttpResponse.json<Tag>({ ...restaurant, name: 'Restaurants' })
    }),
  )
  const { user } = renderApp('/tags?tag=7')

  const menu = await openTagMenu(user, 'Restaurant')
  await user.click(within(menu).getByRole('menuitem', { name: 'Rename' }))
  const dialog = screen.getByRole('dialog', { name: 'Rename tag' })
  const name = within(dialog).getByLabelText('Name')
  expect(name).toHaveValue('Restaurant')
  expect(name).toHaveAccessibleDescription(
    'Its 7 transactions show the new name.',
  )
  await user.type(name, 's')
  await user.click(within(dialog).getByRole('button', { name: 'Save name' }))

  expect(await detailsOf('Restaurants')).toBeInTheDocument()
  expect(sent).toEqual({ name: 'Restaurants' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('renaming to a name I already have offers to merge into that tag, confirms what moves, and merging forgets the selection', async () => {
  const { state: detail, handler } = tagDetailUntilGone(restaurant.id, 14)
  let merged: { id: string; body: RequestBody<'mergeTag'> } | undefined
  server.use(
    signedInAs(),
    tagsListed([restaurant, eatingOut]),
    handler,
    http.patch('/api/tags/:id', () =>
      HttpResponse.json<Problem>(
        {
          type: 'tag-name-taken',
          title: 'You already have a tag with this name',
          status: 422,
          existing_id: eatingOut.id,
          errors: {
            name: [
              'You already have “Eating out”. Letter case and spaces don’t make a new tag.',
            ],
          },
        },
        { status: 422 },
      ),
    ),
    http.post('/api/tags/:tagId/merges', async ({ request, params }) => {
      merged = {
        id: String(params.tagId),
        body: (await request.json()) as RequestBody<'mergeTag'>,
      }
      detail.gone = true
      server.use(tagsListed([{ ...eatingOut, transaction_count: 14 }]))
      return HttpResponse.json<Tag>(eatingOut, { status: 201 })
    }),
  )
  const { router, user } = renderApp('/tags?period=3&tag=7')

  const menu = await openTagMenu(user, 'Restaurant')
  await user.click(within(menu).getByRole('menuitem', { name: 'Rename' }))
  const rename = screen.getByRole('dialog', { name: 'Rename tag' })
  await user.clear(within(rename).getByLabelText('Name'))
  await user.type(within(rename).getByLabelText('Name'), 'eating out')
  await user.click(within(rename).getByRole('button', { name: 'Save name' }))

  await vi.waitFor(() => {
    expect(within(rename).getByLabelText('Name')).toHaveAccessibleDescription(
      'A tag named “Eating out” already exists.',
    )
  })
  expect(rename).toHaveTextContent(
    'You can merge Restaurant into it instead: its 14 transactions will carry Eating out.',
  )
  await user.click(
    within(rename).getByRole('button', { name: 'Merge into Eating out…' }),
  )

  const confirm = screen.getByRole('alertdialog', {
    name: 'Merge “Restaurant” into “Eating out”?',
  })
  expect(confirm).toHaveAccessibleDescription(
    'Everything tagged Restaurant becomes Eating out, and the tag Restaurant is removed. This can’t be undone.',
  )
  expect(confirm).toHaveTextContent('14 transactionsmove to Eating out')
  expect(merged).toBeUndefined()
  await user.click(within(confirm).getByRole('button', { name: 'Merge tags' }))

  await vi.waitFor(() => {
    expect(router.state.location.search).toBe('?period=3')
  })
  expect(merged).toEqual({ id: '7', body: { target_id: eatingOut.id } })
  await vi.waitFor(() => {
    expect(
      screen.queryByRole('link', { name: /^Restaurant/ }),
    ).not.toBeInTheDocument()
  })
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(detail.asksAfterGone).toBe(0)
})

test('Merge into… picks the tag to keep from my other tags A–Z, then confirms', async () => {
  server.use(
    signedInAs(),
    tagsListed([restaurant, eatingOut, alcohol]),
    tagDetailShown(tagDetail({ transaction_count: 3 })),
  )
  const { user } = renderApp('/tags?tag=7')

  const menu = await openTagMenu(user, 'Restaurant')
  await user.click(within(menu).getByRole('menuitem', { name: 'Merge into…' }))
  const picker = screen.getByRole('dialog', {
    name: 'Merge “Restaurant” into…',
  })
  const keep = within(picker).getByLabelText('Tag to keep')
  expect(
    within(keep)
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual(['Alcohol', 'Eating out'])
  await user.selectOptions(keep, 'Eating out')
  await user.click(within(picker).getByRole('button', { name: 'Continue' }))

  const confirm = screen.getByRole('alertdialog', {
    name: 'Merge “Restaurant” into “Eating out”?',
  })
  expect(confirm).toHaveTextContent('3 transactionsmove to Eating out')
  expect(picker).not.toBeVisible()
})

test('Change colour saves the colour picked, back to No colour', async () => {
  let sent: RequestBody<'updateTag'> | undefined
  server.use(
    signedInAs(),
    tagsListed([restaurant]),
    tagDetailShown(),
    http.patch('/api/tags/:id', async ({ request }) => {
      sent = (await request.json()) as RequestBody<'updateTag'>
      server.use(tagsListed([{ ...restaurant, colour: null }]))
      return HttpResponse.json<Tag>({ ...restaurant, colour: null })
    }),
  )
  const { user } = renderApp('/tags?tag=7')

  const menu = await openTagMenu(user, 'Restaurant')
  await user.click(
    within(menu).getByRole('menuitem', { name: 'Change colour' }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Colour for “Restaurant”' })
  expect(within(dialog).getByRole('button', { name: 'Sky' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await user.click(within(dialog).getByRole('button', { name: 'No colour' }))
  await user.click(within(dialog).getByRole('button', { name: 'Save colour' }))

  await vi.waitFor(() => {
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  expect(sent).toEqual({ colour: null })
})

test('deleting a tag says how many transactions lose it, then forgets the selection', async () => {
  const { state: detail, handler } = tagDetailUntilGone(restaurant.id, 17)
  let deleted: string | undefined
  server.use(
    signedInAs(),
    tagsListed([restaurant, eatingOut]),
    handler,
    http.delete('/api/tags/:id', ({ params }) => {
      deleted = String(params.id)
      detail.gone = true
      server.use(tagsListed([eatingOut]))
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { router, user } = renderApp('/tags?tag=7')

  const menu = await openTagMenu(user, 'Restaurant')
  await user.click(within(menu).getByRole('menuitem', { name: 'Delete tag' }))
  const dialog = screen.getByRole('alertdialog', {
    name: 'Delete the tag “Restaurant”?',
  })
  expect(dialog).toHaveAccessibleDescription(
    'The transactions stay. They lose this tag, and this can’t be undone.',
  )
  expect(dialog).toHaveTextContent('17 transactionslose the tag')
  await user.click(within(dialog).getByRole('button', { name: 'Delete tag' }))

  await vi.waitFor(() => {
    expect(router.state.location.search).toBe('')
  })
  expect(deleted).toBe('7')
  await vi.waitFor(() => {
    expect(
      screen.queryByRole('link', { name: /^Restaurant/ }),
    ).not.toBeInTheDocument()
  })
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(detail.asksAfterGone).toBe(0)
})

test('Merge… in the delete confirmation opens Merge into… instead', async () => {
  server.use(
    signedInAs(),
    tagsListed([restaurant, eatingOut]),
    tagDetailShown(tagDetail({ transaction_count: 17 })),
  )
  const { user } = renderApp('/tags?tag=7')

  const menu = await openTagMenu(user, 'Restaurant')
  await user.click(within(menu).getByRole('menuitem', { name: 'Delete tag' }))
  const dialog = screen.getByRole('alertdialog', {
    name: 'Delete the tag “Restaurant”?',
  })
  expect(dialog).toHaveTextContent(
    'Or keep everything by merging it into another tag',
  )
  await user.click(within(dialog).getByRole('button', { name: 'Merge…' }))

  expect(
    screen.getByRole('dialog', { name: 'Merge “Restaurant” into…' }),
  ).toBeVisible()
  expect(dialog).not.toBeVisible()
})

test('one transaction reads in the singular in Rename and Delete tag', async () => {
  server.use(
    signedInAs(),
    tagsListed([restaurant]),
    tagDetailShown(tagDetail({ transaction_count: 1 })),
  )
  const { user } = renderApp('/tags?tag=7')

  let menu = await openTagMenu(user, 'Restaurant')
  await user.click(within(menu).getByRole('menuitem', { name: 'Rename' }))
  const rename = screen.getByRole('dialog', { name: 'Rename tag' })
  expect(within(rename).getByLabelText('Name')).toHaveAccessibleDescription(
    'Its 1 transaction shows the new name.',
  )
  await user.click(within(rename).getByRole('button', { name: 'Cancel' }))
  menu = await openTagMenu(user, 'Restaurant')
  await user.click(within(menu).getByRole('menuitem', { name: 'Delete tag' }))

  const remove = screen.getByRole('alertdialog', {
    name: 'Delete the tag “Restaurant”?',
  })
  expect(remove).toHaveTextContent('1 transactionloses the tag')
  expect(within(remove).queryByRole('button', { name: 'Merge…' })).toBeNull()
})

test('Merge into… is off when there is no other tag to keep', async () => {
  server.use(signedInAs(), tagsListed([restaurant]), tagDetailShown())
  const { user } = renderApp('/tags?tag=7')

  const menu = await openTagMenu(user, 'Restaurant')

  expect(
    within(menu).getByRole('menuitem', { name: 'Merge into…' }),
  ).toBeDisabled()
})

test('a target deleted elsewhere sends the merge back to the picker, which says so and no longer offers it', async () => {
  server.use(
    signedInAs(),
    tagsListed([restaurant, eatingOut, alcohol]),
    tagDetailShown(),
    http.post('/api/tags/:tagId/merges', () => {
      server.use(tagsListed([restaurant, alcohol]))
      return HttpResponse.json<Problem>(
        { type: 'about:blank', title: 'Not found', status: 404 },
        { status: 404 },
      )
    }),
  )
  const { user } = renderApp('/tags?tag=7')

  const menu = await openTagMenu(user, 'Restaurant')
  await user.click(within(menu).getByRole('menuitem', { name: 'Merge into…' }))
  const picker = screen.getByRole('dialog', {
    name: 'Merge “Restaurant” into…',
  })
  await user.selectOptions(
    within(picker).getByLabelText('Tag to keep'),
    'Eating out',
  )
  await user.click(within(picker).getByRole('button', { name: 'Continue' }))
  const confirm = screen.getByRole('alertdialog', {
    name: 'Merge “Restaurant” into “Eating out”?',
  })
  await user.click(within(confirm).getByRole('button', { name: 'Merge tags' }))

  const again = await screen.findByRole('dialog', {
    name: 'Merge “Restaurant” into…',
  })
  expect(within(again).getByRole('alert')).toHaveTextContent(
    '“Eating out” was deleted elsewhere. Pick another tag.',
  )
  expect(
    within(within(again).getByLabelText('Tag to keep'))
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual(['Alcohol'])
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})
