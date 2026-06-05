// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { startBridgeServer, stopBridgeServer, getBridgeToken } from "./bridgeServer";
import { performVeniceRequest } from "./veniceClient";
import { assessChildExploitationSafety } from "../../src/shared/safety";

vi.mock("./veniceClient", () => ({
  performVeniceRequest: vi.fn(),
  validateVeniceIpcRequest: vi.fn((input) => input),
}));

vi.mock("../../src/shared/safety", () => ({
  assessChildExploitationSafety: vi.fn(),
  recordDecision: vi.fn(),
}));

describe("bridgeServer", () => {
  let token: string;
  const port = 5063;
  const host = "127.0.0.1";

  beforeAll(async () => {
    vi.mocked(assessChildExploitationSafety).mockReturnValue({
      allow: true,
      action: "allow",
      severity: "safe",
      category: "general_safety",
      reasonCode: "OK",
      userMessage: "OK",
      developerMessage: "OK",
      normalizedChanged: false,
      signals: [],
      audit: {
        decisionId: "123",
        createdAt: new Date().toISOString(),
        promptHash: "abc",
        promptLength: 10,
        matchedFieldPaths: [],
      },
    });

    vi.mocked(performVeniceRequest).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: {},
      body: { data: "mock response" },
      contentType: "application/json",
    });

    token = await startBridgeServer(port, host);
  });

  afterAll(() => {
    stopBridgeServer();
  });

  it("generates a valid bridge token", () => {
    expect(token).toBeDefined();
    expect(token.length).toBeGreaterThan(0);
    expect(getBridgeToken()).toBe(token);
  });

  it("rejects unauthorized requests", async () => {
    const res = await fetch(`http://${host}:${port}/ping`);
    expect(res.status).toBe(401);
  });

  it("allows authorized requests and proxies them", async () => {
    const res = await fetch(`http://${host}:${port}/ping`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("enforces child safety guard and blocks request if unsafe", async () => {
    vi.mocked(assessChildExploitationSafety).mockReturnValueOnce({
      allow: false,
      action: "block",
      severity: "critical",
      category: "child_sexual_abuse_material",
      reasonCode: "CSAM_DETECTED",
      userMessage: "Safety block",
      developerMessage: "CSAM",
      normalizedChanged: false,
      signals: [],
      audit: {
        decisionId: "456",
        createdAt: new Date().toISOString(),
        promptHash: "xyz",
        promptLength: 10,
        matchedFieldPaths: [],
      },
    });

    const res = await fetch(`http://${host}:${port}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "test payload" }],
      }),
    });

    expect(res.status).toBe(451);
    const json = await res.json();
    expect(json.error.message).toBe("Safety block");
  });
});
