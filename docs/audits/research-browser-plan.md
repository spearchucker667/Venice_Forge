# Research Web Expansion + Mini Browser Implementation Plan

> Baseline recorded: 2026-06-17 PDT
> Node: v24.15.0, npm: 11.12.1

## Baseline State

- ESLint: ✅ pass
- Typecheck: ✅ pass (renderer + electron)
- Research workspace tests: ✅ 101 tests, 7 files pass
- Network boundaries: ✅ pass
- Theme tokens: ✅ pass
- Full test suite: 3 failed files (pre-existing: chat-view, imageIngestion), 3184 passed

## Existing Infrastructure (Already Present)

1. `src/types/researchBrowser.ts` — complete types (state, bounds, navigate, scrape, metadata, preload API)
2. `electron/services/researchBrowserServer.ts` — WebContentsView service with create/destroy/setVisible/setBounds/navigate/back/forward/reload/stop/getState/scrapeCurrent/captureMetadata
3. `electron/preload.ts` — `researchBrowser` bridge exposed via contextBridge
4. `electron/main.ts` — calls `setupResearchBrowserIpc(win)`
5. `src/shared/urlSecurity.ts` — `isAllowedResearchBrowserUrl`, `isPrivateHostname`, `isTrustedExternalUrl`
6. `src/research/providerTypes.ts` — `ResearchProviderVariant`, `VeniceSearchProvider`, typed options
7. `src/research/providers/veniceResearchProvider.ts` — supports `options.provider` (brave/google)
8. `src/research/providers/jinaResearchProvider.ts` — `buildHeaders` with all Jina option headers
9. `server.ts` + `electron/ipc/handlers.ts` — Jina header allowlists already synchronized (x-no-cache, x-token-budget, x-with-links-summary, x-with-images-summary, x-retain-images)
10. `src/stores/auth-store.ts` — `jinaApiKey`, `jinaIsConfigured`, `checkConfiguration()`
11. `src/stores/research-store.ts` — full CRUD for sessions, sources, findings
12. `src/services/researchService.ts` — `runResearchSearch`, `runResearchScrape` with provider switch

## Gaps to Close

### Gap A — Config Schema Extension
`src/config/configSchema.ts` missing:
- `research.default_search_provider` (brave | google)
- `research.default_reader_provider` (jina | generic-http)
- `research.enable_live_browser` (boolean)
- `research.live_browser_search_provider` (google | brave)
- `research.live_browser_persist_session` (boolean)
- `research.live_browser_javascript_enabled` (boolean)
- `research.max_browser_extract_chars` (number, default 40000)

### Gap B — Browser Service Security Hardening
`electron/services/researchBrowserServer.ts` needs:
- `will-frame-navigate` handler
- `will-redirect` handler  
- `webRequest.onBeforeRequest` for blocking redirects to private URLs
- `securityLabel: "blocked"` when navigation is denied
- `openExternal` IPC handler (delegates to `shell.openExternal` after user confirmation)
- Partition rename: `persist:venice-forge-research-browser`
- Better protocol blocking (file:, data:, javascript:, blob:, chrome:, devtools:)

### Gap C — React UI Components (Missing)
- `src/components/search/ResearchBrowserPanel.tsx` — right-side panel, placeholder div, ResizeObserver, bounds reporting
- `src/components/search/ResearchBrowserToolbar.tsx` — back/forward/reload/stop/URL/search/open external/save/scrape
- `src/components/search/ResearchProviderStatus.tsx` — Venice/Jina/Generic/Browser status indicators
- `src/components/search/ResearchBrowserPanel.test.tsx` — UI tests

### Gap D — SearchScrapeView Integration
`src/components/search/SearchScrapeView.tsx` needs:
- New "Browser" sub-tab
- `ResearchProviderStatus` in header
- `ResearchBrowserPanel` in right column (desktop >= 1100px)
- Result cards with "Open in mini browser", "Scrape with Venice", "Read with Jina", "Save to session", "Open external"
- `runAiResearch` upgrade: retrieve-only vs retrieve-and-synthesize, explicit Venice Brave/Google, Jina Search/Reader, budget controls
- `ResearchBrowserPanel` responsive: collapse to bottom drawer on medium, modal on small

### Gap E — Research Service Provider Resolution
`src/services/researchService.ts` needs:
- Better `resolveProvider` using `ResearchProviderVariant` explicitly
- Jina options typed as `JinaResearchOptions` not `Record<string, unknown>`

### Gap F — Workspace Integration
`src/stores/research-store.ts` already has `addSource`. Need:
- Browser scrape result → `addSource` with de-dupe by canonical URL
- Toast on save
- Prompt to create session if no active session

### Gap G — Verification & Tests
- `scripts/verify-research-browser.cjs` — new verifier
- Unit tests for provider routing, Jina headers, URL blocking, browser service, IPC, UI, research-store integration
- Update `package.json` scripts

### Gap H — Documentation
- `docs/DEVELOPMENT/JINA_PROVIDER.md` — update with new options
- `docs/audits/RESEARCH_PROVIDERS.md` — update provider matrix
- `docs/summary_of_work.md` — session log
- `AGENTS.md` — if new verifier added

## Implementation Order

1. **Phase 1** — Config schema extension + browser service hardening
2. **Phase 2** — Provider types cleanup + service resolution upgrade
3. **Phase 3** — React UI components (Browser Panel, Toolbar, Provider Status)
4. **Phase 4** — SearchScrapeView integration (new sub-tab, responsive layout, result cards, AI research revamp)
5. **Phase 5** — Workspace integration (browser → store, de-dupe, toast)
6. **Phase 6** — Tests + verifier
7. **Phase 7** — Docs + validation

## Security Checklist

- [ ] No `<webview>` used
- [ ] No `BrowserView` used for new code
- [ ] `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`
- [ ] Separate partition for research browser
- [ ] `will-navigate`, `will-frame-navigate`, `will-redirect` block private URLs
- [ ] `webRequest.onBeforeRequest` blocks redirects to private URLs
- [ ] `setWindowOpenHandler` denies popups by default
- [ ] No raw DOM/cookies/localStorage exposed to renderer
- [ ] Jina key never exposed to renderer
- [ ] `isAllowedResearchBrowserUrl` rejects file:, data:, javascript:, blob:, chrome:, devtools:
- [ ] `isPrivateHostname` rejects localhost, 127.0.0.1, private IPv4/IPv6
- [ ] Browser extracted text capped at 40,000 chars
- [ ] `openExternal` only via trusted `shell.openExternal` after confirmation
