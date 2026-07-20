import { describe, expect, it } from "vitest";
import {
  CHAT_MEDIA_OPERATIONS,
  CHAT_MEDIA_TYPES,
  isChatMediaReferenceArrayContract,
  isChatMediaReferenceContract,
} from "./chatMediaReferenceContracts";
import type { ChatMediaReference } from "../types/conversationVault";
import {
  coerceToChatMediaReferenceArray,
  createChatMediaReference,
} from "../types/conversation";

const validMediaId = "media-1234567890";
const validId = "ref-1234567890";

describe("vo-shared ChatMediaReference shared contract parity", () => {
  it("exposes the same mediaType union as the renderer-side ChatMediaReference", () => {
    expect(CHAT_MEDIA_TYPES).toEqual(["image", "video", "audio"]);
  });

  it("exposes the same operation union as the renderer-side ChatMediaReference", () => {
    expect(CHAT_MEDIA_OPERATIONS).toEqual(["generate", "edit", "upscale", "transcribe", "audio"]);
  });

  it("accepts a fresh factory output and rejects a malformed clone", () => {
    const ok = createChatMediaReference({
      id: validId,
      mediaId: validMediaId,
      mediaType: "image",
      operation: "generate",
      displayUrl: "venice-media://example",
    });
    expect(isChatMediaReferenceContract(ok as unknown)).toBe(true);

    const bad: Partial<ChatMediaReference> = {
      ...ok,
      displayUrl: "", // invalid
    };
    expect(isChatMediaReferenceContract(bad as unknown)).toBe(false);
  });

  it("agrees with coerceToChatMediaReferenceArray on a legacy single-object row", () => {
    // Legacy single-object {mediaId, mimeType, width, height} migrated through the renderer helper
    const coerced = coerceToChatMediaReferenceArray({
      id: validId,
      mediaId: validMediaId,
      mimeType: "image/png",
      width: 1,
      height: 1,
      mediaType: "image",
      operation: "generate",
      displayUrl: "venice-media://legacy",
      createdAt: Date.now(),
    } as unknown);
    expect(coerced).toHaveLength(1);
    expect(isChatMediaReferenceContract(coerced[0] as unknown)).toBe(true);
    expect(isChatMediaReferenceArrayContract(coerced as unknown)).toBe(true);
  });

  it("rejects when coerce drops all entries (no malformed coercion)", () => {
    const coerced = coerceToChatMediaReferenceArray(null);
    expect(coerced).toEqual([]);
    // Empty array passes the shared predicate (length 0 is fine)
    expect(isChatMediaReferenceArrayContract(coerced as unknown)).toBe(true);
  });

  it("rejects out-of-union mediaType and operation", () => {
    const base = createChatMediaReference({
      id: validId,
      mediaId: validMediaId,
      mediaType: "image",
      operation: "generate",
      displayUrl: "venice-media://x",
    });
    const badType = { ...base, mediaType: "panorama" as unknown } as ChatMediaReference;
    const badOp = { ...base, operation: "broadcast" as unknown } as ChatMediaReference;
    expect(isChatMediaReferenceContract(badType as unknown)).toBe(false);
    expect(isChatMediaReferenceContract(badOp as unknown)).toBe(false);
  });

  it("rejects oversized displayUrl or non-string thumbnail/alt/model fields", () => {
    const base = createChatMediaReference({
      id: validId,
      mediaId: validMediaId,
      mediaType: "image",
      operation: "generate",
      displayUrl: "venice-media://x",
    });
    const longUrl = { ...base, displayUrl: "https://example.com/" + "a".repeat(4096) } as ChatMediaReference;
    expect(isChatMediaReferenceContract(longUrl as unknown)).toBe(false);

    const numThumb = { ...base, thumbnailUrl: 42 as unknown } as ChatMediaReference;
    expect(isChatMediaReferenceContract(numThumb as unknown)).toBe(false);

    const boolAlt = { ...base, altText: true as unknown } as ChatMediaReference;
    expect(isChatMediaReferenceContract(boolAlt as unknown)).toBe(false);
  });

  it("rejects ids that violate the shared CHAT_MEDIA_REF_ID_RE grammar", () => {
    const base = createChatMediaReference({
      id: validId,
      mediaId: validMediaId,
      mediaType: "image",
      operation: "generate",
      displayUrl: "venice-media://x",
    });
    const idTooLong = {
      ...base,
      id: "a".repeat(129),
    } as ChatMediaReference;
    expect(isChatMediaReferenceContract(idTooLong as unknown)).toBe(false);

    const idBadChar = { ...base, id: "with/slash" } as ChatMediaReference;
    expect(isChatMediaReferenceContract(idBadChar as unknown)).toBe(false);
  });

  it("parity across shared ↔ chat-store-led: live + tombstoned + orphan entries share the same shape contract", () => {
    const liveEntry = createChatMediaReference({
      id: validId,
      mediaId: validMediaId,
      mediaType: "audio",
      operation: "audio",
      displayUrl: "venice-media://audio",
    });
    // Tombstone: deletedFromChatAt is a valid epoch number, contract still passes.
    // (Filtering on deletedFromChatAt != null is the renderer helpers' job, not the
    //  shared shape validator's.)
    const tombstoneInput = { ...liveEntry, deletedFromChatAt: Date.now() };
    expect(isChatMediaReferenceContract(tombstoneInput as unknown)).toBe(true);
    const orphan = { ...liveEntry, orphanedFromChat: true };
    expect(isChatMediaReferenceContract(orphan as unknown)).toBe(true);

    // Tombstone with a string-shaped deletedFromChatAt (i.e. someone passed an ISO string
    //  that the renderer should never produce) is correctly rejected at the shared boundary.
    const malformedTombstone = { ...liveEntry, deletedFromChatAt: "2026-07-20" } as unknown as ChatMediaReference;
    expect(isChatMediaReferenceContract(malformedTombstone as unknown)).toBe(false);
  });
});
