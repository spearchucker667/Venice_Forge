/** @fileoverview Tests for character image URL resolution + allowlist. */

import { describe, expect, it } from "vitest";
import {
  VENICE_CHARACTER_IMAGE_HOSTS,
  avatarFallback,
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

  it("returns null when no recognized field has a valid URL", () => {
    expect(resolveCharacterImageUrl({ slug: "abc", name: "ABC" })).toBeNull();
    expect(
      resolveCharacterImageUrl({ photoUrl: "", avatar_url: null, image: { url: "" } }),
    ).toBeNull();
  });

  it("ignores nested object arrays", () => {
    expect(
      resolveCharacterImageUrl({ image: [{ url: officialPhoto }] }),
    ).toBeNull();
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
