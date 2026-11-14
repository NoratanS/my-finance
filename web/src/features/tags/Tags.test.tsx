import { screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'
import type { RequestBody } from '@/api/client'
import type { components } from '@/api/schema'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { type Problem, signedInAs } from '@/test/sessionHandlers'
import { type Tag, tag, tagList, tagsListed } from '@/test/tagHandlers'

type TagPeriod = components['schemas']['TagPeriod']

const cinema = tag(1, 'Cinema')
const groceries = tag(2, 'Groceries', { colour: 'mint' })
const zabka = tag(3, 'Żabka', { colour: 'sky' })

const dotOf = (card: HTMLElement) => card.querySelector('[aria-hidden="true"]')

test('the page shows my tags as cards under No group, each with its colour dot and name', async () => {
  server.use(signedInAs(), tagsListed([cinema, groceries, zabka]))

  renderApp('/tags')

  const noGroup = await screen.findByRole('region', { name: 'No group' })
  const cards = within(noGroup).getAllByRole('listitem')
  expect(cards.map((card) => card.textContent)).toEqual([
    'Cinema0,00 PLN0 transactions',
    'Groceries0,00 PLN0 transactions',
    'Żabka0,00 PLN0 transactions',
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

test('the period switch totals the last 3 or 12 months, kept in the address, and This month leaves it bare', async () => {
  server.use(
    signedInAs(),
    http.get('/api/tags', ({ request }) => {
      const period = new URL(request.url).searchParams.get('period') ?? '1'
      return HttpResponse.json(
        tagList(
          [
            tag(1, 'Home', {
              expense: Number(period) * 1000,
              transaction_count: 1,
            }),
          ],
          { period: period as TagPeriod },
        ),
      )
    }),
  )
  const { router, user } = renderApp('/tags?period=12')

  const periods = await screen.findByRole('group', {
    name: 'Period for amounts',
  })
  expect(await screen.findByText('120,00 PLN')).toBeInTheDocument()
  expect(
    within(periods).getByRole('button', { name: '12 months' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await user.click(within(periods).getByRole('button', { name: '3 months' }))

  expect(await screen.findByText('30,00 PLN')).toBeInTheDocument()
  expect(router.state.location.search).toBe('?period=3')
  await user.click(within(periods).getByRole('button', { name: 'This month' }))

  expect(await screen.findByText('10,00 PLN')).toBeInTheDocument()
  expect(router.state.location.search).toBe('')
  expect(
    within(periods).getByRole('button', { name: 'This month' }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('while the next period loads, the cards keep the last totals and say they are busy', async () => {
  let answer: (() => void) | undefined
  server.use(
    signedInAs(),
    http.get('/api/tags', async ({ request }) => {
      const period = new URL(request.url).searchParams.get('period')
      if (period === '3')
        await new Promise<void>((resolve) => {
          answer = resolve
        })
      return HttpResponse.json(
        tagList([tag(1, 'Home', { expense: period ? 3000 : 1000 })]),
      )
    }),
  )
  const { user } = renderApp('/tags')
  const noGroup = await screen.findByRole('region', { name: 'No group' })
  expect(noGroup).not.toHaveAttribute('aria-busy')

  await user.click(screen.getByRole('button', { name: '3 months' }))

  // Asked, and not yet answered.
  await vi.waitFor(() => {
    expect(answer).toBeDefined()
  })
  expect(noGroup).toHaveAttribute('aria-busy', 'true')
  expect(within(noGroup).getByText('10,00 PLN')).toBeInTheDocument()
  answer?.()
  expect(await within(noGroup).findByText('30,00 PLN')).toBeInTheDocument()
  expect(noGroup).not.toHaveAttribute('aria-busy')
})

test('a period the switch does not offer opens as this month', async () => {
  let asked: string | undefined
  server.use(
    signedInAs(),
    http.get('/api/tags', ({ request }) => {
      asked = new URL(request.url).search
      return HttpResponse.json(tagList([cinema]))
    }),
  )

  renderApp('/tags?period=6')

  expect(
    await screen.findByRole('button', { name: 'This month' }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(asked).toBe('')
})

test('the footer says amounts overlap and offers every untagged transaction, all time', async () => {
  server.use(signedInAs(), tagsListed([cinema], { untagged_count: 3 }))

  renderApp('/tags')

  expect(
    await screen.findByText('Amounts overlap between tags.'),
  ).toBeInTheDocument()
  expect(
    screen.getByRole('link', { name: 'Review 3 untagged transactions' }),
  ).toHaveAttribute('href', '/transactions?period=all&untagged=true')
})

test('the untagged link names one transaction in the singular, and none hides it', async () => {
  server.use(signedInAs(), tagsListed([cinema], { untagged_count: 1 }))
  const { queryClient } = renderApp('/tags')

  expect(
    await screen.findByRole('link', { name: 'Review 1 untagged transaction' }),
  ).toBeInTheDocument()
  server.use(tagsListed([cinema], { untagged_count: 0 }))
  await queryClient.invalidateQueries()

  await vi.waitFor(() => {
    expect(
      screen.queryByRole('link', { name: /untagged/ }),
    ).not.toBeInTheDocument()
  })
  expect(screen.getByText('Amounts overlap between tags.')).toBeInTheDocument()
})

test('the search narrows the cards by name, ignoring case and Polish letters', async () => {
  server.use(signedInAs(), tagsListed([cinema, groceries, zabka]))
  const { user } = renderApp('/tags')

  await user.type(await screen.findByLabelText('Search tags'), 'ZAB')

  const noGroup = screen.getByRole('region', { name: 'No group' })
  expect(
    within(noGroup)
      .getAllByRole('listitem')
      .map((card) => card.textContent),
  ).toEqual(['Żabka0,00 PLN0 transactions'])
})

test('a search that matches nothing says so', async () => {
  server.use(signedInAs(), tagsListed([cinema, groceries]))
  const { user } = renderApp('/tags')

  await user.type(await screen.findByLabelText('Search tags'), 'xyz')

  expect(screen.getByText('No tags match “xyz”.')).toBeInTheDocument()
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
})

test('with no tags yet, the page invites building a set, and its New tag opens the dialog', async () => {
  server.use(signedInAs(), tagsListed([]))
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

test('with no tags yet, the page offers a look through the untagged transactions first', async () => {
  server.use(signedInAs(), tagsListed([], { untagged_count: 37 }))

  renderApp('/tags')

  const empty = await screen.findByRole('region', {
    name: 'Build your own set of tags',
  })
  expect(
    within(empty).getByRole('link', {
      name: 'Look through 37 untagged transactions first',
    }),
  ).toHaveAttribute('href', '/transactions?period=all&untagged=true')
})

test('with no tags and one untagged transaction, the link is singular; with none, it is gone', async () => {
  server.use(signedInAs(), tagsListed([], { untagged_count: 1 }))
  const { queryClient } = renderApp('/tags')

  expect(
    await screen.findByRole('link', {
      name: 'Look through 1 untagged transaction first',
    }),
  ).toBeInTheDocument()
  server.use(tagsListed([], { untagged_count: 0 }))
  await queryClient.invalidateQueries()

  await vi.waitFor(() => {
    expect(
      screen.queryByRole('link', { name: /untagged/ }),
    ).not.toBeInTheDocument()
  })
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
      server.use(tagsListed([cinema]))
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
  const created = tag(4, 'Cinema', { colour: 'lavender' })
  server.use(
    signedInAs(),
    tagsListed([groceries]),
    http.post('/api/tags', async ({ request }) => {
      sent = (await request.json()) as NewTag
      server.use(tagsListed([created, groceries]))
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
    tagsListed([groceries]),
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
    tagsListed([groceries]),
    http.post('/api/tags', async ({ request }) => {
      sent = (await request.json()) as NewTag
      return HttpResponse.json<Tag>(tag(5, emoji), { status: 201 })
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
  server.use(signedInAs(), tagsListed([groceries]))
  const { user } = renderApp('/tags')

  await user.click(await screen.findByRole('button', { name: 'New tag' }))
  const dialog = screen.getByRole('dialog', { name: 'New tag' })
  await user.type(within(dialog).getByLabelText('Name'), 'x'.repeat(41))
  await user.click(within(dialog).getByRole('button', { name: 'Create tag' }))

  expect(within(dialog).getByLabelText('Name')).toHaveAccessibleDescription(
    'Keep it to 40 characters.',
  )
})

test('each card shows what the tag cost, earned and counted this month, in the order the API sends', async () => {
  server.use(
    signedInAs(),
    tagsListed([
      tag(1, 'Home', { expense: 231000, transaction_count: 5 }),
      tag(2, 'Allegro', { expense: 31200, income: 8900, transaction_count: 4 }),
      tag(3, 'Unused'),
      tag(4, 'Salary', { income: 820000, transaction_count: 1 }),
    ]),
  )

  renderApp('/tags')

  const noGroup = await screen.findByRole('region', { name: 'No group' })
  expect(
    within(noGroup)
      .getAllByRole('listitem')
      .map((card) => card.textContent),
  ).toEqual([
    'Home2 310,00 PLN5 transactions',
    'Allegro312,00 PLN+89,00 PLN4 transactions',
    'Unused0,00 PLN0 transactions',
    'Salary+8 200,00 PLN1 transaction',
  ])
  expect(within(noGroup).getByText('+89,00 PLN')).toHaveClass('text-income')
  expect(within(noGroup).getByText('+8 200,00 PLN')).toHaveClass('text-income')
})
