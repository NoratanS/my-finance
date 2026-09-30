// Request and response types, derived from the generated OpenAPI declarations (./schema.d.ts,
// from docs/openapi.json) and named after the backend records. Hand-written: the transaction
// list's query parameters and the Plan DSL / result shapes (the backend treats plans as opaque).
// All money values are decimal strings (e.g. "1234.5000") — never JSON numbers.

import type { components } from './schema';

export type UserResponse = components['schemas']['UserResponse'];

export type ProfileSummary = components['schemas']['ProfileSummary'];

export type ProfileResponse = components['schemas']['ProfileResponse'];

/** Shape of both POST /api/auth/login and GET /api/auth/me. */
export type SessionResponse = components['schemas']['SessionResponse'];

/** How the server authenticates: PASSWORD (login screen) or NONE (single local account, no login). */
export type AuthMode = SessionResponse['authMode'];

export type ActiveProfileResponse = components['schemas']['ActiveProfileResponse'];

export type RegisterRequest = components['schemas']['RegisterRequest'];

export type LoginRequest = components['schemas']['LoginRequest'];

/** PUT /api/auth/password — passwordless instances only. */
export type SetPasswordRequest = components['schemas']['SetPasswordRequest'];

export type CreateProfileRequest = components['schemas']['CreateProfileRequest'];

/** PUT /api/profiles/{id} — rename only; the default currency can't be changed here. */
export type UpdateProfileRequest = components['schemas']['UpdateProfileRequest'];

// — Categories —

/** `color` is the node's own display color (lowercase #rrggbb), or null = inherit from the nearest ancestor. */
export type CategoryNode = components['schemas']['CategoryNode'];

export type CreateCategoryRequest = components['schemas']['CreateCategoryRequest'];

export type UpdateCategoryRequest = components['schemas']['UpdateCategoryRequest'];

/** The small {id, name} reference inlined in transactions/budgets/subscriptions. */
export type CategoryRef = components['schemas']['CategoryRef'];

// — Transactions —

export type TransactionResponse = components['schemas']['TransactionResponse'];

export type TxnType = TransactionResponse['type'];

export type CreateTransactionRequest = components['schemas']['TransactionRequest'];

export interface TransactionQuery {
  from?: string;
  to?: string;
  categoryId?: number;
  includeDescendants?: boolean;
  type?: TxnType;
  q?: string;
  page?: number;
  size?: number;
}

/**
 * One row of GET /api/transactions/summary — a server-side total over EVERY matching
 * transaction, not over a page. One row per currency; amounts are decimal strings at
 * scale 4 and are never added across currencies.
 */
export type TransactionSummary = components['schemas']['TransactionSummary'];

/** One row of GET /api/transactions/category-counts — counted as filed, no subtree roll-up. */
export type CategoryTransactionCount = components['schemas']['CategoryTransactionCount'];

/** One row of GET /api/transactions/category-totals — as filed, per currency. */
export type CategoryTotal = components['schemas']['CategoryTotal'];

/** One page of GET /api/transactions. */
export type TransactionPage = components['schemas']['PageResponseTransactionResponse'];

/** One backfill candidate from GET /api/transactions/merchant-suggestions. */
export type MerchantSuggestion = components['schemas']['MerchantSuggestion'];

export type MerchantBackfillRequest = components['schemas']['MerchantBackfillRequest'];

export type MerchantBackfillResponse = components['schemas']['MerchantBackfillResponse'];

// — Budgets —

export type BudgetResponse = components['schemas']['BudgetResponse'];

/** `percentUsed` is a JSON number (a display ratio, never money); `budget` has no `createdAt`. */
export type BudgetStatusResponse = components['schemas']['BudgetStatusResponse'];

export type CreateBudgetRequest = components['schemas']['CreateBudgetRequest'];

// — Subscriptions —

/** `monthlyAmount` is the server-side normalization (WEEKLY ×52/12, QUARTERLY /3, YEARLY /12). */
export type SubscriptionResponse = components['schemas']['SubscriptionResponse'];

export type BillingPeriod = SubscriptionResponse['billingPeriod'];
export type SubscriptionStatus = SubscriptionResponse['status'];

export type CreateSubscriptionRequest = components['schemas']['SubscriptionRequest'];

export type UpdateSubscriptionRequest = components['schemas']['UpdateSubscriptionRequest'];

export type CurrencyAmount = components['schemas']['CurrencyAmount'];

export type CategoryMonthlyCost = components['schemas']['CategoryMonthlyCost'];

export type UpcomingRenewal = components['schemas']['UpcomingRenewal'];

export type SubscriptionDashboardResponse = components['schemas']['SubscriptionDashboardResponse'];

// — Backup —

export type BackupExportRequest = components['schemas']['BackupExportRequest'];

/** One restored profile in the POST /api/backup/restore summary. */
export type RestoredProfile = components['schemas']['RestoredProfile'];

export type BackupRestoreResponse = components['schemas']['BackupRestoreResponse'];

// — Insights —
// The plan DSL v1 and the executor's result envelope, mirroring
// docs/INSIGHTS.md → "Plan DSL v1" / "Result shapes". Every amount is a
// decimal string at scale 4 ("243.5000"), like the rest of the API.

export type Metric = 'spend' | 'income' | 'net';
export type GroupBy = 'category' | 'merchant';
export type Interval = 'day' | 'week' | 'month' | 'quarter' | 'year';

export type PlanRange =
  | { type: 'lastMonths'; n: number }
  | { type: 'yearToDate' }
  | { type: 'absolute'; from: string; to: string }
  | { type: 'all' };

export interface PlanFilters {
  categoryId?: number;
  /** Default true: a filter on Groceries means its whole subtree. */
  includeDescendants?: boolean;
  /** Rejected by the executor until the merchant column lands (Phase 4b). */
  merchants?: string[];
  currency?: string;
}

export interface Plan {
  version: number;
  metric: Metric;
  filters: PlanFilters;
  groupBy: GroupBy | null;
  interval: Interval | null;
  range: PlanRange;
  /** Phase 4b (plan version 2); absent in v1 plans. */
  forecast?: { months: number };
}

/** One time bucket. `period` is the bucket's ISO start ("2026-07", "2026-Q3"). */
export interface Point {
  period: string;
  value: string;
  /** Seasonal-naive projection appended by the executor — drawn as a dashed continuation. */
  projected?: boolean;
  /** Outlier by the median/MAD rule (docs/INSIGHTS.md → Anomaly flags). */
  anomaly?: boolean;
}

/** One categorical group. `key` is machine-stable, `label` is for humans. */
export interface Group {
  key: string;
  label: string;
  value: string;
}

export interface Series {
  key: string;
  label: string;
  points: Point[];
}

export interface DriftLeader {
  key: string;
  label: string;
  value: string;
}

/** A lead change between the last two complete buckets (docs/INSIGHTS.md → Drift). */
export interface DriftEvent {
  kind: 'leadChange';
  period: string;
  previousPeriod: string;
  leader: DriftLeader;
  previousLeader: DriftLeader;
}

/** The shape is derived by the executor from interval × groupBy, not declared. */
export type CurrencyResult =
  | { currency: string; shape: 'value'; value: string }
  | { currency: string; shape: 'timeseries'; points: Point[] }
  | { currency: string; shape: 'breakdown'; groups: Group[] }
  | { currency: string; shape: 'timeseriesSplit'; series: Series[]; drift?: DriftEvent[] };

export interface ResultEnvelope {
  plan: Plan;
  /** One entry per currency present — currencies never mix. */
  results: CurrencyResult[];
  meta: { truncatedGroups: boolean };
}

/**
 * Optional render override stored with a saved Insight. v1 distinguishes only
 * *table vs. chart*: `{ chart: 'table' }` pins the table renderer, and an
 * absent/`null` `viz` means the default chart for the result shape
 * (docs/INSIGHTS.md → Result shapes). Choosing a specific chart type is
 * deferred — no renderer picks between line, bar and donut today, so declaring
 * those values here would be a promise nothing keeps. The column is JSONB and
 * the backend stores it opaquely, so a value written by an API client is still
 * returned verbatim; anything that is not `"table"` renders as the default
 * chart.
 */
export interface Viz {
  chart?: 'table';
}

/** The generated InsightResponse, with the opaque `plan` and `viz` objects typed by hand. */
export type Insight = Omit<components['schemas']['InsightResponse'], 'plan' | 'viz'> & {
  plan: Plan;
  viz: Viz | null;
};

/** The generated InsightRequest, with the opaque `plan` and `viz` objects typed by hand. */
export type InsightRequest = Omit<components['schemas']['InsightRequest'], 'plan' | 'viz'> & {
  plan: Plan;
  viz?: Viz | null;
};
