/** @fileoverview Phase 2B Media Studio "Send to" routing.
 *
 * Pure orchestration layer that wires a selected MediaItem to its
 * target studio through the canonical, existing transports:
 *
 *   - Send to Image Studio: reuses the existing handoffToImageStudio
 *     helper in gallery-view (it sanitises the recipe and routes via
 *     `useImageWorkspaceStore.enqueueGenerate`).
 *   - Send to Image Tools (edit): reuses the image-workspace tools
 *     handoff; no new payload shape.
 *   - Send to Chat: creates a new conversation via the chat store and
 *     copies the prompt into a one-shot message. The prompt text is
 *     placed on the clipboard and the new conversation is activated
 *     so the user can review + send manually — auto-send is a
 *     deliberate non-goal for Phase 2B (it would require a new
 *     dependency on the chat store's send flow that lives in
 *     chat-view).
 *   - Send to Video Studio: routes to the canonical 'video' tab via
 *     `useSettingsStore.setActiveTab`. The chat prompt is copied to
 *     the clipboard. No payload is staged because the Video Studio
 *     has its own model / form surface.
 *   - Copy prompt / negative / seed / model: thin clipboard wrappers
 *     that no-op when the field is missing.
 *
 * Safety:
 *   - No filesystem, no shell, no IPC bridges — all routing is through
 *     the canonical Zustand stores and the existing image-workspace
 *     handoff queue.
 *   - Secrets (api keys, bearers) are never read or written; only
 *     prompt / negative / seed / model fields are touched.
 *   - Handoffs use the same model id the user is working with
 *     (`item.model`) and never the persisted `safeMode` / `disableWatermark`
 *     from the source record — the target studio re-derives those
 *     from its own settings.
 */

import type { MediaItem } from "../types/media";
import { extractGenerationRecipe, sanitizeRecipeForModel } from "../types/project";
import { getImageModelCapabilities } from "../config/image-model-capabilities";
import { useImageWorkspaceStore } from "./image-workspace-store";
import { useSettingsStore } from "./settings-store";
import { useChatStore } from "./chat-store";
import { DEFAULT_CHAT_MODEL } from "../constants/venice";
import type { TabId } from "../config/tabs";
import { isTabId } from "../config/tabs";

export type SendDestination = "image" | "image-tools" | "chat" | "video";

/** Result of a send-to action. `ok: false` is reserved for actual
 *  failures (no recipe, missing model id); routing no-ops (already on
 *  the destination tab) return `ok: true` with `noop: true`. */
export interface SendToResult {
  destination: SendDestination;
  ok: boolean;
  noop?: boolean;
  reason?: string;
  /** When the destination created a new handoff / conversation, the
   *  id of the new artefact (image-workspace handoff id, chat id). */
  artifactId?: string;
}

/** Copy text to the clipboard when `navigator.clipboard` is available.
 *  Returns true on success. Falls back to a hidden textarea + execCommand
 *  for non-secure contexts / older Electron preload configurations. */
export async function copyText(text: string): Promise<boolean> {
  const value = typeof text === "string" ? text : "";
  if (!value) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // fall through to legacy path
    }
  }
  if (typeof document === "undefined") return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Copy the prompt to the clipboard. Returns false if the prompt is
 *  empty / missing. */
export async function copyPrompt(item: MediaItem): Promise<boolean> {
  if (!item || typeof item.prompt !== "string" || item.prompt.length === 0) {
    return false;
  }
  return copyText(item.prompt);
}

/** Copy the negative prompt to the clipboard. Returns false if the
 *  item has no negative prompt. */
export async function copyNegativePrompt(item: MediaItem): Promise<boolean> {
  if (!item?.negative || item.negative.length === 0) return false;
  return copyText(item.negative);
}

/** Copy the model id to the clipboard. */
export async function copyModelId(item: MediaItem): Promise<boolean> {
  if (!item?.model) return false;
  return copyText(item.model);
}

/** Copy the seed to the clipboard as a base-10 string. Returns false
 *  when the seed is missing or not an integer. */
export async function copySeed(item: MediaItem): Promise<boolean> {
  if (typeof item?.seed !== "number" || !Number.isInteger(item.seed)) return false;
  return copyText(String(item.seed));
}

/** Send to Image Studio. Sanitises the recipe for the source model
 *  (Phase 2A contract) and enqueues a "use" handoff so the user lands
 *  on the Image Studio tab with the same prompt / dimensions loaded.
 *  Auto-generation is OFF so the user can review + tweak before
 *  generating. */
export function sendToImageStudio(item: MediaItem): SendToResult {
  if (!item) return { destination: "image", ok: false, reason: "No item" };
  const extracted = extractGenerationRecipe(item);
  if (!extracted) {
    return { destination: "image", ok: false, reason: "Item has no recipe" };
  }
  const sanitized = sanitizeRecipeForModel(
    extracted,
    getImageModelCapabilities(extracted.model),
  );
  const id = useImageWorkspaceStore.getState().enqueueGenerate({
    draft: {
      model: sanitized.model,
      prompt: sanitized.prompt,
      negativePrompt: sanitized.negativePrompt,
      style: sanitized.style,
      steps: sanitized.steps,
      cfgScale: sanitized.cfgScale,
      imageCount: sanitized.variants,
      width: sanitized.width,
      height: sanitized.height,
      aspectRatio: sanitized.aspectRatio,
      resolution: sanitized.resolution,
      quality: sanitized.quality,
      seed: sanitized.seed ?? null,
    },
    autoGenerate: false,
    parentId: sanitized.sourceMediaId ?? null,
    operation: "generate",
  });
  setActiveTabSafe("image");
  return { destination: "image", ok: true, artifactId: id };
}

/** Send to Image Tools (edit). Reuses the existing tools handoff so
 *  the image-tools surface receives the parent image + filename. */
export function sendToImageTools(item: MediaItem, tool: "edit" | "upscale" = "edit"): SendToResult {
  if (!item) return { destination: "image-tools", ok: false, reason: "No item" };
  const id = useImageWorkspaceStore.getState().enqueueTools({
    tool,
    parentId: item.id,
    image: item.image,
    prompt: item.prompt ?? "",
    filename: `${item.id}.${item.mediaType === "video" ? "mp4" : item.mediaType === "audio" ? "mp3" : "png"}`,
  });
  setActiveTabSafe("image");
  return { destination: "image-tools", ok: true, artifactId: id };
}

/** Send to Chat. Creates a new conversation via the chat store and
 *  copies the prompt to the clipboard. The user is taken to the
 *  Chat tab and the active conversation is the new one. Auto-send
 *  is intentionally NOT triggered so the user can review + edit
 *  the prompt before sending. */
export function sendToChat(item: MediaItem): SendToResult {
  if (!item) return { destination: "chat", ok: false, reason: "No item" };
  if (!item.prompt || item.prompt.length === 0) {
    return { destination: "chat", ok: false, reason: "Item has no prompt" };
  }
  const modelId = useSettingsStore.getState().selectedModels?.chat || item.model || DEFAULT_CHAT_MODEL;
  const chatId = useChatStore.getState().createConversation(modelId);
  setActiveTabSafe("chat");
  // Best-effort: copy the prompt so the user can paste it into the
  // composer. We do not await — the chat-view reads the conversation's
  // current state when the user clicks "send".
  void copyText(item.prompt);
  return { destination: "chat", ok: true, artifactId: chatId };
}

/** Send to Video Studio. Routes to the video tab; copies the prompt
 *  so the user can paste it into the video model form. No payload is
 *  staged because the video studio has its own form surface. */
export function sendToVideo(item: MediaItem): SendToResult {
  if (!item) return { destination: "video", ok: false, reason: "No item" };
  setActiveTabSafe("video");
  if (item.prompt) void copyText(item.prompt);
  return { destination: "video", ok: true };
}

/** Available destinations for a given item, given the live capability
 *  contract. The Inspector / Command Palette can use this to hide
 *  actions that are not appropriate for the current selection. */
export function availableDestinations(item: MediaItem | null | undefined): SendDestination[] {
  if (!item) return [];
  const out: SendDestination[] = ["image", "chat", "video"];
  // Image Tools edit is only available for image items.
  if (item.mediaType !== "video") out.push("image-tools");
  return out;
}

function setActiveTabSafe(tab: string): void {
  if (!isTabId(tab)) return;
  useSettingsStore.getState().setActiveTab(tab as TabId);
}
