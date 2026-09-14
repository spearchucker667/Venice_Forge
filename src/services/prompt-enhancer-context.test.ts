import { describe, expect, it } from "vitest";
import { getImageModelCapabilities } from "../config/image-model-capabilities";
import type { VeniceModel } from "../types/venice";
import {
  derivePromptEnhancerModelFacts,
  effectiveEnhancerPromptLimit,
} from "./prompt-enhancer-context";

describe("prompt enhancer model context", () => {
  it("combines only canonical runtime and capability facts", () => {
    const runtimeModel = {
      id: "nano-banana-v1",
      model_spec: {
        constraints: { promptCharacterLimit: 900 },
      },
    } as VeniceModel;
    const facts = derivePromptEnhancerModelFacts({
      modelId: runtimeModel.id,
      runtimeModel,
      capabilities: getImageModelCapabilities(runtimeModel.id),
    });
    expect(facts).toMatchObject({
      id: "nano-banana-v1",
      promptCharacterLimit: 900,
      dimensionMode: "aspectResolution",
      supportsNegativePrompt: true,
    });
    expect(facts).not.toHaveProperty("description");
    expect(facts).not.toHaveProperty("promptingAdvice");
  });

  it("never permits a runtime limit above the application ceiling", () => {
    const facts = derivePromptEnhancerModelFacts({
      modelId: "flux-dev",
      runtimeModel: {
        model_spec: { prompt_character_limit: 99_999 },
      },
      capabilities: getImageModelCapabilities("flux-dev"),
    });
    expect(facts.promptCharacterLimit).toBe(7500);
    expect(effectiveEnhancerPromptLimit(facts)).toBe(7500);
  });
});
