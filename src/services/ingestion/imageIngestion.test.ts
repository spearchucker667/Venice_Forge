import { describe, it, expect } from "vitest";
import { ingestImageFile } from "./imageIngestion";
import { MAX_IMAGE_FILE_BYTES } from "./ingestionLimits";
import { FileTooLargeError, UnsupportedFileTypeError } from "./ingestionErrors";

// Since tests run in a Node environment (JSDOM), canvas and Image behavior is mocked or limited.
// We'll test error handling and classification routes.

describe("imageIngestion", () => {
  it("throws FileTooLargeError if file size exceeds MAX_IMAGE_FILE_BYTES", async () => {
    const file = {
      name: "huge.jpg",
      size: MAX_IMAGE_FILE_BYTES + 1,
      type: "image/jpeg",
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as File;

    await expect(ingestImageFile(file)).rejects.toThrow(FileTooLargeError);
  });

  it("throws UnsupportedFileTypeError for non-image files", async () => {
    const file = new File(["not an image"], "notes.txt", { type: "text/plain" });
    await expect(ingestImageFile(file)).rejects.toThrow(UnsupportedFileTypeError);
  });

  it("fails to decode gracefully in test environment without canvas", async () => {
    // Vitest jsdom might not fully support canvas downscaling out of the box without canvas package
    const file = new File(["fake image data"], "test.png", { type: "image/png" });
    
    // It should try to inspect and then reject because it's fake data
    await expect(ingestImageFile(file)).rejects.toThrow("Image codec unsupported or decode failed for file: test.png");
  });
});
