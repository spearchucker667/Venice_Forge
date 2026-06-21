/** @fileoverview API key IPC handlers (apiKey:*). */

import {
  deleteApiKey,
  isApiKeyConfigured,
  setApiKey,
} from "../../services/secureStore";
import { readResponseError } from "../../services/veniceClient";
import { performGuardedVeniceRequest } from "../../services/guardPipeline";
import { validateApiKeyInput } from "../validation";
import { redactErrorMessage } from "../../../src/shared/redaction";
import type { ApiConnectivityFailureKind, ApiConnectivityStatus } from "../../../src/types/api-connectivity";
import { registerIpcChannel } from "./common";

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

async function testVeniceConnection(): Promise<{ ok: boolean; status?: number; message: string; connectivity: ApiConnectivityStatus }> {
  if (!isApiKeyConfigured()) {
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
    const guarded = await performGuardedVeniceRequest({ endpoint: "/models", method: "GET" });
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

export function registerApiKeyHandlers(): void {
  registerIpcChannel("apiKey:isConfigured", () => isApiKeyConfigured());

  registerIpcChannel("apiKey:set", (_event, key: unknown) => {
    try {
      const trimmed = validateApiKeyInput(key);
      setApiKey(trimmed);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("apiKey:delete", () => {
    try {
      deleteApiKey();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: redactErrorMessage(err) };
    }
  });

  registerIpcChannel("apiKey:test", () => testVeniceConnection());
}
