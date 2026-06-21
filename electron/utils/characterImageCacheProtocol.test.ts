// @vitest-environment node

import path from "node:path";
import { describe, expect, it } from "vitest";
import { isAllowedCharacterImageCacheProtocolAccess } from "./characterImageCacheProtocol";

const rendererRoot = path.resolve(__dirname, "../../dist");
const rendererIndex = path.join(rendererRoot, "index.html");

describe("character image cache protocol access", () => {
  it("allows the Vite renderer origin in development", () => {
    expect(
      isAllowedCharacterImageCacheProtocolAccess({
        isDev: true,
        origin: "http://localhost:5173",
        referrer: "http://localhost:5173/",
        rendererRoot,
      }),
    ).toBe(true);
  });

  it("allows the packaged file renderer by referrer", () => {
    expect(
      isAllowedCharacterImageCacheProtocolAccess({
        isDev: false,
        origin: "null",
        referrer: `file://${rendererIndex}`,
        rendererRoot,
      }),
    ).toBe(true);
  });

  it("rejects explicit foreign origins", () => {
    expect(
      isAllowedCharacterImageCacheProtocolAccess({
        isDev: true,
        origin: "https://evil.example",
        referrer: "https://evil.example/app",
        rendererRoot,
      }),
    ).toBe(false);
  });

  it("rejects foreign referrers when no origin header is present", () => {
    expect(
      isAllowedCharacterImageCacheProtocolAccess({
        isDev: false,
        origin: null,
        referrer: "https://evil.example/app",
        rendererRoot,
      }),
    ).toBe(false);
  });

  it("allows originless requests only when no referrer is available", () => {
    expect(
      isAllowedCharacterImageCacheProtocolAccess({
        isDev: false,
        origin: null,
        referrer: "",
        rendererRoot,
      }),
    ).toBe(true);
  });
});
