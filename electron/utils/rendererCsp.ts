/** @fileoverview Builds the Content-Security-Policy header string for the renderer.
 *
 * The theme bootstrap script lives in a separate file (bootstrap-theme.js)
 * so production does not need 'unsafe-inline' for scripts.
 * In development, 'unsafe-inline' and 'unsafe-eval' are kept for Vite HMR.
 *
 * STYLE-SRC POLICY (T1): production style-src is 'self' (no 'unsafe-inline').
 * The renderer's *application* code has zero JSX `style={...}` attributes —
 * this invariant is enforced by tests/csp/inlineStyleInvariant.test.ts
 * (VERIFY-007). The bootstrap script (public/bootstrap-theme.js) does call
 * `document.documentElement.style.setProperty(...)` to apply theme tokens
 * before first paint, but that path is not blocked by style-src 'self'
 * (style.setProperty writes to inline styles which the browser allows
 * regardless of CSP for non-third-party elements).
 */

/** Builds the renderer CSP for the given environment.
 * @param isDev Whether the app is running in development mode.
 * @returns The CSP header string.
 */
export function rendererCsp(isDev: boolean): string {
  const connectSrc = isDev
    ? "'self' http://localhost:5173 ws://localhost:5173"
    : "'self'";
  // Production style-src: 'self' only. Dev adds 'unsafe-inline' for Vite HMR
  // which injects inline style tags during fast refresh.
  const styleSrc = isDev
    ? "'self' 'unsafe-inline' http://localhost:5173"
    : "'self'";
  // Production permits only self-hosted scripts; inline and eval remain disabled.
  const scriptSrc = isDev
    ? "'self' 'unsafe-inline' 'unsafe-eval' http://localhost:5173"
    : "'self'";

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    `style-src ${styleSrc}`,
    "img-src 'self' data: blob: venice-character-cache: venice-media:",
    `connect-src ${connectSrc}`,
    "font-src 'self' data:",
    "media-src 'self' blob: venice-media:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}
