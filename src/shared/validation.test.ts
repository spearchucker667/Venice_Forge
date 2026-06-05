// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  ALLOWED_VENICE_ENDPOINTS,
  ALLOWED_VENICE_METHODS,
  CHARACTER_SLUG_MAX_LENGTH,
  CHARACTERS_ENDPOINT,
  extractCharacterSlug,
  isAllowedCharactersRequest,
  isAllowedVeniceRequest,
  VENICE_CHARACTER_SLUG_PATTERN,
  VENICE_ENDPOINT_METHODS,
} from "./validation";

describe("validation", () => {
  describe("ALLOWED_VENICE_ENDPOINTS", () => {
    it("contains exactly the expected endpoints", () => {
      expect(ALLOWED_VENICE_ENDPOINTS).toEqual([
        "/models",
        "/chat/completions",
        "/image/generate",
        "/image/upscale",
        "/augment/search",
        "/augment/scrape",
        "/augment/text-parser",
        "/video/queue",
        "/video/retrieve",
        "/video/quote",
        "/video/complete",
        "/image/edit",
        "/image/multi-edit",
        "/embeddings",
        "/audio/queue",
        "/audio/retrieve",
        "/audio/speech",
        "/audio/transcriptions",
      ]);
    });
  });

  describe("ALLOWED_VENICE_METHODS", () => {
    it("contains only GET and POST", () => {
      expect(ALLOWED_VENICE_METHODS).toEqual(["GET", "POST"]);
    });
  });

  describe("VENICE_ENDPOINT_METHODS", () => {
    it("allows GET only for /models", () => {
      expect(VENICE_ENDPOINT_METHODS["/models"]).toEqual(["GET"]);
    });

    it("allows POST for all non-model endpoints", () => {
      const postEndpoints = Object.entries(VENICE_ENDPOINT_METHODS).filter(
        ([ep, methods]) => ep !== "/models" && methods.includes("POST")
      );
      expect(postEndpoints.length).toBe(ALLOWED_VENICE_ENDPOINTS.length - 1);
    });
  });

  describe("isAllowedVeniceRequest", () => {
    it("returns true for allowed endpoint/method pairs", () => {
      expect(isAllowedVeniceRequest("/models", "GET")).toBe(true);
      expect(isAllowedVeniceRequest("/chat/completions", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/image/generate", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/video/queue", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/video/retrieve", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/image/edit", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/image/multi-edit", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/embeddings", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/audio/queue", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/audio/retrieve", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/audio/speech", "POST")).toBe(true);
      expect(isAllowedVeniceRequest("/audio/transcriptions", "POST")).toBe(true);
    });

    it("returns false for wrong method", () => {
      expect(isAllowedVeniceRequest("/models", "POST")).toBe(false);
      expect(isAllowedVeniceRequest("/chat/completions", "GET")).toBe(false);
    });

    it("returns false for unknown endpoints", () => {
      expect(isAllowedVeniceRequest("/admin", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/api/v1/models", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("", "GET")).toBe(false);
    });

    it("returns false for case-mismatched methods", () => {
      expect(isAllowedVeniceRequest("/models", "get")).toBe(false);
      expect(isAllowedVeniceRequest("/models", "Get")).toBe(false);
    });
  });

  describe("character endpoint allowlist", () => {
    it("accepts GET /characters", () => {
      expect(isAllowedVeniceRequest("/characters", "GET")).toBe(true);
    });

    it("accepts GET /characters/{slug} for valid slugs", () => {
      expect(isAllowedVeniceRequest("/characters/alan-watts", "GET")).toBe(true);
      expect(isAllowedVeniceRequest("/characters/dolores-dei", "GET")).toBe(true);
      expect(isAllowedVeniceRequest("/characters/Some_Char-9", "GET")).toBe(true);
    });

    it("rejects POST /characters", () => {
      expect(isAllowedCharactersRequest("/characters", "POST")).toBe(false);
      expect(isAllowedVeniceRequest("/characters", "POST")).toBe(false);
    });

    it("rejects nested character paths", () => {
      expect(isAllowedVeniceRequest("/characters/foo/bar", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/characters/foo/bar/baz", "GET")).toBe(false);
    });

    it("rejects URL-encoded slashes and traversal in the slug", () => {
      expect(isAllowedVeniceRequest("/characters/%2Fmodels", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/characters/..%2F..", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/characters/..", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/characters/.", "GET")).toBe(false);
    });

    it("rejects oversized or empty slugs", () => {
      expect(isAllowedVeniceRequest("/characters/", "GET")).toBe(false);
      expect(isAllowedVeniceRequest(`/characters/${"a".repeat(CHARACTER_SLUG_MAX_LENGTH + 1)}`, "GET")).toBe(false);
    });

    it("rejects slugs that contain disallowed characters", () => {
      expect(isAllowedVeniceRequest("/characters/has space", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/characters/has.dot", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/characters/has%2Fslash", "GET")).toBe(false);
    });

    it("rejects unknown endpoints", () => {
      expect(isAllowedVeniceRequest("/character", "GET")).toBe(false);
      expect(isAllowedVeniceRequest("/characters-extra", "GET")).toBe(false);
    });

    it("extractCharacterSlug returns the slug for valid paths", () => {
      expect(extractCharacterSlug("/characters/alan-watts")).toBe("alan-watts");
      expect(extractCharacterSlug("/characters/Dolores_42")).toBe("Dolores_42");
    });

    it("extractCharacterSlug returns null for invalid paths", () => {
      expect(extractCharacterSlug("/characters")).toBeNull();
      expect(extractCharacterSlug("/characters/foo/bar")).toBeNull();
      expect(extractCharacterSlug("/characters/has.dot")).toBeNull();
      expect(extractCharacterSlug("/characters/%2Fmodels")).toBeNull();
    });

    it("slug pattern rejects empty / oversized / control / encoded inputs", () => {
      expect(VENICE_CHARACTER_SLUG_PATTERN.test("a")).toBe(true);
      expect(VENICE_CHARACTER_SLUG_PATTERN.test("A_b-9")).toBe(true);
      expect(VENICE_CHARACTER_SLUG_PATTERN.test("a".repeat(CHARACTER_SLUG_MAX_LENGTH))).toBe(true);
      expect(VENICE_CHARACTER_SLUG_PATTERN.test("a".repeat(CHARACTER_SLUG_MAX_LENGTH + 1))).toBe(false);
      expect(VENICE_CHARACTER_SLUG_PATTERN.test("")).toBe(false);
      expect(VENICE_CHARACTER_SLUG_PATTERN.test("a/b")).toBe(false);
      expect(VENICE_CHARACTER_SLUG_PATTERN.test("a.b")).toBe(false);
      expect(VENICE_CHARACTER_SLUG_PATTERN.test("a%2Fb")).toBe(false);
    });

    it("constant matches the documented list endpoint", () => {
      expect(CHARACTERS_ENDPOINT).toBe("/characters");
    });
  });
});
