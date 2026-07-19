// @vitest-environment node
import { describe, expect, it } from "vitest";
import { serializeDocument } from "./document-serializer-service";

const blocks = [
  { id: "heading_1", type: "heading" as const, level: 1 as const, text: "Research <script>alert(1)</script>" },
  { id: "paragraph_1", type: "paragraph" as const, text: "A safe paragraph." },
];

describe("document serializers", () => {
  it.each(["txt", "md", "html", "docx", "pdf"] as const)("VERIFY-148 creates validated %s output from normalized blocks", async (format) => {
    const result = await serializeDocument(format, { kind: "blocks", title: "Test", blocks });
    expect(result.validation.valid).toBe(true);
    expect(result.bytes.byteLength).toBeGreaterThan(10);
    expect(result.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("escapes active HTML content and emits a restrictive CSP", async () => {
    const result = await serializeDocument("html", { kind: "blocks", blocks });
    const html = new TextDecoder().decode(result.bytes);
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("default-src 'none'");
  });

  it("validates JSON and protects CSV consumers from formula injection", async () => {
    const json = await serializeDocument("json", { kind: "json", value: { enabled: true, count: 2 }, indentation: 2 });
    expect(new TextDecoder().decode(json.bytes)).toContain('"enabled": true');
    const csv = await serializeDocument("csv", {
      kind: "csv",
      columns: ["name", "value"],
      rows: [["risk", "=CMD()"]],
      delimiter: ",",
      includeHeader: true,
    });
    expect(new TextDecoder().decode(csv.bytes)).toContain("'=CMD()");
  });

  it("rejects malformed CSV row widths", async () => {
    await expect(serializeDocument("csv", { kind: "csv", columns: ["a", "b"], rows: [["one"]], delimiter: ",", includeHeader: true })).rejects.toThrow("declared column width");
  });
});
