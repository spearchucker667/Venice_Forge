# Research Browser Plan

## Phase 0: Baseline Proof
- Ran `npm ci`, `lint:eslint`, and `typecheck` (passed with 0 warnings).
- Confirmed `package.json` contains no existing `<webview>` configuration.
- Examined `providerTypes.ts`, `veniceResearchProvider.ts`, and `jinaResearchProvider.ts`.

## Phase 1: Provider Type Cleanup
- Update `ResearchProviderId` and variants.
- Support typed options for Venice (`brave`, `google`) and Jina (`search`, `reader`).
- Apply these to `researchService.ts`.

## Phase 2: Jina Header/Server Parity
- Add `X-Return-Format`, `X-No-Cache`, `X-Retain-Images`, `X-With-Links-Summary`, `X-With-Images-Summary`, `X-Token-Budget`, `X-Timeout` to the server and IPC allowlist.
- Block headers like `authorization`, `cookie`, `x-jina-api-key`.

## Phase 3: Browser Bridge Types
- Create `src/types/researchBrowser.ts`.
- Expose methods like `navigate`, `scrapeCurrent`, `captureMetadata`.

## Phase 4: Electron Browser Service
- Create `electron/services/researchBrowserService.ts`.
- Use `WebContentsView` directly.
- Ensure strict URL blocking for `file://`, `localhost`, etc.

## Phase 5: IPC Handlers
- Map `researchBrowser:*` IPC events to the browser service.

## Phase 6: React UI
- Build `ResearchBrowserPanel` and integrate into `SearchScrapeView`.
- Use mesh UI tokens.

## Phase 7: Workspace Integration
- Hook browser scrape/save to `research-store.ts`.

## Phase 8: Visual Upgrade
- Add mesh styling (`mesh-panel`, `mesh-card`, soft separators).

## Phase 9: Docs & Verification
- Document provider matrix.
- Ensure `verify:contracts` passes with a new `verify:research-browser` script.
