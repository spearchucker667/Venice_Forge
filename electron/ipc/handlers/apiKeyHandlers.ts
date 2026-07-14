/** @fileoverview API key IPC handlers (apiKey:*). */

import {
  deleteApiKey,
  isApiKeyConfigured,
  setApiKey,
  deleteProviderApiKey,
  isProviderApiKeyConfigured,
  setProviderApiKey,
  setCredential,
  getCredential,
  deleteCredential,
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
import { validateApiKeyInput } from "../validation";
import { redactErrorMessage } from "../../../src/shared/redaction";
import { isValidProfileStorageId } from "../../../src/utils/profileIdValidation";
import type { ApiConnectivityFailureKind, ApiConnectivityStatus } from "../../../src/types/api-connectivity";
import { registerIpcChannel } from "./common";
import { PROVIDER_REGISTRY } from "../../../src/types/provider";
import { getProfileSessionId, setProfileSessionId } from "../../services/profileSession";
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

/** Reserved credential names that must never be read/written through the
 *  generic credential bridge. Passwords, profile secrets, and unlock-secrets
 *  must use their typed IPC channels so the main process can enforce
 *  lockout, verifier-only storage, and plaintext-fallback refusal. */
function isReservedCredentialName(name: unknown): boolean {
  if (typeof name !== "string" || name.length === 0) return true;
  const lower = name.toLowerCase();
  if (["password", "master_password", "profile_password"].includes(lower)) return true;
  if (/^profile_password[:_]/.test(lower)) return true;
  if (/_password$/.test(lower)) return true;
  if (lower.includes("password")) return true;
  if (/unlock[_-]?secret|secret[_-]?unlock|unlocksecret|secretunlock/.test(lower)) return true;
  return false;
}

export function registerApiKeyHandlers(): void {

  registerIpcChannel("credential:set", (_event, payload: { key: string, value: string }) => {
    try {
      if (isReservedCredentialName(payload.key)) {
        return { ok: false, error: `Credential name "${payload.key}" is reserved. Use typed password/profile APIs.` };
      }
      setCredential(payload.key, payload.value);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  registerIpcChannel("credential:get", (_event, key: string) => {
    try {
      if (isReservedCredentialName(key)) {
        return { ok: true, value: null };
      }
      const val = getCredential(key);
      return { ok: true, value: val };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  registerIpcChannel("credential:delete", (_event, key: string) => {
    try {
      if (isReservedCredentialName(key)) {
        return { ok: true };
      }
      deleteCredential(key);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  registerIpcChannel("masterPassword:isSet", () => isMasterPasswordSet());

  registerIpcChannel("masterPassword:set", (_event, password: unknown) => {
    try {
      if (typeof password !== "string" || password.length === 0) {
        throw new Error("Master password must be a non-empty string.");
      }
      setMasterPassword(password);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("masterPassword:verify", (_event, password: unknown) => {
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

  registerIpcChannel("masterPassword:clear", () => {
    try {
      clearMasterPassword();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("profilePassword:isSet", (_event, profileId: unknown) => {
    try {
      return isProfilePasswordSet(parseProfileId(profileId));
    } catch {
      return false;
    }
  });

  registerIpcChannel("profileSession:activate", (event, payload: unknown) => {
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
      setProfileSessionId(event.sender, validId);
      return { ok: true, verified: true, profileId: validId, lockedOutSeconds: 0 };
    } catch {
      return { ok: false, verified: false, lockedOutSeconds: 0, error: "Profile activation failed." };
    }
  });

  registerIpcChannel("profilePassword:set", (event, payload: unknown) => {
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

  registerIpcChannel("profilePassword:verify", (event, payload: unknown) => {
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

  registerIpcChannel("profilePassword:clear", (event, profileId: unknown) => {
    try {
      // The default profile cannot acquire a verifier; allowing explicit
      // default cleanup preserves recovery from historical orphan rows.
      const requestedId = parseProfileId(profileId);
      const validId = requestedId === "default" ? "default" : getProfileSessionId(event.sender);
      clearProfilePassword(validId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("apiKey:isConfigured", (event, _profileId?: unknown) => {
    try {
      return isApiKeyConfigured(getProfileSessionId(event.sender));
    } catch {
      return false;
    }
  });

  registerIpcChannel("apiKey:set", (event, payload: unknown) => {
    const { key } = typeof payload === "object" && payload !== null && "key" in payload ? payload as { key: unknown, profileId?: unknown } : { key: payload };
    try {
      const validId = getProfileSessionId(event.sender);
      const trimmed = validateApiKeyInput(key);
      setApiKey(trimmed, validId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("apiKey:delete", (event, _profileId?: unknown) => {
    try {
      deleteApiKey(getProfileSessionId(event.sender));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("providerApiKey:isConfigured", (event, payload: unknown) => {
    const { providerId } = typeof payload === "object" && payload !== null && "providerId" in payload ? payload as { providerId: unknown, profileId?: unknown } : { providerId: payload };
    try {
      return isProviderApiKeyConfigured(parseProviderId(providerId), getProfileSessionId(event.sender));
    } catch {
      return false;
    }
  });

  registerIpcChannel("providerApiKey:set", (event, payload: unknown) => {
    const { providerId, key } = payload as { providerId: unknown, key: unknown, profileId?: unknown };
    try {
      const validProviderId = parseProviderId(providerId);
      const validId = getProfileSessionId(event.sender);
      const trimmed = validateApiKeyInput(key);
      setProviderApiKey(validProviderId, trimmed, validId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("providerApiKey:delete", (event, payload: unknown) => {
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

  registerIpcChannel("providerSettings:get", (event) => {
    return getProviderSettings(getProfileSessionId(event.sender));
  });

  registerIpcChannel("providerSettings:update", (event, payload: unknown) => {
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
          if (enabled && !isProviderApiKeyConfigured(validProviderId, profileId)) {
            throw new Error(`API key is not configured for provider: ${validProviderId}`);
          }
        }
      }
      if (update.autoFallbackEnabled !== undefined && typeof update.autoFallbackEnabled !== "boolean") {
        throw new Error("Automatic fallback state must be boolean.");
      }
      if (update.fallbackOrdering !== undefined && !Array.isArray(update.fallbackOrdering)) {
        throw new Error("Fallback ordering must be an array.");
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
          if (!isProviderApiKeyConfigured(validProviderId, profileId)) {
            throw new Error(`API key is not configured for provider: ${validProviderId}`);
          }
        }
      }
      return { ok: true, settings: updateProviderSettings(profileId, update) };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("apiKey:test", (event, _profileId?: unknown) => {
    return testVeniceConnection(getProfileSessionId(event.sender));
  });
}
