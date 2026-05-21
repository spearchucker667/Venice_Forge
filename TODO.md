# Venice Forge — Master Improvement Backlog

> Generated: 2026-05-20  
> Owner: @Fayebladespearchucker667  
> Repo Health Score: 6/10 (Fragile — see `docs/HQE_AUDIT_REPORT.md`)  

This document is a living, highly detailed todo list covering **Repository Health**, **Security**, **UI/UX**, **Code Quality**, and **API/Integration** issues. Every item includes file references, severity, and recommended action.

---

## Table of Contents

1. [Repository Health](#1-repository-health)
2. [Security](#2-security)
3. [UI / UX / Accessibility](#3-ui--ux--accessibility)
4. [Code Quality & Architecture](#4-code-quality--architecture)
5. [API & Integration Issues](#5-api--integration-issues)
6. [Quick-Win Priority Queue](#6-quick-win-priority-queue)

---

## 1. Repository Health

### 1.1 Missing Documentation Files
| # | Severity | Issue | Location | Action |
|---|----------|-------|----------|--------|
| R-01 | **High** | `CONTRIBUTING.md` is referenced in `README.md` and `docs/ABOUT.md` but **does not exist**. | Repo root | Create `CONTRIBUTING.md` with dev setup, branch naming, PR checklist, and security disclosure process. |
| R-02 | **High** | `CODE_OF_CONDUCT.md` is referenced in `README.md` and `docs/ABOUT.md` but **does not exist**. | Repo root | Create `CODE_OF_CONDUCT.md` (standard Contributor Covenant or custom). |
| R-03 | **Medium** | No `CODEOWNERS` file. PRs have no automatic reviewer assignment. | `.github/` | Create `CODEOWNERS` mapping critical paths to `@Fayebladespearchucker667`. |
| R-04 | **Low** | `LICENSE` uses generic "Venice Forge contributors"; no named copyright holder. | `LICENSE` | Update copyright line to include primary maintainer / owner reference. |

### 1.2 Package & Build Configuration
| # | Severity | Issue | Location | Action |
|---|----------|-------|----------|--------|
| R-05 | **Critical** | `dotenv` version `^17.2.3` in `package.json` **does not exist** on npm. Latest is `^16.x`. | `package.json:36` | Downgrade to valid `dotenv` version (`^16.4.5` or latest stable). Run `npm install` to sync lockfile. |
| R-06 | **High** | `@types/http-proxy-middleware` is deprecated; types are now bundled with the main package. | `package.json:49` | Remove deprecated `@types/http-proxy-middleware` from devDependencies. |
| R-07 | **High** | Build-time dependencies (`vite`, `@vitejs/plugin-react`, `@tailwindcss/vite`) are incorrectly listed under `dependencies` instead of `devDependencies`. | `package.json:34-42` | Move all build-only packages to `devDependencies` to reduce production install footprint and audit surface. |
| R-08 | **High** | `electron-builder.config.cjs` declares macOS (`dmg`) and Linux (`AppImage`) targets but `build/icon.icns` and `build/icon.png` are **missing**. | `electron-builder.config.cjs:61-71` | Either add the required icon assets or remove untested mac/linux targets to prevent build failures. |
| R-09 | **Medium** | `tsconfig.json` excludes `**/*.test.ts` and `**/*.test.tsx` from type checking. | `tsconfig.json:34-35` | Test code is not checked for type errors. Create a separate `tsconfig.test.json` or remove the exclusion. |
| R-10 | **Medium** | No pre-commit hooks, linting automation, or formatting rules (Prettier, ESLint, etc.). | Repo root | Add `husky` + `lint-staged` or at minimum an ESLint config. TypeScript `--noEmit` is not a linter. |
| R-11 | **Low** | `package.json` author field is generic ("Venice Forge contributors"). | `package.json:5` | Update to primary maintainer or org reference. |
| R-12 | **Low** | `.env.example` is missing several configurable values: `VENICE_API_BASE_URL`, `VENICE_TIMEOUT_MS`, `VENICE_RETRY_MAX_ATTEMPTS`. | `.env.example` | Expand template to document all runtime configuration options. |

### 1.3 CI / CD Gaps
| # | Severity | Issue | Location | Action |
|---|----------|-------|----------|--------|
| R-13 | **Medium** | CI workflow (`ci.yml`) only runs on `ubuntu-latest`. Electron-specific code is **never tested in CI** on Windows or macOS. | `.github/workflows/ci.yml` | Add a Windows runner job for at least `npm run typecheck` and `npm run build:electron`. |
| R-14 | **Medium** | Release workflow uploads artifacts but does not generate SHA-256 checksums or attach them to the GitHub Release. | `.github/workflows/windows-release.yml` | Add a step to generate `.sha256` files for each artifact. |
| R-15 | **Low** | No automated dependency update workflow (Dependabot / Renovate). | `.github/` | Enable Dependabot for npm and GitHub Actions. |

---

## 2. Security

### 2.1 Critical
| # | Severity | Issue | Location | Action |
|---|----------|-------|----------|--------|
| SEC-001 | **Critical** | **Electron FormData is completely broken.** `electron/services/veniceClient.ts:100-101` calls `JSON.stringify(request.body)` unconditionally. When `/augment/text-parser` sends a `FormData` object via IPC, it serializes to `{}` instead of multipart data. File upload fails silently in desktop mode. | `electron/services/veniceClient.ts:100-101` | Detect `FormData` / `Buffer` / `Stream` bodies in IPC transport and use `multipart/form-data` encoding with `https.request`. May require serializing FormData fields across the IPC boundary. |
| SEC-002 | **Critical** | **Web stream reader memory leak.** `src/services/veniceClient.ts:435` calls `response.body.getReader()` but **never calls `reader.releaseLock()`** in success, error, or abort paths. This locks the stream and prevents GC. | `src/services/veniceClient.ts:435-462` | Wrap the read loop in `try { ... } finally { reader.releaseLock(); }`. |
| SEC-003 | **Critical** | **SSRF / Path Traversal risk in Electron navigation.** `electron/main.ts:41` uses `path.resolve(fileURLToPath(parsed))` inside `isAllowedAppNavigation`. A malformed `file:` URL containing `..` sequences could escape the renderer root before the `startsWith` check. | `electron/main.ts:35-46` | Normalize and resolve the path **before** comparing, or use a stricter allowlist approach with `URL.pathname` validation. |

### 2.2 High
| # | Severity | Issue | Location | Action |
|---|----------|-------|----------|--------|
| SEC-004 | **High** | **Desktop client does not retry network failures.** In `src/services/veniceClient.ts:151-175`, transport errors (`ENOTFOUND`, `ECONNREFUSED`) set `lastError.status = null`, so the retry guard `[429,500,503].includes(null)` is `false`. The web client retries `TypeError` 3 times; desktop gives up immediately. | `src/services/veniceClient.ts:151-175` | Treat network-level failures as retryable in the desktop path, matching web behavior. |
| SEC-005 | **High** | **No fetch timeout in web client.** `veniceFetch` web path uses native `fetch` with no timeout. Stalled TCP connections hang indefinitely. | `src/services/veniceClient.ts:192-360` | Race `fetch` with `AbortSignal.timeout()` or a manual timer (e.g., 60s default). |
| SEC-006 | **High** | **No offline detection.** There are zero checks for `navigator.onLine`, no Electron `net` online/offline listeners, and no offline UI indicators. Users see generic errors when offline. | `src/App.tsx`, `src/services/veniceClient.ts`, `electron/main.ts` | Add online/offline event listeners and disable action buttons when offline. Show a persistent offline banner. |
| SEC-007 | **High** | **Zero response schema validation.** Every Venice API response is typed as `any`. If Venice changes response shapes, the app may crash or silently produce garbage. | `src/services/veniceClient.ts`, `src/state/appReducer.ts`, all modules | Introduce lightweight runtime validation (e.g., Zod or io-ts) for critical paths: `/models`, `/chat/completions`, `/image/generate`. |
| SEC-008 | **High** | **Web proxy binds to `0.0.0.0`** in `startServer()`, exposing the dev server to the local network. | `server.ts:195` | Bind to `127.0.0.1` by default; allow `HOST` env override for advanced use. |
| SEC-009 | **High** | **Hardcoded API host in 7 locations.** No environment override for `api.venice.ai`. Impossible to test against staging, proxies, or mirrors. | `electron/services/veniceClient.ts:8-9`, `server.ts:125`, `electron/ipc/validation.ts:27`, `src/services/veniceClient.ts:216,401` | Centralize API host/base-path into a single config module or env variable consumed by all three targets. |

### 2.3 Medium
| # | Severity | Issue | Location | Action |
|---|----------|-------|----------|--------|
| SEC-010 | **Medium** | `dangerouslySetInnerHTML` in `src/utils/markdown.tsx` is a maintenance risk. While `escapeHtml` runs first, future edits could accidentally break this invariant. | `src/utils/markdown.tsx:38` | Add a regression test that fuzzes common XSS payloads through `minimalMarkdown`, or migrate to a vetted library like `marked` with `DOMPurify`. |
| SEC-011 | **Medium** | `electron/services/secureStore.ts` sets `mode: 0o600` but this is **ignored on Windows** (no POSIX permissions). The file is stored in `%APPDATA%` accessible to any process running as the same user. | `electron/services/secureStore.ts:46-51` | Document this limitation more prominently; consider using Windows DPAPI-protected data protection API directly if `safeStorage` is insufficient. |
| SEC-012 | **Medium** | No request audit logging in the web proxy. `server.ts` does not log incoming requests, making incident response impossible. | `server.ts` | Add structured request logging (method, path, IP, status, latency) without logging bodies or secrets. |
| SEC-013 | **Medium** | `isTrustedExternalUrl` in `electron/main.ts` allows **any** `https:` URL. A compromised renderer could open malicious external sites. | `electron/main.ts:26-33` | Consider maintaining an explicit allowlist of domains (e.g., `venice.ai`, `github.com`) or warn users before opening unknown domains. |
| SEC-014 | **Medium** | `FileReader` blob-to-dataURL conversion in `veniceFetch` has **no `onerror` handler**. If reading fails, the Promise never resolves, causing a silent hang. | `src/services/veniceClient.ts:259-265` | Add `reader.onerror` rejection handler. |
| SEC-015 | **Medium** | `console.error` in `cryptoService.ts` could leak decryption failure details to the renderer console in production. | `src/services/cryptoService.ts:81` | Remove or replace with a redacted logger; decryption failures should not expose internal error details. |

### 2.4 Low
| # | Severity | Issue | Location | Action |
|---|----------|-------|----------|--------|
| SEC-016 | **Low** | `computeRateLimitWait` ignores the standard `Retry-After` header. | `src/services/veniceClient.ts:181-190` | Check `Retry-After` (seconds) before falling back to custom `x-ratelimit-reset-requests` logic. |
| SEC-017 | **Low** | Circuit breaker in `server.ts` resets on ANY non-5xx status, including `429 Too Many Requests`. A burst of 429s could prematurely clear the failure count. | `server.ts:152-154` | Only reset circuit breaker on `2xx` successes, not on client errors. |
| SEC-018 | **Low** | `server.ts` rate limiter uses an in-memory `Map` — useless in multi-process deployments (cluster, PM2). | `server.ts:55` | Document limitation or add a Redis-backed rate limiter for production multi-process deployments. |

---

## 3. UI / UX / Accessibility

### 3.1 Critical (P0)
| # | Severity | Issue | Location | Action |
|---|----------|-------|----------|--------|
| UI-001 | **P0** | Focus is **not trapped** inside the image preview modal. Keyboard users tab out of the modal and into the background page. | `ImageModule.tsx` (modal component) | Implement focus trap using `useRef` and `Tab` key interception; return focus to trigger on close. |
| UI-002 | **P0** | Toasts are **not announced to screen readers**. Assistive-tech users receive no feedback for success/error toasts. | `ToastHost.tsx` | Add `role="status"` / `aria-live="polite"` region and ensure toast text is read immediately. |
| UI-003 | **P0** | `StatusBlock` errors are **not announced**. Screen-reader users cannot perceive error messages. | `StatusBlock.tsx` | Add `role="alert"` and `aria-live="assertive"` to the error container. |
| UI-004 | **P0** | Gallery images and preview modals are **not keyboard accessible**. Cannot open, navigate, or close images with keyboard only. | `GalleryModule.tsx`, `ImageModule.tsx` | Add `tabIndex`, `onKeyDown` (Enter/Space to open, Escape to close), and visible focus rings. |

### 3.2 High (P1)
| # | Severity | Issue | Location | Action |
|---|----------|-------|----------|--------|
| UI-005 | **P1** | Destructive actions lack confirmation dialogs. "Clear IndexedDB history", "Delete API key", and gallery delete execute immediately. | `SettingsModule.tsx`, `GalleryModule.tsx` | Add a reusable `ConfirmDialog` component for destructive actions. |
| UI-006 | **P1** | `CollapsibleSection` lacks `aria-expanded` and `aria-controls`, making it invisible to screen readers as an interactive control. | `CollapsibleSection.tsx` | Add ARIA toggle attributes and keyboard support (Enter/Space). |
| UI-007 | **P1** | IndexedDB init failures in `App.tsx` are **silent** (`console.warn`). Users see a broken app with no explanation. | `App.tsx:61` | Dispatch a toast or show a persistent error banner when storage initialization fails. |
| UI-008 | **P1** | No client-side form validation feedback. Image generation can be submitted with empty prompts; chat can be sent with no model selected. | `ImageModule.tsx`, `ChatModule.tsx`, `BatchModule.tsx` | Add inline validation messages and disable submit buttons until required fields are valid. |
| UI-009 | **P1** | Chat messages use **array index as React key** (`key={idx}`). Inserting or deleting messages causes state bugs and unnecessary re-renders. | `ChatModule.tsx:330` | Use stable IDs (`crypto.randomUUID()` per message) instead of indices. |
| UI-010 | **P1** | Mobile nav rail uses `label.slice(0, 3)` instead of icons — extremely poor UX on small screens. | `App.tsx:151` | Add an icon mapping for each tab or use a hamburger menu with full labels. |

### 3.3 Medium (P2)
| # | Severity | Issue | Location | Action |
|---|----------|-------|----------|--------|
| UI-011 | **P2** | Missing `React.memo` / `useMemo` causing unnecessary re-renders in `ChatModule` and `ModelRefreshButton`. | `ChatModule.tsx`, `ModelRefreshButton.tsx` | Memoize heavy sub-components and callback handlers. |
| UI-012 | **P2** | Large gallery and model lists lack virtualization. Rendering 500+ images or models causes jank. | `GalleryModule.tsx`, `ModelsModule.tsx` | Introduce windowing (e.g., `react-window` or CSS `contain`) for large lists. |
| UI-013 | **P2** | Color contrast failure on `--faint` text class. May fail WCAG AA on some backgrounds. | `index.css` | Audit CSS variables against WCAG AA standards; darken faint text or lighten backgrounds. |
| UI-014 | **P2** | No loading skeletons or progress bars. Users see static "loading…" text with no sense of progress. | All modules | Replace text loaders with skeleton placeholders or determinate progress indicators where possible. |
| UI-015 | **P2** | No offline indicator. Users cannot tell when the app has lost connectivity. | `App.tsx` | Add a top-bar network-status chip that responds to `navigator.onLine` / `net` events. |
| UI-016 | **P2** | `textarea` and `input` elements lack `aria-label` in many places. | `ChatModule.tsx`, `ImageModule.tsx`, `SettingsModule.tsx` | Ensure every form control has an associated `<label>` or `aria-label`. |
| UI-017 | **P2** | Bulk gallery download has no progress indicator. Users cannot cancel or see completion status. | `GalleryModule.tsx` | Add a progress modal with cancel support for bulk operations. |
| UI-018 | **P2** | `DiagnosticsModule.tsx` table lacks `<caption>` for screen readers. | `DiagnosticsModule.tsx:231-255` | Add a visually hidden `<caption>` or `aria-labelledby`. |
| UI-019 | **P2** | Very long diagnostic header values overflow their cells without wrapping. | `DiagnosticsModule.tsx:240-244` | Add `word-break: break-all` or `overflow-wrap: anywhere` to value cells. |

---

## 4. Code Quality & Architecture

### 4.1 Critical
| # | Severity | Issue | Location | Action |
|---|----------|-------|----------|--------|
| CQ-001 | **Critical** | **Pervasive `any` types** undermine TypeScript strict mode. Nearly every module, service, and utility uses `any` for state, dispatch, payloads, and responses. | `src/modules/*.tsx`, `src/services/*.ts`, `src/state/appReducer.ts` | Gradually replace `any` with strict types: start with `AppState`, `AppDispatch`, `AppAction`, then module props, then API responses. |
| CQ-002 | **Critical** | **Missing test coverage** for core services. Only 6 `.test.ts` files exist; zero `.test.tsx` files. Critical paths like `storageService`, `cryptoService`, `desktopBridge`, and most React components are untested. | `src/services/`, `src/modules/`, `src/components/` | Add tests for: `storageService`, `cryptoService`, `desktopBridge`, `veniceClient` (mock fetch), `exportImport`, and at least one module render test. |

### 4.2 High
| CQ-003 | **High** | `ImageModule.tsx` is extremely large (>500 lines) and handles generation, upscaling, batch queue, preview modal, and saving logic. | `src/modules/ImageModule.tsx` | Decompose into sub-components: `ImageGenerator`, `ImagePreviewModal`, `ImageSettingsForm`. |
| CQ-004 | **High** | `GalleryModule.tsx` accesses `state.chats` via `(state as any).chats`, bypassing type safety and suggesting incorrect state shape usage. | `src/modules/GalleryModule.tsx:137-149` | Remove `as any` cast; if gallery needs chat data, pass it explicitly via props or derive it in the reducer. |
| CQ-005 | **High** | Settings save failure in `App.tsx:87` is silently swallowed (`.catch(() => {})`). | `App.tsx:87` | At minimum dispatch a toast; ideally surface the error to the user and retry. |
| CQ-006 | **High** | Duplicated payload builder logic across `ChatModule`, `ImageModule`, and `BatchModule`. | Multiple modules | Extract shared builders: `buildChatPayload()`, `buildImagePayload()`, `buildBatchPayload()`. |
| CQ-007 | **High** | `appReducer.ts` uses `any` for models, lists, and classifiers. No runtime validation of `/models` response shape. | `src/state/appReducer.ts:4-55` | Add runtime shape guards and strong types for `ModelInfo` and grouped models. |

### 4.3 Medium
| CQ-008 | **Medium** | Unused `React` imports exist in files that use the automatic JSX transform. | Various `.tsx` files | Remove unnecessary `import React from 'react'` lines. |
| CQ-009 | **Medium** | Missing return types on many public/exported functions. | `src/services/*.ts`, `src/utils/*.ts` | Add explicit return types to all exported functions for better inference and documentation. |
| CQ-010 | **Medium** | Missing JSDoc on complex utilities (`classifyModel`, `computeRateLimitWait`, circuit breaker logic). | `src/state/appReducer.ts`, `src/services/veniceClient.ts`, `server.ts` | Add JSDoc blocks explaining parameters, return values, and side effects. |
| CQ-011 | **Medium** | `summarizeDiagnostics` accepts `any` parameter with no validation. | `src/services/veniceClient.ts:38-62` | Define a strict `DiagnosticsSummaryInput` interface. |
| CQ-012 | **Medium** | `veniceFetchDesktop` and `veniceFetch` web path use **different retry backoff formulas**. | `src/services/veniceClient.ts:135-142, 170-172, 304-311, 347-353` | Unify into a single `calculateBackoff(attempt, status, headers)` utility. |
| CQ-013 | **Medium** | `async` catch handler in `response.json().catch(async () => { ... })` is unnecessarily double-wrapped. | `src/services/veniceClient.ts:249` | Simplify to synchronous `.catch(() => ...)` or use `try/catch`. |

### 4.4 Low
| CQ-014 | **Low** | `electron/services/veniceClient.ts:173-181` calls `cleanup()` twice (from `error` and `close` events). | `electron/services/veniceClient.ts` | Remove redundant listener or guard with `activeRequests.has()`. |
| CQ-015 | **Low** | `setLastApiError` is not called for network-level rejections in Electron client. | `electron/services/veniceClient.ts:173-181` | Call `setLastApiError` in the `req.on("error")` handler. |
| CQ-016 | **Low** | `isFetchFailure = err instanceof TypeError` is too narrow; some browser errors are `DOMException`. | `src/services/veniceClient.ts:324` | Broaden detection or use a whitelist of retryable error messages. |
| CQ-017 | **Low** | `electron-builder.config.cjs` declares macOS/Linux targets that are untested and lack icon assets. | `electron-builder.config.cjs:61-71` | Remove or comment out untested platforms until they are supported. |

---

## 5. API & Integration Issues

### 5.1 Critical
| # | Severity | Issue | Location | Action |
|---|----------|-------|----------|--------|
| API-001 | **Critical** | **Electron FormData broken** (same as SEC-001). File upload via `/augment/text-parser` sends `{}` instead of multipart in desktop mode. | `electron/services/veniceClient.ts:100-101` | Re-architect IPC body transport to support binary/blob data for file uploads. |
| API-002 | **Critical** | **Web stream reader never releases lock** (same as SEC-002). Memory leak in `veniceStreamChat`. | `src/services/veniceClient.ts:435-462` | Add `reader.releaseLock()` in `finally` block. |

### 5.2 High
| API-003 | **High** | **No caching for `/models`**. Fetches on every app init with no TTL, causing redundant API calls and rate-limit pressure. | `src/services/modelService.ts`, `src/App.tsx` | Cache model list in `IndexedDB` or `localStorage` with a TTL (e.g., 1 hour). Stale-while-revalidate pattern recommended. |
| API-004 | **High** | **No request deduplication**. Multiple rapid clicks on "Refresh models" or "Send" fire duplicate concurrent requests. | `src/services/veniceClient.ts`, modules | Add an in-flight request deduplication map (key = endpoint + body hash) that returns the same Promise to concurrent callers. |
| API-005 | **High** | **No offline detection** (same as SEC-006). | Global | Implement `navigator.onLine` checks and disable API-dependent buttons when offline. |
| API-006 | **High** | **Zero response schema validation** (same as SEC-007). | Global | Introduce Zod schemas for Venice API responses. |
| API-007 | **High** | **Desktop does not retry network failures** (same as SEC-004). | `src/services/veniceClient.ts:151-175` | Align desktop retry logic with web retry logic. |
| API-008 | **High** | **No fetch timeout in web client** (same as SEC-005). | `src/services/veniceClient.ts:192-360` | Implement fetch timeout via `AbortSignal.timeout()`. |

### 5.3 Medium
| API-009 | **Medium** | Missing useful Venice API endpoints: `/models/{id}`, `/embeddings`, `/audio/speech`, `/usage` / `/keys`. | `src/shared/validation.ts`, modules | Add endpoints to allowlist and build UI modules for embeddings, TTS, and usage tracking. |
| API-010 | **Medium** | `computeRateLimitWait` ignores standard `Retry-After` header. | `src/services/veniceClient.ts:181-190` | Prefer `Retry-After` over custom Venice headers. |
| API-011 | **Medium** | Delta extraction in web streaming is inconsistent with desktop. Desktop checks `json?.choices?.[0]?.text`; web does not. | `src/services/veniceClient.ts:455-458`, `electron/services/veniceClient.ts:50` | Unify delta extraction logic into a shared helper. |
| API-012 | **Medium** | `veniceStreamChat` web path does not verify `Content-Type: text/event-stream` before SSE parsing. | `src/services/veniceClient.ts:401-408` | Bail out with a clear error if the response is not SSE. |
| API-013 | **Medium** | No health check or ping endpoint for the web proxy. | `server.ts` | Add a `GET /health` endpoint that returns `{ status: "ok", version }`. |
| API-014 | **Medium** | Circuit breaker resets on client errors (`429`). | `server.ts:152-154` | Only reset on `2xx` responses. |
| API-015 | **Medium** | Server-side rate limiter does not forward upstream `Retry-After` to clients. | `server.ts` | Proxy `Retry-After` and Venice rate-limit headers back to the caller. |
| API-016 | **Medium** | `FileReader` has no error handler in blob-to-dataURL conversion. | `src/services/veniceClient.ts:259-265` | Add `reader.onerror` rejection. |
| API-017 | **Medium** | `parseSseLines` silently drops malformed JSON with empty `catch {}`. | `src/services/veniceClient.ts:453-460` | Log malformed events to console (dev only) or surface a user-visible warning. |
| API-018 | **Medium** | Hardcoded proxy base path `/api/venice` in renderer and hardcoded target in server. | `src/services/veniceClient.ts:216,401`, `server.ts:125` | Centralize base path configuration. |

### 5.4 Low
| API-019 | **Low** | `looksLikeUnixTimestamp` heuristic is logically unsound for very early Unix timestamps (< 86400). | `src/services/veniceClient.ts:25-27` | Use explicit header documentation or prefer `Retry-After`. |
| API-020 | **Low** | Fallback rate-limit backoff caps at 16s; some aggressive limits need longer. | `src/services/veniceClient.ts:189` | Increase cap to 60s or respect `Retry-After`. |
| API-021 | **Low** | No `Cache-Control`, `ETag`, or `If-None-Match` handling. | `src/services/veniceClient.ts` | Add conditional request support for cacheable endpoints like `/models`. |

---

## 6. Quick-Win Priority Queue

If you only have a few hours, tackle these first (biggest impact / smallest effort):

1. **R-05** — Fix invalid `dotenv` version in `package.json` (1 min).
2. **R-06** — Remove deprecated `@types/http-proxy-middleware` (1 min).
3. **R-07** — Move build deps to `devDependencies` (5 min).
4. **SEC-002 / API-002** — Add `reader.releaseLock()` in `veniceStreamChat` (5 min).
5. **UI-003** — Add `role="alert"` to `StatusBlock` (5 min).
6. **UI-009** — Use stable UUID keys for chat messages (10 min).
7. **CQ-005** — Surface settings save errors in `App.tsx` (10 min).
8. **API-013** — Add `GET /health` to `server.ts` (10 min).
9. **SEC-014 / API-016** — Add `FileReader.onerror` handler (5 min).
10. **R-03** — Create `CODEOWNERS` file (5 min).

---

*This backlog was generated by comprehensive static analysis, automated audit agents, and manual code review. Update it as items are completed or new issues are discovered.*
