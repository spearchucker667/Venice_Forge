/** @fileoverview Phase 2B Media Studio bulk action helpers.
 *
 * Wraps the existing `useMediaStore` actions (favorite, tags, delete,
 * etc.) into a uniform `BulkMediaActionResult` contract that the
 * toolbar, compare view, and Command Palette can call without
 * re-implementing the partial-failure / archived-project safety checks.
 *
 * Safety rules:
 *   - Bulk delete requires `confirm: true` (callers must collect a
 *     user confirmation); the helper will not run without it.
 *   - Project assignment is validated against the live project list;
 *     archived or unknown project ids are rejected per-id (partial
 *     failures).
 *   - Empty input arrays are a no-op (return zero-count result) and
 *     never throw.
 *   - No raw prompt / secret fields are logged.
 */

import type { MediaItemPatch } from "../types/media";
import type { Project } from "../types/project";
import { redactErrorMessage } from "../shared/redaction";
import { useMediaStore } from "./media-store";
import { useProjectStore } from "./project-store";

export type BulkActionName =
  | "favorite"
  | "unfavorite"
  | "add-tags"
  | "remove-tag"
  | "assign-project"
  | "clear-project"
  | "delete";

export interface BulkMediaActionResult {
  action: BulkActionName;
  requested: number;
  succeeded: string[];
  failed: Array<{ id: string; reason: string }>;
}

function emptyResult(action: BulkActionName): BulkMediaActionResult {
  return { action, requested: 0, succeeded: [], failed: [] };
}

/** True when `ids` contains at least one non-empty string id. */
function isNonEmpty(ids: readonly string[]): boolean {
  return ids.some((id) => typeof id === "string" && id.length > 0);
}

/** Normalises and deduplicates a list of ids. Returns [] for non-array input. */
function normaliseIds(ids: readonly string[] | undefined | null): string[] {
  if (!Array.isArray(ids)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || id.length === 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Resolve a project id against the live project list. */
function resolveProject(
  projectId: string | null | undefined,
  projects: Project[],
): { ok: true; project: Project } | { ok: false; reason: string } {
  if (projectId === null) return { ok: true, project: null as unknown as Project };
  if (typeof projectId !== "string" || projectId.length === 0) {
    return { ok: false, reason: "Project id is empty" };
  }
  const project = projects.find((p) => p.id === projectId);
  if (!project) return { ok: false, reason: "Project not found" };
  if (project.archivedAt) return { ok: false, reason: "Project is archived" };
  return { ok: true, project };
}

/**
 * Sets the favorite flag on each id. The single store action
 * `setFavoriteMany` is atomic per id; partial failures are surfaced
 * when the underlying patch fails (rare in IDB but possible under
 * quota pressure).
 */
export async function bulkSetFavorite(
  ids: readonly string[],
  favorite: boolean,
): Promise<BulkMediaActionResult> {
  const action: BulkActionName = favorite ? "favorite" : "unfavorite";
  const norm = normaliseIds(ids);
  if (norm.length === 0) return emptyResult(action);
  if (!isNonEmpty(norm)) return { ...emptyResult(action), requested: 0 };
  const before = useMediaStore.getState().items;
  const beforeById = new Map(before.map((i) => [i.id, i]));
  const missing: string[] = [];
  for (const id of norm) {
    if (!beforeById.has(id)) missing.push(id);
  }
  try {
    await useMediaStore.getState().setFavoriteMany(norm, favorite);
  } catch (err) {
    return {
      action,
      requested: norm.length,
      succeeded: [],
      failed: norm.map((id) => ({ id, reason: errorReason(err) })),
    };
  }
  return {
    action,
    requested: norm.length,
    succeeded: norm.filter((id) => !missing.includes(id)),
    failed: missing.map((id) => ({ id, reason: "Media not in current view" })),
  };
}

/** Adds tags to each selected id (de-duped, lowercased). */
export async function bulkAddTags(
  ids: readonly string[],
  tags: readonly string[],
): Promise<BulkMediaActionResult> {
  const action: BulkActionName = "add-tags";
  const norm = normaliseIds(ids);
  const cleanedTags = Array.from(
    new Set(
      (Array.isArray(tags) ? tags : [])
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 0 && t.length <= 32),
    ),
  );
  if (norm.length === 0 || cleanedTags.length === 0) return emptyResult(action);
  const before = useMediaStore.getState().items;
  const beforeById = new Map(before.map((i) => [i.id, i]));
  const missing: string[] = [];
  for (const id of norm) {
    if (!beforeById.has(id)) missing.push(id);
  }
  try {
    await useMediaStore.getState().addTagsMany(norm, cleanedTags);
  } catch (err) {
    return {
      action,
      requested: norm.length,
      succeeded: [],
      failed: norm.map((id) => ({ id, reason: errorReason(err) })),
    };
  }
  return {
    action,
    requested: norm.length,
    succeeded: norm.filter((id) => !missing.includes(id)),
    failed: missing.map((id) => ({ id, reason: "Media not in current view" })),
  };
}

/** Removes a single tag from each selected id (no-op when the tag is absent). */
export async function bulkRemoveTag(
  ids: readonly string[],
  tag: string,
): Promise<BulkMediaActionResult> {
  const action: BulkActionName = "remove-tag";
  const norm = normaliseIds(ids);
  const cleanedTag = typeof tag === "string" ? tag.trim().toLowerCase() : "";
  if (norm.length === 0 || !cleanedTag) return emptyResult(action);
  const before = useMediaStore.getState().items;
  const beforeById = new Map(before.map((i) => [i.id, i]));
  const missing: string[] = [];
  for (const id of norm) {
    if (!beforeById.has(id)) missing.push(id);
  }
  try {
    await useMediaStore.getState().removeTagMany(norm, cleanedTag);
  } catch (err) {
    return {
      action,
      requested: norm.length,
      succeeded: [],
      failed: norm.map((id) => ({ id, reason: errorReason(err) })),
    };
  }
  return {
    action,
    requested: norm.length,
    succeeded: norm.filter((id) => !missing.includes(id)),
    failed: missing.map((id) => ({ id, reason: "Media not in current view" })),
  };
}

/**
 * Assigns each id to the supplied project. Archived or unknown projects
 * are rejected per id (partial failure); null is the "unassign" sentinel
 * and is validated by the project store.
 */
export async function bulkAssignProject(
  ids: readonly string[],
  projectId: string | null,
  options: { projects?: Project[] } = {},
): Promise<BulkMediaActionResult> {
  const action: BulkActionName = projectId === null ? "clear-project" : "assign-project";
  const norm = normaliseIds(ids);
  if (norm.length === 0) return emptyResult(action);
  const projects = options.projects ?? useProjectStore.getState().projects;
  const resolution = resolveProject(projectId, projects);
  if (!resolution.ok) {
    return {
      action,
      requested: norm.length,
      succeeded: [],
      failed: norm.map((id) => ({ id, reason: resolution.reason })),
    };
  }
  const succeeded: string[] = [];
  const failed: Array<{ id: string; reason: string }> = [];
  // Patching one-at-a-time lets us report per-id failures instead of
  // aborting the whole batch on quota / IO errors.
  for (const id of norm) {
    const patch: MediaItemPatch =
      projectId === null ? { projectId: undefined } : { projectId };
    try {
      const updated = await useMediaStore.getState().patch(id, patch);
      if (updated) succeeded.push(id);
      else failed.push({ id, reason: "Media not in current view" });
    } catch (err) {
      failed.push({ id, reason: errorReason(err) });
    }
  }
  return { action, requested: norm.length, succeeded, failed };
}

/**
 * Bulk delete. Requires `confirm: true`. Returns an empty result (not an
 * error) when the caller has not confirmed, so a missed confirm
 * check never silently deletes the user's data.
 */
export async function bulkDelete(
  ids: readonly string[],
  options: { confirm?: boolean } = {},
): Promise<BulkMediaActionResult> {
  const action: BulkActionName = "delete";
  if (!options.confirm) {
    return {
      action,
      requested: normaliseIds(ids).length,
      succeeded: [],
      failed: [{ id: "<all>", reason: "Delete requires explicit confirmation" }],
    };
  }
  const norm = normaliseIds(ids);
  if (norm.length === 0) return emptyResult(action);
  try {
    const removed = await useMediaStore.getState().removeMany(norm);
    const failed: Array<{ id: string; reason: string }> = [];
    if (removed < norm.length) {
      // Any ids not counted as removed are reported as missing so the
      // UI can surface a partial-failure toast.
      const removedSet = new Set<string>();
      const before = useMediaStore.getState().items;
      const beforeIds = new Set(before.map((i) => i.id));
      for (const id of norm) {
        if (beforeIds.has(id)) removedSet.add(id);
        else failed.push({ id, reason: "Media not in current view" });
      }
    }
    return {
      action,
      requested: norm.length,
      succeeded: norm.slice(0, removed),
      failed,
    };
  } catch (err) {
    return {
      action,
      requested: norm.length,
      succeeded: [],
      failed: norm.map((id) => ({ id, reason: errorReason(err) })),
    };
  }
}

/** Convenience: returns the cumulative failure count for a result. */
export function bulkFailureCount(result: BulkMediaActionResult): number {
  return result.failed.length;
}

/** Convenience: returns true when the action reported partial or total failure. */
export function bulkHasFailure(result: BulkMediaActionResult): boolean {
  return result.failed.length > 0;
}

function errorReason(err: unknown): string {
  return redactErrorMessage(err);
}

/** Resolved project context (used by tests and the gallery-view). */
export interface ResolvedBulkProject {
  id: string;
  name: string;
}

/** Pure resolver that callers (Command Palette, gallery-view) can use
 *  to render the project dropdown / pick a default. Returns the list
 *  of non-archived projects. */
export function listAssignableProjects(
  projects: readonly Project[] = useProjectStore.getState().projects,
): ResolvedBulkProject[] {
  return projects
    .filter((p) => !p.archivedAt)
    .map((p) => ({ id: p.id, name: p.name }));
}
