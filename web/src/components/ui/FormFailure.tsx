import { ApiError, isRateLimited, isUnreachable } from '@/api/client'
import { Alert } from '@/components/ui/Alert'

// The alert above a form whose save failed; shownByPage says which refusals a field or the page already shows.
export function FormFailure({
  error,
  shownByPage,
}: {
  error: Error | null
  shownByPage: (refusal: ApiError) => boolean
}) {
  if (!error) return null
  if (isUnreachable(error))
    return <Alert>Couldn’t reach my-finance. Try again.</Alert>
  if (isRateLimited(error))
    return <Alert>Too many attempts. Try again in a few minutes.</Alert>
  if (error instanceof ApiError && !shownByPage(error))
    return <Alert>Something went wrong. Try again.</Alert>
  return null
}
