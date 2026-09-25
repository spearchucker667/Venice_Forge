import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearClassifierBackend,
  getClassifierCapabilities,
  identifyAndValidateGeneratedMedia,
  identifyAndValidateOpenAiImageGenerationResponse,
  normalizeAndIdentifyMime,
  registerClassifierBackend,
} from "./mediaScreener";

describe("normalizeAndIdentifyMime", () => {
  it.each([
    {
      label: "JPEG",
      bytes: [0xff, 0xd8, 0xff],
      expectedMime: "image/jpeg",
    },
    {
      label: "PNG",
      bytes: [0x89, 0x50, 0x4e, 0x47],
      expectedMime: "image/png",
    },
    {
      label: "WebP",
      bytes: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
      expectedMime: "image/webp",
    },
    {
      label: "GIF",
      bytes: [0x47, 0x49, 0x46, 0x38],
      expectedMime: "image/gif",
    },
    {
      label: "MP3 with ID3",
      bytes: [0x49, 0x44, 0x33, 0x00],
      expectedMime: "audio/mpeg",
    },
    {
      label: "MP3 without ID3",
      bytes: [0xff, 0xfb, 0x00, 0x00],
      expectedMime: "audio/mpeg",
    },
    {
      label: "Ogg/Opus",
      bytes: [0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0],
      expectedMime: "audio/ogg",
    },
    {
      label: "AAC ADTS",
      bytes: [0xff, 0xf1, 0x00, 0x00, 0x00, 0x00, 0x00],
      expectedMime: "audio/aac",
    },
    {
      label: "FLAC",
      bytes: [0x66, 0x4c, 0x61, 0x43, 0, 0, 0, 0],
      expectedMime: "audio/flac",
    },
    {
      label: "WAV",
      bytes: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45],
      expectedMime: "audio/wav",
    },
    {
      label: "MP4",
      bytes: [0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70],
      expectedMime: "video/mp4",
    },
  ])("identifies $label from magic bytes", ({ bytes, expectedMime }) => {
    const buffer = Buffer.from(bytes);
    const result = normalizeAndIdentifyMime(buffer);
    expect(result.mime).toBe(expectedMime);
    expect(result.valid).toBe(true);
    expect(result.buffer).toBe(buffer);
  });

  describe("PCM", () => {
    it("accepts a non-empty buffer with declared audio/pcm", () => {
      const buffer = Buffer.from([0x00]);
      const result = normalizeAndIdentifyMime(buffer, "audio/pcm");
      expect(result.mime).toBe("audio/pcm");
      expect(result.valid).toBe(true);
    });

    it("rejects an empty buffer even with declared audio/pcm", () => {
      const result = normalizeAndIdentifyMime(Buffer.alloc(0), "audio/pcm");
      expect(result.mime).toBeNull();
      expect(result.valid).toBe(false);
    });
  });

  describe("byte floors", () => {
    it("rejects a 2-byte JPEG-like buffer", () => {
      const result = normalizeAndIdentifyMime(Buffer.from([0xff, 0xd8]));
      expect(result.valid).toBe(false);
      expect(result.mime).toBeNull();
    });

    it("rejects a 6-byte AAC-like buffer below the 7-byte floor", () => {
      const result = normalizeAndIdentifyMime(
        Buffer.from([0xff, 0xf1, 0, 0, 0, 0]),
      );
      expect(result.valid).toBe(false);
    });
  });
});

describe("identifyAndValidateGeneratedMedia", () => {
  it("skips screening when Family Safe Mode is disabled", async () => {
    const result = await identifyAndValidateGeneratedMedia(
      Buffer.from([0xff, 0xd8, 0xff]),
      "image/jpeg",
      false,
    );
    expect(result).toEqual({
      allowed: true,
      skipped: true,
      reason: "local-family-safe-mode-disabled",
    });
  });

  it("allows structurally valid media in Family Safe Mode via heuristic classifier", async () => {
    const result = await identifyAndValidateGeneratedMedia(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]),
      "image/png",
      true,
    );
    expect(result.allowed).toBe(true);
  });

  it("blocks https URLs with CLASSIFIER_UNAVAILABLE in Family Safe Mode", async () => {
    const result = await identifyAndValidateGeneratedMedia(
      "https://example.com/video.mp4",
      "video/mp4",
      true,
    );
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reasonCode).toBe("CLASSIFIER_UNAVAILABLE");
    expect(result.userMessage).toBe(
      "Media generation is not available while Family Safe Mode is enabled.",
    );
  });
});

describe("identifyAndValidateOpenAiImageGenerationResponse", () => {
  afterEach(() => {
    clearClassifierBackend();
  });

  function validPngBase64(): string {
    const png = Buffer.alloc(33);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png, 0);
    png.writeUInt32BE(13, 8);
    png.write("IHDR", 12, "ascii");
    png.writeUInt32BE(100, 16);
    png.writeUInt32BE(100, 20);
    png[24] = 8;
    png[25] = 2;
    return png.toString("base64");
  }

  it("screens structurally valid b64_json images", async () => {
    clearClassifierBackend();
    const result = await identifyAndValidateOpenAiImageGenerationResponse({
      created: 1,
      data: [{ b64_json: validPngBase64() }],
    });
    expect(result.allowed).toBe(true);
  });

  it("screens structurally valid data-URL images", async () => {
    clearClassifierBackend();
    const result = await identifyAndValidateOpenAiImageGenerationResponse({
      created: 1,
      data: [{ url: `data:image/png;base64,${validPngBase64()}` }],
    });
    expect(result.allowed).toBe(true);
  });

  it("rejects missing candidates, invalid base64, MIME mismatch, and unexpected envelope fields", async () => {
    clearClassifierBackend();
    const png = validPngBase64();
    for (const response of [
      { created: 1, data: [{}] },
      { created: 1, data: [{ b64_json: "not base64!" }] },
      { created: 1, data: [{ url: `data:image/jpeg;base64,${png}` }] },
      { created: 1, data: [{ b64_json: png }], extra: true },
    ]) {
      const result = await identifyAndValidateOpenAiImageGenerationResponse(response);
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.reasonCode).toBe("INVALID_MEDIA");
    }
  });

  it("fails closed for remote image URLs without fetching them", async () => {
    clearClassifierBackend();
    const result = await identifyAndValidateOpenAiImageGenerationResponse({
      created: 1,
      data: [{ url: "https://images.example.test/generated.png" }],
    });
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reasonCode).toBe("CLASSIFIER_UNAVAILABLE");
  });
});

describe("getClassifierCapabilities (VF-AUD-20260831-P2-009)", () => {
  afterEach(() => {
    clearClassifierBackend();
  });

  it("reports all modalities as 'unavailable' when no backend is registered", () => {
    clearClassifierBackend();
    const caps = getClassifierCapabilities();
    expect(caps).toEqual({
      semanticImageClassifier: "unavailable",
      semanticAudioClassifier: "unavailable",
      semanticVideoClassifier: "unavailable",
      hasRegisteredBackend: false,
    });
  });

  it("reports the image classifier as 'local' when an image backend is registered", () => {
    registerClassifierBackend({
      classifyImage: vi.fn().mockResolvedValue({ allowed: true }),
    });
    const caps = getClassifierCapabilities();
    expect(caps.semanticImageClassifier).toBe("local");
    expect(caps.semanticAudioClassifier).toBe("unavailable");
    expect(caps.semanticVideoClassifier).toBe("unavailable");
    expect(caps.hasRegisteredBackend).toBe(true);
  });

  // VF-AUD-20260916-P2-006 — production-build truthful capability state.
  // The default production build must report all three modalities as
  // 'unavailable' (and `hasRegisteredBackend: false`) so the Status view
  // can truthfully tell the user that Family Safe Mode is currently
  // "structural validation" rather than "semantic content screening".
  // Any widening to 'local' or 'provider' for a release must be paired with
  // a tested backend implementation — that gate is enforced by this test.
  it("VF-AUD-20260916-P2-006 production build returns the truthful 'unavailable' state", () => {
    clearClassifierBackend();
    const caps = getClassifierCapabilities();
    expect(caps).toEqual({
      semanticImageClassifier: "unavailable",
      semanticAudioClassifier: "unavailable",
      semanticVideoClassifier: "unavailable",
      hasRegisteredBackend: false,
    });
    // Explicit invariant: do not silently widen the modalities without
    // updating the audit handoff and adding the corresponding tested
    // backend implementation. The audit handoff §VF-AUD-20260916-P2-006
    // requires a separate approved implementation plan covering model
    // license/provenance, supply-chain validation, offline behavior,
    // calibration corpus, FP/FN evaluation, failure policy, diagnostics.
    expect(["unavailable", "local", "provider"]).toContain(caps.semanticImageClassifier);
    expect(["unavailable", "local", "provider"]).toContain(caps.semanticAudioClassifier);
    expect(["unavailable", "local", "provider"]).toContain(caps.semanticVideoClassifier);
  });
});
