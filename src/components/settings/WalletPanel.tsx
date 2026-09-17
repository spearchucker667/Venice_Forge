// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview Settings panel for the Venice x402 keyless wallet authentication and payment rail. */

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  WalletIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  CoinsIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  CheckCircle2Icon,
  AlertCircleIcon,
  EyeIcon,
  EyeOffIcon,
} from "lucide-react";
import { useX402Store } from "../../stores/x402-store";
import {
  detectWalletNetworkType,
  validateWalletAddress,
} from "../../services/x402Service";
import { toast } from "../../stores/toast-store";
import type { X402NetworkType } from "../../types/x402";

function formatUsdAmount(amount: number): string {
  if (typeof amount !== "number" || isNaN(amount)) return "$0.0000";
  const prefix = amount > 0 ? "+$" : "-$";
  return `${prefix}${Math.abs(amount).toFixed(4)}`;
}

function formatBalance(amount: number | undefined | null): string {
  if (typeof amount !== "number" || isNaN(amount)) return "—";
  return `$${amount.toFixed(4)}`;
}

export function WalletPanel(): React.ReactElement {
  const { t } = useTranslation(["settings", "common"]);

  const {
    walletAddress,
    siwxToken,
    authMode,
    balance,
    paymentRequirements,
    transactions,
    pagination,
    isLoadingBalance,
    isLoadingRequirements,
    isLoadingTransactions,
    isSubmittingTopUp,
    lastTopUpResult,
    error,
    setWalletAddress,
    setSiwxToken,
    setAuthMode,
    fetchBalance,
    fetchPaymentRequirements,
    fetchTransactions,
    submitTopUp,
    clearSession,
  } = useX402Store();

  const [showSiwx, setShowSiwx] = useState(false);
  const [paymentSignatureInput, setPaymentSignatureInput] = useState("");

  const networkType: X402NetworkType = detectWalletNetworkType(walletAddress);
  const isAddressValid = validateWalletAddress(walletAddress);

  const networkBadgeLabel =
    networkType === "evm"
      ? t("settings:wallet.networkLabelBaseEvm", "Base / EVM")
      : networkType === "solana"
        ? t("settings:wallet.networkLabelSolana", "Solana")
        : t("settings:wallet.networkLabelValid", "Valid");

  const getRailNetworkLabel = (network: string) => {
    if (network.includes("8453")) return t("settings:wallet.railBaseEvm", "Base (EVM)");
    if (network.includes("solana")) return t("settings:wallet.railSolana", "Solana");
    return network;
  };

  const handleConnect = async () => {
    if (!isAddressValid) {
      toast.error(t("settings:wallet.invalidAddress", "Please enter a valid EVM or Solana wallet address."));
      return;
    }
    if (!siwxToken) {
      toast.error(t("settings:wallet.missingToken", "Sign-in-with-x (SIWX) token is required."));
      return;
    }
    await fetchBalance();
  };

  const handleSubmitTopUp = async () => {
    if (!paymentSignatureInput.trim()) {
      toast.error(t("settings:wallet.missingSignature", "Enter a valid base64 PAYMENT-SIGNATURE payload."));
      return;
    }
    try {
      const result = await submitTopUp(paymentSignatureInput.trim());
      toast.success(
        t("settings:wallet.topUpSuccess", {
          defaultValue: "Successfully credited ${{amount}}! New balance: ${{balance}}",
          amount: result.amountCredited,
          balance: result.newBalance,
        }),
      );
      setPaymentSignatureInput("");
      if (walletAddress && siwxToken) {
        void fetchTransactions(0);
      }
    } catch {
      toast.error(t("settings:wallet.topUpFailed", "Payment top-up failed. Check signature format."));
    }
  };

  return (
    <div className="space-y-6 max-w-4xl" role="region" aria-label={t("settings:wallet.title", "Wallet & x402 Rail")}>
      {/* Header */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2.5">
          <h2 className="text-xl font-semibold text-text-primary">
            {t("settings:wallet.title", "Wallet & x402 Rail")}
          </h2>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-accent/15 text-accent border border-accent/20">
            {t("settings:wallet.alphaBadge", "Alpha / Experimental")}
          </span>
        </div>
        <p className="text-sm text-text-secondary">
          {t(
            "settings:wallet.description",
            "Keyless authentication and payment rail powered by x402 protocol on Base and Solana. All inference endpoints can consume from this balance without an API key.",
          )}
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger flex items-center gap-2">
          <AlertCircleIcon className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Authentication Mode Switch */}
      <div className="rounded-xl border border-vf-panel-border bg-vf-panel-bg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-medium text-text-primary">
              {t("settings:wallet.authModeTitle", "Authentication Priority")}
            </h3>
            <p className="text-xs text-text-secondary">
              {t("settings:wallet.authModeDescription", "Choose whether Venice Forge uses stored API keys or keyless x402 wallet balance.")}
            </p>
          </div>
          <div className="flex rounded-lg border border-vf-panel-border p-1 bg-vf-panel-bg-raised text-xs font-medium">
            <button
              type="button"
              onClick={() => setAuthMode("api_key")}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                authMode === "api_key"
                  ? "bg-vf-button-primary-bg text-vf-button-primary-text font-semibold"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {t("settings:wallet.authModeApiKey", "API Key")}
            </button>
            <button
              type="button"
              onClick={() => setAuthMode("x402")}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                authMode === "x402"
                  ? "bg-vf-button-primary-bg text-vf-button-primary-text font-semibold"
                  : "text-text-secondary hover:text-text-primary"
              }`}
            >
              {t("settings:wallet.authModeX402", "Wallet / x402")}
            </button>
          </div>
        </div>
      </div>

      {/* Wallet Connection & SIWX */}
      <div className="rounded-xl border border-vf-panel-border bg-vf-panel-bg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <WalletIcon className="w-5 h-5 text-accent" />
            <h3 className="text-sm font-medium text-text-primary">
              {t("settings:wallet.walletCredentialsTitle", "Wallet Credentials")}
            </h3>
          </div>
          {isAddressValid && (
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-vf-panel-bg-raised border border-vf-panel-border text-text-secondary">
              {networkBadgeLabel}
            </span>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label htmlFor="x402-wallet-address" className="block text-xs font-medium text-text-secondary mb-1">
              {t("settings:wallet.addressLabel", "Wallet Address (EVM or Solana)")}
            </label>
            <input
              id="x402-wallet-address"
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder={t("settings:wallet.addressPlaceholder", "0x... or Base58 Solana address")}
              className="w-full rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised px-3.5 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div>
            <label htmlFor="x402-siwx-token" className="block text-xs font-medium text-text-secondary mb-1">
              {t("settings:wallet.siwxLabel", "Sign-in-with-x (SIWX) Token")}
            </label>
            <div className="relative">
              <input
                id="x402-siwx-token"
                type={showSiwx ? "text" : "password"}
                value={siwxToken ?? ""}
                onChange={(e) => setSiwxToken(e.target.value || null)}
                placeholder={t("settings:wallet.siwxPlaceholder", "base64-encoded SIWX authorization payload")}
                className="w-full rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised px-3.5 py-2 text-sm text-text-primary placeholder:text-text-muted pr-10 focus:outline-none focus:ring-1 focus:ring-accent font-mono"
              />
              <button
                type="button"
                onClick={() => setShowSiwx(!showSiwx)}
                aria-label={showSiwx ? t("settings:wallet.hideToken", "Hide token") : t("settings:wallet.showToken", "Show token")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
              >
                {showSiwx ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              {t(
                "settings:wallet.siwxSecurityNote",
                "Security custody: The SIWX token is stored in memory for this session only and is never written to disk.",
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleConnect}
              disabled={isLoadingBalance || !isAddressValid || !siwxToken}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-vf-button-primary-bg text-vf-button-primary-text hover:bg-vf-button-primary-hover-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
            >
              {isLoadingBalance && <RefreshCwIcon className="w-3.5 h-3.5 animate-spin" />}
              {t("settings:wallet.connectButton", "Verify & Check Balance")}
            </button>
            {balance && (
              <button
                type="button"
                onClick={clearSession}
                className="px-3 py-2 rounded-lg text-xs font-medium border border-vf-panel-border bg-vf-panel-bg text-text-secondary hover:text-danger hover:border-danger/30 transition-colors cursor-pointer"
              >
                {t("settings:wallet.clearSession", "Disconnect Session")}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Balance Display */}
      {balance && (
        <div className="rounded-xl border border-vf-panel-border bg-vf-panel-bg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CoinsIcon className="w-5 h-5 text-accent" />
              <h3 className="text-sm font-medium text-text-primary">
                {t("settings:wallet.balanceTitle", "x402 Credit Balance")}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => void fetchBalance()}
              disabled={isLoadingBalance}
              aria-label={t("settings:wallet.refreshBalance", "Refresh balance")}
              className="p-1.5 text-text-secondary hover:text-text-primary rounded-lg hover:bg-vf-panel-bg-raised transition-colors"
            >
              <RefreshCwIcon className={`w-4 h-4 ${isLoadingBalance ? "animate-spin" : ""}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised p-4 space-y-1">
              <span className="text-xs text-text-secondary">{t("settings:wallet.balanceUsd", "Spendable Balance")}</span>
              <p className="text-2xl font-bold text-text-primary">
                ${balance.balanceUsd.toFixed(2)}
              </p>
              <div className="flex items-center gap-1.5 pt-1 text-xs">
                {balance.canConsume ? (
                  <>
                    <CheckCircle2Icon className="w-3.5 h-3.5 text-success" />
                    <span className="text-success font-medium">{t("settings:wallet.canConsumeActive", "Active")}</span>
                  </>
                ) : (
                  <>
                    <AlertCircleIcon className="w-3.5 h-3.5 text-danger" />
                    <span className="text-danger font-medium">{t("settings:wallet.canConsumeInactive", "Needs Top-Up")}</span>
                  </>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised p-4 space-y-1">
              <span className="text-xs text-text-secondary">{t("settings:wallet.topUpRange", "Top-Up Limits")}</span>
              <p className="text-sm font-medium text-text-primary pt-1">
                {t("settings:wallet.minTopUp", { defaultValue: "Min: ${{amount}}", amount: balance.minimumTopUpUsd })}
              </p>
              <p className="text-xs text-text-muted">
                {t("settings:wallet.suggestedTopUp", { defaultValue: "Suggested: ${{amount}}", amount: balance.suggestedTopUpUsd })}
              </p>
            </div>

            {balance.diemBalanceUsd !== undefined && (
              <div className="rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised p-4 space-y-1">
                <span className="text-xs text-text-secondary">{t("settings:wallet.diemBalance", "Linked DIEM Balance")}</span>
                <p className="text-2xl font-bold text-accent">
                  ${balance.diemBalanceUsd.toFixed(2)}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Manual Top-Up Section */}
      <div className="rounded-xl border border-vf-panel-border bg-vf-panel-bg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheckIcon className="w-5 h-5 text-accent" />
            <h3 className="text-sm font-medium text-text-primary">
              {t("settings:wallet.topUpTitle", "Top-Up Credit Balance")}
            </h3>
          </div>
          <span className="text-xs text-text-muted">
            {t("settings:wallet.spendSafetyNotice", "Spend Safety: Manual top-up only")}
          </span>
        </div>

        <p className="text-xs text-text-secondary">
          {t(
            "settings:wallet.topUpExplainer",
            "Venice inference endpoints consume from your established credit balance. Top-up uses USDC on Base or Solana. Automatic top-ups are disabled to preserve spend safety.",
          )}
        </p>

        <div className="space-y-3 pt-1">
          <button
            type="button"
            onClick={() => void fetchPaymentRequirements()}
            disabled={isLoadingRequirements}
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium border border-vf-panel-border bg-vf-panel-bg-raised text-text-primary hover:bg-vf-panel-bg transition-colors cursor-pointer flex items-center gap-2"
          >
            {isLoadingRequirements && <RefreshCwIcon className="w-3.5 h-3.5 animate-spin" />}
            {t("settings:wallet.discoverRequirements", "Discover Deposit Requirements")}
          </button>

          {paymentRequirements && (
            <div className="space-y-3 rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised p-4">
              <h4 className="text-xs font-semibold text-text-primary">
                {t("settings:wallet.acceptedRails", "Accepted Payment Networks & Assets")}
              </h4>
              <div className="space-y-2">
                {paymentRequirements.accepts.map((option, idx) => (
                  <div key={idx} className="text-xs space-y-1 p-2.5 rounded bg-vf-panel-bg border border-vf-panel-border">
                    <div className="flex items-center justify-between font-medium">
                      <span className="text-text-primary">
                        {getRailNetworkLabel(option.network)}
                      </span>
                      <span className="text-accent">{option.scheme}</span>
                    </div>
                    <div className="text-text-muted font-mono break-all text-[11px]">
                      <div>{t("settings:wallet.payTo", "Receiver (payTo):")} {option.payTo}</div>
                      <div>{t("settings:wallet.asset", "USDC Asset:")} {option.asset}</div>
                      <div>{t("settings:wallet.minAmount", "Base Units:")} {option.amount}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Payment submission */}
          <div className="space-y-2 pt-2">
            <label htmlFor="x402-payment-signature" className="block text-xs font-medium text-text-secondary">
              {t("settings:wallet.paymentSignatureLabel", "Submit PAYMENT-SIGNATURE Header")}
            </label>
            <div className="flex gap-2">
              <input
                id="x402-payment-signature"
                type="text"
                value={paymentSignatureInput}
                onChange={(e) => setPaymentSignatureInput(e.target.value)}
                placeholder={t("settings:wallet.signaturePlaceholder", "eyJ4NDAyVmVyc2lvbiI6MiwicGF5bG9hZCI6Ii4uLiJ9")}
                className="flex-1 rounded-lg border border-vf-panel-border bg-vf-panel-bg-raised px-3.5 py-2 text-xs text-text-primary placeholder:text-text-muted font-mono focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={handleSubmitTopUp}
                disabled={isSubmittingTopUp || !paymentSignatureInput.trim()}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-vf-button-primary-bg text-vf-button-primary-text hover:bg-vf-button-primary-hover-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0 flex items-center gap-1.5"
              >
                {isSubmittingTopUp && <RefreshCwIcon className="w-3 h-3 animate-spin" />}
                {t("settings:wallet.submitTopUp", "Submit Top-Up")}
              </button>
            </div>
          </div>

          {lastTopUpResult && (
            <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-success space-y-0.5">
              <p className="font-semibold">{t("settings:wallet.lastTopUpSuccess", "Top-Up Completed")}</p>
              <p>{t("settings:wallet.amountCredited", { defaultValue: "Amount Credited: ${{amount}}", amount: lastTopUpResult.amountCredited })}</p>
              <p className="font-mono text-[11px] text-text-muted">{t("settings:wallet.paymentId", "Payment ID:")} {lastTopUpResult.paymentId}</p>
            </div>
          )}
        </div>
      </div>

      {/* Transaction History */}
      <div className="rounded-xl border border-vf-panel-border bg-vf-panel-bg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-text-primary">
            {t("settings:wallet.historyTitle", "x402 Transaction Ledger")}
          </h3>
          <button
            type="button"
            onClick={() => void fetchTransactions(0)}
            disabled={isLoadingTransactions || !isAddressValid || !siwxToken}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-vf-panel-border bg-vf-panel-bg-raised text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
          >
            {isLoadingTransactions && <RefreshCwIcon className="w-3 h-3 animate-spin" />}
            {t("settings:wallet.loadHistory", "Load History")}
          </button>
        </div>

        {transactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-vf-panel-border text-text-muted">
                  <th className="pb-2 font-medium">{t("settings:wallet.tableDate", "Date")}</th>
                  <th className="pb-2 font-medium">{t("settings:wallet.tableType", "Type")}</th>
                  <th className="pb-2 font-medium">{t("settings:wallet.tableAmount", "Amount")}</th>
                  <th className="pb-2 font-medium">{t("settings:wallet.tableBalance", "Balance After")}</th>
                  <th className="pb-2 font-medium">{t("settings:wallet.tableDetails", "Details")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vf-panel-border/50 text-text-secondary">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-vf-panel-bg-raised/50">
                    <td className="py-2.5 text-text-muted">
                      {new Date(tx.createdAt).toLocaleString()}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium ${
                          tx.type === "TOP_UP"
                            ? "bg-success/15 text-success"
                            : "bg-vf-panel-bg-raised text-text-secondary"
                        }`}
                      >
                        {tx.type === "TOP_UP" ? (
                          <ArrowDownLeftIcon className="w-3 h-3 text-success" />
                        ) : (
                          <ArrowUpRightIcon className="w-3 h-3 text-text-muted" />
                        )}
                        {tx.type}
                      </span>
                    </td>
                    <td className={`py-2.5 font-semibold ${tx.amount > 0 ? "text-success" : "text-text-primary"}`}>
                      {formatUsdAmount(tx.amount)}
                    </td>
                    <td className="py-2.5 font-mono">
                      {formatBalance(tx.balanceAfter)}
                    </td>
                    <td className="py-2.5 font-mono text-[11px] text-text-muted">
                      {tx.modelId ? tx.modelId : tx.requestId ? tx.requestId.slice(0, 16) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div className="flex items-center justify-between pt-3 border-t border-vf-panel-border text-xs text-text-muted">
              <span>
                {t("settings:wallet.showingCount", {
                  defaultValue: "Showing {{count}} entries",
                  count: transactions.length,
                })}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pagination.offset === 0 || isLoadingTransactions}
                  onClick={() => void fetchTransactions(Math.max(0, pagination.offset - pagination.limit))}
                  className="px-2.5 py-1 rounded border border-vf-panel-border bg-vf-panel-bg-raised text-text-secondary hover:text-text-primary disabled:opacity-40 cursor-pointer"
                >
                  {t("settings:wallet.previousPage", "Previous")}
                </button>
                <button
                  type="button"
                  disabled={!pagination.hasMore || isLoadingTransactions}
                  onClick={() => void fetchTransactions(pagination.offset + pagination.limit)}
                  className="px-2.5 py-1 rounded border border-vf-panel-border bg-vf-panel-bg-raised text-text-secondary hover:text-text-primary disabled:opacity-40 cursor-pointer"
                >
                  {t("settings:wallet.nextPage", "Next")}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-text-muted py-2">
            {t("settings:wallet.noTransactions", "No transactions loaded yet. Enter wallet credentials above to load ledger.")}
          </p>
        )}
      </div>
    </div>
  );
}
