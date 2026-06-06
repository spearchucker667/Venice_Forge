/**
 * @fileoverview Scene generation service.
 *
 * Extracts a self-contained image prompt from an RP chat's recent messages,
 * runs the safety guard, dispatches the existing `/image/generate` endpoint,
 * and registers the resulting asset in the `rp_assets` store.
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
 *   - The scene service reuses the existing `desktopVenice.request`
 *     abstraction in Electron mode; in web mode it calls
 *     `fetch('/api/venice/image/generate')` through the Express proxy
 *     (which runs the safety guard a second time as defence in depth).
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
import { isElectron, desktopVenice } from "../desktopBridge";
import { readCharacterCard } from "./characterCardService";
import { saveAsset } from "./assetService";
import {
  getEffectiveRendererLocalFamilySafeModeEnabled,
  getEffectiveRendererVeniceApiSafeMode,
} from "../../safetyHydration";

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

  // 3. Dispatch to Venice via the existing transport abstraction.
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
    if (isElectron()) {
      const res = await desktopVenice.request({ endpoint: "/image/generate", method: "POST", body: payload });
      if (!res.ok) return { ok: false, error: `Image generation failed: HTTP ${res.status}`, safetyBlocked: false };
      response = res.body as ImageGenerateResponse;
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000); // 2 min cap for scene gen
      try {
        const res = await fetch("/api/venice/image/generate", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "X-Venice-Forge-Family-Safe-Mode": String(localFamilySafeModeEnabled),
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!res.ok) {
          return { ok: false, error: `Image generation failed: HTTP ${res.status}`, safetyBlocked: false };
        }
        response = (await res.json()) as ImageGenerateResponse;
      } finally {
        clearTimeout(timeout);
      }
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Image generation failed.",
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
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to register scene asset.",
      safetyBlocked: false,
    };
  }
}
