import { describe, it, expect } from "vitest";
import { isValidProfileId, assertValidProfileId, generateProfileId } from "./profileIdValidation";

describe("profileIdValidation", () => {
  it("accepts valid profile ids", () => {
    expect(isValidProfileId("work")).toBe(true);
    expect(isValidProfileId("my-profile")).toBe(true);
    expect(isValidProfileId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejects ids containing storage separators", () => {
    expect(isValidProfileId("work_profile")).toBe(false);
    expect(isValidProfileId("work:profile")).toBe(false);
    expect(isValidProfileId("work/profile")).toBe(false);
  });

  it("rejects reserved and malformed ids", () => {
    expect(isValidProfileId("default")).toBe(false);
    expect(isValidProfileId("")).toBe(false);
    expect(isValidProfileId(123)).toBe(false);
    expect(isValidProfileId("-leading")).toBe(false);
    expect(isValidProfileId("trailing-")).toBe(false);
    expect(isValidProfileId("a--b")).toBe(false);
  });

  it("assertValidProfileId throws for invalid ids", () => {
    expect(() => assertValidProfileId("bad_id")).toThrow(/Invalid profile id/);
    expect(() => assertValidProfileId("default")).toThrow(/reserved/);
  });

  it("generateProfileId produces valid ids", () => {
    const id = generateProfileId();
    expect(isValidProfileId(id)).toBe(true);
  });
});
