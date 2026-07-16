# ST Card Studio

## Status and scope

ST Card Studio is the Venice Forge workflow for creating and editing SillyTavern-compatible Character Card V2 files. The implementation includes bounded main-owned JSON/PNG import/export, explicit keep/copy/replace/merge collision handling with undo, a ten-step editor navigator, encrypted draft-only creation and recovery, an embedded-book editor with linked-lorebook synchronization, deterministic prompt semantics, disposable test turns, capability-filtered image/text generation, typed selective refinement proposals, durable media handoffs, and conflict-copy-preserving sync merges.

Discovery baseline: `main` at `285ed6d510916e7b39ef84f8f319b4681db87f4b` on 2026-07-15. The worktree already contained an incomplete ST-card implementation when this design was written; unsafe renderer-supplied PNG paths and raw-IPC helpers were removed rather than treated as completed work.

## Architecture decisions

### Internal compatibility fields

The first integration uses additive, top-level optional fields on `CharacterCardV1`: `personality`, `creatorNotes`, `postHistoryInstructions`, `alternateGreetings`, `characterVersion`, `tavernExtensions`, `embeddedCharacterBook`, `rawExampleDialogue`, and `sourceFormat`.

This keeps existing character, storage, backup, sync, RP Studio, Character Hub, and hosted-character code on one database and avoids a second nested compatibility object that every current consumer would need to unwrap. External V1/V2 DTOs remain separate in `src/types/character-card-spec.ts`; persisted cards never use the external V2 envelope as their native schema.

### Lossless fields

V2 `description` and `personality` remain distinct. Alternate greetings do not become example dialogues. Raw `mes_example` formatting is retained separately from the parsed example representation. Creator notes are display-only compatibility data and are never authorized for prompt compilation. Unknown JSON values under V2 extension objects are preserved after bounded JSON sanitization. Required external strings export as strings, including empty strings.

### Embedded and linked books

`embeddedCharacterBook` is the lossless imported/exported V2 representation. A linked Venice Forge `LorebookV1` remains a separate owned record, with linkage stored only in internal metadata. Users explicitly attach, import, synchronize, or detach it; detach preserves the embedded export copy. No local lorebook ID enters standard V2 exports. Divergent sync revisions preserve a complete conflict copy and merge only independently identifiable collection data.

### PNG dependency and trust boundary

The initial strategy is an independently implemented Node/Electron codec with no renderer PNG parsing dependency. It must validate chunk bounds, relevant CRCs, dimensions, metadata size, terminal `IEND`, Base64, UTF-8, JSON, and export round trips. File selection and saving must be Electron-main-owned through dialogs and opaque, expiring, single-use import handles. Renderer-supplied paths, raw IPC access, renderer canvas conversion, and browser download anchors are not accepted for desktop PNG export.

PNG import is enabled only through `characterCards:chooseImportFile` and `characterCards:applyImport`: a sender-scoped five-minute opaque handle is consumed once after main-authoritative safety and collision checks. The codec verifies every chunk CRC, bounds, dimensions, terminal `IEND`, strict Base64/UTF-8/JSON and semantic export round trips. JSON and PNG export use main-owned save dialogs and atomic writes. Character Card V3, compressed metadata, embedded V3 assets, and bulk archives remain explicitly unsupported.

### Prompt semantics

Creator notes never enter prompts. Card/global system precedence is explicit, `{{original}}` expands once, post-history instructions are emitted after history, greeting choices persist exactly once, and embedded books adapt into the existing `LorebookV1` matcher. The editor exposes a redacted prompt-order trace and disposable, non-mutating model turn.

## Existing integration inventory

- Import/export dispatch: `src/services/characterCardImportExport.ts`; the Zustand store delegates to this service.
- External DTO and adapter boundary: `src/types/character-card-spec.ts` and `src/services/characterCards/characterCardAdapter.ts`.
- Persistence normalization: `src/services/rp/characterCardService.ts`, `electron/services/characterCardStorage.ts`, and the existing encrypted IndexedDB `character_cards` store.
- Desktop IPC/preload: `electron/ipc/rpHandlers.ts`, `electron/preload.ts`, `src/services/desktopBridge.ts`, and `src/types/desktop.ts`.
- Character UI: `src/components/CharactersView.tsx`, `src/components/rp-studio/CharacterLibrary.tsx`, and `src/components/rp-studio/CharacterEditor.tsx`.
- Avatar paths: `CharacterCardAvatar`, character-card storage sidecars, `CharacterAvatar`, `useCharacterImage`, and the existing character image cache.
- Lorebook matching: `src/services/rp/promptBuilderService.ts`, `src/services/rp/lorebookService.ts`, and `src/services/rp/lorebookRendererService.ts`.
- Prompt ordering: `src/services/rpPromptCompiler.ts` and `src/services/rp/promptBuilderService.ts`.
- Model capabilities: `src/config/image-model-capabilities.ts` and the existing Venice model metadata services.
- Safety: `src/shared/safety/characterImportSafety.ts` and the existing persistence guard.

## Phase gates

1. Phase 1: V1/V2 JSON import, bounded runtime validation, persistence normalization, version snapshots, and semantic V2 round-trip fixtures.
2. Phase 2: main-process PNG codec, dialog/opaque-handle IPC, preview, output verification, and hostile fixtures.
3. Phase 3: standards-aware manual editor, collision-safe import preview, drafts, and accessible export UI.
4. Phase 4: deterministic prompt and lorebook semantics with provider request-shape tests.
5. Phase 5/6: live-capability-driven image/text draft generation, cancellation, strict schemas, per-field proposals, typed refinement diffs, selective apply, and version snapshots.
6. Phase 7: encrypted backup opt-in for drafts, sync conflict copies and collection merges, synthetic fixtures, documentation, build/packaging validation, and manual signed/authenticated QA tracked separately.

No later phase is complete merely because its fields exist in storage.
