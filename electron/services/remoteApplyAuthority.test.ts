// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { __resetRemoteApplyGrantsForTests, issueRemoteApplyGrant, revokeRemoteApplyGrant, validateMutationAuthority } from "./remoteApplyAuthority";

describe("remoteApplyAuthority", () => {
  beforeEach(__resetRemoteApplyGrantsForTests);

  it("binds a remote-sync grant to one store and record", () => {
    const token = issueRemoteApplyGrant("a".repeat(64), "conversations", "conv-1");
    expect(validateMutationAuthority("remote-sync", token, "conversations", "conv-1")).toBe(true);
    expect(validateMutationAuthority("remote-sync", token, "conversations", "conv-2")).toBe(false);
    expect(validateMutationAuthority("remote-sync", token, "personas", "conv-1")).toBe(false);
    expect(validateMutationAuthority("remote-sync", undefined, "conversations", "conv-1")).toBe(false);
  });

  it("revokes the grant after acknowledgment", () => {
    const token = issueRemoteApplyGrant("b".repeat(64), "personas", "persona-1");
    revokeRemoteApplyGrant(token);
    expect(validateMutationAuthority("remote-sync", token, "personas", "persona-1")).toBe(false);
  });

  it("does not require a remote grant for local or manual mutations", () => {
    expect(validateMutationAuthority("local-user", undefined, "conversations", "conv-1")).toBe(true);
    expect(validateMutationAuthority("manual-import", undefined, "conversations", "conv-1")).toBe(true);
  });

  it("authorizes tombstone delete matching store:record and rejects tombstone saves", () => {
    const token = issueRemoteApplyGrant("c".repeat(64), "tombstones", "conversations:conv-1");
    // Delete for matching store and record: authorized
    expect(validateMutationAuthority("remote-sync", token, "conversations", "conv-1", true)).toBe(true);
    // Non-delete (save) with tombstone token: rejected
    expect(validateMutationAuthority("remote-sync", token, "conversations", "conv-1", false)).toBe(false);
    // Delete with mismatched store: rejected
    expect(validateMutationAuthority("remote-sync", token, "personas", "conv-1", true)).toBe(false);
    // Delete with mismatched record: rejected
    expect(validateMutationAuthority("remote-sync", token, "conversations", "conv-2", true)).toBe(false);
  });
});
