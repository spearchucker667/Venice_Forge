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
    expect(isValidColorValue("#ffff")).toBe(true);
    expect(isValidColorValue("#ffffff")).toBe(true);
    expect(isValidColorValue("#ffffffff")).toBe(true);
    expect(isValidColorValue("rgba(255, 255, 255, 0.5)")).toBe(true);
    expect(isValidColorValue("rgb(255 255 255 / 0.5)")).toBe(true);
    expect(isValidColorValue("rgb(255 255 255 / 50%)")).toBe(true);
    expect(isValidColorValue("hsl(120, 50%, 50%)")).toBe(true);
    expect(isValidColorValue("hsl(120 50% 50% / 0.5)")).toBe(true);
    expect(isValidColorValue("hsla(120deg, 50%, 50%, 50%)")).toBe(true);
    expect(isValidColorValue("transparent")).toBe(true);
    expect(isValidColorValue("currentColor")).toBe(true);
  });

  it("rejects malformed hsl (previously accepted by the loose char-class)", () => {
    expect(isValidColorValue("hsl(e)")).toBe(false);
    expect(isValidColorValue("hsl(120)")).toBe(false);
    expect(isValidColorValue("hsl(120, 50)")).toBe(false);
    expect(isValidColorValue("hsl(120, 50%, 50)")).toBe(false);
    expect(isValidColorValue("hsl(abc, def%, ghi%)")).toBe(false);
  });

  it("rejects malformed rgb", () => {
    expect(isValidColorValue("rgb(1,2)")).toBe(false);
    expect(isValidColorValue("rgb(1,2,3,4,5)")).toBe(false);
    expect(isValidColorValue("rgb(a,b,c)")).toBe(false);
  });

  it("rejects non-standard hex lengths", () => {
    expect(isValidColorValue("#12345")).toBe(false);
    expect(isValidColorValue("#1234567")).toBe(false);
    expect(isValidColorValue("#12")).toBe(false);
    expect(isValidColorValue("#123456789")).toBe(false);
  });

  it("rejects unbalanced or trailing garbage in color functions", () => {
    expect(isValidColorValue("rgb(1,2,3)extra")).toBe(false);
    expect(isValidColorValue("hsl(0, 0%, 0%) )")).toBe(false);
  });

  it("rejects completely invalid text that isn't a color", () => {
    expect(isValidColorValue("not-a-color")).toBe(false);
    expect(isValidColorValue("1234")).toBe(false);
  });
});
