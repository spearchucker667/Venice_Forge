# Venice Forge Cross-Reference + Full Repo Audit TODO

> **Status: HISTORICAL (2026-06-07 cross-reference audit snapshot).** All findings in this document were marked **VERIFIED FIXED** in the source of the time.  
> **Canonical AI/dev-agent handoff ledger:** `docs/summary_of_work.md` (read before every session; updated at end of every session per AGENTS.md).  
> **Current audit posture and remaining items:** See *Open TODO Ledger* and *Hygiene follow-ups* in `docs/summary_of_work.md`.  
> This file is retained for provenance only; do not treat its "Open Questions" or TODO IDs as actionable without cross-checking the ledger.

> Generated: 2026-06-07
> Commit: d41a4d0a
> Source: current working tree
> Validation: Node 22 dependency install, typecheck, lint, 1,369-test suite, build, dist, Markdown, config, safety, icons, 47 focused action tests, and 83 focused theme/config tests passed; Electron smoke was environment-skipped and browser visual smoke was unavailable.

## Audit Metadata

- Commit: `d41a4d0a`
- Branch: `main`
- Node: `v22.22.3`
- npm: `10.9.8`
- OS: macOS Darwin 25.5.0 arm64
- Dependency install: `npm ci` passed under the supported Node 22 toolchain; 800 packages installed, 0 vulnerabilities reported.
- Commands run: `npm ci`, `npm run typecheck`, `npm run lint:eslint`, `npm test`, focused 47-test action suite, focused 83-test theme/config suite, CSP/inline-color invariants, `npm run build`, `npm run verify:dist`, `npm run verify:markdown-links`, `npm run config:validate`, `npm run verify:safety-guard`, `npm run verify:icon`, and `npm run smoke:electron`.
- Commands failed: None. `npm run smoke:electron` completed with its single test skipped by the environment display gate; browser visual smoke was blocked because the in-app browser surface was unavailable.
- Files scanned: repository root configuration, `.github/workflows`, `.config`, `electron`, `src`, `tests`, `scripts`, and primary support docs, using the required cross-reference and high-risk `rg` searches plus focused source reads.
- Files not scanned: generated/dependency trees (`node_modules`, `dist`, `dist-electron`, `release`, `coverage`) and the vendored `docs/Venice_swagger_api.yaml` beyond targeted searches.

## Cross-Reference Summary

| Area | Expected | Actual | Status | TODO IDs |
|---|---|---|---|---|
| Production startup/CSP | In-place `loadFile`, no temp/nonce path, hardened webPreferences | Invariant and `VERIFY-036` present | VERIFIED FIXED | — |
| Tab transitions | 120-180ms opacity/transform and reduced-motion support | 150ms section animation and global reduced-motion rule present | VERIFIED FIXED | — |
| Durable keys | OS secure storage, configured booleans, wipe both keys | Secure-store/configured-state paths and reset-both test present | VERIFIED FIXED | — |
| Forge Dracula | Complete semantic token contract and contrast coverage | 29 canonical roles, legacy normalization, full CSS/YAML boundaries, and WCAG AA pair coverage are present | VERIFIED FIXED | UI-001 |
| Windows CI media service | Cross-platform fixtures, allowlist retained, Windows lane | Targeted suite passed 26/26 locally; Windows blocking lane exists | VERIFIED FIXED | — |
| Character photos | Alias normalization, Venice HTTPS allowlist, fallback/reset | Resolver and tests cover the required trust policy | VERIFIED FIXED | — |
| Image sizing | Exactly one sizing mode; no stale fields; quality/capabilities honored | Shared builder receives model-aware aspect/resolution/quality/variant inputs; `VERIFY-040` covers aspect-resolution payloads | VERIFIED FIXED | XREF-004, API-001 |
| Seed support | Full signed range, omission when off, metadata/actions | Range, serializer, persistence, copy, and reuse paths exist | VERIFIED FIXED | — |
| Gallery actions | Production actions execute and persist derivative lineage | Transient typed handoff drives Generate/Tools; derivatives update both lineage directions | VERIFIED FIXED | XREF-001, XREF-002, XREF-003, BUG-001, TEST-001 |
| Prompt enhancer | Config-driven internal completion with review and safety authority | Service/config paths exist and are tested | VERIFIED FIXED | — |
| Config generation | Example/default/sanitized writes preserve enhancer config | Block, merge, clamp, export, and tests present | VERIFIED FIXED | — |
| Stale image form | Delete or modernize unused parallel form | `ImageGenerationForm.tsx` is absent and no importer remains | VERIFIED FIXED | — |
| CI coverage | Full Linux coverage plus blocking Windows-sensitive lane | Both jobs exist without `continue-on-error` | VERIFIED FIXED | — |

## Critical Findings

None.

## High Findings

### [HIGH] XREF-001 — Replace the development-only Media Studio action bridge

**Status:** VERIFIED FIXED  
**Category:** UI  
**File(s):**
- `src/stores/image-workspace-store.ts:19-65`
- `src/components/gallery/gallery-view.tsx:246-319`
- `src/components/image/image-view.tsx:376-397`

**Expected Behavior:** Media Studio actions work in packaged production builds through normal React/store/service state, without relying on a development global.

**Actual Behavior:** Media Studio enqueues a typed transient request, switches tabs, and the destination consumes the request exactly once. No production image-workspace window global is used.

**Evidence:**
```ts
export const useImageWorkspaceStore = create<ImageWorkspaceState>((set) => ({
  pending: null,
  enqueueGenerate: (input) => {
    const id = handoffId()
    set({ pending: { ...input, id, target: 'generate' } })
    return id
  },
  consume: (id) => set((state) => state.pending?.id === id ? { pending: null } : state),
}))
```

**Impact:** The shipped application now has a production-safe handoff for Use settings, regeneration, remix generation, Upscale, and Edit.

**Required Fix:** None. Preserve the transient non-persisted store contract and one-time consumption semantics.

**Acceptance Test:**
```bash
npx vitest run src/components/gallery/gallery-view.test.tsx src/components/image/image-view.test.tsx
npm run build
npm run smoke:electron
```
Manual: launch a production build and verify Use settings and Regenerate from Media Studio apply the stored prompt/model parameters.

### [HIGH] XREF-002 — Persist regenerate derivatives and bidirectional lineage

**Status:** VERIFIED FIXED  
**Category:** Persistence  
**File(s):**
- `src/stores/media-store.ts:150-169`
- `src/components/image/image-view.tsx:318-365`

**Expected Behavior:** Regenerate creates a new item with `operation: "regenerate"`, `parentId` set to the source item, and the parent's `childrenIds` updated consistently.

**Actual Behavior:** Regeneration carries `parentId` and `operation`; `upsertDerivative` writes the child, deduplicates the parent's `childrenIds`, and removes the child if the parent patch fails.

**Evidence:**
```ts
const saved = await StorageService.putMedia<MediaItem>(migrated)
const childrenIds = Array.from(new Set([...parent.childrenIds, saved.id]))
try {
  const updatedParent = await StorageService.patchMedia<MediaItem>(parentId, { childrenIds })
  // update in-memory child and parent
} catch (err) {
  await StorageService.deleteMedia(saved.id).catch(() => false)
  throw err
}
```

**Impact:** Regenerated and image-tool derivatives retain provenance without leaving one-sided records after a failed parent update.

**Required Fix:** None. Keep derivative writes routed through `upsertDerivative`.

**Acceptance Test:**
```bash
npx vitest run src/stores/media-store.test.ts src/components/image/image-view.test.tsx src/components/gallery/gallery-view.test.tsx
```
Assert the child is `regenerate`, points to the parent, and the parent contains the child exactly once.

### [HIGH] XREF-003 — Wire Upscale/Edit to the selected Media Studio item

**Status:** VERIFIED FIXED  
**Category:** UI  
**File(s):**
- `src/components/gallery/gallery-view.tsx:294-319`
- `src/components/image/image-tools.tsx:58-67`
- `src/components/image/image-tools.tsx:107-136`

**Expected Behavior:** Upscale/Edit opens the existing image-tools flow with the selected image loaded and persists the result as a derivative with the correct operation and parent lineage.

**Actual Behavior:** Upscale and Edit enqueue the selected source, operation, prompt, filename, and parent ID. Image Tools consumes the handoff and persists the result through derivative lineage.

**Evidence:**
```ts
useImageWorkspaceStore.getState().enqueueTools({
  tool: "upscale",
  parentId: item.id,
  image: item.image,
  prompt: item.prompt,
  filename: `${item.id}.png`,
});
```

**Impact:** Both actions now open with the selected source and produce correctly typed derivatives.

**Required Fix:** None. Preserve source-replacement behavior that clears inherited lineage for manual uploads.

**Acceptance Test:**
```bash
npx vitest run src/components/gallery/gallery-view.test.tsx src/components/image/image-tools.test.tsx src/stores/media-store.test.ts
```

### [HIGH] XREF-004 — Treat aspect-resolution models as aspect-based in Image Studio

**Status:** VERIFIED FIXED  
**Category:** API  
**File(s):**
- `src/components/image/image-view.tsx:65-79`
- `src/components/image/image-view.tsx:259-290`
- `src/components/image/image-view.test.tsx:49-67`

**Expected Behavior:** `aspectResolution` models send only `aspect_ratio` plus `resolution` and expose those controls.

**Actual Behavior:** Both aspect modes use aspect controls. Resolution is passed only for `aspectResolution`, and the shared builder prevents width/height leakage.

**Evidence:**
```ts
const hasAspectRatios = (dimOptions.dimensionMode === "aspectRatio" || dimOptions.dimensionMode === "aspectResolution") && !!dimOptions.aspectRatios?.length
// ...
resolution: dimOptions.dimensionMode === 'aspectResolution' ? resolution || undefined : undefined,
```

**Impact:** Aspect-resolution models now emit the Venice request shape represented by their capabilities.

**Required Fix:** None. Keep `VERIFY-040` as the regression guard.

**Acceptance Test:**
```bash
npx vitest run src/config/image-model-capabilities.test.ts src/utils/payloadBuilders.test.ts src/components/image/image-view.test.tsx
```
Assert an aspect-resolution model emits `aspect_ratio` + `resolution` and no `width`/`height`.

## Medium Findings

### [MEDIUM] BUG-001 — Remix and Generate uses the original item prompt

**Status:** VERIFIED FIXED  
**Category:** Bug  
**File(s):**
- `src/components/gallery/media-inspector.tsx:200-210`
- `src/components/gallery/gallery-view.tsx:283-290`

**Expected Behavior:** `Remix & Generate` generates the reviewed remixed prompt in one explicit handoff.

**Actual Behavior:** The inspector issues one regenerate callback containing the reviewed prompt override.

**Evidence:**
```ts
if (onRegenerate) onRegenerate(item, {
  sameSeed: false,
  promptOverride: enhanceState.result,
});
```

**Impact:** Remix generation no longer races a populate handoff against generation.

**Required Fix:** None. Preserve the single-callback contract.

**Acceptance Test:**
```bash
npx vitest run src/components/gallery/media-inspector.test.tsx src/components/gallery/gallery-view.test.tsx
```

### [MEDIUM] API-001 — Use model capabilities for quality and variants

**Status:** VERIFIED FIXED  
**Category:** API  
**File(s):**
- `src/components/image/image-view.tsx:79-79`
- `src/components/image/image-view.tsx:274-290`
- `src/components/image/image-view.tsx:501-508`
- `src/utils/payloadBuilders.ts:336-353`

**Expected Behavior:** Quality appears only for supporting models; variants are emitted only when supported and are serialized by the shared builder.

**Actual Behavior:** Quality state is model-derived and conditionally rendered. Quality and variant support are passed to the shared payload builder; the view no longer mutates those request fields manually.

**Evidence:**
```ts
quality: dimOptions.qualities?.length ? quality || undefined : undefined,
imageCount: variants,
supportsVariants: caps.supportsVariants,
```

**Impact:** Models receive only supported quality/variant fields, with the existing maximum-four clamp enforced centrally.

**Required Fix:** None. Keep payload policy centralized in `buildImagePayload`.

**Acceptance Test:**
```bash
npx vitest run src/utils/payloadBuilders.test.ts src/components/image/image-view.test.tsx
```

### [MEDIUM] UI-001 — Complete the semantic theme token contract

**Status:** VERIFIED FIXED  
**Category:** UI  
**File(s):**
- `src/theme/themeTypes.ts:23-85`
- `src/theme/themes.ts:86-114`
- `src/theme/applyTheme.ts:4-46`
- `src/theme/contrast.test.ts:52-123`
- `src/components/ThemeMaker.tsx:70-150`

**Expected Behavior:** Themes define distinct semantic roles for muted/elevated surfaces, strong borders, status foregrounds, inputs, placeholders, disabled text, primary/secondary buttons, links, focus, and selection.

**Actual Behavior:** `ThemeTokens` exposes all 29 canonical semantic roles while retaining legacy aliases. Runtime application, pre-React bootstrap, Tailwind variables, ThemeMaker editing/import/export, config snake_case normalization, global controls, and shared UI primitives consume the expanded contract.

**Evidence:**
```ts
export interface SemanticThemeTokens {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceMuted: string;
  foreground: string;
  foregroundMuted: string;
  foregroundSubtle: string;
  // status, input, button, link, focus, and selection roles follow
}
```

**Impact:** Forge Dracula and custom themes now provide testable, contrast-safe values for inputs, disabled controls, status foregrounds, buttons, links, focus, and selection without breaking legacy persisted themes.

**Required Fix:** None. Preserve `completeThemeTokens()` compatibility normalization and `VERIFY-041` coverage when adding theme roles or palettes.

**Acceptance Test:**
```bash
npx vitest run src/theme/contrast.test.ts src/theme src/config/configSchema.test.ts
npm run verify:markdown-links
```

## Low / Cosmetic Findings

None.

## Documentation Findings

### [DOC DEFECT] DOC-001 — Stop claiming broken production Media Studio actions are complete

**Status:** VERIFIED FIXED  
**Category:** Docs  
**File(s):**
- `README.md:60`
- `docs/MEDIA_STUDIO.md:179-199`

**Expected Behavior:** README feature claims match production behavior.

**Actual Behavior:** The feature claim now matches the production-safe transient handoff and derivative lineage documented in the Media Studio guide.

**Evidence:**
```md
Gallery actions enqueue a typed, transient request in
`useImageWorkspaceStore`.
```

**Impact:** User and maintainer documentation now describes the implemented production workflow.

**Required Fix:** None. Keep README and `docs/MEDIA_STUDIO.md` synchronized with action behavior.

**Acceptance Test:**
```bash
npm run verify:markdown-links
rg -n "Use settings|Regenerate|Upscale / Edit|Remix" README.md docs
```

## Test Gaps

### [TEST GAP] TEST-001 — Add production-mode integration guards for Media Studio actions

**Status:** VERIFIED FIXED  
**Category:** Test  
**File(s):**
- `src/components/gallery/gallery-view.test.tsx:97-178`
- `src/components/gallery/media-inspector.test.tsx:172-244`
- `src/components/image/image-view.test.tsx:49-93`
- `src/components/image/image-tools.test.tsx:155-180`

**Expected Behavior:** Tests prove the complete production action flow, payload handoff, generation prompt, operation, parent link, and parent child-list update.

**Actual Behavior:** Tests cover production transient handoffs for Use settings, regenerate, same-seed regenerate, reviewed remix, Upscale, and Edit; destination tests cover committed-state generation and derivative persistence.

**Evidence:**
```ts
expect(useImageWorkspaceStore.getState().pending).toMatchObject({
  target: 'generate',
  autoGenerate: true,
  parentId: 'image-1',
  operation: 'regenerate',
});
```

**Impact:** CI now fails if the production handoff, reviewed prompt, model payload, or derivative linkage regresses.

**Required Fix:** None. `VERIFY-040` names the sizing regression; the action-flow tests provide the integration coverage.

**Acceptance Test:**
```bash
npx vitest run src/components/gallery/gallery-view.test.tsx src/components/gallery/media-inspector.test.tsx src/components/image/image-view.test.tsx src/components/image/image-tools.test.tsx
```

## Build / Release Findings

None confirmed. The real Windows runner remains the authority for the targeted filesystem lane.

## Quick Wins

- [x] API-001 — quality, variants, and resolution route through the shared builder.
- [x] BUG-001 — Remix & Generate uses one typed callback.
- [x] DOC-001 — README and Media Studio documentation match production behavior.

## Required Validation After Fixes

```bash
npm ci
npm run typecheck
npm run lint:eslint
npm test
npm run build
npm run verify:dist
npm run verify:markdown-links
npm run config:validate
npm run verify:safety-guard
```

## Working Notes

### Files Not Scanned

* `node_modules/` — installed third-party dependency tree; lockfile and npm scripts were reviewed instead.
* `dist/`, `dist-electron/`, `release/`, `coverage/` — generated outputs; verified through build/dist commands rather than source audit.
* `docs/Venice_swagger_api.yaml` — large vendored API reference; only targeted image/seed/capability searches were performed.

### Files Referenced But Not Provided

* None

### Open Questions

* (?) Should the production handoff be a dedicated Zustand slice or an extension of the existing settings/media stores? Prefer a dedicated transient action queue so persisted settings never retain pending generation commands.
* (?) Does every currently returned image model support variants? The UI should still honor capability metadata instead of assuming yes.
