/** @fileoverview FormData serialization and request deduplication helpers. */

import { MIB, VENICE_MAX_RAW_UPLOAD_BYTES, VENICE_MAX_SERIALIZED_UPLOAD_BYTES } from "../../shared/limits";

/** Maximum raw upload file size accepted by the renderer. */
export const MAX_RAW_UPLOAD_BYTES = VENICE_MAX_RAW_UPLOAD_BYTES;

/** Maximum serialized upload size accepted over IPC. */
export const MAX_SERIALIZED_UPLOAD_BYTES = VENICE_MAX_SERIALIZED_UPLOAD_BYTES;

/** Serialized entry type for Form Data payload. */
export interface SerializedFormDataEntry {
  name: string;
  value: string;
  filename?: string;
  type?: string;
  _isFile?: boolean;
}

/** Serialized FormData type. */
export interface SerializedFormData {
  _isSerializedFormData: boolean;
  entries: SerializedFormDataEntry[];
}

const SECRET_KEY_RE = /api[-_ ]?key|authorization|token/i;

/**
 * Sanitizes a request body so it can be safely stringified for deduplication.
 * @param value The body value to sanitize.
 * @param seen WeakSet tracking visited objects to handle circular references.
 * @returns A serializable copy with secrets redacted.
 */
function sanitizeDedupeBody(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeDedupeBody(entry, seen));
  }

  if (value instanceof FormData || value instanceof Blob || value instanceof ArrayBuffer) {
    return "[BinaryBody]";
  }

  const clean: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    clean[key] = SECRET_KEY_RE.test(key) ? "[REDACTED_SECRET]" : sanitizeDedupeBody(entry, seen);
  }
  return clean;
}

/**
 * Generates a deduplication key from request parameters.
 * @param endpoint The API endpoint.
 * @param method The HTTP method.
 * @param body The request body.
 * @returns A string key suitable for deduplicating identical requests.
 */
export function dedupeKey(endpoint: string, method: string, body: unknown): string {
  let bodyHash = "";
  if (body !== undefined && body !== null) {
    try {
      bodyHash = JSON.stringify(sanitizeDedupeBody(body));
    } catch {
      // Circular or otherwise unserialisable body — skip deduplication
      bodyHash = `[unhashable-${Date.now()}-${Math.random()}]`;
    }
  }
  return `${method} ${endpoint} ${bodyHash}`;
}

/**
 * Serializes a FormData instance into a plain object safe for IPC.
 * @param formData The FormData to serialize.
 * @returns A promise resolving to the serialized representation.
 */
export async function serializeFormData(formData: FormData): Promise<SerializedFormData> {
  const entries: SerializedFormDataEntry[] = [];
  for (const [name, value] of formData.entries()) {
    if (value instanceof File) {
      const arrayBuffer = await value.arrayBuffer();
      const estimatedSerializedBytes = Math.ceil(arrayBuffer.byteLength * 4 / 3);
      if (arrayBuffer.byteLength > MAX_RAW_UPLOAD_BYTES) {
        throw new Error(`File too large. Maximum upload size is ${Math.floor(MAX_RAW_UPLOAD_BYTES / MIB)} MiB.`);
      }
      if (estimatedSerializedBytes > MAX_SERIALIZED_UPLOAD_BYTES) {
        throw new Error(`Serialized upload too large. Maximum raw upload size is ${Math.floor(MAX_RAW_UPLOAD_BYTES / MIB)} MiB.`);
      }
      const bytes = new Uint8Array(arrayBuffer);
      // 0x8000 (32 KiB) chunks avoid stack overflow when spreading large typed arrays.
      const chunkSize = 0x8000;
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      entries.push({
        name,
        value: btoa(binary),
        filename: value.name,
        type: value.type,
        _isFile: true,
      });
    } else if (typeof value === "object" && value !== null && (value as unknown) instanceof Blob) {
      const blob = value as Blob;
      const arrayBuffer = await blob.arrayBuffer();
      const estimatedSerializedBytes = Math.ceil(arrayBuffer.byteLength * 4 / 3);
      if (arrayBuffer.byteLength > MAX_RAW_UPLOAD_BYTES) {
        throw new Error(`File too large. Maximum upload size is ${Math.floor(MAX_RAW_UPLOAD_BYTES / MIB)} MiB.`);
      }
      if (estimatedSerializedBytes > MAX_SERIALIZED_UPLOAD_BYTES) {
        throw new Error(`Serialized upload too large. Maximum raw upload size is ${Math.floor(MAX_RAW_UPLOAD_BYTES / MIB)} MiB.`);
      }
      const bytes = new Uint8Array(arrayBuffer);
      const chunkSize = 0x8000;
      let binary = "";
      for (let i = 0; i < bytes.byteLength; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      entries.push({
        name,
        value: btoa(binary),
        filename: (blob as File).name || "blob",
        type: blob.type || "application/octet-stream",
        _isFile: true,
      });
    } else {
      entries.push({ name, value: String(value) });
    }
  }
  return { _isSerializedFormData: true, entries };
}
