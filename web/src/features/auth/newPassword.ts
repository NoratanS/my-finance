import { z } from 'zod'

// Length only, no composition rules (ADR 0012).
export const newPassword = z.string().min(12, {
  error: (issue) =>
    `Use at least 12 characters. This one has ${String((issue.input as string).length)}.`,
})
