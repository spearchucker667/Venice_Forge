import {
  type StorageStoreInventoryItem,
  type StorageReferenceIssue,
  type StorageInventoryResult,
  type SafePrivacySummary,
  type StoragePrivacyCategory,
} from "../types/storage-privacy";
import {
  buildSafeApiKeyMetadata,
  type ApiKeyValidationStatus,
  type SafeApiKeyMetadata,
  type SafeApiKeyStorage,
} from "../types/api-connectivity";

export interface StorageInventoryRecord {
  id: string;
  title?: string;
  name?: string;
  projectId?: string | null;
  archivedAt?: string | number | null;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
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
  rpChats?: StorageInventoryRecord[];
  workflows?: StorageInventoryRecord[];
  settings?: { veniceApiKey?: string };
  apiKey?: {
    configured: boolean;
    storage: SafeApiKeyStorage;
    lastValidationStatus?: ApiKeyValidationStatus;
    lastValidationAt?: string | null;
  };
  characterImageCache?: { count: number; totalBytes: number };
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
  "chat_folders",
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
  const rpCount = (input.characters?.length ?? 0) + (input.lorebooks?.length ?? 0) + (input.personas?.length ?? 0) + (input.scenarios?.length ?? 0) + (input.rpChats?.length ?? 0);
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
  const apiKeyMetadata: SafeApiKeyMetadata = buildSafeApiKeyMetadata(
    input.apiKey ?? {
      configured: !!input.settings?.veniceApiKey,
      storage: input.settings?.veniceApiKey ? "secure-storage" : "unavailable",
    },
  );
  const hasVeniceKey = apiKeyMetadata.configured;
  stores.push({
    id: "api_keys",
    label: "API Keys",
    category: "api_keys",
    encrypted: true,
    containsSecrets: true,
    containsUserContent: false,
    exportableInSafeSummary: false,
    severity: hasVeniceKey ? "ok" : "info",
    summary: hasVeniceKey
      ? `Venice API key configured (${apiKeyMetadata.storage}); raw key hidden`
      : "No Venice API key configured",
    metadata: { apiKey: apiKeyMetadata },
  });

  // Character Image Cache (transient, non-encrypted, no user content)
  if (input.characterImageCache) {
    const { count, totalBytes } = input.characterImageCache;
    stores.push({
      id: "character-image-cache",
      label: "Character Image Cache",
      category: "cache",
      storeName: "character-image-cache",
      count,
      encrypted: false,
      containsSecrets: false,
      containsUserContent: false,
      exportableInSafeSummary: true,
      severity: "ok",
      summary: `${count} image${count === 1 ? "" : "s"} cached (${formatBytes(totalBytes)})`,
    });
  }

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

function sanitizeIssueForSafeSummary(issue: StorageReferenceIssue): StorageReferenceIssue {
  // T-168 / VERIFY-168: safe privacy summaries must not include user titles,
  // names, or other free-text content in issue messages. Keep categories, ids,
  // severity, and repairability so the summary remains actionable without
  // disclosing user content.
  const target = issue.targetCategory ?? "reference";
  return {
    ...issue,
    message: `${issue.sourceCategory} item has a missing ${target} reference`,
  };
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
    issues: inventory.issues.map(sanitizeIssueForSafeSummary),
    exclusions,
    apiKey: (() => {
      const apiStore = inventory.stores.find((s) => s.id === "api_keys");
      const metadata = apiStore?.metadata && typeof apiStore.metadata === "object"
        ? (apiStore.metadata as { apiKey?: SafeApiKeyMetadata }).apiKey
        : undefined;
      return metadata ?? buildSafeApiKeyMetadata({ configured: false, storage: "unavailable" });
    })(),
  };
}
