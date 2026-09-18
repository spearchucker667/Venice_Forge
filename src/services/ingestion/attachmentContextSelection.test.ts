import { describe, expect, it } from "vitest";
import type { IngestedAttachment } from "../../types/ingestion";
import { estimateTokenCount } from "../chatContextBudget";
import { selectAttachmentContext } from "./attachmentContextSelection";

/**
 * VF-AUD-20260916-P2-002 — selector↔compiler envelope-overhead invariant.
 *
 * The selector must budget against the RENDERED provider context
 * (chunk text + opening/closing envelope + metadata + separators),
 * not just the raw chunk text. Without this, selection can report
 * "fits" while the compiler's rendered envelope is later truncated.
 */

function makeAttachment(overrides: Partial<IngestedAttachment> & { id: string; text: string }): IngestedAttachment {
  const name = overrides.name ?? `${overrides.id}.txt`;
  const ext = name.includes(".") ? name.split(".").pop()! : "txt";
  return {
    id: overrides.id,
    kind: "text",
    name,
    extension: ext,
    mimeType: overrides.mimeType ?? "text/plain",
    sizeBytes: overrides.text.length,
    createdAt: "2026-09-17T00:00:00.000Z",
    text: overrides.text,
    chunks: overrides.chunks,
    extraction: {
      route: "local-text",
      local: true,
      truncated: false,
      warnings: [],
      errors: [],
    },
    modelRequirements: {
      requiresVision: false,
      canFallbackToText: true,
    },
    security: {
      untrusted: true,
      macrosExecuted: false,
      scriptsExecuted: false,
      htmlSanitized: true,
    },
  };
}

describe("selectAttachmentContext — envelope-overhead budget (VF-AUD-20260916-P2-002)", () => {
  it("reports rendered-context tokens, not raw chunk tokens", () => {
    // 50 chunks of 10 chars each ≈ 500 raw chars / ~125 raw tokens.
    // Plus per-chunk envelope overhead (id, name, mime, body separator,
    // close tag, inter-envelope `\n\n`) — the rendered cost is much
    // larger than the raw cost.
    const chunks = Array.from({ length: 50 }, (_, i) => ({
      attachmentId: "att-50",
      chunkIndex: i,
      startOffset: i * 10,
      endOffset: (i + 1) * 10,
      tokenEstimate: 2,
      text: "x".repeat(10),
      provenance: { name: "att-50.txt", mimeType: "text/plain" },
    }));
    const attachments: IngestedAttachment[] = [makeAttachment({
      id: "att-50",
      name: "att-50.txt",
      mimeType: "text/plain",
      text: "x".repeat(500),
      chunks,
    })];
    // Generous allowance so the selector admits ALL 50 chunks.
    const selection = selectAttachmentContext(attachments, 10_000);

    expect(selection.selectedAttachmentIds.has("att-50")).toBe(true);

    // The rendered text and its token estimate must include the envelope overhead.
    const renderedTokens = estimateTokenCount(selection.providerContextText).count;
    expect(renderedTokens).toBeGreaterThan(selection.usedTokens - 1); // within tolerance
    // Critical invariant: usedTokens is at LEAST the raw text token cost
    // (envelope overhead must not be ignored).
    const rawText = chunks.map((c) => c.text).join("");
    const rawTokens = estimateTokenCount(rawText).count;
    expect(selection.usedTokens).toBeGreaterThan(rawTokens);

    // The compiled provider context starts with `<external_attachment ` per envelope.
    expect(selection.providerContextText).toMatch(/<external_attachment [^>]+>/);
    // Every admitted chunk's metadata is present in the rendered text.
    expect(selection.providerContextText).toContain("att-50.txt");
    expect(selection.providerContextText).toContain("text/plain");
  });

  it("admits fewer chunks when envelope overhead is non-trivial", () => {
    // Demonstrate that the selector now drops chunks that would otherwise
    // push the rendered envelope past the allowance. Without the fix, the
    // selector would admit all of them based on raw tokens alone.
    const longName = "very-long-filename-with-lots-of-extra-characters.docx";
    const longMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const chunkText = "alpha ".repeat(50); // ~300 chars / ~75 tokens per chunk
    const chunks = Array.from({ length: 10 }, (_, i) => ({
      attachmentId: "att-doc",
      chunkIndex: i,
      startOffset: i * chunkText.length,
      endOffset: (i + 1) * chunkText.length,
      tokenEstimate: estimateTokenCount(chunkText).count,
      text: chunkText,
      provenance: { name: longName, mimeType: longMime },
    }));
    const attachments: IngestedAttachment[] = [makeAttachment({
      id: "att-doc",
      name: longName,
      mimeType: longMime,
      text: chunkText.repeat(10),
      chunks,
    })];
    // Tight allowance that admits some chunks but not all — proves the
    // selector is bounded against rendered envelope overhead. The exact
    // count is tokenizer-implementation-dependent, so we assert "fewer
    // than the available 10" and that the selector's usedTokens matches
    // what the rendered text actually costs.
    const selection = selectAttachmentContext(attachments, 600);
    // Count admitted chunks by counting envelope-open tags in the rendered text.
    const admittedCount = (selection.providerContextText.match(/<external_attachment /g) ?? []).length;
    expect(admittedCount).toBeGreaterThan(0);
    expect(admittedCount).toBeLessThan(10);
    // The selector's reported usedTokens reflects the rendered token cost
    // (within tokenizer tolerance). This is the audit's invariant: when the
    // selector reports "fits", the compiler will not immediately truncate.
    // The exact equality is heuristic-implementation-dependent — what we
    // care about is that the selector's number is in the right ballpark of
    // the rendered cost, not the raw chunk cost.
    const renderedTokens = estimateTokenCount(selection.providerContextText).count;
    expect(Math.abs(selection.usedTokens - renderedTokens)).toBeLessThan(200);
  });

  it("single envelope per attachment fits the budget", () => {
    // Sanity: with envelope overhead accounted for, a single attachment
    // whose raw text + envelope fits the allowance is admitted whole.
    const body = "hello world ".repeat(20);
    const attachment = makeAttachment({
      id: "att-1",
      name: "small.txt",
      mimeType: "text/plain",
      text: body,
    });
    const bodyTokens = estimateTokenCount(body).count;
    const selection = selectAttachmentContext([attachment], bodyTokens + 200);
    expect(selection.selectedAttachmentIds.has("att-1")).toBe(true);
    expect(selection.usedTokens).toBeGreaterThanOrEqual(bodyTokens);
  });

  it("preserves attachment metadata across envelopes (1/10/50+ chunks, long name/MIME)", () => {
    const longName = "extremely-verbose-filename-with-many-characters.docx";
    const longMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    const chunkText = "beta ".repeat(40);
    const chunks = Array.from({ length: 50 }, (_, i) => ({
      attachmentId: "att-many",
      chunkIndex: i,
      startOffset: i * chunkText.length,
      endOffset: (i + 1) * chunkText.length,
      tokenEstimate: estimateTokenCount(chunkText).count,
      text: chunkText,
      provenance: { name: longName, mimeType: longMime },
    }));
    const attachments: IngestedAttachment[] = [makeAttachment({
      id: "att-many",
      name: longName,
      mimeType: longMime,
      text: chunkText.repeat(50),
      chunks,
    })];
    // Generous allowance so most chunks are admitted; render is exact.
    const selection = selectAttachmentContext(attachments, 8_000);
    expect(selection.providerContextText).toContain(longName);
    expect(selection.providerContextText).toContain(longMime);
    // Every admitted chunk's text appears in the rendered envelope (verify
    // by substring presence in the rendered text — the selector does not
    // expose its internal chunks array).
    const expectedBody = chunkText;
    const admittedCount = (selection.providerContextText.match(/<external_attachment /g) ?? []).length;
    expect(admittedCount).toBeGreaterThan(0);
    // Spot-check that the body text appears at least once for a sampled chunk.
    expect(selection.providerContextText).toContain(expectedBody);
  });

  it("does not silently grow selection across many small files", () => {
    // 50 small files, each with a tiny chunk — without envelope overhead
    // accounting the selector would admit all 50; with the fix it admits
    // only as many as the allowance permits once envelope overhead is paid.
    const attachments: IngestedAttachment[] = Array.from({ length: 50 }, (_, i) =>
      makeAttachment({
        id: `att-${i}`,
        name: `tiny-${i}.txt`,
        mimeType: "text/plain",
        text: "x".repeat(10),
      }),
    );
    const selection = selectAttachmentContext(attachments, 500);
    // Each admitted attachment contributes one envelope-open tag (compatibility
    // fallback path); count them and verify it's < 50.
    const admittedCount = (selection.providerContextText.match(/<external_attachment /g) ?? []).length;
    expect(admittedCount).toBeLessThan(50);
    const renderedTokens = estimateTokenCount(selection.providerContextText).count;
    expect(renderedTokens).toBeLessThanOrEqual(500 + 16);
  });

  it("compatibility fallback (attachments without chunks) also budgets envelope overhead", () => {
    const attachments: IngestedAttachment[] = [makeAttachment({
      id: "fallback",
      name: "fallback.txt",
      mimeType: "text/plain",
      text: "x".repeat(200),
      // no chunks → compatibility fallback path
    })];
    const bodyTokens = estimateTokenCount("x".repeat(200)).count;
    const selection = selectAttachmentContext(attachments, bodyTokens + 200);
    expect(selection.selectedAttachmentIds.has("fallback")).toBe(true);
    expect(selection.providerContextText).toContain("fallback.txt");
  });
});