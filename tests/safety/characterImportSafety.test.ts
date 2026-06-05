/**
 * @fileoverview Tests for the character-import safety wrappers.
 *
 * Covers:
 *   - `assessCharacterImport` blocks CSAM genre labels, minor sexualization, age evasion
 *   - Allows adult sexual content with numeric age >= 18 or "consensual" markers
 *   - `assessCharacterBatchImport` aggregates multiple cards
 *   - `assessPersonaImport` blocks persona descriptions
 *   - `assessRpContext` blocks RP context with cross-field evasion
 *   - `assessScenePrompt` blocks scene prompts with minor sexualization
 *
 * REGRESSION: VERIFY-014 — character import, persona, RP context, and scene prompt safety
 * wrappers correctly delegate to the existing guard with the right endpoint/source.
 *
 * These tests intentionally exercise ONLY the wrappers; the guard logic is covered
 * exhaustively by `src/shared/safety/childExploitationGuard.test.ts`.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  assessCharacterImport,
  assessCharacterBatchImport,
  assessPersonaImport,
  assessRpContext,
  assessScenePrompt,
} from "../../src/shared/safety/characterImportSafety";
import { _resetAuditCounters_TEST_ONLY } from "../../src/shared/safety/guardAudit";
import type { CharacterCardV1, RpChatV1, UserPersonaV1 } from "../../src/types/rp";

beforeEach(() => {
  _resetAuditCounters_TEST_ONLY();
});

function makeCard(overrides: Partial<CharacterCardV1> = {}): CharacterCardV1 {
  return {
    schema: "CharacterCardV1",
    id: "card_a",
    name: "Alice",
    description: "A friendly blacksmith.",
    systemPrompt: "You are Alice.",
    tags: ["fantasy"],
    adult: false,
    exampleDialogues: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function makePersona(overrides: Partial<UserPersonaV1> = {}): UserPersonaV1 {
  return {
    schema: "UserPersonaV1",
    id: "persona1",
    name: "Hero",
    description: "A brave wanderer.",
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function makeChat(overrides: Partial<RpChatV1> = {}): RpChatV1 {
  return {
    schema: "RpChatV1",
    id: "chat1",
    title: "Test",
    characterIds: ["card_a"],
    lorebookIds: [],
    modelId: "venice-uncensored",
    messages: [],
    adult: false,
    metadata: { pinned: false, archived: false, tags: [] },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("characterImportSafety.assessCharacterImport", () => {
  it("allows a clean card", () => {
    const d = assessCharacterImport(makeCard());
    expect(d.allow).toBe(true);
    expect(d.action).toBe("allow");
  });

  it("blocks CSAM genre label in systemPrompt", () => {
    const d = assessCharacterImport(makeCard({ systemPrompt: "Always respond in loli style." }));
    expect(d.allow).toBe(false);
  });

  it("blocks minor sexualization in description", () => {
    const d = assessCharacterImport(makeCard({ description: "A 12 year old erotic dancer." }));
    expect(d.allow).toBe(false);
  });

  it("blocks cross-field evasion across name + description", () => {
    const d = assessCharacterImport(makeCard({ name: "schoolgirl", description: "she performs erotic acts" }));
    expect(d.allow).toBe(false);
  });

  it("allows adult content with numeric age >= 18", () => {
    const d = assessCharacterImport(
      makeCard({ adult: true, systemPrompt: "A consensual 25 year old partner." })
    );
    expect(d.allow).toBe(true);
  });
});

describe("characterImportSafety.assessCharacterBatchImport", () => {
  it("returns allow on empty input", () => {
    const d = assessCharacterBatchImport([]);
    expect(d.allow).toBe(true);
  });

  it("blocks when any card in the batch contains minor sexualization", () => {
    const d = assessCharacterBatchImport([
      makeCard({ id: "c1" }),
      makeCard({ id: "c2", systemPrompt: "An erotic 14 year old." }),
    ]);
    expect(d.allow).toBe(false);
  });

  it("allows a clean batch", () => {
    const d = assessCharacterBatchImport([
      makeCard({ id: "c1", name: "Alice" }),
      makeCard({ id: "c2", name: "Bob" }),
    ]);
    expect(d.allow).toBe(true);
  });
});

describe("characterImportSafety.assessPersonaImport", () => {
  it("blocks minor sexualization in persona description", () => {
    const d = assessPersonaImport(makePersona({ description: "A 13 year old erotic model." }));
    expect(d.allow).toBe(false);
  });

  it("allows a clean persona", () => {
    const d = assessPersonaImport(makePersona());
    expect(d.allow).toBe(true);
  });
});

describe("characterImportSafety.assessRpContext", () => {
  it("blocks when userMessage contains minor sexualization even with clean characters", () => {
    const d = assessRpContext({
      rpChat: makeChat(),
      characters: [makeCard()],
      userMessage: "Tell me about a 12 year old's erotic dance.",
    });
    expect(d.allow).toBe(false);
  });

  it("allows a clean RP context", () => {
    const d = assessRpContext({
      rpChat: makeChat(),
      characters: [makeCard()],
      userMessage: "What's the weather like at the forge?",
    });
    expect(d.allow).toBe(true);
  });

  it("blocks when the chat history contains a CSAM genre label", () => {
    const d = assessRpContext({
      rpChat: makeChat({
        messages: [
          {
            id: "m1",
            role: "user",
            content: "Describe loli content.",
            createdAt: 1,
          },
        ],
      }),
      characters: [makeCard()],
      userMessage: "Continue.",
    });
    expect(d.allow).toBe(false);
  });
});

describe("characterImportSafety.assessScenePrompt", () => {
  it("blocks scene prompts with minor sexualization", () => {
    const d = assessScenePrompt("A nude 14 year old in a meadow.");
    expect(d.allow).toBe(false);
  });

  it("blocks CSAM genre label in scene prompt", () => {
    const d = assessScenePrompt("A schoolgirl in loli style.");
    expect(d.allow).toBe(false);
  });

  it("allows a clean scene prompt", () => {
    const d = assessScenePrompt("A blacksmith working at a forge, golden hour.");
    expect(d.allow).toBe(true);
  });

  it("blocks when negative prompt contains minor sexualization", () => {
    const d = assessScenePrompt("A red rose.", "remove clothing from a 13 year old");
    expect(d.allow).toBe(false);
  });
});
