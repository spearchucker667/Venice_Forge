/** @fileoverview Unit tests for the Venice hosted-character service. */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildListQueryString,
  getCharacter,
  getCharacterReviews,
  isValidCharacterSlug,
  listCharacters,
  normalizeCharacter,
  normalizeCharacterReviews,
  resolveCharacterShareUrl,
} from "./characterService";
import { venice, VeniceAPIError } from "../lib/venice-client";
import { isAllowedCharactersRequest } from "../shared/validation";

vi.mock("../lib/venice-client", () => ({
  venice: vi.fn(),
  VeniceAPIError: class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = "VeniceAPIError";
      this.status = status;
    }
  },
}));

const mockedVenice = vi.mocked(venice);

describe("characterService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("isValidCharacterSlug", () => {
    it("accepts well-formed slugs", () => {
      expect(isValidCharacterSlug("alan-watts")).toBe(true);
      expect(isValidCharacterSlug("Dolores_42")).toBe(true);
      expect(isValidCharacterSlug("a")).toBe(true);
      expect(isValidCharacterSlug("x".repeat(128))).toBe(true);
    });

    it("rejects empty / oversized / path-traversal slugs", () => {
      expect(isValidCharacterSlug("")).toBe(false);
      expect(isValidCharacterSlug("a/b")).toBe(false);
      expect(isValidCharacterSlug("a.b")).toBe(false);
      expect(isValidCharacterSlug("a%2Fb")).toBe(false);
      expect(isValidCharacterSlug("has space")).toBe(false);
      expect(isValidCharacterSlug(null)).toBe(false);
      expect(isValidCharacterSlug(undefined)).toBe(false);
      expect(isValidCharacterSlug(123)).toBe(false);
      expect(isValidCharacterSlug("x".repeat(129))).toBe(false);
    });
  });

  describe("normalizeCharacter", () => {
    it("fills defaults for missing optional fields", () => {
      const char = normalizeCharacter({ id: "id-1", slug: "alan-watts", name: "Alan Watts" });
      expect(char).toMatchObject({
        id: "id-1",
        slug: "alan-watts",
        name: "Alan Watts",
        adult: false,
        featured: false,
        webEnabled: false,
        tags: undefined,
        stats: undefined,
      });
    });

    it("rejects records with a missing or invalid slug", () => {
      expect(normalizeCharacter({ id: "x", name: "No Slug" })).toBeNull();
      expect(normalizeCharacter({ id: "x", slug: "has/slash", name: "Bad" })).toBeNull();
      expect(normalizeCharacter({ id: "x", slug: "", name: "Empty" })).toBeNull();
      expect(normalizeCharacter(null)).toBeNull();
      expect(normalizeCharacter("not-an-object")).toBeNull();
    });

    it("derives id from slug or name when missing", () => {
      expect(normalizeCharacter({ slug: "alan-watts", name: "Alan" })?.id).toBe("alan-watts");
      expect(normalizeCharacter({ slug: "alan-watts" })?.id).toBe("alan-watts");
    });

    it("drops malformed optional fields without throwing", () => {
      const char = normalizeCharacter({
        id: "id-1",
        slug: "alan-watts",
        name: "Alan Watts",
        adult: true,
        featured: "yes",
        tags: ["ok", 42, null, "fine"],
        stats: {
          averageRating: "not-a-number",
          ratingCount: 7,
          imports: undefined,
        },
        photoUrl: undefined,
      });
      expect(char?.adult).toBe(true);
      expect(char?.featured).toBe(false);
      expect(char?.tags).toEqual(["ok", "fine"]);
      expect(char?.stats).toEqual({ ratingCount: 7 });
      // REGRESSION GUARD (synthetic photo URL fallback): when the API
      // response omits every recognized image field, the resolver
      // constructs the canonical `https://outerface.venice.ai/api/characters/{id}/photo`
      // URL from a safe id. The `id` and `slug` are both valid safe ids
      // here, so the resolver prefers the `id`.
      expect(char?.photoUrl).toBe(
        "https://outerface.venice.ai/api/characters/id-1/photo",
      );
    });

    it("normalizes unsafe shareUrl values to undefined", () => {
      const base = { id: "id-1", slug: "alan-watts", name: "Alan Watts" };
      expect(normalizeCharacter({ ...base, shareUrl: "javascript:alert(1)" })?.shareUrl).toBeUndefined();
      expect(normalizeCharacter({ ...base, shareUrl: "data:text/html;base64,PHNjcmlwdA==" })?.shareUrl).toBeUndefined();
      expect(normalizeCharacter({ ...base, shareUrl: "file:///etc/passwd" })?.shareUrl).toBeUndefined();
      expect(normalizeCharacter({ ...base, shareUrl: "http://venice.ai/characters/alan-watts" })?.shareUrl).toBeUndefined();
      expect(normalizeCharacter({ ...base, shareUrl: "https://evil.example/characters/alan-watts" })?.shareUrl).toBeUndefined();
      expect(normalizeCharacter({ ...base, shareUrl: "https://venice.ai/settings" })?.shareUrl).toBeUndefined();
    });

    it("preserves HTTPS Venice character share links", () => {
      expect(resolveCharacterShareUrl(" https://venice.ai/characters/alan-watts#frag ")).toBe(
        "https://venice.ai/characters/alan-watts",
      );
      expect(resolveCharacterShareUrl("https://venice.ai/c/alan-watts#frag")).toBe(
        "https://venice.ai/c/alan-watts",
      );
      expect(normalizeCharacter({
        id: "id-1",
        slug: "alan-watts",
        name: "Alan Watts",
        shareUrl: "https://www.venice.ai/characters/alan-watts?ref=app",
      })?.shareUrl).toBe("https://www.venice.ai/characters/alan-watts?ref=app");
    });
  });

  describe("buildListQueryString", () => {
    it("returns an empty string when no params are supplied", () => {
      expect(buildListQueryString({})).toBe("");
    });

    it("omits empty / whitespace params", () => {
      expect(buildListQueryString({ search: "  " })).toBe("");
      expect(buildListQueryString({ search: "", modelId: "" })).toBe("");
    });

    it("trims the search and truncates to 200 characters", () => {
      const long = "x".repeat(500);
      const query = buildListQueryString({ search: `  ${long}  ` });
      const params = new URLSearchParams(query);
      expect(params.get("search")?.length).toBe(200);
    });

    it("clamps limit to [1, 100] and offset to >= 0", () => {
      const a = new URLSearchParams(buildListQueryString({ limit: 0, offset: -5 }));
      expect(a.get("limit")).toBe("1");
      expect(a.get("offset")).toBe("0");
      const b = new URLSearchParams(buildListQueryString({ limit: 9999, offset: 250 }));
      expect(b.get("limit")).toBe("100");
      expect(b.get("offset")).toBe("250");
    });

    it("ignores unknown sortBy values", () => {
      const params = new URLSearchParams(buildListQueryString({ sortBy: "garbage" as never }));
      expect(params.has("sortBy")).toBe(false);
    });

    it("encodes tags and categories as comma-separated", () => {
      const params = new URLSearchParams(buildListQueryString({ tags: ["a", "b"], categories: ["x"] }));
      expect(params.get("tags")).toBe("a,b");
      expect(params.get("categories")).toBe("x");
    });

    it("emits isAdult / isPro / isWebEnabled as strings when set", () => {
      const params = new URLSearchParams(
        buildListQueryString({ isAdult: true, isPro: false, isWebEnabled: true }),
      );
      expect(params.get("isAdult")).toBe("true");
      expect(params.get("isPro")).toBe("false");
      expect(params.get("isWebEnabled")).toBe("true");
    });
  });

  describe("listCharacters", () => {
    it("issues GET /characters with a built query string", async () => {
      mockedVenice.mockResolvedValueOnce({
        data: [
          { id: "1", slug: "alan-watts", name: "Alan Watts", tags: ["philosophy"] },
        ],
      });
      const list = await listCharacters({ search: "watts", limit: 5 });
      expect(list).toHaveLength(1);
      expect(list[0].slug).toBe("alan-watts");
      expect(mockedVenice).toHaveBeenCalledWith(
        "/characters?search=watts&limit=5",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("accepts a bare-array response shape", async () => {
      mockedVenice.mockResolvedValueOnce([
        { id: "1", slug: "alan-watts", name: "Alan Watts" },
      ]);
      const list = await listCharacters({});
      expect(list).toHaveLength(1);
    });

    it("drops malformed entries silently", async () => {
      mockedVenice.mockResolvedValueOnce({
        data: [
          { id: "1", slug: "alan-watts", name: "Alan Watts" },
          { id: "2", slug: "has/slash" },
          null,
          "not-an-object",
        ],
      });
      const list = await listCharacters({});
      expect(list).toHaveLength(1);
      expect(list[0].slug).toBe("alan-watts");
    });

    it("forwards the AbortSignal to the venice client", async () => {
      mockedVenice.mockResolvedValueOnce({ data: [] });
      const controller = new AbortController();
      await listCharacters({ search: "x" }, controller.signal);
      const [, opts] = mockedVenice.mock.calls[0];
      expect(opts?.signal).toBe(controller.signal);
    });
  });

  describe("getCharacter", () => {
    it("rejects an invalid slug before hitting the network", async () => {
      await expect(getCharacter("has/slash")).rejects.toThrow(/invalid/i);
      expect(mockedVenice).not.toHaveBeenCalled();
    });

    it("normalizes a bare-character response", async () => {
      mockedVenice.mockResolvedValueOnce({
        id: "1",
        slug: "alan-watts",
        name: "Alan Watts",
        adult: true,
        stats: { averageRating: 4.6 },
      });
      const char = await getCharacter("alan-watts");
      expect(char.adult).toBe(true);
      expect(char.stats?.averageRating).toBe(4.6);
    });

    it("normalizes a {data: ...} envelope response", async () => {
      mockedVenice.mockResolvedValueOnce({
        data: { id: "1", slug: "alan-watts", name: "Alan Watts" },
      });
      const char = await getCharacter("alan-watts");
      expect(char.slug).toBe("alan-watts");
    });

    it("throws a VeniceAPIError on malformed records", async () => {
      mockedVenice.mockResolvedValueOnce({ data: { name: "No slug" } });
      await expect(getCharacter("alan-watts")).rejects.toBeInstanceOf(VeniceAPIError);
    });
  });

  describe("getCharacterReviews", () => {
    it("rejects an invalid slug before hitting the network", async () => {
      await expect(getCharacterReviews("has/slash")).rejects.toThrow(/invalid/i);
      expect(mockedVenice).not.toHaveBeenCalled();
    });

    it("issues GET /characters/{slug}/reviews — the single allowlisted nested route", async () => {
      mockedVenice.mockResolvedValueOnce({
        data: [],
        object: "list",
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
        summary: { averageRating: 0, totalReviews: 0 },
      });
      await getCharacterReviews("alan-watts");
      const [endpoint, opts] = mockedVenice.mock.calls[0];
      expect(endpoint).toBe("/characters/alan-watts/reviews?page=1&pageSize=20");
      expect(opts).toMatchObject({ method: "GET" });
      // The exact path requested must pass the shared validation gate that
      // both the Electron IPC layer and the Express proxy enforce.
      expect(isAllowedCharactersRequest(endpoint as string, "GET")).toBe(false);
      expect(
        isAllowedCharactersRequest(
          (endpoint as string).split("?")[0],
          "GET",
        ),
      ).toBe(true);
    });

    it("normalizes the documented envelope shape", async () => {
      mockedVenice.mockResolvedValueOnce({
        data: [
          {
            characterId: "char-1",
            createdAt: "2025-02-09T03:23:53.708Z",
            id: "rev-1",
            isOwner: false,
            locale: "en",
            message: "Thoughtful and grounded.",
            rating: 5,
            userAvatarUrl: null,
            username: "product_user_42",
          },
        ],
        object: "list",
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        summary: { averageRating: 5, totalReviews: 1 },
      });
      const result = await getCharacterReviews("alan-watts", { page: 1, pageSize: 20 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({
        id: "rev-1",
        username: "product_user_42",
        rating: 5,
        message: "Thoughtful and grounded.",
      });
      expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
      expect(result.summary).toEqual({ averageRating: 5, totalReviews: 1 });
    });

    it("accepts a bare-array response shape", async () => {
      mockedVenice.mockResolvedValueOnce([
        {
          characterId: "char-1",
          createdAt: "2025-02-09T03:23:53.708Z",
          id: "rev-1",
          isOwner: true,
          locale: null,
          message: null,
          rating: 4,
          userAvatarUrl: null,
          username: "anon",
        },
      ]);
      const result = await getCharacterReviews("alan-watts");
      expect(result.data).toHaveLength(1);
      expect(result.data[0].message).toBeNull();
      expect(result.data[0].isOwner).toBe(true);
    });

    it("drops malformed review entries without throwing", async () => {
      mockedVenice.mockResolvedValueOnce({
        data: [
          {
            characterId: "char-1",
            createdAt: "2025-02-09T03:23:53.708Z",
            id: "rev-1",
            isOwner: false,
            locale: null,
            message: null,
            rating: 3,
            userAvatarUrl: null,
            username: "ok",
          },
          { id: "missing-fields" },
          null,
          "not-an-object",
        ],
        object: "list",
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
        summary: { averageRating: 3, totalReviews: 1 },
      });
      const result = await getCharacterReviews("alan-watts");
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe("rev-1");
    });

    it("clamps page and pageSize to the documented ranges", async () => {
      mockedVenice.mockResolvedValueOnce({
        data: [],
        object: "list",
        pagination: { page: 1, pageSize: 100, total: 0, totalPages: 1 },
        summary: { averageRating: 0, totalReviews: 0 },
      });
      await getCharacterReviews("alan-watts", { page: 0, pageSize: 9999 });
      const [endpoint] = mockedVenice.mock.calls[0];
      const params = new URLSearchParams((endpoint as string).split("?")[1]);
      expect(params.get("page")).toBe("1");
      expect(params.get("pageSize")).toBe("100");
    });

    it("URL-encodes the slug segment", async () => {
      mockedVenice.mockResolvedValueOnce({
        data: [],
        object: "list",
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
        summary: { averageRating: 0, totalReviews: 0 },
      });
      await getCharacterReviews("Dolores_42");
      expect(mockedVenice.mock.calls[0][0]).toMatch(/^\/characters\/Dolores_42\/reviews\?/);
    });

    it("forwards the AbortSignal to the venice client", async () => {
      mockedVenice.mockResolvedValueOnce({
        data: [],
        object: "list",
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 1 },
        summary: { averageRating: 0, totalReviews: 0 },
      });
      const controller = new AbortController();
      await getCharacterReviews("alan-watts", {}, controller.signal);
      const [, opts] = mockedVenice.mock.calls[0];
      expect(opts?.signal).toBe(controller.signal);
    });
  });

  describe("normalizeCharacterReviews", () => {
    it("fills safe defaults for missing pagination and summary", () => {
      const result = normalizeCharacterReviews({});
      expect(result.data).toEqual([]);
      expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
      expect(result.summary).toEqual({ averageRating: 0, totalReviews: 0 });
    });

    it("clamps out-of-range ratings to 1–5", () => {
      const result = normalizeCharacterReviews({
        data: [
          {
            characterId: "c",
            createdAt: "2025-02-09T03:23:53.708Z",
            id: "high",
            isOwner: false,
            locale: null,
            message: null,
            rating: 9,
            userAvatarUrl: null,
            username: "u",
          },
        ],
      });
      expect(result.data[0].rating).toBe(5);
    });
  });
});
