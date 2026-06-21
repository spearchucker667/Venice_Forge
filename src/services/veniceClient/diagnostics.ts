/** @fileoverview Diagnostic header parsing, model extraction, and safe error formatting. */

import { DIAG_HEADER_NAMES } from "../../constants/venice";
import { redactErrorMessage } from "../../shared/redaction";
import type { DiagnosticsEntry } from "../../types/venice";

/**
 * Returns the current timestamp as an ISO 8601 string.
 * @returns The current time in ISO format.
 */
export function nowIso() {
  return new Date().toISOString();
}

/**
 * Extracts known diagnostic headers from a response object.
 * @param response The fetch Response to inspect.
 * @returns A record of header names to their string values.
 */
export function parseDiagnosticsHeaders(response: Response) {
  const headers: Record<string, string> = {};
  DIAG_HEADER_NAMES.forEach((name) => {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value;
  });
  return headers;
}

/** Input fields for summarizing diagnostics. */
export interface SummarizeDiagnosticsInput {
  endpoint: string;
  method: string;
  status?: number | string | null;
  ok?: boolean;
  headers?: Record<string, string>;
  error?: string;
  startedAt?: string;
  endedAt?: string;
  model?: string | null;
}

/**
 * Summarizes request metadata into a diagnostic snapshot.
 * @param params The raw request and response fields.
 * @returns A normalized diagnostics object with latency and header info.
 */
export function summarizeDiagnostics({
  endpoint,
  method,
  status,
  ok,
  headers,
  error,
  startedAt,
  endedAt,
  model,
}: SummarizeDiagnosticsInput): Partial<DiagnosticsEntry> {
  return {
    endpoint,
    method,
    status: status ?? null,
    ok: !!ok,
    error: error || "",
    startedAt,
    endedAt,
    latencyMs:
      startedAt && endedAt
        ? new Date(endedAt).getTime() - new Date(startedAt).getTime()
        : null,
    headers: headers || {},
    model: model || null,
  };
}

/**
 * Recursively searches for a model identifier in an object graph.
 * @param obj The object to search.
 * @param depth Maximum recursion depth.
 * @returns The model identifier if found, otherwise null.
 */
function findModelRecursively(obj: unknown, depth = 3): string | null {
  if (!obj || typeof obj !== "object" || depth === 0) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findModelRecursively(item, depth - 1);
      if (found) return found;
    }
  } else {
    const record = obj as Record<string, unknown>;
    if (typeof record.model === "string") return record.model;
    for (const val of Object.values(record)) {
      const found = findModelRecursively(val, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Extracts the model identifier from request or response payloads.
 * @param requestBody The request body.
 * @param responseBody The parsed response body.
 * @returns The model identifier if found, otherwise null.
 */
export function extractModelName(requestBody: unknown, responseBody: unknown): string | null {
  if (responseBody && typeof responseBody === "object") {
    const resp = responseBody as Record<string, unknown>;
    if (typeof resp.model === "string") return resp.model;
  }
  if (requestBody) {
    const req = requestBody as Record<string, unknown>;
    if (typeof req.get === "function") {
      const val = (req.get as (key: string) => unknown)("model");
      if (typeof val === "string") return val;
    }
    if (typeof req === "object") {
      if (req._isSerializedFormData && Array.isArray(req.entries)) {
        const entry = req.entries.find((e: unknown) => {
          const item = e as Record<string, unknown>;
          return item && item.name === "model";
        }) as Record<string, unknown> | undefined;
        if (entry && typeof entry.value === "string") return entry.value;
      }
    }
  }

  return findModelRecursively(responseBody) || findModelRecursively(requestBody);
}

/**
 * Produces a safe, redacted error string for inspector telemetry.
 * Avoids stringifying arbitrary thrown objects (which can leak paths or
 * implementation details) and redacts secret-like tokens before storage.
 */
export function safeInspectorError(err: unknown): string {
  if (err instanceof Error) return redactErrorMessage(err.message);
  if (typeof err === "string") return redactErrorMessage(err);
  return "Unknown error";
}
