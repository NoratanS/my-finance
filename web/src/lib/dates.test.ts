import { expect, test } from 'vitest'
import { formatDayMonth, formatDayMonthYear, formatTime } from '@/lib/dates'

// Midday UTC, so the local date is the same in every timezone the tests run in.
test('a date reads as the boards write it, with or without the year', () => {
  expect(formatDayMonthYear('2026-11-17T12:00:00.000Z')).toBe('17 Nov 2026')
  expect(formatDayMonth('2026-11-05T12:00:00.000Z')).toBe('5 Nov')
})

// Tests run in UTC (vite.config.ts), so a time reads the same on every machine.
test('a time reads as the boards write it, on the 24-hour clock', () => {
  expect(formatTime('2026-11-11T14:30:00.000Z')).toBe('14:30')
  expect(formatTime('2026-11-11T09:05:00.000Z')).toBe('09:05')
})
