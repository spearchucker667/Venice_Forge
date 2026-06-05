import express from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import { Server } from "http";
import { performVeniceRequest, abortVeniceRequest } from "./veniceClient";
import { assessChildExploitationSafety, recordDecision } from "../../src/shared/safety";
import { logInfo, logError } from "./logger";

const BRIDGE_BODY_LIMIT = "10mb";
const BRIDGE_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

let serverInstance: Server | null = null;
let bridgeToken: string = "";

export function getBridgeToken(): string {
  return bridgeToken;
}

/** Constant-time comparison of two bearer tokens.
 *  The naive `token !== bridgeToken` leaks length and prefix-match timing
 *  through short-circuit string comparison. timingSafeEqual forces a
 *  constant-time compare but requires equal-length buffers; we pad/hash
 *  to keep that property. */
function safeTokenCompare(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided, "utf-8");
  const expectedBuf = Buffer.from(expected, "utf-8");
  if (providedBuf.length !== expectedBuf.length) {
    // Force equal-length comparison to avoid leaking length through timing.
    // We still need to consume the same time as a full match, so we compare
    // against the expected buffer padded with itself to match the provided
    // length, and always run timingSafeEqual on equal-length inputs.
    const padded = Buffer.alloc(providedBuf.length);
    expectedBuf.copy(padded, 0, 0, Math.min(expectedBuf.length, providedBuf.length));
    crypto.timingSafeEqual(providedBuf, padded);
    return false;
  }
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

export function startBridgeServer(port = 5062, host = "127.0.0.1"): Promise<string> {
  return new Promise((resolve, reject) => {
    if (serverInstance) {
      resolve(bridgeToken);
      return;
    }

    // Load or generate authentication token
    bridgeToken = process.env.VENICE_BRIDGE_TOKEN || crypto.randomBytes(32).toString("hex");

    const app = express();
    // SECURITY: cap the JSON body to prevent OOM via a single huge payload.
    app.use(express.json({ limit: BRIDGE_BODY_LIMIT }));

    // Token Auth Middleware
    app.use((req: Request, res: Response, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized: Missing or invalid authorization header." });
        return;
      }
      const token = authHeader.substring(7);
      if (!safeTokenCompare(token, bridgeToken)) {
        res.status(401).json({ error: "Unauthorized: Invalid credentials." });
        return;
      }
      next();
    });

    // Health/ping endpoint
    app.get("/ping", (_req, res) => {
      res.json({ ok: true, message: "Venice Forge Bridge is running." });
    });

    // Unified endpoint router for Venice API calls
    app.all("*", async (req: Request, res: Response) => {
      const endpoint = req.path;
      const method = req.method;
      const body = req.body;

      // Only allow GET or POST
      if (method !== "GET" && method !== "POST") {
        res.status(405).json({ error: "Method Not Allowed" });
        return;
      }

      // Enforce the Safety Guard for POST payloads
      if (method === "POST" && body) {
        const decision = assessChildExploitationSafety({
          endpoint,
          method,
          payload: body,
          source: "ipc", // Authoritative backend main-process context
        });
        recordDecision(decision);

        if (!decision.allow || decision.action === "block") {
          res.status(451).json({
            error: {
              message: decision.userMessage,
              reasonCode: decision.reasonCode,
              category: decision.category,
              severity: decision.severity,
            },
          });
          return;
        }
      }

      let requestTimedOut = false;
      const requestTimeout = setTimeout(() => {
        requestTimedOut = true;
        logError("Bridge request exceeded timeout", { endpoint, method });
        if (!res.headersSent) {
          res.status(504).json({ error: "Bridge request timed out" });
        } else {
          res.end();
        }
      }, BRIDGE_REQUEST_TIMEOUT_MS);

      try {
        const isStreaming = method === "POST" && endpoint === "/chat/completions" && body?.stream === true;

        if (isStreaming) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
          res.flushHeaders();

          const signalId = crypto.randomUUID();
          let clientDisconnected = false;

          // SECURITY: if the client disconnects mid-stream, abort the upstream
          // HTTPS request — otherwise we hold a live connection and burn tokens
          // for a renderer that no longer cares.
          const onClose = () => {
            clientDisconnected = true;
            try {
              abortVeniceRequest(signalId);
            } catch (err) {
              logError("Failed to abort upstream request on client disconnect", String(err));
            }
          };
          req.on("close", onClose);
          res.on("close", onClose);

          const response = await performVeniceRequest(
            {
              endpoint,
              method,
              body,
              signalId,
            },
            {
              onDelta: (chunk) => {
                if (clientDisconnected || requestTimedOut) return;
                const sseChunk = {
                  id: `chatcmpl-${crypto.randomUUID()}`,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model: body.model || "venice-model",
                  choices: [
                    {
                      index: 0,
                      delta: {
                        content: chunk.content,
                        reasoning_content: chunk.reasoning,
                      },
                      finish_reason: null,
                    },
                  ],
                };
                try {
                  res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
                } catch (err) {
                  logError("Failed to write SSE chunk", String(err));
                  onClose();
                }
              },
            }
          );

          if (clientDisconnected) return;
          if (!response.ok) {
            res.write(`data: ${JSON.stringify({ error: response.body })}\n\n`);
          }

          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          // Non-streaming request
          const response = await performVeniceRequest({
            endpoint,
            method,
            body,
          });

          res.status(response.status).json(response.body);
        }
      } catch (err: unknown) {
        if (requestTimedOut) return;
        res.status(500).json({ error: (err as Error).message || String(err) });
      } finally {
        clearTimeout(requestTimeout);
      }
    });

    try {
      serverInstance = app.listen(port, host, () => {
        // SECURITY: never log the bearer token. The operator should source it
        // from the VENICE_BRIDGE_TOKEN env var (if set) or call getBridgeToken()
        // from a separate secured control channel.
        // eslint-disable-next-line no-console
        console.log(`[Bridge Server] Loopback server running at http://${host}:${port}`);
        logInfo("Bridge server listening", { host, port, tokenSource: process.env.VENICE_BRIDGE_TOKEN ? "env" : "generated" });
        resolve(bridgeToken);
      });

      serverInstance.on("error", (err: Error) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

export function stopBridgeServer(): void {
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
    logInfo("Stopped loopback bridge server.");
  }
}
