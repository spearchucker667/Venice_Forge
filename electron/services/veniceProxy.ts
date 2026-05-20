/**
 * Venice local proxy server for the Electron main process.
 *
 * Starts an Express server bound ONLY to 127.0.0.1 on a random available port.
 * Injects the Venice API key (from secureStore) on every proxied request.
 * Renderer calls http://127.0.0.1:{port}/api/venice/* — the API key never leaves
 * the main process.
 */
import express, { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import type { Server } from "http";
import { getApiKey } from "./secureStore";

const VENICE_BASE = "https://api.venice.ai/api/v1";

const ALLOWED_PATHS = [
  "/models",
  "/chat/completions",
  "/image/generate",
  "/image/upscale",
];

const MAX_BODY_BYTES = 26_214_400; // 25 MB

let _server: Server | null = null;
let _port: number | null = null;

function pickRandomPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const net = require("net") as typeof import("net");
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close(() => reject(new Error("Could not get port")));
        return;
      }
      const p = addr.port;
      srv.close(() => resolve(p));
    });
    srv.on("error", reject);
  });
}

export async function startVeniceProxy(): Promise<number> {
  if (_server && _port) return _port;

  const port = await pickRandomPort();
  const app = express();
  app.disable("x-powered-by");

  // Rate limiting state (simple in-memory)
  const rateLimitWindow = 60_000;
  const rateLimitMax = 120;
  const reqCounts = new Map<string, { count: number; resetTime: number }>();

  app.use("/api/venice", (_req: Request, res: Response, next: NextFunction) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      return res
        .status(401)
        .json({ error: "Venice API key is not configured. Please set it in Settings." });
    }
    next();
  });

  app.use("/api/venice", (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = req.ip || "local";
    const rec = reqCounts.get(ip) || { count: 0, resetTime: now + rateLimitWindow };
    if (now > rec.resetTime) {
      rec.count = 1;
      rec.resetTime = now + rateLimitWindow;
    } else {
      rec.count++;
      if (rec.count > rateLimitMax) {
        return res.status(429).json({ error: "Rate limit exceeded." });
      }
    }
    reqCounts.set(ip, rec);
    next();
  });

  app.use("/api/venice", (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "POST" && req.method !== "GET") {
      return res.status(405).json({ error: "Method not allowed." });
    }
    const isAllowed = ALLOWED_PATHS.some(
      (p) => req.path === p || req.path.startsWith(p + "?") || req.path.startsWith(p + "/")
    );
    if (!isAllowed && req.path !== "/") {
      return res.status(403).json({ error: `Endpoint ${req.path} is not allowed.` });
    }
    next();
  });

  app.use(
    "/api/venice",
    express.raw({ type: "*/*", limit: MAX_BODY_BYTES }),
    createProxyMiddleware({
      target: VENICE_BASE,
      changeOrigin: true,
      pathRewrite: { "^/api/venice": "" },
      on: {
        proxyReq: (proxyReq: any, req: any) => {
          const apiKey = getApiKey();
          if (apiKey) {
            proxyReq.setHeader("Authorization", `Bearer ${apiKey}`);
          }
          if (req.body && Buffer.isBuffer(req.body)) {
            proxyReq.setHeader("Content-Length", req.body.length);
            proxyReq.write(req.body);
          }
        },
        error: (_err: unknown, _req: unknown, res: any) => {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Bad Gateway: Failed to reach Venice API." }));
        },
      },
    })
  );

  await new Promise<void>((resolve, reject) => {
    _server = app.listen(port, "127.0.0.1", () => resolve());
    _server!.once("error", reject);
  });

  _port = port;
  console.log(`[VeniceProxy] Listening on http://127.0.0.1:${port}/api/venice`);
  return port;
}

export function stopVeniceProxy(): void {
  _server?.close();
  _server = null;
  _port = null;
}

export function getProxyPort(): number | null {
  return _port;
}
