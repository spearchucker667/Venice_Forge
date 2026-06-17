/** @fileoverview Safe API-key and Venice connectivity status contracts. */

export type ApiConnectivityEndpoint = "models" | "chat" | "catalog" | "health";

export type ApiConnectivityFailureKind =
  | "missing-api-key"
  | "invalid-api-key"
  | "network-failure"
  | "venice-error"
  | "proxy-failure"
  | "bridge-unavailable"
  | "catalog-failure"
  | "unknown";

export type ApiConnectivityStatus =
  | {
      ok: true;
      kind: "verified";
      checkedAt: string;
      statusCode?: number;
      endpoint: ApiConnectivityEndpoint;
    }
  | {
      ok: false;
      kind: ApiConnectivityFailureKind;
      checkedAt: string;
      statusCode?: number;
      safeMessage: string;
      retryable: boolean;
    };

export type ApiKeyValidationStatus =
  | "not-configured"
  | "configured-not-validated"
  | "valid"
  | "invalid"
  | "network-error"
  | "bridge-error"
  | "unknown";

export type SafeApiKeyStorage =
  | "secure-storage"
  | "memory"
  | "env"
  | "web-environment"
  | "unavailable";

export interface SafeApiKeyMetadata {
  configured: boolean;
  storage: SafeApiKeyStorage;
  exported: false;
  redacted: true;
  reason: string;
  lastValidationStatus: ApiKeyValidationStatus;
  lastValidationAt: string | null;
}

export function buildSafeApiKeyMetadata(input: {
  configured: boolean;
  storage: SafeApiKeyStorage;
  lastValidationStatus?: ApiKeyValidationStatus;
  lastValidationAt?: string | null;
}): SafeApiKeyMetadata {
  return {
    configured: input.configured,
    storage: input.storage,
    exported: false,
    redacted: true,
    reason: "API keys are excluded from safe summaries and exports.",
    lastValidationStatus:
      input.lastValidationStatus ??
      (input.configured ? "configured-not-validated" : "not-configured"),
    lastValidationAt: input.lastValidationAt ?? null,
  };
}

export function validationStatusFromConnectivity(
  status: ApiConnectivityStatus | null | undefined,
  configured: boolean,
): ApiKeyValidationStatus {
  if (!configured) return "not-configured";
  if (!status) return "configured-not-validated";
  if (status.ok) return "valid";
  if (status.kind === "invalid-api-key") return "invalid";
  if (status.kind === "network-failure" || status.kind === "catalog-failure") return "network-error";
  if (status.kind === "bridge-unavailable" || status.kind === "proxy-failure") return "bridge-error";
  return "unknown";
}
