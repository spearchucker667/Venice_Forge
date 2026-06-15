/** @fileoverview Phase 2D — Prompt Library Zustand store.
 *
 * Holds the user's saved prompts as a flat list keyed by id. All
 * mutations go through this store; persistence (IndexedDB) is driven
 * by `ensureLoaded` / `persistAll`. The store is the single source of
 * truth for the Prompt Library UI, the Command Palette's prompt
 * commands, and the "Save to Prompt Library" / "Use Prompt" actions
 * on existing surfaces.
 *
 * Versioning model:
 *  - Every prompt starts with version 1.
 *  - Adding a new version creates `versions[N+1]` and points
 *    `currentVersionId` at it. Old versions remain readable.
 *  - The user can switch `currentVersionId` at any time.
 *
 * Safety:
 *  - All inbound data flows through `sanitizePromptLibraryItem` so
 *    secrets, invalid kinds, and over-long fields are dropped at the
 *    boundary.
 *  - The store never returns raw stored records to the UI without
 *    re-validating through the sanitiser.
 *  - The import path regenerates ids so the user can re-import the
 *    same export without collision.
 *  - Persistence errors are redacted before they reach UI-facing state
 *    or import result metadata (T-192 / store-level error handling).
 */

import { create } from "zustand";
import {
  createPromptLibraryItem,
  createPromptVersion,
  exportPromptLibraryItems,
  getCurrentPromptVersion,
  parsePromptLibraryImport,
  sanitizePromptLibraryItem,
  type CreatePromptLibraryItemInput,
  type PromptKind,
  type PromptLibraryExport,
  type PromptLibraryImportResult,
  type PromptLibraryItem,
  type PromptScope,
  type PromptSourceType,
  type PromptVersion,
} from "../types/prompt-library";
import { useProjectStore } from "./project-store";
import { useSettingsStore } from "./settings-store";
import { useAuthStore } from "./auth-store";
import StorageService from "../services/storageService";
import { redactErrorMessage } from "../shared/redaction";

export interface PromptLibraryState {
  prompts: PromptLibraryItem[];
  activePromptId: string | null;
  hydrated: boolean;
  loading: boolean;
  loadError: string | null;

  ensureLoaded: () => Promise<void>;
  reloadFromStorage: () => Promise<void>;

  createPrompt: (
    input: CreatePromptLibraryItemInput,
  ) => Promise<PromptLibraryItem>;
  updatePrompt: (
    promptId: string,
    patch: Partial<Omit<PromptLibraryItem, "id" | "versions" | "currentVersionId" | "createdAt">>,
  ) => Promise<void>;
  addPromptVersion: (
    promptId: string,
    input: {
      title?: string;
      content: string;
      negativeContent?: string;
      notes?: string;
      sourceType?: PromptSourceType;
      sourceId?: string;
    },
  ) => Promise<PromptVersion>;
  setCurrentVersion: (promptId: string, versionId: string) => Promise<void>;
  setActivePrompt: (promptId: string | null) => void;

  archivePrompt: (promptId: string) => Promise<void>;
  unarchivePrompt: (promptId: string) => Promise<void>;
  deletePrompt: (promptId: string) => Promise<void>;
  toggleFavorite: (promptId: string) => Promise<void>;

  getPrompt: (promptId: string) => PromptLibraryItem | null;
  getCurrentVersion: (promptId: string) => PromptVersion | null;

  importPrompts: (payload: unknown) => Promise<PromptLibraryImportResult>;
  exportPrompts: (promptIds: string[]) => PromptLibraryExport;
}

function nowIso(): string {
  return new Date().toISOString();
}

function dedupeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = (raw ?? "").toString().trim().toLowerCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

async function persistOne(prompt: PromptLibraryItem): Promise<void> {
  await StorageService.saveItem("promptLibrary", prompt as unknown as Record<string, unknown>);
}

async function deleteOne(promptId: string): Promise<void> {
  await StorageService.deleteItem("promptLibrary", promptId);
}

export const usePromptLibraryStore = create<PromptLibraryState>((set, get) => ({
  prompts: [],
  activePromptId: null,
  hydrated: false,
  loading: false,
  loadError: null,

  ensureLoaded: async () => {
    if (get().hydrated || get().loading) return;
    set({ loading: true, loadError: null });
    try {
      const raw = await StorageService.getItems<PromptLibraryItem>("promptLibrary");
      const now = nowIso();
      const valid: PromptLibraryItem[] = [];
      for (const item of raw) {
        const sanitized = sanitizePromptLibraryItem(item, { now });
        if (sanitized) valid.push(sanitized);
      }
      // Stable order: favorites first, then by updatedAt desc.
      valid.sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      });
      set({ prompts: valid, hydrated: true, loading: false, loadError: null });
    } catch (err) {
      set({
        loading: false,
        loadError: redactErrorMessage(err),
        hydrated: true,
      });
    }
  },

  reloadFromStorage: async () => {
    set({ hydrated: false, loading: false });
    await get().ensureLoaded();
  },

  createPrompt: async (input) => {
    const now = nowIso();
    const scope: PromptScope = input.scope ?? "global";
    const projectId =
      scope === "project"
        ? input.projectId ??
          useSettingsStore.getState().activeProjectId ??
          null
        : null;
    const item = createPromptLibraryItem(
      {
        ...input,
        scope,
        projectId,
        tags: dedupeTags(input.tags ?? []),
      },
      now,
    );
    set((s) => ({ prompts: [item, ...s.prompts], activePromptId: item.id }));
    try {
      await persistOne(item);
    } catch (err) {
      // Roll back on persistence failure so the UI does not show a
      // record that does not exist in storage.
      set((s) => ({
        prompts: s.prompts.filter((p) => p.id !== item.id),
        activePromptId: s.activePromptId === item.id ? null : s.activePromptId,
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
    return item;
  },

  updatePrompt: async (promptId, patch) => {
    const current = get().prompts.find((p) => p.id === promptId);
    if (!current) return;
    const next: PromptLibraryItem = {
      ...current,
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
      kind: (patch.kind as PromptKind | undefined) ?? current.kind,
      tags: dedupeTags(patch.tags ?? current.tags),
      favorite: patch.favorite ?? current.favorite,
      archivedAt: patch.archivedAt === undefined ? current.archivedAt : patch.archivedAt,
      modelHints: patch.modelHints ?? current.modelHints,
      updatedAt: nowIso(),
    };
    set((s) => ({
      prompts: s.prompts.map((p) => (p.id === promptId ? next : p)),
    }));
    try {
      await persistOne(next);
    } catch (err) {
      set((s) => ({
        prompts: s.prompts.map((p) => (p.id === promptId ? current : p)),
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
  },

  addPromptVersion: async (promptId, input) => {
    const current = get().prompts.find((p) => p.id === promptId);
    if (!current) {
      throw new Error(`Prompt not found: ${promptId}`);
    }
    const lastVersion = current.versions[current.versions.length - 1];
    const nextNumber = (lastVersion?.version ?? 0) + 1;
    const now = nowIso();
    const version = createPromptVersion(
      {
        promptId,
        version: nextNumber,
        title: input.title ?? current.title,
        content: input.content,
        negativeContent: input.negativeContent,
        notes: input.notes,
        source:
          input.sourceType
            ? { type: input.sourceType, sourceId: input.sourceId }
            : undefined,
      },
      now,
    );
    const next: PromptLibraryItem = {
      ...current,
      currentVersionId: version.id,
      versions: [...current.versions, version],
      updatedAt: now,
    };
    set((s) => ({
      prompts: s.prompts.map((p) => (p.id === promptId ? next : p)),
    }));
    try {
      await persistOne(next);
    } catch (err) {
      set((s) => ({
        prompts: s.prompts.map((p) => (p.id === promptId ? current : p)),
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
    return version;
  },

  setCurrentVersion: async (promptId, versionId) => {
    const current = get().prompts.find((p) => p.id === promptId);
    if (!current) return;
    if (!current.versions.some((v) => v.id === versionId)) return;
    if (current.currentVersionId === versionId) return;
    const next: PromptLibraryItem = {
      ...current,
      currentVersionId: versionId,
      updatedAt: nowIso(),
    };
    set((s) => ({
      prompts: s.prompts.map((p) => (p.id === promptId ? next : p)),
    }));
    try {
      await persistOne(next);
    } catch (err) {
      set((s) => ({
        prompts: s.prompts.map((p) => (p.id === promptId ? current : p)),
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
  },

  setActivePrompt: (promptId) => set({ activePromptId: promptId }),

  archivePrompt: async (promptId) => {
    const now = nowIso();
    const current = get().prompts.find((p) => p.id === promptId);
    if (!current) return;
    const next: PromptLibraryItem = {
      ...current,
      archivedAt: now,
      updatedAt: now,
    };
    set((s) => ({
      prompts: s.prompts.map((p) => (p.id === promptId ? next : p)),
    }));
    try {
      await persistOne(next);
    } catch (err) {
      set((s) => ({
        prompts: s.prompts.map((p) => (p.id === promptId ? current : p)),
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
  },

  unarchivePrompt: async (promptId) => {
    const current = get().prompts.find((p) => p.id === promptId);
    if (!current) return;
    const next: PromptLibraryItem = {
      ...current,
      archivedAt: null,
      updatedAt: nowIso(),
    };
    set((s) => ({
      prompts: s.prompts.map((p) => (p.id === promptId ? next : p)),
    }));
    try {
      await persistOne(next);
    } catch (err) {
      set((s) => ({
        prompts: s.prompts.map((p) => (p.id === promptId ? current : p)),
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
  },

  deletePrompt: async (promptId) => {
    const current = get().prompts.find((p) => p.id === promptId);
    if (!current) return;
    set((s) => ({
      prompts: s.prompts.filter((p) => p.id !== promptId),
      activePromptId: s.activePromptId === promptId ? null : s.activePromptId,
    }));
    try {
      await deleteOne(promptId);
    } catch (err) {
      set((s) => ({
        prompts: [current, ...s.prompts.filter((p) => p.id !== promptId)],
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
  },

  toggleFavorite: async (promptId) => {
    const current = get().prompts.find((p) => p.id === promptId);
    if (!current) return;
    const next: PromptLibraryItem = {
      ...current,
      favorite: !current.favorite,
      updatedAt: nowIso(),
    };
    set((s) => ({
      prompts: s.prompts.map((p) => (p.id === promptId ? next : p)),
    }));
    try {
      await persistOne(next);
    } catch (err) {
      set((s) => ({
        prompts: s.prompts.map((p) => (p.id === promptId ? current : p)),
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
  },

  getPrompt: (promptId) => get().prompts.find((p) => p.id === promptId) ?? null,
  getCurrentVersion: (promptId) => {
    const item = get().prompts.find((p) => p.id === promptId);
    return getCurrentPromptVersion(item ?? null);
  },

  importPrompts: async (payload) => {
    const now = nowIso();
    const result = parsePromptLibraryImport(payload, now);
    // Persist imported items + merge into store (rejected-by-sanitiser
    // items are already filtered out of result.imported).
    for (const fresh of result.imported) {
      try {
        await persistOne(fresh);
      } catch (err) {
        result.skipped.push({
          reason: `Persistence failed: ${redactErrorMessage(err)}`,
          title: fresh.title,
        });
        continue;
      }
      set((s) => {
        if (s.prompts.some((p) => p.id === fresh.id)) return s;
        return { prompts: [fresh, ...s.prompts] };
      });
    }
    return result;
  },

  exportPrompts: (promptIds) => {
    const items = get().prompts.filter((p) => promptIds.includes(p.id));
    return exportPromptLibraryItems(items);
  },
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** All non-archived prompts (for the main library list). */
export function selectActivePrompts(state: PromptLibraryState): PromptLibraryItem[] {
  return state.prompts.filter((p) => p.archivedAt === null);
}

/** All archived prompts (shown only in the Archive filter). */
export function selectArchivedPrompts(state: PromptLibraryState): PromptLibraryItem[] {
  return state.prompts.filter((p) => p.archivedAt !== null);
}

/** Prompts visible in a given project context (project + global, plus All Projects). */
export function selectPromptsForProject(
  state: PromptLibraryState,
  activeProjectId: string | null,
): PromptLibraryItem[] {
  return state.prompts.filter((p) => {
    if (p.archivedAt !== null) return false;
    if (p.scope === "global") return true;
    return activeProjectId !== null && p.projectId === activeProjectId;
  });
}

/**
 * Resolve the active project for a new prompt. Order:
 *   1. The explicit `projectId` argument (when scope is "project")
 *   2. `useSettingsStore.activeProjectId`
 *   3. The first non-archived project in `useProjectStore.projects`
 *   4. `null` (caller must treat null as "global")
 */
export function resolvePromptProjectId(explicit: string | null | undefined): string | null {
  if (explicit) return explicit;
  const fromSettings = useSettingsStore.getState().activeProjectId;
  if (fromSettings) return fromSettings;
  const projects = useProjectStore.getState().projects ?? [];
  const first = projects.find((p) => p.archivedAt === null || p.archivedAt === undefined);
  return first?.id ?? null;
}

// Re-export types so consumers can `import { PromptLibraryItem } from .../prompt-library-store`.
export type {
  PromptKind,
  PromptScope,
  PromptVersion,
  PromptLibraryItem,
  PromptLibraryExport,
  PromptLibraryImportResult,
  PromptSourceType,
  CreatePromptLibraryItemInput,
};

// Convenience: re-export the auth-check helper for components that
// want to gate save/apply actions on a configured Venice key.
export { useAuthStore };
