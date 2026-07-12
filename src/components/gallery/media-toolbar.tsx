/** @fileoverview Toolbar for the Media Studio grid. Hosts search, filter pills,
 * sort select, batch-select toggle, batch action buttons, and the batch count
 * summary. Phase 2B adds the dynamic project picker + bulk action hooks. */

import { Search, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { PillGroup, GhostButton } from "../ui/shared";
import type { MediaFilter, MediaSort } from "../../stores/media-store";
import { formatBytesApprox, estimateItemBytes } from "../../utils/mediaItem";
import type { MediaItem } from "../../types/media";

const FILTER_OPTIONS: Array<{ value: MediaFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "image", label: "Images" },
  { value: "video", label: "Videos" },
  { value: "audio", label: "Audio" },
  { value: "favorites", label: "Favorites" },
  { value: "upscaled", label: "Upscaled" },
  { value: "edited", label: "Edited" },
  { value: "has-recipe", label: "Has recipe" },
  { value: "no-recipe", label: "No recipe" },
  { value: "has-seed", label: "Has seed" },
  { value: "no-seed", label: "No seed" },
  { value: "no-project", label: "Unscoped" },
];

const SORT_OPTIONS: Array<{ value: MediaSort; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "model", label: "Model" },
  { value: "size", label: "Size" },
  { value: "project", label: "Project" },
  { value: "has-recipe", label: "Has recipe" },
  { value: "has-seed", label: "Has seed" },
];

interface MediaToolbarProps {
  query: string;
  onQueryChange: (q: string) => void;
  filter: MediaFilter;
  onFilterChange: (f: MediaFilter) => void;
  sort: MediaSort;
  onSortChange: (s: MediaSort) => void;
  multiSelectMode: boolean;
  onToggleMultiSelect: () => void;
  selectedIds: Set<string>;
  selectedItems: MediaItem[];
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBatchFavorite: () => void;
  onBatchUnfavorite: () => void;
  onBatchDelete: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  totalCount: number;
  // Phase 2B:
  availableProjects?: Array<{ id: string; name: string }>;
  bulkProjectId?: string;
  onBulkProjectIdChange?: (id: string) => void;
  onBatchAssignProject?: () => void;
  onBatchAddTag?: () => void;
  onBatchExport?: () => void;
  onBatchCompare?: () => void;
  compareReady?: boolean;
}

export function MediaToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  multiSelectMode,
  onToggleMultiSelect,
  selectedIds,
  selectedItems,
  onSelectAll,
  onClearSelection,
  onBatchFavorite,
  onBatchUnfavorite,
  onBatchDelete,
  onRefresh,
  refreshing,
  totalCount,
  availableProjects,
  bulkProjectId,
  onBulkProjectIdChange,
  onBatchAssignProject,
  onBatchAddTag,
  onBatchExport,
  onBatchCompare,
  compareReady,
}: MediaToolbarProps) {
  const allFavorited = selectedItems.length > 0 && selectedItems.every((item) => item.favorite);
  const hasSelection = selectedIds.size > 0;
  const projectOptions = [
    { value: "", label: "Unassign" },
    ...(availableProjects ?? []).map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <div className="flex flex-col gap-3 soft-separator-y mesh-surface px-5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search prompts, models, tags, notes…"
            aria-label="Search media"
            className="w-full rounded-lg border border-border bg-surface-elevated py-1.5 pl-8 pr-7 text-[13px] text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <label className="flex items-center gap-1 text-[12px] text-text-muted">
          <span>Sort</span>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as MediaSort)}
            className="rounded-md border border-border bg-surface-elevated px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>

        <GhostButton onClick={onRefresh} ariaLabel="Refresh media library" disabled={refreshing}>
          <span className="flex items-center gap-1.5">
            <span className={cn("inline-block", refreshing && "animate-spin")} aria-hidden="true">↻</span>
            Refresh
          </span>
        </GhostButton>

        <button
          type="button"
          onClick={onToggleMultiSelect}
          aria-pressed={multiSelectMode}
          className={cn(
            "rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
            multiSelectMode
              ? "border-accent bg-accent/15 text-accent"
              : "border-border text-text-secondary hover:border-accent hover:text-accent",
          )}
        >
          {multiSelectMode ? "Exit select" : "Select"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PillGroup
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(v) => onFilterChange(v as MediaFilter)}
          ariaLabel="Filter media"
        />
        <span className="ml-auto text-[12px] text-text-muted">
          {totalCount} item{totalCount === 1 ? "" : "s"}
        </span>
      </div>

      {multiSelectMode && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2"
          data-testid="bulk-action-toolbar"
        >
          <span className="text-[12px] text-text-secondary">
            {selectedIds.size} selected
            {selectedItems.length > 0 && (
              <>
                {" "}·{" "}
                <span className="text-text-muted">
                  {formatBytesApprox(selectedItems.reduce((acc, item) => acc + estimateItemBytes(item), 0))}
                </span>
              </>
            )}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onSelectAll}
              data-testid="bulk-select-all"
              className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={onClearSelection}
              data-testid="bulk-clear-selection"
              className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
            >
              Clear
            </button>
            {onBatchCompare && (
              <button
                type="button"
                onClick={onBatchCompare}
                disabled={!compareReady}
                data-testid="bulk-compare"
                className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Compare
              </button>
            )}
            {onBatchExport && (
              <button
                type="button"
                onClick={onBatchExport}
                disabled={!hasSelection}
                data-testid="bulk-export"
                className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30"
              >
                Export
              </button>
            )}
            {onBatchAddTag && (
              <button
                type="button"
                onClick={onBatchAddTag}
                disabled={!hasSelection}
                data-testid="bulk-add-tag"
                className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30"
              >
                Add tag
              </button>
            )}
            {onBulkProjectIdChange && (
              <label className="flex items-center gap-1 text-[12px] text-text-muted">
                <span>Project</span>
                <select
                  value={bulkProjectId ?? ""}
                  onChange={(e) => onBulkProjectIdChange(e.target.value)}
                  disabled={!hasSelection}
                  data-testid="bulk-project-select"
                  className="rounded-md border border-border bg-surface-elevated px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none disabled:opacity-30"
                >
                  {projectOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            )}
            {onBatchAssignProject && (
              <button
                type="button"
                onClick={onBatchAssignProject}
                disabled={!hasSelection}
                data-testid="bulk-assign-project"
                className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30"
              >
                Apply
              </button>
            )}
            <button
              type="button"
              onClick={onBatchFavorite}
              disabled={!hasSelection}
              data-testid="bulk-favorite"
              className="rounded-md border border-rose-400/30 px-2 py-1 text-[12px] text-rose-300 hover:bg-rose-500/10 disabled:opacity-30"
            >
              {allFavorited ? "Unfavorite" : "Favorite"}
            </button>
            <button
              type="button"
              onClick={onBatchUnfavorite}
              disabled={!hasSelection}
              className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30"
            >
              Unstar
            </button>
            <button
              type="button"
              onClick={onBatchDelete}
              disabled={!hasSelection}
              data-testid="bulk-delete"
              className="rounded-md border border-danger/30 px-2 py-1 text-[12px] text-text-danger hover:bg-danger/10 disabled:opacity-30"
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
