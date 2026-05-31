# Venice Forge — Repository TODO

> Refreshed: 2026-05-31
> Scope: source, tests, docs, workflows, agent instructions, and repository hygiene
> Baseline checks this pass: `npm run typecheck`, `npm run lint:eslint`, `npm run verify:safety-guard`, `npm audit --omit=dev`, `npm test`, `npm run build`

## Audit Summary

| Category | Count |
|----------|-------|
| Critical open bugs | 0 |
| High-priority open bugs | 0 |
| Medium-priority open bugs | 12 |
| Low/accessibility/UX open items | 10 |
| Documentation/config tasks | 7 |
| Security hardening tasks | 5 |

Several stale critical/high items from the prior bug hunt are already fixed in source and are listed in the resolved ledger below so they do not get re-triaged as open defects.

## High Priority Bugs

- [x] **[HIGH-001] Abort listener leak in image batch delay** — `src/modules/ImageModule.tsx:96`
  - The local `delay` helper adds an abort listener with `{ once: true }` but never removes it when the timeout resolves first.
  - Fixed: extracted `waitForImageBatchDelay()` and added regression coverage for resolve and abort cleanup.

- [x] **[HIGH-002] Search/scrape stale response race** — `src/modules/SearchScrapeModule.tsx`
  - Search and scrape async flows can overwrite newer results if users trigger multiple requests quickly.
  - Fixed: central run startup now aborts the previous operation, increments the run ID, and suppresses superseded search/scrape/parser/research/profile updates. Added search-to-scrape stale response coverage.

- [x] **[HIGH-003] Chat send can still read stale message closure under rapid sends** — `src/modules/ChatModule.tsx`
  - The send path uses component state to assemble conversation context; rapid same-tick sends can miss the latest local message.
  - Fixed: added a latest-message ref, committed message updates through one helper, and added a synchronous send lock with rapid duplicate-send coverage.

- [x] **[HIGH-004] Update-check spinner can depend on external events to clear** — `src/modules/SettingsModule.tsx`
  - Confirm every successful update-check path clears `isUpdateChecking`, including no-update/no-event paths.
  - Fixed: update checks now use try/catch/finally, track whether updater events fired, and show a fallback completion status when no event arrives.

- [x] **[HIGH-005] Log rotation is non-atomic under concurrent writes** — `electron/services/logger.ts`
  - Simultaneous rotations can lose log lines or race on renamed backup files.
  - Fixed: hardened rotation with safe stat/rename helpers, oldest-backup replacement, and full-ring regression coverage.

- [x] **[HIGH-006] Main process conversation listing still starts from an unbounded `readdir`** — `electron/services/chatStorage.ts`
  - File processing is capped and batched, but `fs.readdir` still loads the whole directory first.
  - Fixed: `listConversations()` now uses bounded `fs.opendir()` iteration before batched reads, with regression coverage against eager `readdir`.

- [x] **[HIGH-007] Profile discovery cancellation needs end-to-end tests** — `src/research/agent/socialDiscovery.ts`, `src/modules/SearchScrapeModule.tsx`
  - Signal forwarding now exists in the agent path; add UI/agent regression coverage that Cancel stops a running discovery job.
  - Fixed: profile discovery now exposes a Cancel control while running, aborts the propagated signal, clears loading state, and ignores late results in regression coverage.

## Medium Priority Bugs

- [ ] **[MED-001] `veniceFetch<T>` returns unchecked generic data** — `src/services/veniceClient.ts`
- [ ] **[MED-002] Error-body stringification can mask malformed API errors** — `src/services/veniceClient.ts`
- [ ] **[MED-003] Timeout-signal helpers need cleanup review** — `src/services/veniceClient.ts`, `src/research/providers/*.ts`, `src/research/agent/researchRunner.ts`
- [ ] **[MED-004] `serializeFormData` should support plain `Blob` values** — `src/services/veniceClient.ts`
- [ ] **[MED-005] Diagnostics should preserve status `0` explicitly** — `src/services/veniceClient.ts`
- [ ] **[MED-006] `Retry-After` should be captured in diagnostics and retry logic** — `src/services/veniceClient.ts`
- [ ] **[MED-007] Settings hydration should validate persisted shape** — `src/App.tsx`, `src/shared/configSchema.ts`
- [ ] **[MED-008] Main root mounting lacks a user-visible fallback** — `src/main.tsx`
- [ ] **[MED-009] Web diagnostics copy flow needs explicit fallback** — `src/modules/DiagnosticsModule.tsx`
- [ ] **[MED-010] Export casts suppress runtime shape checks** — `src/modules/SettingsModule.tsx`, `src/services/exportImport.ts`
- [ ] **[MED-011] Bulk gallery download needs failure cleanup tests** — `src/modules/GalleryModule.tsx`
- [ ] **[MED-012] `isValidMessage` permits array content without validating part schema** — `electron/services/chatStorage.ts`

## Low / Accessibility / UX

- [ ] **[LOW-001] Field label association is fragile for non-forwarding children** — `src/components/Field.tsx`
- [ ] **[LOW-002] Image action modal should restore previous body overflow exactly** — `src/components/ImageActionModal.tsx`
- [ ] **[LOW-003] Image action modal alt text needs a guaranteed fallback** — `src/components/ImageActionModal.tsx`
- [ ] **[LOW-004] Image preview fallback should avoid non-null assertions** — `src/components/ImageGenerationPreview.tsx`
- [ ] **[LOW-005] Image preview grid class has redundant branches** — `src/components/ImageGenerationPreview.tsx`
- [ ] **[LOW-006] Modal roots should be focusable when no child control exists** — `src/hooks/useFocusTrap.ts`, modal components
- [ ] **[LOW-007] Confirm modal focus should avoid timer races** — `src/components/ConfirmModal.tsx`
- [ ] **[LOW-008] Dynamic live regions may be missed by screen readers** — `src/components/StatusBlock.tsx`, toast/status components
- [ ] **[LOW-009] Send button `disabled` and `aria-disabled` should agree** — `src/modules/ChatModule.tsx`
- [ ] **[LOW-010] Error boundary should offer local reset when feasible** — `src/components/ErrorBoundary.tsx`

## Security Hardening

- [ ] **[SEC-001] Add redirect-regression tests for Generic HTTP SSRF protection** — `src/research/providers/genericHttpScrapeProvider.test.ts`
- [ ] **[SEC-002] Add trailing-dot/all-zero hostname regression tests** — `src/research/providers/genericHttpScrapeProvider.test.ts`
- [ ] **[SEC-003] Replace count-based safety verification with AST or handler registry checks** — `scripts/verify-safety-guard.cjs`
- [ ] **[SEC-004] Add tests that no raw prompt text appears in safety logs/diagnostics** — `src/shared/safety/*`
- [ ] **[SEC-005] Run `npm audit` before every release, including dev dependencies when release tooling changes**

## Missing Tests / Coverage Gaps

- [ ] Add tests for update-check success/no-update UI cleanup.
- [ ] Add tests for Search/Scrape run ID deduplication and cancellation.
- [ ] Add tests for `Blob` FormData IPC serialization.
- [ ] Add tests for safe stringify of malformed error bodies.
- [ ] Add tests for corrupted settings fallback.
- [ ] Add tests for web-mode diagnostics copy.
- [ ] Add accessibility tests for modal focus and label associations.
- [ ] Add release-script tests for `verify-dist` platform selection.

## Documentation Gaps

- [ ] Document Linux packaging status or remove the Linux target if unsupported.
- [ ] Document `build/icon.png` as a required Linux packaging resource if Linux target remains.
- [ ] Keep `docs/REPOSITORY_TREE.md` updated after file renames/additions.
- [ ] Add a short maintainer note explaining ignored generated audit handoff files under `docs/AGENTS/`.
- [ ] Keep `.github/copilot-instructions.md`, `GEMINI.md`, `CLAUDE.md`, `.cursorrules`, and `.windsurfrules` delegated to `AGENTS.md` to avoid contradictory agent instructions.
- [ ] Update release docs whenever signing, artifact naming, or verification commands change.
- [ ] Update security docs whenever allowed Venice endpoints or safety boundaries change.

## Refactoring / Tech Debt

- [ ] Create one shared timeout/signal utility for renderer research providers and Venice client code.
- [ ] Replace broad `Record<string, unknown>` parsing with narrow validators where API response shape matters.
- [ ] Reduce ESLint warning budget from 96 toward the current observed count of 58 after each cleanup pass.
- [ ] Consider extracting chat send orchestration into a testable service.
- [ ] Consider a small persistence schema module for settings, conversations, gallery images, and imports.

## Feature Completeness Checklist

- [ ] Chat: cancellation, retry diagnostics, memory injection, attachment handling, and conversation persistence are documented and covered.
- [ ] Image generation: batch generation, upscale, watermark fallback, and gallery save flows are documented and covered.
- [ ] Research: Venice, Jina, Generic HTTP, synthesis, and profile discovery flows are documented and covered.
- [ ] Settings: API keys, theme maker, import/export, and update controls are documented and covered.
- [ ] Diagnostics: Electron and web-mode copy/export paths are documented and covered.
- [ ] Release: Windows/macOS artifact names, checksums, signing, notarization, and verification are documented and covered.

## Resolved / Stale Prior Findings

- [x] **[RESOLVED] Embedded adversarial research synthesis prompt removed** — `src/research/agent/researchSynthesis.ts`
  - Current source uses a plain safety-respecting synthesis prompt; no `_rsd`, `ALLOW_ALL`, or base64-obfuscated jailbreak strings remain.

- [x] **[RESOLVED] Generic HTTP provider rejects redirects** — `src/research/providers/genericHttpScrapeProvider.ts`
  - Current fetch call uses `redirect: "error"`.

- [x] **[RESOLVED] `verify-dist` no longer defaults Linux to Windows artifacts** — `scripts/verify-dist.cjs`
  - Current fallback checks `process.platform === "win32"`.

- [x] **[RESOLVED] Generic HTTP SSRF trailing-dot and all-zero hostnames blocked** — `src/research/providers/genericHttpScrapeProvider.ts`
  - Current hostname normalization strips trailing dots and rejects all-zero hostnames.

- [x] **[RESOLVED] Social discovery forwards signal/timeout** — `src/research/agent/socialDiscovery.ts`
  - Current provider search call passes `signal` and `timeoutMs`.

- [x] **[RESOLVED] Proxy writes non-Buffer bodies instead of silently dropping them** — `server.ts`
  - Current proxy header helper serializes Buffer, string, and JSON bodies and sets `Content-Length`.

- [x] **[RESOLVED] Electron Venice multipart preparation errors are caught and logged** — `electron/services/veniceClient.ts`
  - Current request preparation has a `try/catch` before HTTPS request creation.

- [x] **[RESOLVED] Conversation writes use unique temp files** — `electron/services/chatStorage.ts`
  - Current temp path includes `crypto.randomUUID()`.

- [x] **[RESOLVED] Conversation validation allows tool role and array content** — `electron/services/chatStorage.ts`
  - Follow-up remains to validate array part schema.

- [x] **[RESOLVED] Batch abort refreshes persisted state before returning** — `src/modules/BatchModule.tsx`

- [x] **[RESOLVED] Toast warn style and stable timer deps added** — `src/components/ToastHost.tsx`

- [x] **[RESOLVED] Image generation normalizes draft before request and protects cleanup refresh** — `src/modules/ImageModule.tsx`

- [x] **[RESOLVED] Jina timeout header uses top-level input timeout** — `src/research/providers/jinaResearchProvider.ts`
