// DTO types mirroring docs/API.md exactly.
// All money values are decimal strings (e.g. "1234.5000") — never JSON numbers.

export interface UserResponse {
  id: number;
  email: string;
  displayName: string;
  createdAt?: string;
}

export interface ProfileSummary {
  id: number;
  name: string;
  defaultCurrency: string;
}

export interface ProfileResponse extends ProfileSummary {
  createdAt: string;
}

/** Shape of both POST /api/auth/login and GET /api/auth/me. */
export interface SessionResponse {
  user: UserResponse;
  profiles: ProfileSummary[];
  activeProfileId: number | null;
}

export interface ActiveProfileResponse {
  activeProfileId: number;
  profile: ProfileSummary;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CreateProfileRequest {
  name: string;
  defaultCurrency: string;
}

// — Categories —

export interface CategoryNode {
  id: number;
  name: string;
  parentId: number | null;
  /** Own display color (lowercase #rrggbb) or null/absent = inherit from nearest ancestor. */
  color?: string | null;
  depth: number;
  children: CategoryNode[];
}

export interface CreateCategoryRequest {
  name: string;
  parentId?: number | null;
  color?: string | null;
}

export interface UpdateCategoryRequest {
  name?: string;
  parentId?: number | null;
  color?: string | null;
}

/** The small {id, name} reference inlined in transactions/budgets/subscriptions. */
export interface CategoryRef {
  id: number;
  name: string;
}

// — Transactions —

export type TxnType = 'EXPENSE' | 'INCOME';

export interface TransactionResponse {
  id: number;
  category: CategoryRef;
  amount: string;
  currency: string;
  type: TxnType;
  occurredOn: string;
  description: string | null;
  merchant: string | null;
  subscriptionId: number | null;
  createdAt: string;
}

export interface CreateTransactionRequest {
  categoryId: number;
  amount: string;
  currency: string;
  type: TxnType;
  occurredOn: string;
  description?: string | null;
  merchant?: string | null;
}

export interface TransactionQuery {
  from?: string;
  to?: string;
  categoryId?: number;
  includeDescendants?: boolean;
  type?: TxnType;
  page?: number;
  size?: number;
}

export interface Page<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/** One backfill candidate from GET /api/transactions/merchant-suggestions. */
export interface MerchantSuggestion {
  description: string;
  /** JSON number (a row count, never money). */
  transactionCount: number;
}

export interface MerchantBackfillRequest {
  description: string;
  merchant: string;
}

export interface MerchantBackfillResponse {
  updated: number;
}

// — Budgets —

export interface BudgetResponse {
  id: number;
  category: CategoryRef;
  amountLimit: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
  createdAt?: string;
}

export interface BudgetStatusResponse {
  budget: BudgetResponse;
  spent: string;
  remaining: string;
  /** JSON number (display ratio, never money). */
  percentUsed: number;
  overBudget: boolean;
  includesDescendants: boolean;
  excludedCurrencies: string[];
}

export interface CreateBudgetRequest {
  categoryId: number;
  amountLimit: string;
  currency: string;
  periodStart: string;
  periodEnd: string;
}

// — Subscriptions —

export type BillingPeriod = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
export type SubscriptionStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';

export interface SubscriptionResponse {
  id: number;
  name: string;
  category: CategoryRef;
  amount: string;
  currency: string;
  billingPeriod: BillingPeriod;
  nextBillingOn: string;
  status: SubscriptionStatus;
  notes: string | null;
  /** Server-side normalization (WEEKLY ×52/12, QUARTERLY /3, YEARLY /12). */
  monthlyAmount: string;
  createdAt: string;
}

export interface CreateSubscriptionRequest {
  name: string;
  categoryId: number;
  amount: string;
  currency: string;
  billingPeriod: BillingPeriod;
  nextBillingOn: string;
  notes?: string | null;
}

export interface UpdateSubscriptionRequest extends CreateSubscriptionRequest {
  status: SubscriptionStatus;
}

export interface CurrencyAmount {
  currency: string;
  amount: string;
}

export interface SubscriptionCategoryCost {
  category: CategoryRef;
  currency: string;
  monthlyAmount: string;
}

export interface UpcomingRenewal {
  id: number;
  name: string;
  category: CategoryRef;
  amount: string;
  currency: string;
  billingPeriod: BillingPeriod;
  nextBillingOn: string;
  daysUntil: number;
}

export interface SubscriptionDashboardResponse {
  asOf: string;
  activeCount: number;
  pausedCount: number;
  monthlyCost: CurrencyAmount[];
  yearlyCost: CurrencyAmount[];
  chargedThisMonth: CurrencyAmount[];
  byCategory: SubscriptionCategoryCost[];
  upcoming: UpcomingRenewal[];
  overdue: UpcomingRenewal[];
}

// — Backup —

export interface BackupExportRequest {
  profileIds: number[];
}

/** One restored profile in the POST /api/backup/restore summary. */
export interface RestoredProfileSummary {
  id: number;
  name: string;
  categories: number;
  transactions: number;
  budgets: number;
  subscriptions: number;
}

export interface RestoreBackupResponse {
  profiles: RestoredProfileSummary[];
}

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
  projected?: boolean;
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

/** The shape is derived by the executor from interval × groupBy, not declared. */
export type CurrencyResult =
  | { currency: string; shape: 'value'; value: string }
  | { currency: string; shape: 'timeseries'; points: Point[] }
  | { currency: string; shape: 'breakdown'; groups: Group[] }
  | { currency: string; shape: 'timeseriesSplit'; series: Series[] };

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

export interface Insight {
  id: number;
  name: string;
  plan: Plan;
  viz: Viz | null;
  pinned: boolean;
  createdAt: string;
}

export interface InsightRequest {
  name: string;
  plan: Plan;
  viz?: Viz | null;
  pinned?: boolean;
}
