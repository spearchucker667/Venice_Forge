/** @fileoverview Phase 2B Media Studio selection store.
 *
 * Lifts multi-select state out of `gallery-view.tsx` so the Command
 * Palette, compare mode, and bulk actions can read and mutate the
 * selection without prop-drilling. Selection is *purely* UI state — it
 * never mutates `MediaItem` records.
 *
 * Invariants:
 *   - `selectedMediaIds` is always deduplicated and ordered by insertion.
 *   - `reconcileWithVisible(visibleIds)` removes ids that are no longer
 *     in the visible result set (filter/project/search changed) without
 *     throwing. Callers should invoke it whenever the filtered list
 *     shape changes.
 *   - Range selection uses the *visible* ordering so Shift-click on a
 *     later item from a current item selects the contiguous slice.
 *   - `setFocusedMedia` is a separate, optional "last clicked" pointer
 *     used for keyboard navigation; it is NOT included in the selection.
 */

import { create } from "zustand";

export const MEDIA_SELECTION_MAX = 4;

export interface MediaSelectionState {
  /** Ordered, deduplicated list of selected media ids. */
  selectedMediaIds: string[];
  /** Last clicked/inspected media id; used as the range-select anchor. */
  focusedMediaId: string | null;
  /** Last successfully selected media id (may equal focused). */
  lastSelectedMediaId: string | null;
  /** Phase 2B: live snapshot of the currently-visible media ids,
   *  published by the gallery-view whenever the filtered list shape
   *  changes. The Command Palette reads this when the user runs
   *  "Select all visible media" so it does not need prop-drilling. */
  visibleMediaIds: string[];

  selectMedia: (id: string) => void;
  toggleMedia: (id: string) => void;
  selectRange: (fromId: string, toId: string, visibleIds: string[]) => void;
  selectAllVisible: (ids?: string[]) => void;
  clearSelection: () => void;
  setFocusedMedia: (id: string | null) => void;
  /** Drops any selected ids that are not in the supplied visible set. */
  reconcileWithVisible: (visibleIds?: string[]) => void;
  /** True when 2..4 items are selected (compare-mode precondition). */
  isCompareReady: () => boolean;
  /** Phase 2B: called by the gallery-view on every filter/search/sort
   *  change. Updates `visibleMediaIds` and prunes the selection. */
  setVisibleMediaIds: (ids: string[]) => void;
}

function dedupe(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

function intersect(ids: string[], visibleIds: string[]): string[] {
  const visible = new Set(visibleIds);
  return ids.filter((id) => visible.has(id));
}

export const useMediaSelectionStore = create<MediaSelectionState>((set, get) => ({
  selectedMediaIds: [],
  focusedMediaId: null,
  lastSelectedMediaId: null,
  visibleMediaIds: [],

  selectMedia: (id) => {
    set((state) => {
      if (!id) return state;
      // Replace selection with this single id. Bounded by MAX for compare.
      return {
        selectedMediaIds: [id],
        focusedMediaId: id,
        lastSelectedMediaId: id,
      };
    });
  },

  toggleMedia: (id) => {
    if (!id) return;
    set((state) => {
      const has = state.selectedMediaIds.includes(id);
      let nextSelection: string[];
      if (has) {
        nextSelection = state.selectedMediaIds.filter((existing) => existing !== id);
      } else {
        // Cap to MEDIA_SELECTION_MAX on every add so compare-mode cannot be
        // silently broken by a runaway toggle.
        nextSelection = dedupe([...state.selectedMediaIds, id]).slice(0, MEDIA_SELECTION_MAX);
      }
      return {
        selectedMediaIds: nextSelection,
        focusedMediaId: id,
        lastSelectedMediaId: id,
      };
    });
  },

  selectRange: (fromId, toId, visibleIds) => {
    if (!fromId || !toId || !Array.isArray(visibleIds) || visibleIds.length === 0) {
      return;
    }
    const fromIdx = visibleIds.indexOf(fromId);
    const toIdx = visibleIds.indexOf(toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [lo, hi] = fromIdx <= toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx];
    const slice = visibleIds.slice(lo, hi + 1);
    set((state) => {
      const union = dedupe([...state.selectedMediaIds, ...slice]);
      // Hard-cap to MEDIA_SELECTION_MAX so the compare-mode precondition
      // is never silently broken. The toolbar surfaces the live count.
      const capped = union.slice(0, MEDIA_SELECTION_MAX);
      return {
        selectedMediaIds: capped,
        focusedMediaId: toId,
        lastSelectedMediaId: toId,
      };
    });
  },

  selectAllVisible: (ids) => {
    const source = Array.isArray(ids) ? ids : get().visibleMediaIds;
    if (!Array.isArray(source)) return;
    set((state) => ({
      // Replace; do not preserve ids outside the new visible set.
      selectedMediaIds: dedupe(source).slice(0, MEDIA_SELECTION_MAX),
      // Preserve focused/last-selected if they remain in the new set.
      focusedMediaId: state.focusedMediaId && source.includes(state.focusedMediaId)
        ? state.focusedMediaId
        : null,
      lastSelectedMediaId: state.lastSelectedMediaId && source.includes(state.lastSelectedMediaId)
        ? state.lastSelectedMediaId
        : null,
    }));
  },

  clearSelection: () => {
    set({ selectedMediaIds: [] });
    // Note: focused/lastSelected are intentionally NOT cleared so the
    // user can re-select via range without re-clicking. Toolbar callers
    // can pass `clearFocus: true` if they want a full reset.
  },

  setFocusedMedia: (id) => {
    set({ focusedMediaId: id, lastSelectedMediaId: id ?? null });
  },

  reconcileWithVisible: (visibleIds) => {
    const source = Array.isArray(visibleIds) ? visibleIds : get().visibleMediaIds;
    if (!Array.isArray(source)) return;
    set((state) => {
      const filtered = intersect(state.selectedMediaIds, source);
      // If selection changed, we lost nothing if filtered has the same
      // length; otherwise drop the invisible ids.
      if (filtered.length === state.selectedMediaIds.length) return state;
      return { selectedMediaIds: filtered };
    });
  },

  isCompareReady: () => {
    const len = get().selectedMediaIds.length;
    return len >= 2 && len <= MEDIA_SELECTION_MAX;
  },

  setVisibleMediaIds: (ids) => {
    if (!Array.isArray(ids)) return;
    set({ visibleMediaIds: dedupe(ids) });
  },
}));

/** Pure selectors. */
export const selectSelectionCount = (state: MediaSelectionState): number =>
  state.selectedMediaIds.length;
export const selectIsSelectionEmpty = (state: MediaSelectionState): boolean =>
  state.selectedMediaIds.length === 0;
export const selectCompareReady = (state: MediaSelectionState): boolean => {
  const len = state.selectedMediaIds.length;
  return len >= 2 && len <= MEDIA_SELECTION_MAX;
};
export const selectHasSelection = (state: MediaSelectionState): boolean =>
  state.selectedMediaIds.length > 0;
