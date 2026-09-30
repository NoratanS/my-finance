import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { expect, test } from 'vitest';
import App from './App';
import type {
  ActiveProfileResponse,
  BudgetResponse,
  CategoryNode,
  CategoryTotal,
  CategoryTransactionCount,
  Insight,
  SessionResponse,
  TransactionPage,
  TransactionSummary,
} from './api/types';
import { categoryTree, session } from './test/fixtures';
import { renderWithProviders } from './test/renderWithProviders';
import { problem, server } from './test/server';

// The route gates and the global Session listener, at the network seam: the real hooks and
// client run, and each test declares the answers its target screen needs.

const [food] = categoryTree([{ id: 3, name: 'Food' }]);

/** The Categories screen's network conversation, besides the Session. */
const categoriesAnswers = [
  http.get('/api/categories', () => HttpResponse.json<CategoryNode[]>([food])),
  http.get('/api/transactions/category-counts', () =>
    HttpResponse.json<CategoryTransactionCount[]>([]),
  ),
];

/** The Dashboard's network conversation, besides the Session, answered empty. */
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

function answerSession(answer: SessionResponse) {
  server.use(http.get('/api/auth/me', () => HttpResponse.json<SessionResponse>(answer)));
}

function signedOut() {
  server.use(
    http.get('/api/auth/me', () =>
      problem(401, 'unauthenticated', 'Log in with POST /api/auth/login first.'),
    ),
  );
}

const signInScreen = () => screen.findByRole('heading', { name: 'Sign in' });
const picker = () => screen.findByRole('heading', { name: 'Choose a profile' });
const categoriesScreen = () => screen.findByRole('heading', { name: 'Categories' });

test('shows the loading splash while the Session is pending', async () => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  server.use(
    http.get('/api/auth/me', async () => {
      await held;
      return HttpResponse.json<SessionResponse>(session());
    }),
    ...categoriesAnswers,
  );

  renderWithProviders(<App />, { route: '/categories' });

  expect(await screen.findByText('Loading…')).toBeInTheDocument();
  release();
  expect(await categoriesScreen()).toBeInTheDocument();
});

test.each(['/categories', '/picker'])('signed out, %s shows the sign-in screen', async (route) => {
  signedOut();

  renderWithProviders(<App />, { route });

  expect(await signInScreen()).toBeInTheDocument();
});

test('without an Active profile, an app route shows the picker, and picking a Profile returns to that route', async () => {
  answerSession(session({ activeProfileId: null }));
  const switches: unknown[] = [];
  server.use(
    http.put('/api/auth/active-profile', async ({ request }) => {
      switches.push(await request.json());
      return HttpResponse.json<ActiveProfileResponse>({
        activeProfileId: 1,
        profile: { id: 1, name: 'Household', defaultCurrency: 'PLN' },
      });
    }),
    ...categoriesAnswers,
  );
  renderWithProviders(<App />, { route: '/categories' });
  expect(await picker()).toBeInTheDocument();

  await userEvent.click(screen.getByRole('button', { name: /Household/ }));

  expect(await categoriesScreen()).toBeInTheDocument();
  expect(switches).toEqual([{ profileId: 1 }]);
});

test('without an Active profile, the sign-in route shows the picker', async () => {
  answerSession(session({ activeProfileId: null }));

  renderWithProviders(<App />, { route: '/auth' });

  expect(await picker()).toBeInTheDocument();
});

test('with an Active profile, the sign-in route shows the app', async () => {
  server.use(...dashboardAnswers);

  renderWithProviders(<App />, { route: '/auth' });

  expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
});

test('a Session that expires mid-use shows the sign-in screen', async () => {
  server.use(
    http.get('/api/categories', () =>
      problem(401, 'unauthenticated', 'Log in with POST /api/auth/login first.'),
    ),
    ...categoriesAnswers,
  );

  renderWithProviders(<App />, { route: '/categories' });

  expect(await signInScreen()).toBeInTheDocument();
});

test('losing the Active profile mid-use shows the picker', async () => {
  server.use(
    http.get('/api/categories', () => problem(409, 'no-active-profile', 'Choose a profile first.')),
    ...categoriesAnswers,
  );

  renderWithProviders(<App />, { route: '/categories' });

  expect(await picker()).toBeInTheDocument();
});

test('"Log out" signs out and shows the sign-in screen', async () => {
  const signOuts: string[] = [];
  server.use(
    http.post('/api/auth/logout', ({ request }) => {
      signOuts.push(request.method);
      return new HttpResponse(null, { status: 204 });
    }),
    ...categoriesAnswers,
  );
  renderWithProviders(<App />, { route: '/categories' });
  await categoriesScreen();

  await userEvent.click(screen.getByRole('button', { name: 'Log out' }));

  expect(await signInScreen()).toBeInTheDocument();
  expect(signOuts).toEqual(['POST']);
});
