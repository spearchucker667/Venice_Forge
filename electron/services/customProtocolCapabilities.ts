/** App-lifetime custom-protocol capability-token manager. */
import {
  createCustomProtocolCapabilityManager,
  type CustomProtocolCapabilityManager,
} from "../utils/customProtocolAccess";

let manager: CustomProtocolCapabilityManager | null = null;

export function getCustomProtocolCapabilityManager(): CustomProtocolCapabilityManager {
  if (!manager) manager = createCustomProtocolCapabilityManager();
  return manager;
}

export function resetCustomProtocolCapabilityManagerForTests(): void {
  manager?.revokeAll();
  manager = null;
}
