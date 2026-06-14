# Character Chat Scene Generation Tool — Design

**Status:** Approved  
**Feature name:** Character scene generation  
**Default:** Off  

## Goal

Add a conversation-scoped scene generation tool to character chats. A user can create an inline scene image from the current active character conversation only, either on demand via a **Create scene** action or automatically when the assistant emits a strict hidden marker and the feature is enabled in **auto** mode.

## Privacy boundary (non-negotiable)

Scene generation may use only:

- current active conversation ID
- visible user messages in that conversation
- visible assistant messages in that conversation
- current conversation character metadata (slug, name, description, visual/avatar metadata)
- the specific message/turn selected for on-demand generation

It must never use:

- other conversations
- global chat history
- memory retrieval from other conversations
- unrelated character sessions
- stored user memories
- search results or Jina/research data
- hidden diagnostics
- API keys
- local file paths
- system prompts
- raw injectedContext metadata

## Architecture

```text
Character Chat
  ├─ normal text streaming (unchanged)
  ├─ optional automatic scene request (post-stream marker parser)
  ├─ on-demand "Create scene" button
  ├─ current-conversation-only context extractor
  ├─ scene prompt compiler
  ├─ local rate limiter
  └─ inline image generation card
```

### New modules

| File | Responsibility |
|------|----------------|
| `src/types/characterSceneGeneration.ts` | Canonical types: status, source, request, result |
| `src/services/characterSceneContext.ts` | Extract current-conversation-only visible context |
| `src/services/characterScenePromptCompiler.ts` | Compile bounded context into a concise image prompt |
| `src/services/characterSceneRateLimiter.ts` | Local sliding-window / token-bucket rate limits |
| `src/services/characterSceneRequestParser.ts` | Parse exactly one assistant marker per turn |
| `src/services/characterSceneGenerationService.ts` | Orchestrate validation → extract → compile → limit → guard → generate → persist |
| `src/components/chat/CharacterSceneCard.tsx` | Inline card UI for each scene generation state |

### Modified modules

| File | Change |
|------|--------|
| `src/stores/settings-store.ts` | Add `characterSceneGenerationEnabled`, `characterSceneGenerationMode`, limit overrides; bump version to 5 |
| `src/components/SettingsView.tsx` | Add toggle + mode selector |
| `src/hooks/use-chat.ts` | Expose `createScene(selectedMessageId?)`, post-stream auto-marker handling, abort on stop |
| `src/components/chat/message-bubble.tsx` / `chat-view.tsx` | Add "Create scene" assistant-message action |

## Data model

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

Scene card state is stored in the chat message metadata of the assistant turn that triggered it (auto) or in a dedicated system/tool message appended to the conversation (manual). It is never encoded into assistant text content.

## Settings

- `characterSceneGenerationEnabled: boolean` — default `false`
- `characterSceneGenerationMode: "manual" | "auto"` — default `"manual"`
- Optional limit overrides object with the defaults below.

Default limits:

```ts
{
  maxScenesPerAssistantTurn: 1,
  maxScenesPerConversationPerHour: 6,
  maxScenesPerConversationPerDay: 20,
  maxScenesGlobalPerMinute: 2,
  maxConcurrentSceneGenerations: 1,
  cooldownMsAfterSceneGeneration: 15_000,
}
```

## UX

### On demand

A **Create scene** action appears for assistant messages in character chats. When clicked:

1. Resolve the active conversation and confirm it is character-bound.
2. Build scene context from current conversation only.
3. Compile the image prompt.
4. Check local rate limits.
5. Append/update an inline scene card.
6. Call image generation via `veniceFetch('/image/generate')`.
7. Update the card to `complete`, `failed`, `blocked`, or `rate_limited`.

### Automatic

When enabled + mode `"auto"`, after the assistant stream completes:

1. Inspect only the final assistant message of the current turn.
2. Parse at most one `<venice_forge_scene_request>` marker.
3. Strip the marker from visible text.
4. If valid, run the same pipeline as on-demand.
5. Ignore malformed markers, multiple markers, markers in user text, and markers in older assistant messages.

## Rate limiting

Local app-side throttling applies before any Venice API call and covers automatic generation, on-demand creation, retry, and regenerate. If blocked, update the card with:

> Scene generation paused to prevent over-generation.

Limits are per-conversation-hour, per-conversation-day, global-per-minute, per-assistant-turn, concurrent, and cooldown-based.

## Safety and network path

The service must:

1. Validate the feature is enabled and the conversation is character-bound.
2. Run `assessScenePrompt(prompt, negativePrompt, getEffectiveRendererLocalFamilySafeModeEnabled())` before the API call.
3. Build payload with `buildImagePayload()` (which applies `applyVeniceApiSafeMode`).
4. Dispatch only through `veniceFetch()`.
5. Persist only through `useMediaStore.upsert()`.

No raw fetch from components. No bypassing guards, allowlists, or bridge validation.

## Tests

Add the test files listed in the requirements, covering:

- setting defaults off
- manual scene button inert when off
- manual generation works when on + character-bound
- automatic generation works only when on + auto mode
- non-character chat cannot generate scenes
- context uses only active conversation
- context excludes hidden injectedContext
- context handles ContentPart[] text and ignores image data URLs
- parser accepts one valid marker and rejects malformed/multiple/user markers
- rate limiter blocks repeated generation before API call
- stop prevents post-stream automatic generation
- successful/failed image API updates card correctly
- copy prompt exposes compiled prompt
- existing normal chat and multimodal chat still work

## Validation

Run before completion:

```bash
npm run lint:eslint
npm run typecheck
npm test -- --fileParallelism=false
npm run verify:safety-guard
npm run verify:network-boundaries
npm run verify:markdown-links
npm run verify:contracts
npm run build
```

Also run the targeted new scene-generation tests.
