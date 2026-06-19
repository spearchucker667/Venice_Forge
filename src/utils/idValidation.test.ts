import { describe, it, expect } from "vitest";
import { isValidId, assertValidId } from "./idValidation";

describe("idValidation", () => {
  it("rejects Windows reserved filenames", () => {
    expect(isValidId("con")).toBe(false);
    expect(isValidId("prn")).toBe(false);
    expect(isValidId("aux")).toBe(false);
    expect(isValidId("nul")).toBe(false);
    expect(isValidId("com1")).toBe(false);
    expect(isValidId("lpt9")).toBe(false);
    expect(isValidId("CON.txt")).toBe(false);
    expect(isValidId("aux.jpg")).toBe(false);
  });

  it("accepts valid IDs", () => {
    expect(isValidId("my_valid-id.123")).toBe(true);
    expect(isValidId("a")).toBe(true);
    expect(isValidId("control")).toBe(true);
  });

  it("rejects prototype pollution vectors", () => {
    expect(isValidId("__proto__")).toBe(false);
    expect(isValidId("constructor")).toBe(false);
    expect(isValidId("prototype")).toBe(false);
  });

  it("assertValidId throws for invalid IDs", () => {
    expect(() => assertValidId("con")).toThrowError(/Windows reserved/);
  });
});
