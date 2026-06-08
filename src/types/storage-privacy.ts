export type StoragePrivacySeverity = "ok" | "info" | "warn" | "error";

export type StoragePrivacyCategory =
  | "projects"
  | "conversations"
  | "media"
  | "prompts"
  | "scenes"
  | "rp"
  | "workflows"
  | "settings"
  | "api_keys"
  | "diagnostics"
  | "cache"
  | "unknown";

export interface StorageStoreInventoryItem {
  id: string;
  label: string;
  category: StoragePrivacyCategory;
  storeName?: string;
  count?: number;
  scopedCount?: number;
  unscopedCount?: number;
  archivedCount?: number;
  encrypted: boolean | "unknown";
  containsSecrets: boolean | "unknown";
  containsUserContent: boolean;
  exportableInSafeSummary: boolean;
  severity: StoragePrivacySeverity;
  summary: string;
  detail?: string;
}

export interface StorageReferenceIssue {
  id: string;
  severity: StoragePrivacySeverity;
  sourceCategory: StoragePrivacyCategory;
  sourceId?: string;
  targetCategory?: StoragePrivacyCategory;
  targetId?: string;
  message: string;
  repairable: boolean;
}

export interface StorageInventoryResult {
  stores: StorageStoreInventoryItem[];
  issues: StorageReferenceIssue[];
  generatedAt: string;
}

export interface StorageMaintenanceAction {
  id: string;
  label: string;
  description: string;
  destructive: boolean;
  requiresConfirmation: boolean;
  dryRunOnly?: boolean;
  affectedCategories: StoragePrivacyCategory[];
}

export interface StorageMaintenancePlan {
  version: 1;
  generatedAt: string;
  actions: StorageMaintenanceAction[];
  issues: StorageReferenceIssue[];
  warnings: Array<{
    id: string;
    severity: StoragePrivacySeverity;
    message: string;
  }>;
}

export interface SafePrivacySummary {
  version: 1;
  generatedAt: string;
  app: "Venice Forge";
  stores: StorageStoreInventoryItem[];
  counts: Record<string, number>;
  issues: StorageReferenceIssue[];
  exclusions: string[];
}
