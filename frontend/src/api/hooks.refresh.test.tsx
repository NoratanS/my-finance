import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http, HttpResponse, type HttpResponseResolver } from 'msw';
import type { ReactNode } from 'react';
import { expect, test } from 'vitest';
import { categoryTree, insight, session } from '../test/fixtures';
import { server } from '../test/server';
import {
  useBudgets,
  useBudgetStatuses,
  useCategories,
  useCategoryCounts,
  useCategoryTotals,
  useCreateProfile,
  useDeleteBudget,
  useDeleteInsight,
  useDeleteProfile,
  useDeleteSubscription,
  useDeleteTransaction,
  useInsight,
  useInsightResults,
  useInsights,
  useMerchantSuggestions,
  useRenameProfile,
  useRestoreBackup,
  useSession,
  useSubscriptionDashboard,
  useSubscriptions,
  useTransactions,
  useTransactionSummary,
  useUpdateCategory,
} from './hooks';
import type {
  BackupRestoreResponse,
  BudgetResponse,
  BudgetStatusResponse,
  CategoryNode,
  CategoryTotal,
  CategoryTransactionCount,
  Insight,
  MerchantSuggestion,
  ProfileResponse,
  ResultEnvelope,
  SessionResponse,
  SubscriptionDashboardResponse,
  SubscriptionResponse,
  TransactionPage,
  TransactionSummary,
} from './types';

// The refresh contract: after a mutation, every mounted view of the data it changed asks the
// server again. Observed over the wire (how many times each query's request arrived), never
// through cache state or query keys. A refresh only re-runs mounted queries, so each test
// mounts every query its mutation family must refresh.

// — Canned answers, local to this file —

const tree = categoryTree([{ id: 3, name: 'Food' }]);

const emptyPage: TransactionPage = {
  content: [],
  page: 0,
  size: 20,
  totalElements: 0,
  totalPages: 0,
};

const budget: BudgetResponse = {
  id: 5,
  category: { id: 3, name: 'Food' },
  amountLimit: '500.0000',
  currency: 'PLN',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  createdAt: '2026-09-01T10:00:00Z',
};

const budgetStatus: BudgetStatusResponse = {
  budget: {
    id: 5,
    category: { id: 3, name: 'Food' },
    amountLimit: '500.0000',
    currency: 'PLN',
    periodStart: '2026-09-01',
    periodEnd: '2026-09-30',
  },
  spent: '120.0000',
  remaining: '380.0000',
  percentUsed: 24,
  overBudget: false,
  includesDescendants: true,
  excludedCurrencies: [],
};

const subscriptionDashboard: SubscriptionDashboardResponse = {
  asOf: '2026-09-30',
  activeCount: 0,
  pausedCount: 0,
  monthlyCost: [],
  yearlyCost: [],
  chargedThisMonth: [],
  byCategory: [],
  upcoming: [],
  overdue: [],
};

const pinned = insight({ pinned: true });

function envelope(value: string): ResultEnvelope {
  return {
    plan: pinned.plan,
    results: [{ currency: 'PLN', shape: 'value', value }],
    meta: { truncatedGroups: false },
  };
}

// — Harness —

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Answers one request with `resolver` and counts how many times the server was asked. */
function counted(method: Method, path: string, resolver: HttpResponseResolver) {
  const count = { asked: 0 };
  server.use(
    http[method](path, (info) => {
      count.asked += 1;
      return resolver(info);
    }),
  );
  return count;
}

const noContent = () => new HttpResponse(null, { status: 204 });

function renderHooks<T>(hooks: () => T) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return renderHook(hooks, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}

function askedCounts(counts: Record<string, { asked: number }>) {
  return Object.fromEntries(Object.entries(counts).map(([name, count]) => [name, count.asked]));
}

/** Every query mounted and answered once, then the mutation, then every query asked again. */
async function expectEachAskedAgain(
  counts: Record<string, { asked: number }>,
  mutate: () => Promise<unknown>,
) {
  const once = Object.fromEntries(Object.keys(counts).map((name) => [name, 1]));
  const twice = Object.fromEntries(Object.keys(counts).map((name) => [name, 2]));
  await waitFor(() => expect(askedCounts(counts)).toEqual(once));

  await act(mutate);

  await waitFor(() => expect(askedCounts(counts)).toEqual(twice));
}

// — Mutation families —

test('deleting a Transaction refreshes every view of transaction data, pinned results included', async () => {
  let pinnedValue = '10.0000';
  const counts = {
    transactions: counted('get', '/api/transactions', () =>
      HttpResponse.json<TransactionPage>(emptyPage),
    ),
    summary: counted('get', '/api/transactions/summary', () =>
      HttpResponse.json<TransactionSummary[]>([]),
    ),
    categoryCounts: counted('get', '/api/transactions/category-counts', () =>
      HttpResponse.json<CategoryTransactionCount[]>([]),
    ),
    categoryTotals: counted('get', '/api/transactions/category-totals', () =>
      HttpResponse.json<CategoryTotal[]>([]),
    ),
    budgets: counted('get', '/api/budgets', () => HttpResponse.json<BudgetResponse[]>([budget])),
    budgetStatus: counted('get', '/api/budgets/5/status', () =>
      HttpResponse.json<BudgetStatusResponse>(budgetStatus),
    ),
    subscriptionDashboard: counted('get', '/api/subscriptions/dashboard', () =>
      HttpResponse.json<SubscriptionDashboardResponse>(subscriptionDashboard),
    ),
    merchantSuggestions: counted('get', '/api/transactions/merchant-suggestions', () =>
      HttpResponse.json<MerchantSuggestion[]>([]),
    ),
    pinnedResults: counted('post', '/api/insights/execute', () =>
      HttpResponse.json<ResultEnvelope>(envelope(pinnedValue)),
    ),
  };
  server.use(http.delete('/api/transactions/42', noContent));
  const { result } = renderHooks(() => {
    const budgets = useBudgets();
    return {
      views: [
        useTransactions({}),
        useTransactionSummary({}),
        useCategoryCounts(),
        useCategoryTotals({}),
        budgets,
        useBudgetStatuses(budgets.data),
        useSubscriptionDashboard(),
        useMerchantSuggestions(),
      ],
      pinnedResults: useInsightResults([pinned]),
      deleteTransaction: useDeleteTransaction(),
    };
  });

  await expectEachAskedAgain(counts, () => {
    pinnedValue = '4.0000';
    return result.current.deleteTransaction.mutateAsync(42);
  });

  // The documented bug: the pinned tile kept showing the old number.
  await waitFor(() =>
    expect(result.current.pinnedResults[0].data?.results[0]).toMatchObject({ value: '4.0000' }),
  );
});

test('updating a Category refreshes the tree and every view that embeds a Category', async () => {
  const counts = {
    categories: counted('get', '/api/categories', () => HttpResponse.json<CategoryNode[]>(tree)),
    categoryCounts: counted('get', '/api/transactions/category-counts', () =>
      HttpResponse.json<CategoryTransactionCount[]>([]),
    ),
    categoryTotals: counted('get', '/api/transactions/category-totals', () =>
      HttpResponse.json<CategoryTotal[]>([]),
    ),
    budgets: counted('get', '/api/budgets', () => HttpResponse.json<BudgetResponse[]>([budget])),
    budgetStatus: counted('get', '/api/budgets/5/status', () =>
      HttpResponse.json<BudgetStatusResponse>(budgetStatus),
    ),
    subscriptions: counted('get', '/api/subscriptions', () =>
      HttpResponse.json<SubscriptionResponse[]>([]),
    ),
    subscriptionDashboard: counted('get', '/api/subscriptions/dashboard', () =>
      HttpResponse.json<SubscriptionDashboardResponse>(subscriptionDashboard),
    ),
  };
  server.use(
    http.patch('/api/categories/3', () =>
      HttpResponse.json<CategoryNode>({ ...tree[0], name: 'Groceries' }),
    ),
  );
  const { result } = renderHooks(() => {
    const budgets = useBudgets();
    return {
      views: [
        useCategories(),
        useCategoryCounts(),
        useCategoryTotals({}),
        budgets,
        useBudgetStatuses(budgets.data),
        useSubscriptions(),
        useSubscriptionDashboard(),
      ],
      updateCategory: useUpdateCategory(),
    };
  });

  await expectEachAskedAgain(counts, () =>
    result.current.updateCategory.mutateAsync({ id: 3, body: { name: 'Groceries' } }),
  );
});

test('deleting a Budget refreshes the Budgets and their status', async () => {
  const counts = {
    budgets: counted('get', '/api/budgets', () => HttpResponse.json<BudgetResponse[]>([budget])),
    budgetStatus: counted('get', '/api/budgets/5/status', () =>
      HttpResponse.json<BudgetStatusResponse>(budgetStatus),
    ),
  };
  server.use(http.delete('/api/budgets/5', noContent));
  const { result } = renderHooks(() => {
    const budgets = useBudgets();
    return {
      views: [budgets, useBudgetStatuses(budgets.data)],
      deleteBudget: useDeleteBudget(),
    };
  });

  await expectEachAskedAgain(counts, () => result.current.deleteBudget.mutateAsync(5));
});

test('deleting a Subscription refreshes the Subscriptions, their dashboard and the Transactions', async () => {
  const counts = {
    subscriptions: counted('get', '/api/subscriptions', () =>
      HttpResponse.json<SubscriptionResponse[]>([]),
    ),
    subscriptionDashboard: counted('get', '/api/subscriptions/dashboard', () =>
      HttpResponse.json<SubscriptionDashboardResponse>(subscriptionDashboard),
    ),
    // Its posted charges lose their link to the Subscription.
    transactions: counted('get', '/api/transactions', () =>
      HttpResponse.json<TransactionPage>(emptyPage),
    ),
  };
  server.use(http.delete('/api/subscriptions/8', noContent));
  const { result } = renderHooks(() => ({
    views: [useSubscriptions(), useSubscriptionDashboard(), useTransactions({})],
    deleteSubscription: useDeleteSubscription(),
  }));

  await expectEachAskedAgain(counts, () => result.current.deleteSubscription.mutateAsync(8));
});

test('deleting an Insight refreshes the list, the open Insight and the pinned results', async () => {
  const counts = {
    insights: counted('get', '/api/insights', () => HttpResponse.json<Insight[]>([pinned])),
    openInsight: counted('get', '/api/insights/7', () => HttpResponse.json<Insight>(pinned)),
    pinnedResults: counted('post', '/api/insights/execute', () =>
      HttpResponse.json<ResultEnvelope>(envelope('10.0000')),
    ),
  };
  server.use(http.delete('/api/insights/7', noContent));
  const { result } = renderHooks(() => ({
    views: [useInsights(), useInsight(7), useInsightResults([pinned])],
    deleteInsight: useDeleteInsight(),
  }));

  await expectEachAskedAgain(counts, () => result.current.deleteInsight.mutateAsync(7));
});

test('creating, renaming and deleting a Profile update the Session', async () => {
  server.use(
    http.post('/api/profiles', () =>
      HttpResponse.json<ProfileResponse>({
        id: 2,
        name: 'Company',
        defaultCurrency: 'EUR',
        createdAt: '2026-09-30T08:00:00Z',
      }),
    ),
    http.put('/api/profiles/2', () =>
      HttpResponse.json<ProfileResponse>({
        id: 2,
        name: 'Company Ltd',
        defaultCurrency: 'EUR',
        createdAt: '2026-09-30T08:00:00Z',
      }),
    ),
    http.delete('/api/profiles/:id', noContent),
  );
  const { result } = renderHooks(() => ({
    session: useSession(),
    createProfile: useCreateProfile(),
    renameProfile: useRenameProfile(),
    deleteProfile: useDeleteProfile(),
  }));
  await waitFor(() => expect(result.current.session.isSuccess).toBe(true));
  const profiles = () => result.current.session.data?.profiles.map((profile) => profile.name);

  await act(() =>
    result.current.createProfile.mutateAsync({ name: 'Company', defaultCurrency: 'EUR' }),
  );
  await waitFor(() => expect(profiles()).toEqual(['Household', 'Company']));

  await act(() =>
    result.current.renameProfile.mutateAsync({ id: 2, body: { name: 'Company Ltd' } }),
  );
  await waitFor(() => expect(profiles()).toEqual(['Household', 'Company Ltd']));

  await act(() => result.current.deleteProfile.mutateAsync(2));
  await waitFor(() => expect(profiles()).toEqual(['Household']));
  expect(result.current.session.data?.activeProfileId).toBe(1);

  // Deleting the Active profile leaves the Session without one.
  await act(() => result.current.deleteProfile.mutateAsync(1));
  await waitFor(() => expect(profiles()).toEqual([]));
  expect(result.current.session.data?.activeProfileId).toBeNull();
});

test('restoring a Backup asks the server for the Session again', async () => {
  const counts = {
    session: counted('get', '/api/auth/me', () => HttpResponse.json<SessionResponse>(session())),
  };
  server.use(
    http.post('/api/backup/restore', () =>
      HttpResponse.json<BackupRestoreResponse>({ profiles: [] }),
    ),
  );
  const { result } = renderHooks(() => ({
    views: [useSession()],
    restoreBackup: useRestoreBackup(),
  }));

  await expectEachAskedAgain(counts, () =>
    result.current.restoreBackup.mutateAsync(new File(['{}'], 'backup.json')),
  );
});
