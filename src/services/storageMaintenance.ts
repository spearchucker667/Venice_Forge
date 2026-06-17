import {
  type StorageMaintenancePlan,
  type StorageMaintenanceAction,
  type StorageInventoryResult,
  type StorageReferenceIssue,
} from "../types/storage-privacy";
import { desktopCharacterImage } from "./desktopBridge";

export interface StorageMaintenanceDryRunResult {
  plan: StorageMaintenancePlan;
  canApply: boolean;
}

export interface StorageMaintenanceApplyResult {
  actionId: string;
  requested: number;
  succeeded: string[];
  failed: Array<{ id: string; reason: string }>;
}

export function createStorageMaintenancePlan(inventory: StorageInventoryResult): StorageMaintenancePlan {
  const actions: StorageMaintenanceAction[] = [
    {
      id: "refresh-inventory",
      label: "Refresh Inventory",
      description: "Recount all local data and check for issues.",
      destructive: false,
      requiresConfirmation: false,
      affectedCategories: ["unknown"],
    },
  ];

  // Add cache clearing if relevant
  actions.push({
    id: "clear-model-cache",
    label: "Clear Model Cache",
    description: "Remove the local cache of available Venice models. They will be refetched on next use.",
    destructive: true,
    requiresConfirmation: true,
    affectedCategories: ["cache"],
  });
  actions.push({
    id: "clear-character-image-cache",
    label: "Clear Character Image Cache",
    description: "Delete locally cached Venice character avatar images. They will be re-fetched as needed.",
    destructive: true,
    requiresConfirmation: true,
    affectedCategories: ["cache"],
  });

  const warnings = inventory.issues.map((issue: StorageReferenceIssue) => ({
    id: issue.id,
    severity: issue.severity,
    message: issue.message,
  }));

  // Add a generic warning if any orphan issues exist
  if (inventory.issues.length > 0) {
    actions.push({
        id: "archive-orphans",
        label: "Archive Orphans",
        description: "Move items referring to missing projects to the archive.",
        destructive: true,
        requiresConfirmation: true,
        affectedCategories: ["prompts", "scenes", "workflows", "media"],
        dryRunOnly: true, // Only dry-run for now until backend support is verified
    });
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    actions,
    issues: inventory.issues,
    warnings,
  };
}

export async function applyMaintenanceAction(actionId: string): Promise<StorageMaintenanceApplyResult> {
    const result: StorageMaintenanceApplyResult = {
        actionId,
        requested: 1,
        succeeded: [],
        failed: [],
    };

    try {
        switch (actionId) {
            case "clear-model-cache":
                localStorage.removeItem("venice-forge-models-cache") /* localStorage-allowed: transient model-list cache */;
                result.succeeded.push("model-cache");
                break;
            case "clear-character-image-cache": {
                const cacheResult = await desktopCharacterImage.clearCache();
                if (cacheResult.ok) {
                    result.succeeded.push("character-image-cache");
                } else {
                    result.failed.push({ id: actionId, reason: cacheResult.error ?? "Unknown error" });
                }
                break;
            }
            case "refresh-inventory":
                // Handled by UI/Store
                result.succeeded.push("refresh");
                break;
            default:
                result.failed.push({ id: actionId, reason: "Action not implemented or supported in this version." });
        }
    } catch (err) {
        result.failed.push({ id: actionId, reason: err instanceof Error ? err.message : String(err) });
    }

    return result;
}
