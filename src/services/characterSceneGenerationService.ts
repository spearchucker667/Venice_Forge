/** @fileoverview Orchestrates Character Chat Scene Generation end-to-end. */

import { generateId } from '../lib/utils';
import { extractCharacterSceneContext } from './characterSceneContext';
import { compileCharacterScenePrompt } from './characterScenePromptCompiler';
import { CharacterSceneRateLimiter } from './characterSceneRateLimiter';
import { assessScenePrompt } from '../shared/safety/characterImportSafety';
import {
  getEffectiveRendererLocalFamilySafeModeEnabled,
  getEffectiveRendererVeniceApiSafeMode,
} from '../safetyHydration';
import { buildImagePayload, type ImageDraftLike } from '../utils/payloadBuilders';
import { getImageModelCapabilities, type ImageModelCapabilities } from '../config/image-model-capabilities';
import { veniceFetch } from './veniceClient';
import { useMediaStore } from '../stores/media-store';
import { useCharacterCardStore } from '../stores/character-card-store';
import { usePersonaStore } from '../stores/persona-store';
import { processBase64Image } from '../utils/imageProcessor';
import { isValidImageResponse } from '../utils/veniceValidation';
import { extractImages } from '../utils/image';
import { useSettingsStore } from '../stores/settings-store';
import { buildSceneReferencePlan, type SceneReferencePlan } from './sceneReferencePlanner';
import { buildSceneReferenceEntities, type SceneReferenceSource } from './sceneReferenceResolver';
import type { Conversation } from '../types/conversation';
import type { MediaItem } from '../types/media';
import type {
  CharacterSceneGenerationResult,
  CharacterSceneGenerationSource,
} from '../types/characterSceneGeneration';

export interface GenerateCharacterSceneOptions {
  conversation: Conversation;
  source: CharacterSceneGenerationSource;
  selectedMessageId?: string;
  assistantMessageId?: string;
  promptOverride?: string;
  negativePromptOverride?: string;
  model?: string;
  aspectRatio?: string;
  width?: number;
  height?: number;
  limiter?: CharacterSceneRateLimiter;
  signal?: AbortSignal;
}

export interface CharacterSceneGenerationDependencies {
  assessScenePrompt: typeof assessScenePrompt;
  getEffectiveRendererLocalFamilySafeModeEnabled: () => boolean;
  getEffectiveRendererVeniceApiSafeMode: () => boolean;
  buildImagePayload: typeof buildImagePayload;
  getImageModelCapabilities: typeof getImageModelCapabilities;
  veniceFetch: typeof veniceFetch;
  upsertMedia: (item: MediaItem, options?: { attachActiveProject?: boolean; source?: 'generated' }) => Promise<MediaItem>;
  processBase64Image: typeof processBase64Image;
  extractImages: typeof extractImages;
  isValidImageResponse: typeof isValidImageResponse;
  generateId: () => string;
  buildSceneReferenceEntities: typeof buildSceneReferenceEntities;
  buildSceneReferencePlan: typeof buildSceneReferencePlan;
  getSceneReferenceSource: () => SceneReferenceSource;
}

const defaultDeps: CharacterSceneGenerationDependencies = {
  assessScenePrompt,
  getEffectiveRendererLocalFamilySafeModeEnabled,
  getEffectiveRendererVeniceApiSafeMode,
  buildImagePayload,
  getImageModelCapabilities,
  veniceFetch,
  upsertMedia: (item, options) => useMediaStore.getState().upsert(item, options),
  processBase64Image,
  extractImages,
  isValidImageResponse,
  generateId,
  buildSceneReferenceEntities,
  buildSceneReferencePlan,
  getSceneReferenceSource: () => ({
    cards: useCharacterCardStore.getState().cards,
    personas: usePersonaStore.getState().personas,
  }),
};

export async function generateCharacterScene(
  options: GenerateCharacterSceneOptions,
  deps: CharacterSceneGenerationDependencies = defaultDeps,
): Promise<CharacterSceneGenerationResult> {
  const { conversation, source, selectedMessageId, assistantMessageId, limiter = new CharacterSceneRateLimiter() } = options;
  const nowIso = new Date().toISOString();
  const requestId = deps.generateId();
  let resultPrompt: string | undefined;

  try {
    const character = conversation.metadata?.character;
    if (!character?.slug) {
      return { requestId, status: 'failed', error: 'Conversation is not character-bound.', updatedAt: nowIso };
    }

    const limitCheck = limiter.check({ conversationId: conversation.id, assistantMessageId });
    if (!limitCheck.allowed) {
      return {
        requestId,
        status: 'rate_limited',
        error: 'Scene generation paused to prevent over-generation.',
        rateLimitReason: limitCheck.reason,
        updatedAt: nowIso,
      };
    }

    const context = extractCharacterSceneContext({
      conversationId: conversation.id,
      activeMessageId: selectedMessageId,
      messages: conversation.messages,
      character,
    });

    const compiled = compileCharacterScenePrompt(context, source);
    const prompt = options.promptOverride?.trim() || compiled.prompt;
    resultPrompt = prompt;
    const negativePrompt = options.negativePromptOverride ?? compiled.negativePrompt;

    const localFamilySafeModeEnabled = deps.getEffectiveRendererLocalFamilySafeModeEnabled();
    const decision = await deps.assessScenePrompt(prompt, negativePrompt, localFamilySafeModeEnabled);
    if (!decision.allow) {
      return { requestId, status: 'blocked', prompt: resultPrompt, error: decision.userMessage || decision.reasonCode || 'Blocked by safety guard.', updatedAt: nowIso };
    }

    limiter.recordStart({ conversationId: conversation.id, assistantMessageId });

    const model = options.model || character.modelId || useSettingsStore.getState().selectedModels.image || 'flux-dev';
    const caps = deps.getImageModelCapabilities(model) as ImageModelCapabilities;

    const referenceSource = deps.getSceneReferenceSource();
    const referenceEntities = deps.buildSceneReferenceEntities(referenceSource);
    const referencePlan: SceneReferencePlan = deps.buildSceneReferencePlan({
      sceneDescription: prompt,
      entities: referenceEntities,
      modelSupportsReferences: caps.supportsReferences === true,
      referenceLimit: caps.referenceLimit ?? 0,
    });

    const draft: ImageDraftLike = {
      prompt,
      negative: negativePrompt,
      width: options.width ?? 1024,
      height: options.height ?? 1024,
      aspectRatio: options.aspectRatio,
      safeMode: deps.getEffectiveRendererVeniceApiSafeMode(),
      disableWatermark: true,
      imageCount: 1,
      supportsVariants: !!caps.supportsVariants,
      supportsNegativePrompt: caps.supportsNegativePrompt !== false,
      supportsSeed: caps.supportsSeed !== false,
      supportsStyle: caps.supportsStyle !== false,
      supportsSteps: caps.supportsSteps !== false,
      supportsCfgScale: caps.supportsCfgScale !== false,
      supportsHideWatermark: caps.supportsHideWatermark !== false,
      supportsReturnBinary: caps.supportsReturnBinary !== false,
      supportsReferences: caps.supportsReferences === true,
      references: referencePlan.references,
    };

    const payload = deps.buildImagePayload(model, draft, prompt, undefined);

    const { data } = await deps.veniceFetch('/image/generate', { method: 'POST', body: payload, signal: options.signal });
    if (!deps.isValidImageResponse(data)) {
      throw new Error('Venice returned an unexpected image response');
    }

    const images = deps.extractImages(data);
    if (!images.length) {
      throw new Error('No images returned');
    }

    const { base64: processedImg, report } = deps.processBase64Image(images[0]);

    const mediaItem: Record<string, unknown> = {
      id: deps.generateId(),
      image: processedImg,
      prompt,
      negative: negativePrompt,
      model,
      width: payload.width as number | undefined,
      height: payload.height as number | undefined,
      aspectRatio: payload.aspect_ratio as string | undefined,
      resolution: payload.resolution as string | undefined,
      steps: payload.steps as number | undefined,
      cfg: payload.cfg_scale as number | undefined,
      safeMode: payload.safe_mode as boolean | undefined,
      disableWatermark: payload.hide_watermark as boolean | undefined,
      mediaType: 'image',
      operation: 'generate',
      source: 'character-scene',
      parentId: null,
      childrenIds: [],
      tags: ['character-scene'],
      note: '',
      favorite: false,
      timestamp: Date.now(),
      metadataRemoved: report.metadataRemoved,
      originalBytes: report.originalBytes,
      processedBytes: report.processedBytes,
      mimeType: report.mimeType,
      recipe: {
        prompt,
        negativePrompt,
        model,
        width: options.width,
        height: options.height,
        aspectRatio: options.aspectRatio,
        metadata: {
          source: 'character-scene',
          conversationId: conversation.id,
          characterSlug: character.slug,
          sourceMessageIds: compiled.sourceMessageIds,
          generatedAt: nowIso,
        },
      },
    };

    const saved = await deps.upsertMedia(mediaItem as unknown as MediaItem, { attachActiveProject: true, source: 'generated' });
    limiter.recordComplete({ conversationId: conversation.id, assistantMessageId });

    return {
      requestId,
      status: 'complete',
      prompt: resultPrompt,
      imageId: saved.id,
      imageUrl: saved.image,
      galleryItemId: saved.id,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    limiter.recordFailure({ conversationId: conversation.id, assistantMessageId });
    return {
      requestId,
      status: 'failed',
      prompt: resultPrompt,
      error: 'Character scene generation failed. Please try again.',
      updatedAt: new Date().toISOString(),
    };
  }
}
