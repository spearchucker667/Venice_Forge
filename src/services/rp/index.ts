/**
 * @fileoverview Barrel for the Character RP Studio services.
 *
 * Renderer-side modules import from `services/rp` rather than reaching into
 * individual files. Mirrors the existing `services/*` index style.
 *
 * Note: individual services expose a `generateId()` helper. To avoid name
 * collisions in this barrel, `generateId` is only re-exported from
 * `characterCardService` (callers should use the per-module import if they
 * need a domain-specific id prefix).
 */

export * from "./characterCardService";
export {
  listPersonas,
  readPersona,
  savePersona,
  deletePersona,
  normalizePersona,
  generateId as generatePersonaId,
} from "./personaService";
export {
  listLorebooks,
  readLorebook,
  saveLorebook,
  deleteLorebook,
  generateId as generateLorebookId,
  entryMatches,
  selectTriggeredEntries,
  normalizeLorebook,
  validateLorebook,
} from "./lorebookRendererService";
export {
  isValidRpMemory,
  normalizeRpMemory,
  selectMemoriesForChat,
  RP_MEMORY_MAX_PER_SCOPE,
  RP_MEMORY_MAX_CHARS,
  rpMemorySchemaVersion,
} from "./rpMemoryService";
export {
  listRpChats,
  readRpChat,
  saveRpChat,
  appendMessage,
  deleteRpChat,
  isValidChat,
  normalizeChat,
  generateId as generateRpChatId,
} from "./rpChatService";
export {
  listAssets,
  readAsset,
  saveAsset,
  deleteAsset,
  isValidAsset,
  normalizeAsset,
  generateId as generateAssetId,
} from "./assetService";
export {
  generateScene,
  extractScenePrompt,
} from "./sceneGenerationService";
export {
  buildRpPrompt,
  SAFETY_PREAMBLE,
} from "./promptBuilderService";
