import { describe, it, expect } from "vitest";
import { sniffTextBytes, sniffFilePrefix, detectShebangLanguage, decodeSniffedText } from "./textSniffing";
import { BinaryContentError } from "./ingestionErrors";

function utf16Bytes(text: string, littleEndian: boolean, withBom: boolean): Uint8Array {
  const codeUnits: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (littleEndian) {
      codeUnits.push(code & 0xff, (code >> 8) & 0xff);
    } else {
      codeUnits.push((code >> 8) & 0xff, code & 0xff);
    }
  }
  const body = new Uint8Array(codeUnits);
  if (!withBom) return body;
  const bom = littleEndian ? [0xff, 0xfe] : [0xfe, 0xff];
  const withBomBytes = new Uint8Array(body.length + 2);
  withBomBytes.set(bom, 0);
  withBomBytes.set(body, 2);
  return withBomBytes;
}

describe("textSniffing", () => {
  it("decodes UTF-8 text and reports the encoding", () => {
    const result = sniffTextBytes(new TextEncoder().encode("hello world"), "notes");
    expect(result.encoding).toBe("utf-8");
  });

  it("decodes UTF-16 LE and BE text with a BOM", () => {
    const le = sniffTextBytes(utf16Bytes("hello", true, true), "le.txt");
    expect(le.encoding).toBe("utf-16le");

    const be = sniffTextBytes(utf16Bytes("hello", false, true), "be.txt");
    expect(be.encoding).toBe("utf-16be");
  });

  it("decodes UTF-16 LE text without a BOM via the NUL pattern", () => {
    const result = sniffTextBytes(utf16Bytes("plain ascii text without bom", true, false), "no-bom.txt");
    expect(result.encoding).toBe("utf-16le");
  });

  it("decodes UTF-16 BE text without a BOM via the NUL pattern", () => {
    const result = sniffTextBytes(utf16Bytes("plain ascii text without bom", false, false), "no-bom.txt");
    expect(result.encoding).toBe("utf-16be");
  });

  it("decodes UTF-16 file bytes end to end", async () => {
    const bytes = utf16Bytes("console.log('héllo');", true, true);
    const file = new File([bytes], "app.ts");
    const sniffed = await sniffFilePrefix(file);
    expect(sniffed.encoding).toBe("utf-16le");
    const decoded = decodeSniffedText(new Uint8Array(await file.arrayBuffer()), sniffed, file.name);
    expect(decoded).toBe("console.log('héllo');");
  });

  it("rejects binary content renamed to a text extension", () => {
    // PNG magic followed by binary-looking bytes.
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
    expect(() => sniffTextBytes(png, "fake.txt")).toThrow(BinaryContentError);
  });

  it("rejects UTF-8 content containing NUL bytes", () => {
    const withNul = new Uint8Array([0x61, 0x00, 0x62, 0x00, 0x63, 0x00]);
    expect(() => sniffTextBytes(withNul, "nul.txt")).toThrow(BinaryContentError);
  });

  it("rejects control-character-heavy content", () => {
    const controlHeavy = new Uint8Array(256).fill(0x01);
    expect(() => sniffTextBytes(controlHeavy, "controls.txt")).toThrow(BinaryContentError);
  });

  it("accepts plain extensionless text", () => {
    const result = sniffTextBytes(new TextEncoder().encode("just some words"), "README");
    expect(result.encoding).toBe("utf-8");
  });

  it("accepts UTF-8 content with only whitespace and newlines", () => {
    const result = sniffTextBytes(new TextEncoder().encode("\n\n  \n\t\n"), "blank.txt");
    expect(result.encoding).toBe("utf-8");
  });

  it("detects a bash shebang as a language hint", () => {
    const result = sniffTextBytes(new TextEncoder().encode("#!/bin/bash\necho hi\n"), "deploy");
    expect(result.languageHint).toBe("bash");
  });

  it("detects shebang scripts invoked through env", () => {
    expect(detectShebangLanguage("#!/usr/bin/env python3\nprint(1)")).toBe("python");
    expect(detectShebangLanguage("#!/usr/bin/env node")).toBe("javascript");
    expect(detectShebangLanguage("#!/usr/bin/ruby")).toBe("ruby");
    expect(detectShebangLanguage("#!/bin/sh")).toBe("bash");
    expect(detectShebangLanguage("plain text")).toBeUndefined();
  });
});
