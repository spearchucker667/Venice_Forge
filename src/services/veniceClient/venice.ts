/** @fileoverview High-level legacy Venice API helper used by `lib/venice-client`. */

import { PROXY_BASE_PATH } from "../../shared/apiConfig";
import { desktopVenice, isElectron } from "../desktopBridge";
import { maybeRunLocalFamilyGuard, SafetyGuardBlockedError } from "../../shared/safety";
import { useSettingsStore } from "../../stores/settings-store";
import { VeniceAPIError, readVeniceErrorBody } from "./errors";

/** Runs the renderer-side Family Safe Mode guard for the legacy web surface.
 *  Throws `SafetyGuardBlockedError` when the payload is blocked. GET requests
 *  and undefined bodies are skipped (they carry no user content). */
function enforceLegacyWebGuard(
  endpoint: string,
  method: string,
  body: unknown,
): void {
  if (method !== "POST" || body === undefined || isElectron()) return;
  const decision = maybeRunLocalFamilyGuard(
    { endpoint, method, payload: body, source: "venice-client" },
    useSettingsStore.getState().localFamilySafeModeEnabled,
  );
  if (!decision.allowed) {
    throw new SafetyGuardBlockedError({ ...decision.guardDecision, userMessage: decision.userMessage });
  }
}

/** Web-mode fallback used by the legacy surface: fetch through the Express
 *  proxy with the same error-body extraction and abort-signal forwarding as
 *  the desktop path. */
async function webVeniceFetch(
  path: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal }
): Promise<{ ok: boolean; status: number; statusText: string; body: unknown; contentType?: string }> {
  const method = options.method || "GET";
  const url = `${PROXY_BASE_PATH}${path.replace("/api/v1", "")}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Venice-Forge-Family-Safe-Mode": String(useSettingsStore.getState().localFamilySafeModeEnabled),
  };
  const response = await fetch(url, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  });

  let body: unknown = null;
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const text = await response.text().catch(() => "");
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = null;
    }
  } else {
    const text = await response.text().catch(() => "");
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { text };
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    body,
    contentType: contentType || undefined,
  };
}

/**
 * High-level legacy Venice API helper.
 * @param path The Venice API path.
 * @param options Request options.
 * @returns The parsed response body.
 */
export async function venice<T>(
  path: string,
  options: { method?: string; body?: unknown; stream?: boolean; noAuth?: boolean; signal?: AbortSignal } = {}
): Promise<T> {
  const method = options.method || "GET";
  let parsedBody: unknown = undefined;
  if (options.body !== undefined && options.body !== null) {
    if (typeof options.body === "string") {
      try {
        parsedBody = JSON.parse(options.body);
      } catch (err) {
        throw new VeniceAPIError(
          `Invalid JSON body passed to venice(): ${err instanceof Error ? err.message : String(err)}`,
          0
        );
      }
    } else {
      parsedBody = options.body;
    }
  }

  if (!isElectron()) {
    enforceLegacyWebGuard(path, method, parsedBody);
    const response = await webVeniceFetch(path, { method, body: parsedBody, signal: options.signal });
    if (options.signal && options.signal.aborted) throw new Error("Aborted");
    if (!response.ok) {
      const bodyMessage = readVeniceErrorBody(response.body);
      throw new VeniceAPIError(
        bodyMessage || response.statusText || `HTTP ${response.status}`,
        response.status
      );
    }
    return response.body as T;
  }

  const response = await desktopVenice.request(
    {
      endpoint: path.replace("/api/v1", ""),
      method: method as "GET" | "POST",
      body: parsedBody,
    },
    options.signal
  );

  if (options.signal && options.signal.aborted) throw new Error("Aborted");
  if (!response.ok) {
    const bodyMessage = readVeniceErrorBody(response.body);
    throw new VeniceAPIError(
      bodyMessage || response.statusText || `HTTP ${response.status}`,
      response.status
    );
  }
  return response.body as T;
}
