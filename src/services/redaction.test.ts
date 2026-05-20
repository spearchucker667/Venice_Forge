import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redaction";

describe("redactSecrets", () => {
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
});
