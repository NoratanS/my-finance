// The explorer's plan state: the default plan, the chip vocabulary, the URL
// encoding that makes an exploration linkable, and the one-line description
// reused by the gallery and by the pinned dashboard tiles.
//
// The DSL itself is specified in docs/INSIGHTS.md → "Plan DSL v1". This module
// only builds and describes plans — it never validates them, because the
// analytics executor is the one validator.

import type { Interval, Metric, Plan, PlanRange } from '../api/types';

export const PLAN_VERSION = 1;

export const METRICS: Metric[] = ['spend', 'income', 'net'];
export const INTERVALS: Interval[] = ['day', 'week', 'month', 'quarter', 'year'];

export interface RangeOption {
  /** A flat <option> value, because PlanRange is a union of objects. */
  value: string;
  label: string;
  range: PlanRange;
}

/** What the range chip offers. `absolute` stays URL- and template-only in v1. */
export const RANGE_OPTIONS: RangeOption[] = [
  { value: 'lastMonths-1', label: 'this month', range: { type: 'lastMonths', n: 1 } },
  { value: 'lastMonths-3', label: 'last 3 months', range: { type: 'lastMonths', n: 3 } },
  { value: 'lastMonths-6', label: 'last 6 months', range: { type: 'lastMonths', n: 6 } },
  { value: 'lastMonths-12', label: 'last 12 months', range: { type: 'lastMonths', n: 12 } },
  { value: 'yearToDate', label: 'year to date', range: { type: 'yearToDate' } },
  { value: 'all', label: 'all time', range: { type: 'all' } },
];

export function rangeOptionValue(range: PlanRange): string {
  return range.type === 'lastMonths' ? `lastMonths-${range.n}` : range.type;
}

export function describeRange(range: PlanRange): string {
  switch (range.type) {
    case 'lastMonths':
      // n buckets in total, the last one being the current partial month.
      return range.n === 1 ? 'this month' : `last ${range.n} months`;
    case 'yearToDate':
      return 'year to date';
    case 'absolute':
      return `${range.from} → ${range.to}`;
    case 'all':
      return 'all time';
  }
}

/**
 * Opens on something that draws on the very first Run: this month's spend by
 * category — which is the gallery's "Top categories this month" for free.
 */
export function defaultPlan(currency: string): Plan {
  return {
    version: PLAN_VERSION,
    metric: 'spend',
    // includeDescendants stays true throughout the explorer: a filter on
    // Groceries means groceries *including* its subtree, the rule budgets use.
    filters: { includeDescendants: true, currency },
    groupBy: 'category',
    interval: null,
    range: { type: 'lastMonths', n: 1 },
  };
}

/** The plan read back as a sentence, under the chips and on gallery cards. */
export function describePlan(plan: Plan, categoryName?: string): string {
  const parts: string[] = [plan.metric, categoryName ? `in ${categoryName}` : 'all categories'];
  const merchants = plan.filters.merchants;
  if (merchants?.length) parts.push(`at ${merchants.join(', ')}`);
  if (plan.groupBy) parts.push(`by ${plan.groupBy}`);
  if (plan.interval) parts.push(`per ${plan.interval}`);
  parts.push(describeRange(plan.range));
  parts.push(plan.filters.currency ?? 'every currency');
  // Both v2-era surfaces belong here: the sentence is the only place a pinned
  // tile says what will run, and a plan with a forecast runs differently.
  const months = plan.forecast?.months;
  if (months) parts.push(months === 1 ? '+1 month forecast' : `+${months} months forecast`);
  return parts.join(' · ');
}

/** The whole plan travels in one ?plan= param, so an exploration is linkable. */
export function planToSearch(plan: Plan): string {
  return JSON.stringify(plan);
}

/**
 * Plans come back out of the URL, which a user can hand-edit. Anything that is
 * not recognisably a plan falls back to the default instead of throwing — the
 * same spirit as Transactions.tsx clamping its URL-borne `page` param.
 */
export function planFromSearch(raw: string | null, currency: string): Plan {
  if (!raw) return defaultPlan(currency);
  try {
    const parsed = JSON.parse(raw) as Partial<Plan>;
    if (typeof parsed !== 'object' || parsed === null) return defaultPlan(currency);
    if (typeof parsed.metric !== 'string' || !parsed.range) return defaultPlan(currency);
    return { ...defaultPlan(currency), ...parsed } as Plan;
  } catch {
    return defaultPlan(currency);
  }
}
