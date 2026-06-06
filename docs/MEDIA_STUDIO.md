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

For the v1 release the inspector surfaces the **per-model capabilities**
(sourced from `modelSupportsUpscale` / `modelSupportsEdit` /
`modelSupportsVideo` / `modelSupportsVision`) but the action buttons
themselves are intentionally not yet wired into the inspector. The
existing `image-tools.tsx` flow already persists every result to the
media store with the correct `operation` and `parentId`, and that is the
contract every future gallery-driven action must honour.

When a future "Upscale from gallery" button is added it should:

1. Read the source item via `useMediaStore.getState().byId(id)`.
2. Call the existing `useImageUpscale` hook (which already routes through
   `veniceBlob` and therefore through the IPC safety guard).
3. Convert the resulting `Blob` to a data URL via `blobToDataUrl`.
4. Build a new `MediaItem` with `parentId: id`, `operation: 'upscale'`,
   `upscaleFactor`, and `model: <selected model>`.
5. Call `useMediaStore.getState().upsert(newItem)`.

The pattern is identical for edit / background-remove / variation /
regenerate. The hook is already the canonical write path; the gallery
view just needs to invoke it.

## Video persistence

The Video Studio persists the result of every successful `/video/queue`
poll into a `MediaItem` with `mediaType: 'video'`,
`operation: 'video-generate'`, and the upstream HTTPS `videoUrl` in the
`image` field. Video **bytes are not stored in IndexedDB** — the
upstream URL is sufficient for re-download, and storing base64 video
would balloon the encrypted IDB for marginal benefit. The export
pipeline (see below) handles the HTTPS → disk hop.

The persist-on-complete effect in `video-view.tsx` is keyed on
`[status, videoUrl, queueId, lastRequest, prompt]` with a ref guard, so
re-renders of the same job do not double-save.

A "Save to Media Studio" button next to the Download anchor lets the
user re-save a video they previously deleted from the studio without
having to re-generate.

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
- `src/stores/media-store.test.ts` — 16 tests (Zustand store + selectors)
- `src/utils/mediaItem.test.ts` — 7 tests (capability helper, filename, etc.)
- `src/components/gallery/gallery-view.test.tsx` — 2 tests (load + delete)
- `src/components/image/image-tools.test.tsx` — 1 test (**VERIFY-020**: persist on save)
- `electron/services/mediaService.test.ts` — 25 tests (sanitisation, containment, round-trip, thumb cache, sha256)

Total: 60 new tests across 6 files.

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

- Gallery-driven "Upscale / Edit / Variation / Regenerate" buttons in
  the detail dialog and inspector (already-capability-aware).
- Web-mode import via the browser `<input type=file>` flow (renderer
  reads the file with `FileReader` and posts a data URL through
  `app:media:import`).
- Server-side thumbnail cache warming at upload time so a re-open
  shows thumbs immediately even if the renderer's in-memory LRU was
  evicted.
