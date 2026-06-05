import express from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import { Server } from "http";
import { performVeniceRequest } from "./veniceClient";
import { assessChildExploitationSafety, recordDecision } from "../../src/shared/safety";
import { logInfo } from "./logger";

let serverInstance: Server | null = null;
let bridgeToken: string = "";

export function getBridgeToken(): string {
  return bridgeToken;
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
    app.use(express.json());

    // Token Auth Middleware
    app.use((req: Request, res: Response, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized: Missing or invalid authorization header." });
        return;
      }
      const token = authHeader.substring(7);
      if (token !== bridgeToken) {
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

      try {
        const isStreaming = method === "POST" && endpoint === "/chat/completions" && body?.stream === true;

        if (isStreaming) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
          res.flushHeaders();

          const signalId = crypto.randomUUID();
          const response = await performVeniceRequest(
            {
              endpoint,
              method,
              body,
              signalId,
            },
            {
              onDelta: (chunk) => {
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
                res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
              },
            }
          );

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
        res.status(500).json({ error: (err as Error).message || String(err) });
      }
    });

    try {
      serverInstance = app.listen(port, host, () => {
        // eslint-disable-next-line no-console
        console.log(`[Bridge Server] Loopback server running at http://${host}:${port}`);
        // eslint-disable-next-line no-console
        console.log(`[Bridge Server] Authentication Token: ${bridgeToken}`);
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
