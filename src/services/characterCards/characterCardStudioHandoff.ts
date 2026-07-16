import { generateId } from "../rp/characterCardService";
import { useCharacterCardStore } from "../../stores/character-card-store";
import { saveCharacterCardDraft } from "./characterCardDraftService";

export async function createBlankCharacterCardDraft(metadata?: Record<string, unknown>): Promise<string> {
  const now = Date.now();
  const id = generateId();
  await saveCharacterCardDraft({
    schema: "CharacterCardV1",
    id,
    name: "Untitled",
    description: "",
    systemPrompt: "",
    tags: [],
    adult: false,
    exampleDialogues: [],
    ...(metadata ? { metadata } : {}),
    createdAt: now,
    updatedAt: now,
  });
  useCharacterCardStore.getState().setEditing(id);
  return id;
}

export async function createCharacterCardDraftFromMedia(mediaId: string): Promise<string> {
  if (!mediaId.trim()) throw new Error("A durable media asset ID is required.");
  return createBlankCharacterCardDraft({ sourceMediaId: mediaId, studioSource: "media" });
}
