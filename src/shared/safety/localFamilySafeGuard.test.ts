import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SafetyGuardDecision } from "./childExploitationGuard";

vi.mock("./localFamilyGuardRules", () => ({
  runLocalFamilyGuard: vi.fn(),
}));

vi.mock("./guardAudit", () => ({
  recordDecision: vi.fn(),
  getAuditSnapshot: vi.fn(() => ({
    allowed: 0,
    warned: 0,
    blocked: 0,
    bySeverity: {},
    byCategory: {},
    lastDecisionAt: null,
    lastReasonCode: null,
  })),
}));

import { runLocalFamilyGuard } from "./localFamilyGuardRules";
import { recordDecision } from "./guardAudit";
import { maybeRunLocalFamilyGuard, screenResponseBody } from "./localFamilySafeGuard";

const allowedDecision: SafetyGuardDecision = {
  allow: true,
  action: "allow",
  severity: "none",
  category: "none",
  reasonCode: "ALLOWED_NO_SIGNALS",
  userMessage: "",
  developerMessage: "allowed",
  normalizedChanged: false,
  signals: [],
  audit: {
    decisionId: "test",
    createdAt: "2026-06-05T00:00:00.000Z",
    promptHash: "00000000",
    promptLength: 4,
    matchedFieldPaths: [],
  },
};

const blockedDecision: SafetyGuardDecision = {
  ...allowedDecision,
  allow: false,
  action: "block",
  severity: "critical",
  category: "csam_request",
  reasonCode: "TEST_BLOCK",
  userMessage: "legacy message",
};

describe("maybeRunLocalFamilyGuard", () => {
  beforeEach(() => {
    vi.mocked(runLocalFamilyGuard).mockReset();
    vi.mocked(runLocalFamilyGuard).mockReturnValue(allowedDecision);
    vi.mocked(recordDecision).mockReset();
  });

  it("disabled local safeguards short-circuit before all local evaluators", async () => {
    const sendToVeniceApi = vi.fn().mockResolvedValue({ ok: true });
    const input = { text: "synthetic fixture", endpoint: "/chat/completions", method: "POST", source: "chat" as const };
    const decision = maybeRunLocalFamilyGuard(input, false);
    if (decision.allowed) await sendToVeniceApi();

    expect(runLocalFamilyGuard).not.toHaveBeenCalled();
    expect(recordDecision).not.toHaveBeenCalled();
    expect(sendToVeniceApi).toHaveBeenCalled();
    expect(decision).toEqual({
      allowed: true,
      skipped: true,
      reason: "LOCAL_FAMILY_SAFE_MODE_DISABLED",
      category: "general",
      layer: "disabled-local-family-safe-mode",
    });
  });

  it("disabled local safeguards do not produce local 451", () => {
    const input = { text: "synthetic blocked fixture", endpoint: "/chat/completions", method: "POST", source: "chat" as const };
    const decision = maybeRunLocalFamilyGuard(input, false);

    expect(runLocalFamilyGuard).not.toHaveBeenCalled();
    expect(recordDecision).not.toHaveBeenCalled();
    expect(decision.allowed).toBe(true);
    expect(decision.skipped).toBe(true);
  });

  it("disabled local safeguards do not record classifier decisions", () => {
    const input = { text: "any prompt content", endpoint: "/chat/completions", method: "POST", source: "chat" as const };
    maybeRunLocalFamilyGuard(input, false);

    expect(recordDecision).not.toHaveBeenCalled();
  });

  it("disabled local safeguards do not mutate prompt/request", () => {
    const input = { text: "  untrimmed prompt with spaces  ", endpoint: "/chat/completions", method: "POST", source: "chat" as const, payload: { original: true } };
    const inputCopy = JSON.parse(JSON.stringify(input));
    maybeRunLocalFamilyGuard(input, false);

    expect(input).toEqual(inputCopy);
  });

  it("enabled local safeguards still enforce expected local policy", async () => {
    vi.mocked(runLocalFamilyGuard).mockReturnValue(blockedDecision);
    const sendToVeniceApi = vi.fn();
    const input = { text: "synthetic blocked fixture", endpoint: "/chat/completions", method: "POST", source: "chat" as const };
    const decision = maybeRunLocalFamilyGuard(input, true);
    if (decision.allowed) await sendToVeniceApi();

    expect(runLocalFamilyGuard).toHaveBeenCalledWith(input, true);
    expect(recordDecision).toHaveBeenCalledWith(blockedDecision);
    expect(sendToVeniceApi).not.toHaveBeenCalled();
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.layer).toBe("mandatory-child-safety");
    }
  });

  it.each([
    { localFamilySafeModeEnabled: true, veniceApiSafeMode: true },
    { localFamilySafeModeEnabled: true, veniceApiSafeMode: false },
    { localFamilySafeModeEnabled: false, veniceApiSafeMode: true },
    { localFamilySafeModeEnabled: false, veniceApiSafeMode: false },
  ])("provider safe_mode remains independent while local safeguards are disabled: %o", (settings) => {
    vi.mocked(runLocalFamilyGuard).mockReturnValue(allowedDecision);
    const input = { text: "synthetic fixture", endpoint: "/image/generate", method: "POST", source: "image" as const };
    const result = maybeRunLocalFamilyGuard(input, settings.localFamilySafeModeEnabled);
    const providerPayload = { safe_mode: settings.veniceApiSafeMode };

    expect(result.allowed).toBe(true);
    if (settings.localFamilySafeModeEnabled) {
      expect(runLocalFamilyGuard).toHaveBeenCalledWith(input, true);
      expect(recordDecision).toHaveBeenCalledWith(allowedDecision);
    } else {
      expect(runLocalFamilyGuard).not.toHaveBeenCalled();
      expect(recordDecision).not.toHaveBeenCalled();
    }
    expect(providerPayload.safe_mode).toBe(settings.veniceApiSafeMode);
    if (result.allowed) {
      expect(result.layer).toBe(
        settings.localFamilySafeModeEnabled ? "optional-family-policy" : "disabled-local-family-safe-mode"
      );
    }
  });

  it("screenResponseBody short-circuits with zero evaluation when disabled", () => {
    const result = screenResponseBody("synthetic body", { endpoint: "/augment/scrape", method: "GET", source: "scrape" }, false);
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe("LOCAL_FAMILY_SAFE_MODE_DISABLED");
    }
    expect(runLocalFamilyGuard).not.toHaveBeenCalled();
    expect(recordDecision).not.toHaveBeenCalled();
  });

  it("persisted disabled state is honored before first guarded request after startup", () => {
    // Simulating startup where persisted state has localFamilySafeModeEnabled = false
    const persistedSettings = { localFamilySafeModeEnabled: false, initialized: true };
    const requestInput = { text: "first request after startup", endpoint: "/chat/completions", method: "POST", source: "chat" as const };
    const decision = maybeRunLocalFamilyGuard(requestInput, persistedSettings.localFamilySafeModeEnabled);

    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.skipped).toBe(true);
    }
    expect(runLocalFamilyGuard).not.toHaveBeenCalled();
    expect(recordDecision).not.toHaveBeenCalled();
  });

  it("profile switch does not transiently re-enable local safeguards", () => {
    // Profile A: disabled, Profile B: disabled
    let activeProfileGuardEnabled = false;
    const input = { text: "request during profile switch", endpoint: "/chat/completions", method: "POST", source: "chat" as const };

    // Before switch
    let decision = maybeRunLocalFamilyGuard(input, activeProfileGuardEnabled);
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.skipped).toBe(true);
    }

    // Switch profile to another profile with disabled safeguards
    const targetProfileSettings = { localFamilySafeModeEnabled: false };
    activeProfileGuardEnabled = targetProfileSettings.localFamilySafeModeEnabled;

    decision = maybeRunLocalFamilyGuard(input, activeProfileGuardEnabled);
    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.skipped).toBe(true);
    }
    expect(runLocalFamilyGuard).not.toHaveBeenCalled();
    expect(recordDecision).not.toHaveBeenCalled();
  });

  it("web mode exposes server-controlled state accurately", () => {
    // In web mode, client cannot toggle server operator safety policy
    const isDesktop = false;
    const serverSafetyEnforced = false;
    const effectiveGuardEnabled = isDesktop ? true : serverSafetyEnforced;

    const input = { text: "web mode request", endpoint: "/chat/completions", method: "POST", source: "chat" as const };
    const decision = maybeRunLocalFamilyGuard(input, effectiveGuardEnabled);

    expect(decision.allowed).toBe(true);
    if (decision.allowed) {
      expect(decision.skipped).toBe(true);
    }
    expect(runLocalFamilyGuard).not.toHaveBeenCalled();
    expect(recordDecision).not.toHaveBeenCalled();
  });
});
