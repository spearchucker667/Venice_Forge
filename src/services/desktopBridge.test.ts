import { describe, expect, it, vi } from "vitest";
import {
  desktopApiKey,
  desktopApp,
  desktopVenice,
  isElectron,
} from "./desktopBridge";

describe("desktopBridge web fallback", () => {
  it("reports non-Electron mode and avoids desktop IPC calls in browser mode", async () => {
    vi.stubGlobal("window", {});

    expect(isElectron()).toBe(false);
    await expect(desktopApiKey.isConfigured()).resolves.toBe(false);
    await expect(desktopApiKey.test()).resolves.toMatchObject({
      ok: false,
      message: "Not in desktop mode",
    });
    await expect(desktopApp.getDiagnostics()).resolves.toMatchObject({
      isDesktop: false,
      transport: "web-proxy",
    });
    await expect(
      desktopVenice.request({ endpoint: "/models", method: "GET" })
    ).rejects.toThrow(/desktop mode/i);
  });
});
