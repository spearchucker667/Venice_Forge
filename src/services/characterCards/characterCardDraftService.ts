import StorageService from "../storageService";
import type { CharacterCardV1 } from "../../types/rp";

export interface CharacterCardDraftRecord {
  id: string;
  cardId: string;
  card: CharacterCardV1;
  createdAt: number;
  updatedAt: number;
}

export async function saveCharacterCardDraft(card: CharacterCardV1): Promise<CharacterCardDraftRecord> {
  const existing = (await listCharacterCardDrafts()).find((draft) => draft.cardId === card.id);
  const now = Date.now();
  const record: CharacterCardDraftRecord = { id: existing?.id ?? `draft-${card.id}`, cardId: card.id, card: structuredClone(card), createdAt: existing?.createdAt ?? now, updatedAt: now };
  await StorageService.saveItem("characterCardDrafts", record as unknown as Record<string, unknown>, { origin: "migration" });
  return record;
}

export async function listCharacterCardDrafts(): Promise<CharacterCardDraftRecord[]> {
  return StorageService.getItems<CharacterCardDraftRecord>("characterCardDrafts");
}

export async function getCharacterCardDraft(cardId: string): Promise<CharacterCardDraftRecord | null> {
  return (await listCharacterCardDrafts()).find((draft) => draft.cardId === cardId) ?? null;
}

export async function deleteCharacterCardDraft(cardId: string): Promise<void> {
  const draft = await getCharacterCardDraft(cardId);
  if (draft) await StorageService.deleteItem("characterCardDrafts", draft.id, { origin: "migration" });
}
