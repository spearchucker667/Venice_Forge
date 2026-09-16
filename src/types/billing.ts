/** @fileoverview Venice billing DTOs coded to the vendored OpenAPI snapshot
 *  (`docs/reference/Venice_swagger_api.yaml`): BillingBalanceResponse,
 *  BillingUsageHistoryRequest/Response, BillingUsageAnalyticsRequest/Response.
 *  The deprecated `/billing/usage` endpoint is intentionally absent — new
 *  code must use `/billing/usage-history`. */

/** Currency a usage entry was charged in (BillingUsageHistoryEntry.currency). */
export type VeniceBillingCurrency = "USD" | "DIEM" | "BUNDLED_CREDITS";

/** Currency the account consumes in (BillingBalanceResponse.consumptionCurrency). */
export type VeniceConsumptionCurrency = "USD" | "VCU" | "DIEM" | "BUNDLED_CREDITS";

/** GET /billing/balance → BillingBalanceResponse. */
export interface VeniceBillingBalance {
  /** Whether the user has sufficient balance to make API requests. */
  canConsume: boolean;
  /** The currency that will be used for consumption; null when unset. */
  consumptionCurrency: VeniceConsumptionCurrency | null;
  balances: {
    /** Remaining DIEM balance for the current epoch. Null if not staking. */
    diem: number | null;
    /** Remaining USD balance. Null if not available. */
    usd: number | null;
  };
  /** Total DIEM allocation for the current epoch (from staking). */
  diemEpochAllocation: number;
}

/** Inference details attached to a usage-history entry when applicable. */
export interface VeniceBillingInferenceDetails {
  completionTokens: number | null;
  inferenceExecutionTime: number | null;
  promptTokens: number | null;
  requestId: string;
}

/** One entry of BillingUsageHistoryResponse.data (ascending timestamp order). */
export interface VeniceBillingUsageEntry {
  /** The total amount charged for the billing usage entry. */
  amount: number;
  currency: VeniceBillingCurrency;
  inferenceDetails: VeniceBillingInferenceDetails | null;
  notes: string;
  pricePerUnitUsd: number;
  sku: string;
  /** ISO 8601 timestamp of the entry. */
  timestamp: string;
  units: number;
}

/** GET /billing/usage-history → BillingUsageHistoryResponse. */
export interface VeniceBillingUsageHistory {
  data: VeniceBillingUsageEntry[];
  /** Continuation token for the next page; null means this is the last page. */
  nextCursor: string | null;
}

/** Query parameters for GET /billing/usage-history (BillingUsageHistoryRequest). */
export interface VeniceBillingUsageHistoryParams {
  currency?: VeniceBillingCurrency;
  cursor?: string;
  /** Exclusive upper bound, ISO 8601 UTC with "Z" suffix. First page only. */
  endTimestamp?: string;
  pageSize?: number;
  /** Inclusive lower bound, ISO 8601 UTC with "Z" suffix. First page only. */
  startTimestamp?: string;
}

/** Per-model aggregation entry of BillingUsageAnalyticsResponse.byModel. */
export interface VeniceBillingAnalyticsByModel {
  modelName: string;
  unitType: string;
  modelType: string | null;
  totalUsd: number;
  totalDiem: number;
  totalUnits: number;
  breakdown?: Array<{
    type: string;
    usd: number;
    diem: number;
    units: number;
  }>;
}

/** Daily totals entry of BillingUsageAnalyticsResponse.byDate. */
export interface VeniceBillingAnalyticsByDate {
  date: string;
  USD: number;
  DIEM: number;
}

/** Per-key aggregation entry of BillingUsageAnalyticsResponse.byKey. */
export interface VeniceBillingAnalyticsByKey {
  apiKeyId: string | null;
  description: string;
  totalUsd: number;
  totalDiem: number;
  totalUnits: number;
}

/** GET /billing/usage-analytics → BillingUsageAnalyticsResponse. */
export interface VeniceBillingUsageAnalytics {
  lookback: string;
  byDate: VeniceBillingAnalyticsByDate[];
  byModel: VeniceBillingAnalyticsByModel[];
  byModelDaily: Array<Record<string, number>>;
  topModels: string[];
  byKey: VeniceBillingAnalyticsByKey[];
  byKeyDaily: Array<Record<string, number>>;
  topKeyNames: string[];
}

/** Query parameters for GET /billing/usage-analytics
 *  (BillingUsageAnalyticsRequest). Either `lookback` ("7d", max 90d) or a
 *  `startDate`/`endDate` pair (YYYY-MM-DD, both required together). */
export interface VeniceBillingUsageAnalyticsParams {
  lookback?: string;
  startDate?: string;
  endDate?: string;
}
