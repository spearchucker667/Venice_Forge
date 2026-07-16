# Character Roleplay Studio

> **Status:** Production-ready (v1.1.0). All Phase 1-8 deliverables complete; Family Safe Mode is routed at every boundary.

The Character RP Studio is a **local-first** roleplay authoring and runtime environment built on top of Venice Forge. It lets you create character cards, build personas and lorebooks, run multi-character chats, and generate scene images — all persisted to disk on the user's machine, with no external service required to author or review content.

## Why local-first?

Venice Forge's existing **Characters** tab discovers characters hosted at `api.venice.ai`. The RP Studio is the complementary surface: characters you create, edit, and chat with **live on your machine** as JSON files (or encrypted IndexedDB in web mode). Nothing is sent to Venice until you actually call a model — and even then, the request is gated by the existing child-exploitation safety guard at every transport boundary.

## What you can do

| Surface | Description |
|---|---|
| **Character Library** | Grid of local character cards with avatar, name, age, description, adult tag, tags. Search & filter. |
| **ST Card Studio / Character Editor** | Ten-step Character Card V2 editor with standards-aware empty fields, creator notes, personality, post-history instructions, greeting carousel/reorder, raw examples, extension JSON, embedded/linked books, prompt trace, disposable test turn, verified export, encrypted drafts, and proposal-only AI generation/refinement. |
| **Persona Manager** | One or more user personas (name, reference, description, tags). One is "active" per session. |
| **Lorebook Manager** | World-info books with keyword-triggered entries. Each entry: keys, content, insertion mode (`before_char` / `after_char` / `at_depth`), whole-word match, constant. |
| **RP Chat** | Multi-character chat (up to 8 active characters per chat). Per-message role: `user` / `character` / `narrator` / `system` / `tool`. Streaming via Venice text models. Family Safe Mode checks each dispatch when enabled; Adult Mode skips the local filter. |
| **Scene Generator** | Extract a scene prompt from the most recent chat messages (or override), call `/image/generate`, save the asset under `rp_assets` and route the image to `app.getPath("pictures")/Venice Forge/RP/<chatId>/`. Family Safe Mode evaluates every prompt when enabled; Adult Mode skips the local rules while Venice API Safe Mode remains independent. |
| **Character Chat Scenes** | In character-bound conversations in the main Chat tab, generate a scene image on demand ("Create scene") or automatically when the assistant emits `<venice_forge_scene_request>{"intent":"create_scene"}</venice_forge_scene_request>`. The prompt is compiled from the character metadata and visible current-conversation messages only; `injectedContext`, other conversations, memories, and search are excluded. Uses the same `assessScenePrompt` safety guard and `/image/generate` transport as RP Studio scene generation, and persists the image into Media Studio via `useMediaStore.upsert()`. |
| **Asset Gallery** | Browse all scene images, filter by chat, preview, delete. |
| **Prompt Debug Drawer** | Inspect the full prompt assembly: trace (which block was included, why, char count), the assembled system prompt, the recent-message window, and the user message. Pure read-only view; no edits. |

## Storage topology

| Mode | Layout |
|---|---|
| **Electron (desktop)** | `<userData>/characters/<id>/character.json` + optional `avatar.png`<br> `<userData>/personas/<id>.json`<br> `<userData>/lorebooks/<id>.json`<br> `<userData>/rp-chats/<id>.json`<br> `<userData>/rp-assets/<id>.json` |
| **Web** | Encrypted IndexedDB stores: `character_cards`, `personas`, `lorebooks`, `rp_chats`, `rp_assets` |

All IDs are validated against `VALID_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/` (must start alphanumeric — rejects `.` and `..`). Atomic writes (temp + rename, 0o600 mode). Corruption is preserved as `.backup.<ts>.<uuid>` and the bad file is skipped, never destructively replaced.

## Architecture

```
┌──────────────────────────── Renderer ────────────────────────────┐
│ src/components/rp-studio/   (UI: library, editor, chat, scenes)  │
│ src/stores/                 (Zustand: character-card, persona,   │
│                              lorebook, rp-chat, scene-asset)     │
│ src/services/rp/            (renderer services: IPC + IndexedDB) │
│ src/shared/safety/characterImportSafety.ts                       │
│      ↳ assessCharacterImport / assessCharacterBatchImport /     │
│        assessPersonaImport / assessRpContext / assessScenePrompt │
└──────────────────────────────────────────────────────────────────┘
                  ↕ window.veniceForge (preload)
┌───────────────────────── Electron main ──────────────────────────┐
│ electron/ipc/rpHandlers.ts     (20 channels)                     │
│ electron/services/characterCardStorage.ts                       │
│ electron/services/rpChatStorage.ts                              │
│ electron/services/rpStores.ts   (personas, lorebooks, assets)   │
│ electron/services/rpSingleFileStore.ts  (atomic + corruption)    │
└──────────────────────────────────────────────────────────────────┘
```

## Service layer (renderer)

| Service | Purpose |
|---|---|
| `characterCardService` | `listCharacterCards`, `readCharacterCard`, `saveCharacterCard`, `deleteCharacterCard`. Normalizes & clamps inputs. Generates IDs. |
| `personaService` | Same CRUD surface for `UserPersonaV1`. |
| `lorebookRendererService` | Re-exports pure evaluators (`entryMatches`, `selectTriggeredEntries`, `normalizeLorebook`, `validateLorebook`) plus the IPC CRUD surface. |
| `rpChatService` | `listRpChats`, `readRpChat`, `saveRpChat`, `deleteRpChat`, `appendMessage(chat, message)`. Validates `RpMessageV1` shape. |
| `assetService` | `listAssets({chatId}?)`, `readAsset`, `saveAsset`, `deleteAsset`. |
| `sceneGenerationService` | `extractScenePrompt(chat, opts)` and `generateScene(chat, req)`. **Step 1: `assessScenePrompt`.** Step 2: dispatch via `bridge.venice.request` (Electron) or `fetch('/api/venice/image/generate')` (web). Step 3: register asset. Returns a discriminated `SceneGenerationOutcome`. |
| `promptBuilderService` | **Pure** function. `buildRpPrompt(ctx): { systemMessages, userMessages, trace }`. Deterministic order: safety → model → persona → characters → scenario → lorebook (before/after/at_depth) → memory → recent → active-turn. Budget enforcement drops from the end (LIFO) and marks the trace. |
| `lorebookService` (pure) | `entryMatches`, `selectTriggeredEntries`, `normalizeEntry`, `normalizeLorebook`, `validateLorebook`. Constant-only entry keys, ≤ 50 triggered entries per call. |
| `rpMemoryService` | `isValidRpMemory`, `normalizeRpMemory`, `selectMemoriesForChat(memories, ctx)`. Scope order: `pinned` > `character` > `long-term`. Per-scope caps, recency-sorted by `updatedAt` desc. Budget: `RP_MEMORY_MAX_CHARS = 2000`. |

## Safety integration

The existing CSAM guard is the **single point of truth**. The new wrappers in `src/shared/safety/characterImportSafety.ts` are thin adapters that call the existing `assessChildExploitationSafety` with the right `source` / `endpoint`. No new guard logic.

| Boundary | Wrapper | Source / Endpoint |
|---|---|---|
| Character card save / import | `assessCharacterImport(card)` | `ipc` / `/character-card/import` |
| Character batch import | `assessCharacterBatchImport(cards)` | `ipc` / `/character-card/import` |
| Persona save | `assessPersonaImport(persona)` | `ipc` / `/persona/import` |
| RP chat dispatch | `assessRpContext({rpChat, characters, persona, userMessage})` | `ipc` / `/chat/completions` |
| Scene image prompt | `assessScenePrompt(prompt, negative?)` | `image` / `/image/generate` |

Every wrapper:

1. Builds a payload object the existing extractor understands
2. Calls `assessChildExploitationSafety` and returns the decision
3. Calls `recordDecision(decision)` for audit (no PII, no raw text)
4. Never logs raw prompt text

The renderer MUST refuse the user-visible action when `decision.allow === false` or `decision.action === "block"`. The user-facing message is intentionally vague — no terms, no snippets.

### Adult content policy (unchanged from the existing guard)

- **Allowed**: clearly-identified adult sexual content (e.g. `consensual`, `MILF`, `18+`, numeric age ≥ 18).
- **Blocked unconditionally**: any content involving minors, youth-coded subjects, age-evasion attempts, CSAM genre labels (`loli`, `shota`, `shotacon`, `lolicon`, `lolita`), fictional minor sexualization, or obfuscated attempts to disguise any of the above.

The persisted `redTeamMode` field gates raw developer rendering — that is, the Traffic Inspector panel that disables renderer Markdown/HTML formatting and exposes local safety audit signals. The user-visible sidebar label is **Traffic Inspector**; `redTeamMode` is preserved only as the internal Zustand state key for backwards compatibility.

Adult-character visibility is a regular user preference tracked independently of `redTeamMode`. The canonical switch is `localFamilySafeModeEnabled`, which also controls whether the local family filter runs. Venice API Safe Mode remains provider-side and separate from both.

## Prompt assembly contract

The full prompt sent to the model is assembled by `promptBuilderService.buildRpPrompt`. The order is fixed and traced:

1. **Safety preamble** (system) — instructs the model to decline minor sexualization
2. **Model identity** (system) — `ctx.model.systemPrompt` if present
3. **Persona** (system) — the active user persona, formatted
4. **Characters** (system, one block per character) — name, description, system prompt, scenario, tags
5. **Scenario** (system) — chat-level scenario or character scenario fallback
6. **Lorebook entries** (system) — triggered entries inserted in insertion-order:
   - `before_char` entries go between the persona block and the characters block
   - `after_char` entries go between the characters block and the scenario block
   - `at_depth` entries go at the end of the system stack (just before the recent-messages block)
7. **Memory** (system) — `selectMemoriesForChat` with budget
8. **Recent messages** (user/character/narrator) — most recent N messages within budget
9. **Active character turn instruction** (system) — names the character(s) expected to respond this turn

The function is **pure**: same input → same output. The trace is part of the return value and is what the Prompt Debug Drawer renders. This makes prompts fully reproducible and auditable.

## Limits

| Constant | Value | Purpose |
|---|---|---|
| `CARD_FIELD_MAX` | 32 000 | Per-field char cap on `name`, `description`, `systemPrompt`, `scenario` |
| `MAX_TAGS` | 32 | Per-card / per-persona tag cap |
| `MAX_LOREBOOK_ENTRIES` | 500 | Per-lorebook entry cap |
| `MAX_LOREBOOK_ENTRY_CHARS` | 4 000 | Per-entry content cap |
| `MAX_ACTIVE_CHARACTERS` | 8 | Per-chat roster cap |
| `MAX_AVATAR_BYTES` | 1 048 576 | Avatar upload cap (1 MiB) |
| `RP_SCHEMA_VERSION` | 1 | Schema version; bump on breaking changes |

## Tests

- `tests/rp/promptBuilder.test.ts` — order, budget LIFO, lorebook triggering, memory scoping, purity
- `tests/rp/lorebook.test.ts` — entry matching (constant, whole-word, regex escape), validation, normalization
- `tests/rp/rpMemory.test.ts` — scope order, character filtering, recency, per-scope caps
- `tests/rp/characterCardService.test.ts` — normalization, clamping, ID generation
- `tests/safety/characterImportSafety.test.ts` — every wrapper routes to the existing guard correctly
- `tests/csp/inlineStyleInvariant.test.ts` (VERIFY-007) — no JSX inline `style={...}`
- `tests/theme/inlineColorInvariant.test.ts` (VERIFY-010) — no out-of-allowlist inline colors
- `electron/services/characterCardStorage.test.ts` — atomic write, corruption backup, ID validation
- `electron/services/rpChatStorage.test.ts` — message validation, role/characterId coherence
- `electron/services/rpSingleFileStore.test.ts` — generic store factory correctness

All pre-existing CSAM / safety tests remain green.

## See also

- [LOREBOOKS.md](./LOREBOOKS.md) — lorebook entry semantics and insertion-order details
- [MEMORY.md](./MEMORY.md) — RP memory model, scope selection, budgets
- [SCENE_GENERATION.md](./SCENE_GENERATION.md) — scene prompt extraction, image flow, asset routing
- [SECURITY.md](../../SECURITY.md) — safety guard contract
- [AGENTS.md](../../AGENTS.md) — VERIFY-011…014 regression guards
