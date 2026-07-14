// VERIFY-105 regression guard
// @vitest-environment node

import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let userDataPath = "";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => userDataPath) },
}));

import { disableProvider, getProviderSettings, updateProviderSettings } from "./providerSettingsStore";

describe("providerSettingsStore", () => {
  beforeEach(() => {
    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "vf-provider-settings-"));
  });

  afterEach(() => {
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });

  it("keeps provider consent profile-scoped and filters renderer-controlled values", () => {
    const work = updateProviderSettings("work", {
      enabledProviders: { anthropic: true, aws_bedrock: true, unknown: true },
      autoFallbackEnabled: true,
      fallbackOrdering: ["anthropic", "unknown", "anthropic", "aws_bedrock"],
    });

    expect(work.enabledProviders).toEqual({ anthropic: true });
    expect(work.fallbackOrdering).toEqual(["anthropic"]);
    expect(work.nativeFallbackModels.anthropic).toBe("claude-3-5-sonnet-latest");
    expect(getProviderSettings("default").enabledProviders).toEqual({});
  });

  it("removes provider consent and ordering when its credential is deleted", () => {
    updateProviderSettings("work", {
      enabledProviders: { anthropic: true, together: true },
      autoFallbackEnabled: true,
      fallbackOrdering: ["anthropic", "together"],
    });

    expect(disableProvider("work", "anthropic")).toMatchObject({
      enabledProviders: { together: true },
      fallbackOrdering: ["together"],
    });
  });
});
