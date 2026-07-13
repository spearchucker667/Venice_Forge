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
): boolean {
  if (origin !== "remote-sync") return true;
  if (typeof token !== "string") return false;
  const grant = grants.get(token);
  return grant?.storeName === storeName && (
    grant.recordId === recordId || recordId.startsWith(`${grant.recordId}_conflict_`)
  );
}

export function __resetRemoteApplyGrantsForTests(): void {
  grants.clear();
}
