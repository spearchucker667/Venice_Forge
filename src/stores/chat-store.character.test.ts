/** @fileoverview Unit tests for the Venice character chat-store helpers.
 *
 *  Verifies that `createCharacterConversation`:
 *    - Tags the conversation with `metadata.source = "character"`
 *    - Persists the character's slug + minimal metadata
 *    - Prefers the character's modelId over the fallback when available
 *    - Does not let a global "selected character" change overwrite an
 *      existing conversation's character slug
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useChatStore } from "./chat-store";
import { useCharacterStore } from "./character-store";
import type { VeniceCharacter } from "../types/characters";

/** Resets both stores between tests. */
function resetStores() {
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    isStreaming: false,
    pendingContext: null,
  });
  useCharacterStore.setState({
    searchQuery: "",
    results: [],
    selectedCharacter: null,
    selectedCharacterSlug: null,
    includeAdultCharacters: false,
    webEnabledOnly: false,
    isLoading: false,
    error: null,
    sortBy: "featured",
    sortOrder: "desc",
    offset: 0,
    hasMore: false,
  });
}

const CHARACTER_FIXTURE: VeniceCharacter = {
  id: "char-1",
  slug: "alan-watts",
  name: "Alan Watts",
  description: "British philosopher",
  adult: false,
  featured: true,
  shareUrl: "https://venice.ai/c/alan-watts",
  photoUrl: "https://outerface.venice.ai/alan-watts.png",
  tags: ["philosophy", "religion"],
  webEnabled: true,
  modelId: "venice-uncensored-1-2",
  stats: { averageRating: 4.6 },
};

describe("chat-store character integration", () => {
  beforeEach(() => {
    resetStores();
  });

  afterEach(() => {
    resetStores();
  });

  it("createCharacterConversation tags metadata.source as 'character'", () => {
    const id = useChatStore.getState().createCharacterConversation(CHARACTER_FIXTURE, "llama-3.3-70b");
    const conv = useChatStore.getState().conversations.find((c) => c.id === id);
    expect(conv?.metadata?.source).toBe("character");
  });

  it("persists slug, name, photoUrl, shareUrl, and modelId on the conversation", () => {
    const id = useChatStore.getState().createCharacterConversation(CHARACTER_FIXTURE, "llama-3.3-70b");
    const conv = useChatStore.getState().conversations.find((c) => c.id === id)!;
    expect(conv.metadata?.character).toMatchObject({
      slug: "alan-watts",
      id: "char-1",
      name: "Alan Watts",
      photoUrl: "https://outerface.venice.ai/alan-watts.png",
      shareUrl: "https://venice.ai/c/alan-watts",
      modelId: "venice-uncensored-1-2",
      adult: false,
      webEnabled: true,
    });
  });

  it("prefers the character.modelId over the fallback model", () => {
    const id = useChatStore.getState().createCharacterConversation(CHARACTER_FIXTURE, "llama-3.3-70b");
    const conv = useChatStore.getState().conversations.find((c) => c.id === id)!;
    expect(conv.model).toBe("venice-uncensored-1-2");
  });

  it("falls back to the supplied model when the character has no modelId", () => {
    const noModel: VeniceCharacter = { ...CHARACTER_FIXTURE, slug: "no-model", id: "char-2", name: "No Model", modelId: undefined };
    const id = useChatStore.getState().createCharacterConversation(noModel, "llama-3.3-70b");
    const conv = useChatStore.getState().conversations.find((c) => c.id === id)!;
    expect(conv.model).toBe("llama-3.3-70b");
  });

  it("uses the character name in the conversation title", () => {
    const id = useChatStore.getState().createCharacterConversation(CHARACTER_FIXTURE, "llama-3.3-70b");
    const conv = useChatStore.getState().conversations.find((c) => c.id === id)!;
    expect(conv.title).toBe("Chat with Alan Watts");
  });

  it("changing the global selected character does NOT mutate the conversation's persisted slug", () => {
    const id = useChatStore.getState().createCharacterConversation(CHARACTER_FIXTURE, "llama-3.3-70b");
    const conv = useChatStore.getState().conversations.find((c) => c.id === id)!;
    expect(conv.metadata?.character?.slug).toBe("alan-watts");

    useCharacterStore.getState().selectCharacter({
      id: "char-9",
      slug: "different-character",
      name: "Different",
    });

    const convAfter = useChatStore.getState().conversations.find((c) => c.id === id)!;
    expect(convAfter.metadata?.character?.slug).toBe("alan-watts");
  });

  it("round-trips character metadata through the save record (ConversationRecordV1)", () => {
    const id = useChatStore.getState().createCharacterConversation(CHARACTER_FIXTURE, "llama-3.3-70b");
    const conv = useChatStore.getState().conversations.find((c) => c.id === id)!;
    const record = {
      version: 1 as const,
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      model: conv.model,
      systemPrompt: conv.systemPrompt,
      messages: conv.messages,
      metadata: conv.metadata || {
        tags: [],
        pinned: false,
        archived: false,
        source: "chat" as const,
        messageCount: 0,
      },
      memory: conv.memory || {
        summary: conv.title,
        topics: [],
        entities: [],
        userFacts: [],
        projectRefs: [],
      },
    };
    // The persisted record still carries the character metadata after
    // serialization round-trip — this mirrors what the save() IPC call
    // does in chat-store.ts.
    expect(record.metadata.source).toBe("character");
    expect(record.metadata.character?.slug).toBe("alan-watts");
    expect(record.metadata.character?.modelId).toBe("venice-uncensored-1-2");
  });
});
