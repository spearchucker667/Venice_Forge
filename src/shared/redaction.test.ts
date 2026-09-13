/** @fileoverview Unit tests for redaction of secrets and tokens. */

import { describe, expect, it } from "vitest";
import { redactErrorMessage, redactSecrets, sanitizeErrorText } from "./redaction";

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

  it("redacts Hugging Face, GitHub, AWS, and Slack token families", () => {
    const hf = "hf_" + "a".repeat(24);
    const ghp = "ghp_" + "a".repeat(24);
    const aws = "AKIA" + "0".repeat(16);
    const slack = "xoxb-" + "0".repeat(12);

    const value = redactSecrets(`providers ${hf} ${ghp} ${aws} ${slack}`);

    expect(value).not.toContain(hf);
    expect(value).not.toContain(ghp);
    expect(value).not.toContain(aws);
    expect(value).not.toContain(slack);
    expect(value).toBe("providers [REDACTED] [REDACTED] [REDACTED] [REDACTED]");
  });

  it("redacts credential-bearing object keys", () => {
    const value = redactSecrets({
      credential: "raw-provider-key-value",
      private_key: "pk-material",
      passphrase: "correct-horse-battery",
      session: "session-secret",
      name: "diagnostics",
    });

    expect(value).toEqual({
      credential: "[REDACTED]",
      private_key: "[REDACTED]",
      passphrase: "[REDACTED]",
      session: "[REDACTED]",
      name: "diagnostics",
    });
    expect(redactSecrets({ sessionId: "sess-public-id", name: "ok" })).toEqual({
      sessionId: "sess-public-id",
      name: "ok",
    });
  });

  it("redacts quoted multi-word environment secret assignments", () => {
    const value = redactSecrets('OPENAI_API_KEY="token with space"');

    expect(value).toBe("OPENAI_API_KEY=[REDACTED]");
    expect(value).not.toContain("token with space");
  });

  it("does not redact ordinary session prose or short hf_ voice ids", () => {
    const prose = "Continue this session after lunch; voice hf_alpha is fine.";

    expect(redactSecrets(prose)).toBe(prose);
    expect(redactSecrets("session=super-secret-value")).toBe("session=[REDACTED]");
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
    expect(sanitizeErrorText("/mnt/data/vf/repo/src/file.ts:1:2")).not.toContain("/mnt/data");
    expect(sanitizeErrorText("/tmp/build/repo/src/file.ts")).not.toContain("/tmp");
    expect(sanitizeErrorText("/Volumes/External/repo/src/file.ts")).not.toContain("/Volumes");
  });

  it("preserves API paths and dates while redacting machine paths (GSS-P3-007)", () => {
    const text = sanitizeErrorText("GET https://api.venice.ai/v1/models failed 2026/09/12");
    expect(text).toContain("api.venice.ai");
    expect(text).toContain("/v1/models");
    expect(text).toContain("2026/09/12");
    expect(sanitizeErrorText("endpoint /image/generate returned 400")).toContain("/image/generate");
    expect(sanitizeErrorText("at Thrower (http://localhost:5173/src/thrower.tsx:5:10)")).toContain("[REDACTED-PATH]");
    expect(sanitizeErrorText("at Thrower (http://localhost:5173/src/thrower.tsx:5:10)")).not.toContain("localhost");
  });

  it("redacts venice_ tokens", () => {
    expect(redactErrorMessage(new Error("token venice_abc123xyz leaked")))
      .toBe("token [REDACTED] leaked");
  });
});
