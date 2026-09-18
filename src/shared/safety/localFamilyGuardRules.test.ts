import { beforeEach, describe, expect, it, vi } from "vitest";
import { assessChildExploitationSafety, evaluateImageAdultContentPolicy } from "./childExploitationGuard";
import { runLocalFamilyGuard } from "./localFamilyGuardRules";

vi.mock("./childExploitationGuard", async () => {
  const actual = await vi.importActual<typeof import("./childExploitationGuard")>("./childExploitationGuard");
  return {
    ...actual,
    assessChildExploitationSafety: vi.fn(),
    evaluateImageAdultContentPolicy: vi.fn(),
  };
});

const input = {
  text: "draw a protected subject",
  endpoint: "/image/generate",
  method: "POST" as const,
  source: "image" as const,
};

describe("runLocalFamilyGuard", () => {
  beforeEach(() => {
    vi.mocked(assessChildExploitationSafety).mockReset();
    vi.mocked(evaluateImageAdultContentPolicy).mockReset();
  });

  it("does not invoke local safety rules when Family Safe Mode is disabled", () => {
    const decision = runLocalFamilyGuard(input, false);

    expect(assessChildExploitationSafety).not.toHaveBeenCalled();
    expect(evaluateImageAdultContentPolicy).not.toHaveBeenCalled();
    expect(decision).toMatchObject({
      allow: true,
      action: "allow",
      reasonCode: "LOCAL_FAMILY_SAFE_MODE_DISABLED",
    });
  });

  it("runs child-safety and image policy rules when enabled", () => {
    vi.mocked(assessChildExploitationSafety).mockReturnValue({
      allow: true,
      action: "allow",
      severity: "none",
      category: "none",
      reasonCode: "OK",
      userMessage: "",
      developerMessage: "ok",
      normalizedChanged: false,
      signals: [],
      audit: {
        decisionId: "test",
        createdAt: "2026-09-18T00:00:00.000Z",
        promptHash: "",
        promptLength: input.text.length,
        matchedFieldPaths: [],
      },
    });

    runLocalFamilyGuard(input, true);

    expect(assessChildExploitationSafety).toHaveBeenCalledExactlyOnceWith(input);
    expect(evaluateImageAdultContentPolicy).toHaveBeenCalledExactlyOnceWith(input);
  });
});
