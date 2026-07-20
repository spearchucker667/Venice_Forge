/* eslint-disable @typescript-eslint/no-unused-vars */

import { describe, it, expect, vi } from "vitest";
import { composeTrustedRequest } from "./trusted-agent-request";

describe("trusted-agent-request", () => {
  it("injects System Runtime Context at the top of messages", () => {
    const raw = {
      endpoint: "/chat/completions",
      method: "POST",
      body: {
        messages: [{ role: "user", content: "hello" }],
        tools: [{ type: "function" }]
      }
    };
    
    const composed = composeTrustedRequest(raw) as any;
    expect(composed.body.messages.length).toBe(2);
    expect(composed.body.messages[0].role).toBe("system");
    expect(composed.body.messages[0].content).toContain("[System Runtime Context]");
    expect(composed.body.messages[0].content).toContain("Current Date/Time:");
    expect(composed.body.messages[0].content).toContain("Timezone:");
    expect(composed.body.messages[1].content).toBe("hello");
  });

  it("prepends to existing system message", () => {
    const raw = {
      endpoint: "/chat/completions",
      method: "POST",
      body: {
        messages: [{ role: "system", content: "User system prompt." }],
      }
    };
    
    const composed = composeTrustedRequest(raw) as any;
    expect(composed.body.messages.length).toBe(1);
    expect(composed.body.messages[0].role).toBe("system");
    expect(composed.body.messages[0].content).toContain("[System Runtime Context]");
    expect(composed.body.messages[0].content).toContain("User system prompt.");
  });

  it("ignores invalid shapes", () => {
    expect(composeTrustedRequest(null)).toBe(null);
    expect(composeTrustedRequest("abc")).toBe("abc");
    expect(composeTrustedRequest({ body: "not-an-object" })).toEqual({ body: "not-an-object" });
    expect(composeTrustedRequest({ body: { messages: "not-an-array" } })).toEqual({ body: { messages: "not-an-array" } });
  });
});