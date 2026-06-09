/** @fileoverview Tests for character image URL resolution + allowlist. */

import { describe, expect, it } from "vitest";
import {
  VENICE_CHARACTER_IMAGE_HOSTS,
  avatarFallback,
  buildSyntheticCharacterPhotoUrl,
  isSafeCharacterId,
  isTrustedVeniceImageUrl,
  resolveCharacterImageUrl,
} from "./characterImageResolver";

describe("VENICE_CHARACTER_IMAGE_HOSTS", () => {
  it("includes the three documented official Venice image hosts", () => {
    expect(VENICE_CHARACTER_IMAGE_HOSTS.has("outerface.venice.ai")).toBe(true);
    expect(VENICE_CHARACTER_IMAGE_HOSTS.has("venice.ai")).toBe(true);
    expect(VENICE_CHARACTER_IMAGE_HOSTS.has("api.venice.ai")).toBe(true);
  });

  it("does not include arbitrary external hosts", () => {
    expect(VENICE_CHARACTER_IMAGE_HOSTS.has("evil.example")).toBe(false);
    expect(VENICE_CHARACTER_IMAGE_HOSTS.has("example.com")).toBe(false);
    expect(VENICE_CHARACTER_IMAGE_HOSTS.has("localhost")).toBe(false);
  });
});

describe("isTrustedVeniceImageUrl", () => {
  it("accepts official HTTPS Venice character photo URLs", () => {
    expect(
      isTrustedVeniceImageUrl("https://outerface.venice.ai/character/abc.png"),
    ).toBe(true);
    expect(
      isTrustedVeniceImageUrl("https://venice.ai/static/avatar.webp"),
    ).toBe(true);
    expect(
      isTrustedVeniceImageUrl("https://api.venice.ai/api/v3/characters/x/y.png"),
    ).toBe(true);
  });

  it("rejects plain http", () => {
    expect(isTrustedVeniceImageUrl("http://outerface.venice.ai/x.png")).toBe(false);
  });

  it("rejects data: / blob: / file: / javascript:", () => {
    expect(isTrustedVeniceImageUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isTrustedVeniceImageUrl("blob:https://venice.ai/abc")).toBe(false);
    expect(isTrustedVeniceImageUrl("file:///etc/passwd")).toBe(false);
    expect(isTrustedVeniceImageUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects arbitrary external https hosts", () => {
    expect(isTrustedVeniceImageUrl("https://evil.example/x.png")).toBe(false);
    expect(isTrustedVeniceImageUrl("https://google.com/avatar.png")).toBe(false);
  });

  it("rejects localhost and private IPs", () => {
    expect(isTrustedVeniceImageUrl("https://localhost/x.png")).toBe(false);
    expect(isTrustedVeniceImageUrl("https://127.0.0.1/x.png")).toBe(false);
    expect(isTrustedVeniceImageUrl("https://0.0.0.0/x.png")).toBe(false);
    expect(isTrustedVeniceImageUrl("https://10.0.0.5/x.png")).toBe(false);
    expect(isTrustedVeniceImageUrl("https://192.168.1.1/x.png")).toBe(false);
    expect(isTrustedVeniceImageUrl("https://172.16.0.1/x.png")).toBe(false);
    expect(isTrustedVeniceImageUrl("https://169.254.169.254/x.png")).toBe(false);
  });

  it("rejects IPv6 loopback and link-local", () => {
    expect(isTrustedVeniceImageUrl("https://[::1]/x.png")).toBe(false);
    expect(isTrustedVeniceImageUrl("https://[fe80::1]/x.png")).toBe(false);
  });

  it("rejects empty and non-string values", () => {
    expect(isTrustedVeniceImageUrl("")).toBe(false);
    expect(isTrustedVeniceImageUrl("   ")).toBe(false);
  });
});

describe("resolveCharacterImageUrl", () => {
  const officialPhoto = "https://outerface.venice.ai/character/abc.png";

  it("resolves photoUrl from official Venice HTTPS URL", () => {
    expect(resolveCharacterImageUrl({ photoUrl: officialPhoto })).toBe(officialPhoto);
  });

  it("resolves snake_case photo_url from official Venice HTTPS URL", () => {
    expect(resolveCharacterImageUrl({ photo_url: officialPhoto })).toBe(officialPhoto);
  });

  it("resolves avatarUrl from official Venice HTTPS URL", () => {
    expect(resolveCharacterImageUrl({ avatarUrl: officialPhoto })).toBe(officialPhoto);
  });

  it("resolves snake_case avatar_url from official Venice HTTPS URL", () => {
    expect(resolveCharacterImageUrl({ avatar_url: officialPhoto })).toBe(officialPhoto);
  });

  it("resolves imageUrl and image_url from official Venice HTTPS URL", () => {
    expect(resolveCharacterImageUrl({ imageUrl: officialPhoto })).toBe(officialPhoto);
    expect(resolveCharacterImageUrl({ image_url: officialPhoto })).toBe(officialPhoto);
  });

  it("resolves profileImageUrl and profile_image_url from official Venice HTTPS URL", () => {
    expect(resolveCharacterImageUrl({ profileImageUrl: officialPhoto })).toBe(officialPhoto);
    expect(resolveCharacterImageUrl({ profile_image_url: officialPhoto })).toBe(officialPhoto);
  });

  it("resolves nested image.url / avatar.url / profileImage.url objects", () => {
    expect(
      resolveCharacterImageUrl({ image: { url: officialPhoto } }),
    ).toBe(officialPhoto);
    expect(
      resolveCharacterImageUrl({ avatar: { url: officialPhoto } }),
    ).toBe(officialPhoto);
    expect(
      resolveCharacterImageUrl({ profileImage: { url: officialPhoto } }),
    ).toBe(officialPhoto);
  });

  it("resolves a relative Venice API path safely", () => {
    const result = resolveCharacterImageUrl({ image_url: "/static/avatar.png" });
    expect(result).toBe("https://api.venice.ai/static/avatar.png");
  });

  it("rejects http://outerface.venice.ai", () => {
    expect(
      resolveCharacterImageUrl({
        photoUrl: "http://outerface.venice.ai/x.png",
      }),
    ).toBeNull();
  });

  it("rejects arbitrary external https hosts", () => {
    expect(
      resolveCharacterImageUrl({
        photoUrl: "https://evil.example/x.png",
      }),
    ).toBeNull();
  });

  it("rejects data: URIs", () => {
    expect(
      resolveCharacterImageUrl({
        photoUrl: "data:image/png;base64,AAAA",
      }),
    ).toBeNull();
  });

  it("rejects file:// URIs", () => {
    expect(
      resolveCharacterImageUrl({
        photoUrl: "file:///etc/passwd",
      }),
    ).toBeNull();
  });

  it("rejects localhost and private-IP URLs even on the right protocol", () => {
    expect(
      resolveCharacterImageUrl({ photoUrl: "https://localhost/x.png" }),
    ).toBeNull();
    expect(
      resolveCharacterImageUrl({ photoUrl: "https://10.0.0.1/x.png" }),
    ).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(resolveCharacterImageUrl(null)).toBeNull();
    expect(resolveCharacterImageUrl(undefined)).toBeNull();
    expect(resolveCharacterImageUrl("string")).toBeNull();
    expect(resolveCharacterImageUrl(42)).toBeNull();
  });

  it("returns null when no recognized field has a valid URL AND no safe id", () => {
    // Path-traversal ids must be rejected — they cannot be used to build
    // a synthetic URL and they are not safe to substitute into a path segment.
    expect(
      resolveCharacterImageUrl({ slug: "../etc/passwd", name: "ABC" }),
    ).toBeNull();
    expect(
      resolveCharacterImageUrl({ id: "x/../y", name: "ABC" }),
    ).toBeNull();
    expect(
      resolveCharacterImageUrl({ photoUrl: "", avatar_url: null, image: { url: "" } }),
    ).toBeNull();
  });

  it("ignores nested object arrays", () => {
    expect(
      resolveCharacterImageUrl({ image: [{ url: officialPhoto }] }),
    ).toBeNull();
  });

  // REGRESSION GUARD (synthetic photo URL fallback): when the Venice
  // response omits every recognized image field, the resolver must
  // construct the canonical `https://outerface.venice.ai/api/characters/{id}/photo`
  // URL using a safe id (UUID or slug). The resulting host is already in
  // the VENICE_CHARACTER_IMAGE_HOSTS allowlist, so SSRF controls stay
  // strict.
  it("synthesises the canonical photo URL from a safe id when no image field is present", () => {
    expect(
      resolveCharacterImageUrl({
        id: "2f460055-7595-4640-9cb6-c442c4c869b0",
        slug: "alan-watts",
        name: "Alan Watts",
      }),
    ).toBe("https://outerface.venice.ai/api/characters/2f460055-7595-4640-9cb6-c442c4c869b0/photo");
  });

  it("synthesises the canonical photo URL from a safe slug when no id is present", () => {
    expect(
      resolveCharacterImageUrl({ slug: "alan-watts", name: "Alan Watts" }),
    ).toBe("https://outerface.venice.ai/api/characters/alan-watts/photo");
  });

  it("synthesised URL is trusted by the allowlist helper", () => {
    const url = resolveCharacterImageUrl({ id: "abc123", slug: "abc-123" });
    expect(url).not.toBeNull();
    expect(isTrustedVeniceImageUrl(url!)).toBe(true);
  });
});

describe("isSafeCharacterId", () => {
  it("accepts UUID-style and slug-style ids", () => {
    expect(isSafeCharacterId("abc123")).toBe(true);
    expect(isSafeCharacterId("2f460055-7595-4640-9cb6-c442c4c869b0")).toBe(true);
    expect(isSafeCharacterId("alan-watts")).toBe(true);
    expect(isSafeCharacterId("a")).toBe(true);
  });

  it("rejects path-traversal, empty, oversized, and non-string ids", () => {
    expect(isSafeCharacterId("")).toBe(false);
    expect(isSafeCharacterId("../etc/passwd")).toBe(false);
    expect(isSafeCharacterId("x/../y")).toBe(false);
    expect(isSafeCharacterId("a/b")).toBe(false);
    expect(isSafeCharacterId("x".repeat(129))).toBe(false);
    expect(isSafeCharacterId(null)).toBe(false);
    expect(isSafeCharacterId(undefined)).toBe(false);
    expect(isSafeCharacterId(42)).toBe(false);
  });
});

describe("buildSyntheticCharacterPhotoUrl", () => {
  it("builds the canonical photo URL for a safe id", () => {
    expect(buildSyntheticCharacterPhotoUrl("abc123")).toBe(
      "https://outerface.venice.ai/api/characters/abc123/photo",
    );
  });

  it("encodes hyphens safely without over-encoding (URL-safe characters pass through)", () => {
    expect(buildSyntheticCharacterPhotoUrl("2f460055-7595-4640-9cb6-c442c4c869b0")).toBe(
      "https://outerface.venice.ai/api/characters/2f460055-7595-4640-9cb6-c442c4c869b0/photo",
    );
  });

  it("refuses unsafe ids and returns null", () => {
    expect(buildSyntheticCharacterPhotoUrl("../etc/passwd")).toBeNull();
    expect(buildSyntheticCharacterPhotoUrl("a/b")).toBeNull();
    expect(buildSyntheticCharacterPhotoUrl("")).toBeNull();
    expect(buildSyntheticCharacterPhotoUrl("x".repeat(129))).toBeNull();
  });
});

describe("avatarFallback", () => {
  it("returns initials from a name", () => {
    expect(avatarFallback("Ada Lovelace")).toBe("AD");
  });

  it("returns ? for empty name", () => {
    expect(avatarFallback("")).toBe("?");
    expect(avatarFallback("   ")).toBe("?");
  });

  it("uppercases lowercase initials", () => {
    expect(avatarFallback("zelda")).toBe("ZE");
  });
});
