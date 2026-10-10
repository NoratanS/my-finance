import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { expect, test } from 'vitest';
import App from './App';
import { forgetProfile, rememberedProfileId, rememberProfile } from './api/activeProfile';
import type {
  BudgetResponse,
  CategoryNode,
  CategoryTotal,
  CategoryTransactionCount,
  Insight,
  ProfileResponse,
  TransactionPage,
  TransactionSummary,
} from './api/types';
import { categoryTree, profile } from './test/fixtures';
import { renderWithProviders } from './test/renderWithProviders';
import { answerProfiles, problem, server } from './test/server';

// The route gates, at the network seam: the real hooks and client run, and each test declares
// the answers its target screen needs. What opens is decided by the profile list and by the
// Profile this tab remembers.

const [food] = categoryTree([{ id: 3, name: 'Food' }]);
const company = profile({ id: 2, name: 'Company', defaultCurrency: 'EUR' });

/** The Categories screen's network conversation, besides the profile list. */
const categoriesAnswers = [
  http.get('/api/categories', () => HttpResponse.json<CategoryNode[]>([food])),
  http.get('/api/transactions/category-counts', () =>
    HttpResponse.json<CategoryTransactionCount[]>([]),
  ),
];

/** The Dashboard's network conversation, besides the profile list, answered empty. */
const dashboardAnswers = [
  http.get('/api/categories', () => HttpResponse.json<CategoryNode[]>([])),
  http.get('/api/transactions/summary', () => HttpResponse.json<TransactionSummary[]>([])),
  http.get('/api/transactions/category-totals', () => HttpResponse.json<CategoryTotal[]>([])),
  http.get('/api/transactions', () =>
    HttpResponse.json<TransactionPage>({
      content: [],
      page: 0,
      size: 6,
      totalElements: 0,
      totalPages: 0,
    }),
  ),
  http.get('/api/budgets', () => HttpResponse.json<BudgetResponse[]>([])),
  http.get('/api/insights', () => HttpResponse.json<Insight[]>([])),
];

/**
 * An instance with no Profiles, and the answer to creating `created` in it. Returns what was
 * posted. The list is not asked for again afterwards: the app adds the created Profile to it.
 */
function emptyInstanceCreating(created: ProfileResponse) {
  const posted: unknown[] = [];
  answerProfiles();
  server.use(
    http.post('/api/profiles', async ({ request }) => {
      posted.push(await request.json());
      return HttpResponse.json<ProfileResponse>(created, { status: 201 });
    }),
  );
  return posted;
}

const picker = () => screen.findByRole('heading', { name: 'Choose a profile' });
const firstProfileScreen = () =>
  screen.findByRole('heading', { name: 'Create your first profile' });
const categoriesScreen = () => screen.findByRole('heading', { name: 'Categories' });

test('shows the loading splash while the profile list is pending', async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  server.use(
    http.get('/api/profiles', async () => {
      await held;
      return HttpResponse.json<ProfileResponse[]>([profile()]);
    }),
    ...categoriesAnswers,
  );

  renderWithProviders(<App />, { route: '/categories' });

  expect(await screen.findByText('Loading…')).toBeInTheDocument();
  release();
  expect(await categoriesScreen()).toBeInTheDocument();
});

// — Opening the app —

test('a remembered Profile that is in the list opens the app', async () => {
  server.use(...dashboardAnswers);

  renderWithProviders(<App />);

  expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
});

test('a remembered Profile that is not in the list shows the picker and is forgotten', async () => {
  rememberProfile(41);

  renderWithProviders(<App />, { route: '/categories' });

  expect(await picker()).toBeInTheDocument();
  await waitFor(() => expect(rememberedProfileId()).toBeNull());
});

test.each(['/', '/categories', '/picker'])(
  'with no Profile remembered, %s shows the picker',
  async (route) => {
    forgetProfile();

    renderWithProviders(<App />, { route });

    expect(await picker()).toBeInTheDocument();
  },
);

test('an instance with no Profiles shows the first-profile screen, and creating a Profile opens it', async () => {
  forgetProfile();
  const posted = emptyInstanceCreating(company);
  const namedProfiles: (string | null)[] = [];
  server.use(
    http.get('/api/categories', ({ request }) => {
      namedProfiles.push(request.headers.get('X-Profile-Id'));
      return HttpResponse.json<CategoryNode[]>([]);
    }),
    ...dashboardAnswers,
  );
  const user = userEvent.setup();
  renderWithProviders(<App />);
  expect(await firstProfileScreen()).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Choose a profile' })).not.toBeInTheDocument();

  await user.type(screen.getByLabelText('Profile name'), 'Company');
  await user.selectOptions(screen.getByLabelText('Default currency'), 'EUR');
  await user.click(screen.getByRole('button', { name: 'Create' }));

  expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  expect(posted).toEqual([{ name: 'Company', defaultCurrency: 'EUR' }]);
  expect(rememberedProfileId()).toBe(2);
  expect(namedProfiles[0]).toBe('2');
});

// — Deep links —

test('with no Active profile, an app route shows the picker, and picking a Profile returns to that route', async () => {
  forgetProfile();
  const namedProfiles: (string | null)[] = [];
  server.use(
    http.get('/api/categories', ({ request }) => {
      namedProfiles.push(request.headers.get('X-Profile-Id'));
      return HttpResponse.json<CategoryNode[]>([food]);
    }),
    ...categoriesAnswers,
  );
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: '/categories' });
  expect(await picker()).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /Household/ }));

  expect(await categoriesScreen()).toBeInTheDocument();
  expect(rememberedProfileId()).toBe(1);
  expect(namedProfiles[0]).toBe('1');
});

test('on an instance with no Profiles, a deep link is honoured once the first Profile is created', async () => {
  forgetProfile();
  emptyInstanceCreating(company);
  server.use(...categoriesAnswers);
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: '/categories' });
  expect(await firstProfileScreen()).toBeInTheDocument();

  await user.type(screen.getByLabelText('Profile name'), 'Company');
  await user.click(screen.getByRole('button', { name: 'Create' }));

  expect(await categoriesScreen()).toBeInTheDocument();
  expect(rememberedProfileId()).toBe(2);
});

// — Losing the Active profile —

test('a no-active-profile Problem sends the owner to the picker and forgets the remembered Profile', async () => {
  server.use(
    http.get('/api/categories', () =>
      problem(409, 'no-active-profile', 'Name an existing profile in the X-Profile-Id header.'),
    ),
    ...categoriesAnswers,
  );

  renderWithProviders(<App />, { route: '/categories' });

  expect(await picker()).toBeInTheDocument();
  expect(rememberedProfileId()).toBeNull();
});

test('after a no-active-profile Problem the picker asks for the profile list again', async () => {
  // The Profile this tab worked in was deleted elsewhere: the page load still listed it, and
  // when the picker asks again only "Company" is left.
  answerProfiles(company);
  server.use(
    http.get('/api/profiles', () => HttpResponse.json<ProfileResponse[]>([profile(), company]), {
      once: true,
    }),
    http.get('/api/categories', () =>
      problem(409, 'no-active-profile', 'Name an existing profile in the X-Profile-Id header.'),
    ),
    ...categoriesAnswers,
  );

  renderWithProviders(<App />, { route: '/categories' });

  expect(await picker()).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /Household/ })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('button', { name: /Company/ })).toBeInTheDocument();
});

// — A list answer that arrives late —
// The picker asks for the profile list again when it opens. If that answer is still on its way
// when a Profile is created or deleted, it describes the instance as it was before.

test('a list answer that was on its way when the first Profile was created does not undo it', async () => {
  forgetProfile();
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  server.use(
    http.get('/api/profiles', async () => {
      await held;
      return HttpResponse.json<ProfileResponse[]>([]);
    }),
    http.post('/api/profiles', () => HttpResponse.json<ProfileResponse>(company, { status: 201 })),
    ...dashboardAnswers,
  );
  // The page load's own answer comes at once; the picker's question is the one held open.
  server.use(
    http.get('/api/profiles', () => HttpResponse.json<ProfileResponse[]>([]), { once: true }),
  );
  const user = userEvent.setup();
  renderWithProviders(<App />);
  await firstProfileScreen();

  await user.type(screen.getByLabelText('Profile name'), 'Company');
  await user.click(screen.getByRole('button', { name: 'Create' }));
  expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  release();

  await expect(
    screen.findByRole('heading', { name: 'Create your first profile' }, { timeout: 300 }),
  ).rejects.toThrow();
  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  expect(rememberedProfileId()).toBe(2);
});

test('a list answer that was on its way when a Profile was deleted does not bring its card back', async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  server.use(
    http.get('/api/profiles', async () => {
      await held;
      return HttpResponse.json<ProfileResponse[]>([profile(), company]);
    }),
    http.delete('/api/profiles/2', () => new HttpResponse(null, { status: 204 })),
  );
  server.use(
    http.get('/api/profiles', () => HttpResponse.json<ProfileResponse[]>([profile(), company]), {
      once: true,
    }),
  );
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: '/picker' });
  await picker();

  await user.click(screen.getAllByRole('button', { name: 'Delete profile' })[1]);
  await user.type(screen.getByLabelText(/to confirm/), 'Company');
  await user.click(screen.getByRole('button', { name: 'Delete' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /^Company/ })).not.toBeInTheDocument(),
  );
  release();

  await expect(
    screen.findByRole('button', { name: /^Company/ }, { timeout: 300 }),
  ).rejects.toThrow();
});

// — The profile list cannot be loaded —

test('when the profile list cannot be loaded the app says so, and loads it on "Try again"', async () => {
  server.use(
    http.get('/api/profiles', () => HttpResponse.error()),
    ...categoriesAnswers,
  );
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: '/categories' });

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Something went wrong — is the backend running?',
  );
  expect(
    screen.queryByRole('heading', { name: 'Create your first profile' }),
  ).not.toBeInTheDocument();

  answerProfiles(profile());
  await user.click(screen.getByRole('button', { name: 'Try again' }));

  expect(await categoriesScreen()).toBeInTheDocument();
});

// — Navigation —

test('switching Profile in the navigation stays on the screen and names the new Profile from then on', async () => {
  answerProfiles(profile(), company);
  const namedProfiles: (string | null)[] = [];
  server.use(
    http.get('/api/categories', ({ request }) => {
      namedProfiles.push(request.headers.get('X-Profile-Id'));
      return HttpResponse.json<CategoryNode[]>([food]);
    }),
    ...categoriesAnswers,
  );
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: '/categories' });
  await categoriesScreen();
  expect(namedProfiles).toEqual(['1']);

  await user.selectOptions(screen.getByLabelText('Active profile'), 'Company · EUR');

  await waitFor(() => expect(namedProfiles).toEqual(['1', '2']));
  expect(rememberedProfileId()).toBe(2);
  expect(screen.getByRole('heading', { name: 'Categories' })).toBeInTheDocument();
});

test('"Switch profile…" in the navigation opens the picker with a way back', async () => {
  server.use(...categoriesAnswers, ...dashboardAnswers);
  const user = userEvent.setup();
  renderWithProviders(<App />, { route: '/categories' });
  await categoriesScreen();

  await user.selectOptions(screen.getByLabelText('Active profile'), 'Switch profile…');

  expect(await picker()).toBeInTheDocument();
  expect(rememberedProfileId()).toBe(1);
  await user.click(screen.getByRole('button', { name: '← Back' }));
  expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
});

test('an unknown address opens the app', async () => {
  server.use(...dashboardAnswers);

  renderWithProviders(<App />, { route: '/no-such-screen' });

  expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
});
