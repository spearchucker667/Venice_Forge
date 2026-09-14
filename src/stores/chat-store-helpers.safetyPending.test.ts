import { describe, it, expect } from "vitest";
import { toConversationRecord } from "./chat-store-helpers";
import type { Conversation } from "../types/conversation";

function baseConv(messages: Conversation["messages"]): Conversation {
  return {
    id: "c1",
    title: "t",
    createdAt: 1,
    updatedAt: 2,
    model: "m",
    messages,
  };
}

describe("toConversationRecord safetyPending (VF-CUR-P1-001)", () => {
  it("excludes safety-pending messages from the durable record", () => {
    const record = toConversationRecord(
      baseConv([
        {
          id: "m1",
          role: "user",
          content: "safe prior",
          timestamp: 1,
        },
        {
          id: "m2",
          role: "user",
          content: "BLOCKED_TURN_TEXT_UNIQUE",
          timestamp: 2,
          metadata: { safetyPending: true },
        },
        {
          id: "m3",
          role: "assistant",
          content: "",
          timestamp: 3,
          metadata: { safetyPending: true },
        },
      ]),
    );
    expect(record.messages).toHaveLength(1);
    expect(record.messages[0]?.content).toBe("safe prior");
    expect(JSON.stringify(record)).not.toContain("BLOCKED_TURN_TEXT_UNIQUE");
    expect(record.metadata.messageCount).toBe(1);
  });
});
