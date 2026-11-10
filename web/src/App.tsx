import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { HealthStatus } from '@/features/health/HealthStatus'

const queryClient = new QueryClient()

const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <main className="min-h-screen bg-neutral-950 p-8 text-neutral-100">
        <h1 className="text-2xl font-semibold">my-finance</h1>
        <HealthStatus />
      </main>
    ),
  },
])

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}
