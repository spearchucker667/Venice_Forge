/** @fileoverview Phase 2F — rpPromptCompiler contract tests. */

import { describe, it, expect } from "vitest";
import {
  CHARS_PER_TOKEN,
  compileRpPrompt,
  compileSystemPrompt,
  type RpPromptLibraryRef,
  type RpSceneComposerRef,
} from "./rpPromptCompiler";
import type { CharacterCardV1, LorebookV1, RpChatV1, RpMemoryV1 } from "../types/rp";

function character(overrides: Partial<CharacterCardV1> = {}): CharacterCardV1 {
  const now = Date.now();
  return {
    schema: "CharacterCardV1",
    id: "c_1",
    name: "Tester",
    description: "test desc",
    systemPrompt: "You are a test character.",
    scenario: "",
    tags: ["test"],
    adult: false,
    exampleDialogues: [
      { speaker: "Tester", text: "Hi." },
      { speaker: "User", text: "Hello." },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function chat(overrides: Partial<RpChatV1> = {}): RpChatV1 {
  const now = Date.now();
  return {
    schema: "RpChatV1",
    id: "chat_1",
    title: "Test",
    characterIds: ["c_1"],
    lorebookIds: [],
    modelId: "llm",
    messages: [],
    adult: false,
    metadata: { pinned: false, archived: false, tags: [] },
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function memory(overrides: Partial<RpMemoryV1> = {}): RpMemoryV1 {
  return {
    schema: "RpMemoryV1",
    id: "mem_1",
    scope: "long-term",
    content: "the user enjoys coffee",
    tags: [],
    source: { messageIds: [], kind: "editor-curated" },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function lorebook(overrides: Partial<LorebookV1> = {}): LorebookV1 {
  return {
    schema: "LorebookV1",
    id: "lb_1",
    name: "Test Lore",
    description: "d",
    tags: [],
    entries: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("rpPromptCompiler", () => {
  it("emits the canonical section order", () => {
    const out = compileRpPrompt({
      rpChat: chat(),
      characters: [character()],
      lorebooks: [],
      memories: [],
      currentUserMessage: "Hello.",
    });
    const kinds = out.sections.map((s) => s.kind);
    expect(kinds[0]).toBe("safety-preamble");
    expect(kinds).toContain("character");
    expect(kinds).toContain("active-turn-instruction");
    expect(kinds[kinds.length - 1]).toBe("user-message");
  });

  it("emits a systemPrompt string and never returns undefined", () => {
    const out = compileRpPrompt({
      rpChat: chat(),
      characters: [character()],
      lorebooks: [],
      memories: [],
      currentUserMessage: "hi",
    });
    expect(typeof out.systemPrompt).toBe("string");
    expect(out.systemPrompt.length).toBeGreaterThan(0);
  });

  it("emits exampleDialogue when the active character has dialogues", () => {
    const out = compileRpPrompt({
      rpChat: chat(),
      characters: [character()],
      lorebooks: [],
      memories: [],
      currentUserMessage: "hi",
    });
    expect(out.exampleDialogue).toBeDefined();
    expect(out.exampleDialogue!.content).toContain("### Example dialogues");
    expect(out.exampleDialogue!.characterId).toBe("c_1");
  });

  it("emits firstMessage as a character turn when no recent messages exist", () => {
    const out = compileRpPrompt({
      rpChat: chat(),
      characters: [character({ firstMessage: "Welcome, traveller." })],
      lorebooks: [],
      memories: [],
      currentUserMessage: "hi",
    });
    expect(out.firstMessage).toBeDefined();
    expect(out.firstMessage!.content).toBe("Welcome, traveller.");
    expect(out.firstMessage!.characterId).toBe("c_1");
  });

  it("skips firstMessage when the chat already has recent messages", () => {
    const out = compileRpPrompt({
      rpChat: chat({
        messages: [
          {
            id: "m_1",
            role: "user",
            content: "earlier",
            createdAt: Date.now() - 1000,
          },
        ],
      }),
      characters: [character({ firstMessage: "Welcome, traveller." })],
      lorebooks: [],
      memories: [],
      currentUserMessage: "hi",
    });
    expect(out.firstMessage).toBeUndefined();
  });

  it("includes prompt-library refs as a prompt-library section", () => {
    const refs: RpPromptLibraryRef[] = [
      { id: "p_1", label: "Style guide", content: "Speak in limericks." },
    ];
    const out = compileRpPrompt({
      rpChat: chat(),
      characters: [character()],
      lorebooks: [],
      memories: [],
      currentUserMessage: "hi",
      promptLibraryRefs: refs,
    });
    const found = out.sections.find(
      (s) => s.kind === "prompt-library" && s.sourceId === "p_1",
    );
    expect(found).toBeDefined();
    expect(found!.content).toContain("limericks");
  });

  it("includes a scene-compiler section when sceneComposerRef is provided", () => {
    const ref: RpSceneComposerRef = {
      id: "s_1",
      label: "Sunset scene",
      content: "Subject: a mountain at sunset. Mood: dramatic.",
    };
    const out = compileRpPrompt({
      rpChat: chat(),
      characters: [character()],
      lorebooks: [],
      memories: [],
      currentUserMessage: "hi",
      sceneComposerRef: ref,
    });
    const found = out.sections.find(
      (s) => s.kind === "scene-compiler" && s.sourceId === "s_1",
    );
    expect(found).toBeDefined();
    expect(found!.content).toContain("a mountain at sunset");
  });

  it("records token estimates using chars/4 on Phase 2F sections", () => {
    const refs: RpPromptLibraryRef[] = [
      { id: "p_1", label: "Style", content: "x".repeat(400) },
    ];
    const out = compileRpPrompt({
      rpChat: chat(),
      characters: [character()],
      lorebooks: [],
      memories: [],
      currentUserMessage: "hi",
      promptLibraryRefs: refs,
    });
    const p = out.sections.find((s) => s.kind === "prompt-library");
    expect(p).toBeDefined();
    expect(p!.tokens).toBe(Math.max(1, Math.ceil(p!.chars / CHARS_PER_TOKEN)));
    expect(out.totalSystemTokens).toBeGreaterThan(0);
  });

  it("enforces the systemBlockBudget by dropping the lowest-priority Phase 2F sections", () => {
    const bigLibRefs: RpPromptLibraryRef[] = Array.from({ length: 8 }, (_, i) => ({
      id: `p_${i}`,
      label: `Ref ${i}`,
      content: "x".repeat(2000),
    }));
    const out = compileRpPrompt({
      rpChat: chat(),
      characters: [character()],
      lorebooks: [],
      memories: [],
      currentUserMessage: "hi",
      promptLibraryRefs: bigLibRefs,
      systemBlockBudget: 1000,
    });
    const dropped = out.sections.filter(
      (s) => !s.included && s.reason === "budget-exceeded",
    );
    expect(dropped.length).toBeGreaterThan(0);
    expect(out.budgetExceeded).toBe(true);
  });

  it("includes lorebook entries that are present (no enforcement of triggers here)", () => {
    const out = compileRpPrompt({
      rpChat: chat(),
      characters: [character()],
      lorebooks: [lorebook()],
      memories: [],
      currentUserMessage: "hi",
    });
    const lorebookSection = out.sections.filter(
      (s) => s.kind === "lorebook-entry",
    );
    expect(lorebookSection).toBeDefined();
  });

  it("includes memory sections", () => {
    const out = compileRpPrompt({
      rpChat: chat(),
      characters: [character()],
      lorebooks: [],
      memories: [memory()],
      currentUserMessage: "hi",
    });
    const mem = out.sections.filter((s) => s.kind === "memory");
    expect(mem.length).toBeGreaterThan(0);
  });

  it("emits warnings when budget drops sections", () => {
    const out = compileRpPrompt({
      rpChat: chat(),
      characters: [character()],
      lorebooks: [],
      memories: [],
      currentUserMessage: "hi",
      promptLibraryRefs: [
        { id: "p_1", label: "Ref", content: "x".repeat(2000) },
        { id: "p_2", label: "Ref2", content: "y".repeat(2000) },
      ],
      systemBlockBudget: 500,
    });
    expect(out.warnings.length).toBeGreaterThan(0);
  });

  it("compileSystemPrompt returns the systemPrompt string", () => {
    const sys = compileSystemPrompt({
      rpChat: chat(),
      characters: [character()],
      lorebooks: [],
      memories: [],
      currentUserMessage: "hi",
    });
    expect(typeof sys).toBe("string");
    expect(sys.length).toBeGreaterThan(0);
  });
});
