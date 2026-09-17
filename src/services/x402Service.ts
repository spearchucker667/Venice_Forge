// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Canonical Venice client service for the x402 keyless wallet authentication and payment rail. */

import { veniceFetch } from "./veniceClient/fetch";
import type { VeniceApiError } from "./veniceClient/errors";
import { VENICE_WALLET_ADDRESS_PATTERN } from "../shared/validation";
import type {
  X402BalanceData,
  X402BalanceResponse,
  X402NetworkType,
  X402PaymentRequirements,
  X402TopUpData,
  X402TopUpResponse,
  X402TransactionsData,
  X402TransactionsResponse,
} from "../types/x402";

/** Validates whether a wallet address matches supported EVM or Solana formats. */
export function validateWalletAddress(address: string): boolean {
  if (!address || typeof address !== "string") return false;
  return VENICE_WALLET_ADDRESS_PATTERN.test(address.trim());
}

/** Detects the network family (EVM vs Solana) for a valid wallet address. */
export function detectWalletNetworkType(address: string): X402NetworkType {
  if (!validateWalletAddress(address)) return "unknown";
  const trimmed = address.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) return "evm";
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) return "solana";
  return "unknown";
}

/** Formats a wallet address for display, truncating middle characters. */
export function formatWalletAddress(address: string): string {
  if (!address || typeof address !== "string") return "";
  const trimmed = address.trim();
  if (trimmed.length <= 12) return trimmed;
  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

/**
 * Fetches current x402 balance and consumption permissions for a wallet address.
 * Requires Sign-in-with-x (SIWX) authentication for the same wallet.
 */
export async function getX402Balance(
  walletAddress: string,
  siwxToken: string,
): Promise<X402BalanceData> {
  const trimmed = walletAddress.trim();
  if (!validateWalletAddress(trimmed)) {
    throw new Error("Invalid EVM or Solana wallet address format.");
  }
  if (!siwxToken || !siwxToken.trim()) {
    throw new Error("Sign-in-with-x token is required to authenticate x402 requests.");
  }

  const res = await veniceFetch<X402BalanceResponse>(
    `/x402/balance/${encodeURIComponent(trimmed)}`,
    {
      method: "GET",
      headers: {
        "SIGN-IN-WITH-X": siwxToken.trim(),
      },
    },
  );
  return res.data.data;
}

/**
 * Discovers x402 payment requirements by posting to /x402/top-up without a payment signature.
 * Upstream Venice returns HTTP 402 with accepted networks (Base USDC, Solana USDC), payTo, and assets.
 */
export async function getX402PaymentRequirements(): Promise<X402PaymentRequirements> {
  try {
    const res = await veniceFetch<X402PaymentRequirements>("/x402/top-up", {
      method: "POST",
      body: {},
    });
    return res.data;
  } catch (err: unknown) {
    const apiError = err as VeniceApiError;
    if (apiError.status === 402 && apiError.responseBody && typeof apiError.responseBody === "object") {
      const body = apiError.responseBody as Record<string, unknown>;
      if (Array.isArray(body.accepts)) {
        return apiError.responseBody as X402PaymentRequirements;
      }
    }
    throw err;
  }
}

/**
 * Submits a signed x402 v2 payment payload (base64-encoded PaymentPayload) to top up the credit balance.
 * Returns the credited amount, new balance, and settlement details.
 */
export async function submitX402TopUp(
  paymentSignature: string,
): Promise<{ data: X402TopUpData; paymentResponseHeader?: string }> {
  if (!paymentSignature || !paymentSignature.trim()) {
    throw new Error("Payment signature is required for top-up submission.");
  }

  const res = await veniceFetch<X402TopUpResponse>("/x402/top-up", {
    method: "POST",
    headers: {
      "PAYMENT-SIGNATURE": paymentSignature.trim(),
    },
    body: {},
  });

  return {
    data: res.data.data,
    paymentResponseHeader: res.headers["payment-response"],
  };
}

/**
 * Fetches paginated x402 transaction history for a wallet address.
 * Requires Sign-in-with-x authentication for the same wallet.
 */
export async function getX402Transactions(
  walletAddress: string,
  siwxToken: string,
  options?: { limit?: number; offset?: number },
): Promise<X402TransactionsData> {
  const trimmed = walletAddress.trim();
  if (!validateWalletAddress(trimmed)) {
    throw new Error("Invalid EVM or Solana wallet address format.");
  }
  if (!siwxToken || !siwxToken.trim()) {
    throw new Error("Sign-in-with-x token is required to authenticate x402 requests.");
  }

  const params = new URLSearchParams();
  if (options?.limit !== undefined) params.set("limit", String(options.limit));
  if (options?.offset !== undefined) params.set("offset", String(options.offset));
  const query = params.toString() ? `?${params.toString()}` : "";

  const res = await veniceFetch<X402TransactionsResponse>(
    `/x402/transactions/${encodeURIComponent(trimmed)}${query}`,
    {
      method: "GET",
      headers: {
        "SIGN-IN-WITH-X": siwxToken.trim(),
      },
    },
  );

  return res.data.data;
}
