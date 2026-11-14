import { screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import type { RequestBody } from '@/api/client'
import type { components } from '@/api/schema'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { type Problem, signedInAs } from '@/test/sessionHandlers'

type Tag = components['schemas']['Tag']
type TagList = components['schemas']['TagList']

const cinema: Tag = { id: 1, name: 'Cinema', colour: null, last_used_at: null }
const groceries: Tag = {
  id: 2,
  name: 'Groceries',
  colour: 'mint',
  last_used_at: null,
}
const zabka: Tag = { id: 3, name: 'Żabka', colour: 'sky', last_used_at: null }

const listed = (data: Tag[]) =>
  http.get('/api/tags', () => HttpResponse.json<TagList>({ data }))

const dotOf = (card: HTMLElement) => card.querySelector('[aria-hidden="true"]')

test('the page shows my tags as cards under No group, each with its colour dot and name', async () => {
  server.use(signedInAs(), listed([cinema, groceries, zabka]))

  renderApp('/tags')

  const noGroup = await screen.findByRole('region', { name: 'No group' })
  const cards = within(noGroup).getAllByRole('listitem')
  expect(cards.map((card) => card.textContent)).toEqual([
    'Cinema',
    'Groceries',
    'Żabka',
  ])
  expect(dotOf(within(noGroup).getByText('Groceries'))).toHaveStyle({
    backgroundColor: '#a4d9c6',
  })
  expect(dotOf(within(noGroup).getByText('Żabka'))).toHaveStyle({
    backgroundColor: '#a8cdec',
  })
  expect(within(noGroup).getByText('3 tags')).toBeInTheDocument()
  expect(
    screen.getByRole('heading', { level: 1, name: 'Tags' }),
  ).toBeInTheDocument()
})

test('the search narrows the cards by name, ignoring case and Polish letters', async () => {
  server.use(signedInAs(), listed([cinema, groceries, zabka]))
  const { user } = renderApp('/tags')

  await user.type(await screen.findByLabelText('Search tags'), 'ZAB')

  const noGroup = screen.getByRole('region', { name: 'No group' })
  expect(
    within(noGroup)
      .getAllByRole('listitem')
      .map((card) => card.textContent),
  ).toEqual(['Żabka'])
})

test('a search that matches nothing says so', async () => {
  server.use(signedInAs(), listed([cinema, groceries]))
  const { user } = renderApp('/tags')

  await user.type(await screen.findByLabelText('Search tags'), 'xyz')

  expect(screen.getByText('No tags match “xyz”.')).toBeInTheDocument()
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
})

test('with no tags yet, the page invites building a set, and its New tag opens the dialog', async () => {
  server.use(signedInAs(), listed([]))
  const { user } = renderApp('/tags')

  const empty = await screen.findByRole('region', {
    name: 'Build your own set of tags',
  })
  expect(empty).toHaveTextContent(
    'A tag is any label you want to total up later: a topic, a shop, an occasion. Transactions can wait untagged until you’ve decided.',
  )
  expect(screen.getByText('No tags yet')).toBeInTheDocument()
  expect(screen.queryByLabelText('Search tags')).not.toBeInTheDocument()
  await user.click(within(empty).getByRole('button', { name: 'New tag' }))

  expect(screen.getByRole('dialog', { name: 'New tag' })).toBeVisible()
})

test('the tags say they are loading', async () => {
  server.use(
    signedInAs(),
    http.get('/api/tags', async () => {
      await delay('infinite')
      return HttpResponse.json(null)
    }),
  )

  renderApp('/tags')

  expect(await screen.findByText('Loading tags')).toBeInTheDocument()
})

test('tags that fail to load offer to try again, and New tag still works', async () => {
  server.use(
    signedInAs(),
    http.get('/api/tags', () => {
      server.use(listed([cinema]))
      return HttpResponse.json<Problem>(
        { type: 'about:blank', title: 'Not found', status: 404 },
        { status: 404 },
      )
    }),
  )
  const { user } = renderApp('/tags')

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Couldn’t load your tags.',
  )
  expect(
    screen.getByText(
      'New tag stays available; the list fills in once it loads.',
    ),
  ).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'New tag' }))
  expect(screen.getByRole('dialog', { name: 'New tag' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Cancel' }))
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(await screen.findByText('Cinema')).toBeInTheDocument()
})

type NewTag = RequestBody<'createTag'>

test('creating a tag with a colour saves it, closes the dialog and shows its card', async () => {
  let sent: NewTag | undefined
  const created: Tag = {
    id: 4,
    name: 'Cinema',
    colour: 'lavender',
    last_used_at: null,
  }
  server.use(
    signedInAs(),
    listed([groceries]),
    http.post('/api/tags', async ({ request }) => {
      sent = (await request.json()) as NewTag
      server.use(listed([created, groceries]))
      return HttpResponse.json<Tag>(created, { status: 201 })
    }),
  )
  const { user } = renderApp('/tags')

  await user.click(await screen.findByRole('button', { name: 'New tag' }))
  const dialog = screen.getByRole('dialog', { name: 'New tag' })
  const name = within(dialog).getByLabelText('Name')
  expect(name).toHaveAccessibleDescription(
    'Letter case doesn’t matter: “cinema” and “Cinema” are one tag.',
  )
  expect(
    within(dialog).getByRole('button', { name: 'No colour' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await user.type(name, '  Cinema ')
  await user.click(within(dialog).getByRole('button', { name: 'Lavender' }))
  expect(
    within(dialog).getByRole('button', { name: 'Lavender' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await user.click(within(dialog).getByRole('button', { name: 'Create tag' }))

  const noGroup = await screen.findByRole('region', { name: 'No group' })
  expect(await within(noGroup).findByText('Cinema')).toBeInTheDocument()
  expect(sent).toEqual({ name: 'Cinema', colour: 'lavender' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('a name I already have shows on the name field, and the dialog stays open', async () => {
  server.use(
    signedInAs(),
    listed([groceries]),
    http.post('/api/tags', () =>
      HttpResponse.json<Problem>(
        {
          type: 'tag-name-taken',
          title: 'You already have a tag with this name',
          status: 422,
          existing_id: groceries.id,
          errors: {
            name: [
              'You already have “Groceries”. Letter case and spaces don’t make a new tag.',
            ],
          },
        },
        { status: 422 },
      ),
    ),
  )
  const { user } = renderApp('/tags')

  await user.click(await screen.findByRole('button', { name: 'New tag' }))
  const dialog = screen.getByRole('dialog', { name: 'New tag' })
  await user.type(within(dialog).getByLabelText('Name'), ' groceries ')
  await user.click(within(dialog).getByRole('button', { name: 'Create tag' }))

  await vi.waitFor(() => {
    expect(within(dialog).getByLabelText('Name')).toHaveAccessibleDescription(
      'You already have “Groceries”. Letter case and spaces don’t make a new tag.',
    )
  })
  expect(within(dialog).getByLabelText('Name')).toHaveAttribute(
    'aria-invalid',
    'true',
  )
  expect(screen.getByRole('dialog', { name: 'New tag' })).toBeVisible()
})

test('a name counts characters as the API does, so 21 emoji go through', async () => {
  let sent: NewTag | undefined
  const emoji = '🎬'.repeat(21)
  server.use(
    signedInAs(),
    listed([groceries]),
    http.post('/api/tags', async ({ request }) => {
      sent = (await request.json()) as NewTag
      return HttpResponse.json<Tag>(
        { id: 5, name: emoji, colour: null, last_used_at: null },
        { status: 201 },
      )
    }),
  )
  const { user } = renderApp('/tags')

  await user.click(await screen.findByRole('button', { name: 'New tag' }))
  const dialog = screen.getByRole('dialog', { name: 'New tag' })
  await user.type(within(dialog).getByLabelText('Name'), emoji)
  await user.click(within(dialog).getByRole('button', { name: 'Create tag' }))

  await vi.waitFor(() => {
    expect(sent).toEqual({ name: emoji, colour: null })
  })
})

test('a name over 40 characters shows on the name field', async () => {
  server.use(signedInAs(), listed([groceries]))
  const { user } = renderApp('/tags')

  await user.click(await screen.findByRole('button', { name: 'New tag' }))
  const dialog = screen.getByRole('dialog', { name: 'New tag' })
  await user.type(within(dialog).getByLabelText('Name'), 'x'.repeat(41))
  await user.click(within(dialog).getByRole('button', { name: 'Create tag' }))

  expect(within(dialog).getByLabelText('Name')).toHaveAccessibleDescription(
    'Keep it to 40 characters.',
  )
})

test('the cards sort A–Z the Polish way, so Łódź sits between Kino and Zakupy', async () => {
  server.use(
    signedInAs(),
    listed([
      { id: 1, name: 'Kino', colour: null, last_used_at: null },
      { id: 2, name: 'Zakupy', colour: null, last_used_at: null },
      { id: 3, name: 'Łódź', colour: null, last_used_at: null },
    ]),
  )

  renderApp('/tags')

  const noGroup = await screen.findByRole('region', { name: 'No group' })
  expect(
    within(noGroup)
      .getAllByRole('listitem')
      .map((card) => card.textContent),
  ).toEqual(['Kino', 'Łódź', 'Zakupy'])
})
