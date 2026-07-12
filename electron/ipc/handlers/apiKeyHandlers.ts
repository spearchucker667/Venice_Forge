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

/** Parses and validates a profile id for IPC use (storage-valid, including "default"). */
function parseProfileId(profileId: unknown): string {
  if (!isValidProfileStorageId(profileId)) {
    throw new Error("Invalid profile id.");
  }
  return profileId;
}

/** Parses an optional profile id, returning "default" when omitted. Throws on
 *  invalid ids so an attacker-controlled IPC payload cannot write to
 *  secure-prefs entries with namespaces like `apiKey_../../x`. */
function parseProfileIdOrDefault(profileId: unknown): string {
  if (profileId === undefined || profileId === null) return "default";
  return parseProfileId(profileId);
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

  registerIpcChannel("profilePassword:set", (_event, payload: unknown) => {
    try {
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid profile password payload.");
      }
      const { profileId, password } = payload as { profileId?: unknown; password?: unknown };
      const validId = parseProfileId(profileId);
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

  registerIpcChannel("profilePassword:verify", (_event, payload: unknown) => {
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
      return { ok: true, verified, lockedOutSeconds };
    } catch {
      // Return generic failure — never expose the reason to the renderer.
      return { ok: true, verified: false, lockedOutSeconds: 0 };
    }
  });

  registerIpcChannel("profilePassword:clear", (_event, profileId: unknown) => {
    try {
      clearProfilePassword(parseProfileId(profileId));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("apiKey:isConfigured", (_event, profileId?: unknown) => {
    try {
      return isApiKeyConfigured(parseProfileIdOrDefault(profileId));
    } catch {
      return false;
    }
  });

  registerIpcChannel("apiKey:set", (_event, payload: unknown) => {
    const { key, profileId } = typeof payload === "object" && payload !== null && "key" in payload ? payload as { key: unknown, profileId?: unknown } : { key: payload, profileId: undefined };
    try {
      const validId = parseProfileIdOrDefault(profileId);
      const trimmed = validateApiKeyInput(key);
      setApiKey(trimmed, validId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("apiKey:delete", (_event, profileId?: unknown) => {
    try {
      deleteApiKey(parseProfileIdOrDefault(profileId));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("providerApiKey:isConfigured", (_event, payload: unknown) => {
    const { providerId, profileId } = typeof payload === "object" && payload !== null && "providerId" in payload ? payload as { providerId: string, profileId?: unknown } : { providerId: String(payload), profileId: undefined };
    try {
      return isProviderApiKeyConfigured(providerId, parseProfileIdOrDefault(profileId));
    } catch {
      return false;
    }
  });

  registerIpcChannel("providerApiKey:set", (_event, payload: unknown) => {
    const { providerId, key, profileId } = payload as { providerId: string, key: unknown, profileId?: unknown };
    try {
      const validId = parseProfileIdOrDefault(profileId);
      const trimmed = validateApiKeyInput(key);
      setProviderApiKey(providerId, trimmed, validId);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("providerApiKey:delete", (_event, payload: unknown) => {
    const { providerId, profileId } = payload as { providerId: string, profileId?: unknown };
    try {
      deleteProviderApiKey(providerId, parseProfileIdOrDefault(profileId));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("apiKey:test", (_event, profileId?: unknown) => {
    let validId = "default";
    try {
      validId = parseProfileIdOrDefault(profileId);
    } catch {
      return {
        ok: false,
        message: "Invalid profile id.",
        connectivity: connectivityFailure(
          "missing-api-key",
          "Profile context is invalid. Reopen Config and retry the connection test.",
        ),
      };
    }
    return testVeniceConnection(validId);
  });
}
