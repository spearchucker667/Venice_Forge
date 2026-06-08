import {
  type StorageStoreInventoryItem,
  type StorageReferenceIssue,
  type StorageInventoryResult,
  type SafePrivacySummary,
  type StoragePrivacyCategory,
} from "../types/storage-privacy";

export interface StorageInventoryRecord {
  id: string;
  title?: string;
  name?: string;
  projectId?: string | null;
  archivedAt?: string | number | null;
}

export interface BuildStorageInventoryInput {
  projects?: StorageInventoryRecord[];
  conversations?: StorageInventoryRecord[];
  media?: StorageInventoryRecord[];
  prompts?: StorageInventoryRecord[];
  scenes?: StorageInventoryRecord[];
  characters?: StorageInventoryRecord[];
  lorebooks?: StorageInventoryRecord[];
  personas?: StorageInventoryRecord[];
  scenarios?: StorageInventoryRecord[];
  workflows?: StorageInventoryRecord[];
  settings?: { veniceApiKey?: string };
}

const ENCRYPTED_STORES = [
  "chats",
  "settings",
  "images",
  "conversations",
  "ai_memory",
  "files",
  "character_cards",
  "personas",
  "lorebooks",
  "rp_chats",
  "rp_assets",
  "projects",
  "promptLibrary",
  "scenes",
  "rpScenarios",
  "workflowTemplates",
];

export function buildStorageInventory(input: BuildStorageInventoryInput): StorageInventoryResult {
  const stores: StorageStoreInventoryItem[] = [];
  const issues: StorageReferenceIssue[] = [];
  const generatedAt = new Date().toISOString();

  const addStore = (
    id: string,
    label: string,
    category: StoragePrivacyCategory,
    items: StorageInventoryRecord[] | undefined,
    storeName: string,
    containsSecrets: boolean = false,
  ) => {
    const count = items?.length ?? 0;
    const archivedCount = items?.filter((i) => i.archivedAt).length ?? 0;
    const scopedCount = items?.filter((i) => i.projectId).length ?? 0;
    const unscopedCount = count - scopedCount;

    stores.push({
      id,
      label,
      category,
      storeName,
      count,
      scopedCount,
      unscopedCount,
      archivedCount,
      encrypted: ENCRYPTED_STORES.includes(storeName),
      containsSecrets,
      containsUserContent: true,
      exportableInSafeSummary: !containsSecrets,
      severity: "ok",
      summary: `${count} items stored`,
    });
  };

  addStore("projects", "Projects", "projects", input.projects, "projects");
  addStore("conversations", "Conversations", "conversations", input.conversations, "conversations");
  addStore("media", "Media Studio", "media", input.media, "images");
  addStore("prompts", "Prompt Library", "prompts", input.prompts, "promptLibrary");
  addStore("scenes", "Scene Composer", "scenes", input.scenes, "scenes");
  addStore("workflows", "Workflow Templates", "workflows", input.workflows, "workflowTemplates");

  // RP categories
  const rpCount = (input.characters?.length ?? 0) + (input.lorebooks?.length ?? 0) + (input.personas?.length ?? 0) + (input.scenarios?.length ?? 0);
  stores.push({
    id: "rp",
    label: "RP Studio",
    category: "rp",
    count: rpCount,
    encrypted: true,
    containsSecrets: false,
    containsUserContent: true,
    exportableInSafeSummary: true,
    severity: "ok",
    summary: `${rpCount} RP assets (characters, lore, personas, scenarios)`,
  });

  // Settings & API Keys
  const hasVeniceKey = !!input.settings?.veniceApiKey;
  stores.push({
    id: "api_keys",
    label: "API Keys",
    category: "api_keys",
    encrypted: true,
    containsSecrets: true,
    containsUserContent: false,
    exportableInSafeSummary: false,
    severity: hasVeniceKey ? "ok" : "info",
    summary: hasVeniceKey ? "Venice API key present" : "No Venice API key configured",
  });

  // Reference checks
  const projectIds = new Set(input.projects?.map((p) => p.id) || []);

  const checkOrphanProject = (items: StorageInventoryRecord[] | undefined, category: StoragePrivacyCategory) => {
    items?.forEach((item) => {
      if (item.projectId && !projectIds.has(item.projectId)) {
        issues.push({
          id: `orphan-${category}-${item.id}`,
          severity: "warn",
          sourceCategory: category,
          sourceId: item.id,
          targetCategory: "projects",
          targetId: item.projectId,
          message: `${category} item "${item.title || item.name || item.id}" refers to missing project`,
          repairable: true,
        });
      }
    });
  };

  checkOrphanProject(input.prompts, "prompts");
  checkOrphanProject(input.scenes, "scenes");
  checkOrphanProject(input.workflows, "workflows");
  checkOrphanProject(input.media, "media");

  return { stores, issues, generatedAt };
}

export function buildSafePrivacySummary(inventory: StorageInventoryResult): SafePrivacySummary {
  const counts: Record<string, number> = {};
  inventory.stores.forEach((s: StorageStoreInventoryItem) => {
    if (s.count !== undefined) counts[s.category] = (counts[s.category] || 0) + s.count;
  });

  const exclusions = inventory.stores
    .filter((s: StorageStoreInventoryItem) => !s.exportableInSafeSummary || s.containsSecrets)
    .map((s: StorageStoreInventoryItem) => s.label);

  // Add generic exclusions
  exclusions.push("Raw Prompt Content");
  exclusions.push("Conversation History");
  exclusions.push("Media Blobs / Local Paths");

  return {
    version: 1,
    generatedAt: inventory.generatedAt,
    app: "Venice Forge",
    stores: inventory.stores.filter((s: StorageStoreInventoryItem) => s.exportableInSafeSummary),
    counts,
    issues: inventory.issues,
    exclusions,
  };
}
