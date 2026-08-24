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
