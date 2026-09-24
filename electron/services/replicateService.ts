/** @fileoverview Replicate prediction lifecycle service.
 *  Handles image (and future video) generation through Replicate's async
 *  prediction API, including creation, polling, cancellation, and output
 *  download. All secrets and network calls remain main-process-only.
 */

import { app } from "electron";
import { redactUrl, sanitizeErrorText } from "../../src/shared/redaction";
import { logError, logInfo } from "./logger";
import { readResponseBufferBounded, readResponseTextBounded } from "./boundedResponseReader";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";
export const OPERATION_TIMEOUT_MS = 30_000;
export const DOWNLOAD_TIMEOUT_MS = 60_000;
export const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_CONTROL_RESPONSE_BYTES = 1024 * 1024;
export const CONTROL_BODY_TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;

/** Hostnames that Replicate uses for signed output URLs. */
const ALLOWED_OUTPUT_HOSTS = new Set(["replicate.delivery"]);
const ALLOWED_OUTPUT_SUFFIX = ".replicate.delivery";

const ALLOWED_DOWNLOAD_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export type ReplicatePredictionStatus =
  | "starting"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled";

export interface ReplicatePrediction {
  id: string;
  status: ReplicatePredictionStatus;
  input: Record<string, unknown>;
  output?: unknown;
  error?: { detail?: string; message?: string } | string;
  logs?: string;
  urls?: {
    get?: string;
    cancel?: string;
    stream?: string;
  };
  created_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface ReplicateCreateRequest {
  model: string;
  input: Record<string, unknown>;
  webhook?: string;
  webhook_events_filter?: string[];
}

export type ReplicateResult =
  | { kind: "pending"; prediction: ReplicatePrediction }
  | { kind: "completed"; prediction: ReplicatePrediction; outputUrl: string }
  | { kind: "failed"; prediction: ReplicatePrediction; error: string }
  | { kind: "canceled"; prediction: ReplicatePrediction };

/** Returns a User-Agent string derived from the packaged app version. */
function getReplicateUserAgent(): string {
  try {
    const version = app.getVersion();
    if (typeof version === "string" && version.length > 0) {
      return `VeniceForge/${version}`;
    }
  } catch {
    // app may not be ready in some test/utility contexts.
  }
  return "VeniceForge/3.1.0";
}

function bearerHeader(apiToken: string): Record<string, string> {
  // Sanitize the token to prevent arbitrary file data injection in HTTP headers
  // (CodeQL js/file-access-to-http mitigation)
  if (typeof apiToken !== "string" || !/^[A-Za-z0-9_.=-]+$/.test(apiToken)) {
    throw new Error("Invalid Replicate API token format.");
  }
  return {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
    "User-Agent": getReplicateUserAgent(),
  };
}

/** Validates that a model identifier looks like a Replicate model/version.
 *  Reject paths, query strings, or hosts injected by a compromised renderer.
 */
export function validateReplicateModel(model: unknown): string {
  if (typeof model !== "string" || model.trim().length === 0) {
    throw new Error("Replicate model is required.");
  }
  const trimmed = model.trim();
  if (trimmed.length > 256) {
    throw new Error("Replicate model identifier is too long.");
  }
  // Accept owner/name or owner/name:version. Reject URL/path metacharacters.
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+(?::[a-zA-Z0-9_.-]+)?$/.test(trimmed)) {
    throw new Error("Replicate model identifier is invalid.");
  }
  return trimmed;
}

function parseModelParts(model: string): { owner: string; name: string; version?: string } {
  const [owner, rest] = model.split("/");
  const colonIndex = rest.indexOf(":");
  if (colonIndex === -1) {
    return { owner, name: rest };
  }
  return { owner, name: rest.slice(0, colonIndex), version: rest.slice(colonIndex + 1) };
}

function buildPredictionUrl(owner: string, name: string): string {
  return `${REPLICATE_API_BASE}/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/predictions`;
}

function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    return (
      err.name === "AbortError" ||
      err.message.toLowerCase().includes("abort") ||
      err.message.toLowerCase().includes("timeout")
    );
  }
  return false;
}

async function replicateFetch(
  apiToken: string,
  url: string,
  options: { method?: string; body?: string } = {},
  timeoutMs = OPERATION_TIMEOUT_MS,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const method = options.method ?? "GET";
  logInfo("Replicate API request", { method, url: redactUrl(url) });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: bearerHeader(apiToken),
      body: options.body,
      signal: controller.signal,
    });

    let body: unknown;
    const text = await readResponseTextBounded(response, {
      maxBytes: MAX_CONTROL_RESPONSE_BYTES,
      timeoutMs: CONTROL_BODY_TIMEOUT_MS,
      label: "Replicate control response",
      signal: controller.signal,
    }).catch(() => "");
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text };
    }

    return { ok: response.ok, status: response.status, body };
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error(`Replicate request timed out after ${timeoutMs}ms.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const record = body as Record<string, unknown>;
  if (record.detail && typeof record.detail === "string") return record.detail;
  if (record.error) {
    const err = record.error as Record<string, unknown> | string;
    if (typeof err === "string") return err;
    if (typeof err?.detail === "string") return err.detail;
    if (typeof err?.message === "string") return err.message;
  }
  if (typeof record.message === "string") return record.message;
  return fallback;
}

/** Creates a new Replicate prediction. */
export async function createReplicatePrediction(
  apiToken: string,
  request: ReplicateCreateRequest,
): Promise<ReplicatePrediction> {
  const model = validateReplicateModel(request.model);
  const { owner, name, version } = parseModelParts(model);
  const url = buildPredictionUrl(owner, name);
  const payload: Record<string, unknown> = { input: request.input };
  if (version) {
    payload.version = version;
  }
  if (typeof request.webhook === "string") payload.webhook = request.webhook;
  if (Array.isArray(request.webhook_events_filter)) {
    payload.webhook_events_filter = request.webhook_events_filter;
  }

  try {
    const response = await replicateFetch(apiToken, url, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const message = extractErrorMessage(response.body, "Replicate prediction creation failed.");
      throw new Error(message);
    }

    return response.body as ReplicatePrediction;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("timed out")) {
      throw new Error(
        "Replicate prediction creation timed out before acceptance was confirmed. Do not blindly retry; check your dashboard. [acceptance-unknown]",
      );
    }
    throw err;
  }
}

/** Retrieves the current state of a Replicate prediction. */
export async function getReplicatePrediction(
  apiToken: string,
  predictionId: string,
): Promise<ReplicatePrediction> {
  if (typeof predictionId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(predictionId)) {
    throw new Error("Invalid Replicate prediction ID.");
  }
  const url = `${REPLICATE_API_BASE}/predictions/${encodeURIComponent(predictionId)}`;
  const response = await replicateFetch(apiToken, url);
  if (!response.ok) {
    const message = extractErrorMessage(response.body, "Replicate prediction retrieval failed.");
    throw new Error(message);
  }
  return response.body as ReplicatePrediction;
}

/** Cancels a running Replicate prediction if possible. */
export async function cancelReplicatePrediction(
  apiToken: string,
  predictionId: string,
): Promise<ReplicatePrediction> {
  if (typeof predictionId !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(predictionId)) {
    throw new Error("Invalid Replicate prediction ID.");
  }
  const url = `${REPLICATE_API_BASE}/predictions/${encodeURIComponent(predictionId)}/cancel`;
  const response = await replicateFetch(apiToken, url, { method: "POST" });
  if (!response.ok && response.status !== 409) {
    // 409 means already terminal; treat as success.
    const message = extractErrorMessage(response.body, "Replicate prediction cancellation failed.");
    throw new Error(message);
  }
  return response.body as ReplicatePrediction;
}

function isPrivateOrLoopbackAddress(address: string): boolean {
  const lower = address.toLowerCase();
  if (lower === "localhost" || lower === "ip6-localhost" || lower === "ip6-loopback") {
    return true;
  }

  // IPv4 loopback, private, and link-local.
  const ipv4Match = lower.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map((n) => Number.parseInt(n, 10));
    if (octets.some((n) => n > 255)) return false;
    const [a, b] = octets;
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
  }

  // IPv6 loopback and private/local addresses.
  if (lower === "::1" || lower === "0:0:0:0:0:0:0:1") return true;
  if (lower.startsWith("fe80:") || lower.startsWith("fe90:") || lower.startsWith("fea0:") || lower.startsWith("feb0:")) {
    return true;
  }
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;

  return false;
}

/** Validates that a Replicate output URL is a trusted HTTPS URL.
 *  Rejects arbitrary hosts, private/link-local destinations, credentials,
 *  unexpected ports, and malformed URLs to mitigate SSRF.
 */
export function validateReplicateOutputUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Replicate output URL is malformed.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Replicate output URL must use HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Replicate output URL must not contain credentials.");
  }
  if (parsed.port && parsed.port !== "443") {
    throw new Error("Replicate output URL must use the default HTTPS port.");
  }

  // new URL preserves IPv6 brackets; strip them before address classification.
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (isPrivateOrLoopbackAddress(hostname)) {
    throw new Error("Replicate output URL must not point to a private or loopback address.");
  }

  const isAllowed =
    ALLOWED_OUTPUT_HOSTS.has(hostname) || hostname.endsWith(ALLOWED_OUTPUT_SUFFIX);
  if (!isAllowed) {
    throw new Error("Replicate output URL hostname is not trusted.");
  }
}

function validateMediaSignature(buffer: Buffer, mimeType: string): boolean {
  if (buffer.length === 0) return false;
  if (mimeType === "image/png") {
    return (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/webp") {
    if (buffer.length < 12) return false;
    const riff = buffer.slice(0, 4).toString("ascii") === "RIFF";
    const webp = buffer.slice(8, 12).toString("ascii") === "WEBP";
    return riff && webp;
  }
  if (mimeType === "image/gif") {
    if (buffer.length < 6) return false;
    const sig = buffer.slice(0, 6).toString("ascii");
    return sig === "GIF87a" || sig === "GIF89a";
  }
  return false;
}

/** Downloads a Replicate output URL into a Buffer.
 *  The URL is treated as an expiring signed URL and is never persisted.
 *  Redirects are followed manually and validated at every hop. Downloads are
 *  bounded by size and MIME type, and media signatures are verified.
 */
export async function downloadReplicateOutput(
  outputUrl: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  validateReplicateOutputUrl(outputUrl);

  let currentUrl = outputUrl;
  let redirects = 0;

  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
    try {
      const response = await fetch(currentUrl, {
        method: "GET",
        signal: controller.signal,
        redirect: "manual",
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error("Replicate output download redirect missing Location header.");
        }
        if (redirects >= MAX_REDIRECTS) {
          throw new Error("Replicate output download exceeded redirect limit.");
        }
        redirects++;
        const nextUrl = new URL(location, currentUrl).href;
        validateReplicateOutputUrl(nextUrl);
        currentUrl = nextUrl;
        continue;
      }

      if (!response.ok) {
        throw new Error(`Replicate output download failed: ${response.status} ${response.statusText}`);
      }

      const contentLengthHeader = response.headers.get("content-length");
      if (contentLengthHeader) {
        const contentLength = Number(contentLengthHeader);
        if (!Number.isFinite(contentLength) || contentLength > MAX_DOWNLOAD_BYTES) {
          throw new Error(
            `Replicate output exceeds maximum allowed size (${MAX_DOWNLOAD_BYTES} bytes).`,
          );
        }
      }

      const contentType = response.headers.get("content-type") || "application/octet-stream";
      const mimeType = contentType.split(";")[0].trim().toLowerCase();
      if (!ALLOWED_DOWNLOAD_MIME_TYPES.has(mimeType)) {
        throw new Error(`Replicate output MIME type ${mimeType} is not allowed.`);
      }

      const buffer = await readResponseBufferBounded(response, {
        maxBytes: MAX_DOWNLOAD_BYTES,
        timeoutMs: DOWNLOAD_TIMEOUT_MS,
        label: "Replicate output download",
        signal: controller.signal,
      });

      if (!validateMediaSignature(buffer, mimeType)) {
        throw new Error(`Replicate output failed ${mimeType} signature validation.`);
      }

      return { buffer, mimeType };
    } catch (err) {
      if (isAbortError(err)) {
        throw new Error(`Replicate output download timed out after ${DOWNLOAD_TIMEOUT_MS}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Picks a single image URL from heterogeneous Replicate model output.
 *  Supports arrays, objects with `url`, and plain strings.
 */
function pickOutputImageUrl(output: unknown): string | undefined {
  if (typeof output === "string") return output;
  if (Array.isArray(output)) {
    const first = output.find(
      (item) =>
        typeof item === "string" ||
        (item && typeof item === "object" && typeof (item as Record<string, unknown>).url === "string"),
    );
    if (typeof first === "string") return first;
    if (first && typeof first === "object") return String((first as Record<string, unknown>).url);
  }
  if (output && typeof output === "object") {
    const record = output as Record<string, unknown>;
    if (typeof record.url === "string") return record.url;
    if (Array.isArray(record.output)) return pickOutputImageUrl(record.output);
  }
  return undefined;
}

/** Polls a Replicate prediction and normalizes the result.
 *  Returns `pending` while starting/processing, `completed` with an output URL,
 *  `failed` with an error, or `canceled`.
 */
export async function pollReplicatePrediction(
  apiToken: string,
  predictionId: string,
): Promise<ReplicateResult> {
  const prediction = await getReplicatePrediction(apiToken, predictionId);
  const status = prediction.status;

  if (status === "succeeded") {
    const outputUrl = pickOutputImageUrl(prediction.output);
    if (!outputUrl) {
      return {
        kind: "failed",
        prediction,
        error: "Replicate prediction succeeded but returned no usable output URL.",
      };
    }
    return { kind: "completed", prediction, outputUrl };
  }

  if (status === "failed") {
    const error =
      typeof prediction.error === "string"
        ? prediction.error
        : prediction.error?.detail || prediction.error?.message || "Replicate prediction failed.";
    return { kind: "failed", prediction, error };
  }

  if (status === "canceled") {
    return { kind: "canceled", prediction };
  }

  return { kind: "pending", prediction };
}

/** Lightweight connectivity probe: lists a curated model.
 *  200 OK means the token is valid and the API is reachable.
 *  401/403 means the token is invalid.
 *  404 means the API is reachable and the token was accepted (model not found).
 *  Other non-success statuses are treated as failures.
 */
export async function testReplicateConnection(
  apiToken: string,
): Promise<{ ok: boolean; status: number; message: string }> {
  const url = `${REPLICATE_API_BASE}/models/black-forest-labs/flux-schnell`;
  try {
    const response = await replicateFetch(apiToken, url);
    if (response.ok) {
      return { ok: true, status: response.status, message: "Connection successful" };
    }
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: response.status, message: "Invalid Replicate API token." };
    }
    if (response.status === 404) {
      return {
        ok: true,
        status: response.status,
        message: "Reachable; token accepted (model listing returned 404).",
      };
    }
    return {
      ok: false,
      status: response.status,
      message: extractErrorMessage(response.body, `Replicate returned ${response.status}.`),
    };
  } catch (err) {
    logError("Replicate connection test failed", sanitizeErrorText(String(err)));
    return { ok: false, status: 0, message: sanitizeErrorText(String(err)) };
  }
}
