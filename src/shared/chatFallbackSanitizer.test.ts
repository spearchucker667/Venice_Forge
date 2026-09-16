/** @fileoverview Tests for VF-20260916-P1-001 fallback sanitization. */

import { describe, expect, it } from "vitest";
import {
  cloneSanitizedForFallbackProvider,
  VENICE_ONLY_CHAT_TOP_LEVEL_FIELDS,
  VENICE_ONLY_VENICE_PARAM_FIELDS,
} from "./chatFallbackSanitizer";

describe("cloneSanitizedForFallbackProvider", () => {
  it("strips Venice-only fields from the clone", () => {
    const primary = {
      model: "m",
      messages: [],
      stream: true,
      prompt_cache_retention: "24h",
      venice_parameters: {
        enable_e2ee: true,
        enable_web_search: "off",
      },
    };

    const sanitized = cloneSanitizedForFallbackProvider(primary);

    expect(sanitized.prompt_cache_retention).toBeUndefined();
    expect(sanitized.venice_parameters.enable_e2ee).toBeUndefined();
    // Non-Venice-only fields survive.
    expect(sanitized.model).toBe("m");
    expect(sanitized.venice_parameters.enable_web_search).toBe("off");
  });

  it("never mutates the primary Venice body", () => {
    const primary = {
      prompt_cache_retention: "extended",
      venice_parameters: { enable_e2ee: false },
    };

    cloneSanitizedForFallbackProvider(primary);

    expect(primary.prompt_cache_retention).toBe("extended");
    expect(primary.venice_parameters.enable_e2ee).toBe(false);
  });

  it("tolerates bodies without venice_parameters or Venice-only fields", () => {
    const minimal = { model: "m", messages: [] };
    const sanitized = cloneSanitizedForFallbackProvider(minimal);
    expect(sanitized).toEqual(minimal);
    expect(sanitized).not.toBe(minimal);
  });

  it("exposes the canonical Venice-only field lists", () => {
    expect(VENICE_ONLY_CHAT_TOP_LEVEL_FIELDS).toEqual(["prompt_cache_retention"]);
    expect(VENICE_ONLY_VENICE_PARAM_FIELDS).toEqual(["enable_e2ee"]);
  });
});
