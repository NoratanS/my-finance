// Money display helpers.
//
// Amounts arrive from the API as decimal strings ("1234.5000"). They are parsed
// ONLY for display formatting and display-side aggregation (KPI tiles, bars) —
// any value sent back to the API stays a string, and the server computes
// everything that matters (budget status, subscription normalization).

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat('pl-PL', { style: 'currency', currency });
    formatters.set(currency, formatter);
  }
  return formatter;
}

/** "1234.5000" + "PLN" -> "1234,50 zł" (pl-PL formatting, per the design). */
export function formatAmount(decimalString: string | number, currency: string): string {
  const value = typeof decimalString === 'number' ? decimalString : parseFloat(decimalString);
  return formatterFor(currency).format(Number.isFinite(value) ? value : 0);
}

/** J11: the currency choices offered by create forms (transactions, subscriptions). */
export const CURRENCY_OPTIONS = ['PLN', 'EUR', 'USD', 'GBP'];

/**
 * CURRENCY_OPTIONS with `extra` folded in when it isn't already one of them —
 * e.g. a profile's default currency, which a restored backup could set outside
 * this fixed list. Same dedupe idea as CurrencyChip's insight filter.
 */
export function currencyOptions(extra: string): string[] {
  return CURRENCY_OPTIONS.includes(extra) ? CURRENCY_OPTIONS : [extra, ...CURRENCY_OPTIONS];
}

/** Signed display: expenses "−", income "+" (minus is U+2212 like the mockup). */
export function formatSigned(
  decimalString: string,
  currency: string,
  type: 'EXPENSE' | 'INCOME',
): string {
  return (type === 'INCOME' ? '+' : '−') + formatAmount(decimalString, currency);
}

const MONTHS_SHORT = [
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
];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2026-08-18" -> "18 Aug" (the mockup's table date format). */
export function formatShortDate(isoDate: string): string {
  return `${parseInt(isoDate.slice(8, 10), 10)} ${MONTHS_SHORT[parseInt(isoDate.slice(5, 7), 10) - 1]}`;
}

/** "2026-09-03" -> "3 Sep 2026" (subscriptions "next charge" format). */
export function formatDateWithYear(isoDate: string): string {
  return `${formatShortDate(isoDate)} ${isoDate.slice(0, 4)}`;
}

/**
 * Today's date in the browser's local timezone, as YYYY-MM-DD.
 *
 * Edge (accepted): the server validates "occurredOn not in the future" against
 * ITS clock (UTC). A browser east of UTC that has already rolled past midnight
 * locally can produce a "today" the server still considers tomorrow, so a
 * late-night entry may bounce with a validation error until UTC catches up.
 */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export interface MonthOption {
  /** "2026-08" */
  value: string;
  /** "August 2026" */
  label: string;
  /** Inclusive bounds for the from/to query params. */
  from: string;
  to: string;
}

function monthOption(year: number, monthIndex: number): MonthOption {
  const mm = String(monthIndex + 1).padStart(2, '0');
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return {
    value: `${year}-${mm}`,
    label: `${MONTHS_LONG[monthIndex]} ${year}`,
    from: `${year}-${mm}-01`,
    to: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

/** The current month (profile-local = browser date). */
export function currentMonth(): MonthOption {
  const now = new Date();
  return monthOption(now.getFullYear(), now.getMonth());
}

/** The last `count` months, current first — the period select options. */
export function lastMonths(count: number): MonthOption[] {
  const now = new Date();
  const options: MonthOption[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push(monthOption(d.getFullYear(), d.getMonth()));
  }
  return options;
}

/**
 * Display-side sum of decimal-string amounts (KPI tiles / bars only — never
 * sent back to the API). Sums in cents-ish float space; fine for display.
 */
export function sumAmounts(amounts: string[]): number {
  return amounts.reduce((total, a) => total + (parseFloat(a) || 0), 0);
}
