/** @fileoverview Tests for the shared Media Studio derived-image operations
 * service: canonical routing, lineage persistence, typed failures, and
 * cancellation. */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/venice-client", () => ({ veniceBlob: vi.fn() }));

vi.mock("../services/storageService", () => ({
  default: {
    getItemsPageWithMeta: vi.fn(),
    getItems: vi.fn(),
    putMedia: vi.fn(),
    patchMedia: vi.fn(),
    bulkPatchMedia: vi.fn(),
    deleteMedia: vi.fn(),
    deleteMediaMany: vi.fn(),
    deleteItem: vi.fn(),
  },
}));

import { veniceBlob } from "../lib/venice-client";
import StorageService from "../services/storageService";
import { useMediaStore } from "../stores/media-store";
import {
  runImageDerivedOperation,
  resolveMediaItemImageInput,
} from "./imageDerivedOperations";
import type { MediaItem } from "../types/media";

const RESULT_BLOB = new Blob(["result-bytes"], { type: "image/png" });

/** Builds a syntactically valid PNG header (signature + IHDR) so the adapter's
 *  dimension decoder accepts it. 256×256 meets the upscale minimum of
 *  65,536 source pixels. */
function fakePngBase64(width: number, height: number): string {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13], 8);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // "IHDR"
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const PNG_B64 = fakePngBase64(256, 256);
const PNG_DATA_URL = `data:image/png;base64,${PNG_B64}`;

function pngBlob(): Blob {
  const bytes = Uint8Array.from(atob(PNG_B64), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: "image/png" });
}

const source: MediaItem = {
  id: "source-1",
  image: PNG_DATA_URL,
  prompt: "a copper cat",
  model: "flux-dev",
  timestamp: 1,
  mediaType: "image",
  operation: "generate",
  parentId: null,
  childrenIds: [],
  tags: [],
  note: "",
  favorite: false,
};

describe("runImageDerivedOperation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMediaStore.setState({
      items: [source],
      totalCount: 1,
      loading: false,
      loadingMore: false,
      loaded: true,
      hasMore: false,
      nextOffset: 0,
      lastError: null,
    });
    vi.mocked(StorageService.putMedia).mockImplementation(
      async (item) =>
        ({
          ...(item as MediaItem),
          id: (item as MediaItem).id,
        }) as MediaItem,
    );
    vi.mocked(StorageService.patchMedia).mockImplementation(async (id, patch) => {
      const existing = useMediaStore.getState().items.find((item) => item.id === id);
      if (!existing) throw new Error("not found");
      const patchRecord =
        typeof patch === "function"
          ? (patch as (item: MediaItem) => Partial<MediaItem>)(existing)
          : patch;
      return { ...existing, ...patchRecord, id } as MediaItem;
    });
    vi.mocked(veniceBlob).mockResolvedValue(RESULT_BLOB);
  });

  it("routes upscale 2× through the canonical /image/upscale adapter path", async () => {
    const outcome = await runImageDerivedOperation({
      sourceAsset: source,
      operation: { kind: "upscale", scale: 2 },
    });
    expect(veniceBlob).toHaveBeenCalledWith(
      "/image/upscale",
      { image: PNG_B64, scale: 2 },
      expect.any(Object),
    );
    expect(outcome.status).toBe("completed");
  });

  it("routes upscale 4× with the 4× scale factor", async () => {
    const outcome = await runImageDerivedOperation({
      sourceAsset: source,
      operation: { kind: "upscale", scale: 4 },
    });
    expect(veniceBlob).toHaveBeenCalledWith(
      "/image/upscale",
      { image: PNG_B64, scale: 4 },
      expect.any(Object),
    );
    expect(outcome.status).toBe("completed");
  });

  it("routes background removal through /image/background-remove and persists lineage", async () => {
    const outcome = await runImageDerivedOperation({
      sourceAsset: source,
      operation: { kind: "remove-background" },
    });
    expect(veniceBlob).toHaveBeenCalledWith(
      "/image/background-remove",
      { image: PNG_B64 },
      expect.any(Object),
    );
    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") throw new Error("unreachable");

    const asset = outcome.asset;
    expect(asset.parentId).toBe(source.id);
    expect(asset.id).not.toBe(source.id);
    expect(asset.operation).toBe("background-remove");
    expect(asset.mediaType).toBe("image");
    expect(asset.image.startsWith("data:image/png;base64,")).toBe(true);

    // Lineage recorded on the parent; the source asset itself is unchanged.
    const parent = useMediaStore.getState().byId(source.id);
    expect(parent?.childrenIds).toContain(asset.id);
    expect(parent).toMatchObject({
      image: PNG_DATA_URL,
      operation: "generate",
      prompt: "a copper cat",
    });
  });

  it("sends image+mask+prompt to the documented mask endpoint for inpainting", async () => {
    const mask = pngBlob();
    const outcome = await runImageDerivedOperation({
      sourceAsset: source,
      operation: { kind: "inpaint", mask, prompt: "remove the tree" },
      modelId: "flux-2-max-edit",
    });
    // The bundled swagger documents masks only via /image/multi-edit
    // (images[0] = base, remaining entries = layers/masks).
    expect(veniceBlob).toHaveBeenCalledWith(
      "/image/multi-edit",
      {
        modelId: "flux-2-max-edit",
        prompt: "remove the tree",
        images: [PNG_B64, PNG_B64],
        output_format: "png",
      },
      expect.any(Object),
    );
    expect(outcome.status).toBe("completed");
    if (outcome.status !== "completed") throw new Error("unreachable");
    expect(outcome.asset.operation).toBe("edit");
    expect(outcome.asset.model).toBe("flux-2-max-edit");
    expect(outcome.asset.prompt).toBe("remove the tree");
  });

  it("passes output_format: 'webp' to inpaint request when targetFormat is webp (Workstream B)", async () => {
    const mask = pngBlob();
    await runImageDerivedOperation({
      sourceAsset: source,
      operation: { kind: "inpaint", mask, prompt: "remove the tree" },
      modelId: "flux-2-max-edit",
      targetFormat: "webp",
    });
    expect(veniceBlob).toHaveBeenCalledWith(
      "/image/multi-edit",
      expect.objectContaining({
        output_format: "webp",
      }),
      expect.any(Object),
    );
  });

  it("defaults the inpaint model to the canonical edit model when none is given", async () => {
    const mask = pngBlob();
    const outcome = await runImageDerivedOperation({
      sourceAsset: source,
      operation: { kind: "inpaint", mask, prompt: "fill it in" },
    });
    expect(outcome.status).toBe("completed");
    const request = vi.mocked(veniceBlob).mock.calls[0][1] as { modelId: string };
    expect(request.modelId).toBe("firered-image-edit");
  });

  it("surfaces a typed failure and persists nothing when the response is not a valid image", async () => {
    vi.mocked(veniceBlob).mockResolvedValue(new Blob(["x"], { type: "text/plain" }));
    const outcome = await runImageDerivedOperation({
      sourceAsset: source,
      operation: { kind: "upscale", scale: 2 },
    });
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") throw new Error("unreachable");
    expect(outcome.operation).toEqual({ kind: "upscale", scale: 2 });
    expect(outcome.error).toContain("unsupported image format");
    expect(outcome.retryable).toBe(true);
    // No phantom asset: the store still holds only the source.
    expect(useMediaStore.getState().items.map((item) => item.id)).toEqual([source.id]);
  });

  it("rejects an empty binary response without persisting", async () => {
    vi.mocked(veniceBlob).mockResolvedValue(new Blob([], { type: "image/png" }));
    const outcome = await runImageDerivedOperation({
      sourceAsset: source,
      operation: { kind: "remove-background" },
    });
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") throw new Error("unreachable");
    expect(outcome.error).toContain("empty image");
    expect(useMediaStore.getState().items.map((item) => item.id)).toEqual([source.id]);
  });

  it("marks 4xx provider failures as non-retryable and 5xx/429 as retryable", async () => {
    vi.mocked(veniceBlob).mockRejectedValue(
      Object.assign(new Error("schema violation"), { status: 400 }),
    );
    const bad = await runImageDerivedOperation({
      sourceAsset: source,
      operation: { kind: "upscale", scale: 2 },
    });
    expect(bad).toMatchObject({ status: "failed", retryable: false });
    if (bad.status !== "failed") throw new Error("unreachable");
    expect(bad.error).toContain("400");

    vi.mocked(veniceBlob).mockRejectedValue(
      Object.assign(new Error("capacity"), { status: 503 }),
    );
    const retryable = await runImageDerivedOperation({
      sourceAsset: source,
      operation: { kind: "upscale", scale: 2 },
    });
    expect(retryable).toMatchObject({ status: "failed", retryable: true });
  });

  it("returns cancelled without calling the provider or persisting when pre-aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const outcome = await runImageDerivedOperation({
      sourceAsset: source,
      operation: { kind: "upscale", scale: 2 },
      signal: controller.signal,
    });
    expect(outcome).toEqual({ status: "cancelled" });
    expect(veniceBlob).not.toHaveBeenCalled();
    expect(useMediaStore.getState().items.map((item) => item.id)).toEqual([source.id]);
  });

  it("returns cancelled when the transport aborts mid-flight", async () => {
    vi.mocked(veniceBlob).mockRejectedValue(
      Object.assign(new Error("Aborted"), { name: "AbortError" }),
    );
    const outcome = await runImageDerivedOperation({
      sourceAsset: source,
      operation: { kind: "upscale", scale: 2 },
      signal: new AbortController().signal,
    });
    expect(outcome).toEqual({ status: "cancelled" });
    expect(useMediaStore.getState().items.map((item) => item.id)).toEqual([source.id]);
  });

  it("fails with a typed error when the source asset is no longer available locally", async () => {
    const broken: MediaItem = { ...source, id: "broken-1", image: "file:///tmp/gone.png" };
    const outcome = await runImageDerivedOperation({
      sourceAsset: broken,
      operation: { kind: "upscale", scale: 2 },
    });
    expect(outcome.status).toBe("failed");
    if (outcome.status !== "failed") throw new Error("unreachable");
    expect(outcome.error).toContain("no longer available locally");
    expect(veniceBlob).not.toHaveBeenCalled();
  });
});

describe("resolveMediaItemImageInput", () => {
  it("passes data URLs through unchanged", async () => {
    await expect(resolveMediaItemImageInput(source)).resolves.toBe(PNG_DATA_URL);
  });

  it("throws for assets without a resolvable source", async () => {
    const broken: MediaItem = { ...source, image: "" };
    await expect(resolveMediaItemImageInput(broken)).rejects.toThrow(
      "no longer available locally",
    );
  });
});
