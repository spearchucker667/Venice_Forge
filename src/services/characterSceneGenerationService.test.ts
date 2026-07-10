import { describe, it, expect, vi } from 'vitest';
import { generateCharacterScene, type CharacterSceneGenerationDependencies } from './characterSceneGenerationService';
import { CharacterSceneRateLimiter } from './characterSceneRateLimiter';
import { buildSceneReferencePlan } from './sceneReferencePlanner';
import { buildSceneReferenceEntities } from './sceneReferenceResolver';
import type { Conversation } from '../types/conversation';
import type { MediaItem } from '../types/media';

const character = {
  slug: 'picnic-bot',
  name: 'Picnic Bot',
  description: 'Loves picnics',
};

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  const base: Conversation = {
    id: 'conv-1',
    title: 'Picnic Chat',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    model: 'model-1',
    messages: [
      { id: 'm1', role: 'user', content: 'Sunset picnic in a meadow.', timestamp: Date.now() },
      { id: 'm2', role: 'assistant', content: 'A castle is visible in the distance.', timestamp: Date.now() + 1 },
    ],
    metadata: {
      tags: [],
      pinned: false,
      archived: false,
      source: 'character',
      messageCount: 2,
      character,
    },
  };
  return { ...base, ...overrides, metadata: { ...base.metadata, ...(overrides.metadata ?? {}) } } as Conversation;
}

function makeDeps(overrides: Partial<CharacterSceneGenerationDependencies> = {}): CharacterSceneGenerationDependencies {
  return {
    assessScenePrompt: vi.fn().mockResolvedValue({ allow: true, action: 'allow' }),
    getEffectiveRendererLocalFamilySafeModeEnabled: () => true,
    getEffectiveRendererVeniceApiSafeMode: () => true,
    buildImagePayload: vi.fn().mockReturnValue({ model: 'image-model', prompt: 'compiled prompt', width: 1024, height: 1024 }),
    getImageModelCapabilities: vi.fn().mockReturnValue({
      supportsVariants: true,
      supportsNegativePrompt: true,
      supportsSeed: true,
      supportsStyle: true,
      supportsSteps: true,
      supportsCfgScale: true,
      supportsHideWatermark: true,
      supportsReturnBinary: false,
    }),
    veniceFetch: vi.fn().mockResolvedValue({ data: { images: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='] } }),
    upsertMedia: vi.fn().mockResolvedValue({ id: 'media-1', image: 'data:image/png;base64,xyz' } as MediaItem),
    processBase64Image: vi.fn().mockReturnValue({ base64: 'data:image/png;base64,xyz', report: { metadataRemoved: false, originalBytes: 100, processedBytes: 100, mimeType: 'image/png', extension: 'png', warnings: [] } }),
    extractImages: vi.fn().mockReturnValue(['data:image/png;base64,ABC']),
    isValidImageResponse: vi.fn().mockReturnValue(true),
    generateId: vi.fn().mockReturnValue('req-1'),
    buildSceneReferenceEntities,
    buildSceneReferencePlan,
    getSceneReferenceSource: () => ({ cards: [], personas: [] }),
    ...overrides,
  };
}

describe('generateCharacterScene', () => {
  it('returns failed when conversation is not character-bound', async () => {
    const conv = makeConversation({ metadata: { ...makeConversation().metadata, character: undefined } as Conversation['metadata'] });
    const result = await generateCharacterScene({ conversation: conv, source: 'on_demand' }, makeDeps());
    expect(result.status).toBe('failed');
    expect(result.error).toContain('not character-bound');
  });

  it('rate-limits before calling Venice', async () => {
    const limiter = new CharacterSceneRateLimiter();
    for (let i = 0; i < 3; i++) limiter.recordComplete({ conversationId: 'conv-1' });
    const deps = makeDeps();
    const result = await generateCharacterScene({ conversation: makeConversation(), source: 'on_demand', limiter }, deps);
    expect(result.status).toBe('rate_limited');
    expect(result.error).toContain('paused');
    expect(deps.veniceFetch).not.toHaveBeenCalled();
  });

  it('returns blocked when safety guard disallows', async () => {
    const deps = makeDeps({
      assessScenePrompt: vi.fn().mockResolvedValue({ allow: false, userMessage: 'Unsafe prompt', action: 'block' }),
    });
    const result = await generateCharacterScene({ conversation: makeConversation(), source: 'on_demand' }, deps);
    expect(result.status).toBe('blocked');
    expect(result.error).toContain('Unsafe prompt');
    expect(deps.veniceFetch).not.toHaveBeenCalled();
  });

  it('completes successfully and persists media', async () => {
    const deps = makeDeps();
    const result = await generateCharacterScene({ conversation: makeConversation(), source: 'on_demand' }, deps);
    expect(result.status).toBe('complete');
    expect(result.galleryItemId).toBe('media-1');
    expect(deps.veniceFetch).toHaveBeenCalledWith('/image/generate', expect.objectContaining({ method: 'POST' }));
    expect(deps.upsertMedia).toHaveBeenCalled();
  });

  it('uses provided prompt override', async () => {
    const deps = makeDeps();
    await generateCharacterScene({ conversation: makeConversation(), source: 'on_demand', promptOverride: 'custom prompt' }, deps);
    expect(deps.buildImagePayload).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ prompt: 'custom prompt' }),
      'custom prompt',
      undefined,
    );
  });

  // BUG-158 regression guard: concurrency must be released on API or persistence failure.
  it('releases the concurrency limiter slot when veniceFetch fails', async () => {
    const limiter = new CharacterSceneRateLimiter();
    const deps = makeDeps({ veniceFetch: vi.fn().mockRejectedValue(new Error('Venice unreachable')) });
    const result = await generateCharacterScene({ conversation: makeConversation(), source: 'on_demand', limiter }, deps);
    expect(result.status).toBe('failed');
    expect(limiter.check({ conversationId: 'conv-1' }).allowed).toBe(true);
  });

  it('releases the concurrency limiter slot when upsertMedia fails', async () => {
    const limiter = new CharacterSceneRateLimiter();
    const deps = makeDeps({ upsertMedia: vi.fn().mockRejectedValue(new Error('IDB write failed')) });
    const result = await generateCharacterScene({ conversation: makeConversation(), source: 'on_demand', limiter }, deps);
    expect(result.status).toBe('failed');
    expect(limiter.check({ conversationId: 'conv-1' }).allowed).toBe(true);
  });

  // T-159 regression guard: catch block must not return raw exception text.
  it('returns a safe error message when veniceFetch fails', async () => {
    const deps = makeDeps({ veniceFetch: vi.fn().mockRejectedValue(new Error('Venice unreachable')) });
    const result = await generateCharacterScene({ conversation: makeConversation(), source: 'on_demand' }, deps);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Character scene generation failed. Please try again.');
    expect(result.error).not.toContain('Venice unreachable');
  });

  it('returns a safe error message when upsertMedia fails', async () => {
    const deps = makeDeps({ upsertMedia: vi.fn().mockRejectedValue(new Error('IDB write failed')) });
    const result = await generateCharacterScene({ conversation: makeConversation(), source: 'on_demand' }, deps);
    expect(result.status).toBe('failed');
    expect(result.error).toBe('Character scene generation failed. Please try again.');
    expect(result.error).not.toContain('IDB write failed');
  });

  // VERIFY-084 — scene references flow through to the payload for supported models.
  const validPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

  it('passes detected character references to buildImagePayload when model supports references', async () => {
    const buildImagePayloadSpy = vi.fn().mockReturnValue({ model: 'image-model', prompt: 'custom prompt', width: 1024, height: 1024 });
    const deps = makeDeps({
      buildImagePayload: buildImagePayloadSpy,
      getImageModelCapabilities: vi.fn().mockReturnValue({
        supportsVariants: true,
        supportsNegativePrompt: true,
        supportsSeed: true,
        supportsStyle: true,
        supportsSteps: true,
        supportsCfgScale: true,
        supportsHideWatermark: true,
        supportsReturnBinary: false,
        supportsReferences: true,
        referenceLimit: 2,
      }),
      getSceneReferenceSource: () => ({
        cards: [
          {
            schema: 'CharacterCardV1',
            id: 'picnic-bot',
            name: 'Picnic Bot',
            description: '',
            systemPrompt: '',
            tags: [],
            adult: false,
            exampleDialogues: [],
            createdAt: 1,
            updatedAt: 1,
            avatar: { mimeType: 'image/png', data: validPng, byteLength: 100 },
          },
        ],
        personas: [],
      }),
    });
    await generateCharacterScene({ conversation: makeConversation(), source: 'on_demand', promptOverride: 'Picnic Bot in a meadow' }, deps);
    expect(buildImagePayloadSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        prompt: 'Picnic Bot in a meadow',
        supportsReferences: true,
        references: expect.arrayContaining([
          expect.objectContaining({ entityId: 'picnic-bot', mimeType: 'image/png', data: validPng }),
        ]),
      }),
      'Picnic Bot in a meadow',
      undefined,
    );
  });

  it('drops references when the model does not support them', async () => {
    const buildImagePayloadSpy = vi.fn().mockReturnValue({ model: 'image-model', prompt: 'custom prompt', width: 1024, height: 1024 });
    const deps = makeDeps({
      buildImagePayload: buildImagePayloadSpy,
      getImageModelCapabilities: vi.fn().mockReturnValue({
        supportsVariants: true,
        supportsNegativePrompt: true,
        supportsSeed: true,
        supportsStyle: true,
        supportsSteps: true,
        supportsCfgScale: true,
        supportsHideWatermark: true,
        supportsReturnBinary: false,
        supportsReferences: false,
        referenceLimit: 0,
      }),
      getSceneReferenceSource: () => ({
        cards: [
          {
            schema: 'CharacterCardV1',
            id: 'picnic-bot',
            name: 'Picnic Bot',
            description: '',
            systemPrompt: '',
            tags: [],
            adult: false,
            exampleDialogues: [],
            createdAt: 1,
            updatedAt: 1,
            avatar: { mimeType: 'image/png', data: validPng, byteLength: 100 },
          },
        ],
        personas: [],
      }),
    });
    await generateCharacterScene({ conversation: makeConversation(), source: 'on_demand', promptOverride: 'Picnic Bot in a meadow' }, deps);
    const draft = buildImagePayloadSpy.mock.calls[0]![1] as { supportsReferences: boolean; references?: unknown[] };
    expect(draft.supportsReferences).toBe(false);
    expect(draft.references?.length ?? 0).toBe(0);
  });
});
