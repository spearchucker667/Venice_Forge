import { describe, it, expect } from "vitest";
import { isValidColorValue } from "./validateColor";

describe("validateColor", () => {
  it("rejects non-string values", () => {
    expect(isValidColorValue(null as unknown as string)).toBe(false);
    expect(isValidColorValue(undefined as unknown as string)).toBe(false);
    expect(isValidColorValue(123 as unknown as string)).toBe(false);
  });

  it("rejects excessively long strings", () => {
    const longString = "#" + "a".repeat(130);
    expect(isValidColorValue(longString)).toBe(false);
  });

  it("rejects dangerous patterns", () => {
    expect(isValidColorValue("url(http://malicious.com)")).toBe(false);
    expect(isValidColorValue("expression(alert(1))")).toBe(false);
    expect(isValidColorValue("javascript:alert(1)")).toBe(false);
    expect(isValidColorValue("@import url('...')")).toBe(false);
  });

  it("accepts valid colors", () => {
    expect(isValidColorValue("#fff")).toBe(true);
    expect(isValidColorValue("#ffffff")).toBe(true);
    expect(isValidColorValue("rgba(255, 255, 255, 0.5)")).toBe(true);
    expect(isValidColorValue("transparent")).toBe(true);
    expect(isValidColorValue("currentColor")).toBe(true);
  });

  it("rejects completely invalid text that isn't a color", () => {
    expect(isValidColorValue("not-a-color")).toBe(false);
    expect(isValidColorValue("1234")).toBe(false);
  });
});
