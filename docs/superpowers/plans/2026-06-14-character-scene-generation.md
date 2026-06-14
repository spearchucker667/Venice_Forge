# Character Scene Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a conversation-scoped Character scene generation tool to character chats with on-demand and automatic (marker-based) modes, local rate limiting, and inline scene cards.

**Architecture:** Pure extractor/compiler/parser/limiter services feed a single `characterSceneGenerationService` orchestrator. The service reuses existing `buildImagePayload`, `veniceFetch`, `assessScenePrompt`, and `useMediaStore.upsert`. `use-chat.ts` exposes manual creation and post-stream marker detection. UI lives in `CharacterSceneCard` and message-bubble actions.

**Tech Stack:** React 19, TypeScript strict, Zustand, Electron IPC, Venice API, Vitest.

---

## File structure

### New files

- `src/types/characterSceneGeneration.ts` — status, source, request, result types.
- `src/services/characterSceneContext.ts` — `extractCharacterSceneContext(input)`.
- `src/services/characterSceneContext.test.ts` — extractor tests.
- `src/services/characterScenePromptCompiler.ts` — `compileCharacterScenePrompt(context, source)`.
- `src/services/characterScenePromptCompiler.test.ts` — compiler tests.
- `src/services/characterSceneRateLimiter.ts` — `CharacterSceneRateLimiter` class + `DEFAULT_CHARACTER_SCENE_LIMITS`.
- `src/services/characterSceneRateLimiter.test.ts` — limiter tests.
- `src/services/characterSceneRequestParser.ts` — `parseCharacterSceneRequest(text)`.
- `src/services/characterSceneRequestParser.test.ts` — parser tests.
- `src/services/characterSceneGenerationService.ts` — `generateCharacterScene(options)`.
- `src/services/characterSceneGenerationService.test.ts` — service tests.
- `src/components/chat/CharacterSceneCard.tsx` — inline card UI.
- `src/components/chat/CharacterSceneCard.test.tsx` — card tests.
- `src/hooks/use-chat.character-scene.test.ts` — hook integration tests.
- `src/stores/settings-store.character-scene.test.ts` — settings tests.

### Modified files

- `src/stores/settings-store.ts` — add fields + migration.
- `src/components/SettingsView.tsx` — add toggle + mode selector.
- `src/hooks/use-chat.ts` — manual + auto integration.
- `src/components/chat/message-bubble.tsx` — add `onGenerateScene` action.
- `src/components/chat/chat-view.tsx` — wire scene action to `useChat`.
- `docs/summary_of_work.md` — session summary.
- `CHANGELOG.md` — feature note.
- `README.md` / `docs/ABOUT.md` / `docs/CHARACTER_RP.md` / `docs/CONFIG.md` — docs.

---

## Task 1: Types

**Files:**
- Create: `src/types/characterSceneGeneration.ts`
- Test: `src/types/characterSceneGeneration.test.ts` (optional, can be covered by service tests)

- [ ] **Step 1: Define canonical types**

```ts
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
  imageId?: string;
  imageUrl?: string;
  galleryItemId?: string;
  error?: string;
  rateLimitReason?: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors related to the new file.

---

## Task 2: Current-conversation context extractor

**Files:**
- Create: `src/services/characterSceneContext.ts`
- Create: `src/services/characterSceneContext.test.ts`

- [ ] **Step 1: Write failing test for current-conversation-only extraction**

```ts
import { describe, it, expect } from 'vitest';
import { extractCharacterSceneContext } from './characterSceneContext';

describe('extractCharacterSceneContext', () => {
  it('uses only messages from the current conversation and excludes hidden injectedContext', () => {
    const result = extractCharacterSceneContext({
      conversationId: 'conv-1',
      messages: [
        { id: 'm1', role: 'user', content: 'We are having a sunset picnic.', createdAt: '2026-06-14T10:00:00Z' },
        { id: 'm2', role: 'assistant', content: 'The meadow is full of wildflowers.', metadata: { injectedContext: 'SECRET MEMORY' }, createdAt: '2026-06-14T10:01:00Z' },
        { id: 'm3', role: 'system', content: 'You are helpful.', createdAt: '2026-06-14T10:02:00Z' },
      ],
      character: { slug: 'picnic-bot', name: 'Picnic Bot', description: 'Loves outdoor meals' },
    });
    expect(result.visibleContext).toContain('sunset picnic');
    expect(result.visibleContext).toContain('wildflowers');
    expect(result.visibleContext).not.toContain('SECRET MEMORY');
    expect(result.visibleContext).not.toContain('You are helpful');
    expect(result.sourceMessageIds).toEqual(['m1', 'm2']);
  });
});
```

Run: `npx vitest run src/services/characterSceneContext.test.ts --fileParallelism=false`
Expected: FAIL — function not defined.

- [ ] **Step 2: Implement extractor**

```ts
import type { ConversationMessage } from '../types/conversation';

export interface CharacterSceneContextInput {
  conversationId: string;
  activeMessageId?: string;
  messages: Array<Pick<ConversationMessage, 'id' | 'role' | 'content' | 'metadata' | 'timestamp'>>;
  character?: { slug?: string; name?: string; description?: string; visualDescription?: string; avatarUrl?: string } | null;
  maxMessages?: number;
  maxChars?: number;
}

export interface CharacterSceneContext {
  conversationId: string;
  characterSlug: string;
  characterName?: string;
  visibleContext: string;
  selectedTurnText?: string;
  sourceMessageIds: string[];
}

export const DEFAULT_SCENE_CONTEXT_MAX_MESSAGES = 12;
export const DEFAULT_SCENE_CONTEXT_MAX_CHARS = 6000;

export function extractCharacterSceneContext(input: CharacterSceneContextInput): CharacterSceneContext {
  const { conversationId, activeMessageId, messages, character, maxMessages = DEFAULT_SCENE_CONTEXT_MAX_MESSAGES, maxChars = DEFAULT_SCENE_CONTEXT_MAX_CHARS } = input;
  const characterSlug = character?.slug;
  if (!characterSlug) throw new Error('Character slug is required for scene context extraction');

  const visible = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ ...m, text: messageContentToText(m.content, m.metadata) }))
    .filter((m) => m.text.trim().length > 0);

  let selectedIndex = visible.findIndex((m) => m.id === activeMessageId);
  if (selectedIndex === -1) selectedIndex = visible.length - 1;

  const start = Math.max(0, selectedIndex - Math.floor(maxMessages / 2));
  const window = visible.slice(start, start + maxMessages);

  let contextText = window.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n');
  if (contextText.length > maxChars) {
    contextText = contextText.slice(0, maxChars);
    const lastBreak = contextText.lastIndexOf('\n');
    if (lastBreak > maxChars * 0.8) contextText = contextText.slice(0, lastBreak);
  }

  return {
    conversationId,
    characterSlug,
    characterName: character?.name,
    visibleContext: contextText,
    selectedTurnText: activeMessageId ? visible[selectedIndex]?.text : undefined,
    sourceMessageIds: window.map((m) => m.id).filter((id): id is string => !!id),
  };
}

function messageContentToText(content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> | undefined, metadata?: Record<string, unknown>): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join(' ')
    .trim();
}
```

Run: `npx vitest run src/services/characterSceneContext.test.ts --fileParallelism=false`
Expected: PASS.

- [ ] **Step 3: Add additional tests**

Add tests for:
- ContentPart[] text extraction
- image data URL exclusion
- other-conversation messages excluded (by construction, since only current conversation is passed)
- selected message window
- system/tool exclusion

Run: `npx vitest run src/services/characterSceneContext.test.ts --fileParallelism=false`
Expected: PASS.

---

## Task 3: Prompt compiler

**Files:**
- Create: `src/services/characterScenePromptCompiler.ts`
- Create: `src/services/characterScenePromptCompiler.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { compileCharacterScenePrompt } from './characterScenePromptCompiler';

describe('compileCharacterScenePrompt', () => {
  it('builds a cinematic prompt from character and visible context', () => {
    const result = compileCharacterScenePrompt({
      conversationId: 'conv-1',
      characterSlug: 'picnic-bot',
      characterName: 'Picnic Bot',
      visibleContext: 'User: We are having a sunset picnic.\nAssistant: The meadow is full of wildflowers.',
      sourceMessageIds: ['m1', 'm2'],
    }, 'on_demand');
    expect(result.prompt).toContain('cinematic');
    expect(result.prompt).toContain('sunset picnic');
    expect(result.prompt).toContain('wildflowers');
    expect(result.source).toBe('on_demand');
    expect(result.sourceMessageIds).toEqual(['m1', 'm2']);
  });
});
```

Run: `npx vitest run src/services/characterScenePromptCompiler.test.ts --fileParallelism=false`
Expected: FAIL.

- [ ] **Step 2: Implement compiler**

```ts
import type { CharacterSceneContext } from './characterSceneContext';
import type { CompiledCharacterScenePrompt, CharacterSceneGenerationSource } from '../types/characterSceneGeneration';

export function compileCharacterScenePrompt(context: CharacterSceneContext, source: CharacterSceneGenerationSource): CompiledCharacterScenePrompt {
  const parts: string[] = [];
  if (context.characterName) parts.push(`Character: ${context.characterName}.`);
  if (context.visibleContext) parts.push(`Scene context: ${context.visibleContext}`);
  const prompt = `A cinematic scene, coherent composition, subject/environment alignment, high detail. ${parts.join(' ')}`.trim();
  return {
    prompt: prompt.slice(0, 2000),
    source,
    sourceMessageIds: context.sourceMessageIds,
  };
}
```

Run: `npx vitest run src/services/characterScenePromptCompiler.test.ts --fileParallelism=false`
Expected: PASS.

---

## Task 4: Rate limiter

**Files:**
- Create: `src/services/characterSceneRateLimiter.ts`
- Create: `src/services/characterSceneRateLimiter.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CharacterSceneRateLimiter, DEFAULT_CHARACTER_SCENE_LIMITS } from './characterSceneRateLimiter';

describe('CharacterSceneRateLimiter', () => {
  let limiter: CharacterSceneRateLimiter;
  beforeEach(() => { limiter = new CharacterSceneRateLimiter(); });

  it('allows the first request and blocks excessive repeated requests', () => {
    expect(limiter.check({ conversationId: 'c1' }).allowed).toBe(true);
    expect(limiter.check({ conversationId: 'c1' }).allowed).toBe(true);
    expect(limiter.check({ conversationId: 'c1' }).allowed).toBe(false);
  });
});
```

Run: `npx vitest run src/services/characterSceneRateLimiter.test.ts --fileParallelism=false`
Expected: FAIL.

- [ ] **Step 2: Implement limiter**

```ts
export const DEFAULT_CHARACTER_SCENE_LIMITS = {
  maxScenesPerAssistantTurn: 1,
  maxScenesPerConversationPerHour: 6,
  maxScenesPerConversationPerDay: 20,
  maxScenesGlobalPerMinute: 2,
  maxConcurrentSceneGenerations: 1,
  cooldownMsAfterSceneGeneration: 15_000,
} as const;

export interface CharacterSceneRateLimitInput {
  conversationId: string;
  assistantMessageId?: string;
}

export interface CharacterSceneRateLimitResult {
  allowed: boolean;
  reason?: string;
  retryAfterMs?: number;
}

export class CharacterSceneRateLimiter {
  private limits = DEFAULT_CHARACTER_SCENE_LIMITS;
  private conversationHour = new Map<string, number[]>();
  private conversationDay = new Map<string, number[]>();
  private globalMinute: number[] = [];
  private concurrent = 0;
  private lastGenerationTime = 0;

  check(input: CharacterSceneRateLimitInput, now = Date.now()): CharacterSceneRateLimitResult {
    if (this.concurrent >= this.limits.maxConcurrentSceneGenerations) {
      return { allowed: false, reason: 'Another scene generation is already running.', retryAfterMs: this.lastGenerationTime + this.limits.cooldownMsAfterSceneGeneration - now };
    }
    const sinceCooldown = now - this.lastGenerationTime;
    if (sinceCooldown < this.limits.cooldownMsAfterSceneGeneration) {
      return { allowed: false, reason: 'Scene generation cooldown active.', retryAfterMs: this.limits.cooldownMsAfterSceneGeneration - sinceCooldown };
    }
    this.globalMinute = this.globalMinute.filter((t) => now - t < 60_000);
    if (this.globalMinute.length >= this.limits.maxScenesGlobalPerMinute) {
      return { allowed: false, reason: 'Global scene generation rate limit reached.', retryAfterMs: 60_000 - (now - this.globalMinute[0]) };
    }
    const hour = this.conversationHour.get(input.conversationId) ?? [];
    const hourRecent = hour.filter((t) => now - t < 60 * 60 * 1000);
    if (hourRecent.length >= this.limits.maxScenesPerConversationPerHour) {
      return { allowed: false, reason: 'Hourly scene generation limit for this conversation reached.', retryAfterMs: 60 * 60 * 1000 - (now - hourRecent[0]) };
    }
    const day = this.conversationDay.get(input.conversationId) ?? [];
    const dayRecent = day.filter((t) => now - t < 24 * 60 * 60 * 1000);
    if (dayRecent.length >= this.limits.maxScenesPerConversationPerDay) {
      return { allowed: false, reason: 'Daily scene generation limit for this conversation reached.', retryAfterMs: 24 * 60 * 60 * 1000 - (now - dayRecent[0]) };
    }
    return { allowed: true };
  }

  recordStart(input: CharacterSceneRateLimitInput, now = Date.now()): void {
    this.concurrent = Math.min(this.concurrent + 1, this.limits.maxConcurrentSceneGenerations);
  }

  recordComplete(input: CharacterSceneRateLimitInput, now = Date.now()): void {
    this.concurrent = Math.max(this.concurrent - 1, 0);
    this.lastGenerationTime = now;
    this.globalMinute.push(now);
    const hour = (this.conversationHour.get(input.conversationId) ?? []).filter((t) => now - t < 60 * 60 * 1000);
    hour.push(now);
    this.conversationHour.set(input.conversationId, hour);
    const day = (this.conversationDay.get(input.conversationId) ?? []).filter((t) => now - t < 24 * 60 * 60 * 1000);
    day.push(now);
    this.conversationDay.set(input.conversationId, day);
  }
}
```

Run: `npx vitest run src/services/characterSceneRateLimiter.test.ts --fileParallelism=false`
Expected: PASS.

- [ ] **Step 3: Add per-assistant-turn limit test**

Verify `maxScenesPerAssistantTurn` is enforced in service integration (Task 6).

---

## Task 5: Request parser

**Files:**
- Create: `src/services/characterSceneRequestParser.ts`
- Create: `src/services/characterSceneRequestParser.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseCharacterSceneRequest } from './characterSceneRequestParser';

describe('parseCharacterSceneRequest', () => {
  it('accepts a valid marker and strips it from display text', () => {
    const text = 'Let me paint that for you. <venice_forge_scene_request>{"intent":"create_scene","focus":"sunset picnic"}</venice_forge_scene_request> Thanks!';
    const result = parseCharacterSceneRequest(text);
    expect(result.request).toEqual({ intent: 'create_scene', focus: 'sunset picnic' });
    expect(result.displayText).not.toContain('<venice_forge_scene_request>');
  });

  it('rejects multiple markers', () => {
    const text = '<venice_forge_scene_request>{"intent":"create_scene"}</venice_forge_scene_request> and <venice_forge_scene_request>{"intent":"create_scene"}</venice_forge_scene_request>';
    const result = parseCharacterSceneRequest(text);
    expect(result.request).toBeNull();
  });
});
```

Run: `npx vitest run src/services/characterSceneRequestParser.test.ts --fileParallelism=false`
Expected: FAIL.

- [ ] **Step 2: Implement parser**

```ts
const MARKER_OPEN = '<venice_forge_scene_request>';
const MARKER_CLOSE = '</venice_forge_scene_request>';
const ASPECT_RATIOS = new Set(['1:1', '4:3', '3:4', '16:9', '9:16']);

export interface CharacterSceneRequest {
  intent: 'create_scene';
  focus?: string;
  aspect_ratio?: string;
  negative_prompt?: string;
}

export interface CharacterSceneParseResult {
  request: CharacterSceneRequest | null;
  displayText: string;
  diagnostics?: string;
}

export function parseCharacterSceneRequest(text: string): CharacterSceneParseResult {
  const indices: Array<{ start: number; end: number }> = [];
  let pos = 0;
  while (true) {
    const start = text.indexOf(MARKER_OPEN, pos);
    if (start === -1) break;
    const end = text.indexOf(MARKER_CLOSE, start + MARKER_OPEN.length);
    if (end === -1) break;
    indices.push({ start, end: end + MARKER_CLOSE.length });
    pos = end + MARKER_CLOSE.length;
  }

  if (indices.length === 0) return { request: null, displayText: text };

  let displayText = text;
  for (let i = indices.length - 1; i >= 0; i--) {
    const { start, end } = indices[i];
    displayText = displayText.slice(0, start) + displayText.slice(end);
  }
  displayText = displayText.replace(/\s+/g, ' ').trim();

  if (indices.length !== 1) {
    return { request: null, displayText, diagnostics: 'multiple_markers_rejected' };
  }

  const payloadText = text.slice(indices[0].start + MARKER_OPEN.length, indices[0].end - MARKER_CLOSE.length).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(payloadText);
  } catch {
    return { request: null, displayText, diagnostics: 'malformed_json_rejected' };
  }

  if (!isValidRequest(parsed)) {
    return { request: null, displayText, diagnostics: 'invalid_shape_rejected' };
  }

  return { request: parsed, displayText };
}

function isValidRequest(value: unknown): value is CharacterSceneRequest {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  if (r.intent !== 'create_scene') return false;
  if (r.focus !== undefined && (typeof r.focus !== 'string' || r.focus.length > 1000)) return false;
  if (r.negative_prompt !== undefined && (typeof r.negative_prompt !== 'string' || r.negative_prompt.length > 1000)) return false;
  if (r.aspect_ratio !== undefined && (typeof r.aspect_ratio !== 'string' || !ASPECT_RATIOS.has(r.aspect_ratio))) return false;
  return true;
}
```

Run: `npx vitest run src/services/characterSceneRequestParser.test.ts --fileParallelism=false`
Expected: PASS.

---

## Task 6: Generation service

**Files:**
- Create: `src/services/characterSceneGenerationService.ts`
- Create: `src/services/characterSceneGenerationService.test.ts`

- [ ] **Step 1: Write failing test**

Mock `veniceFetch`, `useMediaStore.upsert`, `assessScenePrompt`, `buildImagePayload`, etc. Test that a valid manual request succeeds and a rate-limited request does not call `veniceFetch`.

```ts
it('returns rate_limited and does not call Venice when limit exceeded', async () => {
  const limiter = new CharacterSceneRateLimiter();
  for (let i = 0; i < 3; i++) limiter.recordComplete({ conversationId: 'c1' });
  const result = await generateCharacterScene({ ...validOptions, limiter });
  expect(result.status).toBe('rate_limited');
  expect(veniceFetch).not.toHaveBeenCalled();
});
```

Run: `npx vitest run src/services/characterSceneGenerationService.test.ts --fileParallelism=false`
Expected: FAIL.

- [ ] **Step 2: Implement service**

```ts
import { generateId } from '../lib/utils';
import { extractCharacterSceneContext } from './characterSceneContext';
import { compileCharacterScenePrompt } from './characterScenePromptCompiler';
import { CharacterSceneRateLimiter } from './characterSceneRateLimiter';
import { assessScenePrompt } from '../shared/safety/characterImportSafety';
import { getEffectiveRendererLocalFamilySafeModeEnabled, getEffectiveRendererVeniceApiSafeMode } from '../safetyHydration';
import { buildImagePayload } from '../utils/payloadBuilders';
import { getImageModelCapabilities } from '../config/image-model-capabilities';
import { veniceFetch } from './veniceClient';
import { useMediaStore } from '../stores/media-store';
import { processBase64Image } from '../utils/imageProcessor';
import { extractImages, isValidImageResponse } from '../utils/veniceValidation';
import type { Conversation, ConversationMessage } from '../types/conversation';
import type { CharacterSceneGenerationRequest, CharacterSceneGenerationResult, CharacterSceneGenerationSource } from '../types/characterSceneGeneration';

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
}

export async function generateCharacterScene(options: GenerateCharacterSceneOptions): Promise<CharacterSceneGenerationResult> {
  const { conversation, source, selectedMessageId, assistantMessageId, limiter = new CharacterSceneRateLimiter() } = options;
  const now = new Date().toISOString();
  const requestId = generateId();

  try {
    const character = conversation.metadata?.character;
    if (!character?.slug) {
      return { requestId, status: 'failed', error: 'Conversation is not character-bound.', updatedAt: now };
    }

    const limitCheck = limiter.check({ conversationId: conversation.id, assistantMessageId });
    if (!limitCheck.allowed) {
      return { requestId, status: 'rate_limited', error: 'Scene generation paused to prevent over-generation.', rateLimitReason: limitCheck.reason, updatedAt: now };
    }

    const context = extractCharacterSceneContext({
      conversationId: conversation.id,
      activeMessageId: selectedMessageId,
      messages: conversation.messages,
      character,
    });

    const compiled = compileCharacterScenePrompt(context, source);
    const prompt = options.promptOverride?.trim() || compiled.prompt;
    const negativePrompt = options.negativePromptOverride ?? compiled.negativePrompt;

    const localFamilySafeModeEnabled = getEffectiveRendererLocalFamilySafeModeEnabled();
    const decision = await assessScenePrompt(prompt, negativePrompt, localFamilySafeModeEnabled);
    if (!decision.allow) {
      return { requestId, status: 'blocked', error: decision.reason ?? 'Blocked by safety guard.', updatedAt: now };
    }

    limiter.recordStart({ conversationId: conversation.id, assistantMessageId });

    const model = options.model || character.modelId || useSettingsStore.getState().selectedModels.image;
    const caps = getImageModelCapabilities(model);
    const draft: ImageDraftLike = {
      prompt,
      negative: negativePrompt,
      width: options.width ?? 1024,
      height: options.height ?? 1024,
      aspectRatio: options.aspectRatio,
      safeMode: getEffectiveRendererVeniceApiSafeMode(),
      disableWatermark: true,
      imageCount: 1,
      supportsVariants: caps.supportsVariants,
      supportsNegativePrompt: caps.supportsNegativePrompt,
      supportsSeed: caps.supportsSeed,
      supportsStyle: caps.supportsStyle,
      supportsSteps: caps.supportsSteps,
      supportsCfgScale: caps.supportsCfgScale,
      supportsHideWatermark: caps.supportsHideWatermark,
      supportsReturnBinary: caps.supportsReturnBinary,
    };
    const payload = buildImagePayload(model, draft);

    const { data } = await veniceFetch('/image/generate', { method: 'POST', body: payload });
    if (!isValidImageResponse(data)) throw new Error('Unexpected image response');
    const images = extractImages(data);
    if (!images.length) throw new Error('No images returned');

    const { base64: processedImg, report } = processBase64Image(images[0]);
    const mediaItem: MediaItem = {
      id: generateId(),
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
      metadataRemoved: report.metadataRemoved,
      originalBytes: report.originalBytes,
      processedBytes: report.processedBytes,
      mimeType: report.mimeType,
      recipe: {
        prompt,
        negativePrompt,
        model,
        metadata: {
          source: 'character-scene',
          conversationId: conversation.id,
          characterSlug: character.slug,
          sourceMessageIds: compiled.sourceMessageIds,
          generatedAt: now,
        },
      },
    };
    const saved = await useMediaStore.getState().upsert(mediaItem, { attachActiveProject: true, source: 'generated' });
    limiter.recordComplete({ conversationId: conversation.id, assistantMessageId });

    return { requestId, status: 'complete', imageId: saved.id, galleryItemId: saved.id, updatedAt: new Date().toISOString() };
  } catch (err) {
    return { requestId, status: 'failed', error: err instanceof Error ? err.message : String(err), updatedAt: new Date().toISOString() };
  }
}
```

- [ ] **Step 3: Verify service tests pass**

Run: `npx vitest run src/services/characterSceneGenerationService.test.ts --fileParallelism=false`
Expected: PASS.

---

## Task 7: Settings store + UI

**Files:**
- Modify: `src/stores/settings-store.ts`
- Create: `src/stores/settings-store.character-scene.test.ts`
- Modify: `src/components/SettingsView.tsx`

- [ ] **Step 1: Add fields and migration to settings-store.ts**

Add to `SettingsState`:

```ts
characterSceneGenerationEnabled: boolean;
setCharacterSceneGenerationEnabled: (enabled: boolean) => void;
characterSceneGenerationMode: "manual" | "auto";
setCharacterSceneGenerationMode: (mode: "manual" | "auto") => void;
```

Add defaults and setters. Bump `version` to `5` and add migration:

```ts
characterSceneGenerationEnabled: state.characterSceneGenerationEnabled ?? false,
characterSceneGenerationMode: state.characterSceneGenerationMode ?? "manual",
```

- [ ] **Step 2: Write settings test**

Assert defaults are `false` and `"manual"` after load.

Run: `npx vitest run src/stores/settings-store.character-scene.test.ts --fileParallelism=false`
Expected: PASS.

- [ ] **Step 3: Add UI controls to SettingsView.tsx**

Add a section under a sensible nav rail (e.g., "Defaults & Behavior" or a new "Characters" section). Use the existing checkbox pattern and `PillGroup` from `src/components/ui/shared.tsx` for the mode selector.

---

## Task 8: Inline scene card

**Files:**
- Create: `src/components/chat/CharacterSceneCard.tsx`
- Create: `src/components/chat/CharacterSceneCard.test.tsx`

- [ ] **Step 1: Implement card component**

Props:

```ts
interface CharacterSceneCardProps {
  status: CharacterSceneGenerationStatus;
  prompt?: string;
  imageUrl?: string;
  error?: string;
  rateLimitReason?: string;
  onRetry?: () => void;
  onRegenerate?: () => void;
  onCancel?: () => void;
  onOpenInMediaStudio?: () => void;
  onCopyPrompt?: () => void;
}
```

Render status text, progress indicator for non-final states, image thumbnail for `complete`, error for `failed`/`blocked`/`rate_limited`, and action buttons.

- [ ] **Step 2: Test card states**

Test each status renders correctly and buttons call handlers.

Run: `npx vitest run src/components/chat/CharacterSceneCard.test.tsx --fileParallelism=false`
Expected: PASS.

---

## Task 9: Message action and chat-view wiring

**Files:**
- Modify: `src/components/chat/message-bubble.tsx`
- Modify: `src/components/chat/chat-view.tsx`

- [ ] **Step 1: Add Create scene action to MessageBubble**

Add optional prop `onGenerateScene?: () => void`. Render a "Create scene" button for assistant messages when the conversation is character-bound and the feature is enabled.

- [ ] **Step 2: Wire in chat-view.tsx**

Resolve the active conversation from `useChatStore`. Pass a handler that calls `useChat().createScene(message.id)`.

---

## Task 10: Hook integration in use-chat.ts

**Files:**
- Modify: `src/hooks/use-chat.ts`
- Create: `src/hooks/use-chat.character-scene.test.ts`

- [ ] **Step 1: Add scene state and createScene method to useChat return**

Add module-level or ref-based state for pending scene generations keyed by conversation/message ID. Expose:

```ts
createScene(selectedMessageId?: string): Promise<void>
sceneGenerations: Record<string, CharacterSceneGenerationResult>
isGeneratingScene: boolean
```

- [ ] **Step 2: Post-stream automatic marker detection**

After `streamResponse()` finishes successfully, if `characterSceneGenerationEnabled && mode === 'auto'`:

1. Get the final assistant message of the turn.
2. Parse with `parseCharacterSceneRequest`.
3. If a valid request is found, update the assistant message content to `displayText`.
4. Call `generateCharacterScene` with `source: 'automatic'` and `assistantMessageId`.
5. Store the result in `sceneGenerations` and append a scene card message.

- [ ] **Step 3: Stop/cancel handling**

In `stop()`, abort any pending scene generation if supported. Prevent post-stream auto generation if the user has already stopped.

- [ ] **Step 4: Run hook tests**

Run: `npx vitest run src/hooks/use-chat.character-scene.test.ts --fileParallelism=false`
Expected: PASS.

---

## Task 11: Docs and session summary

**Files:**
- Modify: `docs/summary_of_work.md`
- Modify: `CHANGELOG.md`
- Modify: `README.md`, `docs/ABOUT.md`, `docs/CHARACTER_RP.md`, `docs/CONFIG.md`

- [ ] **Step 1: Update docs/summary_of_work.md**

Add a new dated session entry under `Session History`, update `Latest Session Summary`, and update the `Validation Matrix` once commands are run.

- [ ] **Step 2: Update CHANGELOG.md**

Add an entry for "Character scene generation" under the unreleased/version section.

- [ ] **Step 3: Update feature docs**

Document:
- default off
- current-conversation-only
- manual vs automatic mode
- strict internal marker
- local rate limits
- auditable/copyable prompts

---

## Task 12: Validation

- [ ] **Step 1: Run lint**

```bash
npm run lint:eslint
```
Expected: zero warnings/errors.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```
Expected: passes.

- [ ] **Step 3: Run tests**

```bash
npm test -- --fileParallelism=false
```
Expected: all pass.

- [ ] **Step 4: Run targeted new tests**

```bash
npx vitest run \
  src/services/characterSceneContext.test.ts \
  src/services/characterScenePromptCompiler.test.ts \
  src/services/characterSceneRateLimiter.test.ts \
  src/services/characterSceneRequestParser.test.ts \
  src/services/characterSceneGenerationService.test.ts \
  src/components/chat/CharacterSceneCard.test.tsx \
  src/hooks/use-chat.character-scene.test.ts \
  src/stores/settings-store.character-scene.test.ts \
  --fileParallelism=false
```
Expected: all pass.

- [ ] **Step 5: Run safety/network/link/contract audits**

```bash
npm run verify:safety-guard
npm run verify:network-boundaries
npm run verify:markdown-links
npm run verify:contracts
```
Expected: all pass.

- [ ] **Step 6: Run build**

```bash
npm run build
```
Expected: dist/ + dist-electron/ + dist/server.cjs built.

---

## Spec coverage check

| Spec requirement | Plan task |
|------------------|-----------|
| Types | Task 1 |
| Current-conversation-only extractor | Task 2 |
| Prompt compiler | Task 3 |
| Local rate limiter | Task 4 |
| Marker parser | Task 5 |
| Orchestrator service | Task 6 |
| Settings + UI | Task 7 |
| Inline card | Task 8 |
| Message action | Task 9 |
| use-chat integration | Task 10 |
| Docs | Task 11 |
| Validation | Task 12 |

No placeholders detected. All file paths are exact.
