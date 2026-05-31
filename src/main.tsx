import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
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
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
