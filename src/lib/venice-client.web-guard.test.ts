/** @fileoverview SP-001 regression guard: legacy web client runs the renderer-side
 *  Family Safe Mode guard before fetch, so unsafe payloads never reach the proxy. */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { venice, veniceBlob, veniceFormData } from "./venice-client";

const maybeRunLocalFamilyGuard = vi.fn();

vi.mock("../services/desktopBridge", () => ({
  desktopVenice: {
    request: vi.fn(),
    streamChat: vi.fn(),
  },
  isElectron: () => false,
}));

vi.mock("../stores/inspector-store", () => ({
  useInspectorStore: {
    getState: () => ({
      addLog: vi.fn(() => "log-id-mock"),
      updateLog: vi.fn(),
    }),
  },
}));

vi.mock("../services/inspectorTelemetry", () => ({
  buildInspectorTelemetryPatch: vi.fn(() => ({})),
  classifyInspectorError: vi.fn((_status?: number, error?: unknown) => (
    typeof error === "string" && error.includes("Family Safe") ? "safety-block" : "client"
  )),
  deriveCallOutcome: vi.fn(() => "error"),
  deriveGuardOutcome: vi.fn(() => "allow"),
  maskInspectorHeaders: vi.fn((h: unknown) => h),
  sanitizeInspectorPayload: vi.fn((p: unknown) => p),
  safeInspectorError: vi.fn((err: unknown) => {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    return "mock safe error";
  }),
  getSafetyDecisionForLog: vi.fn(() => ({ decision: null, previewDurationMs: 0 })),
}));

vi.mock("../services/veniceClient/safety", () => ({
  getSafetyDecisionForLog: vi.fn(() => ({ decision: null, previewDurationMs: 0 })),
}));


vi.mock("../shared/safety/localFamilySafeGuard", () => ({
  maybeRunLocalFamilyGuard: (...args: unknown[]) => maybeRunLocalFamilyGuard(...args),
  previewLocalFamilyGuard: vi.fn(),
  FAMILY_SAFE_MODE_BLOCK_MESSAGE: "Blocked by Family Safe Mode",
  runLocalFamilyGuard: vi.fn(),
  safetyBlockBodyFromResponseScreen: vi.fn(),
  screenResponseBody: vi.fn(),
}));

// Also mock the barrel so fetch.ts (which imports from "../../shared/safety")
// sees the same maybeRunLocalFamilyGuard spy.
vi.mock("../shared/safety", () => ({
  maybeRunLocalFamilyGuard: (...args: unknown[]) => maybeRunLocalFamilyGuard(...args),
  previewLocalFamilyGuard: vi.fn(),
  SafetyGuardBlockedError: class SafetyGuardBlockedError extends Error {
    readonly status = 451;
    readonly decision = { allow: false, action: "block", reasonCode: "sp-001-test" };
    constructor({ userMessage }: { userMessage?: string } = {}) {
      super(userMessage ?? "Blocked by Family Safe Mode");
      this.name = "SafetyGuardBlockedError";
    }
  },
  assessChildExploitationSafety: vi.fn(),
  assertChildExploitationSafe: vi.fn(),
  assessPromptForSafeContext: vi.fn(),
  normalizeText: vi.fn(),
  extractPromptLikeFields: vi.fn(() => []),
  recordDecision: vi.fn(),
  getAuditSnapshot: vi.fn(),
  _resetAuditCounters_TEST_ONLY: vi.fn(),
  runLocalFamilyGuard: vi.fn(),
  safetyBlockBodyFromResponseScreen: vi.fn(),
  screenResponseBody: vi.fn(),
}));

vi.mock("../shared/safety/childExploitationGuard", () => ({
  SafetyGuardBlockedError: class SafetyGuardBlockedError extends Error {
    readonly status = 451;
    readonly decision = { allow: false, action: "block", reasonCode: "sp-001-test" };
    constructor() {
      super("Blocked by Family Safe Mode");
      this.name = "SafetyGuardBlockedError";
    }
  },
}));

vi.mock("../stores/settings-store", () => ({
  useSettingsStore: {
    getState: () => ({ localFamilySafeModeEnabled: true }),
  },
}));

global.fetch = vi.fn();

describe("legacy web surface Family Safe Mode guard (SP-001 regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    maybeRunLocalFamilyGuard.mockReturnValue({
      allowed: true,
      guardDecision: { allow: true, action: "allow", reasonCode: "ok" },
    });
  });

  it("venice() blocks unsafe POST payloads before fetch", async () => {
    maybeRunLocalFamilyGuard.mockReturnValue({
      allowed: false,
      reason: "sp-001-test",
      ruleId: "sp-001-test",
      userMessage: "Blocked by Family Safe Mode",
      guardDecision: { allow: false, action: "block", reasonCode: "sp-001-test" },
    });

    await expect(
      venice("/chat/completions", { method: "POST", body: { prompt: "unsafe" } }),
    ).rejects.toThrow("Blocked by Family Safe Mode");
    expect(maybeRunLocalFamilyGuard).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "/chat/completions", method: "POST" }),
      true,
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("venice() allows safe payloads through to fetch", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      text: async () => "{}",
      json: async () => ({ ok: true }),
    } as unknown as Response);

    await venice("/models", { method: "GET" });
    expect(fetch).toHaveBeenCalled();
  });

  it("veniceBlob() blocks unsafe payloads before fetch", async () => {
    maybeRunLocalFamilyGuard.mockReturnValue({
      allowed: false,
      reason: "sp-001-test",
      userMessage: "Blocked by Family Safe Mode",
      guardDecision: { allow: false, action: "block", reasonCode: "sp-001-test" },
    });

    await expect(veniceBlob("/image/generate", { prompt: "unsafe" })).rejects.toThrow(
      "Blocked by Family Safe Mode",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("veniceFormData() blocks unsafe payloads before fetch", async () => {
    maybeRunLocalFamilyGuard.mockReturnValue({
      allowed: false,
      reason: "sp-001-test",
      userMessage: "Blocked by Family Safe Mode",
      guardDecision: { allow: false, action: "block", reasonCode: "sp-001-test" },
    });

    const fd = new FormData();
    fd.append("prompt", "unsafe");
    await expect(veniceFormData("/augment/scrape", fd)).rejects.toThrow(
      "Blocked by Family Safe Mode",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("skips the guard for GET requests with no body", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      text: async () => "{}",
      json: async () => ({ ok: true }),
    } as unknown as Response);

    await venice("/models", { method: "GET" });
    expect(maybeRunLocalFamilyGuard).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalled();
  });
});
