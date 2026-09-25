/** @fileoverview API key IPC handlers (apiKey:*). */

import {
  isPrimaryApiRouteId,
  DEFAULT_PRIMARY_API_ROUTE,
} from "../../../src/shared/primaryApiRoute";
import {
  deleteApiKey,
  getApiKeyConfigurationStatus,
  getStorageMode,
  isApiKeyConfigured,
  setApiKey,
  deleteProviderApiKey,
  getProviderApiKey,
  isProviderApiKeyConfigured,
  setProviderApiKey,
  setProviderCredential,
  deleteProviderCredential,
  getProviderCredential,
  isProviderCredentialConfigured,
  isProviderConfigured,
  setProfilePassword,
  verifyProfilePassword,
  isProfilePasswordSet,
  clearProfilePassword,
  setMasterPassword,
  verifyMasterPassword,
  isMasterPasswordSet,
  clearMasterPassword,
  getProfilePasswordLockoutSeconds,
} from "../../services/secureStore";
import { readResponseError } from "../../services/veniceClient";
import { performGuardedVeniceRequest } from "../../services/guardPipeline";
import { validateApiKeyInput, validateProviderCredential } from "../validation";
import { redactErrorMessage } from "../../../src/shared/redaction";
import { isValidProfileStorageId } from "../../../src/utils/profileIdValidation";
import type { ApiConnectivityFailureKind, ApiConnectivityStatus, ProviderConnectionResult } from "../../../src/types/api-connectivity";
import { registerPrivilegedIpcChannel } from "./common";
import { PROVIDER_REGISTRY, requiresStructuredCredential, type ProviderId, type AzureOpenAiConfig, type AwsBedrockConfig, type GoogleVertexConfig } from "../../../src/types/provider";
import { getProfileSessionId, setProfileSessionId } from "../../services/profileSession";
import { getCustomProtocolCapabilityManager } from "../../services/customProtocolCapabilities";
import { getAgentServices, RUNTIME_SESSION_ID } from "../../agent/runtime/agent-services";
import {
  disableProvider,
  getProviderSettings,
  isProviderAvailableForFallback,
  updateProviderSettings,
  type ProviderSettingsUpdate,
} from "../../services/providerSettingsStore";

/** Parses and validates a profile id for IPC use (storage-valid, including "default"). */
function parseProfileId(profileId: unknown): string {
  if (!isValidProfileStorageId(profileId)) {
    throw new Error("Invalid profile id.");
  }
  return profileId;
}

function parseProviderId(providerId: unknown): string {
  if (typeof providerId !== "string" || !(providerId in PROVIDER_REGISTRY)) {
    throw new Error(`Invalid provider ID: ${String(providerId)}`);
  }
  return providerId;
}

function connectivityFailure(
  kind: ApiConnectivityFailureKind,
  safeMessage: string,
  options: { statusCode?: number; retryable?: boolean } = {},
): ApiConnectivityStatus {
  return {
    ok: false,
    kind,
    checkedAt: new Date().toISOString(),
    statusCode: options.statusCode,
    safeMessage,
    retryable: options.retryable ?? false,
  };
}

function classifyConnectivityFailure(status: number, message: string): ApiConnectivityStatus {
  if (status === 401 || status === 403) {
    return connectivityFailure(
      "invalid-api-key",
      "API key was found, but Venice rejected it. Re-enter the key in Config.",
      { statusCode: status },
    );
  }
  if ([408, 429, 500, 502, 503, 504].includes(status)) {
    return connectivityFailure(
      "venice-error",
      "Venice returned an error response. Try again or check provider status.",
      { statusCode: status, retryable: true },
    );
  }
  return connectivityFailure(
    "catalog-failure",
    message || "Model catalog failed to load from Venice. Chat may still work if a model is already selected.",
    { statusCode: status, retryable: status >= 500 },
  );
}

async function testVeniceConnection(profileId?: string): Promise<{ ok: boolean; status?: number; message: string; connectivity: ApiConnectivityStatus }> {
  if (!isApiKeyConfigured(profileId)) {
    return {
      ok: false,
      message: "No API key configured.",
      connectivity: connectivityFailure(
        "missing-api-key",
        "API key is missing. Open Config and add a Venice API key.",
      ),
    };
  }
  try {
    const guarded = await performGuardedVeniceRequest({ endpoint: "/models", method: "GET", profileId });
    const response = guarded.kind === "blocked"
      ? { ok: false, status: 451, statusText: "Blocked by Family Safe Mode", headers: {}, body: { error: guarded.block.body.error }, contentType: "application/json" }
      : guarded.response;
    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        message: "Connection successful",
        connectivity: {
          ok: true,
          kind: "verified",
          checkedAt: new Date().toISOString(),
          statusCode: response.status,
          endpoint: "models",
        },
      };
    }
    const message = readResponseError(response);
    return {
      ok: false,
      status: response.status,
      message,
      connectivity: classifyConnectivityFailure(response.status, message),
    };
  } catch (err) {
    const message = redactErrorMessage(err);
    return {
      ok: false,
      status: 0,
      message,
      connectivity: connectivityFailure(
        /ipc|bridge|preload/i.test(message) ? "bridge-unavailable" : "network-failure",
        /ipc|bridge|preload/i.test(message)
          ? "Desktop bridge is unavailable. Restart the app or use web dev mode."
          : "Network request failed before Venice responded. Check connection, proxy, VPN, or firewall.",
        { statusCode: 0, retryable: true },
      ),
    };
  }
}

/** Reserved credential names that must never be read/written through a
 *  generic credential IPC bridge. The renderer-facing `credential:*`
 *  channels were removed; this policy remains so a reintroduced generic
 *  store cannot silently accept password, unlock, or chat-folder-lock names.
 *  Passwords, profile secrets, unlock-secrets, and internal application
 *  namespaces must use typed IPC channels or separate storage scopes.
 *
 *  Exported for unit-test verification of the reservation policy. */
export function isReservedCredentialName(name: unknown): boolean {
  if (typeof name !== "string" || name.length === 0) return true;
  const lower = name.toLowerCase();
  if (["password", "master_password", "profile_password"].includes(lower)) return true;
  if (/^profile_password[:_]/.test(lower)) return true;
  if (/_password$/.test(lower)) return true;
  if (lower.includes("password")) return true;
  if (/unlock[_-]?secret|secret[_-]?unlock|unlocksecret|secretunlock/.test(lower)) return true;
  // Internal chat-folder lock metadata lives in the generic credential
  // namespace; prevent a renderer caller from corrupting lock state.
  if (lower.startsWith("chat-folder-lock:")) return true;
  return false;
}

interface ProviderTestRequest {
  url: string;
  headers: Record<string, string>;
}

function isAzureOpenAiConfig(credential: unknown): credential is AzureOpenAiConfig {
  return (
    typeof credential === "object" &&
    credential !== null &&
    "resourceName" in credential &&
    "deploymentName" in credential &&
    "apiVersion" in credential &&
    "apiKey" in credential
  );
}

function isAwsBedrockConfig(credential: unknown): credential is AwsBedrockConfig {
  if (typeof credential !== "object" || credential === null) return false;
  const c = credential as Record<string, unknown>;
  return (
    c.providerId === "aws_bedrock" &&
    typeof c.region === "string" &&
    typeof c.apiKey === "string"
  );
}

function isGoogleVertexConfig(credential: unknown): credential is GoogleVertexConfig {
  if (typeof credential !== "object" || credential === null) return false;
  const c = credential as Record<string, unknown>;
  if (c.providerId !== "google_vertex") return false;
  if (c.authMode === "express") {
    return (
      typeof c.apiKey === "string" &&
      typeof c.projectId === "string" &&
      typeof c.location === "string"
    );
  }
  if (c.authMode === "full") {
    return typeof c.projectId === "string" && typeof c.location === "string";
  }
  return false;
}

/**
 * Builds the URL and headers used by the per-provider connection test.
 *
 * Exported for unit-test verification that the test request does not
 * embed provider credentials in URL query parameters (logs / telemetry)
 * and that supported providers carry the credential in the request
 * headers instead (VF-AUD-20260916-P2-004).
 */
export function buildProviderTestRequest(
  providerId: ProviderId,
  credential: string | AzureOpenAiConfig | AwsBedrockConfig | GoogleVertexConfig,
): ProviderTestRequest | null {
  if (providerId === "azure_openai") {
    if (!isAzureOpenAiConfig(credential)) return null;
    return {
      url: `https://${credential.resourceName}.openai.azure.com/openai/deployments?api-version=${encodeURIComponent(credential.apiVersion)}`,
      headers: { "api-key": credential.apiKey },
    };
  }

  if (providerId === "aws_bedrock") {
    if (!isAwsBedrockConfig(credential)) return null;
    return {
      url: `https://bedrock-mantle.${encodeURIComponent(credential.region)}.api.aws/v1/models`,
      headers: { Authorization: `Bearer ${credential.apiKey}` },
    };
  }

  if (providerId === "google_vertex") {
    if (!isGoogleVertexConfig(credential)) return null;
    if (credential.authMode === "express") {
      // VF-AUD-20260916-P2-004: Google Cloud REST supports header auth via
      // `x-goog-api-key`; the `?key=` query form would expose the credential
      // in URLs (logs, telemetry). Mirror the request-path auth used by
      // electron/services/providerAdapters.ts so the connection test does
      // not disagree with the actual request transport.
      return {
        url: "https://aiplatform.googleapis.com/v1/publishers/google/models",
        headers: { "x-goog-api-key": credential.apiKey },
      };
    }
    // Full Vertex OAuth/service-account mode is not implemented.
    return null;
  }

  const key = typeof credential === "string" ? credential : "";
  const bearer: Record<string, string> = key ? { Authorization: `Bearer ${key}` } : {};

  switch (providerId) {
    case "together":
      return { url: "https://api.together.xyz/v1/models", headers: bearer };
    case "groq":
      return { url: "https://api.groq.com/openai/v1/models", headers: bearer };
    case "fireworks":
      return { url: "https://api.fireworks.ai/inference/v1/models", headers: bearer };
    case "mistral":
      return { url: "https://api.mistral.ai/v1/models", headers: bearer };
    case "perplexity":
      return { url: "https://api.perplexity.ai/models", headers: bearer };
    case "huggingface":
      return { url: "https://router.huggingface.co/v1/models", headers: bearer };
    case "replicate": {
      const replicateKey = typeof credential === "string" ? credential : "";
      return {
        url: "https://api.replicate.com/v1/models/black-forest-labs/flux-schnell",
        headers: replicateKey ? { Authorization: `Bearer ${replicateKey}`, "Content-Type": "application/json" } : {},
      };
    }
    case "cohere":
      return { url: "https://api.cohere.com/v2/models", headers: bearer };
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/models",
        headers: { ...bearer, "anthropic-version": "2023-06-01" },
      };
    case "google_gemini": {
      const apiKey = typeof credential === "string" ? credential : "";
      // VF-AUD-20260916-P2-004: Gemini REST supports the `x-goog-api-key`
      // header; sending the credential as `?key=` would surface it in URL
      // logs and telemetry. Mirror electron/services/providerAdapters.ts.
      return {
        url: "https://generativelanguage.googleapis.com/v1beta/models",
        headers: apiKey ? { "x-goog-api-key": apiKey } : {},
      };
    }
    default:
      return null;
  }
}

async function performProviderConnectionTest(
  providerId: ProviderId,
  profileId?: string,
): Promise<ProviderConnectionResult> {
  const checkedAt = new Date().toISOString();
  const definition = PROVIDER_REGISTRY[providerId];
  if (!definition || definition.unavailable) {
    return {
      ok: false,
      providerId,
      kind: "provider-unavailable",
      message: `Provider ${providerId} is not available.`,
      checkedAt,
      connectivity: connectivityFailure(
        "provider-unavailable",
        "Provider is not available.",
      ),
    };
  }

  let credential: string | AzureOpenAiConfig | AwsBedrockConfig | GoogleVertexConfig | null = null;
  if (requiresStructuredCredential(providerId)) {
    const structured = getProviderCredential(providerId, profileId);
    if (
      !isAzureOpenAiConfig(structured) &&
      !isAwsBedrockConfig(structured) &&
      !isGoogleVertexConfig(structured)
    ) {
      return {
        ok: false,
        providerId,
        kind: "missing-credential",
        message: "Structured credential is not configured.",
        checkedAt,
        connectivity: connectivityFailure(
          "missing-api-key",
          "Credential is missing. Configure it in Settings > Providers.",
        ),
      };
    }
    credential = structured as AzureOpenAiConfig | AwsBedrockConfig | GoogleVertexConfig;
  } else {
    credential = getProviderApiKey(providerId, profileId);
  }

  if (!credential) {
    return {
      ok: false,
      providerId,
      kind: "missing-credential",
      message: "No API key configured.",
      checkedAt,
      connectivity: connectivityFailure(
        "missing-api-key",
        "API key is missing. Open Settings > Providers and add a key.",
      ),
    };
  }

  const testReq = buildProviderTestRequest(providerId, credential);
  if (!testReq) {
    return {
      ok: false,
      providerId,
      kind: "provider-unavailable",
      message: "Connection test is not implemented for this provider.",
      checkedAt,
      connectivity: connectivityFailure(
        "provider-unavailable",
        "Connection test is not implemented for this provider.",
      ),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(testReq.url, {
      method: "GET",
      headers: testReq.headers,
      signal: controller.signal,
    });
    if (response.ok) {
      return {
        ok: true,
        providerId,
        statusCode: response.status,
        kind: "verified",
        message: "Connection successful",
        checkedAt,
        connectivity: {
          ok: true,
          kind: "verified",
          checkedAt,
          statusCode: response.status,
          endpoint: "models",
        },
      };
    }
    const text = await response.text().catch(() => "");
    const message = text ? readResponseError({ ok: false, status: response.status, statusText: response.statusText, headers: {}, body: text, contentType: response.headers.get("content-type") || "application/json" }) : `${response.status} ${response.statusText}`;
    const kind = response.status === 401 || response.status === 403 ? "invalid-credential" : "provider-unavailable";
    return {
      ok: false,
      providerId,
      statusCode: response.status,
      kind,
      message,
      checkedAt,
      connectivity: classifyConnectivityFailure(response.status, message),
    };
  } catch (err) {
    const message = redactErrorMessage(err);
    const kind = /abort/i.test(message) ? "timeout" : "network-failure";
    return {
      ok: false,
      providerId,
      kind,
      message,
      checkedAt,
      connectivity: connectivityFailure(
        "network-failure",
        "Network request failed before the provider responded. Check connection, proxy, VPN, or firewall.",
        { statusCode: 0, retryable: true },
      ),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function registerApiKeyHandlers(): void {

  registerPrivilegedIpcChannel("masterPassword:isSet", () => isMasterPasswordSet(), { rateLimitedResponse: () => false });

  registerPrivilegedIpcChannel("masterPassword:set", (_event, password: unknown) => {
    try {
      if (isMasterPasswordSet()) {
        return { ok: false, error: "Master password is already set." };
      }
      if (typeof password !== "string" || password.length < 4) {
        return { ok: false, error: "Password too short (min 4 characters)" };
      }
      setMasterPassword(password);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel("masterPassword:change", (_event, payload: unknown) => {
    try {
      if (!payload || typeof payload !== "object") throw new Error("Invalid payload.");
      const { currentPassword, newPassword } = payload as { currentPassword?: string, newPassword?: string };
      if (typeof currentPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 4) {
        return { ok: false, error: "Both current and new passwords must be provided. New password min 4 characters." };
      }
      if (!isMasterPasswordSet()) {
        return { ok: false, error: "Master password is not set." };
      }
      const { verified, lockedOutSeconds } = verifyMasterPassword(currentPassword);
      if (!verified) {
        if (lockedOutSeconds > 0) {
          return { ok: false, error: `Too many attempts. Try again in ${lockedOutSeconds}s.`, lockedOutSeconds };
        }
        return { ok: false, error: "Incorrect master password." };
      }
      setMasterPassword(newPassword);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel("masterPassword:verify", (_event, password: unknown) => {
    try {
      if (typeof password !== "string") {
        return { ok: true, verified: false, lockedOutSeconds: 0 };
      }
      const { verified, lockedOutSeconds } = verifyMasterPassword(password);
      return { ok: true, verified, lockedOutSeconds };
    } catch (err) {
      return { ok: false, verified: false, lockedOutSeconds: 0, error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel("masterPassword:clear", (_event, payload: unknown) => {
    try {
      if (!isMasterPasswordSet()) return { ok: true }; // Already clear
      if (!payload || typeof payload !== "object") throw new Error("Invalid payload.");
      const { currentPassword } = payload as { currentPassword?: string };
      if (typeof currentPassword !== "string") {
        return { ok: false, error: "Current password is required to clear master password." };
      }
      const { verified, lockedOutSeconds } = verifyMasterPassword(currentPassword);
      if (!verified) {
        if (lockedOutSeconds > 0) {
          return { ok: false, error: `Too many attempts. Try again in ${lockedOutSeconds}s.`, lockedOutSeconds };
        }
        return { ok: false, error: "Incorrect master password." };
      }
      clearMasterPassword();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel("profilePassword:isSet", (_event, profileId: unknown) => {
    try {
      return isProfilePasswordSet(parseProfileId(profileId));
    } catch {
      return false;
    }
  }, { rateLimitedResponse: () => false });

  registerPrivilegedIpcChannel("profileSession:activate", (event, payload: unknown) => {
    try {
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid profile activation payload.");
      }
      const { profileId, password } = payload as { profileId?: unknown; password?: unknown };
      const validId = parseProfileId(profileId);
      if (isProfilePasswordSet(validId)) {
        if (typeof password !== "string" || !verifyProfilePassword(password, validId)) {
          return {
            ok: true,
            verified: false,
            lockedOutSeconds: getProfilePasswordLockoutSeconds(validId),
          };
        }
      }
      const previousProfileId = getProfileSessionId(event.sender);
      if (previousProfileId !== validId) {
        // Best-effort cleanup of profile-scoped capabilities tied to the
        // previous profile on this renderer before binding the new profile.
        try {
          const services = getAgentServices();
          services.attachmentRegistry.revokeRendererSession(
            RUNTIME_SESSION_ID,
            previousProfileId,
            event.sender.id,
          );
          services.workspaceGrants.revokeSessionFamily(
            `${RUNTIME_SESSION_ID}:renderer_${event.sender.id}`,
          );
        } catch {
          // ignore
        }
      }
      if (previousProfileId !== validId) {
        try {
          getCustomProtocolCapabilityManager().revokeProfile(previousProfileId);
          getCustomProtocolCapabilityManager().revokeSession(String(event.sender.id));
        } catch {
          /* ignore */
        }
      }
      setProfileSessionId(event.sender, validId);
      return { ok: true, verified: true, profileId: validId, lockedOutSeconds: 0 };
    } catch {
      return { ok: false, verified: false, lockedOutSeconds: 0, error: "Profile activation failed." };
    }
  });

  registerPrivilegedIpcChannel("profilePassword:set", (event, payload: unknown) => {
    try {
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid profile password payload.");
      }
      const { password } = payload as { profileId?: unknown; password?: unknown };
      const validId = getProfileSessionId(event.sender);
      // Option A (audit 2026-07-08 #2): the default profile is the unprotected
      // system fallback and cannot be password-locked. Rejecting here also
      // prevents an orphan verifier from being written when the renderer
      // metadata update fails (audit fixes #2 + #3 simultaneously).
      if (validId === "default") {
        return { ok: false, error: "The default profile cannot be password-protected." };
      }
      if (typeof password !== "string" || password.length === 0) {
        throw new Error("Profile password must be a non-empty string.");
      }
      setProfilePassword(password, validId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel("profilePassword:verify", (event, payload: unknown) => {
    try {
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid profile password payload.");
      }
      const { profileId, password } = payload as { profileId?: unknown; password?: unknown };
      const validId = parseProfileId(profileId);
      if (typeof password !== "string") {
        return { ok: true, verified: false, lockedOutSeconds: 0 };
      }
      const verified = verifyProfilePassword(password, validId);
      const lockedOutSeconds = getProfilePasswordLockoutSeconds(validId);
      if (verified) setProfileSessionId(event.sender, validId);
      return { ok: true, verified, lockedOutSeconds };
    } catch {
      // Return generic failure — never expose the reason to the renderer.
      return { ok: true, verified: false, lockedOutSeconds: 0 };
    }
  });

  registerPrivilegedIpcChannel("profilePassword:clear", (event, payload: unknown) => {
    try {
      // The default profile cannot acquire a verifier; allowing explicit
      // default cleanup preserves recovery from historical orphan rows.
      const record = payload && typeof payload === "object" ? payload as { profileId?: unknown; currentPassword?: unknown } : { profileId: payload };
      const requestedId = parseProfileId(record.profileId);
      const validId = requestedId === "default" ? "default" : getProfileSessionId(event.sender);
      if (validId !== "default") {
        if (typeof record.currentPassword !== "string") {
          return { ok: false, error: "Current password is required to clear profile password." };
        }
        const verified = verifyProfilePassword(record.currentPassword, validId);
        const lockedOutSeconds = getProfilePasswordLockoutSeconds(validId);
        if (!verified) {
          if (lockedOutSeconds > 0) {
            return { ok: false, error: `Too many attempts. Try again in ${lockedOutSeconds}s.`, lockedOutSeconds };
          }
          return { ok: false, error: "Incorrect profile password." };
        }
      }
      clearProfilePassword(validId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel("apiKey:isConfigured", (event, _profileId?: unknown) => {
    try {
      return isApiKeyConfigured(getProfileSessionId(event.sender));
    } catch {
      return false;
    }
  }, { rateLimitedResponse: () => false });

  registerPrivilegedIpcChannel("apiKey:getStatus", (event, _profileId?: unknown) => {
    return getApiKeyConfigurationStatus(getProfileSessionId(event.sender));
  });

  registerPrivilegedIpcChannel("apiKey:set", (event, payload: unknown) => {
    const { key } = typeof payload === "object" && payload !== null && "key" in payload ? payload as { key: unknown, profileId?: unknown } : { key: payload };
    let trimmed: string;
    try {
      trimmed = validateApiKeyInput(key);
    } catch {
      return { ok: false, code: "INVALID_KEY", safeMessage: "Enter a non-empty Venice API key." };
    }
    try {
      const validId = getProfileSessionId(event.sender);
      setApiKey(trimmed, validId);
      return { ok: true, storageMode: getStorageMode() };
    } catch (err) {
      const message = redactErrorMessage(err);
      if (/secure storage is unavailable|keychain|credential manager/i.test(message)) {
        return {
          ok: false,
          code: "SECRET_STORAGE_UNAVAILABLE",
          safeMessage: "The key could not be stored securely. Restore the system keychain or credential manager, then retry.",
        };
      }
      return {
        ok: false,
        code: "SECRET_STORAGE_WRITE_FAILED",
        safeMessage: "The key could not be stored securely. Check the app diagnostics and try again.",
      };
    }
  });

  registerPrivilegedIpcChannel("apiKey:delete", (event, _profileId?: unknown) => {
    try {
      deleteApiKey(getProfileSessionId(event.sender));
      return { ok: true, storageMode: getStorageMode() };
    } catch {
      return { ok: false, code: "SECRET_STORAGE_WRITE_FAILED", safeMessage: "The saved Venice credential could not be removed." };
    }
  });

  registerPrivilegedIpcChannel("providerApiKey:isConfigured", (event, payload: unknown) => {
    const { providerId } = typeof payload === "object" && payload !== null && "providerId" in payload ? payload as { providerId: unknown, profileId?: unknown } : { providerId: payload };
    try {
      return isProviderApiKeyConfigured(parseProviderId(providerId), getProfileSessionId(event.sender));
    } catch {
      return false;
    }
  }, { rateLimitedResponse: () => false });

  registerPrivilegedIpcChannel("providerApiKey:set", (event, payload: unknown) => {
    const { providerId, key } = payload as { providerId: unknown, key: unknown, profileId?: unknown };
    try {
      const validProviderId = parseProviderId(providerId);
      if (requiresStructuredCredential(validProviderId as ProviderId)) {
        throw new Error(`Provider ${validProviderId} requires a structured credential, not a single API key.`);
      }
      const validId = getProfileSessionId(event.sender);
      const trimmed = validateApiKeyInput(key);
      setProviderApiKey(validProviderId, trimmed, validId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel("providerApiKey:delete", (event, payload: unknown) => {
    const { providerId } = payload as { providerId: unknown, profileId?: unknown };
    try {
      const validProviderId = parseProviderId(providerId);
      const profileId = getProfileSessionId(event.sender);
      deleteProviderApiKey(validProviderId, profileId);
      disableProvider(profileId, validProviderId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel("providerCredential:isConfigured", (event, payload: unknown) => {
    const { providerId } = typeof payload === "object" && payload !== null && "providerId" in payload ? payload as { providerId: unknown, profileId?: unknown } : { providerId: payload };
    try {
      return isProviderCredentialConfigured(parseProviderId(providerId), getProfileSessionId(event.sender));
    } catch {
      return false;
    }
  }, { rateLimitedResponse: () => false });

  registerPrivilegedIpcChannel("providerCredential:set", (event, payload: unknown) => {
    try {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Invalid credential payload.");
      }
      const { providerId, credential } = payload as { providerId: unknown, credential: unknown };
      const validProviderId = parseProviderId(providerId);
      if (!requiresStructuredCredential(validProviderId as ProviderId)) {
        throw new Error(`Provider ${validProviderId} does not use structured credentials.`);
      }
      const validCredential = validateProviderCredential(validProviderId, credential);
      setProviderCredential(validProviderId, validCredential, getProfileSessionId(event.sender));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel("providerCredential:delete", (event, payload: unknown) => {
    const { providerId } = typeof payload === "object" && payload !== null && "providerId" in payload ? payload as { providerId: unknown, profileId?: unknown } : { providerId: payload };
    try {
      const validProviderId = parseProviderId(providerId);
      const profileId = getProfileSessionId(event.sender);
      deleteProviderCredential(validProviderId, profileId);
      disableProvider(profileId, validProviderId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel("providerSettings:get", (event) => {
    return getProviderSettings(getProfileSessionId(event.sender));
  });

  registerPrivilegedIpcChannel("providerSettings:update", (event, payload: unknown) => {
    try {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("Invalid provider settings update.");
      }
      const update = payload as ProviderSettingsUpdate;
      const profileId = getProfileSessionId(event.sender);
      if (update.enabledProviders !== undefined) {
        if (!update.enabledProviders || typeof update.enabledProviders !== "object" || Array.isArray(update.enabledProviders)) {
          throw new Error("Invalid enabled-provider map.");
        }
        for (const [providerId, enabled] of Object.entries(update.enabledProviders)) {
          const validProviderId = parseProviderId(providerId);
          if (enabled !== true && enabled !== false) throw new Error("Provider enabled state must be boolean.");
          if (enabled && !isProviderAvailableForFallback(validProviderId)) {
            throw new Error(`Provider ${validProviderId} is not available for fallback routing.`);
          }
          if (enabled && !isProviderConfigured(validProviderId, profileId)) {
            throw new Error(`Credentials are not configured for provider: ${validProviderId}`);
          }
        }
      }
      if (update.autoFallbackEnabled !== undefined && typeof update.autoFallbackEnabled !== "boolean") {
        throw new Error("Automatic fallback state must be boolean.");
      }
      if (update.fallbackOrdering !== undefined && !Array.isArray(update.fallbackOrdering)) {
        throw new Error("Fallback ordering must be an array.");
      }
      if (update.primaryApiRoute !== undefined && !isPrimaryApiRouteId(update.primaryApiRoute)) {
        throw new Error(`Primary API route must be one of: ${DEFAULT_PRIMARY_API_ROUTE}, fraterna.`);
      }
      if (update.fallbackOrdering) {
        if (update.fallbackOrdering.some((providerId) => typeof providerId !== "string")) {
          throw new Error("Fallback ordering entries must be provider IDs.");
        }
        if (new Set(update.fallbackOrdering).size !== update.fallbackOrdering.length) {
          throw new Error("Fallback ordering must not contain duplicate providers.");
        }
        const enabledProviders = update.enabledProviders ?? getProviderSettings(profileId).enabledProviders;
        for (const providerId of update.fallbackOrdering) {
          const validProviderId = parseProviderId(providerId);
          if (!isProviderAvailableForFallback(validProviderId)) {
            throw new Error(`Provider ${validProviderId} is not available for fallback routing.`);
          }
          if (enabledProviders[validProviderId] !== true) {
            throw new Error(`Provider ${validProviderId} must be enabled before it is ordered.`);
          }
          if (!isProviderConfigured(validProviderId, profileId)) {
            throw new Error(`Credentials are not configured for provider: ${validProviderId}`);
          }
        }
      }
      return { ok: true, settings: updateProviderSettings(profileId, update) };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerPrivilegedIpcChannel("apiKey:test", (event, _profileId?: unknown) => {
    return testVeniceConnection(getProfileSessionId(event.sender));
  });

  registerPrivilegedIpcChannel("providerApiKey:test", (event, payload: unknown) => {
    const { providerId } = typeof payload === "object" && payload !== null && "providerId" in payload ? payload as { providerId: unknown, profileId?: unknown } : { providerId: payload };
    try {
      const validProviderId = parseProviderId(providerId);
      if (requiresStructuredCredential(validProviderId as ProviderId)) {
        throw new Error(`Provider ${validProviderId} requires a structured credential test.`);
      }
      return performProviderConnectionTest(validProviderId as ProviderId, getProfileSessionId(event.sender));
    } catch (err) {
      const message = redactErrorMessage(err);
      return {
        ok: false,
        message,
        connectivity: connectivityFailure(
          "bridge-unavailable",
          message,
        ),
      };
    }
  });

  registerPrivilegedIpcChannel("providerCredential:test", (event, payload: unknown) => {
    const { providerId } = typeof payload === "object" && payload !== null && "providerId" in payload ? payload as { providerId: unknown, profileId?: unknown } : { providerId: payload };
    try {
      const validProviderId = parseProviderId(providerId);
      if (!requiresStructuredCredential(validProviderId as ProviderId)) {
        throw new Error(`Provider ${validProviderId} does not use structured credentials.`);
      }
      return performProviderConnectionTest(validProviderId as ProviderId, getProfileSessionId(event.sender));
    } catch (err) {
      const message = redactErrorMessage(err);
      return {
        ok: false,
        message,
        connectivity: connectivityFailure(
          "bridge-unavailable",
          message,
        ),
      };
    }
  });
}
