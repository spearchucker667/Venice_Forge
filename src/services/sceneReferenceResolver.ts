/** @fileoverview Phase 7 — Build SceneReferenceEntity[] from the active
 *  Character Card and Persona stores so scene generation can suggest
 *  reference images for character consistency.
 *
 *  The resolver is pure: it takes the card/persona arrays and returns
 *  entities with sanitized image payloads. It never reads stores directly,
 *  so tests can inject fixtures and components can call it from a selector.
 */

import type { CharacterCardV1, UserPersonaV1 } from "../types/rp";
import { hashReferenceContent, type SceneReferenceEntity } from "./sceneReferencePlanner";

export interface SceneReferenceSource {
  cards: readonly CharacterCardV1[];
  personas: readonly UserPersonaV1[];
}

function toReferenceImage(image: { mimeType: string; data: string; contentHash?: string }) {
  if (!/^(image\/png|image\/jpeg|image\/webp)$/i.test(image.mimeType)) return undefined;
  const data = image.data.startsWith("data:") ? image.data.split(",")[1] ?? image.data : image.data;
  if (!data || !/^[A-Za-z0-9+/]*={0,2}$/.test(data)) return undefined;
  return {
    mimeType: image.mimeType.toLowerCase() as "image/png" | "image/jpeg" | "image/webp",
    data,
    contentHash: image.contentHash ?? hashReferenceContent(data, image.mimeType),
  };
}

/** Build reference entities from local character cards (avatars) and
 *  personas (images). Archived cards/personas are excluded because they
 *  are no longer active participants in scene generation. */
export function buildSceneReferenceEntities(source: SceneReferenceSource): SceneReferenceEntity[] {
  const entities: SceneReferenceEntity[] = [];
  for (const card of source.cards) {
    if (card.archivedAt) continue;
    const image = card.avatar ? toReferenceImage(card.avatar) : undefined;
    entities.push({
      type: "character",
      id: card.id,
      name: card.name,
      aliases: [card.name].filter(Boolean),
      image,
    });
  }
  for (const persona of source.personas) {
    const image = persona.image ? toReferenceImage(persona.image) : undefined;
    entities.push({
      type: "persona",
      id: persona.id,
      name: persona.name,
      aliases: [persona.name, persona.reference].filter((n): n is string => Boolean(n)),
      image,
    });
  }
  return entities;
}
