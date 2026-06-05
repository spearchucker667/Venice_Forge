// Code Owner: fayeblade (@spearchucker667)
// Express web proxy and Vite dev-server bootstrap.
import express from "express";
import fs from "fs";
import path from "path";
import type * as http from "node:http";
import dns from "node:dns/promises";
import nodeHttp from "node:http";
import nodeHttps from "node:https";
import dotenv from "dotenv";
import { createProxyMiddleware } from "http-proxy-middleware";
import {
  ALLOWED_VENICE_ENDPOINTS,
  ALLOWED_VENICE_METHODS,
  VeniceIpcEndpoint,
  VeniceIpcMethod,
  isAllowedVeniceRequest,
} from "./src/shared/validation";
import { VENICE_API_HOST, VENICE_API_BASE_PATH } from "./src/shared/apiConfig";
import { AppConfig } from "./src/shared/configSchema";
import { warn, error } from "./src/shared/logger";
import { assessChildExploitationSafety, recordDecision } from "./src/shared/safety";
import type { SafetyGuardDecision } from "./src/shared/safety";
import { pathToFileURL, fileURLToPath } from "node:url";
import { isPrivateHostname } from "./electron/utils/urlSecurity";

dotenv.config();

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
  req: VeniceProxyRequest
) {
  for (const header of FORBIDDEN_RENDERER_PROXY_HEADERS) {
    proxyReq.removeHeader(header);
  }

  proxyReq.setHeader("Authorization", `Bearer ${AppConfig.VENICE_API_KEY}`);
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

  // Trust proxy only when explicitly configured via TRUST_PROXY env var,
  // to prevent IP spoofing when the server is accessed directly without a trusted reverse proxy.
  if (AppConfig.TRUST_PROXY) {
    app.set("trust proxy", AppConfig.TRUST_PROXY);
  }

  // Security headers for all responses
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    // In non-production environments Vite HMR uses WebSocket connections, so we
    // widen connect-src to include ws: / wss:. In production only 'self' is allowed.
    const isProduction = AppConfig.NODE_ENV === "production";
    const connectSrc = isProduction ? "connect-src 'self'" : "connect-src 'self' ws: wss:";
    const styleSrc = isProduction ? "style-src 'self'" : "style-src 'self' 'unsafe-inline'";
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self'",
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

  // Simple Rate Limiting
  const rateLimitWindowMs = AppConfig.RATE_LIMIT_WINDOW_MS;
  const rateLimitMax = AppConfig.RATE_LIMIT_MAX_REQUESTS;
  const MAX_RATE_LIMIT_ENTRIES = 10_000;
  const reqCounts = new Map<string, { count: number; resetTime: number; lastSeen: number }>();

  const rateLimitCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of reqCounts.entries()) {
      if (now > record.resetTime) {
        reqCounts.delete(ip);
      }
    }
  }, Math.max(10000, rateLimitWindowMs)).unref();

  app.use("/api/venice", (req, res, next) => {
    if (!AppConfig.VENICE_API_KEY && AppConfig.NODE_ENV !== "test") {
      return res.status(500).json({ error: "VENICE_API_KEY is not configured on the server." });
    }

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
  });

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
    
    // Check if path matches any allowed endpoint
    const isAllowed = ALLOWED_VENICE_ENDPOINTS.includes(req.path as VeniceIpcEndpoint);
    if (!isAllowed) {
       return res.status(403).json({ error: `Endpoint ${req.path} not allowed` });
    }
    if (!isAllowedVeniceRequest(req.path, method)) {
       return res.status(405).json({ error: `Method ${method} not allowed for endpoint ${req.path}` });
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
        decision = assessChildExploitationSafety({ endpoint, method: "POST", payload: body, source: "web-proxy" });
        recordDecision(decision);
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

      if (!decision.allow || decision.action === "block") {
        res.status(451).json({
          error: decision.userMessage,
          reasonCode: decision.reasonCode,
          category: decision.category,
          severity: decision.severity,
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
          applyVeniceProxyHeaders(proxyReq, req);
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

      const decision = assessChildExploitationSafety({ endpoint: requestUrl, method: "GET", text: decodeURIComponent(requestUrl), source: "web-proxy" });
      recordDecision(decision);
      if (!decision.allow || decision.action === "block") {
        return res.status(451).json({ error: decision.userMessage });
      }

      const headers: Record<string, string> = {};
      let clientJinaKey = "";
      if (requestHeaders && typeof requestHeaders === "object" && !Array.isArray(requestHeaders)) {
        for (const [key, value] of Object.entries(requestHeaders)) {
          if (typeof value === "string") {
            if (/^authorization$/i.test(key)) {
              const match = value.match(/^bearer\s+(.+)$/i);
              if (match) clientJinaKey = match[1];
            } else if (/^x-jina-api-key$/i.test(key)) {
              clientJinaKey = value;
            } else {
              headers[key] = value;
            }
          }
        }
      }

      const finalJinaKey = clientJinaKey || AppConfig.JINA_API_KEY;
      if (finalJinaKey) {
        headers["Authorization"] = `Bearer ${finalJinaKey}`;
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
        const body = contentType.includes("application/json")
          ? await response.json().catch(() => null)
          : await response.text();

        return res.status(response.status).json(body);
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return res.status(504).json({ error: "Request timed out" });
      }
      return res.status(500).json({ error: err instanceof Error ? err.message : "Jina request failed" });
    }
  });

  // Generic scrape proxy with SSRF protection (DNS resolution)
  app.post("/api/proxy-scrape", express.json(), async (req, res) => {
    try {
      const url = req.body?.url;
      if (typeof url !== "string") {
        return res.status(400).json({ error: "Missing or invalid URL" });
      }

      const decision = assessChildExploitationSafety({ endpoint: url, method: "GET", text: decodeURIComponent(url), source: "web-proxy" });
      recordDecision(decision);
      if (!decision.allow || decision.action === "block") {
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

      for (const r of lookupResults) {
        if (isPrivateHostname(r.address)) {
          return res.status(403).json({ error: "Access to private IPs blocked" });
        }
      }
      const lookupResult = lookupResults[0];

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
      return res.status(500).json({ error: err instanceof Error ? err.message : "Scrape failed" });
    }
  });

  (app as express.Application & { cleanupIntervals?: () => void; staticRateLimiterCleanup?: ReturnType<typeof setInterval> }).cleanupIntervals = () => {
    clearInterval(rateLimitCleanupInterval);
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
    app.get("*", (_req: express.Request, res: express.Response) => {
      res.type("html").send(indexHtml);
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
