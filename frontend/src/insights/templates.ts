// The template gallery — docs/INSIGHTS.md → "Template gallery". Code-shipped,
// not DB rows: they version with the DSL in the same commit, they teach the
// chip vocabulary by example, and they give an empty install something to
// click. Opening one pre-fills the chips; the user tweaks, runs, saves.

import type { Plan } from '../api/types';
import { PLAN_VERSION } from './planDefaults';

export interface InsightTemplate {
  id: string;
  name: string;
  /** One line on the gallery card: what the chart answers, and what to tweak. */
  blurb: string;
  plan: (currency: string) => Plan;
}

export const TEMPLATES: InsightTemplate[] = [
  {
    id: 'monthly-in-category',
    name: 'Monthly spending in a category',
    blurb: 'Pick a category with the chip, then run — twelve monthly points.',
    plan: (currency) => ({
      version: PLAN_VERSION,
      metric: 'spend',
      filters: { includeDescendants: true, currency },
      groupBy: null,
      interval: 'month',
      range: { type: 'lastMonths', n: 12 },
    }),
  },
  {
    id: 'top-categories',
    name: 'Top categories this month',
    blurb: 'Where the money went, one bar per top-level category.',
    plan: (currency) => ({
      version: PLAN_VERSION,
      metric: 'spend',
      filters: { includeDescendants: true, currency },
      groupBy: 'category',
      interval: null,
      range: { type: 'lastMonths', n: 1 },
    }),
  },
  {
    id: 'this-vs-last-month',
    name: 'This month vs last month, by category',
    blurb: 'Two buckets, so it draws as grouped bars rather than stubby lines.',
    plan: (currency) => ({
      version: PLAN_VERSION,
      metric: 'spend',
      filters: { includeDescendants: true, currency },
      groupBy: 'category',
      interval: 'month',
      range: { type: 'lastMonths', n: 2 },
    }),
  },
  // "Income vs spending, monthly" is two insights shown side by side — one
  // metric per plan is a design rule (INSIGHTS.md → Plan DSL v1), so the
  // gallery ships both halves and the user pins them next to each other.
  {
    id: 'income-monthly',
    name: 'Income, monthly — last 12 months',
    blurb: 'Half of the income-vs-spending pair; pin it beside the other half.',
    plan: (currency) => ({
      version: PLAN_VERSION,
      metric: 'income',
      filters: { includeDescendants: true, currency },
      groupBy: null,
      interval: 'month',
      range: { type: 'lastMonths', n: 12 },
    }),
  },
  {
    id: 'spending-monthly',
    name: 'Spending, monthly — last 12 months',
    blurb: 'The other half of the pair, on the same buckets and scale.',
    plan: (currency) => ({
      version: PLAN_VERSION,
      metric: 'spend',
      filters: { includeDescendants: true, currency },
      groupBy: null,
      interval: 'month',
      range: { type: 'lastMonths', n: 12 },
    }),
  },
  // Gallery entry 5, "Weekday pattern: average daily spend", is deliberately
  // absent: it needs a `weekday` groupBy the DSL does not have. It is recorded
  // in INSIGHTS.md → "Deliberately deferred" with its trigger (demand for the
  // weekday template), so the gallery grows when the DSL does.
  {
    id: 'subscription-cost',
    name: 'Subscription cost over time',
    blurb:
      'Approximate: pick the category your subscriptions are booked to. Exact once a subscriptionsOnly filter exists.',
    plan: (currency) => ({
      version: PLAN_VERSION,
      metric: 'spend',
      filters: { includeDescendants: true, currency },
      groupBy: null,
      interval: 'month',
      range: { type: 'lastMonths', n: 12 },
    }),
  },
];
