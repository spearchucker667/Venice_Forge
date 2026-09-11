import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useAuthStore } from "../../stores/auth-store";
import { VeniceLogo } from "../ui/logo";
import { toast } from "../../stores/toast-store";
import { isElectron } from "../../services/desktopBridge";
import { isImeCompositionEvent } from "../../lib/keyboard";
import { Trans, useTranslation } from "react-i18next";

type ConnectionMessage =
  | { tone: "info"; text: string }
  | { tone: "success"; text: string }
  | { tone: "warning"; text: string }
  | { tone: "danger"; text: string };

// i18n-allow-next-line: short button label, English-only intentional copy
const TEST_BUTTON_LABEL = "Test";

export function ApiKeyDialog({
  open,
  onClose,
}: {
  open: string | boolean;
  onClose: () => void;
}) {
  const { t: tRuntime } = useTranslation("common");
  const { apiKey, isConfigured, credentialSafeMessage, veniceLastValidationStatus, setApiKey, clearApiKey, validateStoredVeniceKey } = useAuthStore();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<ConnectionMessage | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, Boolean(open), onClose);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleConnect = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const outcome = await setApiKey(value.trim());
      if (outcome.stored) {
        // Storage succeeded. Choose a message that is honest about what
        // did and did not happen (P1-003: a network failure must never
        // read as "save failed").
        if (outcome.validation === "valid") {
          setValue("");
          const saved = tRuntime("runtimeGenerated.components.layout.apiKeyDialog.notification.keySavedSecurely", "API key saved and verified.");
          setMessage({ tone: "success", text: saved });
          toast.success(saved);
          // Successful connect closes the dialog by convention; the
          // caller can still see the message via the toast.
          onClose();
          return;
        }
        if (outcome.validation === "network-error") {
          const msg = tRuntime("runtimeGenerated.components.layout.apiKeyDialog.notification.keySavedOffline", "API key saved. Venice is unreachable — you can retry the test when the network is back.");
          setMessage({ tone: "warning", text: msg });
          toast.info(msg);
          return;
        }
        if (outcome.validation === "invalid") {
          const msg = tRuntime("runtimeGenerated.components.layout.apiKeyDialog.notification.keyStoredInvalid", "API key stored, but Venice rejected it. Delete and re-enter, or test again.");
          setMessage({ tone: "danger", text: msg });
          toast.error(msg);
          return;
        }
        const unverified = tRuntime("runtimeGenerated.components.layout.apiKeyDialog.notification.keySavedUnverified", "API key saved, but Venice connectivity could not be verified.");
        setMessage({ tone: "warning", text: unverified });
        toast.info(unverified);
        return;
      }
      // Storage failed — the only path where the message should read
      // "could not be saved".
      setMessage({ tone: "danger", text: outcome.safeMessage });
    } catch {
      setMessage({ tone: "danger", text: tRuntime("runtimeGenerated.components.layout.apiKeyDialog.text.unexpectedSaveError", "The Venice API key could not be saved.") });
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await clearApiKey();
      setValue("");
      toast.info(tRuntime("runtimeGenerated.components.layout.apiKeyDialog.notification.keyDeleted", "API key cleared"));
    } catch {
      setMessage({ tone: "danger", text: tRuntime("runtimeGenerated.components.layout.apiKeyDialog.text.disconnectFailed", "Failed to disconnect. Please try again.") });
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const status = await validateStoredVeniceKey();
      if (status === "valid") {
        setMessage({ tone: "success", text: tRuntime("runtimeGenerated.components.layout.apiKeyDialog.notification.connectionSuccessful", "Connection successful.") });
      } else if (status === "network-error") {
        setMessage({ tone: "warning", text: tRuntime("runtimeGenerated.components.layout.apiKeyDialog.notification.connectionOffline", "Venice is unreachable. Check the network and retry.") });
      } else if (status === "invalid") {
        setMessage({ tone: "danger", text: tRuntime("runtimeGenerated.components.layout.apiKeyDialog.notification.connectionRejected", "Venice rejected this API key. Delete and re-enter.") });
      } else {
        setMessage({ tone: "warning", text: tRuntime("runtimeGenerated.components.layout.apiKeyDialog.notification.connectionUnknown", "Connection status is unknown.") });
      }
    } catch {
      setMessage({ tone: "danger", text: tRuntime("runtimeGenerated.components.layout.apiKeyDialog.notification.connectionFailed", "Connection test failed.") });
    } finally {
      setBusy(false);
    }
  };

  const titleId = "apikey-dialog-title";
  const toneClass: Record<ConnectionMessage["tone"], string> = {
    info: "text-text-secondary",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  };
  const showStoredKeyAffordance = isConfigured || apiKey || veniceLastValidationStatus === "invalid" || veniceLastValidationStatus === "network-error";

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        aria-label={tRuntime(
          "runtimeGenerated.components.layout.apiKeyDialog.attribute.closeDialog",
        )}
        className="absolute inset-0 bg-overlay/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="mesh-panel relative rounded-xl p-6 w-full max-w-sm mx-4 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-5">
          <VeniceLogo size={26} />
          <div>
            <h2
              id={titleId}
              className="text-[17px] font-semibold text-text-primary"
            >
              <Trans i18nKey="common:surface.layoutApiKeyDialog.heading.connectToVenice" />
            </h2>
            <p className="text-[13px] text-text-secondary">
              {isElectron()
                ? credentialSafeMessage ?? tRuntime("runtimeGenerated.components.layout.apiKeyDialog.text.osSecureStorageDefault", "Stored securely in OS Keychain/Credential Manager.")
                : tRuntime(
                    "runtimeGenerated.components.layout.apiKeyDialog.text.heldInMemoryForThisLocalDevelopmentSessionOnly",
                  )}
            </p>
          </div>
        </div>

        <label htmlFor="apikey-input" className="sr-only">
          <Trans i18nKey="common:surface.layoutApiKeyDialog.label.veniceApiKey" />
        </label>
        <input
          id="apikey-input"
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="sk-..."
          className="mesh-input w-full rounded-lg px-3.5 py-2.5 text-[16px] text-text-primary outline-none focus:border-accent font-mono placeholder:text-text-muted/50"
          autoFocus
          autoComplete="off"
          onKeyDown={(e) => {
            if (isImeCompositionEvent(e)) return;
            if (e.key === "Enter") handleConnect();
          }}
        />
        <p className="text-[13px] text-text-muted mt-2">
          <Trans i18nKey="common:surface.layoutApiKeyDialog.description.getAKeyAt" />{" "}
          <a
            href="https://venice.ai/settings/api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline underline-offset-2"
          >
            venice.ai/settings/api
          </a>
          .
        </p>

        {message && (
          <p role="alert" className={`text-[13px] mt-3 ${toneClass[message.tone]}`}>
            {message.text}
          </p>
        )}

        <div className="flex flex-wrap gap-2 mt-6 justify-end">
          {showStoredKeyAffordance && (
            <>
              <button
                onClick={handleTest}
                disabled={busy}
                className="px-3 py-1.5 text-[14px] text-text-secondary hover:text-text-primary cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {TEST_BUTTON_LABEL}
              </button>
              <button
                onClick={handleDisconnect}
                disabled={busy}
                className="px-3 py-1.5 text-[14px] text-text-secondary hover:text-danger cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trans i18nKey="common:surface.layoutApiKeyDialog.action.disconnect" />
              </button>
            </>
          )}
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-[14px] text-text-secondary hover:text-text-primary cursor-pointer transition-colors"
          >
            <Trans i18nKey="common:surface.layoutApiKeyDialog.action.cancel" />
          </button>
          <button
            onClick={handleConnect}
            disabled={busy || !value.trim()}
            aria-busy={busy || undefined}
            className="px-4 py-1.5 text-[14px] font-medium bg-accent text-accent-fg rounded-md hover:bg-accent-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 cursor-pointer"
          >
            {busy
              ? "…"
              : tRuntime(
                  "runtimeGenerated.components.layout.apiKeyDialog.text.connect",
                )}
          </button>
        </div>
      </div>
    </div>
  );
}
