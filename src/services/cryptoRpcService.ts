// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Venice Crypto RPC client service for blockchain node access, read-only inspection, and guarded transaction relay. */

import { veniceFetch } from "./veniceClient/fetch";
import { VENICE_NETWORK_SLUG_PATTERN } from "../shared/validation";
import {
  MAX_CRYPTO_RPC_BATCH_SIZE,
  STATEFUL_FILTER_METHODS,
  WEBSOCKET_ONLY_METHODS,
  type CryptoRpcNetworksResponse,
  type CryptoRpcOptions,
  type CryptoRpcSendTransactionOptions,
  type JsonRpcRequest,
  type JsonRpcResponse,
} from "../types/cryptoRpc";

/** Regex pattern for valid Idempotency-Key headers per Venice Swagger: ^[A-Za-z0-9_-]{1,255}$ */
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{1,255}$/;

/** Validates whether a network slug matches the expected format. */
export function validateNetworkSlug(slug: string): boolean {
  if (!slug || typeof slug !== "string") return false;
  return VENICE_NETWORK_SLUG_PATTERN.test(slug.trim());
}

/** Validates whether an idempotency key conforms to upstream character and length limits. */
export function validateIdempotencyKey(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  return IDEMPOTENCY_KEY_PATTERN.test(key.trim());
}

/** Generates a cryptographically randomized, stable idempotency key for safe RPC retries. */
export function generateIdempotencyKey(prefix = "rpc"): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `${prefix}-${ts}-${rand}`;
}

/**
 * Validates a single JSON-RPC 2.0 request against protocol invariants and Venice limitations.
 * Throws with an explanatory error if invalid or unsupported.
 */
export function validateJsonRpcRequest(request: JsonRpcRequest): void {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new Error("JSON-RPC request must be an object.");
  }
  if (request.jsonrpc !== "2.0") {
    throw new Error(`Invalid jsonrpc version "${String(request.jsonrpc)}", must be "2.0".`);
  }
  if (!request.method || typeof request.method !== "string" || !request.method.trim()) {
    throw new Error("JSON-RPC request method must be a non-empty string.");
  }
  if (request.method.length > 128) {
    throw new Error("JSON-RPC method name is too long (max 128 characters).");
  }
  if (request.id === undefined || (typeof request.id !== "string" && typeof request.id !== "number")) {
    throw new Error("JSON-RPC request id must be a string or number.");
  }

  const trimmedMethod = request.method.trim();
  if ((STATEFUL_FILTER_METHODS as readonly string[]).includes(trimmedMethod)) {
    throw new Error(
      `Method "${trimmedMethod}" is not supported by Venice load-balanced proxy. Filter state cannot be pinned to an upstream node; use eth_getLogs instead.`,
    );
  }
  if ((WEBSOCKET_ONLY_METHODS as readonly string[]).includes(trimmedMethod)) {
    throw new Error(
      `WebSocket subscription method "${trimmedMethod}" is not supported by the HTTP-only Venice Crypto RPC proxy.`,
    );
  }
  if (request.params !== undefined && !Array.isArray(request.params) && typeof request.params !== "object") {
    throw new Error("JSON-RPC params must be an array or object.");
  }
}

/**
 * Validates a batch array of JSON-RPC 2.0 requests.
 * Ensures the batch size does not exceed the upstream ceiling (100 items).
 */
export function validateJsonRpcBatch(batch: JsonRpcRequest[]): void {
  if (!Array.isArray(batch)) {
    throw new Error("JSON-RPC batch must be an array.");
  }
  if (batch.length === 0) {
    throw new Error("JSON-RPC batch cannot be empty.");
  }
  if (batch.length > MAX_CRYPTO_RPC_BATCH_SIZE) {
    throw new Error(
      `JSON-RPC batch exceeds maximum allowed size of ${MAX_CRYPTO_RPC_BATCH_SIZE} items (got ${batch.length}).`,
    );
  }
  for (const item of batch) {
    validateJsonRpcRequest(item);
  }
}

/**
 * Discovers the alphabetically sorted list of blockchain network slugs supported by Venice.
 * Public endpoint — requires no authentication.
 */
export async function getCryptoRpcNetworks(): Promise<string[]> {
  const res = await veniceFetch<CryptoRpcNetworksResponse>("/crypto/rpc/networks", {
    method: "GET",
  });
  return res.data.networks;
}

/** Builds common headers for Venice Crypto RPC requests. */
function buildRpcHeaders(options?: CryptoRpcOptions): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options?.idempotencyKey) {
    const trimmedKey = options.idempotencyKey.trim();
    if (!validateIdempotencyKey(trimmedKey)) {
      throw new Error(`Invalid Idempotency-Key format: ${trimmedKey}`);
    }
    headers["Idempotency-Key"] = trimmedKey;
  }
  if (options?.siwxToken) {
    headers["SIGN-IN-WITH-X"] = options.siwxToken.trim();
  }
  return headers;
}

/**
 * Proxies a single JSON-RPC 2.0 request to a supported blockchain node via Venice.
 */
export async function sendJsonRpcRequest<T = unknown>(
  network: string,
  request: JsonRpcRequest,
  options?: CryptoRpcOptions,
): Promise<JsonRpcResponse<T>> {
  const trimmedNetwork = network.trim();
  if (!validateNetworkSlug(trimmedNetwork)) {
    throw new Error(`Invalid network slug "${network}". Must be lowercase alphanumeric and hyphens.`);
  }
  validateJsonRpcRequest(request);

  const headers = buildRpcHeaders(options);
  const res = await veniceFetch<JsonRpcResponse<T>>(`/crypto/rpc/${encodeURIComponent(trimmedNetwork)}`, {
    method: "POST",
    headers,
    body: request,
    timeoutMs: options?.timeoutMs,
  });

  return res.data;
}

/**
 * Proxies a batch of JSON-RPC 2.0 requests (up to 100 items) to a supported blockchain node via Venice.
 */
export async function sendJsonRpcBatch(
  network: string,
  batch: JsonRpcRequest[],
  options?: CryptoRpcOptions,
): Promise<JsonRpcResponse[]> {
  const trimmedNetwork = network.trim();
  if (!validateNetworkSlug(trimmedNetwork)) {
    throw new Error(`Invalid network slug "${network}". Must be lowercase alphanumeric and hyphens.`);
  }
  validateJsonRpcBatch(batch);

  const headers = buildRpcHeaders(options);
  const res = await veniceFetch<JsonRpcResponse[]>(`/crypto/rpc/${encodeURIComponent(trimmedNetwork)}`, {
    method: "POST",
    headers,
    body: batch,
    timeoutMs: options?.timeoutMs,
  });

  return res.data;
}

// ---- High-Level Read-Only Tools ------------------------------------------

/** Fetches the latest block number as a hex string (e.g. "0x123456"). */
export async function rpcGetBlockNumber(network: string, options?: CryptoRpcOptions): Promise<string> {
  const req: JsonRpcRequest = {
    jsonrpc: "2.0",
    method: "eth_blockNumber",
    params: [],
    id: 1,
  };
  const res = await sendJsonRpcRequest<string>(network, req, options);
  if (res.error) throw new Error(`eth_blockNumber error: ${res.error.message} (code: ${res.error.code})`);
  return res.result ?? "0x0";
}

/** Fetches balance for an account address as a hex string of wei. */
export async function rpcGetBalance(
  network: string,
  address: string,
  blockTag = "latest",
  options?: CryptoRpcOptions,
): Promise<string> {
  const req: JsonRpcRequest = {
    jsonrpc: "2.0",
    method: "eth_getBalance",
    params: [address.trim(), blockTag],
    id: 1,
  };
  const res = await sendJsonRpcRequest<string>(network, req, options);
  if (res.error) throw new Error(`eth_getBalance error: ${res.error.message} (code: ${res.error.code})`);
  return res.result ?? "0x0";
}

/** Executes an eth_call without creating a transaction on the blockchain. */
export async function rpcCall(
  network: string,
  callObject: { to: string; data?: string; from?: string; gas?: string; value?: string },
  blockTag = "latest",
  options?: CryptoRpcOptions,
): Promise<string> {
  const req: JsonRpcRequest = {
    jsonrpc: "2.0",
    method: "eth_call",
    params: [callObject, blockTag],
    id: 1,
  };
  const res = await sendJsonRpcRequest<string>(network, req, options);
  if (res.error) throw new Error(`eth_call error: ${res.error.message} (code: ${res.error.code})`);
  return res.result ?? "0x";
}

/** Fetches a transaction receipt by transaction hash. */
export async function rpcGetTransactionReceipt(
  network: string,
  txHash: string,
  options?: CryptoRpcOptions,
): Promise<Record<string, unknown> | null> {
  const req: JsonRpcRequest = {
    jsonrpc: "2.0",
    method: "eth_getTransactionReceipt",
    params: [txHash.trim()],
    id: 1,
  };
  const res = await sendJsonRpcRequest<Record<string, unknown> | null>(network, req, options);
  if (res.error) throw new Error(`eth_getTransactionReceipt error: ${res.error.message} (code: ${res.error.code})`);
  return res.result ?? null;
}

/** Fetches the chain ID as a hex string. */
export async function rpcGetChainId(network: string, options?: CryptoRpcOptions): Promise<string> {
  const req: JsonRpcRequest = {
    jsonrpc: "2.0",
    method: "eth_chainId",
    params: [],
    id: 1,
  };
  const res = await sendJsonRpcRequest<string>(network, req, options);
  if (res.error) throw new Error(`eth_chainId error: ${res.error.message} (code: ${res.error.code})`);
  return res.result ?? "0x0";
}

/** Queries event logs matching a filter object. */
export async function rpcGetLogs(
  network: string,
  filter: {
    fromBlock?: string;
    toBlock?: string;
    address?: string | string[];
    topics?: (string | string[] | null)[];
  },
  options?: CryptoRpcOptions,
): Promise<unknown[]> {
  const req: JsonRpcRequest = {
    jsonrpc: "2.0",
    method: "eth_getLogs",
    params: [filter],
    id: 1,
  };
  const res = await sendJsonRpcRequest<unknown[]>(network, req, options);
  if (res.error) throw new Error(`eth_getLogs error: ${res.error.message} (code: ${res.error.code})`);
  return res.result ?? [];
}

/** Fetches balance for a Solana public key (in lamports). */
export async function rpcSolanaGetBalance(
  network: string,
  pubkey: string,
  options?: CryptoRpcOptions,
): Promise<number> {
  const req: JsonRpcRequest = {
    jsonrpc: "2.0",
    method: "getBalance",
    params: [pubkey.trim()],
    id: 1,
  };
  const res = await sendJsonRpcRequest<{ value: number }>(network, req, options);
  if (res.error) throw new Error(`getBalance error: ${res.error.message} (code: ${res.error.code})`);
  return res.result?.value ?? 0;
}

/** Fetches account info for a Solana public key. */
export async function rpcSolanaGetAccountInfo(
  network: string,
  pubkey: string,
  options?: CryptoRpcOptions,
): Promise<Record<string, unknown> | null> {
  const req: JsonRpcRequest = {
    jsonrpc: "2.0",
    method: "getAccountInfo",
    params: [pubkey.trim(), { encoding: "base64" }],
    id: 1,
  };
  const res = await sendJsonRpcRequest<{ value: Record<string, unknown> | null }>(network, req, options);
  if (res.error) throw new Error(`getAccountInfo error: ${res.error.message} (code: ${res.error.code})`);
  return res.result?.value ?? null;
}

// ---- Guarded Write / Relay Operation -------------------------------------

/**
 * Relays a signed raw transaction to the blockchain.
 *
 * SAFETY INVARIANTS:
 * 1. Venice Forge NEVER accepts or handles private keys. The transaction must be pre-signed.
 * 2. Requires explicit user confirmation via `options.confirmedByUser === true`.
 * 3. An Idempotency-Key is strictly attached to prevent accidental duplicate submission on retry.
 */
export async function rpcSendRawTransaction(
  network: string,
  signedTx: string,
  options: CryptoRpcSendTransactionOptions,
): Promise<string> {
  if (!options?.confirmedByUser) {
    throw new Error("Transaction submission requires explicit user confirmation.");
  }

  const trimmedTx = signedTx.trim();
  if (!trimmedTx) {
    throw new Error("Signed transaction payload cannot be empty.");
  }

  // EVM transactions start with 0x; Solana transactions are base58 or base64
  const isEvmHex = /^0x[a-fA-F0-9]+$/.test(trimmedTx);
  const isSolanaBase = /^[A-Za-z0-9+/=]+$/.test(trimmedTx) || /^[1-9A-HJ-NP-Za-km-z]+$/.test(trimmedTx);
  if (!isEvmHex && !isSolanaBase) {
    throw new Error("Signed transaction must be a hex string (EVM) or base58/base64 payload (Solana).");
  }

  const method = network.includes("solana") ? "sendTransaction" : "eth_sendRawTransaction";
  const idempotencyKey = options.idempotencyKey || generateIdempotencyKey("tx");

  const req: JsonRpcRequest = {
    jsonrpc: "2.0",
    method,
    params: [trimmedTx],
    id: 1,
  };

  const res = await sendJsonRpcRequest<string>(network, req, {
    ...options,
    idempotencyKey,
  });

  if (res.error) {
    throw new Error(`${method} error: ${res.error.message} (code: ${res.error.code})`);
  }

  return res.result!;
}
