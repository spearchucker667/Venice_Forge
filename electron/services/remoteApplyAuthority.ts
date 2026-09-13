import crypto from "node:crypto";
import type { MutationOrigin } from "../../src/types/sync";

interface RemoteApplyGrant {
  operationId: string;
  storeName: string;
  recordId: string;
}

const grants = new Map<string, RemoteApplyGrant>();

export function issueRemoteApplyGrant(operationId: string, storeName: string, recordId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  grants.set(token, { operationId, storeName, recordId });
  return token;
}

export function revokeRemoteApplyGrant(token?: string): void {
  if (token) grants.delete(token);
}

export function validateMutationAuthority(
  origin: MutationOrigin,
  token: unknown,
  storeName: string,
  recordId: string,
  isDelete = false,
): boolean {
  if (origin !== "remote-sync") return true;
  if (typeof token !== "string") return false;
  const grant = grants.get(token);
  if (!grant) return false;

  if (grant.storeName === "tombstones") {
    return isDelete && grant.recordId === `${storeName}:${recordId}`;
  }

  const conflictPrefix = grant.recordId.length > 102
    ? `${grant.recordId.slice(0, 102)}_conflict_`
    : `${grant.recordId}_conflict_`;

  return grant.storeName === storeName && (
    grant.recordId === recordId || recordId.startsWith(conflictPrefix)
  );
}

export function __resetRemoteApplyGrantsForTests(): void {
  grants.clear();
}
