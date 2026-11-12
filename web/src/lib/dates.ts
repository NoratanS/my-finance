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
