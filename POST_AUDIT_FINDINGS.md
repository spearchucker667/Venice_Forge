# Venice Forge Post-Audit Findings

**Audit date:** 2026-06-06  
**Baseline:** `c6013208` (`feat(audit): canonical tab registry, chat-persistence hardening, dev-global gate`)  
**Scope:** Documentation consistency, RP/character chat, research/Jina/scraping, YAML config and secure-key import, media polish, accessibility, and performance risk.

## Executive Summary

- No P0 release blockers were confirmed.
- Two P1 behavior defects were confirmed and fixed: config secret redaction was asynchronous/non-atomic, and RP chat creation could leave an unpersisted ghost chat after a rejected save.
- Four P2 issues were fixed: pointer-only conversation selection, missing modal focus management, synchronous full-history sidebar search, and unbounded Media Studio load/render behavior.
- Documentation was corrected for the regression-guard count, Status terminology, Jina capabilities, response handling, Adult Mode wording, config safety template fields, and one dead local link.
- The required install, lint, renderer/electron typechecks, full test suite, safety guard, and production build all passed.

## Verified Prior Fixes

- Canonical tab routing is centralized in `src/config/tabs.ts`; `gallery` remains a legacy alias and is not a canonical top-level tab.
- Hosted character chat payloads use the conversation-scoped slug in `src/hooks/use-chat.ts` (`resolveCharacterSlug`, `veniceParamsForRequest.character_slug`). `src/hooks/use-chat.test.ts` covers normal chat, changed global selection, regenerate, and coexistence with search/citation parameters.
- Chat persistence uses the module-level dirty map and unload flushing in `src/stores/chat-store.ts`; prior guards `VERIFY-005` and `VERIFY-021` remain present and passing.
- `window.__veniceMediaDev` remains production-gated and covered by `VERIFY-023`.
- Electron Jina and generic scrape returned bodies are screened before renderer delivery in `electron/ipc/handlers.ts` (`jina:request`, `app:proxyScrape`). Web Jina and scrape routes perform equivalent response screening in `server.ts` (`/api/proxy-jina`, `/api/proxy-scrape`).
- Desktop config payloads expose only key-presence booleans. Raw key reads remain confined to Electron main-process secure storage.
- Adult Mode only skips the local family-rule engine. Venice API Safe Mode remains independently hydrated and applied.
- Desktop `chat-history/*.json` storage is documented as plaintext; no audited document claims Venice Forge encrypts those files.

## Confirmed New Findings

### P1 - Security - Fixed

**Path:** `electron/services/configService.ts`  
**Symbol:** `importKeys()` / `redactKeysInYaml()`  
**Inspected context:** Secure-store import at lines 362-400; prior fire-and-forget YAML rewrite in the redaction block; status publication after `importKeys()`.

**Issue:** The prior implementation launched `fs.writeFile()` with `void` and immediately reported `keysRedacted: true`. Initialization could complete while plaintext keys remained on disk. A write failure was logged asynchronously but did not invalidate the reported redaction state. The regex replacement could also remove YAML indentation and produce malformed structure.

**Minimal safe fix applied:** `importKeys()` is async; redaction mutates a parsed YAML document; the rewrite uses an awaited `0600` temp file plus atomic rename; failed writes remove the temp file and surface an initialization error rather than reporting successful redaction.

**Regression:** `VERIFY-024` in `electron/services/configService.test.ts` covers completed redaction, failed rename, preserved original YAML, false redaction status, and temp cleanup.

**Validation:** `npx vitest run electron/services/configService.test.ts --fileParallelism=false`

### P1 - Bug - Fixed

**Path:** `src/stores/rp-chat-store.ts`  
**Symbol:** `RpChatState.createChat()`  
**Inspected context:** Lines 112-140; `src/components/rp-studio/RpChatList.tsx` `NewChatDialog.onCreate` call site.

**Issue:** `createChat()` inserted a new chat into Zustand, called `void svcSave(chat)`, and immediately opened it. `saveRpChat()` can reject during Electron config hydration, Family Safe Mode blocking, validation, or storage failure. Rejection therefore produced an unhandled promise and a visible chat that was never persisted.

**Minimal safe fix applied:** `createChat()` now awaits `svcSave()`, publishes/activates only the persisted record, returns `null` on failure, and surfaces a toast. The dialog remains open unless creation succeeds.

**Regression:** `VERIFY-025` in `src/stores/rp-chat-store.test.ts` covers persistence-before-publication and rejected-save behavior.

**Validation:** `npx vitest run src/stores/rp-chat-store.test.ts --fileParallelism=false`

### P2 - Accessibility - Fixed

**Path:** `src/components/layout/sidebar.tsx`  
**Component:** `ConversationRow`  
**Inspected context:** Lines 394-442.

**Issue:** Conversation selection was attached to a non-focusable `<div>`. Export and delete were keyboard accessible, but opening a conversation was not.

**Minimal safe fix applied:** Selection is now a native button with visible focus styling and `aria-current` for the active conversation. Export/delete remain separate sibling buttons.

**Regression:** `src/components/layout/sidebar.test.tsx` asserts the named conversation button changes `activeConversationId`.

**Validation:** `npx vitest run src/components/layout/sidebar.test.tsx --fileParallelism=false`

### P2 - Accessibility - Fixed

**Paths:** `src/components/gallery/media-detail-dialog.tsx`, `src/components/rp-studio/RpChatList.tsx`, `src/components/rp-studio/PromptDebugDrawer.tsx`  
**Components:** `MediaDetailDialog`, `NewChatDialog`, `PromptDebugDrawer`  
**Inspected context:** Each surface declares `role="dialog"` and `aria-modal="true"`; the prior implementations did not use `useFocusTrap`, initial focus, or focus restoration.

**Issue:** Keyboard focus could remain behind these modal surfaces or escape into background controls. Closing could also lose the triggering element.

**Minimal safe fix applied:** `useFocusTrap()` now supports an explicit initial target and restores the previously focused element. Media Detail focuses Close, New RP Chat focuses Title, Prompt Debug focuses its first control, and all three close on Escape while trapping Tab navigation.

**Regression:** `VERIFY-026` in `src/hooks/useFocusTrap.test.tsx`, plus component tests in `src/components/gallery/media-detail-dialog.test.tsx`, `src/components/rp-studio/RpChatList.test.tsx`, and `src/components/rp-studio/PromptDebugDrawer.test.tsx`.

### P2 - Performance - Fixed

**Path:** `src/components/layout/sidebar.tsx`  
**Symbols:** `buildConversationSearchText()`, `searchIndex`, `searchResult`  
**Inspected context:** The prior `filtered` memo lowercased every message and reasoning body for each query change.

**Issue:** Every search keystroke lowercased and scanned every conversation title, every message body, and every reasoning body synchronously. `useMemo` avoided unrelated rerenders but did not defer query-triggered work.

**Minimal safe fix applied:** Conversation text is normalized once when conversations change, query evaluation uses `useDeferredValue()`, and rendered matches are capped at 200 with a visible result-count notice when truncated.

**Regression:** `VERIFY-027` in `src/components/layout/sidebar.test.tsx` covers message/reasoning matching through the indexed path.

### P2 - Performance - Fixed

**Paths:** `src/services/storageService.ts`, `src/stores/media-store.ts`, `src/components/gallery/gallery-view.tsx`  
**Symbols:** `StorageService.getItemsPageWithMeta()`, `useMediaStore.refresh()` / `loadMore()`, `MediaStudioView` grid  
**Inspected context:** The prior path used IndexedDB `getAll()` and `Promise.all()` decryption, then mapped the complete filtered result into cards.

**Issue:** Media Studio had no pagination, cursor read, windowing, or virtualization. Startup cost, decryption memory, search/sort cost, and DOM size grew linearly with the complete generated-media library.

**Minimal safe fix applied:** IndexedDB schema v6 adds an `images.timestamp` index. The storage service reads descending cursor pages capped at 200, the media store hydrates 60 records at a time with total/has-more/offset state, the UI exposes explicit Load More controls and loaded counts, and off-screen cards use CSS `content-visibility`. Docs state that search, filtering, lineage, and batch actions apply to loaded records.

**Regression:** `VERIFY-028` in `src/services/storageService.test.ts` and `src/stores/media-store.test.ts` covers encrypted cursor ordering, page envelopes, and incremental append behavior. A 1,000-record browser profile remains a P3 validation item.

### P3 - Docs - Fixed

**Paths/sections:** `README.md` Security audit, Troubleshooting, Project Status; `AGENTS.md` guard table and key files; `docs/RESEARCH_PROVIDERS.md` provider table/security notes; `docs/CHARACTER_RP.md` feature table; `docs/CONFIG.md` security model; `.config/config.example.yaml`; `docs/REPOSITORY_TREE.md`; `.github/copilot-instructions.md` Image Workflow.

**Issue:** Confirmed drift included 13 versus 23 named guards, stale Diagnostics labels, Jina social discovery marked supported despite `supports.socialDiscovery: false`, a claim that Jina used the Generic HTTP HTML stripper, unconditional safety-guard wording despite Adult Mode, missing safety fields in the example config, a dead relative Media Studio link, and pre-registry Gallery agent instructions.

**Minimal safe fix applied:** Corrected each statement against inspected code and expanded the guard registry to `VERIFY-001..VERIFY-029` after adding six behavior/documentation guards.

**Validation:** Scoped local Markdown link checker reports all links resolved; stale-term searches are clean except historical snapshots in `docs/AUDIT_FOLLOWUP_2026_06_05.md`.

### P3 - Documentation Regression - Fixed

**Paths:** `scripts/verify-markdown-links.cjs`, `.github/workflows/ci.yml`, `package.json`  
**Symbol/section:** `verifyMarkdownLinks()` / CI `build-and-test` documentation gate.

**Issue:** The audit's scoped link check was ad hoc, so stale relative files or heading fragments could return without failing CI.

**Minimal safe fix applied:** Added `npm run verify:markdown-links`, scanning 49 repository Markdown files for local file targets, GitHub-style heading fragments, reference links, and HTML links. External URLs and root-relative GitHub routes are intentionally not fetched. The command emits GitHub Actions annotations and runs in the Node 20/22 CI matrix.

**Regression:** `VERIFY-029` in `scripts/verify-markdown-links.test.ts`. The rollout also corrected nine stale file/fragment links in `README.md`, `SECURITY.md`, `docs/HQE_AUDIT_REPORT.md`, `docs/SUPPORT.md`, and `docs/TODO.md`.

## Not Confirmed / No Action

- **Hosted character slug loss:** Not confirmed. `useChat()` resolves the persisted conversation character slug for send and regenerate, with direct tests.
- **Unsafe character metadata:** Not confirmed. The persisted metadata is normalized character identity data; prompt bodies are not stored in `metadata.character`.
- **RP append bypass:** Not confirmed. `appendMessage()` validates the message, uses the hydration-gated local toggle, evaluates `assessRpContext`, and writes only after allowance.
- **Scene asset wrong-chat linkage:** Not confirmed. `generateScene()` writes `chatId: chat.id` and optional `messageId`; `VERIFY-013` covers chat filtering/linkage.
- **Electron/web Jina response-screening mismatch:** Not confirmed. Both paths screen returned bodies when Family Safe Mode is enabled and skip local rules in Adult Mode.
- **Raw desktop key exposure to renderer:** Not confirmed. Preload exposes set/delete/test/configured operations, not getters; sanitized config returns booleans.
- **Adult Mode disabling Venice API Safe Mode:** Not confirmed in code or current scoped docs.
- **Canonical top-level Catalog/Batch/Diagnostics tabs:** Not confirmed. Catalog and Batch remain Config sub-views; the canonical user-facing label is Status.
- **Dead links:** No remaining scoped local Markdown links after the initial documentation pass and the `VERIFY-029` CI rollout.
- **Historical audit counts:** `docs/AUDIT_FOLLOWUP_2026_06_05.md` contains dated intermediate snapshots such as 774 tests and `VERIFY-001..010`. These are retained as historical evidence, not current-state claims.

## Prioritized TODO

### P0 - Must Fix Before Release

- None confirmed.

### P1 - Should Fix Before Release

- None remaining from this pass. Config redaction and RP creation persistence were fixed and covered by `VERIFY-024` / `VERIFY-025`.

### P2 - Next Hardening Pass

- None remaining from the confirmed P2 findings in this pass.

### P3 - Polish / Backlog

- Add rendered desktop/mobile accessibility smoke coverage once the in-app Browser instance is available.

### P3 - Performance Profiling - Fixed

**Path:** `scripts/profile-media-studio.mjs`  
**Symbol:** standalone Playwright Electron profile harness.

**Issue:** Pagination contracts were covered, but the audit had no rendered Electron evidence for a 1,000-record encrypted Media Studio library.

**Minimal safe fix applied:** Added opt-in `npm run profile:media-studio`. It uses an isolated user-data directory, seeds 1,000 AES-GCM encrypted records, verifies 60 initial cards and 120 after load-more, records timing/heap/DOM metrics, rejects relevant renderer warnings/errors, and stores screenshots outside the repository.

**Validation:** Two June 6, 2026 development-build runs measured 381.5–444.0 ms initial hydration and 243.9–326.9 ms load-more. Used JS heap ranged from 35.3–41.6 MB at 60 cards and 42.4–50.8 MB at 120 cards. DOM nodes increased from 1,577 to 2,957. No relevant console issues were emitted. Timing values are recorded baselines, not CI thresholds.

## Validation Results

| Command | Result |
|---|---|
| `npm install` | Passed; up to date, 801 packages audited, 0 vulnerabilities |
| `npm run lint:eslint` | Passed; zero warnings/errors |
| `npx tsc --noEmit -p tsconfig.json` | Passed |
| `npx tsc --noEmit -p tsconfig.electron.json` | Passed |
| `npm test` | Passed; 122 test files passed, 1 skipped; 1,202 tests passed, 1 skipped |
| `npm run verify:safety-guard` | Passed; renderer, Electron IPC, web proxy, and no-raw-log checks passed |
| `npm run build` | Passed; Vite renderer, esbuild server, and Electron TypeScript/CJS package built |
| `npm run verify:markdown-links` | Passed; 49 Markdown files checked |
| `npm run smoke:electron` | Skipped by design; `RUN_ELECTRON_SMOKE=true` and packaged release artifacts were not present |
| `npm run profile:media-studio` | Passed; 1,000 encrypted records, 60 initial cards, 120 after load-more, no relevant console issues |
| In-app Browser smoke test | Not run: Browser plugin was present but no `iab` browser instance was available |

The Vitest run emitted the repository's existing jsdom notice that `HTMLCanvasElement.getContext()` is not implemented without the optional canvas package; the suite still completed successfully.
