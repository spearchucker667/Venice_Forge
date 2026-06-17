import { describe, expect, it } from "vitest";
import { buildChatPayloadContext, buildPriorConversationContextText } from "./chatPayloadContext";
import type { Conversation } from "../types/conversation";

describe("buildChatPayloadContext", () => {
  it("does not include prior conversation ids when toggle is off", () => {
    const result = buildChatPayloadContext({
      includePriorConversationContext: false,
      selectedConversationIds: ["conv-1"],
      availableConversations: [{ id: "conv-1", projectId: "project-1" }],
      currentProjectId: "project-1",
    });
    expect(result.includedConversationIds).toEqual([]);
  });

  it("includes only selected valid scoped conversations when toggle is on", () => {
    const result = buildChatPayloadContext({
      includePriorConversationContext: true,
      selectedConversationIds: ["conv-1", "conv-2", "conv-3"],
      availableConversations: [
        { id: "conv-1", projectId: "project-1" },
        { id: "conv-2", projectId: "project-1", archivedAt: 1 },
        { id: "conv-3", projectId: "project-2" },
      ],
      currentProjectId: "project-1",
    });
    expect(result.includedConversationIds).toEqual(["conv-1"]);
    expect(result.warnings).toHaveLength(1);
  });

  it("deduplicates selected conversation ids", () => {
    const result = buildChatPayloadContext({
      includePriorConversationContext: true,
      selectedConversationIds: ["a", "a"],
      availableConversations: [{ id: "a" }],
      currentProjectId: null,
    });
    expect(result.includedConversationIds).toEqual(["a"]);
  });
});

describe("buildPriorConversationContextText", () => {
  it("builds explicit selected-context text without unselected conversations", () => {
    const context = buildPriorConversationContextText([
      {
        id: "a",
        title: "Alpha",
        model: "m",
        createdAt: 1,
        updatedAt: 1,
        messages: [{ role: "user", content: "selected text" }],
      } as Conversation,
    ]);
    expect(context).toContain("Alpha");
    expect(context).toContain("selected text");
    expect(context).not.toContain("unselected");
  });

  it("redacts API keys, bearer tokens, env assignments, and local paths from historical messages", () => {
    const context = buildPriorConversationContextText([
      {
        id: "a",
        title: "Secrets Chat",
        model: "m",
        createdAt: 1,
        updatedAt: 1,
        messages: [
          { role: "user", content: "My Venice key is vn-test-secret-000000000000000000000000000000 and bearer token is Bearer test-token-redaction-fixture" },
          { role: "assistant", content: "Also API_KEY=test-redaction-fixture and path /Users/example/secret.txt" },
        ],
      } as Conversation,
    ]);
    expect(context).toContain("[REDACTED]");
    expect(context).toContain("[REDACTED-PATH]");
    expect(context).not.toContain("vn-test-secret-000000000000000000000000000000");
    expect(context).not.toContain("Bearer test-token-redaction-fixture");
    expect(context).not.toContain("API_KEY=test-redaction-fixture");
    expect(context).not.toContain("/Users/example/secret.txt");
  });

  it("truncates long messages and enforces total size bounds", () => {
    const longMessage = "x".repeat(5000);
    const context = buildPriorConversationContextText(
      [
        {
          id: "a",
          title: "Long Chat",
          model: "m",
          createdAt: 1,
          updatedAt: 1,
          messages: [{ role: "user", content: longMessage }],
        } as Conversation,
      ],
      { maxCharsPerMessage: 100, maxTotalChars: 200 },
    );
    expect(context).toContain("[Selected Prior Conversation Context]");
    expect(context).not.toContain("x".repeat(101));
    expect(context).toContain("…");
  });

  it("limits number of conversations and messages per conversation", () => {
    const conversations = Array.from({ length: 3 }, (_, i) => ({
      id: `c${i}`,
      title: `Chat ${i}`,
      model: "m",
      createdAt: 1,
      updatedAt: 1,
      messages: Array.from({ length: 5 }, (_, j) => ({
        role: "user",
        content: `message ${i}-${j}`,
      })),
    })) as Conversation[];

    const context = buildPriorConversationContextText(conversations, {
      maxConversations: 2,
      maxMessagesPerConversation: 2,
    });

    expect(context).toContain("Chat 0");
    expect(context).toContain("Chat 1");
    expect(context).not.toContain("Chat 2");
    expect(context).toContain("message 0-3");
    expect(context).toContain("message 0-4");
    expect(context).not.toContain("message 0-0");
    expect(context).toContain("Prior context limited to 2 conversations.");
  });
});
