import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import type { DataRouter, RouteObject } from 'react-router'
import { isUnauthorized, isUnreachable } from '@/api/client'
import { leaveEndedSession } from '@/features/auth/leaveEndedSession'
import { requireSession } from '@/features/auth/requireSession'
import { SignInPage } from '@/features/auth/SignInPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { ResetPasswordPage } from '@/features/password-reset/ResetPasswordPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { AppError } from '@/features/shell/AppError'
import { AppLayout } from '@/features/shell/AppLayout'
import { AppLoading } from '@/features/shell/AppLoading'
import { SignupPage } from '@/features/signup/SignupPage'

// One factory for the app and its tests; only the router kind (browser or memory) differs.
export function createAppRouter(
  createRouter: (routes: RouteObject[]) => DataRouter,
) {
  const queryClient: QueryClient = new QueryClient({
    // A session that ends mid-use sends the next failing query to sign in.
    queryCache: new QueryCache({
      onError: (error) => {
        if (isUnauthorized(error)) void leaveEndedSession(navigate, queryClient)
      },
    }),
    // A save that meets an ended session does the same; the calls that sign in own their 401.
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (!isUnauthorized(error) || mutation.meta?.signsIn) return
        // Returned, so the save's own error handling waits until it has left.
        return leaveEndedSession(navigate, queryClient)
      },
    }),
    defaultOptions: {
      queries: {
        // Only an unreachable API may answer differently on retry; a refusal won't change.
        retry: (failureCount, error) =>
          failureCount < 3 && isUnreachable(error),
      },
    },
  })

  const navigate = (to: string, options: { replace: true }) =>
    router.navigate(to, options)

  const router = createRouter([
    { path: '/sign-in', element: <SignInPage /> },
    { path: '/signup/:token', element: <SignupPage /> },
    { path: '/reset/:token', element: <ResetPasswordPage /> },
    {
      path: '/',
      loader: () => requireSession(queryClient),
      element: <AppLayout />,
      errorElement: <AppError />,
      hydrateFallbackElement: <AppLoading />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: 'settings', element: <SettingsPage /> },
      ],
    },
  ])

  return { queryClient, router }
}
