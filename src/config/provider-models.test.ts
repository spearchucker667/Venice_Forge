import { describe, expect, it } from "vitest";
import type { VeniceModel } from "../types/venice";
import { useSettingsStore } from "../stores/settings-store";
import { getEnabledProviderModels, getFallbackCatalogStatus } from "./provider-models";

// VERIFY-142 regression guard: bundled fallback catalogs never masquerade as live/fresh discovery.
describe("fallback provider catalog status", () => {
  it("marks Venice as live and static provider catalogs as explicitly stale", () => {
    expect(getFallbackCatalogStatus("venice")).toEqual({ source: "live", stale: false, diagnostic: null });
    expect(getFallbackCatalogStatus("together")).toEqual({
      source: "bundled-static",
      stale: true,
      diagnostic: "Bundled model catalog may be stale; verify the model with the provider before a paid request.",
    });
  });

  it("labels enabled bundled models in production picker data", () => {
    useSettingsStore.setState((state) => ({
      enabledProviders: { ...state.enabledProviders, google_gemini: true },
    }));

    const model = getEnabledProviderModels("text").find((candidate) => candidate.owned_by === "google_gemini");

    expect(model).toMatchObject({ source: "fallback", isFallback: true });
    expect(model).toBeDefined();
    if (!model) throw new Error("Expected the enabled Google Gemini fallback model");
    expect((model as VeniceModel & { name: string }).name).toContain("verify before paid request");
    expect(model.model_spec?.name).toContain("bundled static");
    expect(model.model_spec?.description).toContain("may be stale");
  });
});
