import { describe, it, expect, vi } from "vitest";
import {
  mediaCapabilities,
  mediaItemSource,
  isVideoItem,
  formatDimensions,
  formatDuration,
  formatBytesApprox,
  estimateItemBytes,
  normalizedTags,
  splitTags,
} from "./mediaItem";
import type { MediaItem } from "../types/media";

// Mock the venice constants so we don't rely on the actual model list
vi.mock("../constants/venice", () => ({
  modelSupportsEdit: vi.fn((model) => model.id === "edit-model"),
  modelSupportsUpscale: vi.fn((model) => model.id === "upscale-model"),
  modelSupportsVideo: vi.fn((model) => model.id === "video-model"),
  modelSupportsVision: vi.fn((modelId, liveCaps) => {
    if (liveCaps && typeof liveCaps.supportsVision === "boolean") {
      return liveCaps.supportsVision;
    }
    return modelId === "vision-model";
  }),
}));

describe("mediaItem utils", () => {
  describe("mediaCapabilities", () => {
    it("returns correct capabilities for edit-model", () => {
      const caps = mediaCapabilities({ model: "edit-model" });
      expect(caps).toEqual({
        upscale: false,
        edit: true,
        video: false,
        vision: false,
      });
    });

    it("returns correct capabilities for upscale-model", () => {
      const caps = mediaCapabilities({ model: "upscale-model" });
      expect(caps).toEqual({
        upscale: true,
        edit: false,
        video: false,
        vision: false,
      });
    });

    it("returns correct capabilities for video-model", () => {
      const caps = mediaCapabilities({ model: "video-model" });
      expect(caps).toEqual({
        upscale: false,
        edit: false,
        video: true,
        vision: false,
      });
    });

    it("returns correct capabilities for vision-model", () => {
      const caps = mediaCapabilities({ model: "vision-model" });
      expect(caps).toEqual({
        upscale: false,
        edit: false,
        video: false,
        vision: true,
      });
    });

    it("uses liveCapabilities for vision if provided", () => {
      // Overrides the static 'vision-model' check
      expect(
        mediaCapabilities({ model: "vision-model", liveCapabilities: { supportsVision: false } })
      ).toEqual({
        upscale: false,
        edit: false,
        video: false,
        vision: false,
      });

      // Grants vision to a non-vision model
      expect(
        mediaCapabilities({ model: "other-model", liveCapabilities: { supportsVision: true } })
      ).toEqual({
        upscale: false,
        edit: false,
        video: false,
        vision: true,
      });
    });
  });

  describe("mediaItemSource", () => {
    it("returns null if no image is present", () => {
      expect(mediaItemSource({} as MediaItem)).toBeNull();
    });

    describe("video", () => {
      it("returns raw if it starts with data:", () => {
        expect(mediaItemSource({ mediaType: "video", image: "data:video/mp4;base64,123" } as MediaItem)).toBe("data:video/mp4;base64,123");
      });

      it("returns raw if it starts with blob:", () => {
        expect(mediaItemSource({ mediaType: "video", image: "blob:http://localhost/123" } as MediaItem)).toBe("blob:http://localhost/123");
      });

      it("returns raw if it starts with http", () => {
        expect(mediaItemSource({ mediaType: "video", image: "https://example.com/video.mp4" } as MediaItem)).toBe("https://example.com/video.mp4");
      });

      it("returns null for arbitrary base64 string", () => {
        expect(mediaItemSource({ mediaType: "video", image: "aGkh" } as MediaItem)).toBeNull();
      });
    });

    describe("image", () => {
      it("returns raw if it starts with data:", () => {
        expect(mediaItemSource({ mediaType: "image", image: "data:image/png;base64,123" } as MediaItem)).toBe("data:image/png;base64,123");
      });

      it("returns raw if it starts with blob:", () => {
        expect(mediaItemSource({ mediaType: "image", image: "blob:http://localhost/123" } as MediaItem)).toBe("blob:http://localhost/123");
      });

      it("returns raw if it starts with http", () => {
        expect(mediaItemSource({ mediaType: "image", image: "https://example.com/image.png" } as MediaItem)).toBe("https://example.com/image.png");
      });

      it("prepends data URI if it is an arbitrary string (assumed base64)", () => {
        expect(mediaItemSource({ mediaType: "image", image: "aGkh" } as MediaItem)).toBe("data:image/png;base64,aGkh");
      });
    });
  });

  describe("isVideoItem", () => {
    it("returns true for video", () => {
      expect(isVideoItem({ mediaType: "video" } as MediaItem)).toBe(true);
    });

    it("returns false for non-video", () => {
      expect(isVideoItem({ mediaType: "image" } as MediaItem)).toBe(false);
      expect(isVideoItem({} as MediaItem)).toBe(false);
    });
  });

  describe("formatDimensions", () => {
    it("formats valid dimensions correctly", () => {
      expect(formatDimensions({ width: 1024, height: 768 } as MediaItem)).toBe("1,024 × 768");
      expect(formatDimensions({ width: "1920", height: "1080" } as unknown as MediaItem)).toBe("1,920 × 1,080");
    });

    it("rounds float dimensions", () => {
      expect(formatDimensions({ width: 100.4, height: 100.6 } as MediaItem)).toBe("100 × 101");
    });

    it("returns null for invalid or missing dimensions", () => {
      expect(formatDimensions({} as MediaItem)).toBeNull();
      expect(formatDimensions({ width: "foo", height: "bar" } as unknown as MediaItem)).toBeNull();
      expect(formatDimensions({ width: -100, height: 200 } as MediaItem)).toBeNull();
      expect(formatDimensions({ width: 100, height: 0 } as MediaItem)).toBeNull();
    });
  });

  describe("formatDuration", () => {
    it("returns duration string if present", () => {
      expect(formatDuration("00:10")).toBe("00:10");
    });

    it("returns null if absent or empty", () => {
      expect(formatDuration(undefined)).toBeNull();
      expect(formatDuration("")).toBeNull();
    });
  });

  describe("formatBytesApprox", () => {
    it("returns 0 B for invalid, zero, or negative input", () => {
      expect(formatBytesApprox(0)).toBe("0 B");
      expect(formatBytesApprox(-100)).toBe("0 B");
      expect(formatBytesApprox(NaN)).toBe("0 B");
    });

    it("formats bytes properly", () => {
      expect(formatBytesApprox(500)).toBe("500 B");
    });

    it("formats KB properly", () => {
      expect(formatBytesApprox(1024)).toBe("1.0 KB");
      expect(formatBytesApprox(1536)).toBe("1.5 KB");
      expect(formatBytesApprox(100 * 1024)).toBe("100 KB"); // n >= 100 formatting test
    });

    it("formats MB properly", () => {
      expect(formatBytesApprox(1024 * 1024)).toBe("1.0 MB");
      expect(formatBytesApprox(1.5 * 1024 * 1024)).toBe("1.5 MB");
    });

    it("formats GB properly", () => {
      expect(formatBytesApprox(1024 * 1024 * 1024)).toBe("1.0 GB");
    });
    
    it("stops at GB for huge numbers", () => {
      expect(formatBytesApprox(1024 * 1024 * 1024 * 1024)).toBe("1024 GB");
    });
  });

  describe("estimateItemBytes", () => {
    it("returns 0 if image is missing", () => {
      expect(estimateItemBytes({} as MediaItem)).toBe(0);
    });

    it("calculates base64 size from data URI", () => {
      // 4 base64 chars = 3 bytes. 'aGkh' is 4 chars.
      expect(estimateItemBytes({ image: "data:image/png;base64,aGkh" } as MediaItem)).toBe(3);
    });
    
    it("handles data URI without comma", () => {
      // It falls back to the full length calculation `data:` -> 5 chars * 3/4 = 3.75 -> 3
      expect(estimateItemBytes({ image: "data:aGkh" } as MediaItem)).toBe(6);
    });

    it("returns string length for raw strings", () => {
      expect(estimateItemBytes({ image: "https://example.com/test.png" } as MediaItem)).toBe(28);
    });
  });

  describe("normalizedTags", () => {
    it("removes non-strings, trims, lowers, and deduplicates", () => {
      const tags = ["  FOO  ", "bar", 123 as any, "foo", "   ", "A".repeat(33)];
      expect(normalizedTags(tags)).toEqual(["foo", "bar"]);
    });

    it("returns empty array for empty input", () => {
      expect(normalizedTags([])).toEqual([]);
    });
  });

  describe("splitTags", () => {
    it("splits by comma or newline and trims/lowers", () => {
      expect(splitTags("FOO, bar \n bAz , , \n")).toEqual(["foo", "bar", "baz"]);
    });

    it("filters out tags longer than 32 chars", () => {
      const longTag = "A".repeat(33);
      expect(splitTags(`foo, ${longTag}, bar`)).toEqual(["foo", "bar"]);
    });

    it("returns empty array for empty input", () => {
      expect(splitTags("")).toEqual([]);
    });
  });
});
