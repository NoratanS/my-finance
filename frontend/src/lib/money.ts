// Money helpers: display formatting and entry parsing.
//
// Amounts arrive from the API as decimal strings ("1234.5000"). They are parsed
// ONLY for display formatting and display-side aggregation (KPI tiles, bars) —
// any value sent back to the API stays a string, and the server computes
// everything that matters (budget status, subscription normalization). An
// entered amount becomes a money amount through parseAmount, string to string.

import type { TransactionSummary } from '../api/types';

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

/** An entered amount checked: the money amount to send, or the message for its field. */
export type ParsedAmount = { amount: string } | { message: string };

/**
 * Turns an entered amount into the money amount to send, or the message to show under
 * the field. A comma or a dot is the decimal separator; the result always uses a dot and
 * keeps the digits exactly as typed. The rule mirrors the server's (greater than zero, at
 * most 15 integer and 4 decimal digits), and no floating-point conversion is ever made.
 */
export function parseAmount(entered: string): ParsedAmount {
  const text = entered.trim();
  if (text === '') return { message: 'Enter an amount' };
  const match = /^([0-9]+)(?:[.,]([0-9]+))?$/.exec(text);
  if (!match) return { message: 'Use digits with an optional decimal part, e.g. 12.50 or 12,50' };
  const [, integer, fraction = ''] = match;
  if (fraction.length > 4) return { message: 'Use at most 4 decimal places' };
  if (integer.length > 15) {
    return { message: 'Use at most 15 digits before the decimal separator' };
  }
  if (!/[1-9]/.test(text)) return { message: 'Must be greater than zero' };
  return { amount: fraction ? `${integer}.${fraction}` : integer };
}

/** A money amount from the API as input text: "1500.5000" -> "1500.5", "10.0000" -> "10". */
export function editableAmount(amount: string): string {
  return amount.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

/** J11: the currency choices offered by create forms (transactions, subscriptions, profiles). */
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

/** Signed by the value's own sign — a net, which formatSigned (signed by type) can't show. */
export function formatNet(net: number, currency: string): string {
  return (net >= 0 ? '+' : '−') + formatAmount(Math.abs(net), currency);
}

/** The KPI tiles' numbers for one currency, plus how many transactions they leave out. */
export interface CurrencyTotals {
  expense: number;
  income: number;
  net: number;
  count: number;
  /** Transactions in every other currency — disclosed as excluded, never summed in. */
  foreignCount: number;
}

/**
 * The per-currency summary rows reduced to the profile currency's tile values.
 * Currencies are never added together (ARCHITECTURE.md §3), so the tiles show
 * the profile's own and disclose the rest as a count.
 */
export function profileCurrencyTotals(
  rows: TransactionSummary[],
  currency: string,
): CurrencyTotals {
  const own = rows.find((row) => row.currency === currency);
  return {
    expense: parseFloat(own?.expense ?? '0'),
    income: parseFloat(own?.income ?? '0'),
    net: parseFloat(own?.net ?? '0'),
    count: own?.count ?? 0,
    foreignCount: rows
      .filter((row) => row.currency !== currency)
      .reduce((total, row) => total + row.count, 0),
  };
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
 * The server accepts any `occurredOn` up to its UTC date + 1 (docs/API.md →
 * `POST /api/transactions`), and no time zone's date is ever more than one
 * day past UTC's, so this local "today" is accepted everywhere — a late-night
 * entry east of UTC does not bounce.
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
