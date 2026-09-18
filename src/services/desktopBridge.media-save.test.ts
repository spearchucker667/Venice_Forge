import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { desktopMedia } from "./desktopBridge";

// `vi.mock` is hoisted; the shared mock state must be created via `vi.hoisted`
// so it is initialised before the mock factory reads it.
const mocks = vi.hoisted(() => ({
  refreshCapabilityUrl: vi.fn(async (url: string) => {
    if (!url || !url.startsWith("venice-media://")) return url;
    return `${url.split("?")[0]}?cap=refreshed`;
  }),
}));

vi.mock("./playableMediaUrl", () => ({
  resolvePlayableMediaUrl: mocks.refreshCapabilityUrl,
}));

const saveGeneratedMedia = vi.fn();
const saveMediaDataUrl = vi.fn();

describe("desktopMedia.saveMediaAs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refreshCapabilityUrl.mockClear();
    Object.defineProperty(window, "veniceForge", {
      configurable: true,
      value: {
        isDesktop: true,
        files: { saveGeneratedMedia, saveMediaDataUrl },
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as typeof window & { veniceForge?: unknown }).veniceForge;
  });

  it("uses the main-owned generated-media route when an opaque ID is available", async () => {
    saveGeneratedMedia.mockResolvedValue({ ok: true, canceled: false, filename: "image.png", bytes: 68 });
    await expect(desktopMedia.saveMediaAs({
      mediaId: "a".repeat(64),
      source: "venice-media://ignored",
      suggestedName: "image.png",
    })).resolves.toEqual({ status: "saved", filename: "image.png", bytes: 68 });
    expect(saveGeneratedMedia).toHaveBeenCalledWith({ mediaId: "a".repeat(64), suggestedName: "image.png" });
    expect(saveMediaDataUrl).not.toHaveBeenCalled();
  });

  it.each([
    "data:image/png;base64,iVBORw0KGgo=",
    "blob:https://renderer.test/legacy",
    "venice-media://legacy-source",
    "https://example.test/imported.png",
  ])("normalizes %s through the data-URL native save route", async (source) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["bytes"], { type: "image/png" })),
    }));
    saveMediaDataUrl.mockResolvedValue({ ok: true, canceled: false, filename: "legacy.png", bytes: 5 });
    const result = await desktopMedia.saveMediaAs({ source, suggestedName: "legacy.png" });
    expect(result).toEqual({ status: "saved", filename: "legacy.png", bytes: 5 });
    expect(saveMediaDataUrl).toHaveBeenCalledWith({
      dataUrl: expect.stringMatching(/^data:image\/png;base64,/),
      suggestedName: "legacy.png",
    });
  });

  it("refreshes an expired venice-media capability URL before fetching", async () => {
    // Regression for "Image save failed / Media source returned 403" when
    // attempting Save As on an image whose 5-minute capability token has
    // expired (DEFAULT_CAPABILITY_TOKEN_TTL_MS in customProtocolAccess.ts).
    const id = "c".repeat(64);
    const staleSource = `venice-media://${id}?cap=expired-token`;
    mocks.refreshCapabilityUrl.mockResolvedValueOnce(`venice-media://${id}?cap=refreshed`);
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["bytes"], { type: "image/png" })),
    });
    vi.stubGlobal("fetch", fetchSpy);
    saveMediaDataUrl.mockResolvedValue({ ok: true, canceled: false, filename: "image.png", bytes: 5 });

    const result = await desktopMedia.saveMediaAs({ source: staleSource, suggestedName: "image.png" });
    expect(result).toEqual({ status: "saved", filename: "image.png", bytes: 5 });
    expect(mocks.refreshCapabilityUrl).toHaveBeenCalledWith(staleSource);
    // fetch must be called with the refreshed URL, not the stale one.
    expect(fetchSpy).toHaveBeenCalledWith(`venice-media://${id}?cap=refreshed`);
    expect(fetchSpy).not.toHaveBeenCalledWith(staleSource);
  });

  it("treats native cancellation as a state-preserving outcome", async () => {
    saveGeneratedMedia.mockResolvedValue({ ok: true, canceled: true });
    await expect(desktopMedia.saveMediaAs({ mediaId: "a".repeat(64) })).resolves.toEqual({ status: "cancelled" });
  });

  it("rejects empty and unavailable media sources without invoking the native writer", async () => {
    await expect(desktopMedia.saveMediaAs({})).resolves.toMatchObject({ status: "failed" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob([])) }));
    await expect(desktopMedia.saveMediaAs({ source: "blob:empty" })).resolves.toMatchObject({ status: "failed", error: expect.stringMatching(/empty/i) });
    expect(saveMediaDataUrl).not.toHaveBeenCalled();
  });

  it("uses a browser download and revokes its object URL in web mode", async () => {
    delete (window as typeof window & { veniceForge?: unknown }).veniceForge;
    vi.useFakeTimers();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const createObjectURL = vi.fn(() => "blob:web-download");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["media"], { type: "audio/mpeg" })),
    }));

    await expect(desktopMedia.saveMediaAs({
      source: "https://example.test/audio.mp3",
      suggestedName: "audio.mp3",
    })).resolves.toEqual({ status: "saved", filename: "audio.mp3", bytes: 5 });
    expect(click).toHaveBeenCalledOnce();
    expect(createObjectURL).toHaveBeenCalledOnce();
    await vi.runAllTimersAsync();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:web-download");
    click.mockRestore();
    vi.useRealTimers();
  });

  it("reports a FileReader failure without invoking the native writer", async () => {
    class FailingFileReader {
      result: string | ArrayBuffer | null = null;
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      readAsDataURL() { this.onerror?.(); }
    }
    vi.stubGlobal("FileReader", FailingFileReader);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["media"], { type: "audio/mpeg" })),
    }));

    await expect(desktopMedia.saveMediaAs({ source: "blob:unreadable" })).resolves.toEqual({
      status: "failed",
      error: "Media bytes could not be read.",
    });
    expect(saveMediaDataUrl).not.toHaveBeenCalled();
  });
});
