/**
 * @fileoverview Phase 2F — RP cross-feature helper service.
 *
 * Thin orchestration layer that wires together the existing stores
 * (Character Card, Persona, Lorebook, Prompt Library, Scene Composer,
 * Media Store, Project Store, RP Chat) so the UI can perform common
 * cross-feature handoffs with a single call.
 *
 * All helpers are *non-mutating* on their inputs and always route
 * through the canonical safety guards at the service boundary
 * (`saveCharacterCard`, `savePersona`, etc.) — secrets are redacted
 * via the existing sanitiser helpers.
 */

import { useCharacterCardStore } from "../stores/character-card-store";
import { usePersonaStore } from "../stores/persona-store";
import { useLorebookStore } from "../stores/lorebook-store";
import { usePromptLibraryStore } from "../stores/prompt-library-store";
import { useRpChatStore } from "../stores/rp-chat-store";
import { useSettingsStore } from "../stores/settings-store";
import { useChatStore } from "../stores/chat-store";
import { isPromptSecretLike, redactPromptSecrets } from "../types/prompt-library";
import type { CharacterCardV1, ScenarioV1, UserPersonaV1, LorebookV1 } from "../types/rp";
import { CARD_FIELD_MAX, MAX_AVATAR_BYTES, MAX_TAGS } from "../types/rp";
import { FALLBACK_MODELS } from "../constants/venice";

/** Minimal media item shape consumed by `createCharacterFromMedia`. */
export interface MediaImageLike {
  id?: string;
  /** Image source, data URL or remote URL. */
  image: string;
  /** Prompt used to generate, if known. */
  prompt?: string;
  /** Negative prompt, if known. */
  negativePrompt?: string;
  /** Generation seed, if known. */
  seed?: number;
  /** Model used, if known. */
  model?: string;
}

function safeShort(input: string, max: number): string {
  if (!input) return "";
  const trimmed = input.trim();
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function safeStringField(input: string | undefined, max: number): string {
  if (!input) return "";
  if (isPromptSecretLike(input)) return "";
  return redactPromptSecrets(safeShort(input, max));
}

function mimeToType(mime: string): "image/png" | "image/jpeg" | "image/webp" | null {
  if (mime === "image/png") return "image/png";
  if (mime === "image/jpeg" || mime === "image/jpg") return "image/jpeg";
  if (mime === "image/webp") return "image/webp";
  return null;
}

function parseDataUrl(dataUrl: string): { mime: string; bytes: number; data: string } | null {
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const b64 = match[2];
  // Approximate byte length (b64 is 4 chars per 3 bytes).
  const bytes = Math.floor((b64.length * 3) / 4);
  return { mime, bytes, data: b64 };
}

const SVG_DATA_URL = /^data:image\/svg\+xml/i;

/** Build a blank `CharacterCardV1` with sensible defaults and a freshly
 *  generated id. The new card is **not** persisted — call
 *  `useCharacterCardStore.upsert` to save. */
export function blankCharacterCard(): CharacterCardV1 {
  const now = Date.now();
  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `c_${now.toString(36)}_${Math.floor(Math.random() * 1e9).toString(36)}`;
  return {
    schema: "CharacterCardV1",
    id,
    name: "Untitled character",
    description: "",
    systemPrompt: "",
    tags: [],
    adult: false,
    exampleDialogues: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Create a new character card derived from a media item. The avatar
 *  is taken from the media image (data URL only). Returns the new
 *  card id, or null if the media image could not be coerced into a
 *  valid avatar. */
export async function createCharacterFromMedia(media: MediaImageLike | null | undefined): Promise<string | null> {
  if (!media || typeof media.image !== "string" || media.image.length === 0) {
    return null;
  }
  // SVG avatars are not allowed (the existing avatar contract is
  // png/jpeg/webp only). Refuse silently.
  if (SVG_DATA_URL.test(media.image)) return null;
  const parsed = parseDataUrl(media.image);
  if (!parsed) return null;
  const mime = mimeToType(parsed.mime);
  if (!mime) return null;
  if (parsed.bytes > MAX_AVATAR_BYTES) return null;
  const card = blankCharacterCard();
  card.avatar = { data: parsed.data, mimeType: mime, byteLength: parsed.bytes };
  card.name = safeStringField(media.prompt?.split(/[.\n]/)[0]?.trim() ?? "", 200) || card.name;
  card.description = safeStringField(media.prompt, CARD_FIELD_MAX);
  card.systemPrompt = `Describe ${card.name}. Stay in character.`;
  const metadata: Record<string, unknown> = { source: "media" };
  if (media.id) metadata.sourceMediaId = String(media.id).slice(0, 200);
  if (media.model) metadata.sourceModel = String(media.model).slice(0, 200);
  if (typeof media.seed === "number") metadata.sourceSeed = media.seed;
  card.metadata = metadata;
  const saved = await useCharacterCardStore.getState().upsert(card);
  return saved?.id ?? null;
}

/** Create a new character card linked to a scene-composer scene. The
 *  `metadata.sceneId` and `metadata.attachedSceneId` keys are set so
 *  downstream consumers can resolve the lineage. Returns the new id. */
export async function createCharacterFromScene(scene: ScenarioV1 | { id: string; name: string; content: string; description?: string }): Promise<string | null> {
  if (!scene || typeof scene.id !== "string") return null;
  const card = blankCharacterCard();
  card.name = safeStringField(scene.name, 200) || card.name;
  card.description = safeStringField(scene.description ?? "", CARD_FIELD_MAX);
  card.systemPrompt = safeStringField(scene.content, CARD_FIELD_MAX);
  card.scenario = safeStringField(scene.content, CARD_FIELD_MAX);
  card.metadata = { source: "scene", sourceSceneId: scene.id, attachedSceneId: scene.id };
  const saved = await useCharacterCardStore.getState().upsert(card);
  return saved?.id ?? null;
}

/** Attach a scene id to an existing character card. Stores the id in
 *  `metadata.attachedSceneId` (and the legacy `metadata.sceneId` for
 *  back-compat with code that read it before the renames). */
export async function attachSceneToCharacter(characterId: string, sceneId: string): Promise<CharacterCardV1 | null> {
  const store = useCharacterCardStore.getState();
  const card = store.getById(characterId);
  if (!card) return null;
  const next: CharacterCardV1 = {
    ...card,
    updatedAt: Date.now(),
    metadata: { ...(card.metadata ?? {}), attachedSceneId: sceneId, sceneId },
  };
  const saved = await store.upsert(next);
  return saved;
}

/** Attach a prompt-library item id to a character card. */
export async function attachPromptToCharacter(characterId: string, promptId: string): Promise<CharacterCardV1 | null> {
  const store = useCharacterCardStore.getState();
  const card = store.getById(characterId);
  if (!card) return null;
  const next: CharacterCardV1 = {
    ...card,
    updatedAt: Date.now(),
    metadata: { ...(card.metadata ?? {}), attachedPromptId: promptId },
  };
  const saved = await store.upsert(next);
  return saved;
}

/** Persist a character card's system prompt to the Prompt Library.
 *  Returns the new prompt id, or null on failure. */
export async function saveCharacterPromptToLibrary(characterId: string): Promise<string | null> {
  const card = useCharacterCardStore.getState().getById(characterId);
  if (!card) return null;
  const content = (card.systemPrompt ?? "").trim();
  if (!content) return null;
  const projectId = useSettingsStore.getState().activeProjectId ?? null;
  try {
    const created = await usePromptLibraryStore.getState().createPrompt({
      title: `${card.name} — system prompt`,
      kind: "character",
      content,
      scope: projectId ? "project" : "global",
      projectId,
      description: `Saved from character card "${card.name}" on ${new Date().toISOString()}.`,
      tags: ["character", ...(card.tags ?? []).slice(0, MAX_TAGS - 1)],
      modelHints: card.modelId ? [card.modelId] : undefined,
      source: { type: "manual", sourceId: card.id },
    });
    return created.id;
  } catch {
    return null;
  }
}

/** Create a new RP chat seeded with the given character. The chat is
 *  routed to the rp-studio tab; the caller can re-fetch the chat
 *  via `useRpChatStore.getById`. Returns the new chat id or null. */
export async function startChatForCharacter(characterId: string, opts?: { title?: string; modelId?: string }): Promise<string | null> {
  const card = useCharacterCardStore.getState().getById(characterId);
  if (!card) return null;
  const settings = useSettingsStore.getState();
  const fallbackTextId = FALLBACK_MODELS.text[0]?.id ?? "venice-uncensored";
  const modelId =
    opts?.modelId ??
    card.modelId ??
    settings.selectedModels["chat"] ??
    fallbackTextId;
  const personaId = usePersonaStore.getState().activePersonaId;
  const lorebookIds = useLorebookStore
    .getState()
    .lorebooks
    .filter((lb: LorebookV1) => {
      if (lb.scope === "character") return lb.characterId === card.id;
      if (lb.scope === "project") return lb.projectId != null && lb.projectId === settings.activeProjectId;
      return true;
    })
    .map((lb) => lb.id);
  const chatId = await useRpChatStore.getState().createChat({
    title: opts?.title ?? `Chat with ${card.name}`,
    characterIds: [card.id],
    personaId,
    lorebookIds,
    modelId,
    scenario: card.scenario,
    adult: card.adult === true,
  });
  if (chatId) {
    useRpChatStore.getState().setActive(chatId);
    settings.setActiveTab("rp-studio");
  }
  return chatId;
}

/** Create a character chat seeded with the given local character.
 *  The character's system prompt is persisted as the conversation system
 *  prompt and the chat is opened in the Character Chats workspace. Returns the
 *  new conversation id or null. */
export async function startNormalChatForCharacter(characterId: string, opts?: { modelId?: string }): Promise<string | null> {
  const card = useCharacterCardStore.getState().getById(characterId);
  if (!card) return null;
  const settings = useSettingsStore.getState();
  const fallbackTextId = FALLBACK_MODELS.text[0]?.id ?? "venice-uncensored";
  const modelId =
    opts?.modelId ??
    card.modelId ??
    settings.selectedModels["chat"] ??
    fallbackTextId;
  const convId = useChatStore.getState().createLocalCharacterConversation(card, modelId);
  if (convId) {
    settings.setActiveTab("character-chats");
  }
  return convId;
}

/** Bulk update of multiple characters. Convenience for "Apply tag to
 *  selected characters" or similar — uses the same upsert path as the
 *  library list. Returns the number of successful updates. */
export async function bulkPatchCharacters(
  ids: readonly string[],
  patch: (card: CharacterCardV1) => CharacterCardV1,
): Promise<number> {
  const store = useCharacterCardStore.getState();
  let count = 0;
  for (const id of ids) {
    const card = store.getById(id);
    if (!card) continue;
    const next = patch(card);
    const saved = await store.upsert(next);
    if (saved) count++;
  }
  return count;
}

/** Re-export useful types for consumers. */
export type { CharacterCardV1, UserPersonaV1, LorebookV1, ScenarioV1 };
