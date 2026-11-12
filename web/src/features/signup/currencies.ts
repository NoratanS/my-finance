import type { components } from '@/api/schema'

export type Currency = components['schemas']['Currency']

// Every currency the API accepts, in the boards' order and words.
export const currencies: { code: Currency; label: string }[] = [
  { code: 'PLN', label: 'PLN · Polish złoty' },
  { code: 'EUR', label: 'EUR · Euro' },
  { code: 'USD', label: 'USD · US dollar' },
  { code: 'GBP', label: 'GBP · British pound' },
  { code: 'CHF', label: 'CHF · Swiss franc' },
]
