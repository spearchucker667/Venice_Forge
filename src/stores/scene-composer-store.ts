/** @fileoverview Phase 2E — Scene Composer Zustand store.
 *
 * Holds the user's saved scenes as a flat list keyed by id. All
 * mutations go through this store; persistence (IndexedDB) is driven
 * by `ensureLoaded` / `persistOne`. The store is the single source of
 * truth for the Scene Composer UI, the Command Palette's scene
 * commands, and the "Save as Scene" / "Use Scene" actions on existing
 * surfaces.
 *
 * Versioning model:
 *  - Every scene starts with version 1 (empty components).
 *  - Adding a new version creates `versions[N+1]` and points
 *    `currentVersionId` at it. Old versions remain readable.
 *  - The user can switch `currentVersionId` at any time.
 *
 * Safety:
 *  - All inbound data flows through `sanitizeSceneComposerItem` so
 *    secrets, invalid kinds, and over-long fields are dropped at the
 *    boundary.
 *  - The store never returns raw stored records to the UI without
 *    re-validating through the sanitiser.
 *  - The import path regenerates ids so the user can re-import the
 *    same export without collision.
 */

import { create } from "zustand";
import {
  createSceneComposerItem,
  createSceneVersion,
  exportSceneComposerItems,
  getCurrentSceneVersion,
  parseSceneComposerImport,
  sanitizeSceneComposerItem,
  type CreateSceneComponentInput,
  type CreateSceneComposerItemInput,
  type SceneComposerExport,
  type SceneComposerItem,
  type SceneComponentKind,
  type SceneImportResult,
  type SceneMediaRef,
  type ScenePromptRef,
  type SceneScope,
  type SceneVersion,
} from "../types/scene";
import { useProjectStore } from "./project-store";
import { useSettingsStore } from "./settings-store";
import { useAuthStore } from "./auth-store";
import StorageService from "../services/storageService";
import { redactErrorMessage } from "../shared/redaction";

export interface SceneComposerState {
  scenes: SceneComposerItem[];
  activeSceneId: string | null;
  hydrated: boolean;
  loading: boolean;
  loadError: string | null;

  ensureLoaded: () => Promise<void>;
  reloadFromStorage: () => Promise<void>;

  createScene: (
    input: CreateSceneComposerItemInput,
  ) => Promise<SceneComposerItem>;
  updateScene: (
    sceneId: string,
    patch: Partial<Omit<SceneComposerItem, "id" | "versions" | "currentVersionId" | "createdAt" | "outputMediaIds">>,
  ) => Promise<void>;
  addSceneVersion: (
    sceneId: string,
    input: {
      title?: string;
      components: CreateSceneComponentInput[];
      mediaRefs?: SceneMediaRef[];
      promptRefs?: ScenePromptRef[];
      notes?: string;
      sourceType?: "manual" | "media" | "recipe" | "prompt" | "import";
      sourceId?: string;
    },
  ) => Promise<SceneVersion>;
  setCurrentVersion: (sceneId: string, versionId: string) => Promise<void>;
  setActiveScene: (sceneId: string | null) => void;

  addOutputMedia: (sceneId: string, mediaId: string) => Promise<void>;
  removeOutputMedia: (sceneId: string, mediaId: string) => Promise<void>;

  archiveScene: (sceneId: string) => Promise<void>;
  unarchiveScene: (sceneId: string) => Promise<void>;
  deleteScene: (sceneId: string) => Promise<void>;
  toggleFavorite: (sceneId: string) => Promise<void>;

  getScene: (sceneId: string) => SceneComposerItem | null;
  getCurrentVersion: (sceneId: string) => SceneVersion | null;

  importScenes: (payload: unknown) => Promise<SceneImportResult>;
  exportScenes: (sceneIds: string[]) => SceneComposerExport;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sanitizeForPersist(item: SceneComposerItem): SceneComposerItem {
  const sanitized = sanitizeSceneComposerItem(item, { now: nowIso() });
  if (!sanitized) throw new Error("Scene sanitization failed");
  return sanitized;
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

async function persistOne(scene: SceneComposerItem): Promise<void> {
  await StorageService.saveItem("scenes", scene as unknown as Record<string, unknown>);
}

async function deleteOne(sceneId: string): Promise<void> {
  await StorageService.deleteItem("scenes", sceneId);
}

export const useSceneComposerStore = create<SceneComposerState>((set, get) => ({
  scenes: [],
  activeSceneId: null,
  hydrated: false,
  loading: false,
  loadError: null,

  ensureLoaded: async () => {
    if (get().hydrated || get().loading) return;
    set({ loading: true, loadError: null });
    try {
      const raw = await StorageService.getItems<SceneComposerItem>("scenes");
      const now = nowIso();
      const valid: SceneComposerItem[] = [];
      for (const item of raw) {
        const sanitized = sanitizeSceneComposerItem(item, { now });
        if (sanitized) valid.push(sanitized);
      }
      valid.sort((a, b) => {
        if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
        return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      });
      set({ scenes: valid, hydrated: true, loading: false, loadError: null });
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

  createScene: async (input) => {
    const now = nowIso();
    const scope: SceneScope = input.scope ?? "global";
    const projectId =
      scope === "project"
        ? input.projectId ??
          useSettingsStore.getState().activeProjectId ??
          null
        : null;
    const item = createSceneComposerItem(
      {
        ...input,
        scope,
        projectId,
        tags: dedupeTags(input.tags ?? []),
      },
      now,
    );
    const sanitized = sanitizeForPersist(item);
    set((s) => ({ scenes: [sanitized, ...s.scenes], activeSceneId: sanitized.id }));
    try {
      await persistOne(sanitized);
    } catch (err) {
      set((s) => ({
        scenes: s.scenes.filter((p) => p.id !== sanitized.id),
        activeSceneId: s.activeSceneId === sanitized.id ? null : s.activeSceneId,
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
    return sanitized;
  },

  updateScene: async (sceneId, patch) => {
    const current = get().scenes.find((p) => p.id === sceneId);
    if (!current) return;
    const next: SceneComposerItem = {
      ...current,
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
      scope: (patch.scope as SceneScope | undefined) ?? current.scope,
      tags: dedupeTags(patch.tags ?? current.tags),
      favorite: patch.favorite ?? current.favorite,
      archivedAt: patch.archivedAt === undefined ? current.archivedAt : patch.archivedAt,
      defaultModel: patch.defaultModel ?? current.defaultModel,
      defaultWidth: patch.defaultWidth ?? current.defaultWidth,
      defaultHeight: patch.defaultHeight ?? current.defaultHeight,
      defaultAspectRatio: patch.defaultAspectRatio ?? current.defaultAspectRatio,
      updatedAt: nowIso(),
    };
    const sanitized = sanitizeForPersist(next);
    set((s) => ({
      scenes: s.scenes.map((p) => (p.id === sceneId ? sanitized : p)),
    }));
    try {
      await persistOne(sanitized);
    } catch (err) {
      set((s) => ({
        scenes: s.scenes.map((p) => (p.id === sceneId ? current : p)),
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
  },

  addSceneVersion: async (sceneId, input) => {
    const current = get().scenes.find((p) => p.id === sceneId);
    if (!current) {
      throw new Error(`Scene not found: ${sceneId}`);
    }
    const lastVersion = current.versions[current.versions.length - 1];
    const nextNumber = (lastVersion?.version ?? 0) + 1;
    const now = nowIso();
    const version = createSceneVersion(
      {
        sceneId,
        version: nextNumber,
        title: input.title ?? current.title,
        components: input.components,
        mediaRefs: input.mediaRefs,
        promptRefs: input.promptRefs,
        notes: input.notes,
        source:
          input.sourceType
            ? { type: input.sourceType, sourceId: input.sourceId }
            : undefined,
      },
      now,
    );
    const next: SceneComposerItem = {
      ...current,
      currentVersionId: version.id,
      versions: [...current.versions, version],
      updatedAt: now,
    };
    const sanitized = sanitizeForPersist(next);
    set((s) => ({
      scenes: s.scenes.map((p) => (p.id === sceneId ? sanitized : p)),
    }));
    try {
      await persistOne(sanitized);
    } catch (err) {
      set((s) => ({
        scenes: s.scenes.map((p) => (p.id === sceneId ? current : p)),
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
    return version;
  },

  setCurrentVersion: async (sceneId, versionId) => {
    const current = get().scenes.find((p) => p.id === sceneId);
    if (!current) return;
    if (!current.versions.some((v) => v.id === versionId)) return;
    if (current.currentVersionId === versionId) return;
    const next: SceneComposerItem = {
      ...current,
      currentVersionId: versionId,
      updatedAt: nowIso(),
    };
    const sanitized = sanitizeForPersist(next);
    set((s) => ({
      scenes: s.scenes.map((p) => (p.id === sceneId ? sanitized : p)),
    }));
    try {
      await persistOne(sanitized);
    } catch (err) {
      set((s) => ({
        scenes: s.scenes.map((p) => (p.id === sceneId ? current : p)),
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
  },

  setActiveScene: (sceneId) => set({ activeSceneId: sceneId }),

  addOutputMedia: async (sceneId, mediaId) => {
    const current = get().scenes.find((p) => p.id === sceneId);
    if (!current) return;
    if (current.outputMediaIds.includes(mediaId)) return;
    const next: SceneComposerItem = {
      ...current,
      outputMediaIds: [...current.outputMediaIds, mediaId].slice(0, 512),
      updatedAt: nowIso(),
    };
    const sanitized = sanitizeForPersist(next);
    set((s) => ({
      scenes: s.scenes.map((p) => (p.id === sceneId ? sanitized : p)),
    }));
    try {
      await persistOne(sanitized);
    } catch (err) {
      set((s) => ({
        scenes: s.scenes.map((p) => (p.id === sceneId ? current : p)),
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
  },

  removeOutputMedia: async (sceneId, mediaId) => {
    const current = get().scenes.find((p) => p.id === sceneId);
    if (!current) return;
    if (!current.outputMediaIds.includes(mediaId)) return;
    const next: SceneComposerItem = {
      ...current,
      outputMediaIds: current.outputMediaIds.filter((id) => id !== mediaId),
      updatedAt: nowIso(),
    };
    const sanitized = sanitizeForPersist(next);
    set((s) => ({
      scenes: s.scenes.map((p) => (p.id === sceneId ? sanitized : p)),
    }));
    try {
      await persistOne(sanitized);
    } catch (err) {
      set((s) => ({
        scenes: s.scenes.map((p) => (p.id === sceneId ? current : p)),
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
  },

  archiveScene: async (sceneId) => {
    const now = nowIso();
    const current = get().scenes.find((p) => p.id === sceneId);
    if (!current) return;
    const next: SceneComposerItem = {
      ...current,
      archivedAt: now,
      updatedAt: now,
    };
    const sanitized = sanitizeForPersist(next);
    set((s) => ({
      scenes: s.scenes.map((p) => (p.id === sceneId ? sanitized : p)),
    }));
    try {
      await persistOne(sanitized);
    } catch (err) {
      set((s) => ({
        scenes: s.scenes.map((p) => (p.id === sceneId ? current : p)),
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
  },

  unarchiveScene: async (sceneId) => {
    const current = get().scenes.find((p) => p.id === sceneId);
    if (!current) return;
    const next: SceneComposerItem = {
      ...current,
      archivedAt: null,
      updatedAt: nowIso(),
    };
    const sanitized = sanitizeForPersist(next);
    set((s) => ({
      scenes: s.scenes.map((p) => (p.id === sceneId ? sanitized : p)),
    }));
    try {
      await persistOne(sanitized);
    } catch (err) {
      set((s) => ({
        scenes: s.scenes.map((p) => (p.id === sceneId ? current : p)),
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
  },

  deleteScene: async (sceneId) => {
    const current = get().scenes.find((p) => p.id === sceneId);
    if (!current) return;
    set((s) => ({
      scenes: s.scenes.filter((p) => p.id !== sceneId),
      activeSceneId: s.activeSceneId === sceneId ? null : s.activeSceneId,
    }));
    try {
      await deleteOne(sceneId);
    } catch (err) {
      set((s) => ({
        scenes: [current, ...s.scenes.filter((p) => p.id !== sceneId)],
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
  },

  toggleFavorite: async (sceneId) => {
    const current = get().scenes.find((p) => p.id === sceneId);
    if (!current) return;
    const next: SceneComposerItem = {
      ...current,
      favorite: !current.favorite,
      updatedAt: nowIso(),
    };
    const sanitized = sanitizeForPersist(next);
    set((s) => ({
      scenes: s.scenes.map((p) => (p.id === sceneId ? sanitized : p)),
    }));
    try {
      await persistOne(sanitized);
    } catch (err) {
      set((s) => ({
        scenes: s.scenes.map((p) => (p.id === sceneId ? current : p)),
        loadError: redactErrorMessage(err),
      }));
      throw err;
    }
  },

  getScene: (sceneId) => get().scenes.find((p) => p.id === sceneId) ?? null,
  getCurrentVersion: (sceneId) => {
    const item = get().scenes.find((p) => p.id === sceneId);
    return getCurrentSceneVersion(item ?? null);
  },

  importScenes: async (payload) => {
    const now = nowIso();
    const result = parseSceneComposerImport(payload, now);
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
        if (s.scenes.some((p) => p.id === fresh.id)) return s;
        return { scenes: [fresh, ...s.scenes] };
      });
    }
    return result;
  },

  exportScenes: (sceneIds) => {
    const items = get().scenes.filter((p) => sceneIds.includes(p.id));
    return exportSceneComposerItems(items);
  },
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

/** All non-archived scenes (for the main library list). */
export function selectActiveScenes(state: SceneComposerState): SceneComposerItem[] {
  return state.scenes.filter((s) => s.archivedAt === null);
}

/** All archived scenes (shown only in the Archive filter). */
export function selectArchivedScenes(state: SceneComposerState): SceneComposerItem[] {
  return state.scenes.filter((s) => s.archivedAt !== null);
}

/** Scenes visible in a given project context (project + global, plus All Projects). */
export function selectScenesForProject(
  state: SceneComposerState,
  activeProjectId: string | null,
): SceneComposerItem[] {
  return state.scenes.filter((s) => {
    if (s.archivedAt !== null) return false;
    if (s.scope === "global") return true;
    return activeProjectId !== null && s.projectId === activeProjectId;
  });
}

/**
 * Resolve the active project for a new scene. Order:
 *   1. The explicit `projectId` argument (when scope is "project")
 *   2. `useSettingsStore.activeProjectId`
 *   3. The first non-archived project in `useProjectStore.projects`
 *   4. `null` (caller must treat null as "global")
 */
export function resolveSceneProjectId(explicit: string | null | undefined): string | null {
  if (explicit) return explicit;
  const fromSettings = useSettingsStore.getState().activeProjectId;
  if (fromSettings) return fromSettings;
  const projects = useProjectStore.getState().projects ?? [];
  const first = projects.find((p) => p.archivedAt === null || p.archivedAt === undefined);
  return first?.id ?? null;
}

// Re-export types so consumers can `import { SceneComposerItem } from .../scene-composer-store`.
export type {
  SceneComposerItem,
  SceneComposerExport,
  SceneVersion,
  SceneScope,
  SceneComponentKind,
  SceneMediaRef,
  ScenePromptRef,
  SceneImportResult,
  CreateSceneComponentInput,
  CreateSceneComposerItemInput,
};

// Convenience: re-export the auth-check helper for components that
// want to gate save/apply actions on a configured Venice key.
export { useAuthStore };