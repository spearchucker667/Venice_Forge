/** @fileoverview Types for Character Chat Scene Generation. */

export type CharacterSceneGenerationStatus =
  | "queued"
  | "compiling"
  | "generating"
  | "complete"
  | "failed"
  | "blocked"
  | "rate_limited";

export type CharacterSceneGenerationSource = "on_demand" | "automatic";

export interface CharacterSceneGenerationRequest {
  id: string;
  conversationId: string;
  source: CharacterSceneGenerationSource;
  assistantMessageId?: string;
  selectedMessageId?: string;
  characterSlug: string;
  characterName?: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
  sourceMessageIds: string[];
  createdAt: string;
}

export interface CharacterSceneGenerationResult {
  requestId: string;
  status: CharacterSceneGenerationStatus;
  prompt?: string;
  imageId?: string;
  imageUrl?: string;
  galleryItemId?: string;
  error?: string;
  rateLimitReason?: string;
  updatedAt: string;
}

export interface CompiledCharacterScenePrompt {
  prompt: string;
  negativePrompt?: string;
  source: CharacterSceneGenerationSource;
  sourceMessageIds: string[];
}

export interface CharacterSceneRateLimitSettings {
  maxScenesPerAssistantTurn: number;
  maxScenesPerConversationPerHour: number;
  maxScenesPerConversationPerDay: number;
  maxScenesGlobalPerMinute: number;
  maxConcurrentSceneGenerations: number;
  cooldownMsAfterSceneGeneration: number;
}

export const DEFAULT_CHARACTER_SCENE_LIMITS: CharacterSceneRateLimitSettings = {
  maxScenesPerAssistantTurn: 1,
  maxScenesPerConversationPerHour: 6,
  maxScenesPerConversationPerDay: 20,
  maxScenesGlobalPerMinute: 2,
  maxConcurrentSceneGenerations: 1,
  cooldownMsAfterSceneGeneration: 15_000,
} as const;
