import { describe, expect, it } from "vitest";
import { assertValidId, isValidId } from "./idValidation";

describe("idValidation", () => {
  it.each([
    "",
    "__proto__",
    "constructor",
    "prototype",
    "a".repeat(129),
    "invalid/slash",
    "invalid space",
  ])("rejects unsafe id %j", (id) => {
    expect(isValidId(id)).toBe(false);
    expect(() => assertValidId(id, "test")).toThrow(/Invalid id/);
  });

  it.each([
    "550e8400-e29b-41d4-a716-446655440000",
    "valid-slug",
    "valid_slug",
    "valid.slug",
  ])("accepts safe id %j", (id) => {
    expect(isValidId(id)).toBe(true);
    expect(() => assertValidId(id, "test")).not.toThrow();
  });
});
