// Names months for every short date and chart axis: en-GB Intl writes September as "Sept", the boards "Sep".
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

// Intl still reads the day, month and year in the formatter's zone; only the month's name is ours.
function formatWithShortMonth(formatter: Intl.DateTimeFormat, date: Date) {
  const parts = formatter.formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((each) => each.type === type)?.value
  const month = part('month') ?? ''
  const monthName = shortMonths[Number(month) - 1] ?? month
  // en-GB pads a numeric day next to a numeric month ("05/11"); the boards write "5 Nov".
  const day = String(Number(part('day')))
  return [day, monthName, part('year')].filter(Boolean).join(' ')
}

// Dates as the boards write them: "17 Nov 2026", or "17 Nov" when the year is plain.
const dayMonthYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
})
const dayMonth = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'numeric',
})

export const formatDayMonthYear = (iso: string) =>
  formatWithShortMonth(dayMonthYear, new Date(iso))

export const formatDayMonth = (iso: string) =>
  formatWithShortMonth(dayMonth, new Date(iso))

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
  month: 'numeric',
  timeZone: 'UTC',
})
const calendarDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})
const utcMidnight = (date: string) => new Date(`${date}T00:00:00Z`)

export const formatCalendarDay = (date: string) =>
  formatWithShortMonth(calendarDay, utcMidnight(date))

export const formatCalendarDate = (date: string) =>
  formatWithShortMonth(calendarDate, utcMidnight(date))

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
  const options = { year: 'numeric', month: '2-digit', day: '2-digit' } as const
  // A zone this browser doesn't know falls back to the device's.
  const format =
    formatterIn(timeZone, options) ?? new Intl.DateTimeFormat('en-GB', options)
  const parts = format.formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((each) => each.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

// Undefined for a zone this browser doesn't know: the API's list holds names Intl may lack.
export function formatterIn(
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
) {
  try {
    return new Intl.DateTimeFormat('en-GB', { ...options, timeZone })
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    return undefined
  }
}

// "2026-09" → "Sep", for chart axes.
export const formatShortMonth = (month: string) =>
  shortMonths[Number(month.slice(5, 7)) - 1] ?? month
