/** @fileoverview Tests for typed safety provenance segments
 *  (VF-20260916-P1-002 / VF-AUD-P1-002-STRUCTURAL). */

import { describe, expect, it } from "vitest";
import {
  extractSafetyProvenance,
  SAFETY_PROVENANCE_FIELD,
  stripSafetyProvenance,
  type SafetyPromptSegment,
} from "./promptSegments";

const attachment = (text: string, id = "att1"): SafetyPromptSegment => ({
  kind: "attachment",
  attachmentId: id,
  name: "doc.txt",
  mimeType: "text/plain",
  text,
  trust: "untrusted-quoted-data",
});

const provenanceBody = (segments: SafetyPromptSegment[] = [attachment("hello")]) => ({
  model: "m",
  messages: [{ role: "user", content: "summarize this" }],
  [SAFETY_PROVENANCE_FIELD]: {
    version: 1,
    messages: [{ index: 0, segments }],
  },
});

describe("extractSafetyProvenance", () => {
  it("returns the validated payload for a well-formed body", () => {
    const extracted = extractSafetyProvenance(provenanceBody());
    expect(extracted).toBeDefined();
    expect(extracted!.version).toBe(1);
    expect(extracted!.messages).toHaveLength(1);
    expect(extracted!.messages[0].index).toBe(0);
    expect(extracted!.messages[0].segments[0]).toMatchObject({
      kind: "attachment",
      attachmentId: "att1",
    });
  });

  it("returns undefined when the field is absent", () => {
    expect(extractSafetyProvenance({ model: "m" })).toBeUndefined();
  });

  it.each([
    ["wrong version", { version: 2, messages: [{ index: 0, segments: [attachment("x")] }] }],
    ["missing messages", { version: 1 }],
    ["negative index", { version: 1, messages: [{ index: -1, segments: [attachment("x")] }] }],
    ["non-integer index", { version: 1, messages: [{ index: "0", segments: [attachment("x")] }] }],
    ["empty segments", { version: 1, messages: [{ index: 0, segments: [] }] }],
    [
      "unknown segment kind",
      { version: 1, messages: [{ index: 0, segments: [{ kind: "evil" }] }] },
    ],
    [
      "attachment missing trust marker",
      {
        version: 1,
        messages: [
          {
            index: 0,
            segments: [{ kind: "attachment", attachmentId: "a", name: "n", mimeType: "t", text: "x" }],
          },
        ],
      },
    ],
    ["empty message list", { version: 1, messages: [] }],
  ])("returns undefined for malformed provenance: %s", (_label, field) => {
    expect(
      extractSafetyProvenance({ [SAFETY_PROVENANCE_FIELD]: field }),
    ).toBeUndefined();
  });

  it("returns undefined for non-object payloads", () => {
    expect(extractSafetyProvenance(undefined)).toBeUndefined();
    expect(extractSafetyProvenance("string")).toBeUndefined();
    expect(extractSafetyProvenance(null)).toBeUndefined();
  });
});

describe("stripSafetyProvenance", () => {
  it("removes the internal field without mutating the input", () => {
    const body = provenanceBody();
    const stripped = stripSafetyProvenance(body);
    expect(stripped).not.toHaveProperty(SAFETY_PROVENANCE_FIELD);
    expect(stripped.messages).toEqual(body.messages);
    expect(body).toHaveProperty(SAFETY_PROVENANCE_FIELD);
  });

  it("passes through payloads without the field", () => {
    const body = { model: "m" };
    expect(stripSafetyProvenance(body)).toEqual(body);
  });
});
