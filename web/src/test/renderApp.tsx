import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { createAppRouter } from '@/appRouter'

// The real routes and query client, in memory at `path`.
export function renderApp(path: string) {
  const { queryClient, router } = createAppRouter((routes) =>
    createMemoryRouter(routes, { initialEntries: [path] }),
  )
  const user = userEvent.setup()
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, user }
}
