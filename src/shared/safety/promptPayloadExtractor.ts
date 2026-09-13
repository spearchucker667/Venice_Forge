/**
 * @fileoverview Extracts prompt-like text fields from Venice API request payloads.
 *
 * Handles JSON objects, JSON arrays, serialized FormData, plain strings, and
 * nested records. Returns an array of { path, value } pairs for safety assessment.
 * Never logs or returns the original payload contents.
 */

import {
  MAX_SCAN_CHARS,
  MIDDLE_SCAN_CHARS,
  TAIL_SCAN_CHARS,
} from "./normalization";

export interface ExtractedField {
  path: string;
  value: string;
}

/**
 * Fields that contain user-controlled prompt content, by endpoint.
 *
 */
const ENDPOINT_FIELDS: Record<string, readonly string[]> = {
  "/chat/completions": ["prompt", "system", "messages"],
  "/image/generate": ["prompt", "negative_prompt"],
  "/image/upscale": ["prompt"],
  "/augment/search": ["query", "question"],
  "/augment/scrape": ["instructions", "url"],
  "/augment/text-parser": ["text", "content", "prompt", "query"],
  "/video/queue": ["prompt", "negative_prompt", "image_url", "video_url"],
  "/video/retrieve": [],
  "/video/quote": ["prompt", "negative_prompt", "image_url", "video_url"],
  "/video/complete": [],
  "/image/edit": ["prompt"],
  "/image/multi-edit": ["prompt"],
};

/** Fields that should never be safety-checked (not user-controlled prompt content). */
const DENY_FIELD_NAMES = new Set<string>([
  "model", "width", "height", "steps", "cfg_scale", "seed", "format",
  "n", "response_format", "max_tokens", "max_completion_tokens", "temperature", "top_p", "stream",
  "stop", "presence_penalty", "frequency_penalty", "logit_bias", "user",
  "functions", "function_call", "tools", "tool_choice",
]);

/** Max characters per extracted field. Must cover the normalizer's head +
 *  middle + tail windows so a pre-slice cannot hide a tail/middle signal
 *  (VF-AUD-20260912-GSS-P2-003). */
const MAX_FIELD_CHARS = MAX_SCAN_CHARS + TAIL_SCAN_CHARS + MIDDLE_SCAN_CHARS;

/** Matches the maximum request-body size enforced at the proxy boundaries. */
const MAX_JSON_BODY_CHARS = 10 * 1024 * 1024;

/** Max number of fields to extract per payload. */
const MAX_FIELDS = 32;

/** Cap fields taken from one middle/history chat message, and the reserved
 *  budget for the first/system turn. The newest turn is not capped by this:
 *  it receives the remaining global budget after that reservation so a
 *  multimodal last message cannot skip first/system screening. */
const MAX_FIELDS_PER_MESSAGE = 8;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function safeStringify(v: unknown): string | null {
  if (typeof v === "string") return v.slice(0, MAX_FIELD_CHARS);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function appendFieldsWithBudget(target: ExtractedField[], incoming: ExtractedField[]): void {
  for (const field of incoming) {
    if (target.length >= MAX_FIELDS) return;
    target.push(field);
  }
}

/** Extracts prompt-like fields from a single chat message without applying the
 *  global field budget. Callers concatenate under MAX_FIELDS. */
function extractMessageFields(msg: unknown, index: number, path: string): ExtractedField[] {
  const results: ExtractedField[] = [];
  if (!isRecord(msg)) return results;
  if (typeof msg["content"] === "string") {
    const content = msg["content"].slice(0, MAX_FIELD_CHARS);
    if (content.trim()) results.push({ path: `${path}[${index}].content`, value: content });
  } else if (Array.isArray(msg["content"])) {
    for (let j = 0; j < msg["content"].length; j++) {
      const part = msg["content"][j];
      if (!isRecord(part)) continue;
      for (const [partKey, partVal] of Object.entries(part)) {
        // `type` is a part discriminator ("text" / "image_url"), not prompt
        // text. Counting it doubles the field budget on vision turns.
        if (partKey === "type") continue;
        if (typeof partVal === "string") {
          const t = partVal.slice(0, MAX_FIELD_CHARS);
          if (t.trim()) results.push({ path: `${path}[${index}].content[${j}].${partKey}`, value: t });
        }
      }
    }
  }
  if (typeof msg["name"] === "string" && msg["name"].trim()) {
    results.push({ path: `${path}[${index}].name`, value: msg["name"].slice(0, 200) });
  }
  return results;
}

/**
 * Chat histories commonly exceed MAX_FIELDS. Walking from index 0 dropped the
 * newest user turn (VF-AUD-20260912-GSS-P1-002). Always keep the last message
 * and the first message (typically system), then fill remaining budget from
 * the tail.
 */
function extractChatMessages(messages: unknown[], path: string): ExtractedField[] {
  const results: ExtractedField[] = [];
  const n = messages.length;
  if (n === 0) return results;
  const perMessage = messages.map((msg, i) => extractMessageFields(msg, i, path));
  const pushSlice = (incoming: ExtractedField[], limit: number): void => {
    const cap = Math.min(incoming.length, Math.max(0, limit), MAX_FIELDS - results.length);
    for (let k = 0; k < cap; k++) results.push(incoming[k]);
  };

  const lastIncoming = perMessage[n - 1] ?? [];
  const firstIncoming = n > 1 ? (perMessage[0] ?? []) : [];
  // Keep the first/system turn even when the newest multimodal message is huge.
  const firstReserve = Math.min(firstIncoming.length, MAX_FIELDS_PER_MESSAGE, MAX_FIELDS);
  pushSlice(lastIncoming, MAX_FIELDS - firstReserve);
  pushSlice(firstIncoming, firstReserve);
  for (let i = n - 2; i >= 1; i--) {
    if (results.length >= MAX_FIELDS) break;
    pushSlice(perMessage[i] ?? [], MAX_FIELDS_PER_MESSAGE);
  }
  return results;
}

/** Parses a serialized FormData structure `{ _isSerializedFormData: true, entries: [...] }`.
 *  Returns `null` if `entries` is malformed so callers can fall back to generic extraction.
 *  Iterates all entries — multi-chunk fix verified 2026-06-04. */
function extractFromSerializedFormData(obj: Record<string, unknown>, fieldNames: readonly string[]): ExtractedField[] | null {
  const results: ExtractedField[] = [];
  const entries = obj["entries"];
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const key = entry["name"];
    const val = entry["value"];
    if (typeof key !== "string") continue;
    if (DENY_FIELD_NAMES.has(key)) continue;
    if (!fieldNames.includes("*") && !fieldNames.includes(key)) continue;
    let strVal = "";
    if (entry["_isFile"] === true && typeof val === "string") {
      try {
        // Decode base64 to utf-8 so the text-parser payload can be safety checked
        if (typeof Buffer !== "undefined") {
          strVal = Buffer.from(val, "base64").toString("utf-8").slice(0, MAX_FIELD_CHARS);
        } else if (typeof atob === "function") {
          // Fallback for browsers if needed, though this branch mostly runs in Node
          strVal = decodeURIComponent(escape(atob(val))).slice(0, MAX_FIELD_CHARS);
        }
      } catch {
        strVal = safeStringify(val) || "";
      }
    } else {
      strVal = safeStringify(val) || "";
    }
    
    if (strVal && strVal.trim()) results.push({ path: `formData.${key}`, value: strVal });
  }
  return results;
}

/** Extracts from a plain JSON object for the given field names. */
function extractFromObject(
  obj: Record<string, unknown>,
  fieldNames: readonly string[],
  pathPrefix: string,
  depth: number,
  maxDepth: number = 8
): ExtractedField[] {
  if (depth > maxDepth) return [];
  const results: ExtractedField[] = [];

  // Handle serialized FormData
  if (obj["_isSerializedFormData"] === true) {
    const formDataResults = extractFromSerializedFormData(obj, fieldNames);
    if (formDataResults !== null) return formDataResults;
    // malformed entries — fall through to generic object extraction
  }

  for (const [key, val] of Object.entries(obj)) {
    if (results.length >= MAX_FIELDS) break;
    if (DENY_FIELD_NAMES.has(key)) continue;
    const path = pathPrefix ? `${pathPrefix}.${key}` : key;

    // Chat messages array: newest + first messages are always extracted
    // (VF-AUD-20260912-GSS-P1-002) so long histories cannot skip the latest turn.
    if (key === "messages" && Array.isArray(val)) {
      appendFieldsWithBudget(results, extractChatMessages(val, path));
      continue;
    }

    const strVal = safeStringify(val);
    if (strVal !== null) {
      if (!fieldNames.includes("*") && !fieldNames.includes(key)) continue;
      if (strVal.trim()) results.push({ path, value: strVal });
    } else if (isRecord(val) && (fieldNames.includes("*") || fieldNames.includes(key))) {
      const nested = extractFromObject(val, ["*"], path, depth + 1, maxDepth);
      results.push(...nested.slice(0, MAX_FIELDS - results.length));
    }
  }
  return results;
}

/** Attempts to extract text from a Buffer or binary blob with minimal parsing for text-parser endpoint. */
function extractFromBuffer(buffer: Uint8Array, fieldNames: readonly string[]): ExtractedField[] {
  try {
    // Try parsing as UTF-8 JSON first
    const decoder = typeof TextDecoder !== "undefined"
      ? new TextDecoder("utf-8", { fatal: false })
      : { decode: (b: Uint8Array) => Buffer.from(b).toString("utf-8") };
    const str = decoder.decode(buffer);
    if (str.length > MAX_JSON_BODY_CHARS) return [];
    const parsed: unknown = JSON.parse(str);
    if (isRecord(parsed)) {
      return extractFromObject(parsed, fieldNames, "", 0);
    }
    if (typeof parsed === "string") {
      return [{ path: "body", value: parsed.slice(0, MAX_FIELD_CHARS) }];
    }
  } catch {
    // Not valid JSON — may be multipart or plain text; return the printable prefix
    try {
      const decoder = typeof TextDecoder !== "undefined"
        ? new TextDecoder("utf-8", { fatal: false })
        : { decode: (b: Uint8Array) => Buffer.from(b).toString("utf-8") };
      const raw = decoder.decode(buffer).slice(0, MAX_FIELD_CHARS);
      if (raw.trim().length > 10) return [{ path: "body_raw", value: raw.trim() }];
    } catch {
      // Binary body — nothing to extract
    }
  }
  return [];
}

/**
 * Extracts all prompt-like text fields from a Venice API request payload.
 *
 * @param payload - The request body. May be a parsed object, string, Buffer/Uint8Array,
 *                  or serialized FormData `{ _isSerializedFormData, entries }`.
 * @param endpoint - The Venice endpoint path (e.g. "/chat/completions").
 * @returns Array of `{ path, value }` pairs. Values are capped at MAX_FIELD_CHARS.
 */
export function extractPromptLikeFields(
  payload: unknown,
  endpoint?: string
): ExtractedField[] {
  if (!payload) return [];

  let normEndpoint = endpoint?.replace(/^\/api\/venice/, "") ?? "";
  if (normEndpoint && !normEndpoint.startsWith("/")) {
    normEndpoint = "/" + normEndpoint;
  }
  const fieldNames: readonly string[] = (() => {
    for (const [key, fields] of Object.entries(ENDPOINT_FIELDS)) {
      if (normEndpoint.startsWith(key)) return fields;
    }
    // Unknown endpoint — check common prompt-ish field names
    return ["prompt", "query", "text", "content", "instruction", "message", "input", "messages", "question"];
  })();

  // Buffer / Uint8Array (used in Express middleware)
  if (ArrayBuffer.isView(payload)) {
    return extractFromBuffer(payload as Uint8Array, fieldNames);
  }

  // Native FormData (web mode)
  if (typeof FormData !== "undefined" && payload instanceof FormData) {
    const results: ExtractedField[] = [];
    for (const [key, val] of payload.entries()) {
      if (results.length >= MAX_FIELDS) break;
      if (DENY_FIELD_NAMES.has(key)) continue;
      if (!fieldNames.includes("*") && !fieldNames.includes(key)) continue;
      const strVal = typeof val === "string" ? val : "";
      if (strVal && strVal.trim()) results.push({ path: `formData.${key}`, value: strVal.slice(0, MAX_FIELD_CHARS) });
    }
    return results;
  }

  // Plain string
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return [];
    if (trimmed.length > MAX_JSON_BODY_CHARS) {
      return [{ path: "body", value: trimmed.slice(0, MAX_FIELD_CHARS) }];
    }
    // Attempt JSON parse
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isRecord(parsed)) return extractFromObject(parsed, fieldNames, "", 0);
      if (typeof parsed === "string") return [{ path: "body", value: parsed.slice(0, MAX_FIELD_CHARS) }];
    } catch {
      // Treat as plain text
      return [{ path: "body", value: trimmed }];
    }
  }

  // Parsed JSON object
  if (isRecord(payload)) {
    const results = extractFromObject(payload, fieldNames, "", 0);
    // Unknown endpoint fallback: if no fields found, do a recursive scan with the
    // same depth as the standard path (8) so deeply-nested prompt fields are still
    // extracted. We deliberately use a high depth here because unknown endpoints
    // might wrap their prompt content in arbitrary nesting.
    if (results.length === 0 && !Object.keys(ENDPOINT_FIELDS).some(k => normEndpoint.startsWith(k))) {
      return extractFromObject(payload, ["*"], "", 0, 8);
    }
    return results;
  }

  // Array of message objects (some callers pass this directly)
  if (Array.isArray(payload)) {
    const results: ExtractedField[] = [];
    const n = payload.length;
    const indices: number[] = [];
    const seen = new Set<number>();
    const pushIdx = (i: number): void => {
      if (i >= 0 && i < n && !seen.has(i)) {
        seen.add(i);
        indices.push(i);
      }
    };
    if (n > 0) pushIdx(n - 1);
    if (n > 1) pushIdx(0);
    for (let i = n - 2; i >= 1; i--) pushIdx(i);
    for (const i of indices) {
      if (results.length >= MAX_FIELDS) break;
      const item = payload[i];
      if (!isRecord(item)) continue;
      for (const key of Object.keys(item)) {
        if (results.length >= MAX_FIELDS) break;
        if (DENY_FIELD_NAMES.has(key)) continue;
        if (typeof item[key] === "string") {
          const val = item[key].slice(0, MAX_FIELD_CHARS);
          if (val.trim()) results.push({ path: `[${i}].${key}`, value: val });
        }
      }
    }
    return results;
  }

  return [];
}
