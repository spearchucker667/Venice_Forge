/**
 * @fileoverview Pure prompt builder for the local-first Character RP Studio.
 *
 * Deterministic, testable, no I/O. Produces:
 *   1. System messages in a strict, documented order
 *   2. A list of recent user/assistant/character/narrator messages
 *   3. A trace entry for every candidate block, with include/exclude reasons
 *
 * The order is:
 *   1. Safety preamble (always first)
 *   2. Model identity (from modelSystemPrompt)
 *   3. Persona
 *   4. Characters (one block per active character, in chat.characterIds order)
 *   5. Scenario
 *   6. Lorebook entries (matched, ordered, with insertion mode)
 *   7. Memory (pinned first, then character-scoped, then long-term, budget-aware)
 *   8. Recent messages (oldest-first, budget-aware by message count)
 *   9. Active turn instruction (names the responding character(s))
 *  (the user message is appended by the caller at the end, not by this builder)
 *
 * Safety:
 *   - The safety guard is NOT invoked here. The caller MUST run the guard
 *     against the assembled messages before sending to Venice. The builder
 *     is a presentation function, not a content-policy function.
 *   - Raw prompt text is NEVER logged. Trace labels are static, not user-derived.
 */

import type {
  CharacterCardV1,
  LorebookEntryV1,
  PromptAssemblyResult,
  PromptAssemblyTraceEntry,
  RpChatV1,
  RpMemoryV1,
  RpMessageV1,
  RpPromptContext,
  UserPersonaV1,
} from "../../types/rp";

/** Static safety preamble. Kept short and stable; never contains user content. */
export const SAFETY_PREAMBLE =
  "You are participating in a fictional roleplay with a consenting adult user. " +
  "You must decline any request to sexualize, romanticize, or otherwise target minors " +
  "(any person under 18) regardless of framing, fictionality, or animation. " +
  "You must not produce child sexual abuse material in any form. " +
  "If a user request conflicts with these rules, refuse and offer a safe alternative.";

/** Returns the first character of the active roster, deterministically. */
function defaultExpectedCharacterId(chat: RpChatV1): string | undefined {
  return chat.characterIds[0];
}

/** Stable id factory for trace entries. */
function tid(kind: string, key: string): string {
  return `${kind}:${key}`;
}

/** Trims and clamps a content string to a maximum length. Trailing ellipsis on trim. */
function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  if (max <= 1) return s.slice(0, max);
  return s.slice(0, max - 1) + "\u2026";
}

/** Joins lines with single newlines; trims trailing whitespace. */
function block(...lines: (string | undefined | null | false)[]): string {
  return lines.filter((l): l is string => typeof l === "string" && l.length > 0).join("\n");
}

/** Determines which character(s) should be marked as the active responder. */
function resolveExpectedCharacterIds(ctx: RpPromptContext): string[] {
  if (ctx.expectedCharacterId) return [ctx.expectedCharacterId];
  const id = defaultExpectedCharacterId(ctx.rpChat);
  return id ? [id] : [];
}

/** Matches a single keyword against the trigger rules. */
function keywordMatches(
  keyword: string,
  haystack: string,
  options: { caseSensitive: boolean; matchWholeWords: boolean },
): boolean {
  if (!keyword) return false;
  const k = options.caseSensitive ? keyword : keyword.toLowerCase();
  const h = options.caseSensitive ? haystack : haystack.toLowerCase();
  if (!options.matchWholeWords) return h.includes(k);
  const re = new RegExp(
    `(^|[^A-Za-z0-9_])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9_]|$)`,
    "g",
  );
  return re.test(h);
}

/** Returns true when a lorebook entry matches the given recent text window. */
function entryTriggers(entry: LorebookEntryV1, recentText: string): boolean {
  if (!entry.enabled) return false;
  if (entry.constant) return true;
  const keys = entry.keys.length > 0 ? entry.keys : entry.secondaryKeys ?? [];
  for (const k of keys) {
    if (keywordMatches(k, recentText, { caseSensitive: entry.caseSensitive, matchWholeWords: entry.matchWholeWords })) {
      return true;
    }
  }
  return false;
}

/** Assembles the active-character roster text block (one entry per character). */
export function buildCharactersBlock(characters: CharacterCardV1[]): string {
  if (characters.length === 0) return "";
  return characters
    .map((c) => {
      const desc = c.description ? c.description.trim() : "";
      const sys = c.systemPrompt ? c.systemPrompt.trim() : "";
      const instructions = c.instructions ? c.instructions.trim() : "";
      const ex = c.exampleDialogues
        .filter((d) => d.speaker && d.text)
        .map((d) => `  ${d.speaker}: ${d.text}`)
        .join("\n");
      return block(
        `[Character: ${c.name}]`,
        desc,
        instructions ? `[Creator instructions]\n${instructions}` : undefined,
        sys,
        ex ? `Example exchanges:\n${ex}` : undefined,
      );
    })
    .filter((s) => s.length > 0)
    .join("\n\n");
}

/** Assembles the persona block. */
function buildPersonaBlock(persona: UserPersonaV1 | undefined): string {
  if (!persona) return "";
  return block(
    `[User persona: ${persona.name}]`,
    persona.description,
    persona.reference ? `Refer to the user as "${persona.reference}".` : undefined,
  );
}

/** Assembles the scenario block. */
function buildScenarioBlock(ctx: RpPromptContext): string {
  const override = ctx.rpChat.scenario?.trim();
  if (override) return `[Scenario]\n${override}`;
  const first = ctx.characters[0];
  const fromCard = first?.scenario?.trim();
  if (fromCard) return `[Scenario]\n${fromCard}`;
  return "";
}

/** Returns the recent message window used for lorebook trigger scanning. */
function buildTriggerWindow(messages: RpMessageV1[], recentBudget: number): string {
  const tail = messages.slice(-Math.max(1, recentBudget));
  return tail
    .filter((m) => m.role !== "tool" && m.content)
    .map((m) => m.content)
    .join(" ");
}

/** Builds the memory block with strict scoping order. */
function buildMemoryBlock(memories: RpMemoryV1[], budget: number): { text: string; included: number } {
  if (memories.length === 0 || budget <= 0) return { text: "", included: 0 };
  // Order: pinned -> character (any character) -> long-term. Stable within scope by createdAt asc.
  const scopeOrder: Record<RpMemoryV1["scope"], number> = { pinned: 0, character: 1, "long-term": 2 };
  const sorted = [...memories].sort((a, b) => {
    const so = scopeOrder[a.scope] - scopeOrder[b.scope];
    if (so !== 0) return so;
    return a.createdAt - b.createdAt;
  });

  const lines: string[] = [];
  let used = 0;
  for (const m of sorted) {
    if (!m.content) continue;
    const prefix = m.scope === "pinned" ? "[pinned] " : m.scope === "character" ? `[${m.characterId ?? "character"}] ` : "";
    const line = `- ${prefix}${m.content}`;
    if (used + line.length > budget) {
      const remaining = budget - used;
      if (remaining > 4) {
        lines.push(clamp(line, remaining));
      }
      break;
    }
    lines.push(line);
    used += line.length;
  }
  return { text: lines.join("\n"), included: lines.length };
}

/** Builds the lorebook block, partitioned by insertion mode. */
interface PartitionedLorebookEntries {
  before: LorebookEntryV1[];
  after: LorebookEntryV1[];
  atDepth: Array<{ entry: LorebookEntryV1; depth: number }>;
}
function partitionLorebookEntries(entries: LorebookEntryV1[]): PartitionedLorebookEntries {
  const out: PartitionedLorebookEntries = { before: [], after: [], atDepth: [] };
  for (const e of entries) {
    if (e.insertionMode === "before_char") out.before.push(e);
    else if (e.insertionMode === "after_char") out.after.push(e);
    else {
      const depth = typeof e.depth === "number" ? Math.max(0, Math.floor(e.depth)) : 0;
      out.atDepth.push({ entry: e, depth });
    }
  }
  const byOrderAsc = (a: LorebookEntryV1, b: LorebookEntryV1) => a.order - b.order || a.id.localeCompare(b.id);
  out.before.sort(byOrderAsc);
  out.after.sort(byOrderAsc);
  out.atDepth.sort((a, b) => a.depth - b.depth || byOrderAsc(a.entry, b.entry));
  return out;
}

/** Picks recent messages, dropping tool/system and respecting the count budget. */
function pickRecentMessages(
  messages: RpMessageV1[],
  recentBudget: number,
): RpMessageV1[] {
  if (recentBudget <= 0) return [];
  const filtered = messages.filter((m) => m.role === "user" || m.role === "character" || m.role === "narrator");
  return filtered.slice(-recentBudget);
}

/** Formats a character response to an internal chat message (no truncation here).
 *  Caller guarantees `m.role` is one of "user" | "character" | "narrator". */
function toRecentMessage(m: RpMessageV1): { role: "user" | "character" | "narrator"; content: string; characterId?: string; name?: string } {
  const out: { role: "user" | "character" | "narrator"; content: string; characterId?: string; name?: string } = {
    role: m.role as "user" | "character" | "narrator",
    content: m.content,
  };
  if (m.role === "character" && m.characterId) out.characterId = m.characterId;
  return out;
}

/**
 * Builds the prompt for a single RP turn. Pure function: same input -> same output.
 * Returns a fully-traced prompt assembly result. Caller is responsible for running
 * the safety guard and for forwarding the assembled payload to the transport.
 */
export function buildRpPrompt(ctx: RpPromptContext): PromptAssemblyResult {
  const trace: PromptAssemblyTraceEntry[] = [];
  const systemMessages: { role: "system"; content: string; name?: string }[] = [];
  const recentMessages: { role: "user" | "character" | "narrator"; content: string; characterId?: string; name?: string }[] = [];

  // 1. Safety preamble — always present.
  systemMessages.push({ role: "system", content: SAFETY_PREAMBLE });
  trace.push({ id: tid("safety-preamble", "static"), kind: "safety-preamble", label: "Safety preamble", chars: SAFETY_PREAMBLE.length, included: true });

  // 2. Model identity.
  const modelSys = ctx.modelSystemPrompt?.trim() ?? "";
  if (modelSys) {
    systemMessages.push({ role: "system", content: modelSys });
    trace.push({ id: tid("model-identity", "model"), kind: "model-identity", label: "Model identity", chars: modelSys.length, included: true });
  } else {
    trace.push({ id: tid("model-identity", "model"), kind: "model-identity", label: "Model identity", chars: 0, included: false, reason: "empty" });
  }

  // 3. Persona.
  const personaBlock = buildPersonaBlock(ctx.persona);
  if (personaBlock) {
    systemMessages.push({ role: "system", content: personaBlock });
    trace.push({ id: tid("persona", ctx.persona?.id ?? "none"), kind: "persona", label: ctx.persona ? `Persona: ${ctx.persona.name}` : "Persona", chars: personaBlock.length, included: true, sourceId: ctx.persona?.id });
  } else {
    trace.push({ id: tid("persona", "none"), kind: "persona", label: "Persona", chars: 0, included: false, reason: "empty" });
  }

  // 4. Characters — one block per active card, in chat order. Validated against the cap.
  const activeCards: CharacterCardV1[] = [];
  for (const cid of ctx.rpChat.characterIds) {
    const card = ctx.characters.find((c) => c.id === cid);
    if (card) activeCards.push(card);
  }
  for (const card of activeCards) {
    const content = buildCharactersBlock([card]);
    if (content) {
      systemMessages.push({ role: "system", content, name: card.name });
      trace.push({ id: tid("character", card.id), kind: "character", label: `Character: ${card.name}`, chars: content.length, included: true, sourceId: card.id });
    } else {
      trace.push({ id: tid("character", card.id), kind: "character", label: `Character: ${card.name}`, chars: 0, included: false, reason: "empty", sourceId: card.id });
    }
  }

  // 5. Scenario.
  const scenario = buildScenarioBlock(ctx);
  if (scenario) {
    systemMessages.push({ role: "system", content: scenario });
    trace.push({ id: tid("scenario", "ctx"), kind: "scenario", label: "Scenario", chars: scenario.length, included: true });
  } else {
    trace.push({ id: tid("scenario", "ctx"), kind: "scenario", label: "Scenario", chars: 0, included: false, reason: "empty" });
  }

  // 6. Lorebooks.
  const recentWindow = buildTriggerWindow(ctx.rpChat.messages, ctx.recentMessageBudget);
  for (const lb of ctx.lorebooks) {
    const triggered = lb.entries.filter((e) => entryTriggers(e, recentWindow));
    if (triggered.length === 0) {
      trace.push({ id: tid("lorebook", lb.id), kind: "lorebook-entry", label: `Lorebook: ${lb.name}`, chars: 0, included: false, reason: "no-trigger", sourceId: lb.id });
      continue;
    }
    const partitioned = partitionLorebookEntries(triggered);
    // before_char: prepend at the start of the character block (here: at the current end of systemMessages, before scenario/memory)
    // For simplicity and determinism, we insert "before_char" entries BEFORE the active-turn-instruction (at the end of system).
    // The caller treats all system messages as an ordered list, so we just append in the right places.
    const beforeText = partitioned.before.map((e) => e.content).filter(Boolean).join("\n");
    const afterText = partitioned.after.map((e) => e.content).filter(Boolean).join("\n");
    const atDepthText = partitioned.atDepth
      .sort((a, b) => a.depth - b.depth)
      .map((p) => p.entry.content)
      .filter(Boolean)
      .join("\n");

    // Track per-lorebook usage in the trace.
    const beforeChars = beforeText.length;
    const afterChars = afterText.length;
    const atDepthChars = atDepthText.length;
    if (beforeChars > 0) {
      trace.push({ id: tid("lorebook-entry", `${lb.id}:before`), kind: "lorebook-entry", label: `Lorebook ${lb.name} (before char)`, chars: beforeChars, included: true, sourceId: lb.id });
    }
    if (afterChars > 0) {
      trace.push({ id: tid("lorebook-entry", `${lb.id}:after`), kind: "lorebook-entry", label: `Lorebook ${lb.name} (after char)`, chars: afterChars, included: true, sourceId: lb.id });
    }
    if (atDepthChars > 0) {
      trace.push({ id: tid("lorebook-entry", `${lb.id}:at_depth`), kind: "lorebook-entry", label: `Lorebook ${lb.name} (at depth)`, chars: atDepthChars, included: true, sourceId: lb.id });
    }
    // We bundle them into a single system message keyed on the lorebook name to keep order deterministic.
    const bundled = block(
      beforeText ? `[Lorebook: ${lb.name}]\n${beforeText}` : undefined,
      afterText ? `[Lorebook: ${lb.name} (continued)]\n${afterText}` : undefined,
      atDepthText ? `[Lorebook: ${lb.name} (depth)]\n${atDepthText}` : undefined,
    );
    if (bundled) systemMessages.push({ role: "system", content: bundled });
  }

  // 7. Memory.
  const mem = buildMemoryBlock(ctx.memories, Math.max(0, Math.floor(ctx.systemBlockBudget / 4)));
  if (mem.text) {
    systemMessages.push({ role: "system", content: `[Memory]\n${mem.text}` });
    trace.push({ id: tid("memory", "block"), kind: "memory", label: "Memory block", chars: mem.text.length, included: true });
  } else if (ctx.memories.length > 0) {
    trace.push({ id: tid("memory", "block"), kind: "memory", label: "Memory block", chars: 0, included: false, reason: "budget-exceeded" });
  } else {
    trace.push({ id: tid("memory", "block"), kind: "memory", label: "Memory block", chars: 0, included: false, reason: "empty" });
  }

  // 8. Recent messages — append to the recent list (NOT to system). Trace records the pick.
  const recent = pickRecentMessages(ctx.rpChat.messages, ctx.recentMessageBudget);
  for (const m of recent) {
    recentMessages.push(toRecentMessage(m));
  }
  trace.push({ id: tid("recent-message", "list"), kind: "recent-message", label: `Recent messages (${recent.length})`, chars: recent.reduce((s, m) => s + m.content.length, 0), included: recent.length > 0 });

  // 9. Active-turn instruction — names the responding character(s).
  const expected = resolveExpectedCharacterIds(ctx);
  const expectedNames = expected
    .map((id) => ctx.characters.find((c) => c.id === id)?.name)
    .filter((n): n is string => typeof n === "string" && n.length > 0);
  if (expectedNames.length > 0) {
    const turnText = `You are now playing: ${expectedNames.join(", ")}. Respond in character.`;
    systemMessages.push({ role: "system", content: turnText });
    trace.push({ id: tid("active-turn-instruction", expected.join(",")), kind: "active-turn-instruction", label: `Active turn: ${expectedNames.join(", ")}`, chars: turnText.length, included: true });
  } else {
    trace.push({ id: tid("active-turn-instruction", "none"), kind: "active-turn-instruction", label: "Active turn instruction", chars: 0, included: false, reason: "empty" });
  }

  // Budget enforcement on the system block. Drop trailing system messages until we fit.
  const budget = Math.max(0, Math.floor(ctx.systemBlockBudget));
  let total = systemMessages.reduce((s, m) => s + m.content.length, 0);
  let budgetExceeded = false;
  while (total > budget && systemMessages.length > 1) {
    const removed = systemMessages.pop();
    if (!removed) break;
    total -= removed.content.length;
    budgetExceeded = true;
    // Mark the corresponding trace entry as dropped due to budget.
    let lastIdx = -1;
    for (let i = trace.length - 1; i >= 0; i--) {
      const e = trace[i];
      if (!e) continue;
      if (e.included && (e.kind === "lorebook-entry" || e.kind === "scenario" || e.kind === "character" || e.kind === "memory" || e.kind === "model-identity" || e.kind === "persona")) {
        lastIdx = i;
        break;
      }
    }
    if (lastIdx >= 0) {
      const entry = trace[lastIdx];
      if (entry) {
        entry.included = false;
        entry.reason = "budget-exceeded";
        entry.chars = 0;
      }
    }
  }

  // Final user message — verbatim, never traced as content.
  const userMessage = { role: "user" as const, content: ctx.currentUserMessage };
  trace.push({ id: tid("user-message", "final"), kind: "user-message", label: "User message", chars: userMessage.content.length, included: true });

  return {
    systemMessages,
    recentMessages,
    userMessage,
    trace,
    totalSystemChars: total,
    budgetExceeded,
  };
}
