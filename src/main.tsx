import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import { initDesktopBridge } from "./services/desktopBridge";
import { refreshConfig } from "./stores/config-store";
import { useAuthStore } from "./stores/auth-store";
import { syncPrefersReducedMotion } from "./hooks/usePrefersReducedMotion";
import { redactErrorDetails, sanitizeErrorText } from "./shared/redaction";

syncPrefersReducedMotion();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[venice-forge] Unhandled rejection:", event.reason instanceof Error
    ? redactErrorDetails(event.reason)
    : sanitizeErrorText(String(event.reason)));
});
window.addEventListener("error", (event) => {
  console.error("[venice-forge] Uncaught error:", event.error instanceof Error
    ? redactErrorDetails(event.error)
    : sanitizeErrorText(event.message));
});
console.warn("[venice-forge] crypto.subtle available:", typeof crypto !== "undefined" && !!crypto.subtle);

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
  const HYDRATION_TIMEOUT_MS = 2500;
  const hydrationTimeout = new Promise<void>((resolve) => {
    setTimeout(resolve, HYDRATION_TIMEOUT_MS);
  });
  const hydrationReady = (async () => {
    try {
      await initDesktopBridge();
      await refreshConfig();
      await useAuthStore.getState().checkConfiguration();
    } catch (err) {
      console.error("[venice-forge] Bridge/config init failed:", err instanceof Error
        ? redactErrorDetails(err)
        : sanitizeErrorText(String(err)));
    }
  })();
  void Promise.race([hydrationReady, hydrationTimeout]).then(() => {
    try {
      createRoot(rootEl).render(
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
      clearElement(rootEl);
      appendFatalText(
        rootEl,
        "Fatal Application Error",
        "The application failed to initialize. Please check the console or reinstall the application.",
        safeError.message,
      );
    }
  });
}
