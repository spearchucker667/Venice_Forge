import express from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import { Server } from "http";
import { abortVeniceRequest } from "./veniceClient";
import { SafetyGuardBlockedError } from "../../src/shared/safety";
import { performGuardedVeniceRequest, checkLocalFamilyGuard } from "./guardPipeline";
import { logInfo, logError } from "./logger";
import { isValidBridgeHost } from "../utils/bridgeHost";

const BRIDGE_BODY_LIMIT = "10mb";
const BRIDGE_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

/** Minimum length for an env-supplied bridge bearer token (P2-009). The
 *  generated token is `crypto.randomBytes(32).toString("hex")` = 64 hex
 *  chars, so this is well below that ceiling. Catches short or accidental
 *  test tokens like "abc" or "dev" that would otherwise be accepted as
 *  the only credential guarding /chat/completions. */
const MIN_BRIDGE_TOKEN_LENGTH = 32;

/** Minimum number of distinct characters in an env-supplied token. A
 *  brute-force attacker can guess "aaaaaaaaaaaaaaaaaaaaaaaaaaaa" in a
 *  fraction of a millisecond; this guard rejects such all-same tokens
 *  even if they meet the length floor. */
const MIN_BRIDGE_TOKEN_DISTINCT_CHARS = 8;

let serverInstance: Server | null = null;
let bridgeToken: string = "";

export function getBridgeToken(): string {
  return bridgeToken;
}

/** Validates that an env-supplied bridge token has enough entropy to be
 *  used as the sole credential for the loopback bridge. P2-009 closes
 *  the "operator sets VENICE_BRIDGE_TOKEN=abc and forgets" gap.
 *
 *  Rules:
 *  1. At least `MIN_BRIDGE_TOKEN_LENGTH` characters.
 *  2. At least `MIN_BRIDGE_TOKEN_DISTINCT_CHARS` distinct characters.
 *     Rejects "aaaaaaaa…" / "11111111…" / "12341234…" (periodic low-entropy).
 *  3. Not all whitespace.
 *
 *  Returns a human-readable failure reason or null when the token is OK. */
export function validateBridgeTokenStrength(token: string): string | null {
  if (typeof token !== "string") {
    return "bridge token must be a string";
  }
  if (token.length < MIN_BRIDGE_TOKEN_LENGTH) {
    return `bridge token is too short (${token.length} < ${MIN_BRIDGE_TOKEN_LENGTH} chars)`;
  }
  if (token.trim().length === 0) {
    return "bridge token is empty or whitespace";
  }
  const distinct = new Set(token);
  if (distinct.size < MIN_BRIDGE_TOKEN_DISTINCT_CHARS) {
    return `bridge token has insufficient entropy (${distinct.size} distinct chars < ${MIN_BRIDGE_TOKEN_DISTINCT_CHARS})`;
  }
  return null;
}

/** Constant-time comparison of two bearer tokens.
 *  The naive `token !== bridgeToken` leaks length and prefix-match timing
 *  through short-circuit string comparison. timingSafeEqual forces a
 *  constant-time compare but requires equal-length buffers; we pad/hash
 *  to keep that property. */
const MAX_BRIDGE_TOKEN_LENGTH = 512;

function safeTokenCompare(provided: string, expected: string): boolean {
  if (provided.length > MAX_BRIDGE_TOKEN_LENGTH) return false;
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

export function startBridgeServer(
  port = 5062,
  host = "127.0.0.1",
  options?: { requestTimeoutMs?: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (serverInstance) {
      resolve(bridgeToken);
      return;
    }

    if (!isValidBridgeHost(host)) {
      reject(new Error(`Invalid bridge host "${host}". Only 127.0.0.1, localhost, and ::1 are allowed.`));
      return;
    }

    // Load or generate authentication token. If the operator supplied one
    // via VENICE_BRIDGE_TOKEN, validate its strength (P2-009) before
    // trusting it — a short or all-same token is the only credential
    // guarding /chat/completions etc. On validation failure we warn and
    // fall back to a freshly generated 32-byte hex token rather than
    // refusing to start; the alternative is a hard crash that operators
    // could accidentally bypass by setting an even weaker token in a
    // panic.
    const envToken = process.env.VENICE_BRIDGE_TOKEN;
    if (envToken) {
      const strengthError = validateBridgeTokenStrength(envToken);
      if (strengthError) {
        logError("VENICE_BRIDGE_TOKEN rejected by strength check; falling back to a generated token", strengthError);
        console.warn(`[Bridge Server] VENICE_BRIDGE_TOKEN rejected: ${strengthError}. Generating a fresh token.`);
        bridgeToken = crypto.randomBytes(32).toString("hex");
      } else {
        bridgeToken = envToken;
      }
    } else {
      bridgeToken = crypto.randomBytes(32).toString("hex");
    }

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

      // P1: streaming requests need a synchronous 451 before any
      // Content-Type / SSE headers are written, so we pre-check with
      // checkLocalFamilyGuard. Non-streaming requests are routed through
      // performGuardedVeniceRequest below, which evaluates the guard
      // exactly once and emits the canonical 451 shape on block.
      if (method === "POST" && body) {
        const isStreaming = req.path === "/chat/completions" && body?.stream === true;
        if (isStreaming) {
          const block = checkLocalFamilyGuard({
            endpoint,
            method,
            payload: body,
            source: "ipc", // Authoritative backend main-process context
          });
          if (block) {
            res.status(451).json(block.body);
            return;
          }
        }
      }

      let requestTimedOut = false;
      // SECURITY: every bridge request — streaming OR non-streaming — must
      // generate a signalId so the timeout and disconnect handlers can abort
      // the upstream Venice HTTPS request. Before this fix, non-streaming
      // requests had no signalId, so the 5-minute timeout closed the
      // response but the upstream request kept running in the background,
      // burning Venice quota for a renderer that no longer cared.
      const signalId = crypto.randomUUID();
      const requestTimeout = setTimeout(() => {
        requestTimedOut = true;
        logError("Bridge request exceeded timeout", { endpoint, method });
        try {
          abortVeniceRequest(signalId);
        } catch (err) {
          logError("Failed to abort upstream request on timeout", String(err));
        }
        if (!res.headersSent) {
          res.status(504).json({ error: "Bridge request timed out" });
        } else {
          res.end();
        }
      }, options?.requestTimeoutMs ?? BRIDGE_REQUEST_TIMEOUT_MS);

      try {
        const isStreaming = method === "POST" && endpoint === "/chat/completions" && body?.stream === true;

        if (isStreaming) {
          res.setHeader("Content-Type", "text/event-stream");
          res.setHeader("Cache-Control", "no-cache");
          res.setHeader("Connection", "keep-alive");
          res.flushHeaders();

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

          // P1: route streaming through the centralized guardPipeline so any
          // SafetyGuardBlockedError thrown by performVeniceRequest is converted
          // into the canonical 451 block shape (defence-in-depth). The pre-check
          // above catches the common case; this catches the inline case.
          const result = await performGuardedVeniceRequest(
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

          if (result.kind === "blocked") {
            // Streaming 451: write a single SSE error event with the canonical
            // block body, then end the stream.
            res.write(`data: ${JSON.stringify({ error: result.block.body })}\n\n`);
            res.write("data: [DONE]\n\n");
            res.end();
            return;
          }

          const response = result.response;
          if (!response.ok) {
            res.write(`data: ${JSON.stringify({ error: response.body })}\n\n`);
          }

          res.write("data: [DONE]\n\n");
          res.end();
        } else {
          // Non-streaming request — use the centralized guardPipeline so the
          // 451 block body is identical to the IPC path. signalId is
          // forwarded so the timeout handler above can abort the upstream
          // Venice HTTPS request when the response deadline is exceeded.
          const result = await performGuardedVeniceRequest({
            endpoint,
            method,
            body,
            signalId,
          });

          if (result.kind === "blocked") {
            res.status(result.block.status).json(result.block.body);
            return;
          }

          res.status(result.response.status).json(result.response.body);
        }
      } catch (err: unknown) {
        if (requestTimedOut) return;
        if (err instanceof SafetyGuardBlockedError) {
          // Defence-in-depth: the guard pipeline should already have converted
          // this into a 451 block before re-throwing, but a stray throw from
          // performVeniceRequest is still possible on a future refactor.
          res.status(451).json({
            error: err.decision.userMessage,
            reasonCode: err.decision.reasonCode,
            category: err.decision.category,
            severity: err.decision.severity,
          });
          return;
        }
        res.status(500).json({ error: "Internal server error" });
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
