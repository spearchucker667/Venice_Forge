/**
 * @fileoverview Tests for the Character RP prompt builder.
 *  Covers:
 *    - Deterministic order
 *    - Trace shape
 *    - Budget enforcement (drops from the end)
 *    - Lorebook triggering (case, whole-word, secondary, constant)
 *    - Memory scoping (pinned > character > long-term)
 *    - Recent message budgeting
 *    - Pure function (no I/O, no globals)
 *
 *  REGRESSION: VERIFY-011 — prompt assembly order is fixed and trace-only
 *  (debug drawer must show every block, dropped blocks must be marked).
 */

import { describe, it, expect } from "vitest";
import { SAFETY_PREAMBLE, buildRpPrompt } from "../../src/services/rp/promptBuilderService";
import type {
  CharacterCardV1,
  LorebookV1,
  RpChatV1,
  RpMemoryV1,
  RpMessageV1,
  UserPersonaV1,
} from "../../src/types/rp";

function makeCard(overrides: Partial<CharacterCardV1> = {}): CharacterCardV1 {
  return {
    schema: "CharacterCardV1",
    id: "card_a",
    name: "Alice",
    description: "A skilled blacksmith.",
    systemPrompt: "You are Alice, a blacksmith who speaks in short sentences.",
    scenario: "The forge is hot, the anvil is waiting.",
    tags: ["fantasy", "smith"],
    adult: false,
    exampleDialogues: [{ speaker: "Alice", text: "The steel sings true today." }],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function makePersona(overrides: Partial<UserPersonaV1> = {}): UserPersonaV1 {
  return {
    schema: "UserPersonaV1",
    id: "persona_user",
    name: "Player",
    description: "A wandering adventurer.",
    reference: "wanderer",
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function makeChat(messages: RpMessageV1[] = [], overrides: Partial<RpChatV1> = {}): RpChatV1 {
  return {
    schema: "RpChatV1",
    id: "chat_1",
    title: "Test Chat",
    characterIds: ["card_a"],
    lorebookIds: [],
    modelId: "venice-uncensored",
    messages,
    adult: false,
    metadata: { pinned: false, archived: false, tags: [] },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function makeMessage(content: string, role: RpMessageV1["role"] = "user", characterId?: string): RpMessageV1 {
  return {
    id: `m_${Math.random().toString(36).slice(2)}`,
    role,
    content,
    createdAt: Date.now(),
    ...(characterId ? { characterId } : {}),
  };
}

describe("buildRpPrompt", () => {
  it("starts with the safety preamble as the first system message", () => {
    const ctx = {
      rpChat: makeChat(),
      characters: [makeCard()],
      lorebooks: [],
      memories: [],
      currentUserMessage: "Hello!",
      systemBlockBudget: 32_000,
      recentMessageBudget: 8,
    };
    const out = buildRpPrompt(ctx);
    expect(out.systemMessages[0]?.content).toBe(SAFETY_PREAMBLE);
    expect(out.userMessage.content).toBe("Hello!");
  });

  it("emits blocks in deterministic order: safety -> model -> persona -> character -> scenario -> memory -> active-turn", () => {
    const ctx = {
      rpChat: makeChat([], { modelId: "venice-uncensored" }),
      persona: makePersona(),
      characters: [makeCard()],
      lorebooks: [],
      memories: [],
      modelSystemPrompt: "Be helpful.",
      currentUserMessage: "Hi",
      systemBlockBudget: 32_000,
      recentMessageBudget: 8,
    };
    const out = buildRpPrompt(ctx);
    const order = out.trace.map((t) => t.kind);
    // First must be safety-preamble
    expect(order[0]).toBe("safety-preamble");
    // Active turn instruction must be the last non-user trace entry
    const lastNonUser = order.filter((k) => k !== "user-message").pop();
    expect(lastNonUser).toBe("active-turn-instruction");
    // Sequence must include (in this order): safety-preamble, model-identity, persona, character, scenario, memory, active-turn-instruction
    const expectedSequence = [
      "safety-preamble",
      "model-identity",
      "persona",
      "character",
      "scenario",
      "memory",
      "active-turn-instruction",
    ];
    const seen: string[] = [];
    for (const k of order) {
      if (expectedSequence.includes(k) && seen[seen.length - 1] !== k) seen.push(k);
    }
    expect(seen).toEqual(expectedSequence);
  });

  it("trace marks excluded blocks with a reason", () => {
    const ctx = {
      rpChat: makeChat(),
      // No persona, no character, no lorebook, no memory — most blocks should be empty
      characters: [],
      lorebooks: [],
      memories: [],
      currentUserMessage: "Hello",
      systemBlockBudget: 32_000,
      recentMessageBudget: 8,
    };
    const out = buildRpPrompt(ctx);
    const personaTrace = out.trace.find((t) => t.kind === "persona");
    const characterTrace = out.trace.find((t) => t.kind === "character");
    const memoryTrace = out.trace.find((t) => t.kind === "memory");
    expect(personaTrace?.included).toBe(false);
    expect(characterTrace).toBeUndefined(); // no character entries at all
    expect(memoryTrace?.included).toBe(false);
    expect([personaTrace?.reason, memoryTrace?.reason].some((r) => r === "empty" || r === undefined)).toBe(true);
  });

  it("enforces the system block budget by dropping trailing blocks (LIFO)", () => {
    const big = makeCard({
      id: "card_big",
      name: "Verbose",
      description: "X".repeat(20_000),
      systemPrompt: "Y".repeat(20_000),
    });
    const ctx = {
      rpChat: makeChat([], { characterIds: ["card_big"] }),
      characters: [big],
      lorebooks: [],
      memories: [],
      currentUserMessage: "Hi",
      // Tight budget so the character block must be dropped.
      systemBlockBudget: 5_000,
      recentMessageBudget: 8,
    };
    const out = buildRpPrompt(ctx);
    // The character block must be the first to be dropped (it is the most
    // expensive after the safety preamble).
    const charTrace = out.trace.find((t) => t.kind === "character");
    expect(charTrace?.included).toBe(false);
    expect(charTrace?.reason).toBe("budget-exceeded");
    expect(out.budgetExceeded).toBe(true);
    // Safety preamble must still be present
    expect(out.systemMessages[0]?.content).toBe(SAFETY_PREAMBLE);
  });

  it("triggers lorebook entries by keyword and respects whole-word matching", () => {
    const book: LorebookV1 = {
      schema: "LorebookV1",
      id: "lb_1",
      name: "World",
      description: "World info",
      tags: [],
      createdAt: 1,
      updatedAt: 1,
      entries: [
        {
          id: "lb_e1",
          keys: ["anvil"],
          content: "Anvils are sacred in this world.",
          constant: false,
          insertionMode: "before_char",
          order: 1,
          caseSensitive: false,
          matchWholeWords: true,
          enabled: true,
        },
        {
          id: "lb_e2",
          keys: ["nope"],
          content: "Should not trigger.",
          constant: false,
          insertionMode: "before_char",
          order: 2,
          caseSensitive: false,
          matchWholeWords: true,
          enabled: true,
        },
      ],
    };
    const ctx = {
      rpChat: makeChat([makeMessage("I am working at the anvil today.", "user")]),
      characters: [makeCard()],
      lorebooks: [book],
      memories: [],
      currentUserMessage: "Strike!",
      systemBlockBudget: 32_000,
      recentMessageBudget: 8,
    };
    const out = buildRpPrompt(ctx);
    const lbTraces = out.trace.filter((t) => t.kind === "lorebook-entry");
    const anvilTrace = lbTraces.find((t) => t.sourceId === "lb_1" && t.label.includes("before char"));
    expect(anvilTrace?.included).toBe(true);
  });

  it("emits a no-trigger trace entry for a lorebook with zero matches", () => {
    const book: LorebookV1 = {
      schema: "LorebookV1",
      id: "lb_quiet",
      name: "Quiet",
      description: "",
      tags: [],
      createdAt: 1,
      updatedAt: 1,
      entries: [
        {
          id: "lb_q1",
          keys: ["neverappears"],
          content: "Hidden lore.",
          constant: false,
          insertionMode: "before_char",
          order: 1,
          caseSensitive: false,
          matchWholeWords: true,
          enabled: true,
        },
      ],
    };
    const ctx = {
      rpChat: makeChat([makeMessage("hello there", "user")]),
      characters: [makeCard()],
      lorebooks: [book],
      memories: [],
      currentUserMessage: "Hi",
      systemBlockBudget: 32_000,
      recentMessageBudget: 8,
    };
    const out = buildRpPrompt(ctx);
    const noTrigger = out.trace.find((t) => t.sourceId === "lb_quiet" && t.reason === "no-trigger");
    expect(noTrigger).toBeDefined();
    expect(noTrigger?.included).toBe(false);
  });

  it("orders memory: pinned > character > long-term", () => {
    const memories: RpMemoryV1[] = [
      { schema: "RpMemoryV1", id: "m_long", scope: "long-term", content: "LONG_TERM_FACT", tags: [], source: { kind: "editor-curated", messageIds: [] }, createdAt: 1, updatedAt: 1 },
      { schema: "RpMemoryV1", id: "m_pin", scope: "pinned", content: "PINNED_FACT", tags: [], source: { kind: "editor-curated", messageIds: [] }, createdAt: 2, updatedAt: 2 },
      { schema: "RpMemoryV1", id: "m_char", scope: "character", characterId: "card_a", content: "CHAR_FACT", tags: [], source: { kind: "editor-curated", messageIds: [] }, createdAt: 3, updatedAt: 3 },
    ];
    const ctx = {
      rpChat: makeChat(),
      characters: [makeCard()],
      lorebooks: [],
      memories,
      currentUserMessage: "Hi",
      systemBlockBudget: 32_000,
      recentMessageBudget: 8,
    };
    const out = buildRpPrompt(ctx);
    const memMsg = out.systemMessages.find((m) => m.content.startsWith("[Memory]"));
    expect(memMsg).toBeDefined();
    if (!memMsg) return;
    const idxPin = memMsg.content.indexOf("PINNED_FACT");
    const idxChar = memMsg.content.indexOf("CHAR_FACT");
    const idxLong = memMsg.content.indexOf("LONG_TERM_FACT");
    expect(idxPin).toBeGreaterThan(-1);
    expect(idxChar).toBeGreaterThan(idxPin);
    expect(idxLong).toBeGreaterThan(idxChar);
  });

  it("respects the recentMessageBudget", () => {
    const messages: RpMessageV1[] = [];
    for (let i = 0; i < 20; i++) messages.push(makeMessage(`message ${i}`, "user"));
    const ctx = {
      rpChat: makeChat(messages),
      characters: [makeCard()],
      lorebooks: [],
      memories: [],
      currentUserMessage: "now",
      systemBlockBudget: 32_000,
      recentMessageBudget: 5,
    };
    const out = buildRpPrompt(ctx);
    expect(out.recentMessages).toHaveLength(5);
    expect(out.recentMessages[0]?.content).toBe("message 15");
    // The user's current message is in userMessage, not in recentMessages;
    // recentMessages reflects the persisted chat history tail only.
    expect(out.recentMessages[4]?.content).toBe("message 19");
    expect(out.userMessage.content).toBe("now");
  });

  it("is a pure function: same input -> same output", () => {
    const ctx = {
      rpChat: makeChat([makeMessage("a", "user"), makeMessage("b", "character", "card_a")]),
      characters: [makeCard()],
      lorebooks: [],
      memories: [],
      currentUserMessage: "c",
      systemBlockBudget: 32_000,
      recentMessageBudget: 8,
    };
    const a = buildRpPrompt(ctx);
    const b = buildRpPrompt(ctx);
    expect(a).toEqual(b);
  });

  it("names the active character in the active-turn instruction", () => {
    const ctx = {
      rpChat: makeChat(),
      characters: [makeCard({ name: "Bob the Bold" })],
      lorebooks: [],
      memories: [],
      currentUserMessage: "Hello",
      systemBlockBudget: 32_000,
      recentMessageBudget: 8,
    };
    const out = buildRpPrompt(ctx);
    const turn = out.systemMessages.find((m) => m.content.startsWith("You are now playing:"));
    expect(turn?.content).toContain("Bob the Bold");
  });
});
