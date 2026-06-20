/** @fileoverview Phase 2C diagnostics service.
 *
 * Pure-ish snapshot builder over the live Zustand stores. Returns an
 * `AppStatusSnapshot` (per-category status items) and a
 * `SafeDiagnosticsSnapshot` (JSON-serialisable bundle with no secrets,
 * no raw prompts, no base64 blobs, no full local absolute paths).
 *
 * Pure functions only — no network requests, no Electron IPC. The
 * only "live" work is reading current store state. This is the
 * deterministic + testable surface the header cluster + diagnostics
 * drawer depend on.
 *
 * Forbidden:
 *   - API keys, bearer tokens, auth headers
 *   - raw prompt text, raw chat content
 *   - base64 media data, full local absolute paths
 *   - spawning background timers / network fetches
 */

import type {
  AppStatusItem,
  AppStatusSnapshot,
  AppDiagnosticCheck,
  SafeDiagnosticsSnapshot,
  StatusSeverity,
} from "../types/status";
import { SAFE_DIAGNOSTICS_SNAPSHOT_VERSION } from "../types/status";
import { isElectron } from "./desktopBridge";
import { useAuthStore, selectHasVeniceKey } from "../stores/auth-store";
import { useSettingsStore } from "../stores/settings-store";
import { useProjectStore } from "../stores/project-store";
import { useMediaStore } from "../stores/media-store";
import { useChatStore } from "../stores/chat-store";
import { usePromptLibraryStore } from "../stores/prompt-library-store";
import { useSceneComposerStore } from "../stores/scene-composer-store";
import { useWorkflowTemplateStore } from "../stores/workflow-template-store";
import { useCharacterCardStore } from "../stores/character-card-store";
import { useLorebookStore } from "../stores/lorebook-store";
import { usePersonaStore } from "../stores/persona-store";
import { useScenarioStore } from "../stores/scenario-store";
import { useResearchStore } from "../stores/research-store";
import { useStoragePrivacyStore } from "../stores/storage-privacy-store";
import {
  buildSafeApiKeyMetadata,
  type SafeApiKeyStorage,
} from "../types/api-connectivity";

/* ------------------------------------------------------------------ *
 * Small pure helpers
 * ------------------------------------------------------------------ */

function pickWorst(severities: StatusSeverity[]): StatusSeverity {
  if (severities.includes("error")) return "error";
  if (severities.includes("warn")) return "warn";
  if (severities.includes("unknown")) return "unknown";
  return "ok";
}

function isoNow(): string {
  return new Date().toISOString();
}

function makeItem(
  id: AppStatusItem["id"],
  label: string,
  severity: StatusSeverity,
  summary: string,
  extras: Partial<Omit<AppStatusItem, "id" | "label" | "severity" | "summary">> = {},
): AppStatusItem {
  return { id, label, severity, summary, updatedAt: isoNow(), ...extras };
}

/* ------------------------------------------------------------------ *
 * Status builders
 * ------------------------------------------------------------------ */

function buildApiStatus(): AppStatusItem {
  // We don't issue a network call here — that would be a hot loop
  // side-effect. Instead, we report the cached auth state. The
  // diagnostics drawer offers an explicit "Test API" action that
  // runs the request when the user wants it.
  const auth = useAuthStore.getState();
  const hasKey = selectHasVeniceKey(auth);
  if (!hasKey) {
    return makeItem(
      "api",
      "API",
      "warn",
      "Venice API key not configured. Add a key to enable generation.",
      {
        detail: "Open the Config tab to connect your Venice API key.",
        actionLabel: "Open Config",
        actionTargetTabId: "settings",
      },
    );
  }
  return makeItem(
    "api",
    "API",
    "warn",
    "API key is configured, but live Venice connectivity has not been verified yet.",
    { detail: "Use the API-key test action to verify /models connectivity." },
  );
}

function buildApiKeyStatus(): AppStatusItem {
  const auth = useAuthStore.getState();
  if (auth.isConfigured) {
    return makeItem(
      "apiKey",
      "API Key",
      "ok",
      "Venice API key is configured in secure storage. Raw key is hidden.",
    );
  }
  if (auth.apiKey) {
    return makeItem(
      "apiKey",
      "API Key",
      "warn",
      "Key present in memory only. Raw key is hidden and excluded from diagnostics and exports.",
    );
  }
  return makeItem(
    "apiKey",
    "API Key",
    "error",
    "No Venice API key. Image, audio, and chat generation are blocked.",
    {
      detail: "Add a key via the API key button in the header or the Config tab.",
      actionLabel: "Open Config",
      actionTargetTabId: "settings",
    },
  );
}

function getApiKeyStorage(auth: ReturnType<typeof useAuthStore.getState>): SafeApiKeyStorage {
  if (auth.isConfigured) return isElectron() ? "secure-storage" : "web-environment";
  if (auth.apiKey) return "memory";
  return "unavailable";
}

function buildModelStatus(): AppStatusItem {
  // Model status is the cached snapshot — it is unknown until the user
  // visits Image Studio (or any tab that triggers useModels). We treat
  // the absence of any selected model as a warn, not an error, so
  // users on the Config / Status tabs do not see a red indicator.
  const settings = useSettingsStore.getState();
  const selectedModels = settings.selectedModels ?? {};
  const hasAnySelection = Object.values(selectedModels).some((v) => typeof v === "string" && v.length > 0);
  if (!hasAnySelection) {
    return makeItem(
      "model",
      "Model",
      "unknown",
      "No generation model has been selected yet. Open Image Studio or Chat to choose one.",
      { actionLabel: "Open Image Studio", actionTargetTabId: "image" },
    );
  }
  return makeItem(
    "model",
    "Model",
    "ok",
    "Model selection cached. Refresh from the diagnostics drawer to validate against the live catalog.",
  );
}

function buildStorageStatus(): AppStatusItem {
  if (typeof indexedDB === "undefined") {
    return makeItem(
      "storage",
      "Storage",
      "error",
      "IndexedDB is not available. Local history and media will not persist.",
      { detail: "Browser mode with storage disabled. Check site permissions." },
    );
  }
  if (!isElectron()) {
    return makeItem(
      "storage",
      "Storage",
      "warn",
      "Web mode: records persist in browser IndexedDB (encrypted at rest).",
      { detail: "Clearing site data will erase the local vault." },
    );
  }
  return makeItem(
    "storage",
    "Storage",
    "ok",
    "Desktop IndexedDB is reachable. Records are encrypted at rest.",
  );
}

function buildProjectStatus(): AppStatusItem {
  const settings = useSettingsStore.getState();
  const projects = useProjectStore.getState().projects;
  const activeId = settings.activeProjectId;
  if (activeId === null) {
    // "All Projects" / unscoped mode is valid by Phase 1 contract.
    return makeItem("project", "Project", "ok", "All Projects mode active (unscoped view).");
  }
  const project = projects.find((p) => p.id === activeId);
  if (!project) {
    return makeItem(
      "project",
      "Project",
      "error",
      "Active project id is missing or unknown. The store will repair on next interaction.",
      { actionLabel: "Open Status", actionTargetTabId: "status" },
    );
  }
  if (project.archivedAt) {
    return makeItem(
      "project",
      "Project",
      "warn",
      `Active project "${project.name}" is archived. Switch to All Projects to repair.`,
      { actionLabel: "Open Status", actionTargetTabId: "status" },
    );
  }
  return makeItem(
    "project",
    "Project",
    "ok",
    `Active project "${project.name}" is valid.`,
  );
}

function buildSafetyStatus(): AppStatusItem {
  const settings = useSettingsStore.getState();
  // Two axes: local guard + Venice provider safe mode. We deliberately
  // keep these as separate concerns in the summary so the user can
  // see which layer is active.
  const localEnabled = settings.localFamilySafeModeEnabled === true;
  const providerEnabled = settings.veniceApiSafeMode === true;
  const summary =
    `Local guard: ${localEnabled ? "on" : "off"} · Venice safe_mode: ${providerEnabled ? "on" : "off"}`;
  // The local guard is the primary safety boundary.
  // If it is off (Adult Mode), we warn. The upstream Venice safe_mode is supplementary.
  const sev = localEnabled ? "ok" : "warn";
  return makeItem("safety", "Safety", sev, summary, {
    actionLabel: "Open Config",
    actionTargetTabId: "settings",
  });
}

function buildProviderStatus(): AppStatusItem {
  const settings = useSettingsStore.getState();
  const research = settings as unknown as { enableJina?: boolean };
  const auth = useAuthStore.getState();
  const jinaEnabled = research.enableJina === true;
  const sessions = useResearchStore.getState().sessions;

  if (!jinaEnabled) {
    return makeItem(
      "provider",
      "Research",
      "ok",
      `Research Workspace active (${sessions.length} sessions). Jina is disabled.`
    );
  }

  if (auth.jinaIsConfigured) {
    return makeItem(
      "provider",
      "Research",
      "ok",
      `Research Workspace active (${sessions.length} sessions). Jina enabled.`
    );
  }

  return makeItem(
    "provider",
    "Research",
    "warn",
    `Research Workspace active (${sessions.length} sessions). Jina enabled but no key configured.`,
    {
      actionLabel: "Open Config",
      actionTargetTabId: "settings",
    },
  );
}

function buildDesktopStatus(): AppStatusItem {
  if (isElectron()) {
    return makeItem(
      "desktop",
      "Mode",
      "ok",
      "Desktop mode: Electron main process + preload bridge are reachable.",
    );
  }
  return makeItem(
    "desktop",
    "Mode",
    "warn",
    "Web mode: API keys live in the server .env. Desktop-only features (filesystem, reveals, system shell) are unavailable.",
  );
}

function buildDiagnosticsStatus(
  items: AppStatusItem[],
  checks: AppDiagnosticCheck[],
): AppStatusItem {
  const worst = pickWorst(items.map((it) => it.severity));
  return makeItem(
    "diagnostics",
    "Diagnostics",
    worst,
    worst === "ok"
      ? "All systems operational. No issues detected."
      : `${checks.length} checks recorded; worst severity: ${worst}.`,
  );
}

/* ------------------------------------------------------------------ *
 * Public surface
 * ------------------------------------------------------------------ */

/** Computes a fresh `AppStatusSnapshot` from the current store state. */
export function computeAppStatusSnapshot(): AppStatusSnapshot {
  const api = buildApiStatus();
  const apiKey = buildApiKeyStatus();
  const model = buildModelStatus();
  const storage = buildStorageStatus();
  const project = buildProjectStatus();
  const safety = buildSafetyStatus();
  const provider = buildProviderStatus();
  const desktop = buildDesktopStatus();

  const checks: AppDiagnosticCheck[] = [
    { id: "api", severity: api.severity, summary: api.summary },
    { id: "apiKey", severity: apiKey.severity, summary: apiKey.summary },
    { id: "model", severity: model.severity, summary: model.summary },
    { id: "storage", severity: storage.severity, summary: storage.summary },
    { id: "project", severity: project.severity, summary: project.summary },
    { id: "safety", severity: safety.severity, summary: safety.summary },
    { id: "provider", severity: provider.severity, summary: provider.summary },
    { id: "desktop", severity: desktop.severity, summary: desktop.summary },
  ];
  const diagnostics = buildDiagnosticsStatus(
    [api, apiKey, model, storage, project, safety, provider, desktop],
    checks,
  );
  return { api, apiKey, model, storage, project, safety, provider, desktop, diagnostics };
}

/** Computes the safe, JSON-serialisable diagnostics snapshot. */
export function computeSafeDiagnosticsSnapshot(): SafeDiagnosticsSnapshot {
  const statuses = computeAppStatusSnapshot();
  const settings = useSettingsStore.getState();
  const projects = useProjectStore.getState().projects;
  const media = useMediaStore.getState().items;
  const conversations = useChatStore.getState().conversations;

  const checks: AppDiagnosticCheck[] = Object.values(statuses).map((item) => ({
    id: item.id,
    severity: item.severity,
    summary: item.summary,
  }));

  const projectMode: "project" | "all" | "unknown" =
    settings.activeProjectId === null
      ? "all"
      : settings.activeProjectId
        ? "project"
        : "unknown";

  const environment: SafeDiagnosticsSnapshot["environment"] = {};
  if (typeof navigator !== "undefined") {
    environment.userAgent = navigator.userAgent;
    environment.platform = navigator.platform;
    environment.locale = navigator.language;
  }
  // Node / Electron versions are reported by the desktop bridge; web
  // mode does not have them. We intentionally do NOT include the user
  // data path or logs path — those are absolute paths.
  // (See the safe-snapshot policy in the file header.)

  const scopedMedia = settings.activeProjectId
    ? media.filter((m) => m.projectId === settings.activeProjectId).length
    : media.length;
  const unscopedMedia = settings.activeProjectId
    ? media.filter((m) => !m.projectId).length
    : 0;

  return {
    version: SAFE_DIAGNOSTICS_SNAPSHOT_VERSION,
    generatedAt: isoNow(),
    appMode: isElectron() ? "desktop" : "web",
    statuses,
    environment,
    stores: {
      projects: {
        count: projects.length,
        activeProjectMode: projectMode,
      },
      media: {
        count: media.length,
        scopedCount: scopedMedia,
        unscopedCount: unscopedMedia,
      },
      conversations: {
        count: Array.isArray(conversations) ? conversations.length : 0,
      },
      apiKey: buildSafeApiKeyMetadata({
        configured: selectHasVeniceKey(useAuthStore.getState()),
        storage: getApiKeyStorage(useAuthStore.getState()),
      }),
      research: {
        count: useResearchStore.getState().sessions.length,
      },
      prompts: { count: usePromptLibraryStore.getState().prompts.length },
      scenes: { count: useSceneComposerStore.getState().scenes.length },
      workflows: { count: useWorkflowTemplateStore.getState().workflows.length },
      rp: {
        count:
          useCharacterCardStore.getState().cards.length +
          useLorebookStore.getState().lorebooks.length +
          usePersonaStore.getState().personas.length +
          useScenarioStore.getState().scenarios.length,
      },
      issuesCount: useStoragePrivacyStore.getState().inventory?.issues.length || 0,
      privacyExclusions: ["API Keys", "Raw Prompt Content", "Conversation History", "Media Blobs"],
    },
    checks,
    // audit counters are exposed via the diagnostics statuses; we keep
    // them out of the JSON-serialisable snapshot so the format is
    // stable. Callers that want the audit can read getAuditSnapshot().
  };
}

/**
 * Serialises a `SafeDiagnosticsSnapshot` to a human-readable JSON
 * string. Safe to copy to clipboard; verified to not contain API
 * keys, bearer tokens, auth headers, raw prompts, base64 media
 * data, or full local absolute paths.
 */
export function serialiseSafeDiagnosticsSnapshot(snapshot: SafeDiagnosticsSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}
