import { screen, within } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'
import type { components } from '@/api/schema'
import { server } from '@/test/server'
import { renderApp } from '@/test/renderApp'
import { type Problem, signedInAs } from '@/test/sessionHandlers'

type Tag = components['schemas']['Tag']
type TagList = components['schemas']['TagList']

const cinema: Tag = { id: 1, name: 'Cinema', colour: null }
const groceries: Tag = { id: 2, name: 'Groceries', colour: 'mint' }
const zabka: Tag = { id: 3, name: 'Żabka', colour: 'sky' }

const listed = (data: Tag[]) =>
  http.get('/api/tags', () => HttpResponse.json<TagList>({ data }))

const dotOf = (card: HTMLElement) => card.querySelector('[aria-hidden="true"]')

test('the page shows my tags as cards under No group, each with its colour dot and name, in the API’s order', async () => {
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

test('with no tags yet, the page invites building a set', async () => {
  server.use(signedInAs(), listed([]))

  renderApp('/tags')

  const empty = await screen.findByRole('region', {
    name: 'Build your own set of tags',
  })
  expect(empty).toHaveTextContent(
    'A tag is any label you want to total up later: a topic, a shop, an occasion. Transactions can wait untagged until you’ve decided.',
  )
  expect(
    within(empty).getByRole('button', { name: 'New tag' }),
  ).toBeInTheDocument()
  expect(screen.queryByLabelText('Search tags')).not.toBeInTheDocument()
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

test('tags that fail to load offer to try again', async () => {
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
  await user.click(screen.getByRole('button', { name: 'Try again' }))

  expect(await screen.findByText('Cinema')).toBeInTheDocument()
})
