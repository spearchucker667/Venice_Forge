// Code Owner: fayeblade (@spearchucker667)
// Express web proxy and Vite dev-server bootstrap.
import express from "express";
import fs from "fs";
import path from "path";
import type * as http from "node:http";
import dns from "node:dns/promises";
import nodeHttp from "node:http";
import nodeHttps from "node:https";
import { randomBytes } from "node:crypto";

import dotenv from "dotenv";
import { createProxyMiddleware } from "http-proxy-middleware";
import {
  ALLOWED_VENICE_ENDPOINTS,
  ALLOWED_VENICE_METHODS,
  VeniceIpcMethod,
  isAllowedCharactersRequest,
  isAllowedVeniceRequest,
  isAllowedApiKeysRequest,
  isAllowedX402Endpoint,
  isAllowedX402Request,
  isAllowedCryptoRpcEndpoint,
  isAllowedCryptoRpcRequest,
} from "./src/shared/validation";
import { VENICE_API_HOST, VENICE_API_BASE_PATH } from "./src/shared/apiConfig";
import {
  DEFAULT_PRIMARY_API_ROUTE,
  isPrimaryApiRouteId,
  PRIMARY_API_ROUTE_BASE_PATHS,
  PRIMARY_API_ROUTE_HOSTS,
  resolvePrimaryApiRoute as resolveSharedPrimaryApiRoute,
  type PrimaryApiRouteId,
} from "./src/shared/primaryApiRoute";
import { AppConfig } from "./src/shared/configSchema";
import { warn, error } from "./src/shared/logger";
import {
  maybeRunLocalFamilyGuard,
  isImageSafetyEndpoint,
  isOpenAiImageGenerationEndpoint,
  identifyAndValidateGeneratedMedia,
  identifyAndValidateOpenAiImageGenerationResponse,
  recordDecision,
  safetyBlockBodyFromResponseScreen,
  screenResponseBody,
} from "./src/shared/safety";
import type { SafetyGuardDecision } from "./src/shared/safety";
import {
  extractSafetyProvenance,
} from "./src/shared/safety/promptSegments";
import {
  serializeSafetyProvenanceIntoPayload,
} from "./src/services/ingestion/xmlEscape";
import { pathToFileURL, fileURLToPath } from "node:url";
import { isPrivateHostname } from "./src/shared/urlSecurity";
import { createReadStream } from "node:fs";
import { open as fsOpen } from "node:fs/promises";
import { JINA_MAX_RESPONSE_BYTES, VENICE_PROXY_MAX_FSM_RESPONSE_BYTES, VENICE_PROXY_MAX_FSM_SSE_EVENT_BYTES, FSM_MEDIA_STRUCTURAL_PREFIX_BYTES, FSM_MEDIA_MAX_DEFAULT_BYTES } from "./src/shared/limits";
import {
  collectFsmMediaResponse,
  resolveFsmMediaCapBytes,
  type FsmMediaArtifact,
  type FsmMediaBlockResult,
  type FsmMediaScreenResult,
} from "./src/services/fsmMediaCollector";
import { SafetyGatedSse } from "./src/services/safetyGatedSse";
import { startSafetyGatedSsePump } from "./src/services/safetyGatedSsePump";
import {
  extractResponsesBodyScreenText,
  extractResponsesEventScreenText,
} from "./src/shared/veniceResponses";

import { FetchBodyTooLargeError, parseJsonOrNull, readBoundedFetchBody } from "./src/shared/readBoundedFetchBody";
import { checkSystemPromptMessages } from "./src/shared/promptLimits";

function invalidFsmImageEnvelopeBlock(): FsmMediaBlockResult {
  return {
    allowed: false,
    blockBody: {
      error: "Generated image response could not be screened. Blocked under Family Safe Mode.",
      reasonCode: "INVALID_MEDIA",
      category: "HARM_CATEGORY_DANGEROUS_CONTENT",
      severity: "HIGH",
    },
  };
}

function safeDecodeForScreening(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

const SCRAPE_ALLOWED_CONTENT_TYPES = ["text/html", "text/plain", "application/xhtml+xml", "application/json"] as const;

/** Sanitizes an upstream Content-Type so the raw scrape proxy never reflects
 *  arbitrary parameters or header-injection payloads. Only the base media type
 *  is honoured, and only a safe UTF-8 charset parameter is preserved. */
function sanitizeScrapeContentTypeHeader(contentType: string): string | null {
  const base = String(contentType).split(";")[0].trim().toLowerCase();
  if (!SCRAPE_ALLOWED_CONTENT_TYPES.includes(base as typeof SCRAPE_ALLOWED_CONTENT_TYPES[number])) {
    return null;
  }
  const charsetMatch = /charset=([a-zA-Z0-9_-]+)/i.exec(contentType);
  const charset = charsetMatch && charsetMatch[1].toLowerCase() === "utf-8" ? "; charset=utf-8" : "";
  return `${base}${charset}`;
}

function isLoopbackClient(req: express.Request): boolean {
  const address = req.socket.remoteAddress ?? "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

dotenv.config();

/** AUDIT-026: surface or auto-tighten a local credential file with overly
 *  permissive mode bits while a real Venice/Jina key is loaded. Implementation
 *  lives in `src/services/envPermissionsService.ts` so it is unit-testable
 *  in isolation. */
import { checkLocalEnvFilePermissionsOnce } from "./src/services/envPermissionsService";
checkLocalEnvFilePermissionsOnce();

/** Determines whether Local Family Safe Mode is enabled in the web proxy.
 *
 * Priority:
 *   1. Server-side env variable `VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED`
 *      is the authoritative override when set. It fully ignores the renderer
 *      header, preventing a malicious client from bypassing the safety
 *      guard by sending `X-Venice-Forge-Family-Safe-Mode: false`.
 *   2. When the server env is unset, the proxy defaults to ON for safety
 *      (defence in depth — never trust a missing-config fallback that
 *      disables screening).
 *   3. The renderer header is ONLY honoured when the dev-only opt-in
 *      `VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE=true` is set. Production
 *      and CI should never set that flag; the test suite sets it for the
 *      specific tests that need to exercise the header path.
 *
 * Behavioural matrix (server.ts unit-tested in `server.test.ts`):
 *   - no env + no header + no override         => enabled (safe default)
 *   - no env + header false + no override      => enabled (header ignored)
 *   - no env + header false + override=true    => disabled (dev only)
 *   - no env + header true  + override=true    => enabled
 *   - env=true  + header false + no override   => enabled (env wins)
 *   - env=false + header true  + no override   => disabled (env wins)
 */
function isLocalFamilySafeModeEnabled(req: express.Request): boolean {
  const envOverride = process.env.VENICE_FORGE_LOCAL_FAMILY_SAFE_MODE_ENABLED;
  if (envOverride !== undefined) {
    return envOverride !== "false" && envOverride !== "0";
  }

  const allowClientOverride =
    process.env.VENICE_FORGE_ALLOW_CLIENT_SAFETY_OVERRIDE === "true";
  if (!allowClientOverride) return true;

  const headerValue = req.get("X-Venice-Forge-Family-Safe-Mode");
  if (headerValue === undefined) return true;
  return headerValue !== "false";
}

/** Returns the directory of the current module, working in both ESM source
 *  and CJS bundled output (where import.meta.url is not available). */
function getModuleDir(): string {
  try {
    // esbuild's CommonJS output runs inside Node's module wrapper, where the
    // lexical __dirname points at dist/. It is not exposed on globalThis.
    if (typeof __dirname === "string") return __dirname;
  } catch { /* ignore */ }
  try {
    return path.dirname(fileURLToPath(new URL(import.meta.url)));
  } catch {
    return process.cwd();
  }
}

type VeniceProxyRequest = {
  method?: string;
  body?: Buffer;
};

type VeniceProxyOutboundRequest = {
  removeHeader(name: string): void;
  setHeader(name: string, value: string | number): void;
  write(chunk: Buffer): void;
};

const FORBIDDEN_RENDERER_PROXY_HEADERS = ["Authorization", "Cookie", "Host"] as const;

/**
 * Server-side authoritative primary API route. The web proxy has no notion
 * of per-user profiles, so the route selection is driven by the
 * `VENICE_FORGE_PRIMARY_API_ROUTE` env var (default: `"venice"`). Unknown
 * or malformed values fall back to the canonical Venice host.
 *
 * The renderer NEVER influences this value through the proxy path; the
 * desktop app keeps its own per-profile selection via `providerSettings`.
 */
function resolveServerPrimaryApiRoute(): PrimaryApiRouteId {
  const raw = process.env.VENICE_FORGE_PRIMARY_API_ROUTE;
  return isPrimaryApiRouteId(raw) ? raw : DEFAULT_PRIMARY_API_ROUTE;
}

export function applyVeniceProxyHeaders(
  proxyReq: VeniceProxyOutboundRequest,
  req: VeniceProxyRequest,
  apiKey = AppConfig.VENICE_API_KEY,
  upstreamHost = VENICE_API_HOST,
) {
  for (const header of FORBIDDEN_RENDERER_PROXY_HEADERS) {
    proxyReq.removeHeader(header);
  }

  if (apiKey) {
    proxyReq.setHeader("Authorization", `Bearer ${apiKey}`);
  }
  proxyReq.setHeader("Host", upstreamHost);

  if (req.method !== "GET" && req.body) {
    if (!Buffer.isBuffer(req.body)) {
      return;
    }
    proxyReq.removeHeader("Transfer-Encoding");
    // Use Buffer.byteLength instead of .length to prevent CodeQL type confusion false positive
    proxyReq.setHeader("Content-Length", Buffer.byteLength(req.body));
    proxyReq.write(req.body);
  } else if (req.method === "GET") {
    proxyReq.removeHeader("Content-Length");
    proxyReq.removeHeader("Transfer-Encoding");
  }
}

const FSM_MEDIA_TOO_LARGE_JSON = JSON.stringify({
  error: "Upstream response too large to screen under Family Safe Mode.",
});

function copyProxyResponseHeaders(proxyRes: http.IncomingMessage, res: express.Response): void {
  if (proxyRes.statusCode) res.statusCode = proxyRes.statusCode;
  if (proxyRes.statusMessage) res.statusMessage = proxyRes.statusMessage;
  for (const [key, value] of Object.entries(proxyRes.headers)) {
    if (value === undefined) continue;
    const lower = key.toLowerCase();
    if (lower === "content-encoding" || lower === "transfer-encoding" || lower === "trailer") continue;
    res.setHeader(key, value);
  }
}

const DEV_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DevSessionKey {
  key: string;
  expiresAt: number;
}

function createDevSessionKey(key: string): DevSessionKey {
  return { key, expiresAt: Date.now() + DEV_SESSION_TTL_MS };
}

function getDevSessionKey(session: DevSessionKey | null): string {
  if (!session || Date.now() > session.expiresAt) return "";
  return session.key;
}

function isDevSessionConfigured(session: DevSessionKey | null): boolean {
  return getDevSessionKey(session).length > 0;
}

export function createServerApp() {
  const app = express();
  let devSessionVeniceApiKey: DevSessionKey | null = null;
  let devSessionJinaApiKey: DevSessionKey | null = null;

  // Zero session keys on server shutdown to avoid leaving them in memory.
  const cleanupDevSessionKeys = () => {
    devSessionVeniceApiKey = null;
    devSessionJinaApiKey = null;
  };
  process.on("exit", cleanupDevSessionKeys);
  process.on("SIGINT", cleanupDevSessionKeys);
  process.on("SIGTERM", cleanupDevSessionKeys);
  let processListenersRemoved = false;
  const cleanupProcessListeners = () => {
    if (processListenersRemoved) return;
    process.off("exit", cleanupDevSessionKeys);
    process.off("SIGINT", cleanupDevSessionKeys);
    process.off("SIGTERM", cleanupDevSessionKeys);
    processListenersRemoved = true;
  };
  app.disable("x-powered-by");

  // Structured request logging (no bodies, no secrets) in development/test only.
  if (AppConfig.NODE_ENV !== "production") {
    app.use((req, res, next) => {
      const start = Date.now();
      res.on("finish", () => {
        const duration = Date.now() - start;
        warn(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
      });
      next();
    });
  }

  // Health check endpoint (does not proxy to Venice)
  const appVersion = (() => {
    const moduleDir = getModuleDir();
    const paths = [
      path.join(moduleDir, "package.json"),
      path.join(moduleDir, "..", "package.json")
    ];
    for (const p of paths) {
      try {
        if (fs.existsSync(p)) {
          return JSON.parse(fs.readFileSync(p, "utf-8")).version;
        }
      } catch {
        // ignore and try next
      }
    }
    return "unknown";
  })();

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", version: appVersion });
  });

  app.get("/api/runtime-config", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ primaryApiRoute: resolveServerPrimaryApiRoute() });
  });

  // UIAUTH-001: browser development may use a process-memory-only Venice key.
  // Production never exposes this endpoint, and general proxy requests still
  // discard renderer-controlled Authorization headers below.
  app.all("/api/session-key", express.json({ limit: "2kb" }), (req, res) => {
    if (AppConfig.NODE_ENV === "production") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!isLoopbackClient(req)) {
      res.status(403).json({ error: "Local development access only." });
      return;
    }

    if (req.method === "GET") {
      res.status(200).json({ configured: isDevSessionConfigured(devSessionVeniceApiKey) });
      return;
    }
    if (req.method === "DELETE") {
      devSessionVeniceApiKey = null;
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method === "POST") {
      const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
      if (!key) {
        res.status(400).json({ error: "An API key is required. Provide it as the \"key\" field in the JSON body." });
        return;
      }
      if (key.length > 512) {
        res.status(400).json({ error: "API key is too long (max 512 characters)." });
        return;
      }
      devSessionVeniceApiKey = createDevSessionKey(key);
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: "Method not allowed" });
  });

  app.all("/api/session-jina-key", express.json({ limit: "2kb" }), (req, res) => {
    if (AppConfig.NODE_ENV === "production") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (!isLoopbackClient(req)) {
      res.status(403).json({ error: "Local development access only." });
      return;
    }

    if (req.method === "GET") {
      res.status(200).json({ configured: isDevSessionConfigured(devSessionJinaApiKey) || Boolean(AppConfig.JINA_API_KEY) });
      return;
    }
    if (req.method === "DELETE") {
      devSessionJinaApiKey = null;
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method === "POST") {
      const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
      if (!key) {
        res.status(400).json({ error: "A Jina API key is required. Provide it as the \"key\" field in the JSON body." });
        return;
      }
      if (key.length > 512) {
        res.status(400).json({ error: "Jina API key is too long (max 512 characters)." });
        return;
      }
      devSessionJinaApiKey = createDevSessionKey(key);
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: "Method not allowed" });
  });

  // Trust proxy only when explicitly configured via TRUST_PROXY env var,
  // to prevent IP spoofing when the server is accessed directly without a trusted reverse proxy.
  if (AppConfig.TRUST_PROXY) {
    app.set("trust proxy", AppConfig.TRUST_PROXY);
  }

  // Security headers for all responses — including per-request CSP nonce.
  //
  // CSP-NONCE: A fresh 16-byte base64 nonce is generated for every request
  // and injected into `script-src` via `'nonce-<value>' 'strict-dynamic'`.
  // The same nonce is stored on `res.locals.cspNonce` so the index.html
  // catch-all route can inject `nonce="<value>"` onto every <script> tag
  // before sending the HTML. This ensures the nonce in the HTTP header
  // and the nonce in the HTML are always in sync for each page load.
  app.use((_req, res, next) => {
    const isProduction = AppConfig.NODE_ENV === "production";
    // Generate a cryptographically random 16-byte base64 nonce per request.
    const nonce = randomBytes(16).toString("base64");
    // Expose the nonce so downstream route handlers can inject it into HTML.
    res.locals.cspNonce = nonce;
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    // In non-production environments Vite HMR uses WebSocket connections, so we
    // widen connect-src to include ws: / wss:. In production only 'self' is allowed.
    const connectSrc = isProduction ? "connect-src 'self'" : "connect-src 'self' ws: wss:";
    const styleSrc = isProduction ? "style-src 'self'" : "style-src 'self' 'unsafe-inline'";
    // In production, scripts must carry the per-request nonce. 'strict-dynamic'
    // propagates trust from nonced scripts to their dynamic imports.
    const scriptSrc = isProduction
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
    const workerSrc = isProduction
      ? "worker-src 'self' blob:"
      : "worker-src 'self' blob: http://localhost:5173";
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        scriptSrc,
        styleSrc,
        "img-src 'self' data: blob:",
        connectSrc,
        "font-src 'self' data:",
        "media-src 'self' blob:",
        workerSrc,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join("; ")
    );
    next();
  });


  // Shared Rate Limiting Factory
  const rateLimitWindowMs = AppConfig.RATE_LIMIT_WINDOW_MS;
  const rateLimitMax = AppConfig.RATE_LIMIT_MAX_REQUESTS;
  const MAX_RATE_LIMIT_ENTRIES = 10_000;

  function createRateLimiter(label: string): express.RequestHandler {
    const reqCounts = new Map<string, { count: number; resetTime: number; lastSeen: number }>();

    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [ip, record] of reqCounts.entries()) {
        if (now > record.resetTime) {
          reqCounts.delete(ip);
        }
      }
    }, Math.max(10000, rateLimitWindowMs)).unref();

    // Expose cleanup on the returned function so tests can clean up.
    (createRateLimiter as unknown as Record<string, unknown>)[`_${label}Cleanup`] = cleanupInterval;

    return (req, res, next) => {
      // When TRUST_PROXY is enabled, include the socket address in the key to
      // prevent X-Forwarded-For spoofing from bypassing rate limits. Behind a
      // legitimate proxy this produces keys like "proxyIP|clientIP".
      const forwarded = req.headers["x-forwarded-for"];
      const ip = forwarded && AppConfig.TRUST_PROXY
        ? `${req.socket?.remoteAddress || "unknown"}|${req.ip || "unknown"}`
        : (req.ip || req.socket?.remoteAddress || "unknown");
      const now = Date.now();
      const record = reqCounts.get(ip) || { count: 0, resetTime: now + rateLimitWindowMs, lastSeen: now };

      if (now > record.resetTime) {
        record.count = 1;
        record.resetTime = now + rateLimitWindowMs;
      } else {
        record.count++;
      }

      record.lastSeen = now;
      reqCounts.set(ip, record);

      if (record.count > rateLimitMax) {
        return res.status(429).json({ error: "Too many requests, please try again later." });
      }
      if (reqCounts.size > MAX_RATE_LIMIT_ENTRIES) {
        let oldestKey: string | undefined;
        let oldestTime = Infinity;
        for (const [key, value] of reqCounts.entries()) {
          if (value.lastSeen < oldestTime) {
            oldestTime = value.lastSeen;
            oldestKey = key;
          }
        }
        if (oldestKey !== undefined) {
          reqCounts.delete(oldestKey);
        }
      }
      next();
    };
  }

  const veniceRateLimiter = createRateLimiter("venice");
  const proxyRateLimiter = createRateLimiter("proxy");

  // Apply shared rate limiting to Jina and scrape proxies.
  app.use("/api/proxy-jina", proxyRateLimiter);
  app.use("/api/proxy-scrape", proxyRateLimiter);

  // Rate-limit Venice requests before any validation so every request counts
  // toward the limit (matches the original wiring where the rate limiter was
  // attached to the first /api/venice middleware).
  app.use("/api/venice", (req, _res, next) => {
    next();
  });
  app.use("/api/venice", veniceRateLimiter);

  const MAX_PROXY_BODY_BYTES = AppConfig.MAX_PROXY_BODY_BYTES;

  // Circuit Breaker State
  let circuitFailures = 0;
  let circuitOpenUntil = 0;
  let circuitHalfOpen = false;
  const CIRCUIT_MAX_FAILURES = 5;
  const CIRCUIT_RESET_TIMEOUT_MS = 30000;

  const applyCircuitFromStatus = (statusCode?: number): void => {
    if (statusCode && statusCode >= 500) {
      circuitFailures++;
      if (circuitFailures >= CIRCUIT_MAX_FAILURES || circuitHalfOpen) {
        error(`[Circuit Breaker] Tripped! Opening for ${CIRCUIT_RESET_TIMEOUT_MS}ms`);
        circuitOpenUntil = Date.now() + CIRCUIT_RESET_TIMEOUT_MS;
        circuitHalfOpen = false;
      }
    } else if (statusCode && statusCode >= 200 && statusCode < 300) {
      circuitFailures = 0;
      circuitHalfOpen = false;
    } else if (statusCode) {
      circuitHalfOpen = false;
    }
  };

  const applyRetryAfterHeaders = (proxyRes: http.IncomingMessage, proxyResRes: express.Response): void => {
    const retryAfter = proxyRes.headers["retry-after"];
    if (retryAfter) proxyResRes.setHeader("Retry-After", retryAfter);
    const rlReset = proxyRes.headers["x-ratelimit-reset-requests"];
    if (rlReset) proxyResRes.setHeader("X-RateLimit-Reset-Requests", rlReset);
  };

  const writeGenericProxyError = (err: Error, _errReq: express.Request, errRes: express.Response | import("net").Socket): void => {
    error("Proxy error:", err.message);
    circuitFailures++;
    if (circuitFailures >= CIRCUIT_MAX_FAILURES || circuitHalfOpen) {
      error(`[Circuit Breaker] Tripped (Network Error)! Opening for ${CIRCUIT_RESET_TIMEOUT_MS}ms`);
      circuitOpenUntil = Date.now() + CIRCUIT_RESET_TIMEOUT_MS;
      circuitHalfOpen = false;
    }
    if ("headersSent" in errRes && !(errRes as express.Response).headersSent) {
      (errRes as express.Response).writeHead(502, { "Content-Type": "application/json" });
      (errRes as express.Response).end(JSON.stringify({ error: "Proxy error" }));
    }
  };

  const applyVeniceProxyReq = (proxyReq: VeniceProxyOutboundRequest, proxyReqReq: express.Request): void => {
    applyVeniceProxyHeaders(
      proxyReq,
      proxyReqReq as VeniceProxyRequest,
      getDevSessionKey(devSessionVeniceApiKey) || AppConfig.VENICE_API_KEY,
      VENICE_API_HOST,
    );
  };

/**
 * Proxy-request hook for the Fraterna upstream. Same body shaping rules as
 * the Venice hook — the only difference is the `Host` header so the
 * upstream TLS SNI matches the canonical Fraterna host (`fraterna.ai`).
 */
const applyFraternaProxyReq = (proxyReq: VeniceProxyOutboundRequest, proxyReqReq: express.Request): void => {
    applyVeniceProxyHeaders(
      proxyReq,
      proxyReqReq as VeniceProxyRequest,
      getDevSessionKey(devSessionVeniceApiKey) || AppConfig.VENICE_API_KEY,
      PRIMARY_API_ROUTE_HOSTS.fraterna,
    );
  };

  const standardProxyRes = (
    proxyRes: http.IncomingMessage,
    _req: express.Request,
    res: express.Response,
  ): void => {
    applyRetryAfterHeaders(proxyRes, res);
    applyCircuitFromStatus(proxyRes.statusCode);
  };

  /** Screens a fully-held media buffer (memory artifact or bounded file
   *  read). Size enforcement lives in the collector — this only classifies. */
  const screenFsmMediaBuffer = async (
    buffer: Buffer,
    contentType: string,
    statusOk: boolean,
    isOpenAiImageGeneration = false,
  ): Promise<FsmMediaScreenResult | FsmMediaBlockResult> => {
    if (statusOk && isOpenAiImageGeneration) {
      if (contentType.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
        return invalidFsmImageEnvelopeBlock();
      }
      try {
        const parsed: unknown = JSON.parse(buffer.toString("utf8"));
        const screened = await identifyAndValidateOpenAiImageGenerationResponse(parsed);
        if (screened.allowed) return { allowed: true };
        return {
          allowed: false,
          blockBody: {
            error: screened.userMessage || "Generated image response could not be screened.",
            reasonCode: screened.reasonCode,
            category: screened.category,
            severity: "HIGH",
          },
        };
      } catch {
        return invalidFsmImageEnvelopeBlock();
      }
    }

    const normalizedContentType = contentType.toLowerCase();
    if (statusOk && normalizedContentType.includes("application/json")) {
      try {
        const parsedValue: unknown = JSON.parse(buffer.toString("utf8"));
        const parsed =
          typeof parsedValue === "object" && parsedValue !== null && !Array.isArray(parsedValue)
            ? parsedValue as Record<string, unknown>
            : null;

        if (parsed) {
          const mediaFields: unknown[] = [
            ...["dataBase64", "image", "images", "dataUrl", "audio", "video"].map((key) => parsed[key]),
          ];
          for (const val of mediaFields) {
            if (val === undefined || val === null) continue;
            const items = Array.isArray(val) ? val : [val];
            for (const item of items) {
              let mediaCandidate = "";
              if (typeof item === "string" && item.length > 0) mediaCandidate = item;
              else if (typeof item === "object" && item !== null && typeof (item as { b64_json?: string }).b64_json === "string") {
                mediaCandidate = (item as { b64_json: string }).b64_json;
              } else if (typeof item === "object" && item !== null && typeof (item as { url?: string }).url === "string") {
                mediaCandidate = (item as { url: string }).url;
              }
              if (mediaCandidate) {
                const mediaScreen = await identifyAndValidateGeneratedMedia(mediaCandidate, "application/octet-stream", true);
                if (!mediaScreen.allowed) {
                  return {
                    allowed: false,
                    blockBody: {
                      error: mediaScreen.userMessage || "Media blocked by safety filter",
                      reasonCode: mediaScreen.reasonCode,
                      category: mediaScreen.category,
                      severity: "HIGH",
                    },
                  };
                }
              }
            }
          }
        }
      } catch {
        return {
          allowed: false,
          blockBody: {
            error: "Media response could not be screened. Blocked under Family Safe Mode.",
            reasonCode: "CLASSIFIER_UNAVAILABLE",
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            severity: "HIGH",
          },
        };
      }
    } else if (
      statusOk &&
      (normalizedContentType.startsWith("video/") || normalizedContentType.startsWith("audio/") || normalizedContentType.startsWith("image/"))
    ) {
      const mediaScreen = await identifyAndValidateGeneratedMedia(buffer, contentType, true);
      if (!mediaScreen.allowed) {
        return {
          allowed: false,
          blockBody: {
            error: mediaScreen.userMessage || "Media blocked by safety filter",
            reasonCode: mediaScreen.reasonCode,
            category: mediaScreen.category,
            severity: "HIGH",
          },
        };
      }
    }
    return { allowed: true };
  };

  /** Screens a collected artifact. Spooled files are read in bounded slices:
   *  audio/video structural screening needs only a prefix; images and JSON
   *  envelopes need the full artifact (bounded by the modality cap). */
  const screenFsmMediaArtifact = async (
    artifact: FsmMediaArtifact,
    contentType: string,
    statusOk: boolean,
    isOpenAiImageGeneration = false,
  ): Promise<FsmMediaScreenResult | FsmMediaBlockResult> => {
    try {
      if (artifact.kind === "memory") {
        return await screenFsmMediaBuffer(artifact.buffer, contentType, statusOk, isOpenAiImageGeneration);
      }
      const sizeBytes = artifact.sizeBytes;
      const isAudioOrVideo =
        contentType.startsWith("video/") || contentType.startsWith("audio/");
      const readBytes = isAudioOrVideo
        ? Math.min(sizeBytes, FSM_MEDIA_STRUCTURAL_PREFIX_BYTES)
        : sizeBytes;
      const handle = await fsOpen(artifact.filePath, "r");
      try {
        const buffer = Buffer.alloc(readBytes);
        await handle.read(buffer, 0, readBytes, 0);
        return await screenFsmMediaBuffer(buffer, contentType, statusOk, isOpenAiImageGeneration);
      } finally {
        await handle.close();
      }
    } catch {
      return {
        allowed: false,
        blockBody: {
          error: "Media response could not be screened. Blocked under Family Safe Mode.",
          reasonCode: "CLASSIFIER_UNAVAILABLE",
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          severity: "HIGH",
        },
      };
    }
  };

  const fsmMediaProxyRes = (
    proxyRes: http.IncomingMessage,
    req: express.Request,
    res: express.Response,
  ): void => {
    applyRetryAfterHeaders(proxyRes, res);

    if (typeof proxyRes.on !== "function") {
      applyCircuitFromStatus(proxyRes.statusCode);
      return;
    }
    const proxyResStatusOk =
      typeof proxyRes.statusCode === "number" &&
      proxyRes.statusCode >= 200 &&
      proxyRes.statusCode < 300;

    collectFsmMediaResponse({
      upstream: proxyRes,
      downstream: res,
      maxBytes: isOpenAiImageGenerationEndpoint(req.path)
        ? FSM_MEDIA_MAX_DEFAULT_BYTES
        : resolveFsmMediaCapBytes(String(proxyRes.headers["content-type"] || "")),
      screen: (artifact, contentType) =>
        screenFsmMediaArtifact(
          artifact,
          contentType,
          proxyResStatusOk,
          isOpenAiImageGenerationEndpoint(req.path),
        ),
      writeTooLarge: () => {
        applyCircuitFromStatus(proxyRes.statusCode);
        if (!res.headersSent) {
          res.statusCode = 413;
          res.setHeader("Content-Type", "application/json");
          res.end(FSM_MEDIA_TOO_LARGE_JSON);
        }
      },
      writeBlocked: (blockBody) => {
        applyCircuitFromStatus(proxyRes.statusCode);
        if (!res.headersSent) {
          res.statusCode = 451;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(blockBody));
        }
      },
      writeUpstreamError: () => {
        if (!res.headersSent) {
          res.statusCode = 502;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Proxy error" }));
        }
      },
      writeAccepted: async (artifact) => {
        applyCircuitFromStatus(proxyRes.statusCode);
        if (artifact.kind === "memory") {
          copyProxyResponseHeaders(proxyRes, res);
          res.setHeader("content-length", Buffer.byteLength(artifact.buffer));
          res.end(artifact.buffer);
          return;
        }
        // Spooled artifact: stream the temp file to the client. The
        // collector owns temp-file cleanup (including this success path).
        copyProxyResponseHeaders(proxyRes, res);
        res.setHeader("content-length", artifact.sizeBytes);
        await new Promise<void>((resolve) => {
          const fileStream = createReadStream(artifact.filePath);
          res.on("finish", () => resolve());
          res.on("close", () => resolve());
          fileStream.on("error", () => resolve());
          fileStream.pipe(res);
        });
      },
    });
  };

  const veniceProxyBase = {
    target: `https://${VENICE_API_HOST}${VENICE_API_BASE_PATH}`,
    changeOrigin: true,
    timeout: AppConfig.VENICE_API_STREAM_TIMEOUT_MS,
    proxyTimeout: AppConfig.VENICE_API_STREAM_TIMEOUT_MS,
    pathRewrite: {
      "^/api/venice": "",
    },
  };

  // FRATERNA primary routing: same shape as `veniceProxyBase` but pointed at
  // the public Fraterna upstream. The public host is `fraterna.ai` (per
  // handoff §2.1 / §4) and the path prefix is the canonical `/api/v1`;
  // the client side rewrites `/api/venice` to "" the same way.
  const fraternaProxyBase = {
    target: `https://${PRIMARY_API_ROUTE_HOSTS.fraterna}${PRIMARY_API_ROUTE_BASE_PATHS.fraterna}`,
    changeOrigin: true,
    timeout: AppConfig.VENICE_API_STREAM_TIMEOUT_MS,
    proxyTimeout: AppConfig.VENICE_API_STREAM_TIMEOUT_MS,
    pathRewrite: {
      "^/api/venice": "",
    },
  };

  const standardVeniceProxy = createProxyMiddleware({
    ...veniceProxyBase,
    on: {
      proxyReq: applyVeniceProxyReq,
      proxyRes: standardProxyRes,
      error: writeGenericProxyError,
    },
  });

  const fsmMediaVeniceProxy = createProxyMiddleware({
    ...veniceProxyBase,
    headers: { "Accept-Encoding": "identity" },
    selfHandleResponse: true,
    on: {
      proxyReq: applyVeniceProxyReq,
      proxyRes: fsmMediaProxyRes,
      error: writeGenericProxyError,
    },
  });

  // Fraterna mirrors. They share response handlers with the Venice pair so
  // every guard (FSM SSE, response screening, retry-after) applies to the
  // Fraterna upstream identically.
  const standardFraternaProxy = createProxyMiddleware({
    ...fraternaProxyBase,
    on: {
      proxyReq: applyFraternaProxyReq,
      proxyRes: standardProxyRes,
      error: writeGenericProxyError,
    },
  });

  const fsmMediaFraternaProxy = createProxyMiddleware({
    ...fraternaProxyBase,
    headers: { "Accept-Encoding": "identity" },
    selfHandleResponse: true,
    on: {
      proxyReq: applyFraternaProxyReq,
      proxyRes: fsmMediaProxyRes,
      error: writeGenericProxyError,
    },
  });

  const extractChatCompletionText = (raw: string, contentType: string): string => {
    if (contentType.includes("text/event-stream")) {
      let acc = "";
      for (const block of raw.split(/\r?\n\r?\n/)) {
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("");
        if (!data || data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as {
            choices?: Array<{
              delta?: { content?: unknown; reasoning_content?: unknown };
              message?: { content?: unknown; reasoning_content?: unknown };
            }>;
          };
          const choice = parsed.choices?.[0];
          const content = choice?.delta?.content ?? choice?.message?.content;
          const reasoning = choice?.delta?.reasoning_content ?? choice?.message?.reasoning_content;
          if (typeof content === "string") acc += content;
          if (typeof reasoning === "string") acc += reasoning;
        } catch {
          /* ignore malformed SSE JSON */
        }
      }
      return acc;
    }
    try {
      const parsed = JSON.parse(raw) as {
        choices?: Array<{ message?: { content?: unknown; reasoning_content?: unknown } }>;
      };
      const message = parsed.choices?.[0]?.message;
      const content = typeof message?.content === "string" ? message.content : "";
      const reasoning = typeof message?.reasoning_content === "string" ? message.reasoning_content : "";
      return `${content}${reasoning}`;
    } catch {
      return raw.slice(0, 32_768);
    }
  };

  const fsmChatStreamProxyRes = (
    proxyRes: http.IncomingMessage,
    req: express.Request,
    res: express.Response,
  ): void => {
    applyRetryAfterHeaders(proxyRes, res);
    if (typeof proxyRes.on !== "function") {
      applyCircuitFromStatus(proxyRes.statusCode);
      return;
    }

    // Phase 8 — Responses API (alpha): this FSM stream gate covers both
    // /chat/completions and /responses (path-scoped by the route below).
    // The Responses SSE contract uses typed events instead of chat chunks,
    // so per-event screening extracts the assistant text from the event
    // rather than wrapping the raw frame in a chat envelope.
    const isResponses = req.path === "/responses";
    const screenEndpoint = isResponses ? "/responses" : "/chat/completions";

    const contentType = String(proxyRes.headers["content-type"] || "");
    const isSse = contentType.includes("text/event-stream");
    const initializeSseResponse = (): void => {
      if (res.headersSent) return;
      copyProxyResponseHeaders(proxyRes, res);
      res.removeHeader("content-length");
      res.setHeader("Content-Type", contentType || "text/event-stream");
    };
    const eventGate = isSse
      ? new SafetyGatedSse({
          maxEventBytes: VENICE_PROXY_MAX_FSM_SSE_EVENT_BYTES,
          classify: ({ data, done, semanticContexts }) => {
            if (done || !data.trim()) return { allowed: true };
            if (isResponses) {
              // Screen the assistant-visible text carried by the Responses
              // event (deltas, .done echoes, completed output blocks).
              const screenText = extractResponsesEventScreenText(data);
              if (!screenText.trim()) return { allowed: true };
              const currentEvent = screenResponseBody(
                screenText,
                { endpoint: screenEndpoint, method: "POST", source: "web-proxy" },
                isLocalFamilySafeModeEnabled(req),
              );
              return { allowed: currentEvent.allowed };
            }
            const currentEvent = screenResponseBody(
              JSON.stringify({ choices: [{ delta: { content: data } }] }),
              { endpoint: screenEndpoint, method: "POST", source: "web-proxy" },
              isLocalFamilySafeModeEnabled(req),
            );
            if (!currentEvent.allowed) return { allowed: false };
            return {
              allowed: semanticContexts.every((text) => screenResponseBody(
                text,
                { endpoint: screenEndpoint, method: "POST", source: "web-proxy" },
                isLocalFamilySafeModeEnabled(req),
              ).allowed),
            };
          },
          release: ({ raw }) => {
            initializeSseResponse();
            res.write(`${raw}\n\n`);
          },
        })
      : null;

    let exceeded = false;
    const endProxyError = (status: number, message: string): void => {
      if (res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: message }));
    };
    const failSse = (error: unknown): void => {
      if (exceeded) return;
      exceeded = true;
      const bounded = error instanceof Error && /bounded/i.test(error.message);
      endProxyError(
        bounded ? 413 : 451,
        bounded
          ? "Response could not be screened within the bounded Family Safe Mode window."
          : "Response blocked by Family Safe Mode.",
      );
    };

    let ssePump: ReturnType<typeof startSafetyGatedSsePump> | null = null;
    if (eventGate) {
      ssePump = startSafetyGatedSsePump({
        upstream: proxyRes,
        gate: eventGate,
        onSafetyFailure: failSse,
        onUpstreamError: () => {
          if (exceeded) return;
          exceeded = true;
          endProxyError(502, "Proxy error");
        },
        onComplete: () => {
          applyCircuitFromStatus(proxyRes.statusCode);
          if (!res.writableEnded) {
            initializeSseResponse();
            res.end();
          }
        },
      });
    } else {
      const chunks: Buffer[] = [];
      let length = 0;
      proxyRes.on("data", (chunk: Buffer | string) => {
        if (exceeded) return;
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        length += buf.length;
        if (length > VENICE_PROXY_MAX_FSM_RESPONSE_BYTES) {
          exceeded = true;
          proxyRes.destroy();
          endProxyError(413, "Response too large to screen under Family Safe Mode.");
          return;
        }
        chunks.push(buf);
      });

      proxyRes.on("end", () => {
        if (exceeded) {
          applyCircuitFromStatus(proxyRes.statusCode);
          return;
        }
        applyCircuitFromStatus(proxyRes.statusCode);
        if (res.headersSent) return;

        const buffer = Buffer.concat(chunks, length);
        const text = isResponses
          ? extractResponsesBodyScreenText(buffer.toString("utf8"))
          : extractChatCompletionText(buffer.toString("utf8"), contentType);
        if (proxyRes.statusCode && proxyRes.statusCode >= 200 && proxyRes.statusCode < 300 && text.trim()) {
          const screen = screenResponseBody(
            isResponses
              ? text
              : JSON.stringify({ choices: [{ message: { role: "assistant", content: text } }] }),
            { endpoint: screenEndpoint, method: "POST", source: "web-proxy" },
            isLocalFamilySafeModeEnabled(req),
          );
          if (!screen.allowed) {
            res.statusCode = 451;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(safetyBlockBodyFromResponseScreen(screen)));
            return;
          }
        }
        copyProxyResponseHeaders(proxyRes, res);
        res.setHeader("content-length", Buffer.byteLength(buffer));
        res.end(buffer);
      });
    }

    if (!eventGate) {
      proxyRes.on("error", () => {
        if (exceeded) return;
        endProxyError(502, "Proxy error");
      });
    }
    const cancelActiveSse = (): void => {
      if (res.writableEnded) return;
      if (ssePump) {
        ssePump.cancel();
      } else {
        proxyRes.destroy();
      }
    };
    // `IncomingMessage.close` also fires for a normally completed request body
    // in some adapters/test transports. Use the abort signal for the request and
    // the response close signal for an actual client disconnect so a healthy
    // streamed response is not cancelled before its first event is released.
    req.on("aborted", cancelActiveSse);
    res.on("close", cancelActiveSse);
  };

  const fsmChatStreamProxy = createProxyMiddleware({
    ...veniceProxyBase,
    headers: { "Accept-Encoding": "identity" },
    selfHandleResponse: true,
    on: {
      proxyReq: applyVeniceProxyReq,
      proxyRes: fsmChatStreamProxyRes,
      error: writeGenericProxyError,
    },
  });

  // Fraterna FSM chat-stream proxy — same FSM SSE gate, pointed at Fraterna.
  const fsmChatStreamFraternaProxy = createProxyMiddleware({
    ...fraternaProxyBase,
    headers: { "Accept-Encoding": "identity" },
    selfHandleResponse: true,
    on: {
      proxyReq: applyFraternaProxyReq,
      proxyRes: fsmChatStreamProxyRes,
      error: writeGenericProxyError,
    },
  });

  /**
   * Resolves the primary route for an inbound proxy request. The selection
   * is server-side authoritative (env-driven), and the per-endpoint
   * capability matrix is enforced by the shared resolver. Returns `null`
   * when the resolved route is the default Venice host OR when the
   * resolved Fraterna route does not support this endpoint — in either
   * case the caller falls back to the Venice proxy pair.
   */
  function resolveUpstreamRouteForRequest(pathname: string): {
    id: PrimaryApiRouteId;
    host: string;
    basePath: string;
  } | null {
    const route = resolveServerPrimaryApiRoute();
    if (route === "venice") return null;
    const resolved = resolveSharedPrimaryApiRoute(route, pathname);
    if (!resolved) return null;
    return resolved;
  }

  app.use("/api/venice", (req, res, next) => {
    const now = Date.now();
    if (circuitOpenUntil > 0) {
      if (now < circuitOpenUntil) {
        return res.status(503).json({ error: "Service Unavailable: Circuit breaker open due to upstream failures." });
      } else {
        // Cooldown has expired. Transition to half-open and let this single request act as a probe.
        circuitHalfOpen = true;
        circuitOpenUntil = 0;
        circuitFailures = 0; // Reset failure counter for fresh probe evaluation
      }
    } else if (circuitHalfOpen) {
      // If we are already half-open, a probe request is currently in flight. Reject concurrent requests.
      return res.status(503).json({ error: "Service Unavailable: Circuit breaker half-open, probe request in flight." });
    }
    next();
  });

  app.use("/api/venice", (req, res, next) => {
    const method = req.method.toUpperCase();

    if (!ALLOWED_VENICE_METHODS.includes(method as VeniceIpcMethod)) {
       return res.status(405).json({ error: "Method not allowed" });
    }

    // BUG-001 regression guard: the canonical
    // `isAllowedVeniceRequest` predicate (from src/shared/validation.ts)
    // understands both the static allowlist AND the parameterized
    // `/characters/{slug}` family. Using it as the single source of truth
    // prevents the previous 403 regression where `/characters` and
    // `/characters/{slug}` were rejected because they were not present in
    // the static `ALLOWED_VENICE_ENDPOINTS` array.
    //
    // Status-code mapping:
    //   - Static endpoint, method mismatch   -> 405
    //   - /characters family, method mismatch -> 405
    //   - Anything else                      -> 403
    // isAllowedVeniceRequest is the single source of truth for "would
    // this (path, method) pair normally be allowed?".
    if (!isAllowedVeniceRequest(req.path, method)) {
      // Decide whether the predicate rejected the request because of
      // (a) the wrong method on a known endpoint (static OR
      //     /characters) — emit 405
      // (b) an unknown / malformed path — emit 403
      const isStatic = (ALLOWED_VENICE_ENDPOINTS as readonly string[]).includes(req.path);
      const isCharacters = isAllowedCharactersRequest(req.path, "GET");
      const isApiKeys = isAllowedApiKeysRequest(req.path, "GET") || isAllowedApiKeysRequest(req.path, "POST") || isAllowedApiKeysRequest(req.path, "PUT") || isAllowedApiKeysRequest(req.path, "DELETE");
      const isX402 = isAllowedX402Endpoint(req.path);
      const isCryptoRpc = isAllowedCryptoRpcEndpoint(req.path);
      const status = isStatic || isCharacters || isApiKeys || isX402 || isCryptoRpc ? 405 : 403;
      const message =
        status === 405
          ? `Method ${method} not allowed for endpoint ${req.path}`
          : `Endpoint ${req.path} not allowed`;
      return res.status(status).json({ error: message });
    }
    next();
  });

  // VF-PLAYTEST-001: The API-key-config gate previously ran *before* the
  // method/endpoint allowlist validation, so a server with no key configured
  // returned 500 "VENICE_API_KEY is not configured" for *every* malformed
  // request — masking the real 403 (unknown endpoint) / 405 (wrong method)
  // and misleading a first user into thinking the server itself was broken.
  // It now runs *after* the allowlist so malformed requests get the correct
  // status regardless of key state; only requests that would actually reach
  // the upstream are gated on key presence.
  app.use("/api/venice", (req, res, next) => {
    // Phase 7: x402 endpoints authenticate via SIWX / payment signatures, not API key.
    if (isAllowedX402Request(req.path, req.method)) {
      return next();
    }
    // Phase 8: /crypto/rpc/networks is public; /crypto/rpc/{network} can authenticate via SIWX.
    if (req.path === "/crypto/rpc/networks" && req.method === "GET") {
      return next();
    }
    const hasSiwx = Boolean(req.headers["sign-in-with-x"] || req.headers["x-sign-in-with-x"]);
    if (isAllowedCryptoRpcRequest(req.path, req.method) && hasSiwx) {
      return next();
    }
    if (!AppConfig.VENICE_API_KEY && !isDevSessionConfigured(devSessionVeniceApiKey) && AppConfig.NODE_ENV !== "test") {
      return res.status(401).json({ error: "VENICE_API_KEY is not configured on the server." });
    }
    next();
  });
  // We use express.raw() to leave req.body as a Buffer for the safety guard before proxying.
  app.use(
    "/api/venice",
    express.raw({ 
      type: "*/*", 
      limit: MAX_PROXY_BODY_BYTES
    }),
    // Child exploitation safety guard — enforcement at web-proxy boundary.
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      // GET requests skip the guard because they carry no user content (e.g. GET /models)
      if (req.method !== "POST") { next(); return; }
      const endpoint = req.path; // e.g. "/chat/completions"
      let body: unknown = req.body;
      if (!(body instanceof Buffer)) {
        if (typeof body === "string") {
          body = Buffer.from(body);
        } else if (body && typeof body === "object") {
          body = Buffer.from(JSON.stringify(body));
        } else {
          body = undefined;
        }
      }
      req.body = body;

      if (endpoint === "/chat/completions" && Buffer.isBuffer(body)) {
        try {
          const parsed = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
          const promptResult = checkSystemPromptMessages(parsed.messages);
          if (promptResult?.isOverLimit) {
            res.status(400).json({ error: promptResult.message });
            return;
          }
        } catch (parseError) {
          if (parseError instanceof SyntaxError) {
            // The existing guard/proxy path owns malformed-JSON handling.
          } else {
            throw parseError;
          }
        }
      }
      
      let decision;
      const familySafeModeEnabled = isLocalFamilySafeModeEnabled(req);
      try {
        decision = maybeRunLocalFamilyGuard(
          { endpoint, method: "POST", payload: body, source: "web-proxy" },
          familySafeModeEnabled,
        );
      } catch (err) {
        // Fail-closed: if the safety guard throws (e.g. extraction bug), block the request.
        error("Safety guard exception in web proxy:", err);
        const syntheticDecision: SafetyGuardDecision = {
          allow: false,
          action: "block",
          severity: "critical",
          category: "csam_request",
          reasonCode: "GUARD_EXCEPTION",
          userMessage: "Internal server error during safety verification.",
          developerMessage: "Safety guard threw an exception in web proxy.",
          normalizedChanged: false,
          signals: [],
          audit: {
            decisionId: "guard-exception-" + Date.now(),
            createdAt: new Date().toISOString(),
            promptHash: "00000000",
            promptLength: 0,
            matchedFieldPaths: [],
          },
        };
        recordDecision(syntheticDecision);
        res.status(451).json({
          error: syntheticDecision.userMessage,
          reasonCode: syntheticDecision.reasonCode,
          category: syntheticDecision.category,
          severity: syntheticDecision.severity,
        });
        return;
      }

      if (!decision.allowed) {
        res.status(451).json({
          error: decision.userMessage,
          reasonCode: decision.guardDecision.reasonCode,
          category: decision.guardDecision.category,
          severity: decision.guardDecision.severity,
        });
        return;
      }

      // VF-20260916-P1-002 — typed safety provenance: the guard consumed the
      // typed segments; now serialize the canonical envelopes into message
      // content and strip the internal field before the body is proxied
      // upstream. Bodies without provenance pass through untouched.
      if (body instanceof Buffer) {
        try {
          const parsedBody = JSON.parse(body.toString("utf8")) as unknown;
          if (extractSafetyProvenance(parsedBody)) {
            req.body = Buffer.from(
              JSON.stringify(serializeSafetyProvenanceIntoPayload(parsedBody)),
              "utf8",
            );
          }
        } catch (parseError) {
          if (!(parseError instanceof SyntaxError)) {
            throw parseError;
          }
          // Malformed JSON: the proxy path owns malformed-JSON handling.
        }
      }
      next();
    },
    (req, res, next) => {
      const isMedia = isImageSafetyEndpoint(req.path) || req.path.startsWith("/video/") || req.path.startsWith("/audio/");
      const isLocalFamilySafe = isLocalFamilySafeModeEnabled(req);
      // FRATERNA primary routing: when the server-side primary route is
      // Fraterna and supports this endpoint, dispatch to the Fraterna
      // proxy pair (identical guards, swapped upstream). When the route is
      // Venice OR Fraterna does not support this endpoint, the existing
      // Venice pair handles the request. This keeps every guard
      // (FSM SSE, response screening, retry-after, circuit breaker)
      // identical between the two hosts.
      const upstreamRoute = resolveUpstreamRouteForRequest(req.path);
      const isFraterna = upstreamRoute?.id === "fraterna";
      const serverPrimaryRoute = resolveServerPrimaryApiRoute();
      res.setHeader("x-venice-forge-primary-route", serverPrimaryRoute);
      res.setHeader("x-venice-forge-effective-upstream", isFraterna ? "fraterna" : "venice");
      res.setHeader(
        "x-venice-forge-routing-reason",
        serverPrimaryRoute === "venice"
          ? "selected-venice"
          : isFraterna
          ? "fraterna-supported-endpoint"
          : "fraterna-unsupported-endpoint"
      );
      const standardProxy = isFraterna ? standardFraternaProxy : standardVeniceProxy;
      const fsmMediaProxy = isFraterna ? fsmMediaFraternaProxy : fsmMediaVeniceProxy;
      const fsmChatProxy = isFraterna ? fsmChatStreamFraternaProxy : fsmChatStreamProxy;
      if (isMedia && isLocalFamilySafe) {
        return fsmMediaProxy(req, res, next);
      }
      if (req.path === "/chat/completions" && isLocalFamilySafe) {
        return fsmChatProxy(req, res, next);
      }
      // Phase 8 — Responses API (alpha): the opt-in /responses stream goes
      // through the same mandatory FSM SSE gate as chat. The gate screens
      // the typed Responses events (see fsmChatStreamProxyRes). When Family
      // Safe Mode is off the standard proxy still runs the request-body
      // guard above; the response screen is an FSM-only layer, identical to
      // chat.
      if (req.path === "/responses" && isLocalFamilySafe) {
        return fsmChatProxy(req, res, next);
      }
      return standardProxy(req, res, next);
    },
  );

  app.post("/api/proxy-jina", express.json({ limit: MAX_PROXY_BODY_BYTES }), async (req, res) => {
    try {
      const { url: requestUrl, headers: requestHeaders, timeoutMs } = req.body;
      if (typeof requestUrl !== "string") {
        return res.status(400).json({ error: "Missing or invalid Jina request URL." });
      }

      const parsed = new URL(requestUrl);
      let safeBaseOrigin: "https://r.jina.ai" | "https://s.jina.ai";
      if (parsed.hostname === "r.jina.ai") {
        safeBaseOrigin = "https://r.jina.ai";
      } else if (parsed.hostname === "s.jina.ai") {
        safeBaseOrigin = "https://s.jina.ai";
      } else {
        return res.status(403).json({ error: "Only Jina Reader/Search HTTPS endpoints are allowed." });
      }
      if (parsed.protocol !== "https:") {
        return res.status(403).json({ error: "Only Jina Reader/Search HTTPS endpoints are allowed." });
      }

      const safePath = parsed.pathname.replace(/^\/+/, "");
      const safeTargetUrl = `${safeBaseOrigin}/${safePath}${parsed.search}`;
      const targetUrlObj = new URL(safeTargetUrl);
      if (targetUrlObj.origin !== safeBaseOrigin) {
        return res.status(403).json({ error: "Only Jina Reader/Search HTTPS endpoints are allowed." });
      }

      const decision = maybeRunLocalFamilyGuard(
        { endpoint: requestUrl, method: "GET", text: safeDecodeForScreening(requestUrl), source: "web-proxy" },
        isLocalFamilySafeModeEnabled(req),
      );
      if (!decision.allowed) {
        return res.status(451).json({
          error: decision.userMessage,
          reasonCode: decision.guardDecision.reasonCode,
          category: decision.guardDecision.category,
          severity: decision.guardDecision.severity,
        });
      }

      const JINA_ALLOWED_FORWARD_HEADERS = new Set([
        "accept",
        "x-return-format",
        "x-with-generated-alt",
        "x-with-iframe",
        "x-target-selector",
        "x-wait-for-selector",
        "x-timeout",
        "x-no-cache",
        "x-retain-images",
        "x-with-links-summary",
        "x-with-images-summary",
        "x-token-budget",
      ]);

      const JINA_BLOCKED_FORWARD_HEADER_PATTERNS = [
        /^host$/i,
        /^cookie$/i,
        /^set-cookie$/i,
        /^forwarded$/i,
        /^x-forwarded-/i,
        /^content-length$/i,
        /^transfer-encoding$/i,
        /^connection$/i,
        /^proxy-/i,
        /^origin$/i,
        /^referer$/i,
      ];

      function normalizeHeaderName(name: string): string {
        return name.trim().toLowerCase();
      }

      function isAllowedJinaForwardHeader(name: string): boolean {
        const normalized = normalizeHeaderName(name);
        if (!normalized) return false;
        if (JINA_BLOCKED_FORWARD_HEADER_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
        return JINA_ALLOWED_FORWARD_HEADERS.has(normalized);
      }

      const headers: Record<string, string> = {};
      if (requestHeaders && typeof requestHeaders === "object" && !Array.isArray(requestHeaders)) {
        for (const [key, value] of Object.entries(requestHeaders)) {
          if (typeof value === "string") {
            if (/^authorization$/i.test(key) || /^x-jina-api-key$/i.test(key)) {
              // Dropped: renderer is not allowed to supply Jina keys
              continue;
            } else if (isAllowedJinaForwardHeader(key) && /^[^\r\n\0]*$/.test(value)) {
              headers[key] = value;
            }
            // Dropped: all other renderer-supplied headers
          }
        }
      }

      const serverJinaKey = AppConfig.JINA_API_KEY || getDevSessionKey(devSessionJinaApiKey);
      if (serverJinaKey) {
        headers["Authorization"] = `Bearer ${serverJinaKey}`;
      }

      const controller = new AbortController();
      // nosec:js/resource-exhaustion — timeoutMs is clamped to a 180000ms
      // (3-minute) maximum with a 30000ms fallback, so this timer cannot
      // be set to an arbitrarily long duration.
      const timeout = setTimeout( // nosec:js/resource-exhaustion
        () => controller.abort(),
        typeof timeoutMs === "number" && timeoutMs > 0 ? Math.min(timeoutMs, 180000) : 30000
      );

      try {
        // nosec:js/request-forgery — `safeTargetUrl` is reconstructed from
        // an allowlist of two literal host origins (https://r.jina.ai, https://s.jina.ai)
        // with stripped leading slashes, https protocol verification, and origin equality check.
        // SSRF to internal services is impossible by construction.
        // nosec:js/request-forgery
        const response = await fetch(safeTargetUrl, {
          method: "GET",
          headers,
          signal: controller.signal,
          redirect: "error",
        });

        const contentType = response.headers.get("content-type") || "";
        const rawBody = await readBoundedFetchBody(response, JINA_MAX_RESPONSE_BYTES);
        const body = contentType.includes("application/json") ? parseJsonOrNull(rawBody) : rawBody;

        const serialized = typeof body === "string" ? body : JSON.stringify(body ?? "");
        const screen = screenResponseBody(
          serialized,
          { endpoint: requestUrl, method: "GET", source: "web-proxy" },
          isLocalFamilySafeModeEnabled(req),
        );
        if (!screen.allowed) {
          return res.status(451).json(safetyBlockBodyFromResponseScreen(screen));
        }

        if (contentType.includes("application/json")) {
          return res.status(response.status).json(body);
        } else {
          res.setHeader("Content-Type", contentType || "text/plain");
          return res.status(response.status).send(body);
        }
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      if (err instanceof FetchBodyTooLargeError) {
        return res.status(413).json({ error: "Jina response exceeded the 2 MiB limit." });
      }
      if (err instanceof Error && err.name === "AbortError") {
        return res.status(504).json({ error: "Request timed out" });
      }
      error("Jina proxy error:", err);
      return res.status(502).json({ error: "Jina request failed" });
    }
  });

  // Generic scrape proxy with SSRF protection (DNS resolution)
  app.post("/api/proxy-scrape", express.json({ limit: MAX_PROXY_BODY_BYTES }), async (req, res) => {
    try {
      const url = req.body?.url;
      if (typeof url !== "string") {
        return res.status(400).json({ error: "Missing or invalid URL" });
      }

      try {
        decodeURIComponent(url);
      } catch {
        return res.status(400).json({ error: "Malformed percent-encoding in URL" });
      }

      const decision = maybeRunLocalFamilyGuard(
        { endpoint: url, method: "GET", text: safeDecodeForScreening(url), source: "web-proxy" },
        isLocalFamilySafeModeEnabled(req),
      );
      if (!decision.allowed) {
        return res.status(451).json({
          error: decision.userMessage,
          reasonCode: decision.guardDecision.reasonCode,
          category: decision.guardDecision.category,
          severity: decision.guardDecision.severity,
        });
      }

      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      if (parsed.protocol !== "https:") {
        return res.status(400).json({ error: "Only HTTPS URLs are allowed" });
      }

      if (isPrivateHostname(parsed.hostname)) {
        return res.status(403).json({ error: "Access to private hostnames blocked" });
      }

      let lookupResults: { address: string; family: number }[];
      try {
        // SECURITY: enumerate every A/AAAA record and check each for private
        // ranges. A hostname with both a public A and a private AAAA would
        // otherwise be reachable by IPv6-capable clients and bypass the A check.
        lookupResults = await dns.lookup(parsed.hostname, { all: true, verbatim: true });
      } catch {
        return res.status(400).json({ error: "DNS lookup failed" });
      }

      if (!lookupResults || lookupResults.length === 0) {
        return res.status(400).json({ error: "DNS lookup failed" });
      }

      for (const r of lookupResults) {
        if (!r.address || isPrivateHostname(r.address)) {
          return res.status(403).json({ error: "Access to private IPs blocked" });
        }
      }
      const lookupResult = lookupResults[0];
      if (!lookupResult || !lookupResult.address) {
        return res.status(400).json({ error: "DNS lookup failed" });
      }

      const scrapeResult = await new Promise<{
        status: number;
        finalUrl: string;
        contentType: string;
        body: string;
      }>((resolve, reject) => {
        const client = parsed.protocol === "https:" ? nodeHttps : nodeHttp;
        const request = client.request(
          {
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            port: parsed.port || undefined,
            path: `${parsed.pathname}${parsed.search}`,
            method: "GET",
            timeout: 15000,
            headers: {
              Accept: "text/html, text/plain, application/xhtml+xml, application/json",
              Host: parsed.host,
            },
            lookup: (hostname, options, callback) => {
              if (typeof options === "function") {
                callback = options;
                options = {};
              }
              if (options.all) {
                callback(null, [lookupResult]);
              } else {
                callback(null, lookupResult.address, lookupResult.family);
              }
            },
          },
          (response) => {
            const status = response.statusCode || 0;
            if (status >= 300 && status < 400) {
              response.destroy();
              reject(new Error(`HTTP ${status} redirect blocked. Provide a direct URL.`));
              return;
            }

            const contentType = String(response.headers["content-type"] || "");
            const baseContentType = contentType.split(";")[0].trim().toLowerCase();
            if (!SCRAPE_ALLOWED_CONTENT_TYPES.includes(baseContentType as typeof SCRAPE_ALLOWED_CONTENT_TYPES[number])) {
              response.destroy();
              reject(new Error("Content-Type not allowed"));
              return;
            }

            const chunks: Buffer[] = [];
            let bytesRead = 0;
            const maxBytes = 2 * 1024 * 1024;

            response.on("data", (chunk: Buffer) => {
              bytesRead += chunk.length;
              if (bytesRead > maxBytes) {
                response.destroy(new Error("Response too large"));
                return;
              }
              chunks.push(chunk);
            });

            response.on("end", () => {
              resolve({
                status,
                finalUrl: url,
                contentType,
                body: Buffer.concat(chunks).toString("utf-8"),
              });
            });
          }
        );

        request.on("timeout", () => request.destroy(new Error("Request timed out")));
        request.on("error", reject);
        request.end();
      });

      const screen = screenResponseBody(
        scrapeResult.body,
        { endpoint: url, method: "GET", source: "scrape" },
        isLocalFamilySafeModeEnabled(req),
      );
      if (!screen.allowed) {
        return res.status(451).json(safetyBlockBodyFromResponseScreen(screen));
      }

      if (req.query.raw === "true") {
        const sanitizedContentType = sanitizeScrapeContentTypeHeader(scrapeResult.contentType);
        if (sanitizedContentType) {
          res.setHeader("Content-Type", sanitizedContentType);
          res.setHeader("X-Content-Type-Options", "nosniff");
        }
        res.status(scrapeResult.status).send(scrapeResult.body);
      } else {
        res.status(scrapeResult.status).json({
          url,
          finalUrl: scrapeResult.finalUrl,
          contentType: scrapeResult.contentType,
          body: scrapeResult.body,
        });
      }

    } catch (err) {
      if (err instanceof Error && err.message === "Request timed out") {
        return res.status(504).json({ error: "Request timed out" });
      }
      error("Scrape proxy error:", err);
      return res.status(502).json({ error: "Scrape failed" });
    }
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    const rec = err && typeof err === "object"
      ? (err as { type?: string; status?: number; statusCode?: number })
      : {};
    if (rec.type === "entity.too.large" || rec.status === 413 || rec.statusCode === 413) {
      res.status(413).json({ error: "Payload too large" });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: "Malformed JSON" });
      return;
    }
    next(err);
  });

  (app as express.Application & { cleanupIntervals?: () => void; staticRateLimiterCleanup?: ReturnType<typeof setInterval> }).cleanupIntervals = () => {
    clearInterval((createRateLimiter as unknown as Record<string, unknown>)._veniceCleanup as ReturnType<typeof setInterval>);
    clearInterval((createRateLimiter as unknown as Record<string, unknown>)._proxyCleanup as ReturnType<typeof setInterval>);
    if ((app as express.Application & { staticRateLimiterCleanup?: ReturnType<typeof setInterval> }).staticRateLimiterCleanup) {
      clearInterval((app as express.Application & { staticRateLimiterCleanup?: ReturnType<typeof setInterval> }).staticRateLimiterCleanup);
    }
    cleanupProcessListeners();
  };

  return app;
}

function isMainModule(): boolean {
  try {
    // ESM entry point (e.g., tsx server.ts)
    if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
      return true;
    }
  } catch {
    // import.meta may be unavailable in bundled CJS output.
  }

  try {
    // CommonJS entry point (e.g., node dist/server.cjs)
    if (require.main === module) {
      return true;
    }
  } catch {
    // require may be unavailable in native ESM.
  }

  return false;
}

if (isMainModule()) {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

export async function startServer() {
  const app = createServerApp();
  const PORT = AppConfig.PORT;

  // Vite middleware for development
  if (AppConfig.NODE_ENV !== "production" && AppConfig.NODE_ENV !== "test") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      // Express middleware mode serves transformed HTML through a custom stack;
      // disabling React Refresh avoids a blank page when the preamble is not detected.
      server: { middlewareMode: true, hmr: false },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (AppConfig.NODE_ENV !== "test") {
    const distPath = getModuleDir();
    const indexHtml = fs.readFileSync(path.join(distPath, "index.html"), "utf-8");
    const staticWindowMs = AppConfig.RATE_LIMIT_WINDOW_MS;
    const staticMaxRequests = AppConfig.RATE_LIMIT_MAX_REQUESTS;
    const MAX_STATIC_RATE_LIMIT_ENTRIES = 10_000;
    const staticRequestCounts = new Map<string, { count: number; resetTime: number; lastSeen: number }>();
    const staticRateLimiterCleanup = setInterval(() => {
      const now = Date.now();
      for (const [ip, record] of staticRequestCounts.entries()) {
        if (now > record.resetTime) staticRequestCounts.delete(ip);
      }
    }, Math.max(10000, staticWindowMs)).unref();
    const staticRateLimiter: express.RequestHandler = (req, res, next) => {
      // When TRUST_PROXY is enabled, include the socket address in the key to
      // prevent X-Forwarded-For spoofing from bypassing rate limits.
      const forwarded = req.headers["x-forwarded-for"];
      const ip = forwarded && AppConfig.TRUST_PROXY
        ? `${req.socket?.remoteAddress || "unknown"}|${req.ip || "unknown"}`
        : (req.ip || req.socket?.remoteAddress || "unknown");
      const now = Date.now();
      const record = staticRequestCounts.get(ip) || { count: 0, resetTime: now + staticWindowMs, lastSeen: now };

      if (now > record.resetTime) {
        record.count = 1;
        record.resetTime = now + staticWindowMs;
      } else {
        record.count += 1;
      }
      record.lastSeen = now;
      staticRequestCounts.set(ip, record);

      if (record.count > staticMaxRequests) {
        return res.status(429).json({ error: "Too many requests, please try again later." });
      }
      
      if (staticRequestCounts.size > MAX_STATIC_RATE_LIMIT_ENTRIES) {
        let oldestKey: string | undefined;
        let oldestTime = Infinity;
        for (const [key, value] of staticRequestCounts.entries()) {
          if (value.lastSeen < oldestTime) {
            oldestTime = value.lastSeen;
            oldestKey = key;
          }
        }
        if (oldestKey !== undefined) staticRequestCounts.delete(oldestKey);
      }
      return next();
    };

    app.use(staticRateLimiter);
    app.use(express.static(distPath));
    app.get("/{*rendererPath}", (req: express.Request, res: express.Response) => {
      // Inject the per-request CSP nonce into every <script> tag in index.html
      // so the nonces in the HTTP header and in the HTML stay in sync.
      // The nonce was set on res.locals.cspNonce by the security-headers middleware.
      const nonce: string = (res.locals as { cspNonce?: string }).cspNonce ?? "";
      const nonced = nonce
        ? indexHtml.replace(/(<script\b[^>]*)(>)/gi, (_m, open: string, close: string) => {
            // Don't double-inject if already has a nonce attribute
            if (/\bnonce=/i.test(open)) return `${open}${close}`;
            return `${open} nonce="${nonce}"${close}`;
          })
        : indexHtml;
      res.type("html").send(nonced);
    });
    (app as express.Application & { staticRateLimiterCleanup?: ReturnType<typeof setInterval> | undefined }).staticRateLimiterCleanup = staticRateLimiterCleanup;
  }

  if (AppConfig.NODE_ENV !== "test") {
    let host = AppConfig.HOST;
    const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
    if (!ALLOWED_HOSTS.has(host)) {
      warn(`Invalid HOST "${host}" — falling back to 127.0.0.1`);
      host = "127.0.0.1";
    }
    const server = app.listen(Number(PORT), host, () => {
      warn(`Server running on http://${host}:${PORT}`);
    });
    server.on("error", (err) => {
      error("Server failed to start", err);
      process.exit(1);
    });
  }
}
