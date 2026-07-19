/** @fileoverview Canonical Venice fetch helpers with retries, deduplication, and diagnostics. */

import { PROXY_BASE_PATH } from "../../shared/apiConfig";
import { desktopVenice, isElectron } from "../desktopBridge";
import type { VeniceForgeResponse } from "../../types/desktop";
import type { AppDispatch } from "../../types/app";
import type { DiagnosticsEntry } from "../../types/venice";
import { maybeRunLocalFamilyGuard, SafetyGuardBlockedError } from "../../shared/safety";
import {
  buildInspectorTelemetryPatch,
  classifyInspectorError,
  deriveCallOutcome,
  deriveGuardOutcome,
  maskInspectorHeaders,
  sanitizeInspectorPayload,
} from "../inspectorTelemetry";
import { useInspectorStore } from "../../stores/inspector-store";
import { useSettingsStore } from "../../stores/settings-store";
import { sleep, createTimeoutSignal } from "../../utils/timeout";
import { VeniceAPIError, VeniceApiError, normalizeError, readDesktopErrorBody, readWebErrorBody, readVeniceErrorBody } from "./errors";
import { extractModelName, parseDiagnosticsHeaders, safeInspectorError, summarizeDiagnostics, nowIso } from "./diagnostics";
import { serializeFormData, dedupeKey } from "./serialization";
import { calculateBackoff, computeRateLimitWait, deleteInFlight, getInFlight, hasInFlight, resolveTimeoutMs, setInFlight } from "./retry";
import { getSafetyDecisionForLog } from "./safety";
import type { SafetyGuardDecision } from "../../shared/safety";
import { applyVeniceApiSafeMode, endpointSupportsSafeMode } from "../../shared/veniceSafeMode";

/**
 * Builds a minimal `SafetyGuardDecision` for fail-closed response-blocking
 * paths where the guard could not run on a payload (e.g., circular
 * references prevented serialization, or the body was empty / null). The
 * shape mirrors `maybeRunLocalFamilyGuard`'s return so downstream
 * telemetry, the inspector patch, and `SafetyGuardBlockedError` all see a
 * consistent decision object.
 */
function buildFailClosedDecision(userMessage: string, reasonCode: string): SafetyGuardDecision {
  return {
    allow: false,
    action: "block",
    severity: "high",
    category: "csam_request",
    reasonCode,
    userMessage,
    developerMessage: userMessage,
    normalizedChanged: false,
    transformedText: undefined,
    signals: [],
    audit: {
      decisionId: `failclosed-${Date.now()}`,
      createdAt: new Date().toISOString(),
      promptHash: "",
      promptLength: 0,
      matchedFieldPaths: [],
    },
  };
}

/**
 * Screens a Venice response body in web mode. Electron responses are skipped
 * because the main-process guard pipeline is authoritative. Binary payloads
 * (image/audio/video bytes and Blob/ArrayBuffer views) are never stringified;
 * only textual/JSON metadata bodies are screened. On block the inspector log
 * is updated with a 451 safety-block patch and `SafetyGuardBlockedError` is
 * thrown.
 */
async function screenVeniceResponse(
  data: unknown,
  contentType: string | null,
  endpoint: string,
  method: string,
  logId: string,
  startedAt: number,
  previewDurationMs: number,
): Promise<void> {
  if (isElectron()) return;
  if (method !== "POST") return;

  const safeMode = useSettingsStore.getState().localFamilySafeModeEnabled;
  if (!safeMode) return;

  const ct = (contentType || "").toLowerCase();
  if (
    ct.startsWith("image/") ||
    ct.startsWith("audio/") ||
    ct.startsWith("video/")
  ) {
    return;
  }
  if (
    data instanceof Blob ||
    data instanceof ArrayBuffer ||
    ArrayBuffer.isView(data)
  ) {
    return;
  }

  let serialized: string;
  if (typeof data === "string") {
    serialized = data;
  } else {
    try {
      serialized = JSON.stringify(data, (_key, value: unknown) => {
        if (typeof value === "bigint") return `[bigint:${value.toString()}]`;
        return value;
      }) ?? "";
    } catch {
      useInspectorStore.getState().updateLog(
        logId,
        buildInspectorTelemetryPatch({
          status: 451,
          durationMs: Date.now() - startedAt,
          previewDurationMs,
          guardOutcome: "block",
          error: "Response blocked: could not be safely serialized for review.",
        }),
      );
      throw new SafetyGuardBlockedError(buildFailClosedDecision(
        "Response blocked: could not be safely serialized for review.",
        "response_unserializable",
      ));
    }
    if (!serialized) {
      useInspectorStore.getState().updateLog(
        logId,
        buildInspectorTelemetryPatch({
          status: 451,
          durationMs: Date.now() - startedAt,
          previewDurationMs,
          guardOutcome: "block",
          error: "Response blocked: empty payload.",
        }),
      );
      throw new SafetyGuardBlockedError(buildFailClosedDecision(
        "Response blocked: empty payload.",
        "response_empty",
      ));
    }
  }

  const decision = maybeRunLocalFamilyGuard(
    { endpoint, method, text: serialized, source: "venice-client" },
    safeMode,
  );
  if (!decision.allowed) {
    useInspectorStore.getState().updateLog(
      logId,
      buildInspectorTelemetryPatch({
        status: 451,
        durationMs: Date.now() - startedAt,
        previewDurationMs,
        guardOutcome: "block",
        error: decision.userMessage,
      }),
    );
    throw new SafetyGuardBlockedError({
      ...decision.guardDecision,
      userMessage: decision.userMessage,
    });
  }
}

/**
 * Performs a Venice API request through the desktop IPC bridge with retries.
 * @param endpoint The Venice API endpoint.
 * @param options Request options including method, body, signal, and dispatch.
 * @returns A promise resolving to data, response, headers, and diagnostics.
 */
async function veniceFetchDesktop(
  endpoint: string,
  {
    method = "GET",
    body = undefined as unknown,
    signal = undefined as AbortSignal | undefined,
    dispatch = undefined as AppDispatch | undefined,
    headers = {} as Record<string, string>,
    isFormData = false,
    retry = true,
    timeoutMs = undefined as number | undefined,
  }: {
    method?: "GET" | "POST";
    body?: unknown;
    signal?: AbortSignal;
    dispatch?: AppDispatch;
    headers?: Record<string, string>;
    isFormData?: boolean;
    retry?: boolean;
    timeoutMs?: number;
  } = {}
): Promise<{ data: unknown; response: VeniceForgeResponse; headers: Record<string, string>; diagnostics: Partial<DiagnosticsEntry> }> {
  // Serialize FormData before crossing the IPC boundary.
  let serializedBody = body;
  if (isFormData && body instanceof FormData) {
    serializedBody = await serializeFormData(body);
  }
  const maxAttempts = retry ? 3 : 1;
  let lastError: VeniceApiError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const startedAt = nowIso();
    let diagHeaders: Record<string, string> = {};
    let response: VeniceForgeResponse | null = null;
    let clearDesktopSignal: (() => void) | undefined;
    try {
      const timeoutMsResolved = resolveTimeoutMs(timeoutMs);
      const timeout = timeoutMsResolved != null ? createTimeoutSignal(timeoutMsResolved, signal) : null;
      const desktopSignal = timeout?.signal ?? signal;
      clearDesktopSignal = timeout?.clear;
      if (desktopSignal?.aborted) throw new DOMException("Request aborted", "AbortError");
      response = await desktopVenice.request(
        {
          endpoint,
          method,
          body: serializedBody,
          headers,
        },
        desktopSignal
      );
      diagHeaders = response.headers || {};
      const errorMsg = response.ok ? "" : normalizeError(response.status, readDesktopErrorBody(response.body));
      const modelName = extractModelName(serializedBody, response.body);
      const diag = summarizeDiagnostics({
        endpoint,
        method,
        status: response.status,
        ok: response.ok,
        headers: diagHeaders,
        error: errorMsg,
        startedAt,
        endedAt: nowIso(),
        model: modelName,
      });
      dispatch?.({ type: "SET_DIAGNOSTICS", diagnostics: diag });

      if (!response.ok) {
        const retryable = [429, 500, 503].includes(response.status);
        if (retryable && attempt < maxAttempts - 1) {
          await sleep(
            response.status === 429
              ? computeRateLimitWait(diagHeaders, attempt)
              : calculateBackoff(attempt + 1),
            signal
          );
          continue;
        }
        const error: VeniceApiError = new Error(errorMsg);
        error.status = response.status;
        error.diagnostics = diag; // marks as already dispatched
        throw error;
      }

      return { data: response.body, response, headers: diagHeaders, diagnostics: diag };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;
      const errorObj = err as VeniceApiError;
      const normalized = errorObj.message || "Desktop Venice transport failed.";
      lastError = new Error(normalized) as VeniceApiError;
      lastError.status = errorObj.status ?? response?.status ?? 0;
      // Skip re-dispatch for HTTP errors already dispatched in the try block.
      if (!errorObj.diagnostics) {
        dispatch?.({
          type: "SET_DIAGNOSTICS",
          diagnostics: summarizeDiagnostics({
            endpoint,
            method,
            status: lastError.status,
            ok: false,
            headers: diagHeaders,
            error: normalized,
            startedAt,
            endedAt: nowIso(),
            model: extractModelName(serializedBody, response?.body),
          }),
        });
      }

      const isNetworkFailure = lastError.status == null || lastError.status === 0;
      const isRetryableStatus =
        typeof lastError.status === "number" && [429, 500, 503].includes(lastError.status);
      if (
        (isNetworkFailure || isRetryableStatus) &&
        attempt < maxAttempts - 1
      ) {
        await sleep(calculateBackoff(attempt + 1, 1200, 9000), signal);
        continue;
      }
      throw lastError;
    } finally {
      clearDesktopSignal?.();
    }
  }

  throw lastError || new Error("Request failed");
}

/**
 * Internal Venice API fetch implementation that routes to desktop or web mode.
 * @param endpoint The Venice API endpoint.
 * @param options Request options including method, body, signal, and dispatch.
 * @returns A promise resolving to data, response, headers, and diagnostics.
 */
async function _veniceFetch(
  endpoint: string,
  {
    method = "GET",
    body = undefined as unknown,
    signal = undefined as AbortSignal | undefined,
    dispatch = undefined as AppDispatch | undefined,
    headers = {} as Record<string, string>,
    isFormData = false,
    retry = true,
    timeoutMs = undefined as number | undefined,
  }: {
    method?: "GET" | "POST";
    body?: unknown;
    signal?: AbortSignal;
    dispatch?: AppDispatch;
    headers?: Record<string, string>;
    isFormData?: boolean;
    retry?: boolean;
    timeoutMs?: number;
  } = {}
): Promise<{ data: unknown; response: Response | VeniceForgeResponse; headers: Record<string, string>; diagnostics: Partial<DiagnosticsEntry> }> {
  if (isElectron()) {
    return veniceFetchDesktop(endpoint, {
      method,
      body,
      signal,
      dispatch,
      headers,
      isFormData,
      retry,
      timeoutMs,
    });
  }

  // Provider-side `safe_mode` is independent of local Family Safe Mode:
  // when the user has the provider flag on, apply it here for non-Electron
  // transports. Electron mode applies the same flag through the IPC-level
  // guardPipeline so the runtime snapshot is authoritative there.
  const veniceApiSafeMode = useSettingsStore.getState().veniceApiSafeMode;
  // Compute the effective body up-front so we can pass it through fetch once.
  const isFormDataBody = isFormData && body instanceof FormData;
  let effectiveBody: unknown = body;
  if (!isFormDataBody && typeof body === "object" && body !== null && endpointSupportsSafeMode(endpoint)) {
    effectiveBody = applyVeniceApiSafeMode(endpoint, body as Record<string, unknown>, veniceApiSafeMode);
  }
  const startedAt = nowIso();
  const url = `${PROXY_BASE_PATH}${endpoint}`;
  const maxAttempts = retry ? 3 : 1;
  let lastError: VeniceApiError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) throw new DOMException("Request aborted", "AbortError");

    const requestHeaders: Record<string, string> = {
      ...headers,
      "X-Venice-Forge-Family-Safe-Mode": String(useSettingsStore.getState().localFamilySafeModeEnabled),
    };
    if (!isFormData) requestHeaders["Content-Type"] = "application/json";

    let response: Response | null = null;
    let diagHeaders: Record<string, string> = {};
    let parsed: unknown = null;
    let clearFetchSignal: (() => void) | undefined;
    try {
      const fetchTimeoutMs = resolveTimeoutMs(timeoutMs) ?? 60000;
      const fetchTimeout = createTimeoutSignal(fetchTimeoutMs, signal);
      clearFetchSignal = fetchTimeout.clear;
      response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: isFormData
          ? (body as FormData)
          : effectiveBody === undefined
          ? undefined
          : JSON.stringify(effectiveBody),
        signal: fetchTimeout.signal,
      });

      diagHeaders = parseDiagnosticsHeaders(response);

      let text = "";
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        text = await response.text().catch(() => "");
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          parsed = null;
        }
      } else if (
        contentType.startsWith("image/") ||
        contentType.startsWith("audio/") ||
        contentType.startsWith("video/")
      ) {
        const blob = await response.blob();
        parsed = {
          dataUrl: await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = () => reject(new Error("Failed to read response blob"));
            reader.readAsDataURL(blob);
          }),
        };
      } else {
        text = await response.text().catch(() => "");
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch {
          parsed = { text };
        }
      }

      const modelName = extractModelName(body, parsed);
      const diag = summarizeDiagnostics({
        endpoint,
        method,
        status: response.status,
        ok: response.ok,
        headers: diagHeaders,
        error: response.ok ? "" : normalizeError(response.status, readWebErrorBody(parsed, text, response.statusText)),
        startedAt,
        endedAt: nowIso(),
        model: modelName,
      });
      dispatch?.({ type: "SET_DIAGNOSTICS", diagnostics: diag });

      if (!response.ok) {
        const normalized = diag.error || normalizeError(response.status, readWebErrorBody(parsed, text, response.statusText));
        const retryable = [429, 500, 503].includes(response.status);

        if (retryable && attempt < maxAttempts - 1) {
          await sleep(
            response.status === 429
              ? computeRateLimitWait(diagHeaders, attempt)
              : Math.min(1000 * Math.pow(2, attempt + 1), 8000),
            signal
          );
          continue;
        }

        const error: VeniceApiError = new Error(normalized);
        error.status = response.status;
        error.diagnostics = diag;
        throw error;
      }

      return { data: parsed, response, headers: diagHeaders, diagnostics: diag };
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") throw err;

      const errorObj = err as VeniceApiError;
      const isFetchFailure =
        err instanceof TypeError ||
        (err instanceof DOMException && err.name === "TimeoutError");
      const normalized = isFetchFailure
        ? "Fetch failure: likely CORS, network, browser sandbox, timeout, or blocked request. " +
          (errorObj.message || "")
        : errorObj.message || "Request failed";

      lastError = new Error(normalized) as VeniceApiError;
      lastError.status = errorObj.status ?? response?.status ?? 0;

      if (!errorObj.diagnostics) {
        dispatch?.({
          type: "SET_DIAGNOSTICS",
          diagnostics: summarizeDiagnostics({
            endpoint,
            method,
            status: lastError.status,
            ok: false,
            headers: diagHeaders,
            error: normalized,
            startedAt,
            endedAt: nowIso(),
            model: extractModelName(body, parsed),
          }),
        });
      }

      const retryableStatus =
        lastError.status !== undefined &&
        lastError.status !== null &&
        [429, 500, 503].includes(lastError.status);

      if ((isFetchFailure || retryableStatus) && attempt < maxAttempts - 1) {
        await sleep(calculateBackoff(attempt + 1, 1200, 9000), signal);
        continue;
      }

      throw lastError;
    } finally {
      clearFetchSignal?.();
    }
  }

  throw lastError || new Error("Request failed");
}

/**
 * Fetches data from the Venice API with automatic retries, deduplication, and diagnostics.
 * @param endpoint The Venice API endpoint.
 * @param options Request options including method, body, signal, dispatch, and retry flags.
 * @returns A promise resolving to the parsed data, raw response, headers, and diagnostics.
 */
export async function veniceFetch<T = unknown>(
  endpoint: string,
  options: {
    method?: "GET" | "POST";
    body?: unknown;
    signal?: AbortSignal;
    dispatch?: AppDispatch;
    headers?: Record<string, string>;
    isFormData?: boolean;
    retry?: boolean;
    timeoutMs?: number;
    dedupe?: boolean;
    validator?: (data: unknown) => data is T;
    /**
     * Optional callback that receives the inspector log id as soon as
     * veniceFetch records it. Lets long-lived callers (e.g. video polling)
     * attach later lifecycle updates (cancel/timeout) to the same log
     * without creating a duplicate entry.
     */
    registerLogId?: (logId: string) => void;
  } = {}
): Promise<{ data: T; response: Response | VeniceForgeResponse; headers: Record<string, string>; diagnostics: Partial<DiagnosticsEntry>; }> {
  const { dedupe = false, method = "GET", body, registerLogId } = options;
  
  const payloadRecord = body as Record<string, unknown> | null | undefined;
  if (endpoint.includes("/chat/completions") && payloadRecord && Array.isArray(payloadRecord.messages)) {
    const dateStr = new Date().toLocaleString();
    const systemInstruction = `[System Runtime Context]\nCurrent Date/Time: ${dateStr}\n[/System Runtime Context]\n\n`;
    const messages = [...payloadRecord.messages];
    if (messages.length > 0 && messages[0].role === 'system') {
      messages[0] = { ...messages[0], content: systemInstruction + (messages[0].content || '') };
    } else {
      messages.unshift({ role: 'system', content: systemInstruction });
    }
    payloadRecord.messages = messages;
    options.body = payloadRecord;
  }

  const startedAt = Date.now();
  const requestHeaders = maskInspectorHeaders(options.headers);
  const { decision: safetyDecision, previewDurationMs } = getSafetyDecisionForLog(endpoint, method, body);
  const guardOutcome = deriveGuardOutcome(safetyDecision);
  const logId = useInspectorStore.getState().addLog({
    endpoint,
    method,
    transport: "venice",
    requestHeaders,
    requestBody: sanitizeInspectorPayload(body),
    safetyDecision,
    previewDurationMs,
    guardOutcome,
    callOutcome: "pending",
  });
  if (registerLogId) {
    try { registerLogId(logId); } catch { /* caller hooks are best effort */ }
  }

  // Child exploitation safety guard — enforcement at transport boundary.
  // Note: GET requests (e.g., /models) are skipped because they carry no user content.
  // SAFETY-DEDUP: In desktop (Electron) mode the IPC handler is the authoritative
  // guard, so we skip the renderer scan to avoid running the detector twice on the
  // same payload. The IPC handler still calls recordDecision() so the main-process
  // audit counters stay accurate. The renderer's recordDecision is intentionally
  // not called here in Electron mode to prevent double-counting (the renderer
  // audit snapshot is a separate process and the IPC handler is authoritative).
  // In web mode the scan runs here; the Express proxy in server.ts is the
  // fail-closed backstop.
  if (method === "POST" && body !== undefined && !isElectron()) {
    const decision = maybeRunLocalFamilyGuard(
      { endpoint, method, payload: body, source: "venice-client" },
      useSettingsStore.getState().localFamilySafeModeEnabled,
    );
    if (!decision.allowed) {
      useInspectorStore.getState().updateLog(
        logId,
        buildInspectorTelemetryPatch({
          status: 451,
          durationMs: Date.now() - startedAt,
          previewDurationMs,
          guardOutcome: "block",
          error: decision.userMessage,
        }),
      );
      useInspectorStore.getState().updateLog(logId, {
        safetyDecision: decision.guardDecision,
      });
      throw new SafetyGuardBlockedError({ ...decision.guardDecision, userMessage: decision.userMessage });
    }
  }

  const key = dedupe ? dedupeKey(endpoint, method, body) : "";
  if (dedupe && hasInFlight(key)) {
    return getInFlight(key) as Promise<{ data: T; response: Response | VeniceForgeResponse; headers: Record<string, string>; diagnostics: Partial<DiagnosticsEntry> }>;
  }

  const execute = async () => {
    try {
      const result = await _veniceFetch(endpoint, options);
      if (options.validator && !options.validator(result.data)) {
        throw new Error(`veniceFetch: Response validation failed for ${endpoint}`);
      }
      useInspectorStore.getState().updateLog(
        logId,
        buildInspectorTelemetryPatch({
          status: result.response.status,
          durationMs: Date.now() - startedAt,
          previewDurationMs,
          guardOutcome,
          responseHeaders: result.headers,
          responseBody: result.data,
        }),
      );

      // Output screening for web mode (Electron already does this in guardPipeline.ts).
      const contentType = result.response instanceof Response
        ? result.response.headers.get("content-type")
        : (result.response as VeniceForgeResponse).contentType || null;
      await screenVeniceResponse(
        result.data,
        contentType,
        endpoint,
        method,
        logId,
        startedAt,
        previewDurationMs,
      );

      return result as { data: T; response: Response | VeniceForgeResponse; headers: Record<string, string>; diagnostics: Partial<DiagnosticsEntry> };
    } catch (err: unknown) {
      if (err instanceof SafetyGuardBlockedError) {
        // The response-screening helper has already logged the 451 safety-block patch.
        throw err;
      }
      const errAny = err as { status?: number };
      useInspectorStore.getState().updateLog(
        logId,
        buildInspectorTelemetryPatch({
          status: errAny.status || 500,
          durationMs: Date.now() - startedAt,
          previewDurationMs,
          guardOutcome,
          error: safeInspectorError(err),
        }),
      );
      throw err;
    }
  };

  const promise = execute();

  if (dedupe) {
    setInFlight(key, promise);
    promise.finally(() => deleteInFlight(key)).catch(() => {});
  }

  return promise;
}

/**
 * Legacy blob fetch helper used by the thin `lib/venice-client` surface.
 * @param path The Venice API path.
 * @param body The JSON request body.
 * @param init Fetch init options.
 * @returns A Blob response.
 */
export async function veniceBlob(path: string, body: object, init: { signal?: AbortSignal } = {}): Promise<Blob> {
  if (init.signal?.aborted) throw new Error("Aborted");

  const startedAt = Date.now();
  const requestHeaders = maskInspectorHeaders({ "Content-Type": "application/json" });
  const { decision: safetyDecision, previewDurationMs } = getSafetyDecisionForLog(path, "POST", body);
  const guardOutcome = deriveGuardOutcome(safetyDecision);
  const logId = useInspectorStore.getState().addLog({
    endpoint: path,
    method: "POST",
    transport: "venice",
    requestHeaders,
    requestBody: sanitizeInspectorPayload(body),
    safetyDecision,
    previewDurationMs,
    guardOutcome,
    callOutcome: "pending",
  });

  try {
  if (!isElectron()) {
    enforceLegacyWebGuard(path, "POST", body);
    const url = `${PROXY_BASE_PATH}${path.replace("/api/v1", "")}`;
    const fetchResponse = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Venice-Forge-Family-Safe-Mode": String(useSettingsStore.getState().localFamilySafeModeEnabled),
      },
      body: JSON.stringify(body),
      signal: init.signal,
    });
    if (!fetchResponse.ok) {
      const text = await fetchResponse.text().catch(() => "");
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { parsed = null; }
      const bodyMessage = readVeniceErrorBody(parsed || text || fetchResponse.statusText);
      throw new VeniceAPIError(bodyMessage || `HTTP ${fetchResponse.status}`, fetchResponse.status);
    }

    const contentType = fetchResponse.headers.get("content-type");
    const ct = (contentType || "").toLowerCase();
    const isTextual =
      ct.includes("application/json") ||
      ct.startsWith("text/");
    const screenBody = isTextual
      ? await fetchResponse.clone().text().catch(() => null)
      : null;
    if (screenBody != null) {
      await screenVeniceResponse(
        screenBody,
        contentType,
        path,
        "POST",
        logId,
        startedAt,
        previewDurationMs,
      );
    }

    useInspectorStore.getState().updateLog(logId, {
      status: fetchResponse.status,
      callOutcome: "success",
      durationMs: Date.now() - startedAt,
    });
    return await fetchResponse.blob();
  }

  const response = await desktopVenice.request(
    {
      endpoint: path.replace("/api/v1", ""),
      method: "POST",
      body,
    },
    init.signal
  );
  if (!response.ok) {
    const bodyMessage = readVeniceErrorBody(response.body);
    throw new VeniceAPIError(bodyMessage || `HTTP ${response.status}`, response.status);
  }

  const b64 = (response.body as { dataBase64?: string }).dataBase64;
  if (!b64) {
    if (typeof response.body === "string") return new Blob([response.body], { type: response.contentType });
    return new Blob([], { type: response.contentType });
  }
  const binaryStr = atob(b64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryStr.charCodeAt(i);
  
  useInspectorStore.getState().updateLog(logId, {
    status: response.status,
    callOutcome: "success",
    durationMs: Date.now() - startedAt,
  });
  return new Blob([bytes], { type: response.contentType });
  } catch (error) {
    if (error instanceof SafetyGuardBlockedError) {
      // The response-screening helper has already logged the 451 safety-block patch.
      throw error;
    }
    const errAny = error as { status?: number; message?: string };
    const errorClass = classifyInspectorError(errAny.status, errAny.message);
    useInspectorStore.getState().updateLog(logId, {
      callOutcome: deriveCallOutcome(errAny.status, errorClass) ?? "error",
      errorClass,
      error: safeInspectorError(error),
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

/**
 * Legacy FormData fetch helper used by the thin `lib/venice-client` surface.
 * @param path The Venice API path.
 * @param formData The FormData payload.
 * @param init Fetch init options.
 * @returns The parsed response body.
 */
export async function veniceFormData<T>(path: string, formData: FormData, init: { signal?: AbortSignal } = {}): Promise<T> {
  if (init.signal?.aborted) throw new Error("Aborted");

  const startedAt = Date.now();
  const requestHeaders = maskInspectorHeaders({ "Content-Type": "multipart/form-data" });
  const { decision: safetyDecision, previewDurationMs } = getSafetyDecisionForLog(path, "POST", "(FormData object omitted for telemetry)");
  const guardOutcome = deriveGuardOutcome(safetyDecision);
  const logId = useInspectorStore.getState().addLog({
    endpoint: path,
    method: "POST",
    transport: "venice",
    requestHeaders,
    requestBody: "(FormData object omitted for telemetry)",
    safetyDecision,
    previewDurationMs,
    guardOutcome,
    callOutcome: "pending",
  });

  try {
  if (!isElectron()) {
    enforceLegacyWebGuard(path, "POST", formData);
    const url = `${PROXY_BASE_PATH}${path.replace("/api/v1", "")}`;
    // Provider-side safe_mode — independent of localFamilySafeModeEnabled —
    // must be appended to FormData payloads in non-Electron transports for
    // endpoints that accept the field. Electron mode applies the same flag
    // through the IPC-level guardPipeline (runtime snapshot authoritative).
    if (endpointSupportsSafeMode(path) && useSettingsStore.getState().veniceApiSafeMode !== undefined) {
      if (!formData.has("safe_mode")) {
        formData.append("safe_mode", String(useSettingsStore.getState().veniceApiSafeMode));
      }
    }
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "X-Venice-Forge-Family-Safe-Mode": String(useSettingsStore.getState().localFamilySafeModeEnabled),
      },
      body: formData,
      signal: init.signal,
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
    if (!response.ok) {
      const bodyMessage = readVeniceErrorBody(body);
      throw new VeniceAPIError(bodyMessage || response.statusText || `HTTP ${response.status}`, response.status);
    }

    await screenVeniceResponse(
      body,
      contentType,
      path,
      "POST",
      logId,
      startedAt,
      previewDurationMs,
    );

    useInspectorStore.getState().updateLog(logId, {
      status: response.status,
      callOutcome: "success",
      durationMs: Date.now() - startedAt,
      responseBody: sanitizeInspectorPayload(body),
    });
    return body as T;
  }

  const serializedBody = await serializeFormData(formData);
  const response = await desktopVenice.request(
    {
      endpoint: path.replace("/api/v1", ""),
      method: "POST",
      body: { _isSerializedFormData: true, entries: serializedBody.entries },
    },
    init.signal
  );

  if (!response.ok) {
    const bodyMessage = readVeniceErrorBody(response.body);
    throw new VeniceAPIError(bodyMessage || `HTTP ${response.status}`, response.status);
  }

  useInspectorStore.getState().updateLog(logId, {
    status: response.status,
    callOutcome: "success",
    durationMs: Date.now() - startedAt,
    responseBody: sanitizeInspectorPayload(response.body),
  });
  return response.body as T;
  } catch (error) {
    if (error instanceof SafetyGuardBlockedError) {
      // The response-screening helper has already logged the 451 safety-block patch.
      throw error;
    }
    const errAny = error as { status?: number; message?: string };
    const errorClass = classifyInspectorError(errAny.status, errAny.message);
    useInspectorStore.getState().updateLog(logId, {
      callOutcome: deriveCallOutcome(errAny.status, errorClass) ?? "error",
      errorClass,
      error: safeInspectorError(error),
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

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
