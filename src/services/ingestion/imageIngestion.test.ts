import { describe, it, expect } from "vitest";
import { ingestImageFile } from "./imageIngestion";
import { MAX_IMAGE_FILE_BYTES } from "./ingestionLimits";
import { FileTooLargeError, UnsupportedFileTypeError } from "./ingestionErrors";

// Since tests run in a jsdom environment, canvas and Image behaviour is mocked or limited.
// We test error handling and classification routes only.

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
    // Mock URL.createObjectURL / revokeObjectURL so they don't throw in jsdom.
    const origCreate = globalThis.URL?.createObjectURL;
    const origRevoke = globalThis.URL?.revokeObjectURL;
    globalThis.URL.createObjectURL = () => "blob:mock-url";
    globalThis.URL.revokeObjectURL = () => undefined;

    // Mock globalThis.Image so onerror fires deterministically instead of hanging.
    const OriginalImage = (globalThis as Record<string, unknown>).Image;

    class MockImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        // Fire onerror asynchronously to simulate a failed decode.
        queueMicrotask(() => this.onerror?.());
      }
    }

    (globalThis as Record<string, unknown>).Image = MockImage as unknown as typeof Image;

    try {
      const file = new File(["fake image data"], "test.png", { type: "image/png" });
      await expect(ingestImageFile(file)).rejects.toThrow(
        "Image codec unsupported or decode failed for file: test.png",
      );
    } finally {
      (globalThis as Record<string, unknown>).Image = OriginalImage;
      globalThis.URL.createObjectURL = origCreate;
      globalThis.URL.revokeObjectURL = origRevoke;
    }
  });
});
