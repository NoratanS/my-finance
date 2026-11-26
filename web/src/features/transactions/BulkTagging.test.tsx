import { act, screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, expect, onTestFinished, test, vi } from 'vitest'
import type { RequestBody } from '@/api/client'
import type { components } from '@/api/schema'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { type Problem, signedInAs } from '@/test/sessionHandlers'
import { type Tag, tag, tagGroup, tagsListed } from '@/test/tagHandlers'

type Transaction = components['schemas']['Transaction']
type TransactionPage = components['schemas']['TransactionPage']
type BulkTagging = components['schemas']['BulkTagging']
type BulkTaggingInput = RequestBody<'addTransactionTags'>

const groceries = tag(3, 'Groceries')
const biedronka = tag(7, 'Biedronka')
const food = tag(9, 'Food')

const row = (id: number, description: string): Transaction => ({
  id,
  amount: 1000,
  kind: 'expense',
  date: '2026-10-03',
  description,
  tags: [],
})
const rent = row(1, 'Rent')
const lidl = row(2, 'Lidl')
const cinema = row(3, 'Cinema')

// Page 1 holds Rent and Lidl unless given, page 2 Cinema.
const twoPages = (firstPage = [rent, lidl]) =>
  http.get('/api/transactions', ({ request }) => {
    const page = new URL(request.url).searchParams.get('page') ?? '1'
    return HttpResponse.json<TransactionPage>({
      data: page === '2' ? [cinema] : firstPage,
      meta: {
        page: Number(page),
        total_pages: 2,
        total_count: 3,
        period: '2026-10',
        totals: { expense: 3000, income: 0, net: -3000 },
        untagged_count: 3,
      },
    })
  })

beforeEach(() => {
  server.use(
    signedInAs({ currency_locked: true }),
    http.get('/api/transaction_months', () =>
      HttpResponse.json<string[]>(['2026-10']),
    ),
    tagsListed([groceries, biedronka, food]),
  )
})

// Every body sent to a bulk endpoint, answered with the given result.
const bulkAsked = (
  endpoint: 'transaction_tag_additions' | 'transaction_tag_removals',
  result: BulkTagging,
) => {
  const bodies: BulkTaggingInput[] = []
  server.use(
    http.post(`/api/${endpoint}`, async ({ request }) => {
      bodies.push((await request.json()) as BulkTaggingInput)
      return HttpResponse.json(result, { status: 201 })
    }),
  )
  return bodies
}

const toolbar = () =>
  screen.getByRole('toolbar', { name: /transactions? selected$/ })

const selectAll = () =>
  screen.getByRole('checkbox', { name: 'Select all on this page' })

test('Select all on this page is mixed while some rows are picked, and picks or clears them all', async () => {
  server.use(twoPages())
  const { user } = renderApp('/transactions')

  await user.click(await screen.findByRole('checkbox', { name: 'Select Rent' }))

  expect(selectAll()).toBePartiallyChecked()
  await user.click(selectAll())
  expect(screen.getByRole('checkbox', { name: 'Select Lidl' })).toBeChecked()
  expect(selectAll()).toBeChecked()
  await user.click(selectAll())
  expect(
    screen.getByRole('checkbox', { name: 'Select Rent' }),
  ).not.toBeChecked()
})

test('the selection clears when the page changes, and stays clear on Back', async () => {
  server.use(twoPages())
  const { user, router } = renderApp('/transactions')

  await user.click(await screen.findByRole('checkbox', { name: 'Select Rent' }))
  await user.click(screen.getByRole('button', { name: 'Next page' }))
  await screen.findByRole('checkbox', { name: 'Select Cinema' })
  await router.navigate(-1)

  expect(
    await screen.findByRole('checkbox', { name: 'Select Rent' }),
  ).not.toBeChecked()
  expect(selectAll()).not.toBePartiallyChecked()
})

test('the selection clears when a filter changes', async () => {
  server.use(twoPages())
  const { user } = renderApp('/transactions')

  await user.click(await screen.findByRole('checkbox', { name: 'Select Rent' }))
  await user.click(screen.getByRole('button', { name: 'Untagged · 3' }))

  expect(
    within(await screen.findByRole('table')).getByRole('checkbox', {
      name: 'Select Rent',
    }),
  ).not.toBeChecked()
})

test('the toolbar counts the selection, offers Add tags and Clear, and no Remove tags for rows without tags', async () => {
  server.use(twoPages())
  const { user } = renderApp('/transactions')

  await user.click(await screen.findByRole('checkbox', { name: 'Select Rent' }))
  await user.click(screen.getByRole('checkbox', { name: 'Select Lidl' }))

  expect(toolbar()).toHaveAccessibleName('2 transactions selected')
  expect(toolbar()).toHaveTextContent('2 selected')
  expect(
    within(toolbar()).getByRole('button', { name: 'Remove tags' }),
  ).toBeDisabled()
  await user.click(
    within(toolbar()).getByRole('button', { name: 'Clear selection' }),
  )
  expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  expect(selectAll()).not.toBeChecked()
})

test('adding tags sends the rows and tags picked, then says how many got them and how many were skipped', async () => {
  server.use(twoPages())
  const bodies = bulkAsked('transaction_tag_additions', {
    changed: [{ id: 1, tag_ids: [3, 7] }],
    skipped_ids: [2],
  })
  const { user } = renderApp('/transactions')

  await user.click(await screen.findByRole('checkbox', { name: 'Select Rent' }))
  await user.click(screen.getByRole('checkbox', { name: 'Select Lidl' }))
  await user.click(within(toolbar()).getByRole('button', { name: 'Add tags' }))
  const picker = screen.getByRole('dialog', {
    name: 'Add tags to 2 transactions',
  })
  expect(picker).toHaveTextContent('Existing tags stay. Nothing is replaced.')
  await user.type(
    within(picker).getByRole('textbox', { name: 'Find a tag' }),
    'gro',
  )
  await user.click(within(picker).getByRole('option', { name: 'Groceries' }))
  await user.clear(within(picker).getByRole('textbox', { name: 'Find a tag' }))
  await user.click(within(picker).getByRole('option', { name: 'Biedronka' }))
  await user.click(within(picker).getByRole('button', { name: 'Add 2 tags' }))

  expect(
    await screen.findByText('Added Biedronka and Groceries to 1 of 2'),
  ).toBeInTheDocument()
  expect(
    screen.getByText('Skipped 1 transaction that would pass 5 tags.'),
  ).toBeInTheDocument()
  expect(bodies).toEqual([{ transaction_ids: [1, 2], tag_ids: [3, 7] }])
  // Keyboard users land on the toast's first action, so Undo is a Tab away.
  expect(screen.getByRole('button', { name: 'Show them' })).toHaveFocus()
  // The action is done, so the selection and the picker go.
  expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('dialog', { name: /^Add tags/ }),
  ).not.toBeInTheDocument()
})

// Picks Rent and Lidl, then adds Groceries and Biedronka to them.
const addTwoTagsToTwoRows = async (
  user: ReturnType<typeof renderApp>['user'],
) => {
  await user.click(await screen.findByRole('checkbox', { name: 'Select Rent' }))
  await user.click(screen.getByRole('checkbox', { name: 'Select Lidl' }))
  await user.click(within(toolbar()).getByRole('button', { name: 'Add tags' }))
  const picker = screen.getByRole('dialog', { name: /^Add tags/ })
  await user.click(within(picker).getByRole('option', { name: 'Groceries' }))
  await user.click(within(picker).getByRole('option', { name: 'Biedronka' }))
  await user.click(within(picker).getByRole('button', { name: 'Add 2 tags' }))
}

test('Show them selects only the skipped rows and moves to the first', async () => {
  server.use(twoPages())
  bulkAsked('transaction_tag_additions', {
    changed: [{ id: 1, tag_ids: [3, 7] }],
    skipped_ids: [2],
  })
  const { user } = renderApp('/transactions')

  await addTwoTagsToTwoRows(user)
  await user.click(await screen.findByRole('button', { name: 'Show them' }))

  const lidlBox = screen.getByRole('checkbox', { name: 'Select Lidl' })
  expect(lidlBox).toBeChecked()
  expect(lidlBox).toHaveFocus()
  expect(
    screen.getByRole('checkbox', { name: 'Select Rent' }),
  ).not.toBeChecked()
  expect(toolbar()).toHaveAccessibleName('1 transaction selected')
})

test('Undo removes exactly the tags each row got, one call per set of tags', async () => {
  server.use(twoPages())
  bulkAsked('transaction_tag_additions', {
    // Lidl had Groceries already, so it only got Biedronka.
    changed: [
      { id: 1, tag_ids: [3, 7] },
      { id: 2, tag_ids: [7] },
    ],
    skipped_ids: [],
  })
  const removed = bulkAsked('transaction_tag_removals', {
    changed: [],
    skipped_ids: [],
  })
  const { user } = renderApp('/transactions')

  await addTwoTagsToTwoRows(user)
  expect(
    await screen.findByText('Added Biedronka and Groceries to 2 transactions'),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Show them' }),
  ).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Undo' }))

  expect(
    await screen.findByText('Undone: the tags are off again'),
  ).toBeInTheDocument()
  expect(removed).toEqual([
    { transaction_ids: [1], tag_ids: [3, 7] },
    { transaction_ids: [2], tag_ids: [7] },
  ])
})

test('when every row has the tags already, the toast says nothing was added and offers no Undo', async () => {
  const chips = [groceries, biedronka].map(({ id, name, colour }) => ({
    id,
    name,
    colour,
  }))
  server.use(twoPages([rent, lidl].map((shown) => ({ ...shown, tags: chips }))))
  bulkAsked('transaction_tag_additions', { changed: [], skipped_ids: [] })
  const { user } = renderApp('/transactions')

  await addTwoTagsToTwoRows(user)

  expect(
    await screen.findByText('Nothing to add: they already have these tags'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
})

test('when every row is skipped, the toast says no tags were added and offers Show them', async () => {
  server.use(twoPages())
  bulkAsked('transaction_tag_additions', { changed: [], skipped_ids: [1, 2] })
  const { user } = renderApp('/transactions')

  await addTwoTagsToTwoRows(user)

  expect(await screen.findByText('No tags added')).toBeInTheDocument()
  expect(
    screen.getByText('Skipped 2 transactions that would pass 5 tags.'),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Show them' })).toBeInTheDocument()
})

test('when the rows lacked the tags yet nothing changed, the toast says they changed elsewhere', async () => {
  server.use(twoPages())
  // The tags were deleted while the add was on its way.
  bulkAsked('transaction_tag_additions', { changed: [], skipped_ids: [] })
  const { user } = renderApp('/transactions')

  await addTwoTagsToTwoRows(user)

  expect(await screen.findByText('No tags added')).toBeInTheDocument()
  expect(
    screen.getByText('The transactions or tags changed elsewhere.'),
  ).toBeInTheDocument()
})

test('the toast leaves on its own, even with focus moved onto it', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  server.use(twoPages())
  bulkAsked('transaction_tag_additions', {
    changed: [{ id: 1, tag_ids: [3, 7] }],
    skipped_ids: [],
  })
  const { user } = renderApp('/transactions')
  await addTwoTagsToTwoRows(user)
  const undo = await screen.findByRole('button', { name: 'Undo' })
  expect(undo).toHaveFocus()

  act(() => {
    vi.advanceTimersByTime(8_000)
  })

  expect(undo).not.toBeInTheDocument()
})

test('a key pressed in the toast holds it until focus leaves', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  server.use(twoPages())
  bulkAsked('transaction_tag_additions', {
    changed: [{ id: 1, tag_ids: [3, 7] }],
    skipped_ids: [2],
  })
  const { user } = renderApp('/transactions')
  await addTwoTagsToTwoRows(user)
  const undo = await screen.findByRole('button', { name: 'Undo' })

  // From Show them, where focus landed, to Undo.
  await user.tab()
  act(() => {
    vi.advanceTimersByTime(60_000)
  })
  expect(undo).toHaveFocus()
  await user.tab()
  act(() => {
    vi.advanceTimersByTime(8_000)
  })

  expect(undo).not.toBeInTheDocument()
})

test('after Undo, the toast says so and still leaves on its own', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  onTestFinished(() => {
    vi.useRealTimers()
  })
  server.use(twoPages())
  bulkAsked('transaction_tag_additions', {
    changed: [{ id: 1, tag_ids: [3, 7] }],
    skipped_ids: [],
  })
  bulkAsked('transaction_tag_removals', { changed: [], skipped_ids: [] })
  const { user } = renderApp('/transactions')
  await addTwoTagsToTwoRows(user)

  await user.click(await screen.findByRole('button', { name: 'Undo' }))
  const undone = await screen.findByText('Undone: the tags are off again')
  act(() => {
    vi.advanceTimersByTime(8_000)
  })

  expect(undone).not.toBeInTheDocument()
})

test('closing the picker while the add is on its way still shows the result, with Undo', async () => {
  server.use(twoPages())
  let answer = () => {}
  const answered = new Promise<void>((resolve) => {
    answer = resolve
  })
  server.use(
    http.post('/api/transaction_tag_additions', async () => {
      await answered
      return HttpResponse.json<BulkTagging>(
        { changed: [{ id: 1, tag_ids: [3, 7] }], skipped_ids: [] },
        { status: 201 },
      )
    }),
  )
  const { user } = renderApp('/transactions')

  await addTwoTagsToTwoRows(user)
  await user.keyboard('{Escape}')
  answer()

  expect(
    await screen.findByRole('button', { name: 'Undo' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
})

test('a picker left open is gone after the page changes and a row is picked there', async () => {
  server.use(twoPages())
  const { user, router } = renderApp('/transactions')

  await user.click(await screen.findByRole('checkbox', { name: 'Select Rent' }))
  await user.click(within(toolbar()).getByRole('button', { name: 'Add tags' }))
  // Back or Forward moves the address with focus still in the picker.
  await act(() => router.navigate('/transactions?page=2'))
  await user.click(
    await screen.findByRole('checkbox', { name: 'Select Cinema' }),
  )

  expect(toolbar()).toBeInTheDocument()
  expect(
    screen.queryByRole('dialog', { name: /^Add tags/ }),
  ).not.toBeInTheDocument()
})

test('an Undo that only partly fails still reloads the list, and offers to try again', async () => {
  let listLoads = 0
  server.use(twoPages())
  // Registered last, so it sees each load first, then passes it on.
  server.use(
    http.get('/api/transactions', () => {
      listLoads += 1
      return undefined
    }),
  )
  bulkAsked('transaction_tag_additions', {
    changed: [
      { id: 1, tag_ids: [3, 7] },
      { id: 2, tag_ids: [7] },
    ],
    skipped_ids: [],
  })
  server.use(
    http.post('/api/transaction_tag_removals', async ({ request }) => {
      const body = (await request.json()) as BulkTaggingInput
      return body.tag_ids.length === 1
        ? HttpResponse.json(null, { status: 500 })
        : HttpResponse.json<BulkTagging>(
            { changed: [{ id: 1, tag_ids: [3, 7] }], skipped_ids: [] },
            { status: 201 },
          )
    }),
  )
  const { user } = renderApp('/transactions')
  await addTwoTagsToTwoRows(user)
  const undo = await screen.findByRole('button', { name: 'Undo' })
  const loadsBefore = listLoads
  await user.click(undo)

  expect(
    await screen.findByText('Couldn’t undo. Try again.'),
  ).toBeInTheDocument()
  await vi.waitFor(() => {
    expect(listLoads).toBeGreaterThan(loadsBefore)
  })
})

const chipsOf = (...tags: Tag[]) =>
  tags.map(({ id, name, colour }) => ({ id, name, colour }))
const shops = tagGroup(4, 'Shops')
const lidlTag = tag(11, 'Lidl', { group_id: shops.id })
const party = tag(12, 'Party')
// Rent carries Groceries and Party, Lidl carries Lidl and Party; Food and Biedronka are on neither.
const taggedRows = () =>
  twoPages([
    { ...rent, tags: chipsOf(party, groceries) },
    { ...lidl, tags: chipsOf(lidlTag, party) },
  ])

const openRemovePicker = async (user: ReturnType<typeof renderApp>['user']) => {
  await user.click(await screen.findByRole('checkbox', { name: 'Select Rent' }))
  await user.click(screen.getByRole('checkbox', { name: 'Select Lidl' }))
  await user.click(
    within(toolbar()).getByRole('button', { name: 'Remove tags' }),
  )
  return screen.getByRole('dialog', { name: 'Remove tags from 2 transactions' })
}

test('Remove tags lists only the tags the selected rows carry, A–Z, with how many carry each', async () => {
  server.use(
    tagsListed([groceries, biedronka, food, lidlTag, party], {}, [shops]),
    taggedRows(),
  )
  const { user } = renderApp('/transactions')

  const picker = await openRemovePicker(user)

  expect(picker).toHaveTextContent('Only tags these transactions carry.')
  expect(
    within(picker)
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual([
    'Groceries on 1 of 2',
    'Lidl · Shops on 1 of 2',
    'Party on 2 of 2',
  ])
  expect(picker).toHaveTextContent('Other tags stay.')
  expect(
    within(toolbar()).getByRole('button', { name: 'Remove tags' }),
  ).toHaveAttribute('aria-expanded', 'true')
})

test('removing tags sends the rows and tags picked, then says what went from how many', async () => {
  server.use(taggedRows())
  const bodies = bulkAsked('transaction_tag_removals', {
    changed: [
      { id: 1, tag_ids: [12] },
      { id: 2, tag_ids: [12] },
    ],
    skipped_ids: [],
  })
  const { user } = renderApp('/transactions')

  const picker = await openRemovePicker(user)
  await user.click(within(picker).getByRole('option', { name: /^Party/ }))
  await user.click(within(picker).getByRole('button', { name: 'Remove 1 tag' }))

  expect(
    await screen.findByText('Removed Party from 2 transactions'),
  ).toBeInTheDocument()
  expect(bodies).toEqual([{ transaction_ids: [1, 2], tag_ids: [12] }])
  expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus()
  expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('dialog', { name: /^Remove tags/ }),
  ).not.toBeInTheDocument()
})

test('removing several tags names how many, counting only the rows that lost one', async () => {
  server.use(taggedRows())
  // Lidl lost Party elsewhere while the removal was on its way.
  bulkAsked('transaction_tag_removals', {
    changed: [{ id: 1, tag_ids: [3, 12] }],
    skipped_ids: [],
  })
  const { user } = renderApp('/transactions')

  const picker = await openRemovePicker(user)
  await user.click(within(picker).getByRole('option', { name: /^Groceries/ }))
  await user.click(within(picker).getByRole('option', { name: /^Party/ }))
  await user.click(
    within(picker).getByRole('button', { name: 'Remove 2 tags' }),
  )

  expect(
    await screen.findByText('Removed 2 tags from 1 transaction'),
  ).toBeInTheDocument()
})

// Picks Rent and Lidl, then removes Groceries and Party from them.
const removeTwoTagsFromTwoRows = async (
  user: ReturnType<typeof renderApp>['user'],
) => {
  const picker = await openRemovePicker(user)
  await user.click(within(picker).getByRole('option', { name: /^Groceries/ }))
  await user.click(within(picker).getByRole('option', { name: /^Party/ }))
  await user.click(
    within(picker).getByRole('button', { name: 'Remove 2 tags' }),
  )
}

test('Undo adds back exactly the tags each row lost, one call per set of tags', async () => {
  server.use(taggedRows())
  // Lidl had no Groceries, so it only lost Party.
  bulkAsked('transaction_tag_removals', {
    changed: [
      { id: 1, tag_ids: [3, 12] },
      { id: 2, tag_ids: [12] },
    ],
    skipped_ids: [],
  })
  // Each call puts back what it was sent.
  const added: BulkTaggingInput[] = []
  server.use(
    http.post('/api/transaction_tag_additions', async ({ request }) => {
      const body = (await request.json()) as BulkTaggingInput
      added.push(body)
      return HttpResponse.json<BulkTagging>(
        {
          changed: body.transaction_ids.map((id) => ({
            id,
            tag_ids: body.tag_ids,
          })),
          skipped_ids: [],
        },
        { status: 201 },
      )
    }),
  )
  const { user } = renderApp('/transactions')

  await removeTwoTagsFromTwoRows(user)
  await user.click(await screen.findByRole('button', { name: 'Undo' }))

  expect(
    await screen.findByText('Undone: the tags are back'),
  ).toBeInTheDocument()
  expect(added).toEqual([
    { transaction_ids: [1], tag_ids: [3, 12] },
    { transaction_ids: [2], tag_ids: [12] },
  ])
})

test('an Undo that skips every row says no tags came back, counting them across every set of tags', async () => {
  server.use(taggedRows())
  bulkAsked('transaction_tag_removals', {
    changed: [
      { id: 1, tag_ids: [3, 12] },
      { id: 2, tag_ids: [12] },
    ],
    skipped_ids: [],
  })
  // Both rows got new tags meanwhile, so each call skips its row.
  server.use(
    http.post('/api/transaction_tag_additions', async ({ request }) => {
      const body = (await request.json()) as BulkTaggingInput
      return HttpResponse.json<BulkTagging>(
        { changed: [], skipped_ids: body.transaction_ids },
        { status: 201 },
      )
    }),
  )
  const { user } = renderApp('/transactions')

  await removeTwoTagsFromTwoRows(user)
  await user.click(await screen.findByRole('button', { name: 'Undo' }))

  expect(await screen.findByText('No tags came back')).toBeInTheDocument()
  expect(
    screen.getByText('Skipped 2 transactions that would pass 5 tags.'),
  ).toBeInTheDocument()
})

test('an Undo of a removal that only partly fails still reloads the list, and offers to try again', async () => {
  let listLoads = 0
  server.use(taggedRows())
  server.use(
    http.get('/api/transactions', () => {
      listLoads += 1
      return undefined
    }),
  )
  bulkAsked('transaction_tag_removals', {
    changed: [
      { id: 1, tag_ids: [3, 12] },
      { id: 2, tag_ids: [12] },
    ],
    skipped_ids: [],
  })
  server.use(
    http.post('/api/transaction_tag_additions', async ({ request }) => {
      const body = (await request.json()) as BulkTaggingInput
      return body.tag_ids.length === 1
        ? HttpResponse.json(null, { status: 500 })
        : HttpResponse.json<BulkTagging>(
            { changed: [{ id: 1, tag_ids: [3, 12] }], skipped_ids: [] },
            { status: 201 },
          )
    }),
  )
  const { user } = renderApp('/transactions')
  await removeTwoTagsFromTwoRows(user)
  const undo = await screen.findByRole('button', { name: 'Undo' })
  const loadsBefore = listLoads
  await user.click(undo)

  expect(
    await screen.findByText('Couldn’t undo. Try again.'),
  ).toBeInTheDocument()
  expect(undo).toBeInTheDocument()
  await vi.waitFor(() => {
    expect(listLoads).toBeGreaterThan(loadsBefore)
  })
})

test('when no row lost a tag, the toast says none were removed and offers no Undo', async () => {
  server.use(taggedRows())
  // The tags went elsewhere while the removal was on its way.
  bulkAsked('transaction_tag_removals', { changed: [], skipped_ids: [] })
  const { user } = renderApp('/transactions')

  await removeTwoTagsFromTwoRows(user)

  expect(await screen.findByText('No tags removed')).toBeInTheDocument()
  expect(
    screen.getByText('The transactions or tags changed elsewhere.'),
  ).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument()
})

test('at most 5 tags can be picked for removal; the rest wait until one is let go', async () => {
  const rail = tag(13, 'Rail')
  server.use(
    tagsListed([groceries, biedronka, food, lidlTag, party, rail], {}, [shops]),
    twoPages([
      { ...rent, tags: chipsOf(groceries, biedronka, food, lidlTag, party) },
      { ...lidl, tags: chipsOf(rail) },
    ]),
  )
  const { user } = renderApp('/transactions')

  const picker = await openRemovePicker(user)
  for (const name of [/^Biedronka/, /^Food/, /^Groceries/, /^Lidl/, /^Party/])
    await user.click(within(picker).getByRole('option', { name }))
  const railOption = within(picker).getByRole('option', { name: /^Rail/ })
  await user.click(railOption)

  expect(railOption).toHaveAttribute('aria-disabled', 'true')
  expect(railOption).toHaveAttribute('aria-selected', 'false')
  expect(picker).toHaveTextContent('Remove up to 5 tags at a time.')
  expect(
    within(picker).getByRole('button', { name: 'Remove 5 tags' }),
  ).toBeInTheDocument()
  await user.click(within(picker).getByRole('option', { name: /^Food/ }))
  await user.click(railOption)
  expect(railOption).toHaveAttribute('aria-selected', 'true')
})

test('closing the remove picker while the removal is on its way still shows the result, with Undo', async () => {
  server.use(taggedRows())
  let answer = () => {}
  const answered = new Promise<void>((resolve) => {
    answer = resolve
  })
  server.use(
    http.post('/api/transaction_tag_removals', async () => {
      await answered
      return HttpResponse.json<BulkTagging>(
        { changed: [{ id: 1, tag_ids: [3, 12] }], skipped_ids: [] },
        { status: 201 },
      )
    }),
  )
  const { user } = renderApp('/transactions')

  await removeTwoTagsFromTwoRows(user)
  await user.keyboard('{Escape}')
  expect(
    screen.queryByRole('dialog', { name: /^Remove tags/ }),
  ).not.toBeInTheDocument()
  answer()

  expect(
    await screen.findByText('Removed 2 tags from 1 transaction'),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument()
  expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
})

test('only one picker is open at a time', async () => {
  server.use(taggedRows())
  const { user } = renderApp('/transactions')
  const addTags = () =>
    within(toolbar()).getByRole('button', { name: 'Add tags' })
  const removeTags = () =>
    within(toolbar()).getByRole('button', { name: 'Remove tags' })

  await openRemovePicker(user)
  expect(addTags()).toHaveAttribute('aria-expanded', 'false')
  await user.click(addTags())

  expect(screen.getByRole('dialog', { name: /^Add tags/ })).toBeInTheDocument()
  expect(
    screen.queryByRole('dialog', { name: /^Remove tags/ }),
  ).not.toBeInTheDocument()
  expect(addTags()).toHaveAttribute('aria-expanded', 'true')
  expect(removeTags()).toHaveAttribute('aria-expanded', 'false')
  await user.click(removeTags())
  expect(
    screen.queryByRole('dialog', { name: /^Add tags/ }),
  ).not.toBeInTheDocument()
  expect(
    screen.getByRole('dialog', { name: /^Remove tags/ }),
  ).toBeInTheDocument()
})

test('a removal closes its picker and shows the toast without waiting for the tags to reload', async () => {
  let removedYet = false
  server.use(
    twoPages([
      { ...rent, tags: chipsOf(party) },
      { ...lidl, tags: chipsOf(party) },
    ]),
  )
  const held = new Promise<never>(() => {})
  server.use(
    http.get('/api/tags', async () => {
      if (removedYet) await held
      return undefined
    }),
  )
  server.use(
    http.post('/api/transaction_tag_removals', () => {
      // From now on the rows come back bare, and the tags list doesn't answer.
      removedYet = true
      server.use(twoPages())
      return HttpResponse.json<BulkTagging>(
        {
          changed: [
            { id: 1, tag_ids: [12] },
            { id: 2, tag_ids: [12] },
          ],
          skipped_ids: [],
        },
        { status: 201 },
      )
    }),
  )
  const { user } = renderApp('/transactions')

  const picker = await openRemovePicker(user)
  await user.click(within(picker).getByRole('option', { name: /^Party/ }))
  await user.click(within(picker).getByRole('button', { name: 'Remove 1 tag' }))

  expect(
    await screen.findByText('Removed Party from 2 transactions'),
  ).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus()
  expect(
    screen.queryByRole('dialog', { name: /^Remove tags/ }),
  ).not.toBeInTheDocument()
})

test('an Undo of a removal whose tags went elsewhere says there was nothing to undo', async () => {
  server.use(taggedRows())
  bulkAsked('transaction_tag_removals', {
    changed: [{ id: 1, tag_ids: [12] }],
    skipped_ids: [],
  })
  // Party was deleted meanwhile.
  bulkAsked('transaction_tag_additions', { changed: [], skipped_ids: [] })
  const { user } = renderApp('/transactions')

  const picker = await openRemovePicker(user)
  await user.click(within(picker).getByRole('option', { name: /^Party/ }))
  await user.click(within(picker).getByRole('button', { name: 'Remove 1 tag' }))
  await user.click(await screen.findByRole('button', { name: 'Undo' }))

  expect(await screen.findByText('Nothing to undo')).toBeInTheDocument()
  expect(
    screen.getByText('The transactions or tags changed elsewhere.'),
  ).toBeInTheDocument()
})

test('the open picker’s button is the accent one: Remove tags while removing, Add tags otherwise', async () => {
  server.use(taggedRows())
  const { user } = renderApp('/transactions')
  const addTags = () =>
    within(toolbar()).getByRole('button', { name: 'Add tags' })
  const removeTags = () =>
    within(toolbar()).getByRole('button', { name: 'Remove tags' })

  await openRemovePicker(user)
  expect(removeTags()).toHaveClass('bg-accent')
  expect(addTags()).not.toHaveClass('bg-accent')
  await user.keyboard('{Escape}')

  expect(addTags()).toHaveClass('bg-accent')
  expect(removeTags()).not.toHaveClass('bg-accent')
})

test('while the tags are on their way, the Add tags picker says they are loading', async () => {
  server.use(
    twoPages(),
    http.get('/api/tags', async () => {
      await delay('infinite')
      return HttpResponse.json(null)
    }),
  )
  const { user } = renderApp('/transactions')

  await user.click(await screen.findByRole('checkbox', { name: 'Select Rent' }))
  await user.click(within(toolbar()).getByRole('button', { name: 'Add tags' }))

  const picker = screen.getByRole('dialog', { name: /^Add tags/ })
  expect(within(picker).getByText('Loading your tags…')).toHaveAttribute(
    'role',
    'status',
  )
  expect(picker).toHaveTextContent('Existing tags stay. Nothing is replaced.')
})

test('tags that fail to load show in the Add tags picker with Try again, which fills its options', async () => {
  server.use(
    twoPages(),
    http.get('/api/tags', () =>
      HttpResponse.json<Problem>(
        { type: 'about:blank', title: 'Not found', status: 404 },
        { status: 404 },
      ),
    ),
  )
  const { user } = renderApp('/transactions')
  await user.click(await screen.findByRole('checkbox', { name: 'Select Rent' }))
  await user.click(within(toolbar()).getByRole('button', { name: 'Add tags' }))
  const picker = screen.getByRole('dialog', { name: /^Add tags/ })

  expect(await within(picker).findByRole('alert')).toHaveTextContent(
    'Couldn’t load your tags.',
  )
  server.use(tagsListed([groceries, biedronka, food]))
  await user.click(within(picker).getByRole('button', { name: 'Try again' }))

  expect(
    await within(picker).findByRole('option', { name: 'Groceries' }),
  ).toBeInTheDocument()
  expect(within(picker).queryByRole('alert')).not.toBeInTheDocument()
})
