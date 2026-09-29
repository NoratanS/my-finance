// Form-validation schemas (react-hook-form + zod). Money stays a string end to
// end — the API takes decimal strings at scale 4, and a JS number is where
// scale dies (see CLAUDE.md / task-13 brief).

import { z } from 'zod';

const moneyString = z
  .string()
  .trim()
  .min(1, 'Required')
  .regex(/^\d{1,15}(\.\d{1,4})?$/, 'Use digits, up to 4 decimal places')
  .refine((v) => Number(v) > 0, 'Must be greater than zero');

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const budgetSchema = z
  .object({
    categoryId: z.coerce.number().int().positive('Pick a category'),
    amountLimit: moneyString,
    currency: z.string().regex(/^[A-Z]{3}$/, 'Three-letter code, e.g. PLN'),
    periodStart: isoDate,
    periodEnd: isoDate,
  })
  .refine((v) => v.periodEnd >= v.periodStart, {
    message: 'End date must be on or after the start date',
    path: ['periodEnd'],
  });

export type BudgetFormValues = z.infer<typeof budgetSchema>;
