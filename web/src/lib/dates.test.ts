import { expect, test } from 'vitest'
import { formatDayMonth, formatDayMonthYear } from '@/lib/dates'

// Midday UTC, so the local date is the same in every timezone the tests run in.
test('a date reads as the boards write it, with or without the year', () => {
  expect(formatDayMonthYear('2026-11-17T12:00:00.000Z')).toBe('17 Nov 2026')
  expect(formatDayMonth('2026-11-05T12:00:00.000Z')).toBe('5 Nov')
})
