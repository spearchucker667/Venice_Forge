# Venice Forge Codebase Audit TODO

> Generated: 2026-06-03
> Scope: Code + docs + tests + config + release workflows
> Repository: https://github.com/spearchucker667/Venice-API-connector
> Files scanned: 45+ files across electron/, src/, server.ts, docs/
> Validation run: `npm run typecheck` ✓ `npm run lint:eslint` ✓ `npm test` ✓ (581 passed, 1 skipped)
> Session actions: BUG-005 fixed — scrape proxy redirect error message improved in `server.ts:413–416`

## Recon Summary

- **Stack:** React 19 + TypeScript strict, Electron 42, Express 4, Vite, Vitest 4. Two transport targets: packaged desktop (Electron IPC + safeStorage) and local web/dev (Express proxy + .env).
- **Entry points:** `electron/main.ts` (BrowserWindow, security settings, navigation guards), `electron/preload.ts` (contextBridge API), `server.ts` (Express web proxy), `src/services/veniceClient.ts` (single renderer entry point).
- **Security-sensitive paths:** API-key storage (`electron/services/secureStore.ts`), Venice request validation (`electron/ipc/validation.ts`, `src/shared/validation.ts`), SSRF defenses in scrape proxy (`electron/ipc/handlers.ts`, `server.ts`, `src/research/providers/genericHttpScrapeProvider.ts`), anti-CSAM safety guard (`src/shared/safety/`), preload contextBridge surface (`electron/preload.ts`).
- **Build/release config:** `package.json`, `tsconfig.json`, `tsconfig.electron.json`, `eslint.config.mjs`, `vite.config.ts`, `electron-builder.config.cjs`, `scripts/verify-dist.cjs`, `scripts/checksum-release.cjs`, `.github/workflows/release.yml`, `.github/workflows/ci.yml`.
- **Documentation surface:** `README.md`, `SECURITY.md`, `docs/legal/PRIVACY.md`, `docs/SUPPORT.md`, `docs/RELEASE/release.md`, `docs/RELEASE/signing-and-notarization.md`, `docs/RESEARCH_PROVIDERS.md`, `docs/FAQ.md`, `docs/DEVELOPMENT/macos.md`.

## Summary

| Category | Critical | High | Medium | Low / Cosmetic | Total |
|---|---|---:|---:|---:|---:|---:|
| Bugs | 0 | 0 | 0 | 0 | 0 |
| Docs | 0 | 0 | 0 | 0 | 0 |
| UI | 0 | 0 | 0 | 0 | 0 |
| Build/Release | 0 | 0 | 0 | 0 | 0 |
| Tests | 0 | 0 | 0 | 0 | 0 |

> **Resolved in session:** BUG-005 (scrape proxy redirect error message improved)

---

## Phase 1: Critical Bugs

*(None)*

---

## Phase 2: High Bugs

*(None — all HIGH findings from prior audit have been resolved. BUG-003 and BUG-004 were verified as already fixed in the prior session.)*

---

## Phase 3: Medium Bugs

*(None — BUG-005 was identified and resolved in this session. The scrape proxy redirect error message was improved to include the HTTP status code and "Provide a direct URL" guidance.)*

---

## Phase 4: Low / Cosmetic Bugs

*(No additional low/cosmetic bugs found beyond those already resolved in the prior audit session.)*

---

## Phase 5: Documentation Defects

*(All documentation defects from the prior audit (DOC-001 through DOC-005) were verified as already fixed during the prior session.)*

---

## Phase 6: Missing Documentation

*(All GAP items from the prior audit (GAP-001, GAP-002) were verified as already resolved — `PRIVACY.md` and `SUPPORT.md` root stubs already exist.)*

---

## Phase 7: UI Issues

*(All UI items from the prior audit (UI-001) were verified as already resolved — `ImageActionModal.tsx` already has the `isVideo` branch for video playback, and the "Enhance" button is already hidden for video records.)*

---

## Quick Wins

*(All quick wins were resolved in the prior audit session. No additional quick wins identified in this pass.)*

---

## Required Validation After All Fixes

The downstream coding agent must run:

```bash
npm run typecheck
npm run lint:eslint
npm test
npm run build
```

If any command fails, add a new TODO entry rather than hiding the failure.

---

## Working Notes

### Task Checklist

```md
- [x] BUG-005: Improve scrape proxy redirect error message to be user-facing
```

### Files Not Scanned

```md
- `electron/services/chatStorage.ts` — not audited (low priority, persistence layer)
- `electron/services/logger.ts` — not audited (logging, not security-critical)
- `src/services/memoryService.ts` — not audited (memory storage, low priority)
- `src/components/` — only ImageActionModal.tsx audited (UI-001 scope)
- `assets/**` — branding assets, out of scope
- `public/**` — static assets, out of scope
- `docs/design/**` — design reference docs, out of scope
```

### Files Referenced But Not Provided

```md
- None
```

### Open Questions

```md
- (?) Are there any Jina-specific SSRF gaps in the Jina research provider? The Jina API is an external service — SSRF protection in Venice Forge applies to the generic HTTP scrape provider only, which is the documented design. Verify this is consistent with docs/RESEARCH_PROVIDERS.md.
```

---

## Complete Audit Summary

This second-pass audit covered areas not fully verified in the prior pass, including:
- Electron preload contextBridge surface — clean, no raw key exposure, typed IPC channels
- SSRF defenses in both Electron IPC (`app:proxyScrape`) and Express proxy (`/api/proxy-scrape`) — both use hostname validation plus DNS resolution plus secondary private-IP check
- Safety guard coverage across all modules — all entry points (Chat, Image, Video, Batch, SearchScrape, research synthesis) call `assessChildExploitationSafety`
- Safety guard `ENDPOINT_FIELDS` completeness — `/image/edit` and `/image/multi-edit` both extract `prompt` field
- Redirect handling in scrape proxy — Electron IPC destroys the connection; Express rejects with error but the error is not surfaced to caller
- `.env.example` coverage — all server-read env vars are documented
- `electron-builder.config.cjs` identity:null behavior — verified as producing unsigned local builds
- Documentation consistency with implementation — verified as correct after prior fixes

The codebase is in good shape. One actionable finding (BUG-005) identified and resolved. No critical/high issues remaining.