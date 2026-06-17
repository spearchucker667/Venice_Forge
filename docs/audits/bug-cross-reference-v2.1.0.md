# Bug Cross-Reference — v2.1.0 Release

> Consolidated mapping of release-blocking bugs fixed for Venice Forge `v2.1.0`,
> the source files changed, and the regression tests that protect them.
> For the full project-wide regression-guard table see `AGENTS.md` § *Named regression guards (VERIFY-NNN)*.

## Legend

| Column | Meaning |
|--------|---------|
| ID | Bug identifier used in session notes / audit reports. |
| Severity | P0 = release blocker, P1 = high-risk, P2 = moderate, P3 = hygiene. |
| Surface | Component, store, or IPC area affected. |
| Fix files | Primary files changed to resolve the bug. |
| Regression test | Test file / guard that would fail if the bug regressed. |
| Status | Closed / open / residual. |

## Release-blocking bug cross-reference

| ID | Severity | Surface | Bug summary | Fix files | Regression test | Status |
|----|----------|---------|-------------|-----------|-----------------|--------|
| P0-001 | P0 | Release workflow | Legacy web-client safety-guard bypass in `veniceStreamChat` allowed unsafe requests in web mode. | `src/services/veniceClient.ts` | `src/lib/venice-client.web-guard.test.ts` | Closed |
| P0-002 | P0 | Release workflow | Missing workflow tab route (`workflows` did not mount `WorkflowTemplatesView`). | `src/App.tsx` or tab registry | `APP-001` regression test | Closed |
| SP-002 | P1 | Safety inspector | `veniceStreamChat` inspector status misreported as 500 on certain failures. | `src/services/veniceClient.ts` | `SP-001` / `src/lib/venice-client.web-guard.test.ts` | Closed |
| STO-001 | P1 | Chat store | `deleteConversations` surfaced raw error text (possible secret/path leak). | `src/stores/chat-store.ts` | `src/stores/chat-store.test.ts` dirty/delete tests | Closed |
| STO-002 / STO-003 | P1 | Character / scenario stores | `console.error` used directly instead of shared logger, bypassing redaction. | `src/stores/character-store.ts`, `src/stores/scenario-store.ts` | Store-specific error redaction tests | Closed |
| CM-001 | P1 | Chat memory | `memoryRetrievalDisabled` was not reset when character was cleared. | `src/components/chat/chat-view.tsx`, `src/hooks/use-chat.ts` | `src/hooks/use-chat.test.ts` | Closed |
| CM-002 | P1 | Chat streaming | Scene-generation error polluted the assistant response stream. | `src/components/chat/chat-view.tsx`, `src/hooks/use-chat.ts` | `src/hooks/use-chat.test.ts` | Closed |
| CM-003 | P1 | Chat persistence | Dirty-map persistence failures were silently dropped. | `src/stores/chat-store.ts`, `src/stores/chat-store.dirty.test.ts` | `VERIFY-021` dirty-map tests | Closed |
| SC-01 | P1 | Scene composer | Scene write path lacked sanitization before persistence. | `src/stores/scene-composer-store.ts` | `src/stores/scene-composer-store.test.ts` | Closed |
| SC-02 | P1 | Scene composer | Prompt Library references were not resolved before scene save/compile. | `src/components/scenes/SceneComposerView.tsx`, `src/services/sceneCompiler.ts` | Scene composer tests | Closed |
| SC-03 | P1 | Scene compiler | `sceneCompiler` did not redact secrets when generating recipes. | `src/services/sceneCompiler.ts` | `src/services/sceneCompiler.test.ts` | Closed |
| SP-01 / SP-02 | P1 | Storage / privacy dashboard | Inventory shape mismatched `Conversation[]` → `StorageInventoryRecord[]`; RP Studio stores were not loaded before inventory read. | `src/services/storagePrivacyService.ts`, `src/stores/storage-privacy-store.ts` | `src/components/privacy/StoragePrivacyDashboard.test.tsx`, `src/stores/storage-privacy-store.test.ts` | Closed |
| RP-01 | P1 | RP chat | Non-standard RP chat roles were not normalized, breaking rendering/safety. | `src/stores/rp-chat-store.ts` | `src/stores/rp-chat-store.test.ts` | Closed |
| APP-001 | P1 | App routing | Global shortcuts fired while typing in input fields. | `src/App.tsx` (shortcut handler) | `APP-001` regression test | Closed |
| PROMPT-001 | P1 | Prompt Library | New prompts were seeded with values that sanitization stripped, so they failed to persist. | `src/stores/prompt-library-store.ts` | `src/stores/prompt-library-store.test.ts` | Closed |
| AUDIT-IMG-001 | P1 | Media Inspector | **Export recipe** button was a no-op. | `src/components/gallery/gallery-view.tsx`, `src/components/gallery/media-inspector.tsx` | `src/components/gallery/media-inspector.test.tsx` | Closed |

## Additional regression guards added this release

| Guard | What it protects | Test file |
|-------|------------------|-----------|
| `SP-001` | `veniceStreamChat` inspector status accuracy | `src/lib/venice-client.web-guard.test.ts` |
| `BUG-E1` | Web-mode safety guard fail-closed behavior | `src/lib/venice-client.web-guard.test.ts` |
| `RP-01` | RP chat role normalization | `src/stores/rp-chat-store.test.ts` |
| `APP-001` | Global shortcuts ignore typing contexts | `src/App.test.tsx` / shortcut tests |
| `PROMPT-001` | Prompt Library seed survives sanitization | `src/stores/prompt-library-store.test.ts` |
| `AUDIT-IMG-001` | Media Inspector export recipe produces a download | `src/components/gallery/media-inspector.test.tsx` |

## Residual / follow-up findings (not closed)

These items were triaged out of the release-blocking pass and remain on the roadmap.

| ID | Severity | Surface | Notes |
|----|----------|---------|-------|
| RCW-003 | P2 | CI / npm audit | Align `--omit=dev` usage between `package.json` and workflow files. |
| RCW-004 | P3 | `tsconfig.electron.json` | Normalize line endings per `.gitattributes`. |
| RCW-005 | P3 | `package.json` | Remove redundant `npm test` from `ci` script. |
| RCW-006 | P3 | `AGENTS.md` | Expand state-store summary. |
| REL-005 | P3 | Packaging | Replace placeholder Linux maintainer email in `electron-builder.config.cjs`. |
| REL-006 | P3 | Docs | Fix numbered-list typo in `docs/DEVELOPMENT/CONFIG.md:198`. |
| SP-003..SP-008 | P2/P3 | Storage privacy dashboard | Maintenance actions, spinner contrast, error/retry state, typed casts, tab routing. |
| IMG-002..IMG-011 | P2/P3 | Image / gallery / embeddings | Clipboard fallback, semantic tokens, `crypto` seed, plain request bodies, typed `MediaItem`, download extension, error messages, command-handler stability. |

## References

- `docs/summary_of_work.md` — session ledger with validation matrix.
- `AGENTS.md` — canonical regression-guard table (`VERIFY-001`..`VERIFY-052`).
- `docs/audits/repository-todo-roadmap-current.md` — remaining open items.
