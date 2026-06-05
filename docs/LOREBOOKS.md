# Lorebooks

> A lorebook is a **world-info book**: a named collection of entries that are inserted into the prompt only when their **trigger keys** appear in the recent conversation text. They are the standard mechanism for adding structured worldbuilding (locations, factions, items, lore) to a chat without bloating the always-on system prompt.

## Concepts

| Term | Meaning |
|---|---|
| **Lorebook** | Named container of entries. `LorebookV1 = { schema, id, name, description?, entries: LorebookEntryV1[] }` |
| **Entry** | A unit of world info. `{ id, keys: string[], content: string, constant: boolean, matchWholeWords: boolean, insertionMode: 'before_char'\|'after_char'\|'at_depth', insertionOrder: number, enabled: boolean }` |
| **Constant entry** | Always included when the lorebook is active (regardless of trigger text). Useful for system-level framing. |
| **Insertion mode** | Where in the prompt the entry's content is placed. See below. |
| **Whole-word match** | When `true`, trigger keys match only on word boundaries (`/\<key\>/i`); otherwise substring match. |

## Trigger evaluation

`lorebookService.entryMatches(entry, text)` evaluates one entry against the recent-message text:

1. If `entry.constant` and `entry.enabled` → match.
2. Else if `entry.keys` is empty → no match.
3. Else for each key:
   - If `entry.matchWholeWords`, build `\b<escaped-key>\b` regex and test.
   - Else, case-insensitive substring search.
4. Match if **any** key matches.

`selectTriggeredEntries(lorebook, text)` evaluates the entire lorebook and returns the triggered entries sorted by `insertionOrder` (ascending). At most **50 entries** are returned (cap; a console warning is logged in dev only).

## Insertion modes

The mode controls **where** the entry's content is placed in the assembled prompt. The order is fixed (see `promptBuilderService`):

| Mode | Position in prompt |
|---|---|
| `before_char` | Between the **persona** block and the **characters** block. Useful for framing the user's role before introducing characters. |
| `after_char` | Between the **characters** block and the **scenario** block. Useful for world rules, locations, factions. |
| `at_depth` | At the bottom of the system stack, just before the **recent messages** block. Useful for "do not break character" rules, formatting hints, late-injected facts. |

`insertionOrder` controls the **relative order** of entries that share the same insertion mode. Lower numbers come first.

## Pure-function contract

The lorebook evaluator is **pure** — no I/O, no globals, deterministic for a given input. This is critical for the prompt-builder trace: the same `LorebookV1` + text always produces the same `triggered[]`. The renderer tests assert this in `tests/rp/lorebook.test.ts`.

## Validation

`validateLorebook(value)` is used at the persistence boundary. It rejects:

- Non-object inputs
- Missing `schema` (must be `"LorebookV1"`)
- Missing or invalid `id` (must satisfy `VALID_ID_RE`)
- `entries` array exceeding `MAX_LOREBOOK_ENTRIES` (500)

`normalizeEntry` clamps a single entry:

- Generates a valid id if missing
- Clamps `content` to `MAX_LOREBOOK_ENTRY_CHARS` (4000)
- Caps `keys` to the first 32 entries
- Defaults `insertionMode` to `after_char`
- Defaults `insertionOrder` to 100
- Truncates malformed values

## Limits

- `MAX_LOREBOOK_ENTRIES` = 500 per book
- `MAX_LOREBOOK_ENTRY_CHARS` = 4 000 per entry content
- 50 triggered entries per `selectTriggeredEntries` call (defense-in-depth; the prompt builder's own budget is independent)
- All IDs validated against `VALID_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/`

## Safety

Lorebook content is treated like any other user-supplied prompt text. The `assessRpContext` wrapper extracts the active lorebook entries' content as part of the chat-completion payload before forwarding to the model — so any CSAM, minor sexualization, or age-evasion content in a lorebook entry is **blocked at the same boundary as the chat itself**. There is no separate "lorebook safety" path.

## See also

- [CHARACTER_RP.md](./CHARACTER_RP.md) — full RP studio overview
- [MEMORY.md](./MEMORY.md) — RP memory model
- `src/services/rp/lorebookService.ts` — pure evaluator
- `src/services/rp/lorebookRendererService.ts` — IPC/IndexedDB wrapper
- `tests/rp/lorebook.test.ts` — comprehensive evaluator tests
