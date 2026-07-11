export interface ConflictIdentityInput {
  storeName: string;
  recordId: string;
  sourceDeviceId?: string;
  remoteRevisionId?: string;
  localRevisionId?: string;
  operationId?: string;
}

/** Returns a deterministic conflict-record suffix derived from sync provenance. */
export async function createConflictIdentity(input: ConflictIdentityInput): Promise<string> {
  const canonical = [
    input.storeName,
    input.recordId,
    input.sourceDeviceId ?? "",
    input.remoteRevisionId ?? "",
    input.localRevisionId ?? "",
    input.operationId ?? "",
  ].join("\0");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
