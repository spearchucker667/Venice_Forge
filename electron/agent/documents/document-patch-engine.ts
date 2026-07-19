import { createHash, randomUUID } from "node:crypto";
import type { DocumentBlock, DocumentEditOperation } from "../../../src/agent/contracts/documents";

export class DocumentPatchError extends Error {
  constructor(readonly code: "CONFLICT" | "INVALID_OPERATION", message: string) {
    super(message);
    this.name = "DocumentPatchError";
  }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function canonicalHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export function blockText(block: DocumentBlock): string {
  switch (block.type) {
    case "heading":
    case "paragraph":
    case "code":
    case "quote":
      return block.text;
    case "list":
      return block.items.map((item) => item.text).join("\n");
    case "table":
      return block.rows.map((row) => row.cells.map((cell) => cell.text).join("\t")).join("\n");
    case "image":
      return [block.altText, block.caption].filter(Boolean).join("\n");
    case "pageBreak":
      return "";
  }
}

export const blockHash = (block: DocumentBlock): string => canonicalHash(block);
export const textHash = (block: DocumentBlock): string => canonicalHash(blockText(block));

export function validateDocumentBlocks(blocks: DocumentBlock[]): void {
  const ids = new Set<string>();
  const add = (id: string) => {
    if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(id) || ids.has(id)) {
      throw new DocumentPatchError("INVALID_OPERATION", "Document block identifiers must be unique and bounded.");
    }
    ids.add(id);
  };
  for (const block of blocks) {
    add(block.id);
    if (block.type === "list") block.items.forEach((item) => add(item.id));
    if (block.type === "table") block.rows.forEach((row) => {
      add(row.id);
      row.cells.forEach((cell) => add(cell.id));
    });
  }
}

function withFreshIds(block: DocumentBlock): DocumentBlock {
  const cloned = structuredClone(block);
  cloned.id = `block_${randomUUID()}`;
  if (cloned.type === "list") cloned.items.forEach((item) => { item.id = `item_${randomUUID()}`; });
  if (cloned.type === "table") cloned.rows.forEach((row) => {
    row.id = `row_${randomUUID()}`;
    row.cells.forEach((cell) => { cell.id = `cell_${randomUUID()}`; });
  });
  return cloned;
}

function replaceText(block: DocumentBlock, searchText: string, replacementText: string, occurrence: number): DocumentBlock {
  if (!("text" in block) || typeof block.text !== "string") {
    throw new DocumentPatchError("INVALID_OPERATION", "replace_text supports text-bearing blocks only.");
  }
  if (!searchText || occurrence < 1 || !Number.isSafeInteger(occurrence)) {
    throw new DocumentPatchError("INVALID_OPERATION", "replace_text requires a non-empty search and a positive occurrence.");
  }
  const positions: number[] = [];
  let offset = 0;
  while (offset <= block.text.length - searchText.length) {
    const index = block.text.indexOf(searchText, offset);
    if (index < 0) break;
    positions.push(index);
    offset = index + searchText.length;
  }
  if (positions.length !== occurrence) {
    throw new DocumentPatchError("CONFLICT", "The requested text occurrence is ambiguous or stale.");
  }
  const index = positions[occurrence - 1];
  return { ...block, text: `${block.text.slice(0, index)}${replacementText}${block.text.slice(index + searchText.length)}` };
}

export function applyDocumentEdits(baseBlocks: DocumentBlock[], operations: DocumentEditOperation[]): DocumentBlock[] {
  const blocks = structuredClone(baseBlocks);
  validateDocumentBlocks(blocks);
  if (operations.length === 0 || operations.length > 200) {
    throw new DocumentPatchError("INVALID_OPERATION", "An edit proposal must contain 1 to 200 operations.");
  }

  for (const operation of operations) {
    const index = blocks.findIndex((block) => block.id === operation.blockId);
    if (index < 0) throw new DocumentPatchError("CONFLICT", "A targeted block no longer exists.");
    const current = blocks[index];

    if ("expectedBlockHash" in operation && blockHash(current) !== operation.expectedBlockHash) {
      throw new DocumentPatchError("CONFLICT", "A targeted block changed after the proposal was prepared.");
    }

    switch (operation.operation) {
      case "replace_block": {
        const replacement = structuredClone(operation.block);
        replacement.id = current.id;
        blocks.splice(index, 1, replacement);
        break;
      }
      case "replace_text":
        if (textHash(current) !== operation.expectedTextHash) {
          throw new DocumentPatchError("CONFLICT", "A targeted block's text changed after the proposal was prepared.");
        }
        blocks.splice(index, 1, replaceText(current, operation.searchText, operation.replacementText, operation.occurrence));
        break;
      case "insert_before":
        blocks.splice(index, 0, ...operation.blocks.map(withFreshIds));
        break;
      case "insert_after":
        blocks.splice(index + 1, 0, ...operation.blocks.map(withFreshIds));
        break;
      case "delete_block":
        blocks.splice(index, 1);
        break;
      case "move_block": {
        if (operation.destinationBlockId === operation.blockId) {
          throw new DocumentPatchError("INVALID_OPERATION", "A block cannot be moved relative to itself.");
        }
        const destinationIndex = blocks.findIndex((block) => block.id === operation.destinationBlockId);
        if (destinationIndex < 0) throw new DocumentPatchError("CONFLICT", "The destination block no longer exists.");
        const [moved] = blocks.splice(index, 1);
        const adjustedDestination = blocks.findIndex((block) => block.id === operation.destinationBlockId);
        blocks.splice(adjustedDestination + (operation.position === "after" ? 1 : 0), 0, moved);
        break;
      }
    }
    validateDocumentBlocks(blocks);
  }
  return blocks;
}
