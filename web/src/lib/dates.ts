// Dates as the boards write them: "17 Nov 2026", or "17 Nov" when the year is plain.
const dayMonthYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const dayMonth = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
})

export const formatDayMonthYear = (iso: string) =>
  dayMonthYear.format(new Date(iso))

export const formatDayMonth = (iso: string) => dayMonth.format(new Date(iso))

// Months as the boards write them: "October 2026", in the reader's own timezone.
const monthYear = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
})

export const formatMonthYear = (date: Date) => monthYear.format(date)

// Times as the boards write them: "14:30", in the reader's own timezone.
const time = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export const formatTime = (iso: string) => time.format(new Date(iso))

// Calendar dates ("2026-10-10") have no time, so they are read in UTC and never shift a day.
const calendarDay = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})
const calendarDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})
const utcMidnight = (date: string) => new Date(`${date}T00:00:00Z`)

export const formatCalendarDay = (date: string) =>
  calendarDay.format(utcMidnight(date))

export const formatCalendarDate = (date: string) =>
  calendarDate.format(utcMidnight(date))

const calendarMonth = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
})

// "2026-10" → "October 2026".
export const formatCalendarMonth = (month: string) =>
  calendarMonth.format(utcMidnight(`${month}-01`))

// "2026-10-10" in the user's zone, not the device's, so it matches the today the API checks against.
export function todayIn(timeZone: string) {
  const parts = dateParts(timeZone).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((each) => each.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function dateParts(timeZone: string) {
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  } as const
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone })
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    return new Intl.DateTimeFormat('en-GB', options)
  }
}

const shortMonths = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

// "2026-09" → "Sep": a fixed list, as en-GB Intl writes "Sept" where the boards' chart axes write "Sep".
export const formatShortMonth = (month: string) =>
  shortMonths[Number(month.slice(5, 7)) - 1] ?? month
