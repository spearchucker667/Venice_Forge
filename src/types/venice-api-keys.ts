/** @fileoverview Venice API-key administration DTOs coded to the vendored
 *  OpenAPI snapshot (`docs/reference/Venice_swagger_api.yaml`) api_keys
 *  family: list/create/get/update/delete, rate_limits, rate_limits/log.
 *
 *  SECURITY: key material is never part of list/update responses. The only
 *  payload carrying a secret is the one-time `apiKey` field of the create
 *  response (VeniceApiKeyCreated.apiKey), which must be shown to the user
 *  exactly once and never persisted, logged, or exported. */

export type VeniceApiKeyType = "INFERENCE" | "ADMIN";

/** Which models a key may call, by privacy tier. */
export type VeniceApiKeyModelPrivacy = "ALL" | "PRIVATE_TEXT" | "PRIVATE_ONLY";

/** Reset window that consumption limits apply to. */
export type VeniceApiKeyLimitPeriod = "EPOCH" | "MONTH" | "LIFETIME";

/** Consumption limits evaluated against the selected limit period. */
export interface VeniceApiKeyConsumptionLimits {
  usd: number | null;
  diem: number | null;
  /** Deprecated upstream (legacy Diem) — display only. */
  vcu: number | null;
}

/** Single-key usage summary (trailing seven days). Values are strings upstream. */
export interface VeniceApiKeyUsage {
  trailingSevenDays: {
    usd: string;
    /** Deprecated upstream — display only. */
    vcu: string;
    diem: string;
  };
}

/** Usage within the current limit-period window. Only present for keys with limits. */
export interface VeniceApiKeyCurrentPeriodUsage {
  usd: string;
  diem: string;
}

/** GET /api_keys → data[] entry (list of active API keys). */
export interface VeniceApiKeyListItem {
  apiKeyType: VeniceApiKeyType;
  consumptionLimits: VeniceApiKeyConsumptionLimits;
  limitPeriod: VeniceApiKeyLimitPeriod;
  modelPrivacy: VeniceApiKeyModelPrivacy;
  createdAt: string | null;
  description: string;
  expiresAt: string | null;
  id: string;
  /** Last 6 characters of the key — safe metadata for identification. */
  last6Chars: string;
  lastUsedAt: string | null;
  usage?: VeniceApiKeyUsage;
  currentPeriodUsage?: VeniceApiKeyCurrentPeriodUsage;
}

/** POST /api_keys request body. `description` (max 64 chars) and `apiKeyType`
 *  are required upstream; everything else is optional. */
export interface VeniceApiKeyCreateInput {
  apiKeyType: VeniceApiKeyType;
  description: string;
  consumptionLimit?: {
    usd?: number | null;
    diem?: number | null;
    vcu?: number | null;
  };
  limitPeriod?: VeniceApiKeyLimitPeriod;
  modelPrivacy?: VeniceApiKeyModelPrivacy;
  /** Empty string clears expiration; YYYY-MM-DD or ISO 8601 otherwise. */
  expiresAt?: string;
}

/** POST /api_keys → data. `apiKey` is a ONE-TIME secret — shown once,
 *  never stored by the app, and never written to logs/telemetry (the
 *  canonical Venice client redacts it from inspector records). */
export interface VeniceApiKeyCreated {
  apiKey: string;
  apiKeyType: VeniceApiKeyType;
  consumptionLimit: {
    usd: number | null;
    diem: number | null;
    vcu: number | null;
  };
  limitPeriod: VeniceApiKeyLimitPeriod;
  modelPrivacy: VeniceApiKeyModelPrivacy;
  description?: string;
  expiresAt: string | null;
  id: string;
}

/** PUT /api_keys/{id} request body — only the fields upstream documents as
 *  mutable: description, expiration, consumption limits, limit period, and
 *  model privacy. The key id travels in the path. */
export interface VeniceApiKeyUpdateInput {
  description?: string;
  /** Empty string or null removes expiration. */
  expiresAt?: string | null;
  consumptionLimit?: {
    usd?: number | null;
    diem?: number | null;
    vcu?: number | null;
  };
  limitPeriod?: VeniceApiKeyLimitPeriod;
  modelPrivacy?: VeniceApiKeyModelPrivacy;
}

/** PUT /api_keys/{id} → data (updated key metadata; no secret material). */
export interface VeniceApiKeyUpdated {
  apiKeyType: VeniceApiKeyType;
  consumptionLimits: VeniceApiKeyConsumptionLimits;
  limitPeriod: VeniceApiKeyLimitPeriod;
  modelPrivacy: VeniceApiKeyModelPrivacy;
  createdAt: string | null;
  description: string;
  expiresAt: string | null;
  id: string;
  last6Chars: string;
  lastUsedAt: string | null;
}

/** DELETE /api_keys/{id} → body. */
export interface VeniceApiKeyDeleteResult {
  success: boolean;
}

/** GET /api_keys/rate_limits → data. */
export interface VeniceApiKeyRateLimits {
  accessPermitted: boolean;
  apiTier: {
    id: string;
    isCharged: boolean;
  };
  balances: {
    USD: number;
    DIEM: number;
  };
  keyExpiration: string | null;
  nextEpochBegins: string;
  rateLimits: Array<{
    apiModelId?: string;
    rateLimits: Array<{
      amount: number;
      type: string;
    }>;
  }>;
}

/** Rate-limit log entry (GET /api_keys/rate_limits/log → data, last 50). */
export interface VeniceApiKeyRateLimitLogEntry {
  apiKeyId: string;
  modelId: string;
  rateLimitTier: string;
  rateLimitType:
    | "RPD"
    | "RPM"
    | "TPM"
    | "FAILED_REQUESTS"
    | "UNSUPPORTED_FEATURE_REQUESTS";
  timestamp: string;
}
