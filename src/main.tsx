import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import "./i18n";
import { initDesktopBridge } from "./services/desktopBridge";
import { refreshConfig } from "./stores/config-store";
import { useAuthStore } from "./stores/auth-store";
import { activateRestoredProfileSession } from "./stores/profile-store";
import { syncPrefersReducedMotion } from "./hooks/usePrefersReducedMotion";
import { redactErrorDetails, sanitizeErrorText } from "./shared/redaction";
import { serializeError, serializeErrorToString } from "./shared/serializeError";
import { registerModelQueryClient } from "./services/modelQueryCoordinator";

syncPrefersReducedMotion();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});
registerModelQueryClient(queryClient);

// Detect production to gate chatty startup diagnostics. crypto.subtle
// availability is a successful expected condition and must not surface as
// ERROR/WARN noise in the user's log stream.
const isProduction =
  (typeof import.meta !== "undefined" && (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE === "production") ||
  (typeof process !== "undefined" && process.env?.NODE_ENV === "production");

window.addEventListener("unhandledrejection", (event) => {
  // Structured serializer captures Error, DOMException, Event, Response,
  // and arbitrary thrown values without producing `[object Object]`.
  const serialized = serializeError(event.reason);
  console.error("[venice-forge] Unhandled rejection:", serialized, serializeErrorToString(serialized));
});
window.addEventListener("error", (event) => {
  // Prefer event.error (the underlying Error) when present; fall back to
  // event.message for synthetic cases (e.g., resource load failures where
  // no Error object is provided). ErrorEvent does not expose `reason`
  // directly so we rely on duck-typed fallback.
  const reason = event.error ?? event.message;
  const serialized = serializeError(reason);
  const headline = sanitizeErrorText(event.message || serializeErrorToString(serialized));
  console.error("[venice-forge] Uncaught error:", headline, serialized);
});
// Expected startup diagnostic — crypto.subtle availability is a successful
// precondition, not an error or warning. Promote to debug/console.log to keep
// the user-visible log stream focused on real failures.
if (isProduction) {
  // intentionally silent in production builds
} else {
  // eslint-disable-next-line no-console
  console.debug("[venice-forge] crypto.subtle available:", typeof crypto !== "undefined" && !!crypto.subtle);
}

function appendFatalText(target: HTMLElement, title: string, message: string, details?: string): void {
  const container = document.createElement("div");
  container.style.padding = "2rem";
  container.style.fontFamily = "system-ui, sans-serif";
  container.style.color = "#ff4a4a";
  container.style.background = "#1a1a1a";
  container.style.minHeight = "100vh";

  const h1 = document.createElement("h1");
  h1.style.marginTop = "0";
  h1.textContent = title;

  const p = document.createElement("p");
  p.textContent = message;

  container.appendChild(h1);
  container.appendChild(p);

  if (details) {
    const pre = document.createElement("pre");
    pre.style.whiteSpace = "pre-wrap";
    pre.style.wordBreak = "break-all";
    pre.style.background = "#000";
    pre.style.padding = "1rem";
    pre.style.borderRadius = "0.5rem";
    pre.style.overflowX = "auto";
    pre.textContent = details;
    container.appendChild(pre);
  }

  target.appendChild(container);
}

function clearElement(target: HTMLElement): void {
  while (target.firstChild) {
    target.removeChild(target.firstChild);
  }
}

const HYDRATION_TIMEOUT_MS = 2500;

/** Boot the React app after pre-flight hydration. Exported for regression
 *  testing of the rejection handler that prevents an unhandled promise from
 *  crashing the renderer boot path. */
export async function bootApp(
  target: HTMLElement,
  hydrationReady: Promise<void>,
): Promise<void> {
  const hydrationTimeout = new Promise<void>((resolve) => {
    setTimeout(resolve, HYDRATION_TIMEOUT_MS);
  });
  try {
    await Promise.race([hydrationReady, hydrationTimeout]);
  } catch (err) {
    const safeError = err instanceof Error
      ? redactErrorDetails(err)
      : { message: sanitizeErrorText(String(err)) };
    console.error("[venice-forge] Hydration race failed", safeError);
    clearElement(target);
    appendFatalText(
      target,
      "Fatal Application Error",
      "The application failed to initialize during pre-flight setup. Please check the console or reinstall the application.",
      safeError.message,
    );
    return;
  }

  try {
    createRoot(target).render(
      <StrictMode>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </ErrorBoundary>
      </StrictMode>
    );
  } catch (err) {
    const safeError = err instanceof Error
      ? redactErrorDetails(err)
      : { message: sanitizeErrorText(String(err)) };
    console.error("Failed to mount React root", safeError);
    clearElement(target);
    appendFatalText(
      target,
      "Fatal Application Error",
      "The application failed to initialize. Please check the console or reinstall the application.",
      safeError.message,
    );
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  appendFatalText(
    document.body,
    "Application failed to load",
    "The root element is missing. Please check the build or reinstall the application.",
  );
} else {
  // Bring up the desktop bridge and load the local config BEFORE the
  // React tree mounts. This guarantees that safety-relevant defaults
  // (Family Safe Mode, Venice API safe_mode) are sourced from the
  // config file rather than the renderer fallback defaults. Failures
  // fall through to defaults after a short timeout so the app still
  // boots in web mode or when the bridge is unavailable.
  const hydrationReady = (async () => {
    try {
      await initDesktopBridge();
      await activateRestoredProfileSession();
      await refreshConfig();
      await useAuthStore.getState().checkConfiguration();
    } catch (err) {
      console.error("[venice-forge] Bridge/config init failed:", err instanceof Error
        ? redactErrorDetails(err)
        : sanitizeErrorText(String(err)));
    }
  })();
  void bootApp(rootEl, hydrationReady);
}
