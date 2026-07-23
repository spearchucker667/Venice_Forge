// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>());
const dialog = vi.hoisted(() => ({ showOpenDialog: vi.fn() }));
const clipboard = vi.hoisted(() => ({ readImage: vi.fn() }));
const stat = vi.hoisted(() => vi.fn());
const readFile = vi.hoisted(() => vi.fn());
const services = vi.hoisted(() => ({
  persistImageInspectorInput: vi.fn(),
  resolveImageInspectorInput: vi.fn(),
  readImageInspectorDataUrl: vi.fn(),
}));

vi.mock("electron", () => ({ dialog, clipboard }));
vi.mock("fs/promises", () => ({ default: { stat, readFile } }));
vi.mock("./common", () => ({
  registerIpcChannel: (channel: string, handler: (...args: unknown[]) => unknown) => {
    handlers.set(channel, handler);
  },
}));
vi.mock("../../services/imageInspectorInput", () => ({
  IMAGE_INSPECTOR_MAX_BYTES: 18 * 1024 * 1024,
  ...services,
}));

import { registerImageInspectorHandlers } from "./imageInspectorHandlers";

describe("Image Inspector IPC boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    registerImageInspectorHandlers();
  });

  it("registers only the four implemented, bounded channels", () => {
    expect([...handlers.keys()].sort()).toEqual([
      "imageInspector:chooseImage",
      "imageInspector:ingestClipboardImage",
      "imageInspector:readMediaDataUrl",
      "imageInspector:resolveMediaInput",
    ]);
  });

  it("does not read a canceled selection or an oversized file", async () => {
    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await handlers.get("imageInspector:chooseImage")!({})).toEqual({ ok: true, canceled: true });

    dialog.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ["/private/large.png"] });
    stat.mockResolvedValueOnce({ isFile: () => true, size: 19 * 1024 * 1024 });
    const oversized = await handlers.get("imageInspector:chooseImage")!({});
    expect(oversized).toMatchObject({ ok: false });
    expect(readFile).not.toHaveBeenCalled();
  });

  it("rejects malformed media ids before service access", async () => {
    const resolved = await handlers.get("imageInspector:resolveMediaInput")!({}, { mediaId: "../private", type: "app-media" });
    const read = await handlers.get("imageInspector:readMediaDataUrl")!({}, { mediaId: "bad" });
    expect(resolved).toMatchObject({ ok: false, error: "Image media id is invalid." });
    expect(read).toMatchObject({ ok: false, error: "Image media id is invalid." });
    expect(services.resolveImageInspectorInput).not.toHaveBeenCalled();
    expect(services.readImageInspectorDataUrl).not.toHaveBeenCalled();
  });

  it("routes a valid id through the narrow data-url service", async () => {
    const mediaId = "a".repeat(64);
    services.readImageInspectorDataUrl.mockResolvedValue({
      dataUrl: "data:image/png;base64,AA==",
      mimeType: "image/png",
      byteLength: 1,
    });
    const result = await handlers.get("imageInspector:readMediaDataUrl")!({}, { mediaId });
    expect(result).toMatchObject({ ok: true, result: { mimeType: "image/png", byteLength: 1 } });
    expect(services.readImageInspectorDataUrl).toHaveBeenCalledWith(mediaId);
  });
});
