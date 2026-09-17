// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Client-side Zustand store for x402 wallet authentication, balance, and top-up state. */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  getX402Balance,
  getX402PaymentRequirements,
  getX402Transactions,
  submitX402TopUp,
  validateWalletAddress,
} from "../services/x402Service";
import type {
  X402AuthMode,
  X402BalanceData,
  X402PaymentRequirements,
  X402TopUpData,
  X402Transaction,
  X402TransactionsPagination,
} from "../types/x402";
import { redactErrorMessage } from "../shared/redaction";

export interface X402State {
  walletAddress: string;
  /** Session-only in-memory SIWX token. Never persisted to disk. */
  siwxToken: string | null;
  authMode: X402AuthMode;
  balance: X402BalanceData | null;
  paymentRequirements: X402PaymentRequirements | null;
  transactions: X402Transaction[];
  pagination: X402TransactionsPagination;
  isLoadingBalance: boolean;
  isLoadingRequirements: boolean;
  isLoadingTransactions: boolean;
  isSubmittingTopUp: boolean;
  lastTopUpResult: X402TopUpData | null;
  error: string | null;

  setWalletAddress: (address: string) => void;
  setSiwxToken: (token: string | null) => void;
  setAuthMode: (mode: X402AuthMode) => void;
  fetchBalance: () => Promise<void>;
  fetchPaymentRequirements: () => Promise<void>;
  fetchTransactions: (offset?: number) => Promise<void>;
  submitTopUp: (paymentSignature: string) => Promise<X402TopUpData>;
  clearSession: () => void;
}

export const useX402Store = create<X402State>()(
  persist(
    (set, get) => ({
      walletAddress: "",
      siwxToken: null,
      authMode: "api_key",
      balance: null,
      paymentRequirements: null,
      transactions: [],
      pagination: { limit: 20, offset: 0, hasMore: false },
      isLoadingBalance: false,
      isLoadingRequirements: false,
      isLoadingTransactions: false,
      isSubmittingTopUp: false,
      lastTopUpResult: null,
      error: null,

      setWalletAddress: (address: string) => {
        set({ walletAddress: address.trim(), error: null });
      },

      setSiwxToken: (token: string | null) => {
        set({ siwxToken: token ? token.trim() : null, error: null });
      },

      setAuthMode: (mode: X402AuthMode) => {
        set({ authMode: mode, error: null });
      },

      fetchBalance: async () => {
        const { walletAddress, siwxToken } = get();
        if (!validateWalletAddress(walletAddress)) {
          set({ error: "Invalid wallet address format." });
          return;
        }
        if (!siwxToken) {
          set({ error: "Sign-in-with-x (SIWX) token is required." });
          return;
        }

        set({ isLoadingBalance: true, error: null });
        try {
          const balance = await getX402Balance(walletAddress, siwxToken);
          set({ balance, isLoadingBalance: false });
        } catch (err: unknown) {
          set({
            isLoadingBalance: false,
            error: redactErrorMessage(err),
          });
        }
      },

      fetchPaymentRequirements: async () => {
        set({ isLoadingRequirements: true, error: null });
        try {
          const requirements = await getX402PaymentRequirements();
          set({ paymentRequirements: requirements, isLoadingRequirements: false });
        } catch (err: unknown) {
          set({
            isLoadingRequirements: false,
            error: redactErrorMessage(err),
          });
        }
      },

      fetchTransactions: async (offset = 0) => {
        const { walletAddress, siwxToken, pagination } = get();
        if (!validateWalletAddress(walletAddress)) {
          set({ error: "Invalid wallet address format." });
          return;
        }
        if (!siwxToken) {
          set({ error: "Sign-in-with-x (SIWX) token is required." });
          return;
        }

        set({ isLoadingTransactions: true, error: null });
        try {
          const res = await getX402Transactions(walletAddress, siwxToken, {
            limit: pagination.limit,
            offset,
          });
          set({
            transactions: res.transactions,
            pagination: res.pagination,
            isLoadingTransactions: false,
          });
        } catch (err: unknown) {
          set({
            isLoadingTransactions: false,
            error: redactErrorMessage(err),
          });
        }
      },

      submitTopUp: async (paymentSignature: string) => {
        set({ isSubmittingTopUp: true, error: null });
        try {
          const { data } = await submitX402TopUp(paymentSignature);
          set((state) => ({
            isSubmittingTopUp: false,
            lastTopUpResult: data,
            balance: state.balance
              ? { ...state.balance, balanceUsd: data.newBalance, canConsume: true }
              : null,
          }));
          return data;
        } catch (err: unknown) {
          const msg = redactErrorMessage(err);
          set({ isSubmittingTopUp: false, error: msg });
          throw err;
        }
      },

      clearSession: () => {
        set({
          siwxToken: null,
          balance: null,
          paymentRequirements: null,
          transactions: [],
          lastTopUpResult: null,
          error: null,
        });
      },
    }),
    {
      name: "venice-forge-x402-storage",
      // SECURITY RULE: Never persist siwxToken or sensitive session state!
      partialize: (state) => ({
        walletAddress: state.walletAddress,
        authMode: state.authMode,
      }),
    },
  ),
);
