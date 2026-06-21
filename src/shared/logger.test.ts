/** @fileoverview Regression guards for logger redaction. */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as logger from "./logger";

function allOutput(spy: ReturnType<typeof vi.spyOn>): string {
  return JSON.stringify(spy.mock.calls);
}

describe("logger redaction", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts raw absolute paths from console.warn", () => {
    const rawPath = "/Users/super_user/Projects/Windows-Venice-API-connector/secret.yaml";
    logger.warn("load failed at", rawPath);

    expect(warnSpy).toHaveBeenCalled();
    expect(allOutput(warnSpy)).not.toContain(rawPath);
    expect(allOutput(warnSpy)).toContain("[REDACTED-PATH]");
  });

  it("redacts Bearer tokens from console.error", () => {
    const token = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9";
    logger.error("upstream rejected", token);

    expect(errorSpy).toHaveBeenCalled();
    expect(allOutput(errorSpy)).not.toContain(token);
    expect(allOutput(errorSpy)).toContain("Bearer [REDACTED]");
  });

  it("redacts venice_ tokens from console.warn", () => {
    const token = "venice_abc123xyz_secret_token";
    logger.warn("leaked", token);

    expect(allOutput(warnSpy)).not.toContain(token);
    expect(allOutput(warnSpy)).toContain("[REDACTED]");
  });

  it("redacts sk- shaped keys from console.error", () => {
    const key = "sk-1234567890abcdefABCDEF";
    logger.error("provider key", key);

    expect(allOutput(errorSpy)).not.toContain(key);
    expect(allOutput(errorSpy)).toContain("[REDACTED]");
  });

  it("redacts secrets and paths inside Error objects", () => {
    const rawPath = "/home/dev/.config/key";
    const token = "venice_abc123xyz";
    const err = new Error(`failed at ${rawPath} with ${token}`);
    logger.error("handler failed", err);

    expect(errorSpy).toHaveBeenCalled();
    expect(allOutput(errorSpy)).not.toContain(rawPath);
    expect(allOutput(errorSpy)).not.toContain(token);
    expect(allOutput(errorSpy)).toContain("[REDACTED-PATH]");
    expect(allOutput(errorSpy)).toContain("[REDACTED]");
    // The original error must not be mutated.
    expect(err.message).toContain(rawPath);
    expect(err.message).toContain(token);
  });

  it("redacts secret-keyed object properties and paths in values", () => {
    const rawPath = "C:\\Users\\super_user\\secret.txt";
    logger.warn("config", {
      apiKey: "sk-1234567890abcdef",
      url: `file://${rawPath}`,
      nested: { token: "venice_abc123xyz" },
    });

    expect(allOutput(warnSpy)).not.toContain("sk-1234567890abcdef");
    expect(allOutput(warnSpy)).not.toContain(rawPath);
    expect(allOutput(warnSpy)).not.toContain("venice_abc123xyz");
    expect(allOutput(warnSpy)).toContain("[REDACTED]");
    expect(allOutput(warnSpy)).toContain("[REDACTED-PATH]");
  });

  it("passes non-sensitive primitives through unchanged", () => {
    logger.warn("stats", 42, true, null, undefined, "safe message");

    expect(warnSpy).toHaveBeenCalledWith("stats", 42, true, null, undefined, "safe message");
  });

  it("handles circular objects without crashing", () => {
    const obj: Record<string, unknown> = { name: "test" };
    obj.self = obj;
    logger.error("circular", obj);

    expect(errorSpy).toHaveBeenCalled();
    expect(allOutput(errorSpy)).toContain("[Circular]");
  });
});
