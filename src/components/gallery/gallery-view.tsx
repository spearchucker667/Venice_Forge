/** @fileoverview Media Studio — main grid + detail dialog + inspector surface.
 * The previous GalleryView's responsibilities (load IDB → list → download/delete)
 * have been split: this view is now a thin orchestrator over `useMediaStore`,
 * `MediaToolbar`, `MediaCard`, `MediaDetailDialog`, and `MediaInspector`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMediaStore, filterMedia, searchMedia, sortMedia, type MediaFilter, type MediaSort } from "../../stores/media-store";
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
  const lastError = useMediaStore((state) => state.lastError);
  const refresh = useMediaStore((state) => state.refresh);
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
          {items.length} item{items.length === 1 ? "" : "s"} in library
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
        </main>

        {inspectorItem && (
          <div className="hidden w-80 shrink-0 lg:block">
            <MediaInspector
              item={inspectorItem}
              parentItem={inspectorItem.parentId ? items.find((candidate) => candidate.id === inspectorItem.parentId) ?? null : null}
              childrenItems={items.filter((candidate) => candidate.parentId === inspectorItem.id)}
              onPatch={handlePatch}
              onDelete={(it) => void handleDelete(it)}
              onOpenChild={handleOpenDetail}
              onOpenParent={handleOpenDetail}
              onClose={() => setInspectorId(null)}
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
