# Venice Forge Codebase Audit TODO

> Generated: 2026-06-03  
> Scope: Code + docs + tests + config + release workflows  
> Repository: https://github.com/spearchucker667/Venice-API-connector  
> Files scanned: prioritized manual review / full repository archive present  
> Validation run: `npm ci` attempted and blocked by container timeout; `package.json` scripts inspected for `typecheck`, `lint:eslint`, `test`, `build`, and `verify:dist`; those commands were not executed in this audit snapshot

## Recon Summary

- The repository is a mixed React + TypeScript + Vite + Electron + Express codebase targeting packaged Electron desktop builds for Windows/macOS plus a local web/dev mode, with shared request validation under `src/shared/*` and dual transport clients in `src/services/veniceClient.ts` and `electron/services/veniceClient.ts`.
- The primary trust boundaries are the Electron main process in `electron/main.ts`, the preload bridge in `electron/preload.ts`, IPC handlers in `electron/ipc/handlers.ts`, the local Express proxy in `server.ts`, and the renderer-side service layer in `src/services/*`.
- Security-sensitive paths include API-key storage in `electron/services/secureStore.ts`, Venice request validation in `electron/ipc/validation.ts` and `src/shared/validation.ts`, SSRF defenses for scrape/search in `electron/ipc/handlers.ts`, `server.ts`, and `src/research/providers/genericHttpScrapeProvider.ts`, and the child-exploitation safety guard in `src/shared/safety/*`.
- Build/test/release behavior is driven by `package.json`, `tsconfig*.json`, `eslint.config.mjs`, `vite.config.ts`, `electron-builder.config.cjs`, `scripts/verify-dist.cjs`, `scripts/checksum-release.cjs`, `.github/workflows/ci.yml`, and `.github/workflows/release.yml`.
- Documentation is broad but drifted in places: `README.md`, `SECURITY.md`, `docs/ABOUT.md`, `docs/RESEARCH_PROVIDERS.md`, `docs/JINA_PROVIDER.md`, `docs/PUBLIC_PROFILE_DISCOVERY.md`, `docs/RELEASE/*`, `docs/REPOSITORY_TREE.md`, `docs/legal/PRIVACY.md`, and `.env.example` were all in scope for claim-vs-implementation checks.

## Summary

| Category | Critical | High | Medium | Low / Cosmetic | Total |
|---|---:|---:|---:|---:|---:|
| Bugs | 2 | 1 | 1 | 1 | 5 |
| Docs | 0 | 0 | 5 | 2 | 7 |
| UI | 0 | 0 | 1 | 0 | 1 |
| Build/Release | 0 | 1 | 0 | 0 | 1 |
| Tests | 0 | 0 | 1 | 0 | 1 |

## Critical Bugs

### [CRITICAL] Task #1: Stop persisting edited and upscaled images as transient blob URLs

**ID:** BUG-001  
**File:** `src/modules/ImageModule.tsx`  
**Location:** line(s) 166–189, 192–218  
**Category:** Bug  
**Type:** Persistence  
**Confidence:** [VERIFIED]  
**Issue:** The image-edit, image-multi-edit, and image-upscale paths convert returned `Blob` objects into `blob:` object URLs and then persist those transient URLs into the gallery record.  
**Why It Matters:** `blob:` URLs die when the renderer reloads or the app restarts, so edited/upscaled images appear to save successfully on the happy path and then disappear or become undownloadable later. This is durable-media corruption, not a temporary preview issue.  
**Evidence:**
```ts
} else if (draft.imageMode === "image-edit") {
  const blob = await editImage({
    model: state.selectedImageModel,
    prompt: draft.prompt,
    image: draft.imageUrl,
    aspect_ratio: draft.aspectRatio,
    safe_mode: draft.safeMode
  }, { signal, dispatch });
  generatedImage = URL.createObjectURL(blob);
} else if (draft.imageMode === "image-multi-edit") {
  const blob = await multiEditImage({
    modelId: state.selectedImageModel,
    prompt: draft.prompt,
    images: draft.imageUrls,
    aspect_ratio: draft.aspectRatio,
    safe_mode: draft.safeMode
  }, { signal, dispatch });
  generatedImage = URL.createObjectURL(blob);
} else if (draft.imageMode === "image-upscale") {
  const blob = await upscaleImage({
    image: draft.imageUrl,
    scale: draft.upscaleFactor,
  }, { signal, dispatch });
  generatedImage = URL.createObjectURL(blob);
}

const saved = await saveRecordService(dispatch, {
  id: crypto.randomUUID(),
  image: generatedImage,
  prompt: draft.prompt,
  // ...
}, true);
```

**Fix:** Convert returned blobs to a durable serialized format before persistence. Keep any `blob:` URL only for short-lived preview state, never for IndexedDB storage. Add a helper such as `blobToDataUrl(blob)` and store the data URL in the gallery record. Revoke any preview-only object URLs after use.  
**Before:**
```ts
const blob = await editImage({
  model: state.selectedImageModel,
  prompt: draft.prompt,
  image: draft.imageUrl,
  aspect_ratio: draft.aspectRatio,
  safe_mode: draft.safeMode
}, { signal, dispatch });
generatedImage = URL.createObjectURL(blob);
```

**After:**
```ts
async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to serialize generated image."));
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Generated image serialization returned a non-string result."));
    };
    reader.readAsDataURL(blob);
  });
}

const blob = await editImage({
  model: state.selectedImageModel,
  prompt: draft.prompt,
  image: draft.imageUrl,
  aspect_ratio: draft.aspectRatio,
  safe_mode: draft.safeMode
}, { signal, dispatch });

generatedImage = await blobToDataUrl(blob);
```

**Acceptance Test:** Generate an image in each of these modes: **Edit**, **Combine**, and **Upscale**. Confirm the gallery thumbnail renders, quit/relaunch the app, and verify the same records still render and download successfully.

### [CRITICAL] Task #2: Persist completed videos with durable sources and the real queued download URL

**ID:** BUG-002  
**File:** `src/modules/VideoModule.tsx`  
**Location:** line(s) 37–53, 56–90, 182–191  
**Category:** Bug  
**Type:** Persistence  
**Confidence:** [VERIFIED]  
**Issue:** Video gallery saves use `image: blobUrl || ""`, while `pollStatus()` passes `draft.downloadUrl`, which is a stale closure value rather than the `download_url` returned by `/video/queue`. If retrieval returns only a URL, the saved gallery record can have an empty media source. If retrieval returns a blob, the persisted source is again a transient `blob:` URL.  
**Why It Matters:** Completed videos can be saved as blank, stale, or non-replayable records. This breaks a primary happy-path workflow in the local library and causes practical data loss.  
**Evidence:**
```ts
async function saveToGallery(blobUrl: string | null, downloadUrl: string | null, queueId: string, model: string) {
  await saveImageRecord(dispatch, {
    id: crypto.randomUUID(),
    image: blobUrl || "", // Object URL or empty if fallback to downloadUrl
    prompt: draft.prompt,
    negative: draft.negative,
    model,
    timestamp: Date.now(),
    mediaType: "video",
    workflow: draft.videoMode,
    queueId,
    downloadUrl: downloadUrl || undefined,
    duration: draft.duration,
    resolution: draft.resolution,
    upscaleFactor: draft.upscaleFactor,
    audio: draft.audio
  });
}

if (res.blob) {
  const url = URL.createObjectURL(res.blob);
  videoObjectUrlRef.current = url;
  patch({
    generationProgress: "",
    status: "COMPLETED",
    videoUrl: url,
  });
  await saveToGallery(url, draft.downloadUrl, queueId, model);
} else {
  patch({
    generationProgress: "",
    status: "COMPLETED",
    downloadUrl: draft.downloadUrl,
  });
  await saveToGallery(null, draft.downloadUrl, queueId, model);
}

pollTimerRef.current = setTimeout(() => void pollStatus(res.queue_id, state.selectedVideoModel, signal), 3000);
```

**Fix:** Thread the queued `download_url` from the `/video/queue` response into `pollStatus()`, stop reading `draft.downloadUrl` from a stale closure, and never persist an empty or transient source for video records. Persist `downloadUrl` when available, and if the API returns blob-only media, serialize the blob to a durable format before saving.  
**Before:**
```ts
pollTimerRef.current = setTimeout(() => void pollStatus(res.queue_id, state.selectedVideoModel, signal), 3000);
```

```ts
await saveToGallery(null, draft.downloadUrl, queueId, model);
```

**After:**
```ts
pollTimerRef.current = setTimeout(
  () => void pollStatus(res.queue_id, state.selectedVideoModel, signal, res.download_url || null),
  3000
);
```

```ts
async function pollStatus(
  queueId: string,
  model: string,
  signal: AbortSignal,
  queuedDownloadUrl: string | null
) {
  // ...
  if (res.blob) {
    const previewUrl = URL.createObjectURL(res.blob);
    videoObjectUrlRef.current = previewUrl;

    const durableSource = queuedDownloadUrl || await blobToDataUrl(res.blob);
    patch({
      generationProgress: "",
      status: "COMPLETED",
      videoUrl: previewUrl,
      downloadUrl: queuedDownloadUrl,
    });

    await saveToGallery(durableSource, queuedDownloadUrl, queueId, model);
  } else if (queuedDownloadUrl) {
    patch({
      generationProgress: "",
      status: "COMPLETED",
      downloadUrl: queuedDownloadUrl,
    });

    await saveToGallery(queuedDownloadUrl, queuedDownloadUrl, queueId, model);
  } else {
    throw new Error("Video completed but no durable media URL was returned.");
  }
}
```

**Acceptance Test:** Queue a video job that returns a `download_url`, let it complete, confirm the library item is playable and downloadable, then relaunch the app and verify the same item still works. Repeat with a retrieve path that returns blob content to verify the blob-only path is also durable.

## High Bugs

### [HIGH] Task #3: Publish and verify Electron updater metadata in release automation

**ID:** BUG-003  
**File:** `.github/workflows/release.yml`, `scripts/checksum-release.cjs`, `scripts/verify-dist.cjs`, `electron/ipc/updates.ts`  
**Location:** line(s) `release.yml` 73–81, 141–148, 170–175; `checksum-release.cjs` 14–17; `verify-dist.cjs` 88–123; `updates.ts` 2–9, 28–43  
**Category:** Bug  
**Type:** Build  
**Confidence:** [VERIFIED]  
**Issue:** The app uses `electron-updater`, but the release workflow only uploads `.exe`, `.dmg`, `.zip`, and `.sha256` files. It does not publish updater metadata such as `latest*.yml` and generated `.blockmap` files, and the verification scripts do not check for them.  
**Why It Matters:** Packaged desktop builds can ship with a nonfunctional update channel even though the release pipeline passes. That is a common production workflow break with no safe in-app workaround.  
**Evidence:**
```yml
- name: Upload macOS artifacts
  uses: actions/upload-artifact@v4
  with:
    name: venice-forge-macos-${{ github.ref_name }}
    path: |
      release/*.dmg
      release/*.zip
      release/*.sha256

- name: Upload Windows artifacts
  uses: actions/upload-artifact@v4
  with:
    name: venice-forge-windows-${{ github.ref_name }}
    path: |
      release/*.exe
      release/*.sha256
```

```js
const artifacts = files.filter(
  (f) => f.endsWith(".exe") || f.endsWith(".dmg") || f.endsWith(".zip")
);
```

```ts
import { autoUpdater } from "electron-updater";
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;
```

**Fix:** Upload the full generated release payload needed by `electron-updater`, not just the binaries and checksum sidecars. Extend release verification to assert the presence of updater manifests and blockmaps for packaged builds.  
**Before:**
```yml
path: |
  release/*.dmg
  release/*.zip
  release/*.sha256
```

```yml
path: |
  release/*.exe
  release/*.sha256
```

**After:**
```yml
path: |
  release/*
```

```js
const artifacts = files.filter((f) => {
  if (f.endsWith(".sha256")) return false;
  return (
    f.endsWith(".exe") ||
    f.endsWith(".dmg") ||
    f.endsWith(".zip") ||
    f.endsWith(".yml") ||
    f.endsWith(".blockmap")
  );
});
```

**Acceptance Test:** Run a tagged release build, inspect the resulting release asset set, and confirm it includes `latest.yml`, `latest-mac.yml` if generated, and associated `.blockmap` files. Then install a packaged build and verify **Config → Updates → Check for updates** succeeds against the published GitHub Release.

### [HIGH] Task #4: Make gallery downloads and filenames media-type aware instead of hardcoding PNG/image behavior

**ID:** BUG-004  
**File:** `src/utils/image.ts`, `src/modules/GalleryModule.tsx`, `src/services/imageWorkflowService.ts`, `src/utils/download.ts`  
**Location:** line(s) `image.ts` 94–98; `GalleryModule.tsx` 307–313; `imageWorkflowService.ts` 171–185; `download.ts` 20–44  
**Category:** Bug  
**Type:** Logic  
**Confidence:** [VERIFIED]  
**Issue:** The gallery filename helper always emits `.png`, and gallery download paths always use `downloadImage(...)` even for `mediaType: "video"` records. Bulk downloads and item downloads therefore treat videos as images.  
**Why It Matters:** A common workflow is broken: saved videos can download with the wrong extension, the wrong helper behavior, and inconsistent browser handling.  
**Evidence:**
```ts
export function galleryFilename(item: unknown, index = 0, suffix = "") {
  const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const safeModel = String(record.model || "venice").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40);
  const id = String(record.id || index).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60);
  return `${safeModel}-${id}${suffix}.png`;
}
```

```tsx
<button className="btn sm" onClick={async () => {
  await downloadImage(item.image, galleryFilename(item));
  dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Downloaded image", type: "info" } });
}}>Download</button>
```

**Fix:** Add a media-aware filename helper and a media-aware downloader. Prefer `item.downloadUrl || item.image` for videos, emit `.mp4` or `.webm` when appropriate, and update both single-item and bulk download paths to use the new helper.  
**Before:**
```ts
return `${safeModel}-${id}${suffix}.png`;
```

**After:**
```ts
export function galleryFilename(item: unknown, index = 0, suffix = "") {
  const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  const safeModel = String(record.model || "venice").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 40);
  const id = String(record.id || index).replace(/[^a-z0-9_-]+/gi, "-").slice(0, 60);

  const ext =
    record.mediaType === "video"
      ? (/\.webm($|\?)/i.test(String(record.downloadUrl || record.image || "")) ? ".webm" : ".mp4")
      : ".png";

  return `${safeModel}-${id}${suffix}${ext}`;
}
```

**Acceptance Test:** Save at least one video and one image to the library. Download both individually and via bulk download. Verify video files are saved with video extensions and open in the OS media player, while images still save as `.png`.

## Medium Bugs

### [MEDIUM] Task #5: Align search-result link rendering with Electron’s HTTPS-only external-link policy

**ID:** BUG-005  
**File:** `src/modules/SearchScrapeModule.tsx`, `electron/utils/urlSecurity.ts`  
**Location:** line(s) `SearchScrapeModule.tsx` 46–55, 437, 747–748; `urlSecurity.ts` 117–123  
**Category:** Bug  
**Type:** Electron  
**Confidence:** [VERIFIED]  
**Issue:** The renderer helper `safeHref()` allows both `http:` and `https:` links, but Electron’s external-navigation gate only trusts `https:` public URLs. This creates a desktop-only mismatch where some apparently valid links render as clickable but are blocked when opened.  
**Why It Matters:** Search and citation links are a core workflow in the Research tab. Silent desktop-only link failures are confusing and degrade trust in the app.  
**Evidence:**
```ts
export function safeHref(url: string | undefined): string {
  if (!url) return "#";
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? url : "#";
  } catch {
    return "#";
  }
}
```

```ts
export function isTrustedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return !isPrivateHostname(parsed.hostname);
  } catch {
    return false;
  }
}
```

**Fix:** Reuse one shared external-link policy across renderer and Electron. The smallest safe fix is to make `safeHref()` match `isTrustedExternalUrl()` behavior and suppress `http:` result links in the desktop UI.  
**Before:**
```ts
return parsed.protocol === "https:" || parsed.protocol === "http:" ? url : "#";
```

**After:**
```ts
return parsed.protocol === "https:" ? url : "#";
```

**Acceptance Test:** In Electron mode, load search results containing both `http:` and `https:` links. Verify `https:` links remain clickable and open in the system browser, while `http:` links render as disabled or non-clickable instead of failing at click time.

### [MEDIUM] Task #6: Add regression coverage for video-library behavior and media-aware filenames

**ID:** BUG-006  
**File:** `src/modules/GalleryModule.test.tsx`, `src/utils/image.test.ts`  
**Location:** line(s) `GalleryModule.test.tsx` 27–33, 47–57; `image.test.ts` 7–24  
**Category:** Bug  
**Type:** Test  
**Confidence:** [VERIFIED]  
**Issue:** Current gallery tests only exercise image fixtures and hardcode `.png` expectations. There is no regression coverage for video records, `downloadUrl` fallback, or media-type-specific filenames and actions.  
**Why It Matters:** The current broken video-library behavior was not caught by tests. Without regression coverage, fixes for BUG-002, BUG-004, and UI-001 are likely to regress.  
**Evidence:**
```ts
vi.mock("../utils/image", () => ({
  galleryFilename: (item: any) => `${item.model}-${item.id}.png`,
}));

const sampleImage = {
  id: "img-1",
  image: "data:image/png;base64,AAAA",
  model: "test-model",
  prompt: "a cat",
  timestamp: Date.now(),
};
```

```ts
it("builds a filename from item model and id", () => {
  const item = { model: "fluently-xl", id: "abc-123", prompt: "a cat", timestamp: 1000 };
  expect(galleryFilename(item)).toBe("fluently-xl-abc-123.png");
});
```

**Fix:** Extend gallery and filename tests with explicit video fixtures. Add assertions for `.mp4` naming, `downloadUrl || image` source selection, and image-only actions being hidden/disabled for `mediaType: "video"`. If needed, add a new `src/modules/VideoModule.test.tsx` to cover queued completion persistence.  
**Before:**
```ts
const sampleImage = {
  id: "img-1",
  image: "data:image/png;base64,AAAA",
  model: "test-model",
  prompt: "a cat",
  timestamp: Date.now(),
};
```

**After:**
```ts
const sampleVideo = {
  id: "vid-1",
  image: "https://cdn.example.test/video.mp4",
  downloadUrl: "https://cdn.example.test/video.mp4",
  mediaType: "video",
  model: "wan-2.6-text-to-video",
  prompt: "a running river",
  timestamp: Date.now(),
};

it("builds an mp4 filename for video records", () => {
  expect(galleryFilename(sampleVideo)).toBe("wan-2-6-text-to-video-vid-1.mp4");
});
```

**Acceptance Test:** `npm test` must include explicit passing cases for video gallery filename generation, video download source selection, and image-only actions being unavailable for video items.

## Low / Cosmetic Bugs

### [LOW] Task #7: Replace image-only copy strings in the gallery with media-aware text

**ID:** BUG-007  
**File:** `src/modules/GalleryModule.tsx`  
**Location:** line(s) 39–57, 66–79, 307–314  
**Category:** Bug  
**Type:** Other  
**Confidence:** [VERIFIED]  
**Issue:** The gallery’s confirmation dialogs and toasts always say “image” even when the record is a video.  
**Why It Matters:** This does not break functionality, but it makes the media library feel inconsistent and unfinished after video support was added.  
**Evidence:**
```tsx
confirm(
  "Delete this image?",
  "This image will be permanently removed from the gallery. This cannot be undone.",
  async () => {
    await StorageService.deleteItem("images", id);
    // ...
  }
);
```

```tsx
dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Downloaded image", type: "info" } });
```

**Fix:** Derive copy from `item.mediaType` and use neutral “media” wording where mixed types are possible.  
**Before:**
```tsx
"Delete this image?"
```

**After:**
```tsx
const mediaLabel = item.mediaType === "video" ? "video" : "image";

confirm(
  `Delete this ${mediaLabel}?`,
  `This ${mediaLabel} will be permanently removed from the gallery. This cannot be undone.`,
  async () => {
    await StorageService.deleteItem("images", item.id);
    // ...
  }
);
```

**Acceptance Test:** Open the library with both images and videos saved. Verify delete dialogs and toast messages refer to the correct media type.

## Documentation Defects

### [DOC] Task #1: Fix the README’s stale endpoint-allowlist count

**ID:** DOC-001  
**File:** `README.md`  
**Location:** line(s) 207–210  
**Category:** Docs  
**Confidence:** [VERIFIED]  
**Issue:** The README says only 7 Venice endpoints are callable, but the real allowlist contains 13 endpoints, including video and image-edit endpoints.  
**Evidence:**
```md
1. **API key isolation** — Renderer cannot access raw keys (stored in OS secure storage)
2. **Venice endpoint allowlist** — Only 7 approved Venice endpoints are callable
3. **Content safety guard** — Every outgoing request is scanned for unsafe content before leaving the app
```

**Fix:** Replace the hardcoded count with an implementation-truthful statement that points to `src/shared/validation.ts`, or list the actual current allowlist.  
**Before:**
```md
2. **Venice endpoint allowlist** — Only 7 approved Venice endpoints are callable
```

**After:**
```md
2. **Venice endpoint allowlist** — Only the approved endpoints defined in `src/shared/validation.ts` are callable. The current allowlist includes chat, model discovery, search/scrape/text-parser, image generate/edit/upscale/multi-edit, and video queue/retrieve/quote/complete endpoints.
```

**Acceptance Test:** Confirm the README wording matches `src/shared/validation.ts` and no hardcoded incorrect endpoint count remains.

### [DOC] Task #2: Fix README links that point to missing root-level privacy and support documents

**ID:** DOC-002  
**File:** `README.md`  
**Location:** line(s) 220, 284–286, 335  
**Category:** Docs  
**Confidence:** [VERIFIED]  
**Issue:** The README links `PRIVACY.md` and `SUPPORT.md` at the repository root, but those files do not exist in the archive. The canonical files are `docs/legal/PRIVACY.md` and `docs/SUPPORT.md`.  
**Evidence:**
```md
**For full details**, see [SECURITY.md](SECURITY.md) and [PRIVACY.md](PRIVACY.md).

- **[PRIVACY.md](PRIVACY.md)** — Privacy policy and data handling
- **[SUPPORT.md](SUPPORT.md)** — Support channels and issue routing

- **Support:** [SUPPORT.md](SUPPORT.md)
```

**Fix:** Update the links to the real document locations, or add root stub files under Phase “Missing Documentation.”  
**Before:**
```md
[PRIVACY.md](PRIVACY.md)
[SUPPORT.md](SUPPORT.md)
```

**After:**
```md
[docs/legal/PRIVACY.md](docs/legal/PRIVACY.md)
[docs/SUPPORT.md](docs/SUPPORT.md)
```

**Acceptance Test:** Run a markdown link check or manually verify that every privacy/support link in `README.md` resolves inside the repo.

### [DOC] Task #3: Remove the unsupported “log viewer” claim from README diagnostics documentation

**ID:** DOC-003  
**File:** `README.md`  
**Location:** line(s) 60  
**Category:** Docs  
**Confidence:** [VERIFIED]  
**Issue:** The README advertises a “log viewer,” but the Diagnostics UI only exposes copy diagnostics and open logs folder actions.  
**Evidence:**
```md
| 📊 | **Diagnostics** | Transport mode, runtime info, rate-limit headers, and log viewer |
```

**Fix:** Update the row to describe the implemented behavior exactly.  
**Before:**
```md
| 📊 | **Diagnostics** | Transport mode, runtime info, rate-limit headers, and log viewer |
```

**After:**
```md
| 📊 | **Diagnostics** | Transport mode, runtime info, rate-limit headers, sanitized diagnostics export, and a desktop-only “Open logs folder” action |
```

**Acceptance Test:** Compare the README row against `src/modules/DiagnosticsModule.tsx` and verify the feature list matches the UI.

### [DOC] Task #4: Stop overstating API-key isolation for the Jina path in web mode

**ID:** DOC-004  
**File:** `README.md`, `docs/RESEARCH_PROVIDERS.md`, `docs/legal/PRIVACY.md`  
**Location:** line(s) `README.md` 201, 208; `docs/RESEARCH_PROVIDERS.md` 44; `docs/legal/PRIVACY.md` 8–11  
**Category:** Docs  
**Confidence:** [VERIFIED]  
**Issue:** The docs say the renderer cannot access raw keys and that API keys are never stored locally in web mode, but the codebase also documents and supports a dev-only browser `localStorage` Jina key path in web mode. The current wording is too absolute.  
**Evidence:**
```md
**Web Mode Only:** API keys are never stored locally; they live in `.env` on the server and are not accessible to the renderer.
```

```md
1. **Renderer never sees raw API keys.** The Jina key is stored via Electron `safeStorage` in the main process (same policy as the Venice key). The renderer only knows whether a key is configured, not its value.
```

```md
- **Desktop Mode (Production):** Both the Venice API key and the optional Jina API key are encrypted at rest using OS-level secure storage (DPAPI on Windows, Keychain on macOS). They are **never** exposed to the application renderer, the React frontend, or any third-party tracking scripts.
- **Web Mode (Development):** The API key is held securely in the Node.js Express server (`.env`) and is never sent to the browser.
```

**Fix:** Qualify the claims explicitly: Venice key stays server-side in web mode, but the optional Jina web-mode override is development-only, manual, and not secure storage. Keep the stronger statement for desktop mode only.  
**Before:**
```md
**Web Mode Only:** API keys are never stored locally; they live in `.env` on the server and are not accessible to the renderer.
```

**After:**
```md
**Web Mode (Venice key):** The Venice API key lives in the Express server `.env` and is not exposed to the browser.  
**Desktop Mode (Venice and Jina keys):** Both keys are stored via OS secure storage and are not exposed to the renderer.  
**Web Mode (optional Jina override):** Development-only browser `localStorage` overrides may be used for low-volume Jina testing, but this is not secure storage and should not be documented as equivalent to desktop key isolation.
```

**Acceptance Test:** Search the repo for absolute claims about renderer-inaccessible keys and web-mode local storage. Verify every public-facing statement is now scoped correctly.

### [DOC] Task #5: Correct macOS signing documentation to match the actual builder configuration

**ID:** DOC-005  
**File:** `docs/RELEASE/release.md`, `docs/RELEASE/signing-and-notarization.md`  
**Location:** line(s) `release.md` 62–64; `signing-and-notarization.md` 5, 21  
**Category:** Docs  
**Confidence:** [VERIFIED]  
**Issue:** The release docs say local macOS builds are ad-hoc signed, but `electron-builder.config.cjs` explicitly sets `identity: null` when signing credentials are absent, which produces unsigned local builds.  
**Evidence:**
```md
### macOS
Local builds are ad-hoc signed. To distribute, you must configure macOS code signing...
```

```md
> **Note**: Local builds executed via `npm run dist:win` or `npm run dist:mac` are unsigned by default.
...
`hardenedRuntime: true` is enabled in `electron-builder.config.cjs` only when signing credentials are configured...
```

**Fix:** Make both docs consistently say local macOS builds are unsigned unless signing credentials are supplied. Do not describe them as ad-hoc signed.  
**Before:**
```md
Local builds are ad-hoc signed.
```

**After:**
```md
Local macOS builds are unsigned unless valid signing credentials are supplied. Unsigned local builds will trigger Gatekeeper warnings and are not notarized.
```

**Acceptance Test:** Compare the updated docs with `electron-builder.config.cjs` and confirm there is no remaining claim that local macOS builds are ad-hoc signed.

## Missing Documentation

### [GAP] Task #1: Add a root-level privacy stub because the repository already links to it

**ID:** GAP-001  
**File:** `PRIVACY.md`  
**Location:** N/A  
**Category:** Docs  
**Confidence:** [VERIFIED]  
**Issue:** Multiple README links point to a root-level `PRIVACY.md`, but the file does not exist. This causes broken navigation for users and downstream tooling that expect a conventional top-level privacy document.  
**Fix:** Create a root `PRIVACY.md` stub that points to the canonical privacy policy under `docs/legal/PRIVACY.md`.  
**Required Content:**
```md
# Privacy

Canonical privacy and security model: [docs/legal/PRIVACY.md](docs/legal/PRIVACY.md)

This top-level file exists because public repo entry points and external links often expect a root-level privacy document.
Use the document in `docs/legal/PRIVACY.md` as the source of truth.
```

**Acceptance Test:** Confirm `PRIVACY.md` exists at the repository root and that all root-level privacy links resolve without 404-style failures.

### [GAP] Task #2: Add a root-level support stub because the repository already links to it

**ID:** GAP-002  
**File:** `SUPPORT.md`  
**Location:** N/A  
**Category:** Docs  
**Confidence:** [VERIFIED]  
**Issue:** The README and `docs/REPOSITORY_TREE.md` reference a root `SUPPORT.md`, but only `docs/SUPPORT.md` exists.  
**Fix:** Create a root `SUPPORT.md` stub that points to the canonical support document under `docs/SUPPORT.md`.  
**Required Content:**
```md
# Support

Canonical support guide: [docs/SUPPORT.md](docs/SUPPORT.md)

This top-level file exists to preserve stable repository links from the README, repository tree, and external tooling.
Use `docs/SUPPORT.md` as the source of truth.
```

**Acceptance Test:** Confirm `SUPPORT.md` exists at the repository root and all root-level support links now resolve correctly.

## UI Issues

### [UI] Task #1: Make the gallery modal and per-item actions media-type aware for video records

**ID:** UI-001  
**File:** `src/components/ImageActionModal.tsx`, `src/modules/GalleryModule.tsx`  
**Location:** line(s) `ImageActionModal.tsx` 50–77, 121–130; `GalleryModule.tsx` 307–313  
**Category:** UI  
**Confidence:** [VERIFIED]  
**Issue:** The expanded media modal always renders an `<img>` and an “Image details” title, and the gallery still surfaces image-only upscale affordances for video records.  
**Evidence:**
```tsx
const promptText = image.prompt?.trim() || "Generated image";
const truncatedAlt =
  promptText.length > 120 ? promptText.slice(0, 117) + "…" : promptText;

<div className="flex flex-1 items-center justify-center overflow-hidden bg-surface/60 md:max-w-[55%]">
  <img src={image.image} alt={truncatedAlt} className="max-h-[60vh] w-full object-contain md:max-h-full" />
</div>

<h2 id="modal-title" className="text-lg font-display font-semibold text-text-primary">Image details</h2>
```

```tsx
<button className="btn sm" onClick={() => upscale(item)} disabled={upscalingId === item.id || item.image?.startsWith("http") || item.upscaled}>
  {upscalingId === item.id ? "Enhancing…" : "Enhance"}
</button>
```

**Fix:** Branch on `image.mediaType`. Render a `<video controls>` player for video records, use `image.downloadUrl || image.image` as the source, change labels to “Video details” where appropriate, and hide or disable image-upscale controls for video items unless a real video-upscale flow is implemented.  
**Before:**
```tsx
<img src={image.image} alt={truncatedAlt} className="max-h-[60vh] w-full object-contain md:max-h-full" />
<h2 id="modal-title" className="text-lg font-display font-semibold text-text-primary">Image details</h2>
```

**After:**
```tsx
const isVideo = image.mediaType === "video";
const mediaSrc = image.downloadUrl || image.image;

{isVideo ? (
  <video
    src={mediaSrc}
    className="max-h-[60vh] w-full object-contain md:max-h-full"
    controls
    playsInline
  />
) : (
  <img
    src={mediaSrc}
    alt={truncatedAlt}
    className="max-h-[60vh] w-full object-contain md:max-h-full"
  />
)}

<h2 id="modal-title" className="text-lg font-display font-semibold text-text-primary">
  {isVideo ? "Video details" : "Image details"}
</h2>
```

**Acceptance Test:** Save a video to the library, open its details modal, verify it plays inside the modal, and confirm there is no image-upscale action shown for that record.

## Quick Wins

List only tasks with effort under 30 minutes and meaningful impact.

* [ ] `BUG-005` — One-line policy alignment for research links removes a desktop-only broken-link class.
* [ ] `BUG-007` — Media-aware gallery copy fixes visible polish issues immediately.
* [ ] `DOC-001` — README allowlist wording can be corrected quickly without code changes.
* [ ] `DOC-002` — README privacy/support links are broken and easy to fix.
* [ ] `DOC-003` — Removing the unsupported “log viewer” claim is a fast accuracy fix.
* [ ] `DOC-005` — macOS signing wording only needs documentation edits.
* [ ] `GAP-001` — Root `PRIVACY.md` shim is a small file with immediate link value.
* [ ] `GAP-002` — Root `SUPPORT.md` shim is a small file with immediate link value.

## Required Validation After All Fixes

The downstream coding agent must run:

```bash
npm ci
npm run typecheck
npm run lint:eslint
npm test
npm run build
```

If package scripts expose release verification, also run:

```bash
npm run verify:dist
```

If any command fails, add a new TODO entry rather than hiding the failure.

## Working Notes

### Task Checklist

```md
- [ ] BUG-001: Stop persisting edited and upscaled images as transient blob URLs
- [ ] BUG-002: Persist completed videos with durable sources and the real queued download URL
- [ ] BUG-003: Publish and verify Electron updater metadata in release automation
- [ ] BUG-004: Make gallery downloads and filenames media-type aware instead of hardcoding PNG/image behavior
- [ ] BUG-005: Align search-result link rendering with Electron’s HTTPS-only external-link policy
- [ ] BUG-006: Add regression coverage for video-library behavior and media-aware filenames
- [ ] BUG-007: Replace image-only copy strings in the gallery with media-aware text
- [ ] DOC-001: Fix the README’s stale endpoint-allowlist count
- [ ] DOC-002: Fix README links that point to missing root-level privacy and support documents
- [ ] DOC-003: Remove the unsupported “log viewer” claim from README diagnostics documentation
- [ ] DOC-004: Stop overstating API-key isolation for the Jina path in web mode
- [ ] DOC-005: Correct macOS signing documentation to match the actual builder configuration
- [ ] GAP-001: Add a root-level privacy stub because the repository already links to it
- [ ] GAP-002: Add a root-level support stub because the repository already links to it
- [ ] UI-001: Make the gallery modal and per-item actions media-type aware for video records
```

### Files Not Scanned

```md
- `assets/**` — branding assets only; not line-audited
- `public/**` — static assets only; not line-audited
- `docs/design/**` — design reference docs not prioritized for defect hunting
- `docs/Venice_swagger_api.yaml` — external API spec file not line-audited
- `node_modules/**` — vendored dependencies not audited
- Untargeted `*.test.ts[x]` files outside the paths cited above — only high-risk and directly relevant tests were inspected
```

### Files Referenced But Not Provided

```md
- None
```

### Open Questions

```md
- (?) BUG-002 implementation detail: if Venice sometimes completes video jobs without a durable `download_url`, choose and document one durable fallback for blob-only persistence (serialized Blob in IndexedDB versus file-backed storage under app data).
- (?) BUG-003 severity remains high even if maintainers manually upload updater manifests outside GitHub Actions, but I did not verify any already-published GitHub Release asset sets from this local archive.
- (?) Runtime validation commands were not completed because `npm ci` timed out in the container. Any additional build/runtime failures discovered after dependency installation should be added as new TODO items rather than folded into the tasks above.
```