import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./index.css";

window.addEventListener("unhandledrejection", (event) => {
  console.error("[venice-forge] Unhandled rejection:", event.reason instanceof Error ? event.reason.stack ?? event.reason.message : String(event.reason));
});
window.addEventListener("error", (event) => {
  console.error("[venice-forge] Uncaught error:", event.error instanceof Error ? event.error.stack ?? event.error.message : event.message);
});
console.warn("[venice-forge] crypto.subtle available:", typeof crypto !== "undefined" && !!crypto.subtle);

const rootEl = document.getElementById("root");
if (!rootEl) {
  document.body.innerHTML = "<h1>Application failed to load</h1><p>The root element is missing. Please check the build or reinstall the application.</p>";
} else {
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  } catch (err) {
    console.error("Failed to mount React root", err);
    rootEl.innerHTML = "";
    const container = document.createElement("div");
    container.style.cssText = "padding: 2rem; font-family: system-ui, sans-serif; color: #ff4a4a; background: #1a1a1a; min-height: 100vh;";
    const h1 = document.createElement("h1");
    h1.style.marginTop = "0";
    h1.textContent = "Fatal Application Error";
    const p = document.createElement("p");
    p.textContent = "The application failed to initialize. Please check the console or reinstall the application.";
    const pre = document.createElement("pre");
    pre.style.cssText = "white-space: pre-wrap; word-break: break-all; background: #000; padding: 1rem; border-radius: 0.5rem; overflow-x: auto;";
    pre.textContent = err instanceof Error ? err.stack || err.message : String(err);
    container.appendChild(h1);
    container.appendChild(p);
    container.appendChild(pre);
    rootEl.appendChild(container);
  }
}
