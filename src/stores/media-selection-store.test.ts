/** @fileoverview VERIFY-044 — Phase 2B Media Studio selection store. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  MEDIA_SELECTION_MAX,
  useMediaSelectionStore,
} from "./media-selection-store";

function reset() {
  useMediaSelectionStore.setState({
    selectedMediaIds: [],
    focusedMediaId: null,
    lastSelectedMediaId: null,
    visibleMediaIds: [],
  });
}

describe("media-selection-store (VERIFY-044)", () => {
  beforeEach(() => {
    reset();
  });
  afterEach(() => {
    reset();
  });

  it("selectMedia replaces with a single id and updates focus", () => {
    useMediaSelectionStore.getState().selectMedia("a");
    useMediaSelectionStore.getState().selectMedia("b");
    const s = useMediaSelectionStore.getState();
    expect(s.selectedMediaIds).toEqual(["b"]);
    expect(s.focusedMediaId).toBe("b");
    expect(s.lastSelectedMediaId).toBe("b");
  });

  it("toggleMedia adds, then removes", () => {
    useMediaSelectionStore.getState().toggleMedia("a");
    expect(useMediaSelectionStore.getState().selectedMediaIds).toEqual(["a"]);
    useMediaSelectionStore.getState().toggleMedia("b");
    expect(useMediaSelectionStore.getState().selectedMediaIds).toEqual(["a", "b"]);
    useMediaSelectionStore.getState().toggleMedia("a");
    expect(useMediaSelectionStore.getState().selectedMediaIds).toEqual(["b"]);
  });

  it("toggleMedia ignores empty/falsy ids and does not mutate selection", () => {
    useMediaSelectionStore.getState().toggleMedia("a");
    useMediaSelectionStore.getState().toggleMedia("");
    useMediaSelectionStore.getState().toggleMedia(undefined as unknown as string);
    expect(useMediaSelectionStore.getState().selectedMediaIds).toEqual(["a"]);
  });

  it("selectRange selects the contiguous visible slice", () => {
    const visible = ["v1", "v2", "v3", "v4", "v5"];
    useMediaSelectionStore.getState().selectRange("v2", "v4", visible);
    expect(useMediaSelectionStore.getState().selectedMediaIds).toEqual(["v2", "v3", "v4"]);
  });

  it("selectRange works in reverse order", () => {
    const visible = ["v1", "v2", "v3", "v4", "v5"];
    useMediaSelectionStore.getState().selectRange("v4", "v2", visible);
    expect(useMediaSelectionStore.getState().selectedMediaIds).toEqual(["v2", "v3", "v4"]);
  });

  it("selectRange unions with existing selection up to MEDIA_SELECTION_MAX", () => {
    const visible = ["v1", "v2", "v3", "v4", "v5"];
    useMediaSelectionStore.getState().selectMedia("v1");
    useMediaSelectionStore.getState().selectRange("v4", "v5", visible);
    const ids = useMediaSelectionStore.getState().selectedMediaIds;
    expect(ids).toContain("v1");
    expect(ids).toContain("v4");
    expect(ids).toContain("v5");
    expect(ids.length).toBeLessThanOrEqual(MEDIA_SELECTION_MAX);
  });

  it("selectRange silently no-ops when either id is not visible", () => {
    const visible = ["v1", "v2", "v3"];
    useMediaSelectionStore.getState().selectMedia("v1");
    useMediaSelectionStore.getState().selectRange("v1", "missing", visible);
    expect(useMediaSelectionStore.getState().selectedMediaIds).toEqual(["v1"]);
    useMediaSelectionStore.getState().selectRange("missing", "v2", visible);
    expect(useMediaSelectionStore.getState().selectedMediaIds).toEqual(["v1"]);
  });

  it("selectAllVisible replaces selection with the visible list (capped to MAX)", () => {
    const big = Array.from({ length: 10 }, (_, i) => `v${i}`);
    useMediaSelectionStore.getState().selectAllVisible(big);
    const ids = useMediaSelectionStore.getState().selectedMediaIds;
    expect(ids).toHaveLength(MEDIA_SELECTION_MAX);
    expect(ids[0]).toBe("v0");
  });

  it("clearSelection empties selectedMediaIds but keeps focused/lastSelected", () => {
    useMediaSelectionStore.getState().selectMedia("a");
    useMediaSelectionStore.getState().clearSelection();
    const s = useMediaSelectionStore.getState();
    expect(s.selectedMediaIds).toEqual([]);
    expect(s.focusedMediaId).toBe("a");
    expect(s.lastSelectedMediaId).toBe("a");
  });

  it("reconcileWithVisible drops ids that are no longer in the visible set", () => {
    useMediaSelectionStore.getState().selectAllVisible(["a", "b", "c"]);
    useMediaSelectionStore.getState().reconcileWithVisible(["a", "c"]);
    expect(useMediaSelectionStore.getState().selectedMediaIds).toEqual(["a", "c"]);
  });

  it("reconcileWithVisible is a no-op when all ids remain visible", () => {
    useMediaSelectionStore.getState().selectAllVisible(["a", "b"]);
    useMediaSelectionStore.getState().reconcileWithVisible(["a", "b", "c"]);
    expect(useMediaSelectionStore.getState().selectedMediaIds).toEqual(["a", "b"]);
  });

  it("reconcileWithVisible tolerates a non-array input and falls back to visibleMediaIds", () => {
    useMediaSelectionStore.getState().setVisibleMediaIds(["a", "b"]);
    useMediaSelectionStore.getState().selectAllVisible();
    useMediaSelectionStore.getState().reconcileWithVisible(undefined as unknown as string[]);
    expect(useMediaSelectionStore.getState().selectedMediaIds).toEqual(["a", "b"]);
  });

  it("isCompareReady is true only for 2..4 selected items", () => {
    expect(useMediaSelectionStore.getState().isCompareReady()).toBe(false);
    useMediaSelectionStore.getState().selectMedia("a");
    expect(useMediaSelectionStore.getState().isCompareReady()).toBe(false);
    useMediaSelectionStore.getState().toggleMedia("b");
    expect(useMediaSelectionStore.getState().isCompareReady()).toBe(true);
    useMediaSelectionStore.getState().toggleMedia("c");
    useMediaSelectionStore.getState().toggleMedia("d");
    expect(useMediaSelectionStore.getState().isCompareReady()).toBe(true);
    // MediaSelectionStore caps at MEDIA_SELECTION_MAX = 4, so even if the
    // caller asks for a 5th, compare-ready stays true and the cap is held.
    useMediaSelectionStore.getState().toggleMedia("e");
    expect(useMediaSelectionStore.getState().selectedMediaIds.length).toBe(MEDIA_SELECTION_MAX);
    expect(useMediaSelectionStore.getState().isCompareReady()).toBe(true);
  });

  it("selection does NOT import MediaItem (no store coupling)", () => {
    // The selection store is pure UI state; it must not depend on the
    // MediaItem type. The only allowed import is zustand's create.
    const src = readFileSync(join(__dirname, "media-selection-store.ts"), "utf8");
    const importLines = src
      .split(/\r?\n/)
      .filter((line: string) => /^\s*import\b/.test(line))
      .join("\n");
    expect(importLines).not.toMatch(/from\s+["']\.\.\/types\/media/);
    expect(importLines).not.toMatch(/MediaItem/);
  });

  it("setVisibleMediaIds publishes the visible set without touching selection", () => {
    useMediaSelectionStore.getState().selectAllVisible(["a", "b"]);
    useMediaSelectionStore.getState().setVisibleMediaIds(["a", "b", "c", "d"]);
    expect(useMediaSelectionStore.getState().visibleMediaIds).toEqual(["a", "b", "c", "d"]);
    // Selection unchanged.
    expect(useMediaSelectionStore.getState().selectedMediaIds).toEqual(["a", "b"]);
  });

  it("selectAllVisible with no arg uses the published visible set", () => {
    useMediaSelectionStore.getState().setVisibleMediaIds(["a", "b", "c"]);
    useMediaSelectionStore.getState().selectAllVisible();
    expect(useMediaSelectionStore.getState().selectedMediaIds).toEqual(["a", "b", "c"]);
  });

  it("reconcileWithVisible with no arg uses the published visible set", () => {
    useMediaSelectionStore.getState().selectAllVisible(["a", "b", "c"]);
    useMediaSelectionStore.getState().setVisibleMediaIds(["a", "b"]);
    useMediaSelectionStore.getState().reconcileWithVisible();
    expect(useMediaSelectionStore.getState().selectedMediaIds).toEqual(["a", "b"]);
  });

  // Edge cases and pure selectors coverage
  it("selectMedia does nothing if id is falsy", () => {
    useMediaSelectionStore.getState().selectMedia("");
    expect(useMediaSelectionStore.getState().selectedMediaIds).toEqual([]);
  });

  it("selectRange does nothing if inputs are invalid", () => {
    const s = useMediaSelectionStore.getState();
    s.selectRange("", "b", ["a", "b"]);
    s.selectRange("a", "", ["a", "b"]);
    s.selectRange("a", "b", []);
    s.selectRange("a", "b", null as any);
    expect(s.selectedMediaIds).toEqual([]);
  });

  it("selectRange does nothing if fromIdx or toIdx is negative", () => {
    const s = useMediaSelectionStore.getState();
    s.selectRange("missing", "b", ["a", "b"]);
    s.selectRange("a", "missing", ["a", "b"]);
    expect(s.selectedMediaIds).toEqual([]);
  });

  it("selectAllVisible does nothing if source is not an array", () => {
    useMediaSelectionStore.getState().selectAllVisible(null as any);
    expect(useMediaSelectionStore.getState().selectedMediaIds).toEqual([]);
  });

  it("selectAllVisible preserves focused/lastSelected if they remain in visible set", () => {
    useMediaSelectionStore.getState().setFocusedMedia("b");
    useMediaSelectionStore.getState().selectAllVisible(["a", "b", "c"]);
    const s = useMediaSelectionStore.getState();
    expect(s.focusedMediaId).toBe("b");
    expect(s.lastSelectedMediaId).toBe("b");
  });

  it("selectAllVisible clears focused/lastSelected if they are not in visible set", () => {
    useMediaSelectionStore.getState().setFocusedMedia("x");
    useMediaSelectionStore.getState().selectAllVisible(["a", "b", "c"]);
    const s = useMediaSelectionStore.getState();
    expect(s.focusedMediaId).toBe(null);
    expect(s.lastSelectedMediaId).toBe(null);
  });

  it("setFocusedMedia sets focused and lastSelected", () => {
    useMediaSelectionStore.getState().setFocusedMedia("a");
    const s = useMediaSelectionStore.getState();
    expect(s.focusedMediaId).toBe("a");
    expect(s.lastSelectedMediaId).toBe("a");

    useMediaSelectionStore.getState().setFocusedMedia(null);
    const s2 = useMediaSelectionStore.getState();
    expect(s2.focusedMediaId).toBe(null);
    expect(s2.lastSelectedMediaId).toBe(null);
  });

  it("setVisibleMediaIds does nothing if not an array", () => {
    useMediaSelectionStore.getState().setVisibleMediaIds(["a", "b"]);
    useMediaSelectionStore.getState().setVisibleMediaIds(null as any);
    expect(useMediaSelectionStore.getState().visibleMediaIds).toEqual(["a", "b"]);
  });
});

import {
  selectSelectionCount,
  selectIsSelectionEmpty,
  selectCompareReady,
  selectHasSelection
} from "./media-selection-store";

describe("Pure selectors for media-selection-store", () => {
  const createState = (ids: string[]) => ({
    selectedMediaIds: ids,
    focusedMediaId: null,
    lastSelectedMediaId: null,
    visibleMediaIds: []
  }) as any;

  it("selectSelectionCount returns the correct length", () => {
    expect(selectSelectionCount(createState([]))).toBe(0);
    expect(selectSelectionCount(createState(["a", "b"]))).toBe(2);
  });

  it("selectIsSelectionEmpty returns true if empty", () => {
    expect(selectIsSelectionEmpty(createState([]))).toBe(true);
    expect(selectIsSelectionEmpty(createState(["a"]))).toBe(false);
  });

  it("selectCompareReady returns true for 2..MAX items", () => {
    expect(selectCompareReady(createState([]))).toBe(false);
    expect(selectCompareReady(createState(["a"]))).toBe(false);
    expect(selectCompareReady(createState(["a", "b"]))).toBe(true);
    expect(selectCompareReady(createState(["a", "b", "c", "d", "e"]))).toBe(false);
  });

  it("selectHasSelection returns true if not empty", () => {
    expect(selectHasSelection(createState([]))).toBe(false);
    expect(selectHasSelection(createState(["a"]))).toBe(true);
  });
});
