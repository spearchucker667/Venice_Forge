/** @fileoverview Media Studio — main grid + detail dialog + inspector surface.
 * Phase 2B wiring: selection store, bulk actions, compare modal, lineage,
 * send-to, export bundle, command-palette handler registration.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import {
  useMediaStore,
  filterMedia,
  searchMedia,
  sortMedia,
  type MediaFilter,
  type MediaSort,
  type MediaDynamicFilter,
  applyDynamicFilter,
} from "../../stores/media-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useImageWorkspaceStore } from "../../stores/image-workspace-store";
import { useProjectStore } from "../../stores/project-store";
import { useMediaSelectionStore, MEDIA_SELECTION_MAX } from "../../stores/media-selection-store";
import { registerMediaCommandHandlers } from "../../stores/media-command-handlers";
import { toast } from "../../stores/toast-store";
import { redactErrorMessage } from "../../shared/redaction";
import {
  bulkAddTags,
  bulkAssignProject,
  bulkDelete,
  bulkHasFailure,
  bulkSetFavorite,
  listAssignableProjects,
} from "../../stores/media-bulk-actions";
import {
  buildExportBundle,
  buildMediaFilename,
  serialiseBundle,
} from "../../stores/media-export-bundle";
import { sendToChat, sendToImageStudio, sendToImageTools, sendToVideo } from "../../stores/media-send-to";
import { copyText } from "../../stores/media-send-to";
import {
  createRecipeHandoff,
  extractGenerationRecipe,
  sanitizeRecipeForModel,
  type RecipeHandoffMode,
} from "../../types/project";
import { getImageModelCapabilities } from "../../config/image-model-capabilities";
import { MediaToolbar } from "./media-toolbar";
import { MediaCard } from "./media-card";
import { MediaDetailDialog } from "./media-detail-dialog";
import { MediaInspector } from "./media-inspector";
import { CompareView } from "./compare-view";
import { LineageViewer } from "./lineage-viewer";
import type { MediaItem, MediaItemPatch } from "../../types/media";
import { cn } from "../../lib/utils";
import { askDecision, askText } from "../ui/modal-requests";

export function MediaStudioView() {
  const items = useMediaStore((state) => state.items);
  const activeProjectIdForMediaFilter = useSettingsStore((s) => s.activeProjectId);
  const currentImageModel = useSettingsStore((s) => s.selectedModels.image);
  const loading = useMediaStore((state) => state.loading);
  const loadingMore = useMediaStore((state) => state.loadingMore);
  const totalCount = useMediaStore((state) => state.totalCount);
  const hasMore = useMediaStore((state) => state.hasMore);
  const lastError = useMediaStore((state) => state.lastError);
  const refresh = useMediaStore((state) => state.refresh);
  const loadMore = useMediaStore((state) => state.loadMore);
  const upsert = useMediaStore((state) => state.upsert);
  const patchRecord = useMediaStore((state) => state.patch);
  const remove = useMediaStore((state) => state.remove);
  const toggleFavorite = useMediaStore((state) => state.toggleFavorite);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [sort, setSort] = useState<MediaSort>("newest");
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [inspectorId, setInspectorId] = useState<string | null>(null);

  // Phase 2B: selection lives in the Zustand store. Local "select" callbacks
  // delegate to it.
  const selectedMediaIds = useMediaSelectionStore((s) => s.selectedMediaIds);

  // BUG-React#12 regression guard: captive closures inside the
  // registerMediaCommandHandlers effect (which runs with [] deps) need to
  // see the latest stable runExport / runBulkAddTag identities. Ref mirrors
  // forward them through a useEffect that has those callbacks in its dep
  // array, so the registration body can read ref.current.
  const runExportRef = useRef<((ids: string[]) => Promise<void>) | null>(null)
  const runBulkAddTagRef = useRef<((ids: string[], tags: string[]) => Promise<void>) | null>(null)

  // Phase 2B dynamic filter (project / model / tag / operation). Phase 1
  // project scoping still wins (it lives in activeProjectIdForMediaFilter).
  // Model / tag dynamic filters are reserved for a future toolbar UI;
  // the filterMedia + applyDynamicFilter plumbing is in place and
  // tested, but no setter is exposed yet so the view only uses
  // project-scope filtering today.
  const [modelFilter] = useState<string | null>(null);
  const [tagFilter] = useState<string | null>(null);

  // Phase 2B: bulk action project picker.
  const [bulkProjectId, setBulkProjectId] = useState<string>("");
  // Phase 2B: bulk tag input.
  const [bulkTagInput, setBulkTagInput] = useState<string>("");
  // Phase 2B: compare + lineage modal triggers.
  const [compareOpen, setCompareOpen] = useState(false);
  const [lineageOpen, setLineageOpen] = useState(false);

  // Focus traps for modal surfaces.
  const compareModalRef = useRef<HTMLDivElement>(null);
  const lineageModalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(compareModalRef, compareOpen, () => setCompareOpen(false));
  useFocusTrap(lineageModalRef, lineageOpen, () => setLineageOpen(false));

  // Initial load.
  useEffect(() => {
    void refresh();
  }, [refresh]); // BUG-React#9 regression guard: refresh is stable in Zustand v5; include it to satisfy react-hooks/exhaustive-deps so a future store refactor does not silently swap the closure.

  // Phase 2B: publish the visible (filtered) ids to the selection store
  // so the Command Palette's "Select all visible" works without
  // prop-drilling. Also reconcile the selection so items that leave
  // the visible set are dropped.
  const projectFiltered = useMemo(() => {
    if (!activeProjectIdForMediaFilter) return items;
    return items.filter((it) => it.projectId === activeProjectIdForMediaFilter);
  }, [items, activeProjectIdForMediaFilter]);

  const dynamicFiltered = useMemo(() => {
    const dyn: MediaDynamicFilter = {
      model: modelFilter,
      tag: tagFilter,
    };
    return applyDynamicFilter(projectFiltered, dyn);
  }, [projectFiltered, modelFilter, tagFilter]);

  const filtered = useMemo(() => {
    const searched = searchMedia(dynamicFiltered, query);
    const filteredItems = filterMedia(searched, filter);
    return sortMedia(filteredItems, sort);
  }, [dynamicFiltered, query, filter, sort]);

  // BUG-React#10 regression guard: combine setVisibleMediaIds +
  // reconcileWithVisible into a single scheduled effect on `filtered`
  // so subscribers only re-render once per filter change. Previously
  // two separate useEffects walked the same `filtered` array on the
  // same dep and each forced two Zustand subscriber re-renders.
  const filteredIds = useMemo(() => filtered.map((i) => i.id), [filtered]);
  useEffect(() => {
    const sel = useMediaSelectionStore.getState();
    sel.setVisibleMediaIds(filteredIds);
    sel.reconcileWithVisible(filteredIds);
  }, [filteredIds]);

  // Phase 2B: register media command handlers with the Command Palette.
  // The registry is module-level; the unsubscribe ensures handlers do
  // not leak when the user navigates away from Media Studio.
  // AUDIT-018: Use a ref to avoid re-registration on every filter change.
  const filteredRef = useRef(filteredIds);
  useEffect(() => {
    filteredRef.current = filteredIds;
  }, [filteredIds]);

  useEffect(() => {
    const cleanup = registerMediaCommandHandlers({
      // BUG-React#10+#12 regression guard: filteredRef mirrors filteredIds
      // (the memoized id array), so the visibleIds accessor returns it
      // directly without re-mapping.
      visibleIds: () => filteredRef.current,
      resolveItems: (ids) => useMediaStore.getState().items.filter((it) => ids.includes(it.id)),
      isMediaActive: () => useSettingsStore.getState().activeTab === "media",
      onSelectAllVisible: () => useMediaSelectionStore.getState().selectAllVisible(),
      onClearSelection: () => useMediaSelectionStore.getState().clearSelection(),
      onCompare: (_ids) => {
        setCompareOpen(true);
      },
      onExport: (ids) => {
        if (runExportRef.current) void runExportRef.current(ids);
      },
      onFavorite: async (ids) => {
        const r = await bulkSetFavorite(ids, true);
        if (bulkHasFailure(r)) toast.error(`Favorited ${r.succeeded.length} of ${r.requested}`);
        else toast.success(`Favorited ${r.succeeded.length} item${r.succeeded.length === 1 ? "" : "s"}`);
      },
      onAddTag: async (ids) => {
        setBulkTagInput("");
        const tag = (await askText({
          title: "Add tag",
          detail: "Apply a tag to the selected media.",
          actionLabel: "Add tag",
          validate: (value) => value.trim() ? null : "Enter a tag.",
        }))?.trim().toLowerCase();
        if (!tag) return;
        if (runBulkAddTagRef.current) await runBulkAddTagRef.current(ids, [tag]);
      },
      onSendToImage: (ids) => {
        const first = useMediaStore.getState().items.find((it) => it.id === ids[0]);
        if (first) sendToImageStudio(first);
      },
      onCopyRecipe: async (ids) => {
        const items = useMediaStore.getState().items.filter((it) => ids.includes(it.id));
        const recipes = items
          .map((it) => extractGenerationRecipe(it))
          .filter((r): r is NonNullable<typeof r> => r !== null);
        if (recipes.length === 0) {
          toast.error("None of the selected items have a recipe.");
          return;
        }
        const text = JSON.stringify(recipes, null, 2);
        const ok = await copyText(text);
        if (ok) toast.success(`Copied ${recipes.length} recipe${recipes.length === 1 ? "" : "s"}`);
        else toast.error("Could not copy to clipboard.");
      },
    });
    return cleanup;
  }, []);

  // Active project list for the bulk project picker.
  const projects = useProjectStore((s) => s.projects);
  const availableProjects = useMemo(() => listAssignableProjects(projects), [projects]);

  // Sync the project picker to the active project (default) so the
  // first Apply just assigns everything to the current project.
  useEffect(() => {
    if (bulkProjectId === "" && activeProjectIdForMediaFilter) {
      setBulkProjectId(activeProjectIdForMediaFilter)
    }
  }, [activeProjectIdForMediaFilter, bulkProjectId]);

  const detailItem = useMemo(
    () => items.find((candidate) => candidate.id === detailId) ?? null,
    [items, detailId],
  );

  const inspectorItem = useMemo(
    () => items.find((candidate) => candidate.id === inspectorId) ?? null,
    [items, inspectorId],
  );

  // BUG-008 lineage handling (unchanged from Phase 2A).
  const loadById = useMediaStore((state) => state.loadById);
  const [missingChildIds, setMissingChildIds] = useState<string[]>([]);
  // BUG-React#11 regression guard: mirror `missingChildIds` through a ref so the
  // detection effect can read the latest value without re-scheduling itself on
  // every setState. The functional setState inside the effect already excludes
  // known ids, so dropping the dep only prevents no-op re-runs while keeping
  // the same observable behavior.
  const missingChildIdsRef = useRef<string[]>(missingChildIds);
  useEffect(() => {
    missingChildIdsRef.current = missingChildIds;
  }, [missingChildIds]);
  useEffect(() => {
    setMissingChildIds([]);
  }, [inspectorItem?.id]);
  useEffect(() => {
    if (!inspectorItem) return
    const parentId = inspectorItem.parentId
    if (parentId && !items.some((candidate) => candidate.id === parentId)) {
      void loadById(parentId)
    }
  }, [inspectorItem, items, loadById])

  useEffect(() => {
    if (!inspectorItem) return
    const missing = inspectorItem.childrenIds.filter(
      (id) => !items.some((candidate) => candidate.id === id) && !missingChildIdsRef.current.includes(id),
    )
    if (missing.length === 0) return
    let cancelled = false
    void Promise.all(
      missing.map(async (id) => {
        const result = await loadById(id)
        return { id, found: result !== null }
      }),
    ).then((results) => {
      if (cancelled) return
      const stillMissing = results.filter((r) => !r.found).map((r) => r.id)
      if (stillMissing.length > 0) {
        setMissingChildIds((prev) => {
          const set = new Set(prev)
          for (const id of stillMissing) set.add(id)
          return Array.from(set)
        })
      }
    })
    return () => {
      cancelled = true
    }
    // BUG-React#11 regression guard: missingChildIds is intentionally NOT in
    // this dep list. The functional setState below already excludes known ids,
    // and reading the latest value via `missingChildIdsRef` avoids the
    // no-op re-run that Array.from(new Set(...)) causes every setState cycle.
  }, [inspectorItem, items, loadById])

  // Phase 2B: selected items (resolved from ids).
  const selectedItems = useMemo(
    () => items.filter((item) => selectedMediaIds.includes(item.id)),
    [items, selectedMediaIds],
  );

  // BUG-React#10 regression guard: the reconcileWithVisible case has been
  // merged into the single effect above so we no longer schedule two effects
  // on the same `filtered` dep. The selection store's reconcileWithVisible
  // also clears ids that left the visible set after a bulk delete.

  // ---- Selection / active logic ----

  const handleOpenInspector = useCallback((item: MediaItem) => {
    setActiveId(item.id);
    setInspectorId(item.id);
  }, []);

  const handleSelect = useCallback((item: MediaItem, multi: boolean) => {
    const store = useMediaSelectionStore.getState();
    if (multi) {
      store.toggleMedia(item.id);
    } else {
      store.selectMedia(item.id);
      setActiveId(item.id);
    }
  }, []);

  const handleOpenDetail = useCallback((item: MediaItem) => {
    setActiveId(item.id);
    setDetailId(item.id);
  }, []);

  const handleNavigate = useCallback((direction: "prev" | "next") => {
    if (!detailId) return;
    const idx = filtered.findIndex((candidate) => candidate.id === detailId);
    if (idx < 0) return;
    const target = direction === "prev"
      ? filtered[Math.max(0, idx - 1)]
      : filtered[Math.min(filtered.length - 1, idx + 1)];
    if (target && target.id !== detailId) {
      setDetailId(target.id);
      setActiveId(target.id);
    }
  }, [detailId, filtered]);

  // ---- Actions ----

  const handlePatch = useCallback(async (id: string, patch: MediaItemPatch) => {
    try {
      await patchRecord(id, patch);
    } catch (err) {
      toast.error("Failed to update media item", redactErrorMessage(err));
    }
  }, [patchRecord]);

  const handleDelete = useCallback(async (item: MediaItem) => {
    const shouldDelete = await askDecision({
      title: `Delete this ${item.mediaType === "video" ? "video" : item.mediaType === "audio" ? "audio track" : "image"}?`,
      detail: "This cannot be undone.",
      actionLabel: "Delete",
      danger: true,
    });
    if (!shouldDelete) return;
    try {
      const ok = await remove(item.id);
      if (ok) {
        toast.success("Removed from Media Studio");
        // Phase 2B: drop the deleted id from the selection so the
        // bulk action toolbar does not operate on a ghost item.
        useMediaSelectionStore.setState((s) => ({
          selectedMediaIds: s.selectedMediaIds.filter((id) => id !== item.id),
        }));
        if (detailId === item.id) setDetailId(null);
        if (inspectorId === item.id) setInspectorId(null);
        if (activeId === item.id) setActiveId(null);
      }
    } catch (err) {
      toast.error("Failed to delete", redactErrorMessage(err));
    }
  }, [remove, detailId, inspectorId, activeId]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedMediaIds.length === 0) return;
    const shouldDelete = await askDecision({
      title: `Delete ${selectedMediaIds.length} item${selectedMediaIds.length === 1 ? "" : "s"}?`,
      detail: "This cannot be undone.",
      actionLabel: "Delete",
      danger: true,
    });
    if (!shouldDelete) return;
    try {
      const r = await bulkDelete(selectedMediaIds, { confirm: true });
      if (bulkHasFailure(r)) {
        toast.error(`Removed ${r.succeeded.length} of ${r.requested} (some failed)`);
      } else {
        toast.success(`Removed ${r.succeeded.length} item${r.succeeded.length === 1 ? "" : "s"}`);
      }
    } catch (err) {
      toast.error("Batch delete failed", redactErrorMessage(err));
    }
  }, [selectedMediaIds]);

  const handleBatchFavorite = useCallback(async () => {
    if (selectedMediaIds.length === 0) return;
    const allFavorited = selectedItems.length > 0 && selectedItems.every((item) => item.favorite);
    const r = await bulkSetFavorite(selectedMediaIds, !allFavorited);
    if (bulkHasFailure(r)) toast.error(`Updated ${r.succeeded.length} of ${r.requested}`);
    else toast.success(allFavorited ? "Removed favorites" : "Marked as favorites");
  }, [selectedMediaIds, selectedItems]);

  const handleBatchUnfavorite = useCallback(async () => {
    if (selectedMediaIds.length === 0) return;
    const r = await bulkSetFavorite(selectedMediaIds, false);
    if (bulkHasFailure(r)) toast.error(`Updated ${r.succeeded.length} of ${r.requested}`);
    else toast.success("Cleared favorites");
  }, [selectedMediaIds]);

  const runBulkAddTag = useCallback(async (ids: string[], tags: string[]) => {
    if (ids.length === 0 || tags.length === 0) return;
    const r = await bulkAddTags(ids, tags);
    if (bulkHasFailure(r)) toast.error(`Tagged ${r.succeeded.length} of ${r.requested}`);
    else toast.success(`Tagged ${r.succeeded.length} item${r.succeeded.length === 1 ? "" : "s"}`);
  }, []);

  const handleBatchAddTag = useCallback(async () => {
    if (selectedMediaIds.length === 0) return;
    const tag = bulkTagInput.trim().toLowerCase();
    if (!tag) {
      toast.error("Enter a tag first.");
      return;
    }
    await runBulkAddTag(selectedMediaIds, [tag]);
    setBulkTagInput("");
  }, [selectedMediaIds, bulkTagInput, runBulkAddTag]);

  const handleBatchAssignProject = useCallback(async () => {
    if (selectedMediaIds.length === 0) return;
    const projectId = bulkProjectId === "" ? null : bulkProjectId;
    const r = await bulkAssignProject(selectedMediaIds, projectId, { projects });
    if (bulkHasFailure(r)) {
      const firstReason = r.failed[0]?.reason ?? "Unknown error";
      toast.error(`Assigned ${r.succeeded.length} of ${r.requested} (${firstReason})`);
    } else {
      toast.success(`Assigned ${r.succeeded.length} item${r.succeeded.length === 1 ? "" : "s"}`);
    }
  }, [selectedMediaIds, bulkProjectId, projects]);

  const handleSelectAll = useCallback(() => {
    useMediaSelectionStore.getState().selectAllVisible(filtered.map((i) => i.id));
  }, [filtered]);

  const handleClearSelection = useCallback(() => {
    useMediaSelectionStore.getState().clearSelection();
  }, []);

  const handleBatchCompare = useCallback(() => {
    setCompareOpen(true);
  }, []);

  // Phase 2B: export the selected media as a JSON bundle (browser side).
  // The renderer never gets filesystem access; we trigger a download via
  // the same Blob+anchor path the inspector already uses.
  const runExport = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      toast.error("Select at least one media item.")
      return
    }
    const exportItems = items.filter((it) => ids.includes(it.id))
    const bundle = buildExportBundle(exportItems)
    const json = serialiseBundle(bundle)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `venice-forge-export-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    // Surface deterministic sidecar filenames alongside the JSON manifest.
    const filenameList = exportItems.map((it) => buildMediaFilename(it)).join("\n")
    toast.success(`Exported ${ids.length} item${ids.length === 1 ? "" : "s"}. Sidecar filenames:\n${filenameList}`)
  }, [items]);

  const handleBatchExport = useCallback(() => {
    void runExport(selectedMediaIds);
  }, [selectedMediaIds, runExport]);

  // BUG-React#12 regression guard: forward the latest runExport and runBulkAddTag
  // callback identities to the refs that the registerMediaCommandHandlers effect
  // (which runs with [] deps) reads from. This avoids stale-closure risk when the
  // caller (Command Palette) fires an export / bulk-tag command.
  useEffect(() => {
    runExportRef.current = runExport
    runBulkAddTagRef.current = runBulkAddTag
  }, [runExport, runBulkAddTag])

  // ---- Gallery handoff: image workspace ----

  const handoffToImageStudio = useCallback(
    (item: MediaItem, mode: RecipeHandoffMode, promptOverride?: string) => {
      const extracted = extractGenerationRecipe(item);
      if (!extracted) return false;
      const sanitized = sanitizeRecipeForModel(
        promptOverride ? { ...extracted, prompt: promptOverride } : extracted,
        getImageModelCapabilities(extracted.model),
      );
      const handoff = createRecipeHandoff(sanitized, mode);
      useImageWorkspaceStore.getState().enqueueGenerate({
        draft: handoff.draft,
        autoGenerate: handoff.autoGenerate,
        parentId: handoff.parentMediaId,
        operation: handoff.autoGenerate ? "regenerate" : "generate",
      });
      useSettingsStore.getState().setActiveTab("image");
      return true;
    },
    [],
  );

  const handleUseSettings = useCallback(
    (item: MediaItem) => {
      if (handoffToImageStudio(item, "use")) toast.success("Loaded settings into Image Studio");
      else toast.error("This media item has no reusable recipe");
    },
    [handoffToImageStudio],
  );

  const handleUseRecipe = useCallback(
    (item: MediaItem) => {
      if (handoffToImageStudio(item, "use")) toast.success("Recipe loaded into Image Studio");
      else toast.error("This media item has no reusable recipe");
    },
    [handoffToImageStudio],
  );

  const handleUseSanitizedRecipe = useCallback(
    (item: MediaItem) => {
      if (handoffToImageStudio(item, "use")) toast.success("Recipe loaded into Image Studio");
      else toast.error("This media item has no reusable recipe");
    },
    [handoffToImageStudio],
  );

  const handleExportRecipe = useCallback((item: MediaItem) => {
    const recipe = extractGenerationRecipe(item);
    if (!recipe) {
      toast.error("This media item has no reusable recipe");
      return;
    }
    if (typeof document === "undefined") return;
    const json = JSON.stringify(recipe, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recipe-${item.id.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, []);

  const handleRegenerate = useCallback(
    (item: MediaItem, opts?: { sameSeed?: boolean; promptOverride?: string }) => {
      const mode: RecipeHandoffMode = opts?.sameSeed ? "same-seed" : "new-seed";
      if (!handoffToImageStudio(item, mode, opts?.promptOverride)) {
        toast.error("This media item has no reusable recipe");
      }
    },
    [handoffToImageStudio],
  );

  const handleUpscale = useCallback(
    (item: MediaItem) => {
      useImageWorkspaceStore.getState().enqueueTools({
        tool: "upscale",
        parentId: item.id,
        image: item.image,
        prompt: item.prompt,
        filename: `${item.id}.png`,
      });
      useSettingsStore.getState().setActiveTab("image");
      toast.success("Opening image tools for upscale");
    },
    [],
  );

  const handleEdit = useCallback((item: MediaItem) => {
    useImageWorkspaceStore.getState().enqueueTools({
      tool: "edit",
      parentId: item.id,
      image: item.image,
      prompt: item.prompt,
      filename: `${item.id}.png`,
    });
    useSettingsStore.getState().setActiveTab("image");
    toast.success("Opening image tools for editing");
  }, []);

  const handleApplyRemix = useCallback(
    (item: MediaItem, remixedPrompt: string) => {
      handoffToImageStudio(item, "use", remixedPrompt);
    },
    [handoffToImageStudio],
  );

  // Phase 2B: send-to handlers that route through the canonical
  // (and capability-checked) media-send-to module.
  const handleSendToImageStudio = useCallback((item: MediaItem) => {
    const r = sendToImageStudio(item);
    if (r.ok) toast.success("Sent to Image Studio");
    else toast.error(r.reason ?? "Could not send to Image Studio");
  }, []);
  const handleSendToImageTools = useCallback((item: MediaItem) => {
    const r = sendToImageTools(item, "edit");
    if (r.ok) toast.success("Sent to Image Tools");
    else toast.error(r.reason ?? "Could not send to Image Tools");
  }, []);
  const handleSendToChat = useCallback((item: MediaItem) => {
    const r = sendToChat(item);
    if (r.ok) toast.success("Created new chat with prompt copied");
    else toast.error(r.reason ?? "Could not send to Chat");
  }, []);
  const handleSendToVideo = useCallback((item: MediaItem) => {
    const r = sendToVideo(item);
    if (r.ok) toast.success("Sent to Video Studio");
    else toast.error(r.reason ?? "Could not send to Video Studio");
  }, []);
  const handleCopyPrompt = useCallback(async (item: MediaItem) => {
    if (await copyText(item.prompt ?? "")) toast.success("Prompt copied");
    else toast.error("Could not copy prompt");
  }, []);
  const handleCopyNegative = useCallback(async (item: MediaItem) => {
    if (await copyText(item.negative ?? "")) toast.success("Negative copied");
    else toast.error("Could not copy negative");
  }, []);
  const handleCopySeed = useCallback(async (item: MediaItem) => {
    if (typeof item.seed !== "number") {
      toast.error("No seed recorded")
      return
    }
    if (await copyText(String(item.seed))) toast.success("Seed copied")
  }, []);

  // DEV-only window hook (unchanged).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const meta = (import.meta as unknown as { env?: { DEV?: boolean; MODE?: string } });
    const isDev = meta.env?.DEV === true || meta.env?.MODE !== "production";
    if (!isDev) return;
    interface MediaDevApi {
      upsert: typeof upsert;
    }
    const w = window as unknown as { __veniceMediaDev?: MediaDevApi };
    w.__veniceMediaDev = { upsert };
    return () => {
      if (w.__veniceMediaDev) delete w.__veniceMediaDev;
    };
  }, [upsert]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">
      <header className="flex items-center justify-between soft-separator-y mesh-header mesh-surface px-5 py-4">
        <div>
          <h2 className="text-[17px] font-semibold text-text-primary">Media Studio</h2>
          <p className="mt-0.5 text-[12.5px] text-text-muted">
            Browse, tag, edit, and export your generated media.
          </p>
        </div>
        <div className="text-[12px] text-text-muted">
          {items.length} of {totalCount} item{totalCount === 1 ? "" : "s"} loaded
          {selectedMediaIds.length > 0 && <> · {selectedMediaIds.length} selected</>}
        </div>
      </header>

      <MediaToolbar
        query={query}
        onQueryChange={setQuery}
        filter={filter}
        onFilterChange={setFilter}
        sort={sort}
        onSortChange={setSort}
        multiSelectMode={multiSelectMode}
        onToggleMultiSelect={() => {
          setMultiSelectMode((prev) => !prev);
          if (multiSelectMode) useMediaSelectionStore.getState().clearSelection();
        }}
        selectedIds={new Set(selectedMediaIds)}
        selectedItems={selectedItems}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
        onBatchFavorite={handleBatchFavorite}
        onBatchUnfavorite={handleBatchUnfavorite}
        onBatchDelete={handleBatchDelete}
        onRefresh={() => void refresh()}
        refreshing={loading}
        totalCount={filtered.length}
        availableProjects={availableProjects}
        bulkProjectId={bulkProjectId}
        onBulkProjectIdChange={setBulkProjectId}
        onBatchAssignProject={handleBatchAssignProject}
        onBatchAddTag={handleBatchAddTag}
        onBatchExport={handleBatchExport}
        onBatchCompare={handleBatchCompare}
        compareReady={selectedMediaIds.length >= 2 && selectedMediaIds.length <= MEDIA_SELECTION_MAX}
      />

      {lastError && (
        <div className="border-b border-danger/20 bg-danger/10 px-5 py-2 text-[12px] text-danger">
          {lastError}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-y-auto p-5">
          {loading && items.length === 0 ? (
            <div className="grid h-full place-items-center text-[13px] text-text-muted">Loading Media Studio…</div>
          ) : filtered.length === 0 ? (
            <div className="grid h-full place-items-center text-center">
              <div>
                <p className="text-[15px] font-medium text-text-primary">No matching media</p>
                <p className="mt-1 text-[12.5px] text-text-muted">
                  {items.length === 0
                    ? "Images and videos generated in Image Studio and Video Studio will appear here automatically."
                    : hasMore
                      ? "Try a different search or filter, or load older items to expand the result set."
                      : "Try a different search, filter, or sort."}
                </p>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "grid gap-4",
                "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
              )}
            >
              {filtered.map((item) => (
                <div
                  key={item.id}
                  onDoubleClick={() => handleOpenInspector(item)}
                  title="Double-click to inspect"
                >
                  <MediaCard
                    item={item}
                    selected={selectedMediaIds.includes(item.id)}
                    active={activeId === item.id}
                    multiSelectMode={multiSelectMode}
                    onSelect={handleSelect}
                    onOpen={(it) => {
                      if (multiSelectMode) {
                        useMediaSelectionStore.getState().toggleMedia(it.id);
                      } else {
                        handleOpenDetail(it);
                      }
                    }}
                    onToggleFavorite={(it) => void toggleFavorite(it.id)}
                    onDelete={(it) => void handleDelete(it)}
                  />
                </div>
              ))}
            </div>
          )}
          {hasMore && !loading && (
            <div className="flex justify-center py-6">
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="rounded-lg border border-border bg-surface-elevated px-4 py-2 text-[13px] font-medium text-text-primary transition-colors hover:border-accent hover:text-accent disabled:cursor-wait disabled:opacity-60"
              >
                {loadingMore ? "Loading older media…" : `Load more (${Math.max(0, totalCount - items.length)} remaining)`}
              </button>
            </div>
          )}
        </main>

        {inspectorItem && (
          <div className="hidden w-80 shrink-0 lg:block">
            <MediaInspector
              item={inspectorItem}
              parentItem={inspectorItem.parentId ? items.find((candidate) => candidate.id === inspectorItem.parentId) ?? null : null}
              childrenItems={items.filter((candidate) => candidate.parentId === inspectorItem.id)}
              missingChildIds={missingChildIds}
              onPatch={handlePatch}
              onDelete={(it) => void handleDelete(it)}
              onOpenChild={handleOpenDetail}
              onOpenParent={handleOpenDetail}
              onClose={() => setInspectorId(null)}
              onUseSettings={handleUseSettings}
              onUseRecipe={handleUseRecipe}
              onUseSanitizedRecipe={handleUseSanitizedRecipe}
              onExportRecipe={handleExportRecipe}
              onRegenerate={handleRegenerate}
              onUpscale={handleUpscale}
              onOpenImageTools={handleEdit}
              onApplyRemix={handleApplyRemix}
              currentModel={currentImageModel}
            />
          </div>
        )}
      </div>

      {detailItem && (
        <MediaDetailDialog
          item={detailItem}
          allItems={filtered}
          onClose={() => setDetailId(null)}
          onNavigate={handleNavigate}
          onToggleFavorite={(it) => void toggleFavorite(it.id)}
          onDelete={(it) => void handleDelete(it)}
          onSelect={(it) => setDetailId(it.id)}
        />
      )}

      <div className="sr-only" aria-live="polite">
        {selectedItems.length > 0 && (
          <span>{selectedItems.length} items selected.</span>
        )}
      </div>

      {/* Phase 2B: Compare modal */}
      {compareOpen && (
        <div
          ref={compareModalRef}
          className="fixed inset-0 z-[150] flex items-center justify-center bg-overlay p-6"
          data-testid="compare-modal"
          onClick={() => setCompareOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[80vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-border bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <CompareView
              items={selectedItems}
              onClose={() => setCompareOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Phase 2B: Lineage modal */}
      {lineageOpen && inspectorItem && (
        <div
          ref={lineageModalRef}
          className="fixed inset-0 z-[150] flex items-center justify-center bg-overlay p-6"
          data-testid="lineage-modal"
          onClick={() => setLineageOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-border bg-surface p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <LineageViewer
              item={inspectorItem}
              items={items}
              onOpenItem={(it) => setInspectorId(it.id)}
            />
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setLineageOpen(false)}
                className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 2B: Bulk tag input row, visible in multi-select mode when items are selected. */}
      {multiSelectMode && selectedMediaIds.length > 0 && (
        <div className="border-t border-border/50 bg-surface px-5 py-2 flex items-center gap-2 text-[12px]">
          <label className="text-text-muted">Quick tag:</label>
          <input
            type="text"
            value={bulkTagInput}
            onChange={(e) => setBulkTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleBatchAddTag();
              }
            }}
            placeholder="hero, landscape, …"
            data-testid="bulk-tag-input"
            className="flex-1 rounded-md border border-border bg-surface-elevated px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleBatchAddTag()}
            disabled={!bulkTagInput.trim()}
            data-testid="bulk-tag-apply"
            className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30"
          >
            Apply
          </button>
        </div>
      )}

      {/* Phase 2B: Lineage + Send-to panel for the inspector. Hidden by
          default; the inspector renders its own comparison card and
          recipe actions. This panel is a top-level launcher for the
          new Compare + Lineage modals and a send-to menu. */}
      {inspectorItem && (
        <div className="border-t border-border/50 bg-surface px-5 py-2 flex flex-wrap items-center gap-1.5 text-[12px]">
          <button
            type="button"
            onClick={() => setCompareOpen(true)}
            disabled={selectedMediaIds.length < 2 || selectedMediaIds.length > MEDIA_SELECTION_MAX}
            data-testid="open-compare"
            className="rounded-md border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30"
          >
            Compare ({selectedMediaIds.length})
          </button>
          <button
            type="button"
            onClick={() => setLineageOpen(true)}
            data-testid="open-lineage"
            className="rounded-md border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent"
          >
            Lineage
          </button>
          <span className="mx-1 text-text-muted/60">·</span>
          <span className="text-text-muted">Send to:</span>
          <button
            type="button"
            onClick={() => handleSendToImageStudio(inspectorItem)}
            data-testid="send-to-image"
            className="rounded-md border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent"
          >
            Image Studio
          </button>
          {inspectorItem.mediaType !== "video" && (
            <button
              type="button"
              onClick={() => handleSendToImageTools(inspectorItem)}
              data-testid="send-to-tools"
              className="rounded-md border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent"
            >
              Image Tools
            </button>
          )}
          <button
            type="button"
            onClick={() => handleSendToChat(inspectorItem)}
            data-testid="send-to-chat"
            className="rounded-md border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent"
          >
            Chat
          </button>
          <button
            type="button"
            onClick={() => handleSendToVideo(inspectorItem)}
            data-testid="send-to-video"
            className="rounded-md border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent"
          >
            Video Studio
          </button>
          <span className="mx-1 text-text-muted/60">·</span>
          <span className="text-text-muted">Copy:</span>
          <button
            type="button"
            onClick={() => void handleCopyPrompt(inspectorItem)}
            data-testid="copy-prompt"
            className="rounded-md border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent"
          >
            Prompt
          </button>
          {inspectorItem.negative && (
            <button
              type="button"
              onClick={() => void handleCopyNegative(inspectorItem)}
              data-testid="copy-negative"
              className="rounded-md border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent"
            >
              Negative
            </button>
          )}
          {typeof inspectorItem.seed === "number" && (
            <button
              type="button"
              onClick={() => void handleCopySeed(inspectorItem)}
              data-testid="copy-seed"
              className="rounded-md border border-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent"
            >
              Seed
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Backwards-compatible export. The old GalleryView name is preserved for any
 * import that still expects it; the visible label has changed to "Media Studio".
 */
export function GalleryView() {
  return <MediaStudioView />;
}
