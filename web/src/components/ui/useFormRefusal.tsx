import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form'
import {
  ApiError,
  isOwnedRefusal,
  isRateLimited,
  isUnauthorized,
  isUnreachable,
} from '@/api/client'
import { Alert } from '@/components/ui/Alert'
import { RateLimitNotice } from '@/components/ui/RateLimitNotice'

// One place for a refused save, so every form answers field errors, banners and the attempt-limit wait alike.
export function useFormRefusal<T extends FieldValues>(
  // Only the two it needs, so a form whose schema transforms its values fits too.
  form: Pick<UseFormReturn<T>, 'setError' | 'setFocus'>,
  fields: readonly Path<T>[],
  {
    error,
    owns = [],
    says = {},
    bannerForField = {},
  }: {
    error: Error | null
    owns?: readonly number[]
    says?: Partial<Record<number, string>>
    bannerForField?: Partial<Record<string, ReactNode>>
  },
): { onError: (error: Error) => void; banner: ReactNode; waiting: boolean } {
  // The 429 whose wait has run out; the next refusal is a new error, so it shows again.
  const [waitedOut, setWaitedOut] = useState<Error | null>(null)
  const waitTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(
    () => () => {
      clearTimeout(waitTimer.current)
    },
    [],
  )

  const onError = (refusal: Error) => {
    fieldMessages(refusal, fields).forEach(([field, message], index) => {
      form.setError(field, { message }, { shouldFocus: index === 0 })
    })
    clearTimeout(waitTimer.current)
    if (isRateLimited(refusal) && refusal.retryAfterSeconds) {
      waitTimer.current = setTimeout(() => {
        setWaitedOut(refusal)
      }, refusal.retryAfterSeconds * 1000)
    }
  }

  // Focus again after the render that shows the refusal: a field disabled while saving can't take it in onError.
  const firstRefused = error ? fieldMessages(error, fields)[0]?.[0] : undefined
  const { setFocus } = form
  useEffect(() => {
    if (firstRefused) setFocus(firstRefused)
  }, [error, firstRefused, setFocus])

  const shown = error === waitedOut ? null : error
  return {
    onError,
    banner: bannerFor(shown, fields, owns, says, bannerForField),
    waiting: isRateLimited(shown) && shown.retryAfterSeconds !== undefined,
  }
}

function fieldMessages<T extends FieldValues>(
  error: Error,
  fields: readonly Path<T>[],
) {
  const errors = error instanceof ApiError ? error.problem?.errors : undefined
  return fields.flatMap((field) => {
    const message = errors?.[field]?.[0]
    return message ? [[field, message] as const] : []
  })
}

function bannerFor<T extends FieldValues>(
  error: Error | null,
  fields: readonly Path<T>[],
  owns: readonly number[],
  says: Partial<Record<number, string>>,
  bannerForField: Partial<Record<string, ReactNode>>,
): ReactNode {
  if (!error) return null
  if (isUnreachable(error))
    return <Alert>Couldn’t reach my-finance. Try again.</Alert>
  if (fieldMessages(error, fields).length > 0) return null
  if (isOwnedRefusal(error, owns)) return null
  const errors = error instanceof ApiError ? error.problem?.errors : undefined
  const bannered = Object.keys(bannerForField).find((field) => errors?.[field])
  if (bannered) return <Alert>{bannerForField[bannered]}</Alert>
  const said = error instanceof ApiError ? says[error.status] : undefined
  if (said) return <Alert>{said}</Alert>
  // An ended session already sent you to sign in.
  if (isUnauthorized(error)) return null
  if (isRateLimited(error)) return <RateLimitNotice />
  return <Alert>Something went wrong. Try again.</Alert>
}
