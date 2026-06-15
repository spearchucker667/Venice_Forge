/**
 * @fileoverview Scene generation service.
 *
 * Extracts a self-contained image prompt from an RP chat's recent messages,
 * runs the safety guard, dispatches the existing `/image/generate` endpoint
 * through the canonical Venice client, and registers the resulting asset in
 * the `rp_assets` store.
 *
 * Safety:
 *   - `assessScenePrompt` is the first step. The guard is gated by
 *     `useSettingsStore.getState().localFamilySafeModeEnabled` — when Local
 *     Family Safe Mode is OFF (Adult Mode) the rule engine is bypassed; when
 *     ON a block prevents the call from reaching Venice and prevents the
 *     asset from being registered.
 *   - Raw prompt text is NEVER logged. Errors return safe user-facing strings.
 *
 * Transport:
 *   - All Venice calls route through `veniceFetch()` in
 *     `src/services/veniceClient.ts`, which handles both Electron IPC and
 *     web-mode proxy automatically. Do not call `fetch('/api/venice/...')`
 *     directly.
 */

import { assessScenePrompt } from "../../shared/safety/characterImportSafety";
import { applyVeniceApiSafeMode } from "../../shared/veniceSafeMode";
import type {
  RpChatV1,
  RpMessageV1,
  RpAssetV1,
  SceneGenerationOutcome,
  SceneGenerationRequest,
} from "../../types/rp";
import { isElectron } from "../desktopBridge";
import { veniceFetch } from "../veniceClient";
import { readCharacterCard } from "./characterCardService";
import { saveAsset } from "./assetService";
import {
  getEffectiveRendererLocalFamilySafeModeEnabled,
  getEffectiveRendererVeniceApiSafeMode,
} from "../../safetyHydration";
import { error as logError } from "../../shared/logger";

const RECENT_WINDOW = 8;
/** Default model when none is supplied. */
const DEFAULT_IMAGE_MODEL = "flux-dev";

/** Joins the most recent messages into a single text window for scene extraction. */
function _recentWindow(messages: ReadonlyArray<RpMessageV1>): string {
  const tail = messages.slice(-RECENT_WINDOW);
  return tail
    .map((m) => {
      const who =
        m.role === "character" ? `[${m.characterId ?? "character"}]` :
        m.role === "narrator" ? "[narrator]" :
        m.role === "user" ? "[user]" :
        m.role === "tool" ? "[tool]" :
        "[system]";
      return `${who} ${m.content}`;
    })
    .join("\n");
}

/** Builds a self-contained image prompt from a chat and recent messages.
 *  Heuristic: take the most recent non-system message's content, prefixed
 *  with the active character's description. The caller may override via
 *  `promptOverride`. */
export function extractScenePrompt(chat: RpChatV1, opts?: { promptOverride?: string }): string {
  if (opts?.promptOverride && opts.promptOverride.trim().length > 0) {
    return opts.promptOverride.trim();
  }
  const tail = chat.messages.slice(-RECENT_WINDOW);
  for (let i = tail.length - 1; i >= 0; i--) {
    const m = tail[i];
    if ((m.role === "character" || m.role === "narrator" || m.role === "user") && m.content.trim().length > 0) {
      return m.content.trim();
    }
  }
  return chat.title || "A scene.";
}

interface ImageGenerateResponse {
  images?: Array<{ url?: string; b64_json?: string }>;
  id?: string;
  seed?: number;
}

/** Generates a scene asset. Returns a discriminated outcome. */
export async function generateScene(
  chat: RpChatV1,
  req: SceneGenerationRequest,
): Promise<SceneGenerationOutcome> {
  const prompt = extractScenePrompt(chat, { promptOverride: req.promptOverride });
  const model = req.model ?? DEFAULT_IMAGE_MODEL;

  // 1. Local Family Safe Mode guard (skipped when Adult Mode is on).
  const localFamilySafeModeEnabled = getEffectiveRendererLocalFamilySafeModeEnabled();
  const veniceApiSafeMode = getEffectiveRendererVeniceApiSafeMode();
  const decision = assessScenePrompt(prompt, req.negativePrompt, localFamilySafeModeEnabled);
  if (!decision.allow) {
    return {
      ok: false,
      error: decision.userMessage,
      safetyBlocked: true,
    };
  }

  // 2. Resolve the first active character (if any) for attribution.
  const characterIds = chat.characterIds.slice(0, 1);
  const characterNames: string[] = [];
  for (const cid of characterIds) {
    const card = await readCharacterCard(cid);
    if (card) characterNames.push(card.name);
  }

  // 3. Dispatch to Venice via the canonical transport abstraction.
  if (!isElectron() && typeof fetch !== "function") {
    return { ok: false, error: "No transport available.", safetyBlocked: false };
  }

  const payload = applyVeniceApiSafeMode(
    "/image/generate",
    {
      model,
      prompt,
      ...(req.negativePrompt ? { negative_prompt: req.negativePrompt } : {}),
      ...(req.seed !== undefined ? { seed: req.seed } : {}),
      ...(req.width !== undefined ? { width: req.width } : {}),
      ...(req.height !== undefined ? { height: req.height } : {}),
      ...(req.steps !== undefined ? { steps: req.steps } : {}),
    },
    veniceApiSafeMode,
  );

  let response: ImageGenerateResponse;
  try {
    const { data } = await veniceFetch<ImageGenerateResponse>("/image/generate", {
      method: "POST",
      body: payload,
      timeoutMs: 120_000,
    });
    response = data;
  } catch (err) {
    logError("[sceneGenerationService] Image generation request failed", err instanceof Error ? err.message : err);
    return {
      ok: false,
      error: "Image generation failed. Please try again.",
      safetyBlocked: false,
    };
  }

  const firstImage = response.images?.[0];
  const url = firstImage?.url ?? (firstImage?.b64_json ? `data:image/png;base64,${firstImage.b64_json}` : "");
  if (!url) {
    return { ok: false, error: "Image generation returned no images.", safetyBlocked: false };
  }

  // 4. Register the asset.
  const now = Date.now();
  const seed = response.seed ?? req.seed;
  const asset: RpAssetV1 = {
    schema: "RpAssetV1",
    id: `a_${now.toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`,
    chatId: chat.id,
    ...(req.messageId ? { messageId: req.messageId } : {}),
    characterIds: characterNames.length > 0 ? characterNames : characterIds,
    model,
    prompt,
    ...(req.negativePrompt ? { negativePrompt: req.negativePrompt } : {}),
    ...(seed !== undefined ? { seed } : {}),
    url,
    createdAt: now,
  };
  try {
    const saved = await saveAsset(asset);
    return { ok: true, asset: saved };
  } catch (err) {
    logError("[sceneGenerationService] Asset persistence failed", err instanceof Error ? err.message : err);
    return {
      ok: false,
      error: "Failed to save scene asset. Please try again.",
      safetyBlocked: false,
    };
  }
}
