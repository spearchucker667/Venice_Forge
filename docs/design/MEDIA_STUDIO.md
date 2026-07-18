# Media Studio

> Scope: Local-only library for everything Venice Forge generates — images and videos — with search, tags, notes, favorites, lineage, batch actions, and a capability-aware inspector.
> Implemented: 2026-06
> Status: Replaces the old "Library" view. All generated images, image-tool results, and videos now persist here automatically.

## What it is

Media Studio is the local-first hub for generated media. It reads from the existing
encrypted IndexedDB `images` store, **enriches each record in place** into a
canonical `MediaItem`, and exposes a rich UI: searchable grid, filmstrip detail
dialog, tag/note/favorite inspector, multi-select batch actions, and per-model
capability hints.

In Electron mode the view also has access to a small set of main-process
affordances for safely moving media on and off the filesystem (export, import,
reveal in folder, metadata read, content-addressed thumbnail cache).

## Loading and filtering behavior

The encrypted `images` store has a top-level `timestamp` index (IndexedDB schema
v6). Media Studio reads the newest 60 records first and loads older records in
explicit 60-record pages. The header reports loaded and total counts.

Search, filters, sort, selection, batch actions, detail navigation, and lineage
inspection operate on the currently loaded records. Use **Load more** to include
older records in those operations. Cards outside the scroll viewport use CSS
`content-visibility` to avoid unnecessary layout and paint work.

### Performance profile

Run `npm run profile:media-studio` for an opt-in Playwright Electron profile.
The script starts Vite when needed, uses an isolated Electron user-data directory,
seeds 1,000 AES-GCM encrypted records, verifies the 60-record initial page and
one 60-record load-more page, and prints timing, heap, DOM, and console-health
metrics. Screenshots are written to the system temporary directory and profile
data is deleted after the run.

Two June 6, 2026 development-build runs on Apple Silicon measured 381.5–444.0 ms
for initial 60-card hydration and 243.9–326.9 ms for load-more. Used JS heap was
35.3–41.6 MB after initial hydration and 42.4–50.8 MB after 120 cards. These are
observational baselines, not CI thresholds; hardware, host load, and development
tooling vary.

## Data model

`MediaItem` extends the legacy `GalleryImage` shape (which still lives in
`src/types/storage.ts` for back-compat) with the following fields. The
migrator in `src/services/mediaMigration.ts` is idempotent — running it on
an already-migrated record is a no-op.

```ts
interface MediaItem extends GalleryImage {
  mediaItemVersion?: 1;
  mediaType: 'image' | 'video';
  operation: MediaOperation;          // see below
  parentId: string | null;            // lineage back-pointer
  childrenIds: string[];              // lineage forward-pointers
  sha256?: string;                    // content hash for thumb cache
  tags: string[];                     // normalized: lowercased, deduped, ≤32 chars
  note: string;
  favorite: boolean;
  thumbHash?: string;                 // server-side thumbnail identifier
  viewCount?: number;
  exportedPathToken?: string;         // opaque token; only set after app:media:export
  // Generation provenance (added 2026-06):
  seed?: number | null;               // -999999999..999999999; null = use random
  source?: string;                    // "image-page" | "image-tools" | "gallery-action" | …
  enhancedPrompt?: string;            // last enhancer output (enhance mode)
  originalPrompt?: string;            // pre-enhancer prompt (if enhancer was used)
  remixPrompt?: string;               // last enhancer output (remix mode)
  quality?: "low" | "medium" | "high" | "auto";
  resolution?: string;                // e.g. "1k" / "2k" / "4k" for aspect-resolution models
}

type MediaOperation =
  | 'generate'
  | 'upscale'
  | 'edit'
  | 'background-remove'
  | 'variation'
  | 'regenerate'
  | 'video-generate'
  | 'video-upscale'
  | 'import';
```

The `id` and `timestamp` fields come from `GalleryImage` and are immutable once
written — they are the primary key in the IDB store and the sort anchor for
"newest" / "oldest" view modes.

### Why "enrich in place" instead of a new store?

The encrypted `images` IndexedDB store has been the canonical home for
generated images since v0. The migrator pattern lets us add columns
(`mediaType`, `operation`, `tags`, `favorite`, …) to existing records
without a destructive store migration. New records written through
`useMediaStore.upsert` go through the same migrator before persistence,
so the `mediaItemVersion` field is set on every record going forward.
A future `MEDIA_ITEM_VERSION = 2` migrator only needs to inspect
`mediaItemVersion` and run an upgrade path; it never needs to touch the
underlying IDB schema.

## Lineage

Every image-tool result (`upscale`, `edit`, `background-remove`) is persisted
as a **new** `MediaItem` with:

- `parentId` set to the source item's id,
- `operation` set to the action taken,
- `childrenIds` is computed at read time from the inverse index (items whose
  `parentId === thisItem.id`).

Variations and regenerates are persisted the same way; the inspector
surfaces "Parent" (if any) and "Children" (if any) sections. Clicking a
parent or child opens that item in the detail dialog.

## Storage layer

- **Renderer cache** — `src/stores/media-store.ts` is a transient Zustand
  store. It is *not* persisted via the `persist` middleware; IndexedDB
  remains the source of truth. The store is hydrated on first read by
  `useMediaStore.getState().refresh()`.
- **Write path** — the canonical write is
  `useMediaStore.getState().upsert(item)`. The store migrates the record
  and calls `StorageService.putMedia<MediaItem>(item)`, then reconciles
  the in-memory list. No other module should call
  `StorageService.putMedia` for media directly.
- **Selector helpers** — `selectById`, `selectChildren`, `selectParent`,
  and the pure `filterMedia(items, filter)` / `sortMedia(items, sort)` /
  `searchMedia(items, query)` are exported for any view or test to share.

## UI

| Component | File | Role |
|-----------|------|------|
| `MediaStudioView` | `src/components/gallery/gallery-view.tsx` | Grid, toolbar, search, filter, sort, multi-select, detail/inspector toggles |
| `MediaToolbar` | `src/components/gallery/media-toolbar.tsx` | Search box, sort, Refresh, batch-action bar (when in multi-select mode) |
| `MediaCard` | `src/components/gallery/media-card.tsx` | Memoised card: thumb, badges (op / type / dim / duration), prompt preview, model, tag chips, favorite star, delete |
| `MediaDetailDialog` | `src/components/gallery/media-detail-dialog.tsx` | Full-screen modal with prev/next nav buttons, keyboard ←/→/Esc, filmstrip, metadata |
| `MediaInspector` | `src/components/gallery/media-inspector.tsx` | Side panel with tags, note, parent / children, capability row, favorite, export, delete |

The grid is responsive: 2 columns on phones, 5 on wide desktops. Multi-select
mode surfaces a batch-action bar (favorite, unstar, delete) and a Select All /
Clear toggle. The toolbar's filter pills (All / Images / Videos / Favorites /
Upscaled / Edited) are pure functions of the store list and the URL-less
local view-state.

### Keyboard

- `←` / `→` — prev / next in the detail dialog
- `Esc` — close detail dialog or inspector
- `Enter` (in note textarea) — save
- `Delete` (in detail) — confirm and remove (Electron only — see "Batch actions" for the multi-select variant)

## Image actions (upscale / edit / variation / regenerate)

The inspector surfaces the **per-model capabilities** (sourced from
`modelSupportsUpscale` / `modelSupportsEdit` / `modelSupportsVideo` /
`modelSupportsVision`) and wires a complete action bar to them. Every
button follows the same contract: read the source item, call the
existing canonical hook / store action, persist the result with the
right `operation` and `parentId`.

### Action bar (inspector, all wired)

| Action | Source | Effect | Persisted as |
|--------|--------|--------|--------------|
| **Use settings** | selected item | Populates Image Studio state with the item's stored parameters. No generation. | (no persisted item) |
| **Regenerate** | selected item | Generates a new image from the stored metadata, with a new random seed. | `{ operation: "regenerate", parentId: original.id }` |
| **Regenerate with same seed** | selected item | Like Regenerate but pins the original seed. Disabled (with tooltip) when the item has no seed. | `{ operation: "regenerate", parentId: original.id, seed: original.seed }` |
| **Enhance / Upscale** | selected item | Routes to the existing `useImageUpscale` hook (or the image-tools panel). | `{ operation: "upscale", parentId: original.id }` |
| **Remix** | selected item | Calls the internal prompt-enhancer LLM. Shows original vs remixed prompt with **Apply to Image Studio**, **Remix & Generate**, **Save remix**, and **Cancel** buttons. | `{ operation: "regenerate", parentId: original.id, prompt: remixPrompt }` (Remix & Generate) |
| **Copy prompt** | selected item | Writes `item.prompt` to the clipboard. | (no persisted item) |
| **Copy negative** | selected item | Writes `item.negative` to the clipboard. Hidden when no negative prompt. | (no persisted item) |
| **Copy seed** | selected item | Writes `item.seed` to the clipboard. Hidden when no seed. | (no persisted item) |
| **Copy metadata** | selected item | Writes a JSON object with `model`, `dimensions`, `seed`, `style`, `steps`, `cfg`, `source`, `negative`, `aspectRatio`, `resolution` to the clipboard. | (no persisted item) |

### Handoff between gallery and image studio

Gallery actions enqueue a typed, transient request in
`useImageWorkspaceStore`. The request contains either an Image Studio
draft or an image-tools source plus lineage metadata. It is never
persisted to browser storage and does not expose a production window
global.

`ImagePage` selects the requested Generate or Tools sub-tab. The
destination component consumes the request exactly once. Regenerate
requests apply all draft state first, then schedule generation after
React commits the model, sizing, quality, and seed updates. Use
settings applies the same draft without generating.

### Image Studio writes back to the gallery

`image-view.tsx` and `image-tools.tsx` persist derivatives through
`useMediaStore.upsertDerivative`. The helper writes the child with its
`parentId`, patches the parent's deduplicated `childrenIds`, and rolls
back the child if the parent update fails. Normal generation and
manual image-tool uploads remain unlinked.

### Safety gate on enhancer actions

The **Enhance** and **Remix** buttons are disabled when
`internal_prompt_enhancer.enabled` is `false` in the sanitized
config — the title attribute surfaces the reason so the user
understands why.

## Video persistence

The main-process background-task manager retrieves completed video output.
MP4 responses and approved provider download URLs stream into a bounded
temporary file, are hashed and signature-checked incrementally, fsynced, and
atomically committed under the content-addressed generated-media store. The
renderer receives only `venice-media://<sha256>` and the media ID; video bytes
never enter IndexedDB or renderer/base64 memory.

Completed tasks reconcile deterministically into Media Studio records. Both
Video Studio and Media Studio export by media ID through
`app:media:save-generated`; the main process resolves the trusted file, derives
the extension from MIME, displays Save As, and copies atomically without
exposing local paths to the renderer.

## Electron IPC (desktop affordances)

The renderer talks to the main process through five new IPC channels.
Every channel is routed through `electron/ipc/handlers.ts:registerIpcHandlers`
and returns values wrapped in `redactErrorMessage`.

| Channel | Purpose | Returns |
|---------|---------|---------|
| `app:media:export` | Write a data-URL or base64 to `Pictures/Venice Forge/Media Studio/<sub>/<file>` (atomic temp + rename) | `{ ok, filePath?, canceled?, error? }` |
| `app:media:import` | Read a file from the OS file picker → return data URL + bytes + content type | `{ ok, dataUrl?, filePath?, filename?, bytes?, contentType?, error? }` |
| `app:media:reveal` | `shell.showItemInFolder` the file at the given path (allowed dirs only) | `{ ok, error? }` |
| `app:media:meta` | `fs.stat` for bytes + mtime + isFile | `{ ok, bytes?, mtime?, isFile?, error? }` |
| `app:media:thumb` | Content-addressed thumbnail at `<userData>/metadata/media-thumbs/<sha>.webp` | `{ ok, filePath?, url?, error? }` |

### Path containment (defence in depth)

`electron/services/mediaService.ts` validates every path input before any
I/O. The rules:

- `path.resolve` + `path.relative` against an explicit base-dir allowlist.
- The relative path must not start with `..` (traversal rejection).
- Null bytes are rejected.
- Length cap: 4096 chars on the *resolved* path.
- Filenames are sanitized to `[a-zA-Z0-9_.-]`, subfolders to
  `[a-zA-Z0-9_-]`. Leading dots are stripped from both. Each is clipped
  to a length cap (200 chars for filenames, 60 for subfolders).

Allowed base directories:

- **Reveal / meta / thumb read**: `Pictures/Venice Forge`, `Desktop`,
  `Downloads`, `Documents`, `<userData>/metadata/media-thumbs`,
  `<userData>/metadata/media-exports`.
- **Import read**: `Downloads`, `Documents`, `Desktop`,
  `Pictures/Venice Forge`. Cap: 50 MiB.

The thumbnail decoder is a self-contained pure-JS PNG reader (zlib
inflate, 8-bit RGB / RGBA / gray, all 5 filter types). The encoder
emits PNG bytes (despite the `.webp` extension) for cross-renderer
compatibility. JPEG / GIF / WebP decoders are intentional stubs and
return `null`, which causes the handler to return
`ok: false, error: "Unsupported image format."` and the renderer falls
back to its in-memory `useMediaThumb` canvas cache. This is by design.

The 25 tests in `electron/services/mediaService.test.ts` cover every
sanitisation rule, the containment check, the round-trip
export → read-meta → import, the cache miss / hit path, and the SHA-256
helper (using the canonical `""` and `"abc"` known vectors).

## "Open file location" semantics

The detail dialog and inspector show a "Show in folder" button, but it
is **disabled with a tooltip** until the item has an `exportedPathToken`.
The token is set by `app:media:export` and contains the main-process
absolute path; the renderer only sees an opaque string. The reveal IPC
validates the token's path against the allowlist before calling
`shell.showItemInFolder`. This means:

- Generated items that were *not* explicitly exported cannot be revealed
  (their bytes live in the encrypted IDB, not on disk).
- A forged token cannot escape the allowlist — `revealMediaInFolder`
  re-runs the containment check on the resolved path.

## Capability awareness

`src/utils/mediaItem.ts` exports a `mediaCapabilities(item)` helper that
returns `{ upscale, edit, video, vision }` for a given `MediaItem`. It
wraps the per-capability model checks in `src/constants/venice.ts`
(`modelSupportsUpscale`, `modelSupportsEdit`, `modelSupportsVideo`,
`modelSupportsVision`). The inspector renders a "Model capabilities"
row with a `<Badge>` per enabled capability and a one-line caption
explaining what the row means. The row is hidden when no capability
is recognised, so unknown models do not show a misleading "all
supported" grid.

## Batch actions

The toolbar's multi-select toggle enters batch mode. The batch-action
bar surfaces:

- a live count + total size of the selection,
- a Select All / Clear toggle that scopes to the **current filter**
  (so "All" only selects the visible filtered set, not the entire
  store),
- Favorite / Unstar — applies to the entire selection in one
  `patchMany` round-trip,
- Delete — gated on a `window.confirm` with the count; uses
  `removeMany` to coalesce the writes.

Destructive actions are the only ones that require confirmation. The
"open inspector for one item" affordance is intentionally *not* part of
the batch bar — you exit batch mode to inspect a single item in detail.

## Web mode

In web mode (`npm run dev:web`) the IPC layer is unavailable. The
`desktopBridge` shim returns a stub `{ ok: false, error: 'desktop-only' }`
for `importMedia`, `revealMedia`, `readMediaMeta`, and
`generateMediaThumb`. The `exportMedia` fallback uses a browser
`<a download>` anchor + a `Blob`. Thumbnails are generated in-memory
via `useMediaThumb` (WebP data URL via canvas, 256px max, LRU-capped
at 256 entries).

The web-mode flow is intentionally **read-only for disk** — there is
no way to read from the local filesystem, no way to open the OS file
manager. The "Export" button works because browser-anchor downloads
are an OS-level affordance, not a filesystem read.

## Safety

Every Venice call still goes through `venice()` (services) or
`veniceBlob()` (lib), and therefore through the canonical IPC safety
guard. The Media Studio adds no new Venice endpoint, so the
`verify-safety-guard` script continues to pass.

The image-tool write path (`image-tools.tsx → useMediaStore.upsert`)
runs *after* the result is returned, so the guard has already
approved the request body. Persisting the result to the media store
cannot bypass the guard because no new Venice call is made during the
persist.

## Tests

- `src/services/mediaMigration.test.ts` — 9 tests (pure migrator)
- `src/stores/media-store.test.ts` — Zustand store, derivative lineage, rollback, and selectors
- `src/stores/image-workspace-store.test.ts` — transient production handoff lifecycle
- `src/utils/mediaItem.test.ts` — 7 tests (capability helper, filename, etc.)
- `src/components/gallery/gallery-view.test.tsx` — load, delete, and production dev-global gating
- `src/components/gallery/media-inspector.test.tsx` — Use settings / Regenerate / Same seed / Copy prompt / Copy negative / Copy seed / Copy metadata / disabled-when-enhancer-off / Upscale / Edit
- `src/components/image/image-tools.test.tsx` — persistence plus handed-off derivative lineage (**VERIFY-020**)
- `src/components/image/image-view.test.tsx` — sizing payload and committed-state regenerate handoff (**VERIFY-040**)
- `src/utils/characterImageResolver.test.ts` — 28 tests (host allowlist, nested fields, private-IP rejection)
- `src/config/image-model-capabilities.test.ts` — 13 tests (dimension mode registry, snake_case normalisation, quality / resolution coverage)
- `src/utils/payloadBuilders.test.ts` — 41 tests (dimension, seed, variants, quality, resolution, chat memory)
- `src/services/prompt-enhancer-service.test.ts` — 18 tests (config-driven model/temp/tokens, disabled state, output cleanup, safety posture)
- `src/config/configSchema.test.ts` — 28 tests (defaults, clamps, internal_prompt_enhancer safety posture)
- `electron/services/configService.test.ts` — 22 tests (default YAML includes enhancer, writeSanitized applies partial patch, secrets redacted)
- `electron/services/mediaService.test.ts` — 25 tests (sanitisation, containment, round-trip, thumb cache, sha256)
- `src/services/storageService.test.ts` and `src/stores/media-store.test.ts` — **VERIFY-028** pagination contract and incremental hydration

The full Vitest suite is the authoritative test count.

## Migration notes

- Records written before the Media Studio rollout are read through
  `migrateGalleryImageToMediaItem` and gain the new fields with safe
  defaults: `mediaType: 'image'`, `operation: 'generate'`, `tags: []`,
  `note: ''`, `favorite: false`, `parentId: null`, `childrenIds: []`.
- Records with `upscaled: true` and no `operation` are inferred as
  `operation: 'upscale'`. Records with the legacy `mediaType: 'video'`
  field are inferred as `operation: 'video-generate'`.
- The migrator is **idempotent** — running it on a v1 record is a
  no-op except for re-asserting `mediaItemVersion`.

## Future work

- Web-mode import via the browser `<input type=file>` flow (renderer
  reads the file with `FileReader` and posts a data URL through
  `app:media:import`).
- Server-side thumbnail cache warming at upload time so a re-open
  shows thumbs immediately even if the renderer's in-memory LRU was
  evicted.
