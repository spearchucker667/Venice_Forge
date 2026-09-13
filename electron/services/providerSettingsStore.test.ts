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

import { disableProvider, getProviderSettings, isProviderAvailableForFallback, updateProviderSettings } from "./providerSettingsStore";
import { DEFERRED_PROVIDER_IDS } from "../../src/types/provider";

describe("providerSettingsStore", () => {
  beforeEach(() => {
    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), "vf-provider-settings-"));
  });

  afterEach(() => {
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });

  it("keeps provider consent profile-scoped and filters renderer-controlled values", () => {
    const work = updateProviderSettings("work", {
      enabledProviders: { anthropic: true, replicate: true, unknown: true },
      autoFallbackEnabled: true,
      fallbackOrdering: ["anthropic", "unknown", "anthropic", "replicate"],
    });

    expect(work.enabledProviders).toEqual({ anthropic: true, replicate: true });
    expect(work.fallbackOrdering).toEqual(["anthropic", "replicate"]);
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

  it("never accepts deferred providers into credential-backed fallback routing", () => {
    for (const providerId of DEFERRED_PROVIDER_IDS) {
      expect(isProviderAvailableForFallback(providerId)).toBe(false);
    }
  });

  it("[P2-006] writes through unique temp names before rename", () => {
    const uniqueTmpRe = /[\\/]\.vf-replace-[^\\/]+[\\/]\.provider-settings\.json\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const writeSpy = vi.spyOn(fs, "writeFileSync");
    const renameSpy = vi.spyOn(fs, "renameSync");
    try {
      updateProviderSettings("work", { enabledProviders: { anthropic: true } });
      updateProviderSettings("work", { enabledProviders: { together: true } });
      const tmpWrites = writeSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((file) => uniqueTmpRe.test(file));
      expect(tmpWrites).toHaveLength(2);
      expect(tmpWrites[0]).not.toBe(tmpWrites[1]);
      expect(path.dirname(tmpWrites[0])).not.toBe(path.dirname(tmpWrites[1]));
      const renameSources = renameSpy.mock.calls
        .map((call) => String(call[0]))
        .filter((file) => uniqueTmpRe.test(file));
      expect(renameSources).toEqual(tmpWrites);
      const parsed = JSON.parse(fs.readFileSync(path.join(userDataPath, "provider-settings.json"), "utf8")) as {
        profiles: Record<string, { enabledProviders: Record<string, boolean> }>;
      };
      expect(parsed.profiles.work.enabledProviders).toEqual({ together: true });
    } finally {
      writeSpy.mockRestore();
      renameSpy.mockRestore();
    }
  });
});
