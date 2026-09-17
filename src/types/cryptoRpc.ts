// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview TypeScript types and contracts for the Venice Crypto RPC proxy and agent tools. */

/** Standard JSON-RPC 2.0 ID type (numeric or string identifier). */
export type JsonRpcId = number | string;

/** Standard JSON-RPC 2.0 request payload. */
export interface JsonRpcRequest<TParams = unknown[]> {
  jsonrpc: "2.0";
  method: string;
  params?: TParams;
  id: JsonRpcId;
}

/** Standard JSON-RPC 2.0 error object. */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/** Standard JSON-RPC 2.0 response payload. */
export interface JsonRpcResponse<TResult = unknown> {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: TResult;
  error?: JsonRpcError;
}

/** Response shape for GET /crypto/rpc/networks. */
export interface CryptoRpcNetworksResponse {
  networks: string[];
}

/** Configuration options for dispatching Venice Crypto RPC calls. */
export interface CryptoRpcOptions {
  /**
   * Idempotency key for safe retries (matches ^[A-Za-z0-9_-]{1,255}$).
   * Cached for 24h by Venice; replaying same key + same body returns cached response.
   */
  idempotencyKey?: string;
  /**
   * Optional Sign-in-with-x (SIWX) authentication token for x402 keyless payment rail.
   * If provided, forwarded via the SIGN-IN-WITH-X header.
   */
  siwxToken?: string;
  /**
   * Venice API profile ID to route through when multiple profiles are configured.
   */
  profileId?: string;
  /**
   * Custom request timeout in milliseconds.
   */
  timeoutMs?: number;
}

/** Options for submitting write / relay operations (e.g. eth_sendRawTransaction). */
export interface CryptoRpcSendTransactionOptions extends CryptoRpcOptions {
  /** Explicit user confirmation must be true to permit broadcasting a signed transaction. */
  confirmedByUser: boolean;
}

/** Methods unsupported by Venice's HTTP load-balanced proxy because state is pinned to upstream node. */
export const STATEFUL_FILTER_METHODS = [
  "eth_newFilter",
  "eth_newBlockFilter",
  "eth_newPendingTransactionFilter",
  "eth_getFilterChanges",
  "eth_getFilterLogs",
  "eth_uninstallFilter",
] as const;

/** Methods unsupported because Venice Crypto RPC is HTTP-only (no WebSocket support). */
export const WEBSOCKET_ONLY_METHODS = [
  "eth_subscribe",
  "eth_unsubscribe",
  "accountSubscribe",
  "accountUnsubscribe",
  "programSubscribe",
  "programUnsubscribe",
  "logsSubscribe",
  "logsUnsubscribe",
  "rootSubscribe",
  "rootUnsubscribe",
  "signatureSubscribe",
  "signatureUnsubscribe",
  "slotSubscribe",
  "slotUnsubscribe",
] as const;

/** Maximum allowed batch size per the Venice Crypto RPC upstream contract. */
export const MAX_CRYPTO_RPC_BATCH_SIZE = 100;
