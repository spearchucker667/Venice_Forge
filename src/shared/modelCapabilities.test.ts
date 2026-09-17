/** @fileoverview Unit tests for the shared model capability gates. */
import { describe, expect, it } from "vitest";
import {
  getDefaultReasoningEffort,
  getReasoningEffortOptions,
  REASONING_EFFORT_OPTIONS,
  resolveModelDeprecation,
  resolveReasoningEffort,
  supportsReasoningEffort,
} from "./modelCapabilities";

describe("supportsReasoningEffort", () => {
  it("is true only when the model explicitly advertises support", () => {
    expect(
      supportsReasoningEffort({
        model_spec: { capabilities: { supportsReasoningEffort: true } },
      }),
    ).toBe(true);
  });

  it("fails closed when the flag is false or absent", () => {
    expect(
      supportsReasoningEffort({
        model_spec: { capabilities: { supportsReasoningEffort: false } },
      }),
    ).toBe(false);
    expect(supportsReasoningEffort({ model_spec: { capabilities: {} } })).toBe(false);
    expect(supportsReasoningEffort({ model_spec: {} })).toBe(false);
    expect(supportsReasoningEffort(undefined)).toBe(false);
  });
});

describe("getReasoningEffortOptions", () => {
  it("returns the model's advertised option list", () => {
    expect(
      getReasoningEffortOptions({
        model_spec: {
          capabilities: {
            supportsReasoningEffort: true,
            reasoningEffortOptions: ["low", "medium", "high"],
          },
        },
      }),
    ).toEqual(["low", "medium", "high"]);
  });

  it("offers the full documented enum when the model advertises no restriction", () => {
    expect(
      getReasoningEffortOptions({
        model_spec: { capabilities: { supportsReasoningEffort: true } },
      }),
    ).toEqual([...REASONING_EFFORT_OPTIONS]);
    expect(
      getReasoningEffortOptions({
        model_spec: {
          capabilities: {
            supportsReasoningEffort: true,
            reasoningEffortOptions: [],
          },
        },
      }),
    ).toEqual([...REASONING_EFFORT_OPTIONS]);
  });

  it("filters advertised values outside the documented enum", () => {
    expect(
      getReasoningEffortOptions({
        model_spec: {
          capabilities: {
            supportsReasoningEffort: true,
            reasoningEffortOptions: ["low", "bogus-effort", "high"],
          },
        },
      }),
    ).toEqual(["low", "high"]);
  });

  it("falls back to the full enum when filtering removes every value", () => {
    expect(
      getReasoningEffortOptions({
        model_spec: {
          capabilities: {
            supportsReasoningEffort: true,
            reasoningEffortOptions: ["bogus"],
          },
        },
      }),
    ).toEqual([...REASONING_EFFORT_OPTIONS]);
  });

  it("returns null when the model does not support reasoning effort", () => {
    expect(
      getReasoningEffortOptions({
        model_spec: { capabilities: { supportsReasoningEffort: false } },
      }),
    ).toBeNull();
  });

  it("returns null when metadata is missing entirely (fail closed)", () => {
    expect(getReasoningEffortOptions(undefined)).toBeNull();
    expect(getReasoningEffortOptions({})).toBeNull();
    expect(getReasoningEffortOptions({ model_spec: {} })).toBeNull();
  });
});

describe("getDefaultReasoningEffort", () => {
  it("returns the advertised default when valid for the model", () => {
    expect(
      getDefaultReasoningEffort({
        model_spec: {
          capabilities: {
            supportsReasoningEffort: true,
            reasoningEffortOptions: ["low", "medium", "high"],
            defaultReasoningEffort: "medium",
          },
        },
      }),
    ).toBe("medium");
  });

  it("returns undefined when the advertised default is not in the option list", () => {
    expect(
      getDefaultReasoningEffort({
        model_spec: {
          capabilities: {
            supportsReasoningEffort: true,
            reasoningEffortOptions: ["low", "high"],
            defaultReasoningEffort: "max",
          },
        },
      }),
    ).toBeUndefined();
  });

  it("returns undefined when absent or unsupported", () => {
    expect(
      getDefaultReasoningEffort({
        model_spec: { capabilities: { supportsReasoningEffort: true } },
      }),
    ).toBeUndefined();
    expect(getDefaultReasoningEffort(undefined)).toBeUndefined();
  });
});

describe("resolveReasoningEffort", () => {
  const restrictedModel = {
    model_spec: {
      capabilities: {
        supportsReasoningEffort: true,
        reasoningEffortOptions: ["low", "medium", "high"],
        defaultReasoningEffort: "medium",
      },
    },
  };

  it("omits the field when the request is unset", () => {
    expect(resolveReasoningEffort(restrictedModel, undefined)).toBeUndefined();
    expect(resolveReasoningEffort(restrictedModel, "")).toBeUndefined();
  });

  it("passes through values the model supports", () => {
    expect(resolveReasoningEffort(restrictedModel, "low")).toBe("low");
    expect(resolveReasoningEffort(restrictedModel, "high")).toBe("high");
  });

  it("repairs invalid values to the model default instead of sending them", () => {
    expect(resolveReasoningEffort(restrictedModel, "max")).toBe("medium");
    expect(resolveReasoningEffort(restrictedModel, "xhigh")).toBe("medium");
  });

  it("repairs to undefined when the model has no advertised default", () => {
    expect(
      resolveReasoningEffort(
        {
          model_spec: {
            capabilities: {
              supportsReasoningEffort: true,
              reasoningEffortOptions: ["low", "high"],
            },
          },
        },
        "max",
      ),
    ).toBeUndefined();
  });

  it("never sends the parameter to a model without advertised support", () => {
    expect(
      resolveReasoningEffort(
        { model_spec: { capabilities: { supportsReasoningEffort: false } } },
        "high",
      ),
    ).toBeUndefined();
  });

  it("fails closed when model metadata is missing", () => {
    expect(resolveReasoningEffort(undefined, "high")).toBeUndefined();
    expect(resolveReasoningEffort({}, "high")).toBeUndefined();
  });

  it("accepts any documented enum value for models that advertise no restriction", () => {
    const unrestrictedModel = {
      model_spec: { capabilities: { supportsReasoningEffort: true } },
    };
    for (const effort of REASONING_EFFORT_OPTIONS) {
      expect(resolveReasoningEffort(unrestrictedModel, effort)).toBe(effort);
    }
  });
});

describe("resolveModelDeprecation", () => {
  it("resolves the documented model_spec.deprecation object", () => {
    expect(
      resolveModelDeprecation({
        model_spec: {
          deprecation: {
            autoRemap: true,
            date: "2026-10-01T00:00:00.000Z",
            removesAt: "2026-10-15T00:00:00.000Z",
            replacementModelId: "new-model",
            startsAt: "2026-09-01T00:00:00.000Z",
          },
        },
      }),
    ).toEqual({
      removesAt: "2026-10-15T00:00:00.000Z",
      startsAt: "2026-09-01T00:00:00.000Z",
      replacementModelId: "new-model",
      autoRemap: true,
      source: "model_spec",
    });
  });

  it("prefers removesAt and falls back to the legacy date field", () => {
    expect(
      resolveModelDeprecation({
        model_spec: {
          deprecation: { autoRemap: false, date: "2026-10-01T00:00:00.000Z", removesAt: "" },
        },
      })?.removesAt,
    ).toBe("2026-10-01T00:00:00.000Z");
    expect(
      resolveModelDeprecation({
        model_spec: {
          deprecation: { autoRemap: false, date: "2026-10-01T00:00:00.000Z", removesAt: "2026-11-01T00:00:00.000Z" },
        },
      })?.removesAt,
    ).toBe("2026-11-01T00:00:00.000Z");
  });

  it("returns null for models without a deprecation record", () => {
    expect(resolveModelDeprecation(undefined)).toBeNull();
    expect(resolveModelDeprecation({})).toBeNull();
    expect(resolveModelDeprecation({ model_spec: {} })).toBeNull();
    expect(
      resolveModelDeprecation({
        model_spec: { name: "Fine" },
      } as Parameters<typeof resolveModelDeprecation>[0]),
    ).toBeNull();
  });

  it("normalizes legacy fallback-provider lifecycle fields", () => {
    expect(
      resolveModelDeprecation({
        lifecycle: "deprecated",
        retirementDate: "2026-12-01T00:00:00.000Z",
      }),
    ).toEqual({
      removesAt: "2026-12-01T00:00:00.000Z",
      source: "legacy",
    });
    expect(
      resolveModelDeprecation({ lifecycle: "retiring" }),
    ).toEqual({ source: "legacy" });
    expect(
      resolveModelDeprecation({ lifecycle: "active" }),
    ).toBeNull();
  });
});
