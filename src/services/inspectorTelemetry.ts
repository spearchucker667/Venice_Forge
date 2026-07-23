/** @fileoverview Redacted per-call telemetry helpers for the Traffic Inspector. */

import { redactErrorMessage, redactSecrets } from "../shared/redaction";

/**
 * Structured metadata describing the local Family Safe Mode decision for a
 * given Venice request, as seen by the renderer-side inspector.
 */
export type InspectorSafetyDecision =
  | {
      layer: "local-family-safe-mode";
      mode: "family";
      action: "allow" | "block";
      reasonCode?: string;
    }
  | {
      layer: "local-family-safe-mode";
      mode: "adult";
      action: "skipped";
      reasonCode: "LOCAL_FAMILY_SAFE_MODE_DISABLED";
    }
  | {
      layer: "local-family-safe-mode";
      mode: "electron-main-authoritative";
      action: "deferred";
    };

export type InspectorTransport = "venice" | "jina" | "local";

export type InspectorGuardOutcome = "allow" | "block" | "skipped" | "deferred" | "pending";

export type InspectorCallOutcome =
  | "pending"
  | "success"
  | "blocked"
  | "error"
  | "aborted"
  | "timeout";

export type InspectorErrorClass =
  | "none"
  | "safety-block"
  | "auth"
  | "rate-limit"
  | "server"
  | "network"
  | "aborted"
  | "client"
  | "timeout";

export type InspectorLogFilter =
  | "all"
  | "blocked"
  | "error"
  | "aborted"
  | "timeout"
  | "venice"
  | "jina"
  | "local";

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "proxy-authenticate",
  "x-api-key",
  "x-auth-token",
  "x-csrf-token",
  "x-access-token",
  "x-refresh-token",
  "x-jina-api-key",
  "x-venice-api-key",
]);

const PROMPT_FIELD_NAMES = new Set([
  "messages",
  "prompt",
  "input",
  "content",
  "text",
  "system",
  "user",
  "assistant",
]);

const MAX_SUMMARY_CHARS = 240;

/** Masks credential-bearing HTTP headers for inspector display. */
export function maskInspectorHeaders(headers?: Record<string, string>): Record<string, string> {
  if (!headers) return {};
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (
      SENSITIVE_HEADERS.has(lowerKey) ||
      (lowerKey.startsWith("x-") &&
        (lowerKey.endsWith("-key") || lowerKey.endsWith("-token") || lowerKey.endsWith("-secret")))
    ) {
      masked[key] = "******";
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

function summarizeString(value: string): string {
  if (/^\[(?:data URL|text): \d+ chars\]$/.test(value)) {
    return value;
  }
  if (value.startsWith("data:")) {
    return `[data URL: ${value.length} chars]`;
  }
  if (value.length > MAX_SUMMARY_CHARS) {
    return `[text: ${value.length} chars]`;
  }
  return `[text: ${value.length} chars]`;
}

function sanitizeContentPart(part: unknown): unknown {
  if (!part || typeof part !== "object") return part;
  const record = part as Record<string, unknown>;
  if (record.type === "image_url" && record.image_url && typeof record.image_url === "object") {
    const imageUrl = record.image_url as Record<string, unknown>;
    const url = typeof imageUrl.url === "string" ? imageUrl.url : "";
    return {
      type: "image_url",
      image_url: { url: summarizeString(url) },
    };
  }
  if (typeof record.text === "string") {
    return { ...record, text: summarizeString(record.text) };
  }
  if (typeof record.content === "string") {
    return { ...record, content: summarizeString(record.content) };
  }
  return "[redacted content part]";
}

function sanitizeMessage(message: unknown): unknown {
  if (!message || typeof message !== "object") return message;
  const record = message as Record<string, unknown>;
  const next: Record<string, unknown> = { role: record.role };
  if (typeof record.content === "string") {
    next.content = summarizeString(record.content);
  } else if (Array.isArray(record.content)) {
    next.content = record.content.map(sanitizeContentPart);
  } else if (record.content !== undefined) {
    next.content = "[redacted message content]";
  }
  if (typeof record.name === "string") {
    next.name = summarizeString(record.name);
  } else if (record.name !== undefined) {
    next.name = "[redacted message name]";
  }
  return next;
}

function sanitizeSerializedFormData(body: Record<string, unknown>): Record<string, unknown> {
  const entries = Array.isArray(body.entries)
    ? body.entries.map((entry) => {
        const item = entry as Record<string, unknown>;
        if (item._isFile && typeof item.value === "string") {
          return {
            name: item.name,
            filename: item.filename,
            type: item.type,
            _isFile: true,
            value: `[base64 file: ${item.value.length} chars]`,
          };
        }
        if (PROMPT_FIELD_NAMES.has(String(item.name))) {
          return {
            name: item.name,
            value: summarizeString(String(item.value ?? "")),
          };
        }
        return item;
      })
    : [];
  return { _isSerializedFormData: true, entries };
}

/**
 * Redacts prompt text, base64 blobs, and oversized payloads before inspector storage.
 */
export function sanitizeInspectorPayload(body: unknown): unknown {
  if (body instanceof FormData) {
    const entries: Record<string, unknown> = {};
    for (const [key, val] of body.entries()) {
      if (val instanceof File) {
        entries[key] = `[File: ${val.name} (${val.size} bytes)]`;
      } else if (PROMPT_FIELD_NAMES.has(key)) {
        entries[key] = summarizeString(String(val));
      } else {
        entries[key] = summarizeString(String(val));
      }
    }
    return entries;
  }

  if (!body || typeof body !== "object") {
    return body === undefined ? undefined : summarizeString(String(body));
  }

  const record = body as Record<string, unknown>;
  if (record._isSerializedFormData) {
    return sanitizeSerializedFormData(record);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (PROMPT_FIELD_NAMES.has(key)) {
      if (key === "messages" && Array.isArray(value)) {
        sanitized.messages = value.map(sanitizeMessage);
      } else if (typeof value === "string") {
        sanitized[key] = summarizeString(value);
      } else if (Array.isArray(value)) {
        sanitized[key] = `[redacted array: ${value.length} items]`;
      } else {
        sanitized[key] = "[redacted prompt field]";
      }
      continue;
    }

    if (key === "image" || key === "images" || key === "dataUrl") {
      sanitized[key] =
        typeof value === "string" ? summarizeString(value) : "[redacted image payload]";
      continue;
    }

    if (typeof value === "string" && value.length > MAX_SUMMARY_CHARS) {
      sanitized[key] = summarizeString(value);
      continue;
    }

    sanitized[key] = value;
  }

  return redactSecrets(sanitized);
}

/** URL-shaped fields that may carry identity-sensitive references. Always summarized. */
const URL_RESPONSE_FIELDS = new Set([
  "dataUrl",
  "imageUrl",
  "url",
  "audioUrl",
  "videoUrl",
  "downloadUrl",
]);

/** Summarizes response bodies so scrape/image payloads never land verbatim in telemetry. */
export function sanitizeInspectorResponse(body: unknown): unknown {
  if (body === undefined || body === null) return body;

  if (typeof body === "string") {
    return summarizeString(body);
  }

  if (!body || typeof body !== "object") return body;

  const record = body as Record<string, unknown>;

  for (const field of URL_RESPONSE_FIELDS) {
    if (record[field] !== undefined) {
      const value = record[field];
      const next: Record<string, unknown> = { ...redactSecrets(record) };
      next[field] = typeof value === "string" ? summarizeString(value) : `[non-string ${field}]`;
      return next;
    }
  }

  if (typeof record.text === "string" || typeof record.markdown === "string") {
    const text = typeof record.text === "string" ? record.text : String(record.markdown);
    return {
      ...redactSecrets(record),
      text: summarizeString(text),
      markdown: summarizeString(typeof record.markdown === "string" ? record.markdown : text),
      content: summarizeString(typeof record.content === "string" ? record.content : text),
    };
  }

  if (Array.isArray(record.choices)) {
    const choices = record.choices.map((choice) => {
      const item = choice as Record<string, unknown>;
      const message = item.message as Record<string, unknown> | undefined;
      if (!message) return item;
      return {
        ...item,
        message: sanitizeMessage(message),
      };
    });
    return { ...redactSecrets(record), choices };
  }

  return redactSecrets(record);
}

/** Maps the explicit inspector safety preview into a compact guard outcome. */
export function deriveGuardOutcome(
  decision?: InspectorSafetyDecision | { allow?: boolean; action?: string } | null,
): InspectorGuardOutcome {
  if (!decision) return "pending";
  if ("mode" in decision) {
    if (decision.mode === "electron-main-authoritative") return "deferred";
    if (decision.mode === "adult") return "skipped";
    if (decision.mode === "family") return decision.action === "block" ? "block" : "allow";
  }
  const legacy = decision as { allow?: boolean; action?: string };
  if (legacy.action === "block" || legacy.allow === false) return "block";
  if (legacy.action === "skipped") return "skipped";
  if (legacy.allow === true) return "allow";
  return "pending";
}

/** Classifies an error into a redacted, operator-friendly bucket. */
export function classifyInspectorError(
  status?: number,
  error?: string,
): InspectorErrorClass {
  if (status === 451) return "safety-block";
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate-limit";
  if (status === 408) return "timeout";
  if (typeof status === "number" && status >= 500) return "server";
  const normalized = (error || "").toLowerCase();
  if (normalized.includes("abort")) return "aborted";
  if (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("etimedout")
  ) return "timeout";
  if (normalized.includes("network") || normalized.includes("fetch failure") || status === 0) {
    return "network";
  }
  if (typeof status === "number" && status >= 400) return "client";
  return "none";
}

/** Derives the terminal call outcome from HTTP status and error metadata.
 *  Exposes `timeout` as its own outcome so the inspector can distinguish
 *  provider/operation deadlines from user-driven aborts. */
export function deriveCallOutcome(
  status?: number,
  errorClass?: InspectorErrorClass,
): InspectorCallOutcome {
  if (status === undefined && errorClass === "none") return "pending";
  if (errorClass === "aborted") return "aborted";
  if (errorClass === "timeout") return "timeout";
  if (status === 451 || errorClass === "safety-block") return "blocked";
  if (typeof status === "number" && status >= 200 && status < 300) return "success";
  if (status !== undefined || (errorClass && errorClass !== "none")) return "error";
  return "pending";
}

export interface InspectorTelemetryPatch {
  status?: number;
  durationMs?: number;
  previewDurationMs?: number;
  guardOutcome?: InspectorGuardOutcome;
  callOutcome?: InspectorCallOutcome;
  errorClass?: InspectorErrorClass;
  error?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
}

/** Builds a redacted telemetry patch from raw call results. */
export function buildInspectorTelemetryPatch(input: {
  status?: number;
  durationMs?: number;
  previewDurationMs?: number;
  guardOutcome?: InspectorGuardOutcome;
  error?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
}): InspectorTelemetryPatch {
  const errorClass = classifyInspectorError(input.status, input.error);
  return {
    status: input.status,
    durationMs: input.durationMs,
    previewDurationMs: input.previewDurationMs,
    guardOutcome: input.guardOutcome,
    callOutcome: deriveCallOutcome(input.status, errorClass),
    errorClass,
    error: input.error ? redactErrorMessage(input.error) : undefined,
    responseHeaders: input.responseHeaders ? maskInspectorHeaders(input.responseHeaders) : undefined,
    responseBody:
      input.responseBody === undefined ? undefined : sanitizeInspectorResponse(input.responseBody),
  };
}

export interface InspectorExportLog {
  id: string;
  timestamp: number;
  endpoint: string;
  method: string;
  transport: InspectorTransport;
  status?: number;
  durationMs?: number;
  previewDurationMs?: number;
  guardOutcome?: InspectorGuardOutcome;
  callOutcome?: InspectorCallOutcome;
  errorClass?: InspectorErrorClass;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  safetyDecision?: unknown;
  error?: string;
}

/** Produces a redacted export payload safe to share outside the app. */
export function exportRedactedInspectorLogs(
  logs: Array<{
    id: string;
    timestamp: number;
    endpoint: string;
    method: string;
    transport?: InspectorTransport;
    status?: number;
    durationMs?: number;
    previewDurationMs?: number;
    guardOutcome?: InspectorGuardOutcome;
    callOutcome?: InspectorCallOutcome;
    errorClass?: InspectorErrorClass;
    requestHeaders: Record<string, string>;
    requestBody?: unknown;
    responseHeaders?: Record<string, string>;
    responseBody?: unknown;
    safetyDecision?: unknown;
    error?: string;
  }>,
): InspectorExportLog[] {
  return logs.map((log) => ({
    id: log.id,
    timestamp: log.timestamp,
    endpoint: log.endpoint,
    method: log.method,
    transport: log.transport ?? "venice",
    status: log.status,
    durationMs: log.durationMs,
    previewDurationMs: log.previewDurationMs,
    guardOutcome: log.guardOutcome,
    callOutcome: log.callOutcome,
    errorClass: log.errorClass,
    requestHeaders: maskInspectorHeaders(log.requestHeaders),
    requestBody:
      log.requestBody === undefined ? undefined : sanitizeInspectorPayload(log.requestBody),
    responseHeaders: log.responseHeaders ? maskInspectorHeaders(log.responseHeaders) : undefined,
    responseBody:
      log.responseBody === undefined ? undefined : sanitizeInspectorResponse(log.responseBody),
    safetyDecision: log.safetyDecision ? redactSecrets(log.safetyDecision) : undefined,
    error: log.error ? redactErrorMessage(log.error) : undefined,
  }));
}

/** Applies a single inspector filter chip to a log row. */
export function matchesInspectorFilter(
  log: {
    transport?: InspectorTransport;
    status?: number;
    callOutcome?: InspectorCallOutcome;
    errorClass?: InspectorErrorClass;
    guardOutcome?: InspectorGuardOutcome;
  },
  filter: InspectorLogFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "blocked") {
    return log.status === 451 || log.callOutcome === "blocked";
  }
  if (filter === "error") {
    return log.callOutcome === "error";
  }
  if (filter === "aborted") {
    return log.callOutcome === "aborted" || log.errorClass === "aborted";
  }
  if (filter === "timeout") {
    return log.callOutcome === "timeout" || log.errorClass === "timeout";
  }
  if (filter === "venice") return log.transport === "venice";
  if (filter === "jina") return log.transport === "jina";
  if (filter === "local") {
    return log.transport === "local" || log.guardOutcome === "deferred" || log.guardOutcome === "skipped";
  }
  return true;
}
