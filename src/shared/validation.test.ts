// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  ALLOWED_VENICE_ENDPOINTS,
  ALLOWED_VENICE_METHODS,
  isAllowedVeniceRequest,
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
});
