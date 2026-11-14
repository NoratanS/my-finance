import { screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { expect, onTestFinished, test, vi } from 'vitest'
import type { RequestBody } from '@/api/client'
import type { components } from '@/api/schema'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { type Problem, signedInAs } from '@/test/sessionHandlers'
import {
  type Tag,
  tag,
  tagDetail,
  tagDetailShown,
  tagGroup,
  tagList,
  tagsListed,
} from '@/test/tagHandlers'

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
  expect(sent).toEqual({ name: 'Cinema', colour: 'lavender', group_id: null })
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
    expect(sent).toEqual({ name: emoji, colour: null, group_id: null })
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

const occasions = tagGroup(10, 'Occasions', {
  expense: 126200,
  transaction_count: 6,
})
const people = tagGroup(11, 'People')
const shops = tagGroup(12, 'Shops', { expense: 123540 })
const grouped = [
  tag(1, 'Home', { expense: 231000 }),
  tag(2, 'Travel', { group_id: occasions.id, expense: 78000 }),
  tag(3, 'Party', { group_id: occasions.id, expense: 38600 }),
  tag(4, 'Lidl', { group_id: shops.id, expense: 48620 }),
]

const sectionTitles = () =>
  screen
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent)

test('tags sit in sections, No group first and then my groups A–Z, each group headed by its tag count and total', async () => {
  server.use(signedInAs(), tagsListed(grouped, {}, [occasions, people, shops]))

  renderApp('/tags')

  const party = await screen.findByRole('region', { name: 'Occasions' })
  expect(sectionTitles()).toEqual(['No group', 'Occasions', 'People', 'Shops'])
  expect(
    within(party).getByText('2 tags · 1 262,00 PLN this month'),
  ).toBeInTheDocument()
  expect(
    within(party)
      .getAllByRole('listitem')
      .map((card) => card.textContent),
  ).toEqual(['Travel780,00 PLN0 transactions', 'Party386,00 PLN0 transactions'])
  expect(
    within(screen.getByRole('region', { name: 'Shops' })).getByText(
      '1 tag · 1 235,40 PLN this month',
    ),
  ).toBeInTheDocument()
  expect(
    within(screen.getByRole('region', { name: 'No group' })).getByText('1 tag'),
  ).toBeInTheDocument()
  expect(screen.getByText('4 tags · 3 groups')).toBeInTheDocument()
  expect(
    screen.getByText(
      'A tag belongs to one group at most. Amounts overlap between tags; a group’s total counts each transaction once.',
    ),
  ).toBeInTheDocument()
})

test('an empty group says how to fill it', async () => {
  server.use(signedInAs(), tagsListed(grouped, {}, [people]))

  renderApp('/tags')

  const empty = await screen.findByRole('region', { name: 'People' })
  expect(within(empty).getByText('No tags')).toBeInTheDocument()
  expect(
    within(empty).getByText('No tags yet. Set a tag’s group in its details.'),
  ).toBeInTheDocument()
  expect(screen.getByText('4 tags · 1 group')).toBeInTheDocument()
})

test('a group total follows the period switch', async () => {
  server.use(signedInAs(), tagsListed(grouped, { period: '3' }, [occasions]))

  renderApp('/tags?period=3')

  expect(
    await screen.findByText('2 tags · 1 262,00 PLN in the last 3 months'),
  ).toBeInTheDocument()
})

test('a search shows only the sections with a match, each still counting all its tags', async () => {
  server.use(signedInAs(), tagsListed(grouped, {}, [occasions, people]))
  const { user } = renderApp('/tags')

  await user.type(await screen.findByLabelText('Search tags'), 'PAR')

  expect(sectionTitles()).toEqual(['Occasions'])
  const party = screen.getByRole('region', { name: 'Occasions' })
  expect(within(party).getAllByRole('listitem')).toHaveLength(1)
  expect(
    within(party).getByText('2 tags · 1 262,00 PLN this month'),
  ).toBeInTheDocument()
})

test('with groups but no tags yet, the page shows the groups instead of the first-tag invite', async () => {
  server.use(signedInAs(), tagsListed([], {}, [people]))

  renderApp('/tags')

  expect(await screen.findByRole('region', { name: 'People' })).toBeVisible()
  expect(sectionTitles()).toEqual(['People'])
  expect(
    screen.queryByRole('region', { name: 'Build your own set of tags' }),
  ).not.toBeInTheDocument()
  expect(screen.getByLabelText('Search tags')).toBeVisible()
  expect(screen.getByRole('button', { name: 'New group' })).toBeVisible()
})

type GroupInput = RequestBody<'createTagGroup'>
type TagGroup = components['schemas']['TagGroup']

const groupNameTaken = (name: string, existing: number) =>
  HttpResponse.json<Problem>(
    {
      type: 'tag-group-name-taken',
      title: 'You already have a tag group with this name',
      status: 422,
      existing_id: existing,
      errors: {
        name: [`A group named “${name}” already exists. Pick another name.`],
      },
    },
    { status: 422 },
  )

test('New group creates an empty group, shown as its own section', async () => {
  let sent: GroupInput | undefined
  server.use(
    signedInAs(),
    tagsListed(grouped, {}, [occasions]),
    http.post('/api/tag_groups', async ({ request }) => {
      sent = (await request.json()) as GroupInput
      server.use(tagsListed(grouped, {}, [occasions, people]))
      return HttpResponse.json<TagGroup>(
        { id: people.id, name: 'People' },
        { status: 201 },
      )
    }),
  )
  const { user } = renderApp('/tags')

  await user.click(await screen.findByRole('button', { name: 'New group' }))
  const dialog = screen.getByRole('dialog', { name: 'New group' })
  const name = within(dialog).getByLabelText('Name')
  expect(name).toHaveAccessibleDescription(
    'Up to 40 characters. Letter case doesn’t matter.',
  )
  expect(
    within(dialog).getByText(
      'Starts empty. Put a tag in it from the tag’s details.',
    ),
  ).toBeInTheDocument()
  await user.type(name, ' People ')
  await user.click(within(dialog).getByRole('button', { name: 'Create group' }))

  expect(
    await screen.findByRole('region', { name: 'People' }),
  ).toBeInTheDocument()
  expect(sent).toEqual({ name: 'People' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('a group name I already have shows on the name field in New group', async () => {
  server.use(
    signedInAs(),
    tagsListed(grouped, {}, [shops]),
    http.post('/api/tag_groups', () => groupNameTaken('Shops', shops.id)),
  )
  const { user } = renderApp('/tags')

  await user.click(await screen.findByRole('button', { name: 'New group' }))
  const dialog = screen.getByRole('dialog', { name: 'New group' })
  await user.type(within(dialog).getByLabelText('Name'), 'shops')
  await user.click(within(dialog).getByRole('button', { name: 'Create group' }))

  await vi.waitFor(() => {
    expect(within(dialog).getByLabelText('Name')).toHaveAccessibleDescription(
      'A group named “Shops” already exists. Pick another name.',
    )
  })
  expect(within(dialog).getByLabelText('Name')).toHaveAttribute(
    'aria-invalid',
    'true',
  )
})

test('an empty group name shows on the name field', async () => {
  server.use(signedInAs(), tagsListed(grouped, {}, []))
  const { user } = renderApp('/tags')

  await user.click(await screen.findByRole('button', { name: 'New group' }))
  const dialog = screen.getByRole('dialog', { name: 'New group' })
  await user.type(within(dialog).getByLabelText('Name'), '   ')
  await user.click(within(dialog).getByRole('button', { name: 'Create group' }))

  expect(within(dialog).getByLabelText('Name')).toHaveAccessibleDescription(
    'Name the group.',
  )
})

const openGroupMenu = async (
  user: ReturnType<typeof renderApp>['user'],
  name: string,
) => {
  await user.click(
    await screen.findByRole('button', {
      name: `More actions for group ${name}: rename, delete group`,
    }),
  )
  return screen.getByRole('menu', { name: `Group ${name}` })
}

test('Rename group starts from the current name and saves the new one', async () => {
  let sent: { id: string; body: GroupInput } | undefined
  server.use(
    signedInAs(),
    tagsListed(grouped, {}, [shops]),
    http.patch('/api/tag_groups/:id', async ({ request, params }) => {
      sent = {
        id: String(params.id),
        body: (await request.json()) as GroupInput,
      }
      server.use(tagsListed(grouped, {}, [{ ...shops, name: 'Places' }]))
      return HttpResponse.json<TagGroup>({ id: shops.id, name: 'Places' })
    }),
  )
  const { user } = renderApp('/tags')

  const menu = await openGroupMenu(user, 'Shops')
  await user.click(within(menu).getByRole('menuitem', { name: 'Rename group' }))
  const dialog = screen.getByRole('dialog', { name: 'Rename group' })
  const name = within(dialog).getByLabelText('Name')
  expect(name).toHaveValue('Shops')
  await user.clear(name)
  await user.type(name, 'Places')
  await user.click(within(dialog).getByRole('button', { name: 'Save name' }))

  expect(
    await screen.findByRole('region', { name: 'Places' }),
  ).toBeInTheDocument()
  expect(sent).toEqual({ id: '12', body: { name: 'Places' } })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('renaming a group to a name I already have gives the same error as New group', async () => {
  server.use(
    signedInAs(),
    tagsListed(grouped, {}, [occasions, shops]),
    http.patch('/api/tag_groups/:id', () => groupNameTaken('Shops', shops.id)),
  )
  const { user } = renderApp('/tags')

  const menu = await openGroupMenu(user, 'Occasions')
  await user.click(within(menu).getByRole('menuitem', { name: 'Rename group' }))
  const dialog = screen.getByRole('dialog', { name: 'Rename group' })
  await user.clear(within(dialog).getByLabelText('Name'))
  await user.type(within(dialog).getByLabelText('Name'), 'shops')
  await user.click(within(dialog).getByRole('button', { name: 'Save name' }))

  await vi.waitFor(() => {
    expect(within(dialog).getByLabelText('Name')).toHaveAccessibleDescription(
      'A group named “Shops” already exists. Pick another name.',
    )
  })
})

test('deleting a group asks first, naming the tags that move, then moves them to No group', async () => {
  let deleted: string | undefined
  server.use(
    signedInAs(),
    tagsListed(grouped, {}, [occasions, shops]),
    http.delete('/api/tag_groups/:id', ({ params }) => {
      deleted = String(params.id)
      server.use(
        tagsListed(
          grouped.map((each) =>
            each.group_id === occasions.id ? { ...each, group_id: null } : each,
          ),
          {},
          [shops],
        ),
      )
      return new HttpResponse(null, { status: 204 })
    }),
  )
  const { user } = renderApp('/tags')

  const menu = await openGroupMenu(user, 'Occasions')
  await user.click(within(menu).getByRole('menuitem', { name: 'Delete group' }))
  const dialog = screen.getByRole('alertdialog', {
    name: 'Delete the group “Occasions”?',
  })
  expect(dialog).toHaveAccessibleDescription(
    'Its tags move to No group. No tag or transaction is deleted.',
  )
  expect(
    within(within(dialog).getByRole('list', { name: 'Moves to No group' }))
      .getAllByRole('listitem')
      .map((chip) => chip.textContent),
  ).toEqual(['Party', 'Travel'])
  expect(deleted).toBeUndefined()
  await user.click(within(dialog).getByRole('button', { name: 'Delete group' }))

  await vi.waitFor(() => {
    expect(sectionTitles()).toEqual(['No group', 'Shops'])
  })
  expect(
    within(screen.getByRole('region', { name: 'No group' }))
      .getAllByRole('listitem')
      .map((card) => card.textContent.split(/\d/)[0]),
  ).toEqual(['Home', 'Travel', 'Party'])
  expect(deleted).toBe('10')
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

test('Cancel keeps the group', async () => {
  server.use(signedInAs(), tagsListed(grouped, {}, [people]))
  const { user } = renderApp('/tags')

  const menu = await openGroupMenu(user, 'People')
  await user.click(within(menu).getByRole('menuitem', { name: 'Delete group' }))
  const dialog = screen.getByRole('alertdialog', {
    name: 'Delete the group “People”?',
  })
  expect(within(dialog).queryByRole('list')).not.toBeInTheDocument()
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'People' })).toBeInTheDocument()
})

const groupSelect = (dialog: HTMLElement) =>
  within(dialog).getByRole('combobox', { name: 'Group · optional' })

test('New tag offers No group, every group and New group…, and creates the tag in the group picked', async () => {
  let sent: NewTag | undefined
  server.use(
    signedInAs(),
    tagsListed(grouped, {}, [occasions, shops]),
    http.post('/api/tags', async ({ request }) => {
      sent = (await request.json()) as NewTag
      return HttpResponse.json<Tag>(tag(9, 'Aldi', { group_id: shops.id }), {
        status: 201,
      })
    }),
  )
  const { user } = renderApp('/tags')

  await user.click(await screen.findByRole('button', { name: 'New tag' }))
  const dialog = screen.getByRole('dialog', { name: 'New tag' })
  const select = groupSelect(dialog)
  expect(
    within(select)
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual(['No group', 'Occasions', 'Shops', 'New group…'])
  expect(select).toHaveDisplayValue('No group')
  await user.type(within(dialog).getByLabelText('Name'), 'Aldi')
  await user.selectOptions(select, 'Shops')
  await user.click(within(dialog).getByRole('button', { name: 'Create tag' }))

  await vi.waitFor(() => {
    expect(sent).toEqual({ name: 'Aldi', colour: null, group_id: shops.id })
  })
})

test('New group… in New tag opens New group, and the group it creates is picked', async () => {
  server.use(
    signedInAs(),
    tagsListed(grouped, {}, [shops]),
    http.post('/api/tag_groups', () => {
      server.use(tagsListed(grouped, {}, [people, shops]))
      return HttpResponse.json<TagGroup>(
        { id: people.id, name: 'People' },
        { status: 201 },
      )
    }),
  )
  const { user } = renderApp('/tags')

  await user.click(await screen.findByRole('button', { name: 'New tag' }))
  const newTag = screen.getByRole('dialog', { name: 'New tag' })
  await user.selectOptions(groupSelect(newTag), 'New group…')
  const newGroup = screen.getByRole('dialog', { name: 'New group' })
  await user.type(within(newGroup).getByLabelText('Name'), 'People')
  await user.click(
    within(newGroup).getByRole('button', { name: 'Create group' }),
  )

  await vi.waitFor(() => {
    expect(groupSelect(newTag)).toHaveDisplayValue('People')
  })
  expect(
    screen.queryByRole('dialog', { name: 'New group' }),
  ).not.toBeInTheDocument()
  expect(newTag).toBeVisible()
})

test('cancelling New group from New tag keeps the group picked before', async () => {
  server.use(signedInAs(), tagsListed(grouped, {}, [shops]))
  const { user } = renderApp('/tags')

  await user.click(await screen.findByRole('button', { name: 'New tag' }))
  const newTag = screen.getByRole('dialog', { name: 'New tag' })
  await user.selectOptions(groupSelect(newTag), 'Shops')
  await user.selectOptions(groupSelect(newTag), 'New group…')
  const newGroup = screen.getByRole('dialog', { name: 'New group' })
  await user.click(within(newGroup).getByRole('button', { name: 'Cancel' }))

  expect(groupSelect(newTag)).toHaveDisplayValue('Shops')
  expect(newTag).toBeVisible()
})

test('the page’s dialogs keep apart from each other, so React never sees two with one key', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  onTestFinished(() => {
    errors.mockRestore()
  })
  server.use(signedInAs(), tagsListed(grouped, {}, [shops]))
  const { user } = renderApp('/tags')

  await user.click(await screen.findByRole('button', { name: 'New group' }))
  await user.click(screen.getByRole('button', { name: 'Cancel' }))

  expect(
    errors.mock.calls.filter((call) => String(call[0]).includes('same key')),
  ).toEqual([])
})

test('a group deleted elsewhere while New tag is open says so on the Group field and drops from it', async () => {
  server.use(
    signedInAs(),
    tagsListed(grouped, {}, [shops]),
    http.post('/api/tags', () => {
      server.use(tagsListed(grouped, {}, []))
      return HttpResponse.json<Problem>(
        { type: 'about:blank', title: 'Not found', status: 404 },
        { status: 404 },
      )
    }),
  )
  const { user } = renderApp('/tags')

  await user.click(await screen.findByRole('button', { name: 'New tag' }))
  const dialog = screen.getByRole('dialog', { name: 'New tag' })
  await user.type(within(dialog).getByLabelText('Name'), 'Aldi')
  await user.selectOptions(groupSelect(dialog), 'Shops')
  await user.click(within(dialog).getByRole('button', { name: 'Create tag' }))

  await vi.waitFor(() => {
    expect(groupSelect(dialog)).toHaveAccessibleDescription(
      'This group was deleted elsewhere. Pick another.',
    )
  })
  await vi.waitFor(() => {
    expect(
      within(groupSelect(dialog))
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['No group', 'New group…'])
  })
  expect(groupSelect(dialog)).toHaveDisplayValue('No group')
  expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
})

const lidl = tag(7, 'Lidl', { colour: 'sky', expense: 48_620 })
const detailsOf = (name: string) =>
  screen.findByRole('complementary', { name: `Tag details: ${name}` })

test('selecting a tag opens its details beside the list, kept in the address with the period', async () => {
  let asked: string | undefined
  server.use(
    signedInAs(),
    tagsListed([cinema, lidl], { period: '3' }),
    http.get('/api/tags/:id', ({ request, params }) => {
      asked = `${String(params.id)}${new URL(request.url).search}`
      return HttpResponse.json(tagDetail())
    }),
  )
  const { router, user } = renderApp('/tags?period=3')

  await user.click(await screen.findByRole('link', { name: /^Lidl/ }))

  const details = await detailsOf('Lidl')
  expect(
    within(details).getByRole('heading', { level: 2, name: 'Lidl' }),
  ).toBeInTheDocument()
  expect(router.state.location.search).toBe('?period=3&tag=7')
  await vi.waitFor(() => {
    expect(asked).toBe('7?period=3')
  })
  expect(screen.getByRole('link', { name: /^Lidl/ })).toHaveAttribute(
    'aria-current',
    'true',
  )
  expect(screen.getByRole('link', { name: /^Cinema/ })).not.toHaveAttribute(
    'aria-current',
  )
})

test('the period switch keeps the selected tag', async () => {
  server.use(signedInAs(), tagsListed([lidl]), tagDetailShown())
  const { router, user } = renderApp('/tags?tag=7')
  await detailsOf('Lidl')

  await user.click(screen.getByRole('button', { name: '12 months' }))

  expect(router.state.location.search).toBe('?period=12&tag=7')
  expect(await detailsOf('Lidl')).toBeInTheDocument()
})

test('selecting the selected tag again closes its details', async () => {
  server.use(signedInAs(), tagsListed([lidl]), tagDetailShown())
  const { router, user } = renderApp('/tags?tag=7')
  await detailsOf('Lidl')

  await user.click(screen.getByRole('link', { name: /^Lidl/ }))

  expect(router.state.location.search).toBe('')
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
})

test('a tag in the address that is not in the list drops from it', async () => {
  server.use(signedInAs(), tagsListed([lidl], { period: '3' }))
  const { router } = renderApp('/tags?period=3&tag=99')

  expect(await screen.findByRole('link', { name: /^Lidl/ })).toBeInTheDocument()
  await vi.waitFor(() => {
    expect(router.state.location.search).toBe('?period=3')
  })
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
})

const party = tag(8, 'Party', { colour: 'lilac' })
type TagChip = components['schemas']['TagChip']
const chip = ({ id, name, colour }: Tag): TagChip => ({ id, name, colour })

test('the details chart the last 6 months of spending and income, with an English month axis', async () => {
  server.use(
    signedInAs(),
    tagsListed([lidl]),
    tagDetailShown(
      tagDetail({
        months: [
          { month: '2026-06', expense: 31_000, income: 0 },
          { month: '2026-07', expense: 0, income: 0 },
          { month: '2026-08', expense: 0, income: 0 },
          { month: '2026-09', expense: 47_900, income: 0 },
          { month: '2026-10', expense: 0, income: 0 },
          { month: '2026-11', expense: 48_620, income: 2_000 },
        ],
      }),
    ),
  )

  renderApp('/tags?tag=7')

  const details = await detailsOf('Lidl')
  expect(await within(details).findByText('Last 6 months')).toBeInTheDocument()
  expect(within(details).getByRole('img')).toHaveAccessibleName(
    'Monthly totals tagged Lidl: June 2026: 310,00 PLN spent, 0,00 PLN earned; ' +
      'July 2026: 0,00 PLN spent, 0,00 PLN earned; August 2026: 0,00 PLN spent, 0,00 PLN earned; ' +
      'September 2026: 479,00 PLN spent, 0,00 PLN earned; October 2026: 0,00 PLN spent, 0,00 PLN earned; ' +
      'November 2026: 486,20 PLN spent, 20,00 PLN earned',
  )
  expect(
    ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'].map(
      (month) => within(details).getByText(month).textContent,
    ),
  ).toEqual(['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'])
})

test('Often with lists the tags it shares transactions with and how often; a chip selects that tag', async () => {
  server.use(
    signedInAs(),
    tagsListed([lidl, party], { period: '3' }),
    http.get('/api/tags/:id', ({ params }) =>
      HttpResponse.json(
        params.id === '7'
          ? tagDetail({
              often_with: [
                { ...chip(party), transaction_count: 5 },
                { ...chip(zabka), transaction_count: 1 },
              ],
            })
          : tagDetail(),
      ),
    ),
  )
  const { router, user } = renderApp('/tags?period=3&tag=7')

  const details = await detailsOf('Lidl')
  expect(await within(details).findByText('Often with')).toBeInTheDocument()
  const chips = await within(details).findAllByRole('link', {
    name: /shared/,
  })
  expect(chips.map((link) => link.textContent)).toEqual(['Party5', 'Żabka1'])
  expect(chips[0]).toHaveAccessibleName('Party, 5 shared transactions')
  await user.click(chips[0] as HTMLElement)

  expect(router.state.location.search).toBe('?period=3&tag=8')
  expect(await detailsOf('Party')).toBeInTheDocument()
})

test('Recent shows the 3 newest transactions with their other tags, and View all opens every one, all time', async () => {
  const drinks = {
    id: 31,
    amount: 8_420,
    kind: 'expense' as const,
    date: '2026-10-09',
    description: 'Drinks for Saturday',
    tags: [chip(party), chip(lidl), chip(zabka)],
  }
  server.use(
    signedInAs(),
    tagsListed([lidl]),
    tagDetailShown(
      tagDetail({
        transaction_count: 7,
        recent: [
          drinks,
          {
            ...drinks,
            id: 30,
            description: 'Wine',
            date: '2026-10-02',
            tags: [chip(lidl)],
          },
          {
            ...drinks,
            id: 29,
            description: 'Refund',
            kind: 'income',
            amount: 1_500,
            date: '2026-10-01',
          },
        ],
      }),
    ),
  )

  renderApp('/tags?tag=7')

  const details = await detailsOf('Lidl')
  await within(details).findByText('Recent')
  expect(
    within(details)
      .getAllByRole('listitem')
      .map((row) => row.textContent),
  ).toEqual([
    'Drinks for SaturdayParty · Żabka · 9 Oct−84,20 PLN',
    'Wine2 Oct−84,20 PLN',
    'RefundParty · Żabka · 1 Oct+15,00 PLN',
  ])
  expect(
    within(details).getByRole('link', { name: 'View all 7' }),
  ).toHaveAttribute('href', '/transactions?period=all&tag=7')
})

test('the details say they are loading, under the tag name', async () => {
  server.use(
    signedInAs(),
    tagsListed([lidl]),
    http.get('/api/tags/:id', async () => {
      await delay('infinite')
      return HttpResponse.json(null)
    }),
  )

  renderApp('/tags?tag=7')

  const details = await detailsOf('Lidl')
  expect(details).toHaveAttribute('aria-busy', 'true')
  expect(
    within(details).getByText('Loading details for Lidl'),
  ).toBeInTheDocument()
})

test('details that fail to load offer to try again', async () => {
  server.use(
    signedInAs(),
    tagsListed([lidl]),
    http.get('/api/tags/:id', () => {
      server.use(tagDetailShown(tagDetail({ transaction_count: 7 })))
      return HttpResponse.json<Problem>(
        { type: 'about:blank', title: 'Bad request', status: 400 },
        { status: 400 },
      )
    }),
  )
  const { user } = renderApp('/tags?tag=7')

  const details = await detailsOf('Lidl')
  expect(await within(details).findByRole('alert')).toHaveTextContent(
    'Couldn’t load Lidl’s details.',
  )
  await user.click(within(details).getByRole('button', { name: 'Try again' }))

  expect(
    await within(details).findByRole('link', { name: 'View all 7' }),
  ).toBeInTheDocument()
})

test('a tag deleted elsewhere closes its details, drops from the address and from the list', async () => {
  server.use(
    signedInAs(),
    tagsListed([cinema, lidl], { period: '3' }),
    http.get('/api/tags/:id', () => {
      server.use(tagsListed([cinema], { period: '3' }))
      return HttpResponse.json<Problem>(
        { type: 'about:blank', title: 'Not found', status: 404 },
        { status: 404 },
      )
    }),
  )
  const { router } = renderApp('/tags?period=3&tag=7')

  await vi.waitFor(() => {
    expect(router.state.location.search).toBe('?period=3')
  })
  await vi.waitFor(() => {
    expect(
      screen.queryByRole('link', { name: /^Lidl/ }),
    ).not.toBeInTheDocument()
  })
  expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
})

test('the Group field moves the tag to the group picked', async () => {
  const shops = tagGroup(4, 'Shops')
  let moved: RequestBody<'updateTag'> | undefined
  server.use(
    signedInAs(),
    tagsListed([lidl], {}, [shops]),
    tagDetailShown(),
    http.patch('/api/tags/:id', async ({ request, params }) => {
      moved = (await request.json()) as RequestBody<'updateTag'>
      server.use(tagsListed([{ ...lidl, group_id: 4 }], {}, [shops]))
      return HttpResponse.json<Tag>({
        ...lidl,
        id: Number(params.id),
        group_id: 4,
      })
    }),
  )
  const { user } = renderApp('/tags?tag=7')
  const details = await detailsOf('Lidl')
  const group = await within(details).findByLabelText('Group')
  expect(
    within(group)
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual(['Shops', 'No group', 'New group…'])
  expect(group).toHaveDisplayValue('No group')

  await user.selectOptions(group, 'Shops')

  expect(moved).toEqual({ group_id: 4 })
  const shopsSection = await screen.findByRole('region', { name: 'Shops' })
  expect(
    within(shopsSection).getByRole('link', { name: /^Lidl/ }),
  ).toBeInTheDocument()
  expect(group).toHaveDisplayValue('Shops')
})

test('New group… in the details creates a group and moves the tag into it', async () => {
  let moved: RequestBody<'updateTag'> | undefined
  server.use(
    signedInAs(),
    tagsListed([lidl]),
    tagDetailShown(),
    http.post('/api/tag_groups', () => {
      server.use(tagsListed([lidl], {}, [tagGroup(5, 'Weekend')]))
      return HttpResponse.json({ id: 5, name: 'Weekend' }, { status: 201 })
    }),
    http.patch('/api/tags/:id', async ({ request }) => {
      moved = (await request.json()) as RequestBody<'updateTag'>
      server.use(
        tagsListed([{ ...lidl, group_id: 5 }], {}, [tagGroup(5, 'Weekend')]),
      )
      return HttpResponse.json<Tag>({ ...lidl, group_id: 5 })
    }),
  )
  const { user } = renderApp('/tags?tag=7')
  const details = await detailsOf('Lidl')

  await user.selectOptions(
    await within(details).findByLabelText('Group'),
    'New group…',
  )
  const dialog = screen.getByRole('dialog', { name: 'New group' })
  await user.type(within(dialog).getByLabelText('Name'), 'Weekend')
  await user.click(within(dialog).getByRole('button', { name: 'Create group' }))

  await vi.waitFor(() => {
    expect(moved).toEqual({ group_id: 5 })
  })
  expect(
    await screen.findByRole('region', { name: 'Weekend' }),
  ).toBeInTheDocument()
  expect(within(details).getByLabelText('Group')).toHaveDisplayValue('Weekend')
})
