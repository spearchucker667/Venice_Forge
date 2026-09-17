// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview TypeScript types and contracts for the Venice x402 keyless wallet authentication and payment rail. */

export type X402AuthMode = "api_key" | "x402";

export type X402NetworkType = "evm" | "solana" | "unknown";

export interface X402BalanceData {
  walletAddress: string;
  balanceUsd: number;
  canConsume: boolean;
  minimumTopUpUsd: number;
  suggestedTopUpUsd: number;
  diemBalanceUsd?: number;
}

export interface X402BalanceResponse {
  success: true;
  data: X402BalanceData;
}

export interface X402PaymentOption {
  scheme: "exact";
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra?: {
    name?: string;
    version?: string;
    feePayer?: string;
    [key: string]: unknown;
  };
}

export interface X402PaymentRequirements {
  x402Version: number;
  accepts: X402PaymentOption[];
}

export interface X402TopUpData {
  walletAddress: string;
  amountCredited: number;
  newBalance: number;
  paymentId: string;
}

export interface X402TopUpResponse {
  success: true;
  data: X402TopUpData;
}

export interface X402Transaction {
  id: string;
  amount: number;
  balanceAfter: number;
  type: string;
  createdAt: string;
  requestId: string | null;
  modelId: string | null;
}

export interface X402TransactionsPagination {
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface X402TransactionsData {
  walletAddress: string;
  currentBalance: number;
  transactions: X402Transaction[];
  pagination: X402TransactionsPagination;
}

export interface X402TransactionsResponse {
  success: true;
  data: X402TransactionsData;
}

export interface X402ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, unknown>;
}
