import https from "https";
import { app } from "electron";
import type { IncomingHttpHeaders } from "http";
import { getApiKey } from "./secureStore";
import { logError, setLastApiError } from "./logger";
import { validateVeniceIpcRequest, type VeniceIpcRequest } from "../ipc/validation";

const VENICE_HOST = "api.venice.ai";
const VENICE_BASE_PATH = "/api/v1";
const activeRequests = new Map<string, { destroy: () => void }>();

export interface VeniceIpcResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  contentType: string;
}

function sanitizeHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (/authorization|cookie|set-cookie/i.test(key)) continue;
    if (Array.isArray(value)) result[key] = value.join(", ");
    else if (typeof value === "string") result[key] = value;
  }
  return result;
}

function parseBody(buffer: Buffer, contentType: string): unknown {
  const text = buffer.toString("utf-8");
  if (contentType.includes("application/json")) {
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return { text: "Venice returned malformed JSON." };
    }
  }
  if (contentType.startsWith("text/") || contentType.includes("event-stream")) return text;
  return { dataBase64: buffer.toString("base64") };
}

function extractStreamDelta(data: string): string {
  try {
    const json = JSON.parse(data);
    return (
      json?.choices?.[0]?.delta?.content ||
      json?.choices?.[0]?.message?.content ||
      json?.choices?.[0]?.text ||
      ""
    );
  } catch {
    return "";
  }
}

function parseSseLines(buffer: string, onDelta: (delta: string) => void): { buffer: string; text: string } {
  const lines = buffer.split(/\r?\n/);
  const tail = lines.pop() || "";
  let text = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.replace(/^data:\s*/, "");
    if (!data || data === "[DONE]") continue;
    const delta = extractStreamDelta(data);
    if (delta) {
      text += delta;
      onDelta(delta);
    }
  }
  return { buffer: tail, text };
}

export function abortVeniceRequest(signalId: string): { ok: boolean } {
  const active = activeRequests.get(signalId);
  if (!active) return { ok: false };
  active.destroy();
  activeRequests.delete(signalId);
  return { ok: true };
}

export async function performVeniceRequest(
  rawRequest: unknown,
  options: { onDelta?: (delta: string) => void } = {}
): Promise<VeniceIpcResponse> {
  const request = validateVeniceIpcRequest(rawRequest);
  const apiKey = getApiKey();
  if (!apiKey) {
    return {
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      headers: {},
      body: { error: "Venice API key is not configured. Add it in Settings." },
      contentType: "application/json",
    };
  }

  return new Promise<VeniceIpcResponse>((resolve, reject) => {
    const bodyText = request.body === undefined ? undefined : JSON.stringify(request.body);
    const path = `${VENICE_BASE_PATH}${request.endpoint}`;
    const headers: Record<string, string | number> = {
      ...request.headers,
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": `VeniceForge/${app.getVersion()}`,
    };

    if (bodyText !== undefined) {
      headers["Content-Type"] = headers["Content-Type"] || "application/json";
      headers["Content-Length"] = Buffer.byteLength(bodyText);
    }

    const req = https.request(
      {
        hostname: VENICE_HOST,
        path,
        method: request.method,
        headers,
        timeout: 60_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        const responseHeaders = sanitizeHeaders(res.headers);
        const contentType = String(res.headers["content-type"] || "");
        let sseBuffer = "";
        let streamText = "";

        res.on("data", (chunk: Buffer) => {
          if (options.onDelta && contentType.includes("event-stream") && res.statusCode && res.statusCode < 400) {
            sseBuffer += chunk.toString("utf-8");
            const parsed = parseSseLines(sseBuffer, options.onDelta);
            sseBuffer = parsed.buffer;
            streamText += parsed.text;
          } else {
            chunks.push(chunk);
          }
        });

        res.on("end", () => {
          if (options.onDelta && sseBuffer) {
            const parsed = parseSseLines(`${sseBuffer}\n`, options.onDelta);
            streamText += parsed.text;
          }
          const buffer = Buffer.concat(chunks);
          const body =
            options.onDelta && contentType.includes("event-stream") && res.statusCode && res.statusCode < 400
              ? { text: streamText }
              : parseBody(buffer, contentType);
          resolve({
            ok: !!res.statusCode && res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode || 0,
            statusText: res.statusMessage || "",
            headers: responseHeaders,
            body,
            contentType,
          });
        });
      }
    );

    const cleanup = () => {
      if (request.signalId) activeRequests.delete(request.signalId);
    };

    if (request.signalId) {
      activeRequests.set(request.signalId, {
        destroy: () => req.destroy(new Error("Request aborted")),
      });
    }

    req.on("error", (err) => {
      cleanup();
      const message = err.message === "Request aborted" ? "Request aborted" : "Failed to reach Venice API.";
      if (message !== "Request aborted") {
        setLastApiError(message);
        logError("Venice API request failed", err);
      }
      reject(new Error(message));
    });
    req.on("timeout", () => {
      req.destroy(new Error("Connection timed out"));
    });
    req.on("close", cleanup);

    if (bodyText !== undefined) req.write(bodyText);
    req.end();
  }).then((response) => {
    if (!response.ok) setLastApiError(readResponseError(response));
    return response;
  });
}

export function readResponseError(response: VeniceIpcResponse): string {
  const body = response.body as any;
  return String(
    body?.error?.message ||
      body?.error ||
      body?.message ||
      body?.detail ||
      response.statusText ||
      `HTTP ${response.status}`
  );
}
