import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./veniceClient", () => ({
  veniceFetch: vi.fn(),
}));

vi.mock("../utils/download", () => ({
  downloadImage: vi.fn(),
}));

import { veniceFetch } from "./veniceClient";
import { downloadImage } from "../utils/download";
import { downloadAllGallery, generateImageWithWatermarkFallback } from "./imageWorkflowService";

describe("generateImageWithWatermarkFallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries once without hide_watermark when watermark is rejected", async () => {
    const onWatermarkRetry = vi.fn();
    vi.mocked(veniceFetch)
      .mockRejectedValueOnce(Object.assign(new Error("watermark parameter rejected"), { status: 400 }))
      .mockResolvedValueOnce({ data: { images: ["abc"] } } as any);

    const result = await generateImageWithWatermarkFallback(
      "flux-dev",
      { prompt: "test", width: 1024, height: 1024, disableWatermark: true },
      { onWatermarkRetry }
    );

    expect(result).toEqual({ data: { images: ["abc"] } });
    expect(onWatermarkRetry).toHaveBeenCalledTimes(1);
    expect(vi.mocked(veniceFetch)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(veniceFetch).mock.calls[0][1]).toMatchObject({
      method: "POST",
      body: expect.objectContaining({ hide_watermark: true }),
    });
    expect(vi.mocked(veniceFetch).mock.calls[1][1]).toMatchObject({
      method: "POST",
      body: expect.not.objectContaining({ hide_watermark: true }),
    });
  });

  it("does not retry for non-watermark errors", async () => {
    vi.mocked(veniceFetch).mockRejectedValueOnce(Object.assign(new Error("bad request"), { status: 400 }));

    await expect(
      generateImageWithWatermarkFallback("flux-dev", { prompt: "test", width: 1024, height: 1024 })
    ).rejects.toThrow("bad request");

    expect(vi.mocked(veniceFetch)).toHaveBeenCalledTimes(1);
  });
});

describe("downloadAllGallery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("counts direct-download fallbacks as failed rather than confirmed saves", async () => {
    vi.mocked(downloadImage).mockResolvedValue({ confirmed: false, usedFallback: true });
    const addToast = vi.fn();
    const onProgress = vi.fn();

    await downloadAllGallery(
      [{ id: "img-1", image: "https://example.com/image.png", prompt: "test", model: "flux-dev", timestamp: 1 }],
      addToast,
      { onProgress }
    );

    expect(onProgress).toHaveBeenCalledWith(1, 1);
    expect(addToast).toHaveBeenLastCalledWith("Saved 0 items (1 failed).", "success");
  });

  it("handles empty gallery gracefully", async () => {
    const addToast = vi.fn();
    await downloadAllGallery([], addToast);
    expect(addToast).toHaveBeenCalledWith("No media to download.", "info");
  });

  it("reports correctly when some fail and some succeed", async () => {
    vi.mocked(downloadImage)
      .mockResolvedValueOnce({ confirmed: true, usedFallback: false })
      .mockResolvedValueOnce({ confirmed: false, usedFallback: true });

    const addToast = vi.fn();
    const items = [
      { id: "1", image: "a", model: "m", timestamp: 1, mediaType: "image" as const, prompt: "" },
      { id: "2", image: "b", model: "m", timestamp: 1, mediaType: "image" as const, prompt: "" }
    ];
    await downloadAllGallery(items, addToast);
    
    expect(addToast).toHaveBeenLastCalledWith("Saved 1 items (1 failed).", "success");
  });

  it("stops downloading when cancelSignal is triggered", async () => {
    vi.mocked(downloadImage).mockResolvedValue({ confirmed: true, usedFallback: false });
    const addToast = vi.fn();
    const cancelSignal = { current: false };

    // Request two images, but cancel after the first one
    const promise = downloadAllGallery(
      [
        { id: "img-1", image: "img1", prompt: "test", model: "m", timestamp: 1 },
        { id: "img-2", image: "img2", prompt: "test", model: "m", timestamp: 2 },
      ],
      addToast,
      { 
        cancelSignal,
        onProgress: (curr) => { if (curr === 1) cancelSignal.current = true; }
      }
    );

    await promise;
    expect(vi.mocked(downloadImage)).toHaveBeenCalledTimes(1);
    expect(addToast).toHaveBeenCalledWith(expect.stringContaining("cancelled"), "info");
  });
});
