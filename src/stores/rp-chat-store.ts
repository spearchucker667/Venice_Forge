/** @fileoverview State for the local RP chat store.
 *
 *  Distinct from the existing `chat-store`, which is the single-threaded
 *  general chat. RP chats are a parallel data model persisted via the
 *  `rpChatService`, which selects Electron IPC (desktop) or IndexedDB (web).
 *
 *  Schema fields:
 *    - RpChatV1.characterIds[] : active roster (≤ MAX_ACTIVE_CHARACTERS)
 *    - RpChatV1.personaId?     : active user persona (optional)
 *    - RpChatV1.lorebookIds[]  : bound lorebook ids
 *    - RpChatV1.modelId        : default model for the chat
 *    - RpChatV1.adult          : mirrors the most-adult flag in the roster
 *    - RpChatV1.metadata       : pinned/archived/tags (UX metadata)
 */

import { create } from "zustand";
import {
  listRpChats,
  saveRpChat as svcSave,
  deleteRpChat as svcDelete,
  generateId as svcGenerateId,
  appendMessage as svcAppend,
  normalizeChat,
} from "../services/rp/rpChatService";
import type { RpChatV1, RpMessageV1 } from "../types/rp";
import { MAX_ACTIVE_CHARACTERS } from "../types/rp";
import { toast } from "./toast-store";
import { redactErrorMessage, sanitizeErrorText } from "../shared/redaction";

export interface RpChatState {
  chats: RpChatV1[];
  isLoading: boolean;
  hasLoaded: boolean;
  error: string | null;
  activeChatId: string | null;
  isStreaming: boolean;

  load: () => Promise<void>;
  createChat: (init: {
    title?: string;
    characterIds: string[];
    personaId: string | null;
    lorebookIds: string[];
    modelId: string;
    scenario?: string;
    adult?: boolean;
  }) => Promise<string | null>;
  setActive: (id: string | null) => void;
  setStreaming: (s: boolean) => void;
  upsert: (chat: RpChatV1) => Promise<RpChatV1 | null>;
  remove: (id: string) => Promise<boolean>;
  appendUserMessage: (chatId: string, content: string) => Promise<RpMessageV1 | null>;
  appendCharacterMessage: (
    chatId: string,
    characterId: string,
    content: string,
    reasoning?: string,
  ) => Promise<RpMessageV1 | null>;
  appendNarratorMessage: (chatId: string, content: string) => Promise<RpMessageV1 | null>;
  getById: (id: string) => RpChatV1 | undefined;
  getActive: () => RpChatV1 | undefined;
}

function newMessageId(): string {
  try {
    const crypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (crypto && typeof crypto.randomUUID === "function") {
      return `m_${crypto.randomUUID()}`;
    }
  } catch {
    // fall through to Math.random fallback
  }
  return `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Returns a redacted diagnostic string that is safe for UI state. */
function safeDiagnostic(err: unknown): string {
  return sanitizeErrorText(redactErrorMessage(err));
}

/** Per-chat mutex. Each append chains a Promise onto the previous in-flight
 *  append for the same chatId so the read-modify-write cycle is serialized.
 *  Without this, a streaming character reply and a narrator line arriving
 *  concurrently would each read the same chat snapshot, and the second
 *  write would clobber the first message in the persisted store. */
const chatLocks = new Map<string, Promise<unknown>>();

/** Acquires the lock for `chatId`, runs `work`, releases the lock, and
 *  returns the work's result. Subsequent calls for the same chatId wait
 *  for the in-flight append to complete before starting. */
async function withChatLock<T>(chatId: string, work: () => Promise<T>): Promise<T> {
  const prev = chatLocks.get(chatId) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const next = new Promise<void>((resolve) => { release = resolve; });
  chatLocks.set(chatId, prev.then(() => next));
  try {
    await prev;
    return await work();
  } finally {
    release();
    // Clean up the lock entry if no further work is queued behind us.
    if (chatLocks.get(chatId) === next) chatLocks.delete(chatId);
  }
}

export const useRpChatStore = create<RpChatState>((set, get) => ({
  chats: [],
  isLoading: false,
  hasLoaded: false,
  error: null,
  activeChatId: null,
  isStreaming: false,

  load: async () => {
    if (get().isLoading) return;
    set({ isLoading: true, error: null });
    try {
      const items = await listRpChats();
      const sorted = items.slice().sort((a, b) => b.updatedAt - a.updatedAt);
      set({ chats: sorted, isLoading: false, hasLoaded: true });
    } catch (e) {
      set({ isLoading: false, error: safeDiagnostic(e) });
    }
  },

  createChat: async ({ title, characterIds, personaId, lorebookIds, modelId, scenario, adult }) => {
    const id = svcGenerateId();
    const now = Date.now();
    const safeIds = characterIds.slice(0, MAX_ACTIVE_CHARACTERS);
    const chat: RpChatV1 = {
      schema: "RpChatV1",
      id,
      title: title?.trim() || "New RP",
      characterIds: safeIds,
      ...(personaId ? { personaId } : {}),
      lorebookIds: [...lorebookIds],
      modelId,
      ...(scenario ? { scenario } : {}),
      messages: [],
      adult: adult === true,
      metadata: { pinned: false, archived: false, tags: [] },
      createdAt: now,
      updatedAt: now,
    };
    try {
      const saved = await svcSave(chat);
      set((s) => ({ chats: [saved, ...s.chats], activeChatId: id, error: null }));
      return id;
    } catch (e) {
      set({ error: safeDiagnostic(e) });
      toast.error("Could not create RP chat", "Please try again.");
      return null;
    }
  },

  setActive: (id) => set({ activeChatId: id }),
  setStreaming: (s) => set({ isStreaming: s }),

  upsert: async (chat) => {
    const normalized = normalizeChat(chat);
    if (!normalized) {
      const msg = "Invalid RP chat data.";
      set({ error: msg });
      toast.error("Could not save RP chat", msg);
      return null;
    }
    const stamped: RpChatV1 = { ...normalized, updatedAt: Date.now() };
    try {
      const saved = await svcSave(stamped);
      set((s) => {
        const idx = s.chats.findIndex((c) => c.id === saved.id);
        const next = idx >= 0 ? [...s.chats] : [saved, ...s.chats];
        if (idx >= 0) next[idx] = saved;
        next.sort((a, b) => b.updatedAt - a.updatedAt);
        return { chats: next, error: null };
      });
      return saved;
    } catch (e) {
      set({ error: safeDiagnostic(e) });
      toast.error("Could not save RP chat", "Please try again.");
      return null;
    }
  },

  remove: async (id) => {
    try {
      const ok = await svcDelete(id);
      if (!ok) {
        toast.error("Could not delete RP chat", "Storage rejected the request.");
        return false;
      }
      set((s) => ({
        chats: s.chats.filter((c) => c.id !== id),
        activeChatId: s.activeChatId === id ? null : s.activeChatId,
      }));
      return true;
    } catch (e) {
      set({ error: safeDiagnostic(e) });
      toast.error("Could not delete RP chat", "Please try again.");
      return false;
    }
  },

  appendUserMessage: async (chatId, content) => {
    return withChatLock(chatId, async () => {
      const chat = get().chats.find((c) => c.id === chatId);
      if (!chat) return null;
      const msg: RpMessageV1 = { id: newMessageId(), role: "user", content, createdAt: Date.now() };
      try {
        const saved = await svcAppend(chat, msg);
        set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? saved : c)) }));
        return msg;
      } catch {
        toast.error("Could not save message", "Please try again.");
        return null;
      }
    });
  },

  appendCharacterMessage: async (chatId, characterId, content, reasoning) => {
    return withChatLock(chatId, async () => {
      const chat = get().chats.find((c) => c.id === chatId);
      if (!chat) return null;
      const msg: RpMessageV1 = {
        id: newMessageId(),
        role: "character",
        characterId,
        content,
        ...(reasoning ? { reasoning } : {}),
        createdAt: Date.now(),
      };
      try {
        const saved = await svcAppend(chat, msg);
        set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? saved : c)) }));
        return msg;
      } catch {
        toast.error("Could not save message", "Please try again.");
        return null;
      }
    });
  },

  appendNarratorMessage: async (chatId, content) => {
    return withChatLock(chatId, async () => {
      const chat = get().chats.find((c) => c.id === chatId);
      if (!chat) return null;
      const msg: RpMessageV1 = { id: newMessageId(), role: "narrator", content, createdAt: Date.now() };
      try {
        const saved = await svcAppend(chat, msg);
        set((s) => ({ chats: s.chats.map((c) => (c.id === chatId ? saved : c)) }));
        return msg;
      } catch {
        toast.error("Could not save message", "Please try again.");
        return null;
      }
    });
  },

  getById: (id) => get().chats.find((c) => c.id === id),
  getActive: () => {
    const id = get().activeChatId;
    return id ? get().chats.find((c) => c.id === id) : undefined;
  },
}));
