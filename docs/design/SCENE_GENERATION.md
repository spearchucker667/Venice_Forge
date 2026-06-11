# Scene Generation

> Scene generation turns the current RP chat into a **single illustrative image**. It conditionally runs Family Safe Mode, calls `/image/generate`, and registers the result as a `RpAssetV1` linked to the chat and message. Adult Mode skips the local filter; Venice API Safe Mode remains separate.

## Flow

```
User clicks "Generate scene" in RpChatView
        │
        ▼
sceneGenerationService.generateScene(chat, req)
        │
        ├─ 1. Extract prompt:
        │     extractScenePrompt(chat, opts)
        │     ↳ returns a self-contained image prompt string
        │
        ├─ 2. Family Safe Mode pipeline:
        │     assessScenePrompt(prompt, negativePrompt, localFamilySafeModeEnabled)
        │     ↳ evaluates local rules when enabled; skips them entirely in Adult Mode
        │
        ├─ 3. Dispatch to Venice /image/generate
        │     Electron: bridge.venice.request({ endpoint, method: 'POST', body: payload })
        │     Web:      fetch('/api/venice/image/generate', { method: 'POST', body: ... })
        │     (Both paths route the same persisted Family Safe Mode state through transport.)
        │
        └─ 4. Register the asset:
              assetService.saveAsset({ chatId, messageId?, characterIds, prompt, model, seed, ... })
              ↳ metadata is persisted; image bytes are routed via the existing
                `app:saveRoutedImage` IPC to
                <Pictures>/Venice Forge/RP/<chatId>/<timestamp>-<seed>.png
```

## Prompt extraction heuristic

`extractScenePrompt(chat, opts)` produces a single image prompt by:

1. Picking the most recent non-system message in the chat (or a user override if `opts.override` is set)
2. Joining the active character names and the chat's `scenario` (if any) as a prefix
3. Trimming to a 2 000-character budget
4. Returning `{ prompt, usedMessageId, usedCharacterIds, source }`

This is intentionally **simple and deterministic**. There is no ML-based "best frame" detection; the user can always override the extracted prompt in the Scene Generator panel.

## Safety

Scene generation is gated by the existing CSAM guard at **two** layers:

1. **Service layer (mandatory):** `assessScenePrompt(prompt, negative)` runs before the HTTP call. The user-facing `SceneGenerator` UI shows the safety verdict and disables the "Generate" button if the verdict is blocking.
2. **Transport layer (defense-in-depth):** both `bridge.venice.request` (Electron) and `fetch('/api/venice/image/generate')` (web) re-run the guard at the IPC / proxy boundary via `extractPromptLikeFields`. A scene prompt that slips through the service layer (e.g. by a renderer bug) is still blocked before bytes leave the process.

## Asset model

`RpAssetV1`:

```ts
{
  schema: "RpAssetV1",
  id: string;              // generated, satisfies VALID_ID_RE
  chatId: string;          // parent chat
  messageId?: string;      // optional — which message triggered the scene
  characterIds: string[];  // characters "in frame"
  prompt: string;          // the image prompt (for re-generation, never logged at info level)
  negativePrompt?: string;
  model: string;           // image model id (e.g. 'flux-dev')
  seed?: number;
  imageRef: string;        // absolute path to routed image (Electron) or blob URL (web)
  imageBytes?: number;     // file size, optional
  width?: number;
  height?: number;
  createdAt: number;
}
```

In Electron mode, `imageRef` is an absolute filesystem path under `app.getPath("pictures")/Venice Forge/RP/<chatId>/`. The renderer does not embed the image in the asset record — it only stores the reference. In web mode, `imageRef` is a data URL or a blob URL managed by the asset service.

## `SceneGenerator` UI

The Scene Generator panel is the user-facing tool inside RP Studio. It shows:

- A **chat selector** (which chat to source the scene from)
- An **image model** selector (defaults to `flux-dev`; uses `FALLBACK_MODELS.image`)
- The **extracted prompt preview** (read-only TextArea showing what `extractScenePrompt` produced)
- An **optional override** TextArea (replaces the extracted prompt)
- **Negative prompt** TextArea
- **Seed** input (optional, for reproducibility)
- A **Generate** button (disabled if the safety verdict is blocking)
- A right-side **scene rail** with the 24 most recent assets for the selected chat, each clickable to preview

## `AssetGallery` UI

The Asset Gallery is a separate sub-tab. It shows **all** scene assets across all chats, with a chat-filter pill group at the top. Click an asset to preview the full-size image on the right; click "Delete" to remove (with confirmation).

## Limits

- `MAX_AVATAR_BYTES` = 1 048 576 (1 MiB) — also used as the cap for generated scene images routed to disk
- Asset `prompt` is capped at 4 000 chars by `normalizeAsset`
- 24 most recent assets shown in the Scene Generator rail (UI cap, not a service cap)

## See also

- [CHARACTER_RP.md](./CHARACTER_RP.md) — full RP studio overview
- [SECURITY.md](../SECURITY.md) — safety guard contract
- `src/services/rp/sceneGenerationService.ts` — extractor and dispatcher
- `src/services/rp/assetService.ts` — CRUD for `RpAssetV1`
- `src/shared/safety/characterImportSafety.ts` — `assessScenePrompt` wrapper
- `tests/safety/characterImportSafety.test.ts` — wrapper tests
