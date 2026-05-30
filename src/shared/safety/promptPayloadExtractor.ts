/**
 * @fileoverview Extracts prompt-like text fields from Venice API request payloads.
 *
 * Handles JSON objects, JSON arrays, serialized FormData, plain strings, and
 * nested records. Returns an array of { path, value } pairs for safety assessment.
 * Never logs or returns the original payload contents.
 */

export interface ExtractedField {
  path: string;
  value: string;
}

/** Fields that contain user-controlled prompt content, by endpoint. */
const ENDPOINT_FIELDS: Record<string, readonly string[]> = {
  "/chat/completions": ["prompt", "system", "messages"],
  "/image/generate": ["prompt", "negative_prompt"],
  "/image/upscale": [],
  "/augment/search": ["query", "question"],
  "/augment/scrape": ["instructions", "url"],
  "/augment/text-parser": ["text", "content", "prompt", "query"],
};

/** Fields that should never be safety-checked (not user-controlled prompt content). */
const DENY_FIELD_NAMES = new Set<string>([
  "model", "width", "height", "steps", "cfg_scale", "seed", "format",
  "n", "response_format", "max_tokens", "temperature", "top_p", "stream",
  "stop", "presence_penalty", "frequency_penalty", "logit_bias", "user",
  "functions", "function_call", "tools", "tool_choice",
]);

/** Max characters per extracted field value to prevent excessive processing. */
const MAX_FIELD_CHARS = 8_000;

/** Max number of fields to extract per payload. */
const MAX_FIELDS = 32;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function safeStringify(v: unknown): string | null {
  if (typeof v === "string") return v.slice(0, MAX_FIELD_CHARS);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

/** Parses a serialized FormData structure `{ _isSerializedFormData: true, entries: [...] }`. */
function extractFromSerializedFormData(obj: Record<string, unknown>, fieldNames: readonly string[]): ExtractedField[] {
  const results: ExtractedField[] = [];
  const entries = obj["entries"];
  if (!Array.isArray(entries)) return results;
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    const key = entry["name"];
    const val = entry["value"];
    if (typeof key !== "string") continue;
    if (DENY_FIELD_NAMES.has(key)) continue;
    if (!fieldNames.includes("*") && !fieldNames.includes(key)) continue;
    const strVal = safeStringify(val);
    if (strVal && strVal.trim()) results.push({ path: `formData.${key}`, value: strVal });
  }
  return results;
}

/** Extracts from a plain JSON object for the given field names. */
function extractFromObject(
  obj: Record<string, unknown>,
  fieldNames: readonly string[],
  pathPrefix: string,
  depth: number
): ExtractedField[] {
  if (depth > 4) return [];
  const results: ExtractedField[] = [];

  // Handle serialized FormData
  if (obj["_isSerializedFormData"] === true) {
    return extractFromSerializedFormData(obj, fieldNames);
  }

  for (const [key, val] of Object.entries(obj)) {
    if (results.length >= MAX_FIELDS) break;
    if (DENY_FIELD_NAMES.has(key)) continue;
    const path = pathPrefix ? `${pathPrefix}.${key}` : key;

    // Chat messages array: messages[].content / messages[].role
    if (key === "messages" && Array.isArray(val)) {
      for (let i = 0; i < val.length && results.length < MAX_FIELDS; i++) {
        const msg = val[i];
        if (!isRecord(msg)) continue;
        if (typeof msg["content"] === "string") {
          const content = msg["content"].slice(0, MAX_FIELD_CHARS);
          if (content.trim()) results.push({ path: `${path}[${i}].content`, value: content });
        } else if (Array.isArray(msg["content"])) {
          // vision/multi-modal: content is array of {type, text|image_url}
          for (let j = 0; j < msg["content"].length && results.length < MAX_FIELDS; j++) {
            const part = msg["content"][j];
            if (isRecord(part) && typeof part["text"] === "string") {
              const t = part["text"].slice(0, MAX_FIELD_CHARS);
              if (t.trim()) results.push({ path: `${path}[${i}].content[${j}].text`, value: t });
            }
          }
        }
        if (typeof msg["name"] === "string" && msg["name"].trim()) {
          results.push({ path: `${path}[${i}].name`, value: msg["name"].slice(0, 200) });
        }
      }
      continue;
    }

    const strVal = safeStringify(val);
    if (strVal !== null) {
      if (!fieldNames.includes("*") && !fieldNames.includes(key)) continue;
      if (strVal.trim()) results.push({ path, value: strVal });
    } else if (isRecord(val) && (fieldNames.includes("*") || fieldNames.includes(key))) {
      const nested = extractFromObject(val, ["*"], path, depth + 1);
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
    const str = decoder.decode(buffer).slice(0, MAX_FIELD_CHARS * 4);
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
      // Strip boundary headers and MIME parts, keep only printable ASCII/UTF-8 words
      const stripped = raw.replace(/--[^\r\n]+[\r\n]+Content-[^\r\n]+[\r\n]*/g, " ").trim();
      if (stripped.length > 10) return [{ path: "body_raw", value: stripped.slice(0, MAX_FIELD_CHARS) }];
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
 * @returns Array of `{ path, value }` pairs. No field values are returned verbatim;
 *          they are truncated to MAX_FIELD_CHARS.
 */
export function extractPromptLikeFields(
  payload: unknown,
  endpoint?: string
): ExtractedField[] {
  if (!payload) return [];

  const normEndpoint = endpoint?.replace(/^\/api\/venice/, "") ?? "";
  const fieldNames: readonly string[] = (() => {
    for (const [key, fields] of Object.entries(ENDPOINT_FIELDS)) {
      if (normEndpoint.startsWith(key)) return fields;
    }
    // Unknown endpoint — check common prompt-ish field names
    return ["prompt", "query", "text", "content", "instruction", "message", "input", "messages", "question"];
  })();

  // Buffer / Uint8Array (used in Express middleware)
  if (payload instanceof Uint8Array) {
    return extractFromBuffer(payload, fieldNames);
  }

  // Plain string
  if (typeof payload === "string") {
    const trimmed = payload.slice(0, MAX_FIELD_CHARS).trim();
    if (!trimmed) return [];
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
    return extractFromObject(payload, fieldNames, "", 0);
  }

  // Array of message objects (some callers pass this directly)
  if (Array.isArray(payload)) {
    const results: ExtractedField[] = [];
    for (let i = 0; i < payload.length && results.length < MAX_FIELDS; i++) {
      const item = payload[i];
      if (!isRecord(item)) continue;
      if (typeof item["content"] === "string") {
        results.push({ path: `[${i}].content`, value: item["content"].slice(0, MAX_FIELD_CHARS) });
      }
      if (typeof item["prompt"] === "string") {
        results.push({ path: `[${i}].prompt`, value: item["prompt"].slice(0, MAX_FIELD_CHARS) });
      }
    }
    return results;
  }

  return [];
}
