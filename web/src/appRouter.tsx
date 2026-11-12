import { QueryCache, QueryClient } from '@tanstack/react-query'
import type { DataRouter, RouteObject } from 'react-router'
import { ApiError, isUnauthorized } from '@/api/client'
import { requireSession } from '@/features/auth/requireSession'
import { SignInPage } from '@/features/auth/SignInPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { AppLayout } from '@/features/shell/AppLayout'

// One factory for the app and its tests; only the router kind (browser or memory) differs.
export function createAppRouter(
  createRouter: (routes: RouteObject[]) => DataRouter,
) {
  const queryClient = new QueryClient({
    // A session that ends mid-use sends the next failing query to sign in.
    queryCache: new QueryCache({
      onError: (error) => {
        if (isUnauthorized(error)) void router.navigate('/sign-in')
      },
    }),
    defaultOptions: {
      queries: {
        // A 4xx answer won't change on retry.
        retry: (failureCount, error) =>
          failureCount < 3 &&
          !(error instanceof ApiError && error.status < 500),
      },
    },
  })

  const router = createRouter([
    { path: '/sign-in', element: <SignInPage /> },
    {
      path: '/',
      loader: () => requireSession(queryClient),
      element: <AppLayout />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: 'settings', element: <SettingsPage /> },
      ],
    },
  ])

  return { queryClient, router }
}
