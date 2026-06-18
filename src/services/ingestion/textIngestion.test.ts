import { describe, it, expect } from "vitest";
import { ingestTextFile } from "./textIngestion";
import { MAX_EXTRACTED_TEXT_CHARS, MAX_TEXT_FILE_BYTES } from "./ingestionLimits";
import { FileTooLargeError, UnsupportedFileTypeError } from "./ingestionErrors";

describe("textIngestion", () => {
  const createTextFile = (content: string, name: string) => {
    return new File([content], name, { type: "text/plain" });
  };

  it("ingests a valid text file and wraps content", async () => {
    const file = createTextFile("Hello world", "test.txt");
    const result = await ingestTextFile(file);

    expect(result.kind).toBe("text");
    expect(result.text).toContain("Hello world");
    expect(result.text).toContain("<attached_file name=\"test.txt\" kind=\"text\">");
    expect(result.text).toContain("user-provided attachment content");
    expect(result.extraction.route).toBe("local-text");
    expect(result.extraction.truncated).toBe(false);
  });

  it("truncates text files exceeding MAX_EXTRACTED_TEXT_CHARS", async () => {
    // Generate a file exactly MAX_EXTRACTED_TEXT_CHARS + 10 bytes long
    const content = "A".repeat(MAX_EXTRACTED_TEXT_CHARS + 10);
    const file = createTextFile(content, "large.txt");
    const result = await ingestTextFile(file);

    expect(result.extraction.truncated).toBe(true);
    expect(result.extraction.warnings.length).toBe(1);
    expect(result.extraction.warnings[0]).toContain("truncated");
    
    // Check that it actually truncated the content inside the wrapper
    // The exact length of `result.text` will be MAX_EXTRACTED_TEXT_CHARS + wrapper length.
    const wrappedContentCount = (result.text?.match(/A/g) || []).length;
    expect(wrappedContentCount).toBe(MAX_EXTRACTED_TEXT_CHARS);
  });

  it("throws FileTooLargeError if file size exceeds MAX_TEXT_FILE_BYTES", async () => {
    // Note: since we can't easily allocate 1MB+ in a test cleanly without memory bloat,
    // we can mock the File object size.
    const file = {
      name: "huge.txt",
      size: MAX_TEXT_FILE_BYTES + 1,
      type: "text/plain",
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as File;

    await expect(ingestTextFile(file)).rejects.toThrow(FileTooLargeError);
  });

  it("throws UnsupportedFileTypeError for binary files", async () => {
    const file = new File(["binary"], "test.exe", { type: "application/x-msdownload" });
    await expect(ingestTextFile(file)).rejects.toThrow(UnsupportedFileTypeError);
  });

  it("handles markdown and csv files", async () => {
    const mdFile = new File(["# Title"], "readme.md", { type: "text/markdown" });
    const mdResult = await ingestTextFile(mdFile);
    expect(mdResult.kind).toBe("markdown");

    const csvFile = new File(["a,b,c"], "data.csv", { type: "text/csv" });
    const csvResult = await ingestTextFile(csvFile);
    expect(csvResult.kind).toBe("spreadsheet");
  });
});
