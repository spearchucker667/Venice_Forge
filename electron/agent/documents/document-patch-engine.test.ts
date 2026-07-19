// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { DocumentBlock } from "../../../src/agent/contracts/documents";
import { applyDocumentEdits, blockHash, textHash } from "./document-patch-engine";

const base: DocumentBlock[] = [
  { id: "heading_1", type: "heading", level: 1, text: "Title" },
  { id: "paragraph_1", type: "paragraph", text: "one fish two fish" },
  { id: "paragraph_2", type: "paragraph", text: "tail" },
];

describe("document patch engine", () => {
  it("applies deterministic text replacement and retains unchanged IDs", () => {
    const result = applyDocumentEdits(base, [{
      operation: "replace_text",
      blockId: "paragraph_1",
      expectedTextHash: textHash(base[1]),
      searchText: "fish",
      replacementText: "bird",
      occurrence: 2,
    }]);
    expect(result[1]).toMatchObject({ id: "paragraph_1", text: "one fish two bird" });
    expect(result[2].id).toBe("paragraph_2");
    expect(base[1]).toMatchObject({ text: "one fish two fish" });
  });

  it("assigns fresh IDs to inserted blocks", () => {
    const result = applyDocumentEdits(base, [{
      operation: "insert_after",
      blockId: "heading_1",
      expectedBlockHash: blockHash(base[0]),
      blocks: [{ id: "model_supplied", type: "paragraph", text: "new" }],
    }]);
    expect(result[1].id).toMatch(/^block_/);
    expect(result[1].id).not.toBe("model_supplied");
  });

  it("rejects stale hashes and ambiguous occurrences", () => {
    expect(() => applyDocumentEdits(base, [{ operation: "delete_block", blockId: "paragraph_1", expectedBlockHash: "stale" }])).toThrow("changed after");
    expect(() => applyDocumentEdits(base, [{
      operation: "replace_text",
      blockId: "paragraph_1",
      expectedTextHash: textHash(base[1]),
      searchText: "fish",
      replacementText: "bird",
      occurrence: 1,
    }])).toThrow("ambiguous or stale");
  });

  it("moves and deletes blocks without reusing identities", () => {
    const moved = applyDocumentEdits(base, [{
      operation: "move_block",
      blockId: "paragraph_2",
      expectedBlockHash: blockHash(base[2]),
      destinationBlockId: "heading_1",
      position: "before",
    }]);
    expect(moved.map((block) => block.id)).toEqual(["paragraph_2", "heading_1", "paragraph_1"]);
    const deleted = applyDocumentEdits(moved, [{ operation: "delete_block", blockId: "paragraph_2", expectedBlockHash: blockHash(moved[0]) }]);
    expect(deleted.map((block) => block.id)).toEqual(["heading_1", "paragraph_1"]);
  });
});
