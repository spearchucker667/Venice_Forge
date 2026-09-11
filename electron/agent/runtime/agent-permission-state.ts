/** Main-process ownership for effective Document Agent permission presets. */
import type { WebContents } from "electron";
import type { AgentPermissionPreset } from "../../../src/agent/contracts/capabilities";

const VALID_PRESETS = new Set<AgentPermissionPreset>([
  "off",
  "read_attachments",
  "limited_documents",
  "workspace_with_approval",
  "media_with_approval",
]);

type PermissionRecord = { profileId: string; preset: AgentPermissionPreset };
let state = new WeakMap<WebContents, Map<string, PermissionRecord>>();

function validateAgentSessionId(agentSessionId: string): void {
  if (!/^[a-zA-Z0-9_.-]{1,128}$/.test(agentSessionId)) {
    throw new Error("Invalid agent session id.");
  }
}

export function setEffectiveAgentPermissionPreset(
  sender: WebContents,
  profileId: string,
  agentSessionId: string,
  preset: AgentPermissionPreset,
): AgentPermissionPreset {
  validateAgentSessionId(agentSessionId);
  if (!VALID_PRESETS.has(preset)) throw new Error("Invalid agent permission preset.");
  const senderState = state.get(sender) ?? new Map<string, PermissionRecord>();
  senderState.set(agentSessionId, { profileId, preset });
  state.set(sender, senderState);
  return preset;
}

export function getEffectiveAgentPermissionPreset(
  sender: WebContents,
  profileId: string,
  agentSessionId?: string,
): AgentPermissionPreset {
  if (!agentSessionId) return "off";
  validateAgentSessionId(agentSessionId);
  const record = state.get(sender)?.get(agentSessionId);
  return record?.profileId === profileId ? record.preset : "off";
}

export function __resetAgentPermissionStateForTests(): void {
  state = new WeakMap<WebContents, Map<string, PermissionRecord>>();
}
