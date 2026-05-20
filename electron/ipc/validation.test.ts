import { describe, expect, it } from "vitest";
import {
  MAX_VENICE_IPC_BODY_BYTES,
  validateApiKeyInput,
  validateVeniceIpcRequest,
} from "./validation";

describe("Electron IPC validation", () => {
  it("allows only supported Venice endpoints and methods", () => {
    expect(
      validateVeniceIpcRequest({ endpoint: "/models?type=all", method: "GET" })
    ).toMatchObject({ endpoint: "/models?type=all", method: "GET" });

    expect(() =>
      validateVeniceIpcRequest({ endpoint: "/billing", method: "GET" })
    ).toThrow(/not allowed/i);

    expect(() =>
      validateVeniceIpcRequest({ endpoint: "/models", method: "DELETE" })
    ).toThrow(/method/i);
  });

  it("rejects oversized Venice IPC payloads", () => {
    const tooLarge = "x".repeat(MAX_VENICE_IPC_BODY_BYTES + 1);

    expect(() =>
      validateVeniceIpcRequest({
        endpoint: "/chat/completions",
        method: "POST",
        body: { prompt: tooLarge },
      })
    ).toThrow(/too large/i);
  });

  it("validates API key input without leaking the value", () => {
    expect(validateApiKeyInput("  vn-test-key  ")).toBe("vn-test-key");
    expect(() => validateApiKeyInput("")).toThrow(/enter/i);
    expect(() => validateApiKeyInput("x".repeat(513))).toThrow(/too long/i);
  });
});
