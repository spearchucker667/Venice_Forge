/** @fileoverview Unit tests for redaction of secrets and tokens. */

import { describe, expect, it } from "vitest";
import { redactErrorMessage, redactSecrets } from "./redaction";

/** Tests for redactSecrets. */
describe("redactSecrets", () => {
  /** Verifies redaction of bearer tokens, API keys, and authorization headers. */
  it("redacts bearer tokens, API keys, and authorization headers", () => {
    const value = redactSecrets({
      Authorization: "Bearer vn-secret-token",
      message: "api_key=vn-another-secret",
      nested: { token: "vn-token-value" },
    });

    const serialized = JSON.stringify(value);
    expect(serialized).not.toContain("vn-secret-token");
    expect(serialized).not.toContain("vn-another-secret");
    expect(serialized).not.toContain("vn-token-value");
    expect(serialized).toContain("[REDACTED]");
  });

  it("redacts sk keys and named environment secret assignments", () => {
    const value = redactSecrets(
      "OPENAI_API_KEY=sk-1234567890abcdef JINA_TOKEN='token-value-123'"
    );

    expect(value).toBe("OPENAI_API_KEY=[REDACTED] JINA_TOKEN=[REDACTED]");
  });

  // BUG-011 regression guard: redaction must not recurse forever on cyclic objects.
  it("replaces cyclic references with a placeholder", () => {
    const value: { name: string; self?: unknown } = { name: "diagnostics" };
    value.self = value;

    expect(redactSecrets(value)).toEqual({
      name: "diagnostics",
      self: "[Circular]",
    });
  });
});

describe("redactErrorMessage", () => {
  it("redacts secrets embedded in errors", () => {
    expect(redactErrorMessage(new Error("failed with sk-1234567890abcdef")))
      .toBe("failed with [REDACTED]");
  });

  it("redacts local absolute paths", () => {
    expect(redactErrorMessage(new Error("failed at /Users/private/config.json")))
      .toBe("failed at [REDACTED-PATH]");
  });

  it("redacts venice_ tokens", () => {
    expect(redactErrorMessage(new Error("token venice_abc123xyz leaked")))
      .toBe("token [REDACTED] leaked");
  });
});
