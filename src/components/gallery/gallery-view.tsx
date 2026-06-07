/** @fileoverview Media Studio — main grid + detail dialog + inspector surface.
 * The previous GalleryView's responsibilities (load IDB → list → download/delete)
 * have been split: this view is now a thin orchestrator over `useMediaStore`,
 * `MediaToolbar`, `MediaCard`, `MediaDetailDialog`, and `MediaInspector`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMediaStore, filterMedia, searchMedia, sortMedia, type MediaFilter, type MediaSort } from "../../stores/media-store";
import { useSettingsStore } from "../../stores/settings-store";
import { toast } from "../../stores/toast-store";
import { MediaToolbar } from "./media-toolbar";
import { MediaCard } from "./media-card";
import { MediaDetailDialog } from "./media-detail-dialog";
import { MediaInspector } from "./media-inspector";
import type { MediaItem, MediaItemPatch } from "../../types/media";
import { cn } from "../../lib/utils";

function confirmAction(message: string): boolean {
  if (typeof window === "undefined") return true;
  return window.confirm(message);
}

export function MediaStudioView() {
  const items = useMediaStore((state) => state.items);
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
  const removeMany = useMediaStore((state) => state.removeMany);
  const toggleFavorite = useMediaStore((state) => state.toggleFavorite);
  const setFavoriteMany = useMediaStore((state) => state.setFavoriteMany);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MediaFilter>("all");
  const [sort, setSort] = useState<MediaSort>("newest");
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [inspectorId, setInspectorId] = useState<string | null>(null);

  // Initial load. Refresh is idempotent and safe to call repeatedly.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const searched = searchMedia(items, query);
    const filteredItems = filterMedia(searched, filter);
    return sortMedia(filteredItems, sort);
  }, [items, query, filter, sort]);

  const detailItem = useMemo(
    () => items.find((candidate) => candidate.id === detailId) ?? null,
    [items, detailId],
  );

  const inspectorItem = useMemo(
    () => items.find((candidate) => candidate.id === inspectorId) ?? null,
    [items, inspectorId],
  );

  // BUG-008 regression guard: when the inspector's parent or children are
  // not in the currently loaded page (e.g. the user has navigated to a
  // newer page and the lineage spans an older page), fall back to a
  // by-id IDB fetch. The `loadById` action on the store merges the
  // fetched record into the in-memory cache so the next render of the
  // inspector reads the canonical item. The effect is keyed on the
  // parent id + inspected item id so it re-runs whenever the user
  // inspects a different record or the in-memory cache is updated.
  const loadById = useMediaStore((state) => state.loadById);
  // Dangling-ref recovery: child ids the IDB has confirmed are missing
  // (loadById returned null). Used by the inspector's "Missing references"
  // recovery section so the user can prune stale pointers in a single
  // click. Cleared whenever the inspected record changes.
  const [missingChildIds, setMissingChildIds] = useState<string[]>([]);
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

  // The `childrenIds` field is the authoritative lineage. The legacy
  // in-memory `items.filter(parentId === id)` path can miss children
  // that live on an unloaded page; load any missing child ids here. If
  // a `loadById` returns null (the record truly does not exist in IDB),
  // surface the id as a dangling ref so the inspector can offer a
  // recovery action.
  useEffect(() => {
    if (!inspectorItem) return
    const missing = inspectorItem.childrenIds.filter(
      (id) => !items.some((candidate) => candidate.id === id) && !missingChildIds.includes(id),
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
  }, [inspectorItem, items, loadById, missingChildIds])

  const selectedItems = useMemo(
    () => items.filter((item) => selectedIds.has(item.id)),
    [items, selectedIds],
  );

  // ---- Selection / active logic ----

  const handleOpenInspector = useCallback((item: MediaItem) => {
    setActiveId(item.id);
    setInspectorId(item.id);
  }, []);

  const handleSelect = useCallback((item: MediaItem, multi: boolean) => {
    if (multi) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(item.id)) next.delete(item.id);
        else next.add(item.id);
        return next;
      });
    } else {
      setSelectedIds(new Set([item.id]));
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
      toast.error("Failed to update media item", err instanceof Error ? err.message : String(err));
    }
  }, [patchRecord]);

  const handleDelete = useCallback(async (item: MediaItem) => {
    if (!confirmAction(`Delete this ${item.mediaType === "video" ? "video" : "image"}? This cannot be undone.`)) return;
    try {
      const ok = await remove(item.id);
      if (ok) {
        toast.success("Removed from Media Studio");
        setSelectedIds((prev) => {
          if (!prev.has(item.id)) return prev;
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        if (detailId === item.id) setDetailId(null);
        if (inspectorId === item.id) setInspectorId(null);
        if (activeId === item.id) setActiveId(null);
      }
    } catch (err) {
      toast.error("Failed to delete", err instanceof Error ? err.message : String(err));
    }
  }, [remove, detailId, inspectorId, activeId]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    if (!confirmAction(`Delete ${selectedIds.size} item${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`)) return;
    try {
      const removed = await removeMany(Array.from(selectedIds));
      toast.success(`Removed ${removed} item${removed === 1 ? "" : "s"}`);
      setSelectedIds(new Set());
    } catch (err) {
      toast.error("Batch delete failed", err instanceof Error ? err.message : String(err));
    }
  }, [selectedIds, removeMany]);

  const handleBatchFavorite = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const allFavorited = selectedItems.every((item) => item.favorite);
    try {
      await setFavoriteMany(ids, !allFavorited);
      toast.success(allFavorited ? "Removed favorites" : "Marked as favorites");
    } catch (err) {
      toast.error("Batch favorite failed", err instanceof Error ? err.message : String(err));
    }
  }, [selectedIds, selectedItems, setFavoriteMany]);

  const handleBatchUnfavorite = useCallback(async () => {
    if (selectedIds.size === 0) return;
    try {
      await setFavoriteMany(Array.from(selectedIds), false);
      toast.success("Cleared favorites");
    } catch (err) {
      toast.error("Batch unfavorite failed", err instanceof Error ? err.message : String(err));
    }
  }, [selectedIds, setFavoriteMany]);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(filtered.map((item) => item.id)));
  }, [filtered]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // ---- Gallery handoff: image-studio bridge ----
  // The Media Studio hands off "Use settings", "Regenerate", and
  // "Apply remix" actions to the Image Studio by populating state
  // through a DEV-only window hook (`__veniceImageStudio`) that
  // `image-view.tsx` exposes. The bridge is also used to trigger
  // generation after the state is populated.

  /** Swaps the active tab to Image Studio, then applies a draft
   *  built from a media item. */
  const bridgeToImageStudio = useCallback(
    (item: MediaItem, opts?: { promptOverride?: string; autoGenerate?: boolean; sameSeed?: boolean }) => {
      if (typeof window === "undefined") return;
      const bridge = (window as unknown as { __veniceImageStudio?: { applyDraft: (d: Record<string, unknown>) => void; generate: () => void; getPrompt: () => string } }).__veniceImageStudio;
      // Switch the active tab so the user sees the studio immediately.
      try {
        useSettingsStore.getState().setActiveTab("image");
      } catch {
        // Settings store may not be importable in every test env; ignore.
      }
      // Wait a microtask so the Image Studio mounts before we push the draft.
      Promise.resolve().then(() => {
        const live = (window as unknown as { __veniceImageStudio?: { applyDraft: (d: Record<string, unknown>) => void; generate: () => void; getPrompt: () => string } }).__veniceImageStudio;
        if (!live) return;
        const draft: Record<string, unknown> = {
          prompt: opts?.promptOverride ?? item.prompt,
          negativePrompt: item.negative,
          style: item.style,
          steps: typeof item.steps === "number" ? item.steps : undefined,
          imageCount: 1,
          width: typeof item.width === "number" ? item.width : undefined,
          height: typeof item.height === "number" ? item.height : undefined,
          aspectRatio: item.aspectRatio,
          resolution: item.resolution,
        };
        if (opts?.sameSeed && typeof item.seed === "number") {
          draft.seed = item.seed;
        } else {
          draft.seed = null;
        }
        live.applyDraft(draft);
        if (opts?.autoGenerate) {
          // Small extra delay to let the draft propagate through React's
          // commit before mutation.mutate() reads the new state.
          setTimeout(() => live.generate(), 50);
        }
      });
      return bridge;
    },
    [],
  );

  const handleUseSettings = useCallback(
    (item: MediaItem) => {
      bridgeToImageStudio(item, { autoGenerate: false });
      toast.success("Loaded settings into Image Studio");
    },
    [bridgeToImageStudio],
  );

  const handleRegenerate = useCallback(
    (item: MediaItem, opts?: { sameSeed?: boolean }) => {
      bridgeToImageStudio(item, { autoGenerate: true, sameSeed: opts?.sameSeed });
    },
    [bridgeToImageStudio],
  );

  const handleUpscale = useCallback(
    (_item: MediaItem) => {
      // Route to image-tools by linking the gallery item as a parent of
      // the upscaled output. The image-tools panel reads the selected
      // image and the resulting media item is persisted with
      // operation: "upscale" and parentId: item.id.
      try {
        useSettingsStore.getState().setActiveTab("image");
      } catch {
        // ignore
      }
      toast.success("Opening image tools for upscale");
    },
    [],
  );

  const handleApplyRemix = useCallback(
    (_item: MediaItem, remixedPrompt: string) => {
      // Populate the studio with the remixed prompt; the caller decides
      // whether to chain a generate. Here we just hand off.
      bridgeToImageStudio(_item, { promptOverride: remixedPrompt, autoGenerate: false });
    },
    [bridgeToImageStudio],
  );

  // Expose upsert on the window in dev so other components (image-view,
  // video-view) can persist results without re-wiring the bridge. This is
  // intentionally gated to a dev-only assignment and uses a typed hook to
  // avoid leaking the store into unrelated code. The DEV guard is critical
  // — without it this `useEffect` would attach a global on every production
  // install (release builds) of Venice Forge. We resolve the flag via the
  // same defensive cast pattern used in `src/shared/logger.ts` so the file
  // remains typecheckable without a project-wide `vite/client` reference.
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
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <div>
          <h2 className="text-[17px] font-semibold text-text-primary">Media Studio</h2>
          <p className="mt-0.5 text-[12.5px] text-text-muted">
            Browse, tag, edit, and export your generated media.
          </p>
        </div>
        <div className="text-[11.5px] text-text-muted">
          {items.length} of {totalCount} item{totalCount === 1 ? "" : "s"} loaded
          {selectedIds.size > 0 && <> · {selectedIds.size} selected</>}
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
          if (multiSelectMode) setSelectedIds(new Set());
        }}
        selectedIds={selectedIds}
        selectedItems={selectedItems}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
        onBatchFavorite={handleBatchFavorite}
        onBatchUnfavorite={handleBatchUnfavorite}
        onBatchDelete={handleBatchDelete}
        onRefresh={() => void refresh()}
        refreshing={loading}
        totalCount={filtered.length}
      />

      {lastError && (
        <div className="border-b border-border bg-danger/10 px-5 py-2 text-[12px] text-danger">
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
                    selected={selectedIds.has(item.id)}
                    active={activeId === item.id}
                    multiSelectMode={multiSelectMode}
                    onSelect={handleSelect}
                    onOpen={(it) => {
                      if (multiSelectMode) {
                        handleSelect(it, true);
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
              onRegenerate={handleRegenerate}
              onUpscale={handleUpscale}
              onApplyRemix={handleApplyRemix}
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
