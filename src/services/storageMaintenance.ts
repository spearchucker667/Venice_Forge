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
  /**
   * Set to true when the action was surfaced as a dry-run-only option and
   * the apply call intentionally rejected it. Callers should not surface a
   * generic error toast — this is an expected, recoverable failure mode
   * for actions that are listed in the plan but are not user-executable.
   */
  dryRunOnly?: boolean;
  /**
   * Stable reason code for typed consumers. Always mirrors the
   * `failed[i].reason` text but is easier to assert against.
   */
  reasonCode?:
    | "dry-run-only"
    | "not-implemented"
    | "error";
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
        label: "Analyze Orphan References",
        description: "Review items that refer to missing projects. No records are changed.",
        destructive: false,
        requiresConfirmation: false,
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
                    result.reasonCode = "error";
                }
                break;
            }
            case "refresh-inventory":
                // Handled by UI/Store
                result.succeeded.push("refresh");
                break;
            case "archive-orphans":
                // The plan advertises this action as `dryRunOnly: true`. It is
                // surfaced in the UI for visibility but is intentionally not
                // executable yet (orphan-archival semantics across prompts,
                // scenes, workflows, and media are still being finalized).
                // Return a typed rejection so callers can render a stable
                // message instead of a generic "not implemented" error.
                result.failed.push({
                    id: actionId,
                    reason: "This action is dry-run-only and is not currently executable. Use the maintenance issues list for analysis.",
                });
                result.dryRunOnly = true;
                result.reasonCode = "dry-run-only";
                break;
            default:
                result.failed.push({ id: actionId, reason: "Action not implemented or supported in this version." });
                result.reasonCode = "not-implemented";
        }
    } catch (err) {
        result.failed.push({ id: actionId, reason: err instanceof Error ? err.message : String(err) });
        result.reasonCode = "error";
    }

    return result;
}
