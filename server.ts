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
} from "./src/shared/validation";
import { VENICE_API_HOST, VENICE_API_BASE_PATH } from "./src/shared/apiConfig";
import { AppConfig } from "./src/shared/configSchema";
import { warn, error } from "./src/shared/logger";
import { maybeRunLocalFamilyGuard, recordDecision, screenResponseBody } from "./src/shared/safety";
import type { SafetyGuardDecision } from "./src/shared/safety";
import { pathToFileURL, fileURLToPath } from "node:url";
import { isPrivateHostname } from "./src/shared/urlSecurity";
import { JINA_MAX_RESPONSE_BYTES } from "./src/shared/limits";
import { FetchBodyTooLargeError, parseJsonOrNull, readBoundedFetchBody } from "./src/shared/readBoundedFetchBody";

function safeDecodeForScreening(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isLoopbackClient(req: express.Request): boolean {
  const address = req.socket.remoteAddress ?? "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

dotenv.config();

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
    const g = globalThis as Record<string, unknown>;
    if (typeof g.__filename === "string") {
      return path.dirname(g.__filename);
    }
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

export function applyVeniceProxyHeaders(
  proxyReq: VeniceProxyOutboundRequest,
  req: VeniceProxyRequest,
  apiKey = AppConfig.VENICE_API_KEY,
) {
  for (const header of FORBIDDEN_RENDERER_PROXY_HEADERS) {
    proxyReq.removeHeader(header);
  }

  proxyReq.setHeader("Authorization", `Bearer ${apiKey}`);
  proxyReq.setHeader("Host", VENICE_API_HOST);

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

export function createServerApp() {
  const app = express();
  let devSessionVeniceApiKey = "";
  let devSessionJinaApiKey = "";
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
    try {
      const moduleDir = getModuleDir();
      const pkgPath = path.join(moduleDir, "package.json");
      return JSON.parse(fs.readFileSync(pkgPath, "utf-8")).version;
    } catch {
      return "unknown";
    }
  })();

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", version: appVersion });
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
      res.status(200).json({ configured: devSessionVeniceApiKey.length > 0 });
      return;
    }
    if (req.method === "DELETE") {
      devSessionVeniceApiKey = "";
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method === "POST") {
      const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
      if (!key || key.length > 512) {
        res.status(400).json({ error: "A valid API key is required." });
        return;
      }
      devSessionVeniceApiKey = key;
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
      res.status(200).json({ configured: devSessionJinaApiKey.length > 0 || Boolean(AppConfig.JINA_API_KEY) });
      return;
    }
    if (req.method === "DELETE") {
      devSessionJinaApiKey = "";
      res.status(200).json({ ok: true });
      return;
    }
    if (req.method === "POST") {
      const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
      if (!key || key.length > 512) {
        res.status(400).json({ error: "A valid Jina API key is required." });
        return;
      }
      devSessionJinaApiKey = key;
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
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        scriptSrc,
        styleSrc,
        "img-src 'self' data: blob: https:",
        connectSrc,
        "font-src 'self' data:",
        "media-src 'self' blob:",
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
      const ip = req.ip || "unknown";
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

  app.use("/api/venice", veniceRateLimiter, (req, res, next) => {
    if (!AppConfig.VENICE_API_KEY && !devSessionVeniceApiKey && AppConfig.NODE_ENV !== "test") {
      return res.status(500).json({ error: "VENICE_API_KEY is not configured on the server." });
    }
    next();
  });

  // Apply shared rate limiting to Jina and scrape proxies.
  app.use("/api/proxy-jina", proxyRateLimiter);
  app.use("/api/proxy-scrape", proxyRateLimiter);

  const MAX_PROXY_BODY_BYTES = AppConfig.MAX_PROXY_BODY_BYTES;

  // Circuit Breaker State
  let circuitFailures = 0;
  let circuitOpenUntil = 0;
  let circuitHalfOpen = false;
  const CIRCUIT_MAX_FAILURES = 5;
  const CIRCUIT_RESET_TIMEOUT_MS = 30000;

  app.use("/api/venice", (req, res, next) => {
    if (Date.now() < circuitOpenUntil) {
      return res.status(503).json({ error: "Service Unavailable: Circuit breaker open due to upstream failures." });
    }
    // Enter half-open state if timeout has expired
    if (circuitOpenUntil > 0 && Date.now() >= circuitOpenUntil) {
      circuitHalfOpen = true;
      circuitOpenUntil = 0;
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
      const status = isStatic || isCharacters ? 405 : 403;
      const message =
        status === 405
          ? `Method ${method} not allowed for endpoint ${req.path}`
          : `Endpoint ${req.path} not allowed`;
      return res.status(status).json({ error: message });
    }
    next();
  });

  // Venice API Proxy
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
      
      let decision;
      try {
        decision = maybeRunLocalFamilyGuard(
          { endpoint, method: "POST", payload: body, source: "web-proxy" },
          isLocalFamilySafeModeEnabled(req),
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
        res.status(500).json({ error: "Internal server error during safety verification." });
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
      next();
    },
    createProxyMiddleware({
      target: `https://${VENICE_API_HOST}${VENICE_API_BASE_PATH}`,
      changeOrigin: true,
      timeout: AppConfig.VENICE_API_TIMEOUT_MS,
      proxyTimeout: AppConfig.VENICE_API_TIMEOUT_MS,
      pathRewrite: {
        "^/api/venice": "", // remove base path
      },
      on: {
        proxyReq: (proxyReq: VeniceProxyOutboundRequest, req: express.Request, _res: express.Response) => {
          applyVeniceProxyHeaders(proxyReq, req, devSessionVeniceApiKey || AppConfig.VENICE_API_KEY);
        },
        proxyRes: (proxyRes: http.IncomingMessage, req: express.Request, res: express.Response) => {
          // Forward rate-limit headers so the client can respect them.
          const retryAfter = proxyRes.headers["retry-after"];
          if (retryAfter) res.setHeader("Retry-After", retryAfter);
          const rlReset = proxyRes.headers["x-ratelimit-reset-requests"];
          if (rlReset) res.setHeader("X-RateLimit-Reset-Requests", rlReset);

          if (proxyRes.statusCode && proxyRes.statusCode >= 500) {
            circuitFailures++;
            if (circuitFailures >= CIRCUIT_MAX_FAILURES || circuitHalfOpen) {
              error(`[Circuit Breaker] Tripped! Opening for ${CIRCUIT_RESET_TIMEOUT_MS}ms`);
              circuitOpenUntil = Date.now() + CIRCUIT_RESET_TIMEOUT_MS;
              circuitHalfOpen = false;
            }
          } else if (proxyRes.statusCode && proxyRes.statusCode >= 200 && proxyRes.statusCode < 300) {
             circuitFailures = 0; // Reset only on successful responses
             circuitHalfOpen = false;
          }
        },
        error: (err: Error, req: express.Request, res: express.Response | import('net').Socket) => {
          error("Proxy error:", err.message);
          circuitFailures++;
          if (circuitFailures >= CIRCUIT_MAX_FAILURES || circuitHalfOpen) {
             error(`[Circuit Breaker] Tripped (Network Error)! Opening for ${CIRCUIT_RESET_TIMEOUT_MS}ms`);
             circuitOpenUntil = Date.now() + CIRCUIT_RESET_TIMEOUT_MS;
             circuitHalfOpen = false;
          }
          if ("headersSent" in res && !res.headersSent) {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Bad Gateway: Failed to reach Venice API." }));
          }
        }
      },
    })
  );

  app.post("/api/proxy-jina", express.json(), async (req, res) => {
    try {
      const { url: requestUrl, headers: requestHeaders, timeoutMs } = req.body;
      if (typeof requestUrl !== "string") {
        return res.status(400).json({ error: "Missing or invalid Jina request URL." });
      }

      const parsed = new URL(requestUrl);
      const allowedHosts = ["r.jina.ai", "s.jina.ai"];
      if (parsed.protocol !== "https:" || !allowedHosts.includes(parsed.hostname)) {
        return res.status(403).json({ error: "Only Jina Reader/Search HTTPS endpoints are allowed." });
      }

      const decision = maybeRunLocalFamilyGuard(
        { endpoint: requestUrl, method: "GET", text: safeDecodeForScreening(requestUrl), source: "web-proxy" },
        isLocalFamilySafeModeEnabled(req),
      );
      if (!decision.allowed) {
        return res.status(451).json({ error: decision.userMessage });
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
            } else if (isAllowedJinaForwardHeader(key)) {
              headers[key] = value;
            }
            // Dropped: all other renderer-supplied headers
          }
        }
      }

      const serverJinaKey = AppConfig.JINA_API_KEY || devSessionJinaApiKey;
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
        // nosec:js/request-forgery — `parsed` is a URL parsed from a
        // user-supplied string but then validated against an allowlist of
        // two hostnames (r.jina.ai, s.jina.ai) and required to use the
        // https: protocol (server.ts:362-365). SSRF to internal services
        // is impossible by construction.
        // nosec:js/request-forgery
        const response = await fetch(parsed.toString(), {
          method: "GET",
          headers,
          signal: controller.signal,
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
          return res.status(451).json({ error: screen.userMessage });
        }

        return res.status(response.status).json(body);
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
      return res.status(500).json({ error: "Jina request failed" });
    }
  });

  // Generic scrape proxy with SSRF protection (DNS resolution)
  app.post("/api/proxy-scrape", express.json(), async (req, res) => {
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
        return res.status(451).json({ error: decision.userMessage });
      }

      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return res.status(400).json({ error: "Invalid URL format" });
      }

      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return res.status(400).json({ error: "Only http/https allowed" });
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
            lookup: (_hostname, _options, callback) => {
              callback(null, lookupResult.address, lookupResult.family);
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
            const ALLOWED_CONTENT_TYPES = ["text/html", "text/plain", "application/xhtml+xml", "application/json"];
            const allowed = ALLOWED_CONTENT_TYPES.some((t) => contentType.toLowerCase().includes(t));
            if (!allowed) {
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
        return res.status(451).json({ error: screen.userMessage });
      }

      res.status(scrapeResult.status).json({
        url,
        finalUrl: scrapeResult.finalUrl,
        contentType: scrapeResult.contentType,
        body: scrapeResult.body,
      });

    } catch (err) {
      if (err instanceof Error && err.message === "Request timed out") {
        return res.status(504).json({ error: "Request timed out" });
      }
      error("Scrape proxy error:", err);
      return res.status(500).json({ error: "Scrape failed" });
    }
  });

  (app as express.Application & { cleanupIntervals?: () => void; staticRateLimiterCleanup?: ReturnType<typeof setInterval> }).cleanupIntervals = () => {
    clearInterval((createRateLimiter as unknown as Record<string, unknown>)._veniceCleanup as ReturnType<typeof setInterval>);
    clearInterval((createRateLimiter as unknown as Record<string, unknown>)._proxyCleanup as ReturnType<typeof setInterval>);
    if ((app as express.Application & { staticRateLimiterCleanup?: ReturnType<typeof setInterval> }).staticRateLimiterCleanup) {
      clearInterval((app as express.Application & { staticRateLimiterCleanup?: ReturnType<typeof setInterval> }).staticRateLimiterCleanup);
    }
  };

  return app;
}

function isMainModule() {
  try {
    return import.meta.url === pathToFileURL(process.argv[1] || "").href;
  } catch {
    return false;
  }
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
      const ip = req.ip || "unknown";
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
    app.get("*", (req: express.Request, res: express.Response) => {
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
