/** @fileoverview VERIFY-044 — CompareView (Phase 2B compare mode). */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompareView, buildCompareRowsForTest } from "./compare-view";
import { MEDIA_ITEM_VERSION, type MediaItem } from "../../types/media";
import { MEDIA_SELECTION_MAX } from "../../stores/media-selection-store";

function makeItem(over: Partial<MediaItem> = {}, id: string): MediaItem {
  return {
    id,
    image: "data:image/png;base64,AA",
    prompt: "p",
    model: "flux-dev",
    timestamp: 1,
    mediaType: "image",
    operation: "generate",
    parentId: null,
    childrenIds: [],
    tags: [],
    note: "",
    favorite: false,
    mediaItemVersion: MEDIA_ITEM_VERSION,
    ...over,
  } as MediaItem;
}

describe("CompareView (VERIFY-044)", () => {
  it("renders the disabled state for fewer than 2 items", () => {
    render(<CompareView items={[]} />);
    expect(screen.getByTestId("compare-view-disabled")).toBeInTheDocument();
  });

  it("renders the disabled state when more than 4 items are supplied", () => {
    const items = Array.from({ length: MEDIA_SELECTION_MAX + 1 }, (_, i) => makeItem({ id: `m${i}` }, `m${i}`));
    render(<CompareView items={items} />);
    expect(screen.getByTestId("compare-view-disabled")).toBeInTheDocument();
  });

  it("renders the table for 2..4 items", () => {
    const items = [
      makeItem({ id: "a", prompt: "A copper city" }, "a"),
      makeItem({ id: "b", prompt: "A copper city" }, "b"),
    ];
    render(<CompareView items={items} />);
    expect(screen.getByTestId("compare-view")).toBeInTheDocument();
  });

  it("marks same fields as same and different fields as different", () => {
    const items = [
      makeItem({ id: "a", model: "flux-dev", seed: 42 }, "a"),
      makeItem({ id: "b", model: "flux-dev", seed: 99 }, "b"),
    ];
    render(<CompareView items={items} />);
    const modelRow = screen.getByTestId("compare-row-model");
    const seedRow = screen.getByTestId("compare-row-seed");
    expect(modelRow.dataset.same).toBe("true");
    expect(seedRow.dataset.same).toBe("false");
  });

  it("renders missing fields as —", () => {
    const items = [
      makeItem({ id: "a", seed: 42 }, "a"),
      makeItem({ id: "b" }, "b"), // no seed
    ];
    render(<CompareView items={items} />);
    // The seed row exists and is present.
    const seedRow = screen.getByTestId("compare-row-seed");
    expect(seedRow).toBeInTheDocument();
    // Per the data, the row should be different (one has, one doesn't).
    expect(seedRow.dataset.same).toBe("false");
  });

  it("renders a recipe section for items with stored recipes", () => {
    const items = [
      makeItem({
        id: "a",
        recipe: { prompt: "Stored A", model: "flux-dev", width: 1024, height: 1024, seed: 0 },
      }, "a"),
      makeItem({
        id: "b",
        recipe: { prompt: "Stored B", model: "flux-dev", width: 1024, height: 1024, seed: 0 },
      }, "b"),
    ];
    render(<CompareView items={items} />);
    const recipePromptRow = screen.getByTestId("compare-row-r_prompt");
    expect(recipePromptRow).toBeInTheDocument();
    // prompts differ → not same
    expect(recipePromptRow.dataset.same).toBe("false");
    const recipeModelRow = screen.getByTestId("compare-row-r_model");
    expect(recipeModelRow.dataset.same).toBe("true");
  });

  it("reports the changed-field count in the header summary", () => {
    const items = [
      makeItem({ id: "a", model: "flux-dev", seed: 1 }, "a"),
      makeItem({ id: "b", model: "nano-banana-v1", seed: 2 }, "b"),
    ];
    render(<CompareView items={items} />);
    expect(screen.getByTestId("compare-view").dataset.changed).toBeTruthy();
    expect(screen.getByText(/fields differ|All shared fields match/)).toBeInTheDocument();
  });

  it("does not mutate the source records", () => {
    const items = [
      makeItem({ id: "a", tags: ["hero"] }, "a"),
      makeItem({ id: "b", tags: ["landscape"] }, "b"),
    ];
    const beforeA = JSON.stringify(items[0]);
    const beforeB = JSON.stringify(items[1]);
    render(<CompareView items={items} />);
    expect(JSON.stringify(items[0])).toBe(beforeA);
    expect(JSON.stringify(items[1])).toBe(beforeB);
  });
});

describe("buildCompareRowsForTest", () => {
  it("emits one row per field, all sharing the same order across items", () => {
    const items = [
      makeItem({ id: "a", model: "flux-dev" }, "a"),
      makeItem({ id: "b", model: "nano-banana-v1" }, "b"),
    ];
    const rows = buildCompareRowsForTest(items);
    const modelRow = rows.find((r) => r.field === "model");
    expect(modelRow?.values).toEqual(["flux-dev", "nano-banana-v1"]);
    expect(modelRow?.same).toBe(false);
  });
});
