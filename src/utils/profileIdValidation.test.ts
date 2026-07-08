import { describe, it, expect } from "vitest";
import {
  isValidProfileId,
  assertValidProfileId,
  generateProfileId,
  isValidProfileStorageId,
  isUserCreatableProfileId,
  assertValidProfileStorageId,
  assertUserCreatableProfileId,
} from "./profileIdValidation";

describe("profileIdValidation", () => {
  it("accepts valid user-creatable profile ids", () => {
    expect(isValidProfileId("work")).toBe(true);
    expect(isValidProfileId("my-profile")).toBe(true);
    expect(isValidProfileId("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejects ids containing storage separators", () => {
    expect(isValidProfileId("work_profile")).toBe(false);
    expect(isValidProfileId("work:profile")).toBe(false);
    expect(isValidProfileId("work/profile")).toBe(false);
  });

  it("rejects reserved and malformed ids from user-creatable check", () => {
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

  // Storage-level validator: "default" must be valid for system/storage use.
  describe("isValidProfileStorageId", () => {
    it("accepts the default system profile id", () => {
      expect(isValidProfileStorageId("default")).toBe(true);
    });

    it("accepts valid user profile ids", () => {
      expect(isValidProfileStorageId("work")).toBe(true);
      expect(isValidProfileStorageId("my-profile")).toBe(true);
    });

    it("rejects ids with storage separators", () => {
      expect(isValidProfileStorageId("work:profile")).toBe(false);
      expect(isValidProfileStorageId("work/profile")).toBe(false);
      expect(isValidProfileStorageId("work_profile")).toBe(false);
    });

    it("rejects empty and non-string ids", () => {
      expect(isValidProfileStorageId("")).toBe(false);
      expect(isValidProfileStorageId(null)).toBe(false);
    });
  });

  describe("isUserCreatableProfileId", () => {
    it("rejects the default system profile id", () => {
      expect(isUserCreatableProfileId("default")).toBe(false);
    });

    it("accepts valid non-reserved ids", () => {
      expect(isUserCreatableProfileId("work")).toBe(true);
    });
  });

  describe("assertValidProfileStorageId", () => {
    it("does not throw for default", () => {
      expect(() => assertValidProfileStorageId("default")).not.toThrow();
    });

    it("throws for storage separator ids", () => {
      expect(() => assertValidProfileStorageId("work:extra")).toThrow(/Invalid profile id/);
      expect(() => assertValidProfileStorageId("path/traversal")).toThrow(/Invalid profile id/);
    });
  });

  describe("assertUserCreatableProfileId", () => {
    it("throws for the default system profile", () => {
      expect(() => assertUserCreatableProfileId("default")).toThrow(/reserved/);
    });

    it("does not throw for valid user ids", () => {
      expect(() => assertUserCreatableProfileId("work")).not.toThrow();
    });
  });
});
