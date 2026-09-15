import { translateRuntime } from "../../i18n/runtimeTranslator";
/** @fileoverview Toolbar for the Media Studio grid. Hosts search, filter pills,
 * sort select, batch-select toggle, batch action buttons, and the batch count
 * summary. Phase 2B adds the dynamic project picker + bulk action hooks. */

import { Search, X } from "lucide-react";
import { cn } from "../../lib/utils";
import { PillGroup, GhostButton } from "../ui/shared";
import { IconButton, Pill, Toolbar } from "../ui/primitives";
import type { MediaFilter, MediaSort } from "../../stores/media-store";
import { formatBytesApprox, estimateItemBytes } from "../../utils/mediaItem";
import type { MediaItem } from "../../types/media";
import { Trans, useTranslation } from "react-i18next";

const FILTER_OPTIONS: Array<{ value: MediaFilter; label: string }> = [
  {
    value: "all",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.all",
        "All",
      );
    },
  },
  {
    value: "image",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.images",
        "Images",
      );
    },
  },
  {
    value: "video",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.videos",
        "Videos",
      );
    },
  },
  {
    value: "audio",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.audio",
        "Audio",
      );
    },
  },
  {
    value: "favorites",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.favorites",
        "Favorites",
      );
    },
  },
  {
    value: "upscaled",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.upscaled",
        "Upscaled",
      );
    },
  },
  {
    value: "edited",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.edited",
        "Edited",
      );
    },
  },
  {
    value: "has-recipe",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.hasRecipe",
        "Has recipe",
      );
    },
  },
  {
    value: "no-recipe",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.noRecipe",
        "No recipe",
      );
    },
  },
  {
    value: "has-seed",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.hasSeed",
        "Has seed",
      );
    },
  },
  {
    value: "no-seed",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.noSeed",
        "No seed",
      );
    },
  },
  {
    value: "no-project",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.unscoped",
        "Unscoped",
      );
    },
  },
];

const SORT_OPTIONS: Array<{ value: MediaSort; label: string }> = [
  {
    value: "newest",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.newest",
        "Newest",
      );
    },
  },
  {
    value: "oldest",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.oldest",
        "Oldest",
      );
    },
  },
  {
    value: "model",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.model",
        "Model",
      );
    },
  },
  {
    value: "size",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.size",
        "Size",
      );
    },
  },
  {
    value: "project",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.project",
        "Project",
      );
    },
  },
  {
    value: "has-recipe",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.hasRecipe",
        "Has recipe",
      );
    },
  },
  {
    value: "has-seed",
    get label() {
      return translateRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.hasSeed",
        "Has seed",
      );
    },
  },
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
  const { t: tRuntime } = useTranslation("common");
  const allFavorited =
    selectedItems.length > 0 && selectedItems.every((item) => item.favorite);
  const hasSelection = selectedIds.size > 0;
  const projectOptions = [
    {
      value: "",
      label: tRuntime(
        "runtimeGenerated.components.gallery.mediaToolbar.metadata.unassign",
      ),
    },
    ...(availableProjects ?? []).map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <div className="flex flex-col gap-3 border-b border-vf-panel-border bg-vf-panel-bg px-5 py-3">
      <Toolbar
        bare
        aria-label={tRuntime(
          "runtimeGenerated.components.gallery.mediaToolbar.attribute.searchMedia",
        )}
        className="w-full flex-wrap"
      >
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder={tRuntime(
              "runtimeGenerated.components.gallery.mediaToolbar.attribute.searchPromptsModelsTagsNotes",
            )}
            aria-label={tRuntime(
              "runtimeGenerated.components.gallery.mediaToolbar.attribute.searchMedia",
            )}
            className="w-full rounded-md border border-vf-panel-border bg-vf-panel-bg-raised py-1.5 pl-8 pr-9 text-[13px] text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          {query && (
            <IconButton
              onClick={() => onQueryChange("")}
              ariaLabel={tRuntime(
                "runtimeGenerated.components.gallery.mediaToolbar.attribute.clearSearch",
              )}
              icon={<X />}
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2"
            />
          )}
        </div>

        <label htmlFor="media-toolbar-sort" className="flex items-center gap-1 text-[12px] text-text-muted">
          <span>
            <Trans i18nKey="common:surface.componentsGalleryMediaToolbar.text.sort" />
          </span>
          <select
            id="media-toolbar-sort"
            value={sort}
            onChange={(e) => onSortChange(e.target.value as MediaSort)}
            className="rounded-md border border-vf-panel-border bg-vf-panel-bg-raised px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <GhostButton
          onClick={onRefresh}
          ariaLabel="Refresh media library"
          disabled={refreshing}
        >
          <span className="flex items-center gap-1.5">
            <span
              className={cn("inline-block", refreshing && "animate-spin")}
              aria-hidden="true"
            >
              ↻
            </span>
            <Trans i18nKey="common:surface.componentsGalleryMediaToolbar.text.refresh" />
          </span>
        </GhostButton>

        <button
          type="button"
          onClick={onToggleMultiSelect}
          aria-pressed={multiSelectMode}
          className={cn(
            "rounded-md border px-2.5 py-1.5 text-[12px] font-medium transition-colors",
            multiSelectMode
              ? "border border-accent/40 bg-accent/15 text-accent shadow-[0_0_8px_var(--color-vf-accent-glow-subtle)]"
              : "bg-vf-panel-bg border border-vf-panel-border text-text-secondary hover:text-text-primary hover:bg-vf-control-hover",
          )}
        >
          {multiSelectMode
            ? tRuntime(
                "runtimeGenerated.components.gallery.mediaToolbar.text.exitSelect",
              )
            : tRuntime(
                "runtimeGenerated.components.gallery.mediaToolbar.text.select",
              )}
        </button>
      </Toolbar>

      <div className="flex flex-wrap items-center gap-2">
        <PillGroup
          options={FILTER_OPTIONS}
          value={filter}
          onChange={(v) => onFilterChange(v as MediaFilter)}
          ariaLabel="Filter media"
        />
        <Pill className="ml-auto">
          {totalCount}{" "}
          <Trans i18nKey="common:surface.componentsGalleryMediaToolbar.text.item" />
          {totalCount === 1 ? "" : "s"}
        </Pill>
      </div>

      {multiSelectMode && (
        <Toolbar
          bare
          aria-label={tRuntime(
            "surface.componentsGalleryMediaToolbar.text.selected",
          )}
          className="w-full flex-wrap rounded-md border border-vf-panel-border bg-vf-panel-bg-raised px-3 py-2"
          data-testid="bulk-action-toolbar"
        >
          <Pill>
            {selectedIds.size}{" "}
            <Trans i18nKey="common:surface.componentsGalleryMediaToolbar.text.selected" />
            {selectedItems.length > 0 && (
              <>
                {" "}
                ·{" "}
                <span className="text-text-muted">
                  {formatBytesApprox(
                    selectedItems.reduce(
                      (acc, item) => acc + estimateItemBytes(item),
                      0,
                    ),
                  )}
                </span>
              </>
            )}
          </Pill>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onSelectAll}
              data-testid="bulk-select-all"
              className="rounded-md border border-vf-panel-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
            >
              <Trans i18nKey="common:surface.componentsGalleryMediaToolbar.action.selectAll" />
            </button>
            <button
              type="button"
              onClick={onClearSelection}
              data-testid="bulk-clear-selection"
              className="rounded-md border border-vf-panel-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
            >
              <Trans i18nKey="common:surface.componentsGalleryMediaToolbar.action.clear" />
            </button>
            {onBatchCompare && (
              <button
                type="button"
                onClick={onBatchCompare}
                disabled={!compareReady}
                data-testid="bulk-compare"
                className="rounded-md border border-vf-panel-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <Trans i18nKey="common:surface.componentsGalleryMediaToolbar.action.compare" />
              </button>
            )}
            {onBatchExport && (
              <button
                type="button"
                onClick={onBatchExport}
                disabled={!hasSelection}
                data-testid="bulk-export"
                className="rounded-md border border-vf-panel-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30"
              >
                <Trans i18nKey="common:surface.componentsGalleryMediaToolbar.action.export" />
              </button>
            )}
            {onBatchAddTag && (
              <button
                type="button"
                onClick={onBatchAddTag}
                disabled={!hasSelection}
                data-testid="bulk-add-tag"
                className="rounded-md border border-vf-panel-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30"
              >
                <Trans i18nKey="common:surface.componentsGalleryMediaToolbar.action.addTag" />
              </button>
            )}
            {onBulkProjectIdChange && (
              <label htmlFor="media-toolbar-project" className="flex items-center gap-1 text-[12px] text-text-muted">
                <span>
                  <Trans i18nKey="common:surface.componentsGalleryMediaToolbar.text.project" />
                </span>
                <select
                  id="media-toolbar-project"
                  value={bulkProjectId ?? ""}
                  onChange={(e) => onBulkProjectIdChange(e.target.value)}
                  disabled={!hasSelection}
                  data-testid="bulk-project-select"
                  className="rounded-md border border-vf-panel-border bg-vf-panel-bg-raised px-2 py-1 text-[12px] text-text-primary focus:border-accent focus:outline-none disabled:opacity-30"
                >
                  {projectOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
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
                className="rounded-md border border-vf-panel-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30"
              >
                <Trans i18nKey="common:surface.componentsGalleryMediaToolbar.action.apply" />
              </button>
            )}
            <button
              type="button"
              onClick={onBatchFavorite}
              disabled={!hasSelection}
              data-testid="bulk-favorite"
              className="rounded-md border border-danger/30 px-2 py-1 text-[12px] text-danger hover:bg-danger/10 disabled:opacity-30"
            >
              {allFavorited
                ? tRuntime(
                    "runtimeGenerated.components.gallery.mediaToolbar.text.unfavorite",
                  )
                : tRuntime(
                    "runtimeGenerated.components.gallery.mediaToolbar.text.favorite",
                  )}
            </button>
            <button
              type="button"
              onClick={onBatchUnfavorite}
              disabled={!hasSelection}
              className="rounded-md border border-vf-panel-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30"
            >
              <Trans i18nKey="common:surface.componentsGalleryMediaToolbar.action.unstar" />
            </button>
            <button
              type="button"
              onClick={onBatchDelete}
              disabled={!hasSelection}
              data-testid="bulk-delete"
              className="rounded-md border border-danger/30 px-2 py-1 text-[12px] text-text-danger hover:bg-danger/10 disabled:opacity-30"
            >
              <Trans i18nKey="common:surface.componentsGalleryMediaToolbar.action.delete" />
            </button>
          </div>
        </Toolbar>
      )}
    </div>
  );
}
