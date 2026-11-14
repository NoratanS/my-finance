import { expect, onTestFinished, test, vi } from 'vitest'
import {
  formatCalendarDate,
  formatCalendarDay,
  formatCalendarMonth,
  formatDayMonth,
  formatDayMonthYear,
  formatMonthYear,
  formatShortMonth,
  formatTime,
  localToday,
} from '@/lib/dates'

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

// A fixed three letters, as the boards' month axis writes them; en-GB Intl writes September as "Sept".
test('a month on a chart axis reads as three letters, September as Sep', () => {
  expect(
    ['2026-05', '2026-06', '2026-09', '2026-12'].map(formatShortMonth),
  ).toEqual(['May', 'Jun', 'Sep', 'Dec'])
})

// A calendar date has no time, so it must not move a day in any timezone.
test('a calendar date reads as written', () => {
  expect(formatCalendarDay('2026-10-10')).toBe('10 Oct')
  expect(formatCalendarDate('2026-10-01')).toBe('1 Oct 2026')
})

// Just past UTC midnight it is still the 10th in Los Angeles.
test('today is the reader’s own calendar date, not UTC’s', () => {
  vi.stubEnv('TZ', 'America/Los_Angeles')
  vi.useFakeTimers({ now: new Date('2026-10-11T02:00:00.000Z') })
  onTestFinished(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  expect(localToday()).toBe('2026-10-10')
})

test('a month reads as the boards write it', () => {
  expect(formatMonthYear(new Date('2026-10-10T12:00:00.000Z'))).toBe(
    'October 2026',
  )
})

// A calendar month ("2026-10") has no time, so it must not move a month in any timezone.
test('a calendar month reads as the boards write it', () => {
  vi.stubEnv('TZ', 'America/Los_Angeles')
  onTestFinished(() => {
    vi.unstubAllEnvs()
  })

  expect(formatCalendarMonth('2026-10')).toBe('October 2026')
})
