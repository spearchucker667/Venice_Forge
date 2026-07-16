/** @fileoverview Phase 2F — character card import/export round-trip tests.
 *
 *  These tests exercise the contract of `exportCharacterCards` and
 *  `parseCharacterCardImport` — including secret redaction, the
 *  native / Tavern-shape dispatch, and the safety-guard re-run on
 *  every imported card. They are pure (no IndexedDB / Electron) so
 *  they can run in any environment. */

import { describe, it, expect } from "vitest";
import {
  exportCharacterCards,
  parseCharacterCardImport,
} from "./characterCardImportExport";
import type { CharacterCardV1 } from "../types/rp";

function baseCard(overrides: Partial<CharacterCardV1> = {}): CharacterCardV1 {
  const now = 1_700_000_000_000;
  return {
    schema: "CharacterCardV1",
    id: "c_test_alpha",
    name: "Alpha",
    description: "A test character",
    systemPrompt: "You are a calm test character.",
    scenario: "",
    tags: ["test", "alpha"],
    adult: false,
    exampleDialogues: [
      { speaker: "Alpha", text: "Hello, world." },
    ],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("characterCardImportExport", () => {
  describe("exportCharacterCards", () => {
    it("strips avatars from the export payload", () => {
      const out = exportCharacterCards([
        baseCard({
          avatar: {
            mimeType: "image/png",
            data: "data:image/png;base64,iVBORw0KGgo=",
            byteLength: 1,
          },
        }),
      ]);
      expect(out.cards[0]!.avatar).toBeUndefined();
    });

    it("caps tags and examples to the documented limits", () => {
      const card = baseCard({
        tags: Array.from({ length: 50 }, (_, i) => `tag-${i}`),
        exampleDialogues: Array.from({ length: 20 }, (_, i) => ({
          speaker: `S${i}`,
          text: `t${i}`,
        })),
      });
      const out = exportCharacterCards([card]);
      expect(out.cards[0]!.tags.length).toBeLessThanOrEqual(32);
      expect(out.cards[0]!.exampleDialogues.length).toBeLessThanOrEqual(8);
    });

    it("skips records whose description / systemPrompt contain a secret", async () => {
      // 20+ chars after the prefix is the regex requirement.
      const longKey = "venice_abcdefghijklmnopqrstuvwxyz1234";
      expect(longKey.length).toBeGreaterThan(20);
      // The native envelope path re-runs the safety guard on every card, which
      // catches the secret. Both unsafe cards are blocked, only the safe one
      // survives.
      const out = await parseCharacterCardImport({
        version: 1,
        app: "Venice Forge",
        exportedAt: Date.now(),
        cards: [
          baseCard({ id: "c_safe", name: "Safe" }),
          baseCard({ id: "c_unsafe", name: "Unsafe", systemPrompt: `Key: ${longKey}` }),
        ],
      });
      expect(out.imported.map((c) => c.id)).toEqual(["c_safe"]);
      expect(out.skipped).toHaveLength(1);
      expect(out.skipped[0]!.reason).toMatch(/Safety guard|Invalid|secret/i);
    });

    it("export envelope carries a version, app, exportedAt, and cards", () => {
      const out = exportCharacterCards([baseCard()]);
      expect(out.version).toBe(1);
      expect(out.app).toBe("Venice Forge");
      expect(typeof out.exportedAt).toBe("number");
      expect(out.cards).toHaveLength(1);
    });
  });

  describe("parseCharacterCardImport", () => {
    it("imports a single native CharacterCardV1 object", async () => {
      const out = await parseCharacterCardImport(baseCard());
      expect(out.imported).toHaveLength(1);
      expect(out.imported[0]!.id).toBe("c_test_alpha");
      expect(out.skipped).toHaveLength(0);
    });

    it("imports a native envelope `{ version:1, cards: [...] }`", async () => {
      const out = await parseCharacterCardImport({
        version: 1,
        app: "Venice Forge",
        exportedAt: 1_700_000_000_000,
        cards: [baseCard()],
      });
      expect(out.imported).toHaveLength(1);
    });

    it("imports a Tavern-style card and regenerates the id", async () => {
      const out = await parseCharacterCardImport({
        name: "Tavern Hero",
        system_prompt: "Speak like a wandering knight.",
        personality: "Stoic, but kind",
        first_mes: "Hail, traveller.",
        creator: "alice",
        creator_notes: "imported from tavern",
        character_version: "1.2.3",
        tags: ["tavern", "knight"],
        alternate_greetings: ["Welcome back."],
      });
      expect(out.imported).toHaveLength(1);
      const c = out.imported[0]!;
      expect(c.name).toBe("Tavern Hero");
      expect(c.firstMessage).toBe("Hail, traveller.");
      expect(c.systemPrompt).toBe("Speak like a wandering knight.");
      // The parser prefers `description` over `personality`; we did not pass
      // a `description` field, so the result falls through to `personality`.
      expect(c.description).toBe("Stoic, but kind");
      // The Tavern mapper stores creator notes under `metadata.creator` rather
      // than the top-level `author` field.
      expect(c.metadata?.creator).toBe("alice");
      expect(c.id).not.toBe("Tavern Hero");
      expect(c.id).toMatch(/^[a-zA-Z0-9_.-]+$/);
      expect(c.metadata?.importedFrom).toBe("tavern");
      expect(c.metadata?.importedVersion).toBe("1.2.3");
      expect(c.exampleDialogues.length).toBe(0);
      expect(c.alternateGreetings).toEqual(["Welcome back."]);
    });

    it("imports an array of mixed native + Tavern records", async () => {
      const out = await parseCharacterCardImport([
        baseCard(),
        {
          name: "Tavern Two",
          system_prompt: "You are mysterious.",
          first_mes: "...",
        },
      ]);
      expect(out.imported).toHaveLength(2);
    });

    it("imports a stringified JSON payload", async () => {
      const raw = JSON.stringify({
        version: 1,
        cards: [baseCard()],
      });
      const out = await parseCharacterCardImport(raw);
      expect(out.imported).toHaveLength(1);
    });

    it("rejects oversized string input (> 8 MiB)", async () => {
      const tooBig = "x".repeat(8 * 1024 * 1024 + 1);
      const out = await parseCharacterCardImport(tooBig);
      expect(out.imported).toHaveLength(0);
      expect(out.skipped[0]!.reason).toMatch(/too large|size|exceeds/i);
    });

    it("skips Tavern cards whose systemPrompt contains a secret", async () => {
      const longKey = "venice_abcdefghijklmnopqrstuvwxyz1234";
      const out = await parseCharacterCardImport({
        name: "Hostile",
        system_prompt: `Here is my key ${longKey}`,
      });
      expect(out.imported).toHaveLength(0);
      // The Tavern parser bails out before the safety guard even runs, so
      // the skipped record carries the generic "Invalid card shape" reason.
      expect(out.skipped[0]!.reason).toMatch(/Invalid|secret|Safety/i);
    });

    it("re-imports an exported envelope without losing data", async () => {
      const exported = exportCharacterCards([
        baseCard({ firstMessage: "Hi, friend." }),
      ]);
      const out = await parseCharacterCardImport(exported);
      expect(out.imported).toHaveLength(1);
      expect(out.imported[0]!.firstMessage).toBe("Hi, friend.");
    });

    // T-157 regression guard — every free-text field must be redacted on import.
    it("redacts secrets embedded in native scenario, examples, and author", async () => {
      const longKey = "venice_abcdefghijklmnopqrstuvwxyz1234";
      const out = await parseCharacterCardImport({
        ...baseCard({
          id: "c_t157_native",
          scenario: `Set in a world where the key is ${longKey}.`,
          exampleDialogues: [
            { speaker: "User", text: `I found ${longKey} in the ruins.` },
          ],
          author: `alice-${longKey}`,
        }),
      });
      expect(out.imported).toHaveLength(1);
      const c = out.imported[0]!;
      expect(c.scenario).not.toContain(longKey);
      expect(c.scenario).toContain("[REDACTED]");
      expect(c.exampleDialogues[0]!.text).not.toContain(longKey);
      expect(c.exampleDialogues[0]!.text).toContain("[REDACTED]");
      expect(c.author).not.toContain(longKey);
      expect(c.author).toContain("[REDACTED]");
    });

    it("redacts secrets embedded in Tavern scenario, examples, and creator notes", async () => {
      const longKey = "venice_abcdefghijklmnopqrstuvwxyz1234";
      const out = await parseCharacterCardImport({
        name: "Tavern Secret",
        system_prompt: "Speak like a wizard.",
        scenario: `The spell costs ${longKey}.`,
        mes_example: `Wizard: My token is ${longKey}.`,
        alternate_greetings: [`Greetings, bearer of ${longKey}.`],
        creator_notes: `Created with ${longKey}`,
      });
      expect(out.imported).toHaveLength(1);
      const c = out.imported[0]!;
      expect(c.scenario).not.toContain(longKey);
      expect(c.scenario).toContain("[REDACTED]");
      expect(c.exampleDialogues[0]!.text).not.toContain(longKey);
      expect(c.exampleDialogues[0]!.text).toContain("[REDACTED]");
      expect(c.alternateGreetings![0]!).not.toContain(longKey);
      expect(c.alternateGreetings![0]!).toContain("[REDACTED]");
      expect(c.metadata?.creator).not.toContain(longKey);
      expect(c.metadata?.creator).toContain("[REDACTED]");
    });
  });
});
