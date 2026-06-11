# RP Memory

> The RP memory model extends Venice Forge's existing `memoryService` (per-conversation facts) with **scoped, priority-ordered memories** for character roleplay. It is intentionally simple: memories are plain text records tagged with a `scope` and a `characterId` (when relevant). The prompt builder is responsible for selecting the right memories within a budget.

## Concepts

| Term | Meaning |
|---|---|
| **Memory** | A plain-text fact. `RpMemoryV1 = { schema, id, content, scope, characterId?, tags, createdAt, updatedAt }` |
| **Scope** | One of `pinned` \| `long-term` \| `character`. Determines priority and selection rules. |
| **Active character** | A character in the chat roster. Only `character`-scoped memories tied to an active character are eligible. |

## Scopes

| Scope | Meaning | Selection |
|---|---|---|
| `pinned` | Always-included facts (user preferences, hard rules). Override everything else. | Top N (default 8) by `updatedAt` desc. |
| `character` | Facts tied to a specific character (their preferences, history, vocabulary). | Filtered to active character ids, top N per character by `updatedAt` desc. |
| `long-term` | Background facts (world rules, session summaries). | Top N by `updatedAt` desc. |

`selectMemoriesForChat(memories, ctx)` returns a single ordered list, **scope by scope**: all pinned → all character → all long-term. Within a scope, sorted by `updatedAt` desc. The total char count is bounded by `RP_MEMORY_MAX_CHARS = 2000` (LIFO; the prompt builder handles the cross-block budget on top of this).

## The existing memory service

The pre-existing `src/services/memoryService.ts` is **unchanged** and continues to work for the original chat tab (per-conversation, flat). The new `rpMemoryService` is additive — it does not consume the old store and is only used in the RP Studio. The two services share the same IndexedDB store naming conventions but use different store names (`ai_memory` vs future `rp_memories` once enabled). Today the renderer-side `rpMemoryService` operates on in-memory lists; persistence of RP memories is part of a follow-up.

## Validation

`isValidRpMemory` and `normalizeRpMemory` enforce:

- `schema === "RpMemoryV1"`
- Valid `id` (must satisfy `VALID_ID_RE`)
- `scope` is one of the three allowed values
- `characterId` (if present) also satisfies `VALID_ID_RE`
- `content` trimmed, capped at 4 000 chars
- `tags` array (≤ 32), each tag ≤ 64 chars
- Numeric `createdAt` and `updatedAt`

## Pure-function contract

The selection logic is pure — same input → same output. Tests in `tests/rp/rpMemory.test.ts` lock in:

- Scope ordering: pinned before character before long-term, regardless of `updatedAt`.
- Character filtering: character-scoped memories not tied to an active character are dropped.
- Recency: within a scope, most recently updated first.
- Per-scope caps: `pinned ≤ 8`, `character ≤ 5 per character`, `long-term ≤ 8`.
- Budget: total chars across all returned memories ≤ `RP_MEMORY_MAX_CHARS`.

## Limits

- `RP_MEMORY_MAX_CHARS` = 2 000 (default; per-chat override via `ctx.memoryBudgetChars`)
- `pinned` cap: 8 memories
- `character` cap: 5 memories per active character
- `long-term` cap: 8 memories
- Per-memory content: 4 000 chars
- Tags per memory: 32
- Tag length: 64 chars

## Safety

Memories are **user-supplied text** from the user's perspective (whether authored manually or captured automatically). `assessRpContext` includes memory content as part of the chat-completion payload, so any CSAM / minor sexualization / age-evasion content in a memory is **blocked at the same boundary as the chat itself**. There is no separate "memory safety" path.

## See also

- [CHARACTER_RP.md](./CHARACTER_RP.md) — full RP studio overview
- `src/services/rp/rpMemoryService.ts` — selector and validators
- `src/services/memoryService.ts` — the original (unchanged) memory service
- `tests/rp/rpMemory.test.ts` — selector tests
