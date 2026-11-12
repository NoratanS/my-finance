import { type ReactNode, useEffect } from 'react'
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form'
import { ApiError, isRateLimited, isUnreachable } from '@/api/client'
import { Alert } from '@/components/ui/Alert'

// A refusal the page answers itself (a state card, a notice): it carries no field errors.
export const isOwnedRefusal = (error: unknown, owns: readonly number[]) =>
  error instanceof ApiError &&
  owns.includes(error.status) &&
  !error.problem?.errors

// One place for a refused save: field errors go on the form's fields, the rest decides the banner above it.
export function useFormRefusal<T extends FieldValues>(
  form: UseFormReturn<T>,
  fields: readonly Path<T>[],
  {
    error,
    owns = [],
    says = {},
  }: {
    error: Error | null
    owns?: readonly number[]
    says?: Partial<Record<number, string>>
  },
): { onError: (error: Error) => void; banner: ReactNode } {
  const onError = (refusal: Error) => {
    fieldMessages(refusal, fields).forEach(([field, message], index) => {
      form.setError(field, { message }, { shouldFocus: index === 0 })
    })
  }

  // Focus again after the render that shows the refusal: a field disabled while saving can't take it in onError.
  const firstRefused = error ? fieldMessages(error, fields)[0]?.[0] : undefined
  const { setFocus } = form
  useEffect(() => {
    if (firstRefused) setFocus(firstRefused)
  }, [error, firstRefused, setFocus])

  return { onError, banner: bannerFor(error, fields, owns, says) }
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
): ReactNode {
  if (!error) return null
  if (isUnreachable(error))
    return <Alert>Couldn’t reach my-finance. Try again.</Alert>
  if (fieldMessages(error, fields).length > 0) return null
  if (isOwnedRefusal(error, owns)) return null
  const said = error instanceof ApiError ? says[error.status] : undefined
  if (said) return <Alert>{said}</Alert>
  if (isRateLimited(error))
    return <Alert>Too many attempts. Try again in a few minutes.</Alert>
  return <Alert>Something went wrong. Try again.</Alert>
}
