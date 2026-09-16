import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { veniceFetch } from "../services/veniceClient/fetch";
import type {
  VeniceBillingBalance,
  VeniceBillingCurrency,
  VeniceBillingUsageAnalytics,
  VeniceBillingUsageHistory,
} from "../types/billing";
import { selectHasVeniceKey, useAuthStore } from "../stores/auth-store";
import { useProfileStore } from "../stores/profile-store";

/** Billing data is credential-scoped: balances, usage history, and analytics
 *  all describe the account behind the active Venice API key. Every query
 *  keys on `activeProfileId` (mirroring use-models) so a result obtained
 *  under profile A is never served for profile B, and queries are disabled
 *  until a Venice key is configured. The deprecated `/billing/usage` route is
 *  deliberately not used anywhere in this module. */

const BALANCE_STALE_MS = 60_000;
const HISTORY_STALE_MS = 30_000;
const ANALYTICS_STALE_MS = 5 * 60_000;
const BILLING_TIMEOUT_MS = 30_000;

export interface UseBillingOptions {
  enabled?: boolean;
}

/** Extracts a numeric HTTP status from a thrown veniceFetch error, when present. */
export function getVeniceErrorStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

export function useBillingBalance(options: UseBillingOptions = {}) {
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const hasVeniceKey = useAuthStore(selectHasVeniceKey);
  return useQuery({
    queryKey: ["billing", "balance", activeProfileId],
    queryFn: async () => {
      const res = await veniceFetch<VeniceBillingBalance>("/billing/balance", {
        method: "GET",
        retry: false,
        timeoutMs: BILLING_TIMEOUT_MS,
      });
      return res.data;
    },
    enabled: (options.enabled ?? true) && hasVeniceKey,
    staleTime: BALANCE_STALE_MS,
    retry: false,
  });
}

export interface UseBillingUsageHistoryParams {
  /** Inclusive lower date bound (YYYY-MM-DD). */
  startDate?: string;
  /** Inclusive upper date bound (YYYY-MM-DD). */
  endDate?: string;
  currency?: VeniceBillingCurrency;
  pageSize?: number;
}

/** Converts a YYYY-MM-DD date input into the ISO 8601 UTC bounds the
 *  usage-history endpoint documents: an inclusive lower bound at the start
 *  of `startDate` and an EXCLUSIVE upper bound at the start of the day
 *  after `endDate`. Returns undefined members when the input is empty or
 *  not a real calendar date. */
export function toUsageHistoryTimestamps(startDate?: string, endDate?: string): {
  startTimestamp?: string;
  endTimestamp?: string;
} {
  const start = startDate?.trim();
  const end = endDate?.trim();
  const isoDay = /^\d{4}-\d{2}-\d{2}$/;
  const result: { startTimestamp?: string; endTimestamp?: string } = {};
  if (start && isoDay.test(start) && !Number.isNaN(Date.parse(`${start}T00:00:00Z`))) {
    result.startTimestamp = `${start}T00:00:00Z`;
  }
  if (end && isoDay.test(end) && !Number.isNaN(Date.parse(`${end}T00:00:00Z`))) {
    const exclusive = new Date(Date.parse(`${end}T00:00:00Z`) + 24 * 60 * 60 * 1000);
    // Normalize to the same second-precision shape as the start bound.
    result.endTimestamp = exclusive.toISOString().replace(/\.000Z$/, "Z");
  }
  return result;
}

export function useBillingUsageHistory(
  params: UseBillingUsageHistoryParams,
  options: UseBillingOptions = {},
) {
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const hasVeniceKey = useAuthStore(selectHasVeniceKey);
  const startDate = params.startDate?.trim() || undefined;
  const endDate = params.endDate?.trim() || undefined;

  return useInfiniteQuery({
    queryKey: [
      "billing",
      "usage-history",
      activeProfileId,
      startDate ?? "",
      endDate ?? "",
      params.currency ?? "",
      params.pageSize ?? "",
    ],
    queryFn: async ({ pageParam }) => {
      const search = new URLSearchParams();
      if (pageParam) {
        // The cursor carries the filters of the walk it continues; upstream
        // forbids sending filter parameters alongside it.
        search.set("cursor", pageParam);
      } else {
        const { startTimestamp, endTimestamp } = toUsageHistoryTimestamps(startDate, endDate);
        if (startTimestamp) search.set("startTimestamp", startTimestamp);
        if (endTimestamp) search.set("endTimestamp", endTimestamp);
        if (params.currency) search.set("currency", params.currency);
        if (params.pageSize) search.set("pageSize", String(params.pageSize));
      }
      const query = search.toString();
      const res = await veniceFetch<VeniceBillingUsageHistory>(
        `/billing/usage-history${query ? `?${query}` : ""}`,
        { method: "GET", retry: false, timeoutMs: BILLING_TIMEOUT_MS },
      );
      return res.data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: (options.enabled ?? true) && hasVeniceKey,
    staleTime: HISTORY_STALE_MS,
    retry: false,
  });
}

export interface UseBillingUsageAnalyticsParams {
  /** Lookback period such as "7d" (max 90d). Ignored when a date pair is set. */
  lookback?: string;
  startDate?: string;
  endDate?: string;
}

export function useBillingUsageAnalytics(
  params: UseBillingUsageAnalyticsParams,
  options: UseBillingOptions = {},
) {
  const activeProfileId = useProfileStore((s) => s.activeProfileId);
  const hasVeniceKey = useAuthStore(selectHasVeniceKey);
  const startDate = params.startDate?.trim() || undefined;
  const endDate = params.endDate?.trim() || undefined;
  const lookback = startDate && endDate ? undefined : (params.lookback?.trim() || undefined);

  return useQuery({
    queryKey: [
      "billing",
      "usage-analytics",
      activeProfileId,
      lookback ?? "",
      startDate ?? "",
      endDate ?? "",
    ],
    queryFn: async () => {
      const search = new URLSearchParams();
      // Upstream requires startDate and endDate as a pair; fall back to lookback.
      if (startDate && endDate) {
        search.set("startDate", startDate);
        search.set("endDate", endDate);
      } else if (lookback) {
        search.set("lookback", lookback);
      }
      const query = search.toString();
      const res = await veniceFetch<VeniceBillingUsageAnalytics>(
        `/billing/usage-analytics${query ? `?${query}` : ""}`,
        { method: "GET", retry: false, timeoutMs: BILLING_TIMEOUT_MS },
      );
      return res.data;
    },
    enabled: (options.enabled ?? true) && hasVeniceKey,
    staleTime: ANALYTICS_STALE_MS,
    retry: false,
  });
}
