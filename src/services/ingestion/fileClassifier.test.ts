import { describe, it, expect } from "vitest";
import { classifyFile, isSupportedIngestionFile, isImageLikeFile, isCodeLikeFile, isDocumentLikeFile } from "./fileClassifier";

describe("fileClassifier", () => {
  const mockFile = (name: string, type: string = "") => new File([""], name, { type });

  it("classifies pdf files", () => {
    expect(classifyFile(mockFile("test.pdf", "application/pdf")).kind).toBe("pdf");
  });

  it("classifies docx files", () => {
    expect(classifyFile(mockFile("test.docx")).kind).toBe("docx");
  });

  it("accepts legacy doc files with a parser", () => {
    expect(classifyFile(mockFile("test.doc")).kind).toBe("doc");
    expect(isSupportedIngestionFile(mockFile("test.doc"))).toBe(true);
  });

  it("classifies markdown files", () => {
    expect(classifyFile(mockFile("README.md")).kind).toBe("markdown");
    expect(classifyFile(mockFile("doc.markdown")).kind).toBe("markdown");
  });

  it("classifies text/json/yaml files", () => {
    expect(classifyFile(mockFile("data.json")).kind).toBe("text");
    expect(classifyFile(mockFile("events.jsonl")).kind).toBe("text");
    expect(classifyFile(mockFile("config.yaml")).kind).toBe("text");
    expect(classifyFile(mockFile("config.yml")).kind).toBe("text");
    expect(classifyFile(mockFile("notes.txt")).kind).toBe("text");
  });

  it("classifies image files", () => {
    for (const ext of ["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "svg", "tif", "tiff", "heic", "heif"]) {
      expect(classifyFile(mockFile(`image.${ext}`)).kind).toBe("image");
    }
  });

  it("classifies code files by extension", () => {
    for (const ext of [
      "ts",
      "tsx",
      "js",
      "jsx",
      "mjs",
      "cjs",
      "py",
      "go",
      "rs",
      "rb",
      "php",
      "cs",
      "c",
      "cpp",
      "cc",
      "cxx",
      "h",
      "hpp",
      "java",
      "kt",
      "kts",
      "swift",
      "scala",
      "sh",
      "bash",
      "zsh",
      "fish",
      "ps1",
      "bat",
      "cmd",
      "sql",
      "toml",
      "ini",
    ]) {
      expect(classifyFile(mockFile(`source.${ext}`)).kind).toBe("code");
    }
    expect(classifyFile(mockFile("test.c#")).kind).toBe("code");
    expect(classifyFile(mockFile("test.c#")).extension).toBe("cs");
  });

  it("classifies code files by exact name", () => {
    expect(classifyFile(mockFile("Dockerfile")).kind).toBe("code");
    expect(classifyFile(mockFile(".dockerfile")).kind).toBe("code");
    expect(classifyFile(mockFile(".env")).kind).toBe("code");
    expect(classifyFile(mockFile(".env.local")).kind).toBe("code");
    expect(classifyFile(mockFile(".gitignore")).kind).toBe("code");
  });

  it("classifies broad document extensions without falling through to unknown", () => {
    expect(classifyFile(mockFile("scan.rtf")).kind).toBe("text");
    expect(classifyFile(mockFile("table.csv")).kind).toBe("spreadsheet");
    expect(classifyFile(mockFile("table.xls")).kind).toBe("spreadsheet");
    expect(classifyFile(mockFile("table.xlsx")).kind).toBe("spreadsheet");
    expect(classifyFile(mockFile("feed.xml")).kind).toBe("text");
    expect(classifyFile(mockFile("page.html")).kind).toBe("text");
    expect(classifyFile(mockFile("page.htm")).kind).toBe("text");
  });

  it("handles unknown binaries", () => {
    expect(classifyFile(mockFile("unknown.bin")).kind).toBe("unknown");
    expect(classifyFile(mockFile("archive.zip")).kind).toBe("unknown");
  });

  it("handles extension/MIME mismatch safely", () => {
    // Falls back to extension mostly, but if extension is unknown and MIME is text, it returns text.
    expect(classifyFile(mockFile("test.unknown", "text/plain")).kind).toBe("text");
    expect(classifyFile(mockFile("test.unknown", "image/png")).kind).toBe("image");
  });

  it("provides correct helpers", () => {
    expect(isSupportedIngestionFile(mockFile("test.pdf"))).toBe(true);
    expect(isSupportedIngestionFile(mockFile("test.exe"))).toBe(false);

    expect(isImageLikeFile(mockFile("test.png"))).toBe(true);
    expect(isImageLikeFile(mockFile("test.pdf"))).toBe(false);

    expect(isCodeLikeFile(mockFile("test.ts"))).toBe(true);
    expect(isCodeLikeFile(mockFile("test.txt"))).toBe(false);

    expect(isDocumentLikeFile(mockFile("test.docx"))).toBe(true);
    expect(isDocumentLikeFile(mockFile("test.doc"))).toBe(false); // isDocumentLikeFile is only for text/markdown/pdf/docx that has local text
    expect(isDocumentLikeFile(mockFile("test.png"))).toBe(false);
  });
});
