/** @fileoverview Persistent memory layer backed by IndexedDB (encrypted) and optional
 *  desktop filesystem via the chat bridge. */

// Code Owner: fayeblade (@spearchucker667)
import {
  MAX_MEMORY_BLOCK_CHARS,
  MAX_INJECTED_MEMORIES,
} from "../constants/venice";
import StorageService from "./storageService";

const MEMORY_STORE = "ai_memory" as const;

/** A single memory entry. */
export interface Memory {
  id: string;
  content: string;
  createdAt: number;
  tags: string[];
  conversationId?: string;
}

/** Shape used when building the injected memory block. */
export interface MemoryBlock {
  text: string;
  used: number;
  truncated: boolean;
}

/** Saves a new memory entry. */
export async function saveMemory(
  content: string,
  tags: string[] = [],
  conversationId?: string
): Promise<Memory> {
  const entry: Memory = {
    id: crypto.randomUUID(),
    content: content.trim(),
    createdAt: Date.now(),
    tags: tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
    conversationId,
  };
  await StorageService.saveItem(MEMORY_STORE, entry as unknown as Record<string, unknown>);
  return entry;
}

/** Lists all memories, newest first. */
export async function listMemories(): Promise<Memory[]> {
  return StorageService.getItems<Memory>(MEMORY_STORE);
}

/** Deletes a memory by id. */
export async function deleteMemory(id: string): Promise<boolean> {
  return StorageService.deleteItem(MEMORY_STORE, id);
}

/** Searches memories by substring in content and optional tag filter. */
export async function searchMemory(
  query: string,
  tagFilter?: string
): Promise<Memory[]> {
  const all = await listMemories();
  const q = query.trim().toLowerCase();
  const t = tagFilter?.trim().toLowerCase();
  return all.filter((m) => {
    const matchesQuery = !q || m.content.toLowerCase().includes(q);
    const matchesTag = !t || m.tags.includes(t);
    return matchesQuery && matchesTag;
  });
}

/** Selects up to {@link MAX_INJECTED_MEMORIES} memories for injection.
 *  Prefers memories tagged to the given conversation, then falls back to recency.
 *  Caps total characters to {@link MAX_MEMORY_BLOCK_CHARS}.
 */
export async function selectMemoriesForInjection(
  conversationId?: string
): Promise<MemoryBlock> {
  const all = await listMemories();
  if (!all.length) return { text: "", used: 0, truncated: false };

  // Sort: conversation-tagged first, then by recency
  const sorted = [...all].sort((a, b) => {
    const aTagged = a.conversationId === conversationId ? 1 : 0;
    const bTagged = b.conversationId === conversationId ? 1 : 0;
    if (aTagged !== bTagged) return bTagged - aTagged;
    return b.createdAt - a.createdAt;
  });

  const picked = sorted.slice(0, MAX_INJECTED_MEMORIES);
  let budget = MAX_MEMORY_BLOCK_CHARS;
  const lines: string[] = [];

  for (const m of picked) {
    const line = `- ${m.content}`;
    if (line.length > budget) {
      // Try to take a partial
      const partial = line.slice(0, Math.max(0, budget - 3));
      if (partial.length > 4) {
        lines.push(`${partial}...`);
      }
      return { text: lines.join("\n"), used: lines.length, truncated: true };
    }
    lines.push(line);
    budget -= line.length;
  }

  return {
    text: lines.join("\n"),
    used: lines.length,
    truncated: false,
  };
}
