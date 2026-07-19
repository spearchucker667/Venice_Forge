import type { Capability, CapabilityGrant } from "../contracts/capabilities";
import { isGrantActive } from "../contracts/capabilities";
import type { InternalToolName } from "../registry/tool-name-map";

export type PolicyDecision =
  | { decision: "allow"; approvalRequired: false }
  | { decision: "allow"; approvalRequired: true; reasons: string[] }
  | { decision: "deny"; code: string; reasons: string[] };

export interface PolicyInput {
  sessionId: string;
  grant: CapabilityGrant;
  toolName: InternalToolName;
  requiredCapability: Capability;
  operationRisk: "read" | "create" | "modify" | "move" | "trash" | "export" | "restore";
  affectedFileCount: number;
  affectedBytes: number;
  overwritesExistingContent: boolean;
  formatLossPossible: boolean;
  sensitiveDocument: boolean;
}

export function decideCapabilityPolicy(input: PolicyInput): PolicyDecision {
  if (!isGrantActive(input.grant, input.sessionId)) {
    return { decision: "deny", code: "GRANT_INACTIVE", reasons: ["The capability grant is absent, expired, or belongs to another session."] };
  }
  if (!input.grant.capabilities.includes(input.requiredCapability)) {
    return { decision: "deny", code: "CAPABILITY_DENIED", reasons: [`Missing ${input.requiredCapability} capability.`] };
  }
  if (input.affectedFileCount < 0 || input.affectedBytes < 0) {
    return { decision: "deny", code: "INVALID_SCOPE", reasons: ["The operation scope is invalid."] };
  }

  const mandatoryApproval = input.operationRisk === "move"
    || input.operationRisk === "trash"
    || input.operationRisk === "export"
    || input.operationRisk === "restore"
    || input.overwritesExistingContent
    || input.formatLossPossible
    || input.sensitiveDocument
    || (input.operationRisk === "modify" && input.grant.preset !== "workspace_autonomous");

  return mandatoryApproval
    ? { decision: "allow", approvalRequired: true, reasons: ["This operation requires an exact-proposal approval."] }
    : { decision: "allow", approvalRequired: false };
}
