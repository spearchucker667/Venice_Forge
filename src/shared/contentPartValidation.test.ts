/** @fileoverview Phase 6 — ContentPart validation tests. */

import { describe, expect, it } from "vitest";
import {
  isSupportedFileData,
  isSupportedVideoUrl,
  looksLikeLocalFilesystemPath,
  MAX_VIDEO_URL_PARTS_PER_REQUEST,
  validateContentPart,
  validateContentParts,
  type ContentPartValidationError,
} from "./contentPartValidation";

describe("looksLikeLocalFilesystemPath", () => {
  it("rejects Unix absolute paths", () => {
    expect(looksLikeLocalFilesystemPath("/example/passwd")).toBe(true);
    expect(looksLikeLocalFilesystemPath("/example/me/Documents/foo.pdf")).toBe(true);
  });
  it("rejects Windows absolute paths", () => {
    // Use a placeholder hostname so the verify:repository-identity scan does
    // not flag this test fixture as a committed filesystem link.
    expect(looksLikeLocalFilesystemPath("C:\\example\\me\\foo.pdf")).toBe(true);
    expect(looksLikeLocalFilesystemPath("D:/example/key.txt")).toBe(true);
  });
  it("rejects file:// URIs", () => {
    expect(looksLikeLocalFilesystemPath("file:///example/passwd")).toBe(true);
  });
  it("accepts data URLs and public URLs", () => {
    expect(looksLikeLocalFilesystemPath("data:application/pdf;base64,AAA")).toBe(false);
    expect(looksLikeLocalFilesystemPath("https://example.com/foo.pdf")).toBe(false);
  });
});

describe("isSupportedVideoUrl", () => {
  it("accepts data URLs with a video/ MIME prefix", () => {
    expect(isSupportedVideoUrl("data:video/mp4;base64,AAA")).toBe(true);
  });
  it("accepts public mp4 / mov / webm / mpeg URLs", () => {
    expect(isSupportedVideoUrl("https://cdn.example.com/clip.mp4")).toBe(true);
    expect(isSupportedVideoUrl("https://cdn.example.com/clip.mov")).toBe(true);
    expect(isSupportedVideoUrl("https://cdn.example.com/clip.webm")).toBe(true);
    expect(isSupportedVideoUrl("https://cdn.example.com/clip.mpeg")).toBe(true);
  });
  it("accepts YouTube links for supported providers", () => {
    expect(isSupportedVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isSupportedVideoUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
  });
  it("rejects unsupported extensions", () => {
    expect(isSupportedVideoUrl("https://example.com/clip.avi")).toBe(false);
    expect(isSupportedVideoUrl("https://example.com/clip.xyz")).toBe(false);
  });
  it("rejects raw filesystem paths", () => {
    expect(isSupportedVideoUrl("/example/me/clip.mp4")).toBe(false);
    expect(isSupportedVideoUrl("file:///example/me/clip.mp4")).toBe(false);
  });
});

describe("isSupportedFileData", () => {
  it("accepts documented MIME data URL prefixes", () => {
    expect(isSupportedFileData("data:application/pdf;base64,JVBERi0")).toBe(true);
    expect(isSupportedFileData("data:application/epub;base64,AAA")).toBe(true);
    expect(isSupportedFileData("data:text/plain;base64,AAA")).toBe(true);
    expect(isSupportedFileData("data:text/markdown;base64,AAA")).toBe(true);
    expect(isSupportedFileData("data:application/json;base64,AAA")).toBe(true);
  });
  it("accepts public http(s) URLs (upstream accepts 'publicly accessible URL')", () => {
    expect(isSupportedFileData("https://example.com/document.pdf")).toBe(true);
  });
  it("rejects raw filesystem paths", () => {
    expect(isSupportedFileData("/example/me/foo.pdf")).toBe(false);
    expect(isSupportedFileData("file:///example/me/foo.pdf")).toBe(false);
  });
  it("rejects unsupported MIME types", () => {
    expect(isSupportedFileData("data:image/png;base64,AAA")).toBe(false);
    expect(isSupportedFileData("data:application/octet-stream;base64,AAA")).toBe(false);
  });
});

describe("validateContentPart", () => {
  it("accepts a text part", () => {
    expect(validateContentPart({ type: "text", text: "hi" }, 0)).toBeNull();
  });
  it("rejects an empty text part", () => {
    const err = validateContentPart({ type: "text", text: "" }, 0);
    expect(err?.reason).toBe("missing-payload");
  });
  it("rejects an image_url with a raw filesystem path", () => {
    const err = validateContentPart({ type: "image_url", image_url: { url: "/example/passwd" } }, 0);
    expect(err?.reason).toBe("raw-local-path");
  });
  it("accepts a valid file part with PDF data URL", () => {
    expect(
      validateContentPart(
        { type: "file", file: { file_data: "data:application/pdf;base64,JVBERi0", filename: "doc.pdf" } },
        0,
      ),
    ).toBeNull();
  });
  it("rejects a file part with a raw filesystem path", () => {
    const err = validateContentPart(
      { type: "file", file: { file_data: "/example/me/foo.pdf" } },
      0,
    );
    expect(err?.reason).toBe("raw-local-path");
  });
  it("rejects a video_url with an unsupported extension", () => {
    const err = validateContentPart(
      { type: "video_url", video_url: { url: "https://example.com/clip.avi" } },
      0,
    );
    expect(err?.reason).toBe("unsupported-format");
  });
  it("accepts a video_url with a YouTube link", () => {
    expect(
      validateContentPart(
        { type: "video_url", video_url: { url: "https://youtu.be/dQw4w9WgXcQ" } },
        0,
      ),
    ).toBeNull();
  });
  it("rejects an unknown content part type", () => {
    const err = validateContentPart({ type: "mystery" as unknown as "text", text: "x" }, 0);
    expect(err?.reason).toBe("unsupported-type");
  });
});

describe("validateContentParts (Phase 6 video_url limit)", () => {
  it("enforces the at-most-3 video_url parts per request rule", () => {
    const parts = Array.from({ length: MAX_VIDEO_URL_PARTS_PER_REQUEST + 1 }, () => ({
      type: "video_url" as const,
      video_url: { url: "https://example.com/clip.mp4" },
    }));
    const errors = validateContentParts(parts);
    expect(errors.some((e) => e.reason === "too-many-video-urls")).toBe(true);
  });
  it("accepts a mix within the limit", () => {
    const errors = validateContentParts([
      { type: "text", text: "describe" },
      { type: "video_url", video_url: { url: "https://example.com/clip.mp4" } },
      { type: "file", file: { file_data: "data:application/pdf;base64,JVBERi0" } },
    ]);
    expect(errors).toEqual([]);
  });
  it("aggregates per-part and aggregate errors", () => {
    const errors = validateContentParts([
      { type: "text", text: "" }, // missing-payload
      { type: "video_url", video_url: { url: "/etc/clip.mp4" } }, // raw-local-path
      { type: "video_url", video_url: { url: "https://example.com/clip.mp4" } },
      { type: "video_url", video_url: { url: "https://example.com/clip.mp4" } },
      { type: "video_url", video_url: { url: "https://example.com/clip.mp4" } },
      { type: "video_url", video_url: { url: "https://example.com/clip.mp4" } }, // 4 total
    ]);
    const reasons = errors.map((e) => e.reason);
    expect(reasons).toContain("missing-payload");
    expect(reasons).toContain("raw-local-path");
    expect(reasons).toContain("too-many-video-urls");
  });

  it("the aggregate too-many-video-urls error carries interpolation params", () => {
    const errors = validateContentParts(
      Array.from({ length: MAX_VIDEO_URL_PARTS_PER_REQUEST + 2 }, () => ({
        type: "video_url" as const,
        video_url: { url: "https://example.com/clip.mp4" },
      })),
    );
    const agg = errors.find((e) => e.reason === "too-many-video-urls");
    expect(agg).toBeDefined();
    expect((agg as ContentPartValidationError).params).toEqual({
      max: MAX_VIDEO_URL_PARTS_PER_REQUEST,
      actual: MAX_VIDEO_URL_PARTS_PER_REQUEST + 2,
    });
  });

  it("the error type carries no English `message` field (i18n contract)", () => {
    // The validator surfaces a stable reason code + structured params; the
    // renderer is responsible for translating via the i18n catalog. Adding a
    // hardcoded English `message` would break the
    // `verify:i18n-hardcoded-regressions` gate and the AGENTS.md "translate
    // presentation, not transport/state" rule.
    const err = validateContentPart({ type: "file", file: { file_data: "/example/me/foo.pdf" } }, 0);
    expect(err).toBeDefined();
    expect((err as unknown as Record<string, unknown>).message).toBeUndefined();
  });
});
