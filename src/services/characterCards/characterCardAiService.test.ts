import { describe, expect, it } from "vitest";
import { applyCharacterCardProposal } from "./characterCardAiService";
import type { CharacterCardV1 } from "../../types/rp";

const card: CharacterCardV1 = { schema: "CharacterCardV1", id: "c1", name: "Ada", description: "Old", systemPrompt: "Stay", tags: ["old"], adult: false, exampleDialogues: [], createdAt: 1, updatedAt: 1 };
describe("typed character-card refinements", () => {
  it("applies only selected allowlisted operations without mutating the source", () => {
    const next = applyCharacterCardProposal(card, { summary: "Improve", warnings: [], operations: [{ op: "replace", path: "description", value: "New" }, { op: "append", path: "tags", value: "engineer" }] }, new Set([1]));
    expect(next.description).toBe("Old");
    expect(next.tags).toEqual(["old", "engineer"]);
    expect(card.tags).toEqual(["old"]);
  });
});
