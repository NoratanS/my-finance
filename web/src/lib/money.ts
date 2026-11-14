import type { components } from '@/api/schema'

type Currency = components['schemas']['Currency']
type Kind = components['schemas']['Kind']

// The API's ceiling in minor units: 999 999 999,99 (ADR 0006).
export const maxAmount = 99_999_999_999

// Grouped by hand: pl-PL Intl leaves 4-digit amounts ungrouped and uses NBSP, the boards use plain spaces.
export function formatAmountInput(minor: number) {
  const whole = Math.floor(minor / 100).toString()
  const cents = (minor % 100).toString().padStart(2, '0')
  return `${whole.replace(/\B(?=(\d{3})+$)/g, ' ')},${cents}`
}

const signs: Record<Kind, string> = { income: '+', expense: '−' }

// "2 200,00 PLN"; with a kind, income reads "+…" and an expense "−…".
export function formatAmount(minor: number, currency: Currency, kind?: Kind) {
  const sign = kind ? signs[kind] : ''
  return `${sign}${formatAmountInput(minor)} ${currency}`
}

// A signed total such as net: "+3 913,60 PLN", "−142,60 PLN", and zero plain.
export function formatNet(minor: number, currency: Currency) {
  if (minor === 0) return formatAmount(0, currency)
  return formatAmount(
    Math.abs(minor),
    currency,
    minor > 0 ? 'income' : 'expense',
  )
}

export type AmountProblem = 'minus' | 'notANumber' | 'notPositive' | 'tooLarge'

// Whole units, then up to two decimals after a comma or a dot; spaces between digits are grouping.
const typedAmount = /^(\d+)(?:[.,](\d{1,2}))?$/

// Read as strings and BigInt, never floats, so 0,29 stays 29 minor units.
export function parseAmount(
  text: string,
): { minor: number } | { problem: AmountProblem } {
  const compact = text.replace(/\s/g, '')
  if (/^[-−]/.test(compact)) return { problem: 'minus' }
  if (compact === '') return { problem: 'notPositive' }
  const match = typedAmount.exec(compact)
  if (!match) return { problem: 'notANumber' }
  const [, whole = '', cents = ''] = match
  const minor = BigInt(whole) * 100n + BigInt(cents.padEnd(2, '0'))
  if (minor === 0n) return { problem: 'notPositive' }
  if (minor > BigInt(maxAmount)) return { problem: 'tooLarge' }
  return { minor: Number(minor) }
}
