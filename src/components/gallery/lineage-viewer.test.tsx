/** @fileoverview VERIFY-044 — LineageViewer (Phase 2B lineage). */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  LineageViewer,
  buildAncestorChain,
  buildDescendantTree,
  buildLineageChain,
} from "./lineage-viewer";
import { MEDIA_ITEM_VERSION, type MediaItem } from "../../types/media";

function makeItem(over: Partial<MediaItem> = {}, id: string): MediaItem {
  return {
    id,
    image: "data:image/png;base64,AA",
    prompt: id,
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

describe("LineageViewer (VERIFY-044)", () => {
  it("root item shows no parent and no children", () => {
    const root = makeItem({}, "root");
    render(<LineageViewer item={root} items={[root]} />);
    expect(screen.queryByTestId("lineage-ancestors")).toBeNull();
    expect(screen.queryByTestId("lineage-descendants")).toBeNull();
    expect(screen.getByTestId("lineage-focus")).toBeInTheDocument();
  });

  it("child item shows parent and parent shows child", () => {
    const root = makeItem({ childrenIds: ["child"] }, "root");
    const child = makeItem({ parentId: "root" }, "child");
    render(<LineageViewer item={child} items={[root, child]} />);
    expect(screen.getByTestId("lineage-ancestor-root")).toBeInTheDocument();
    expect(screen.getByTestId("lineage-focus").textContent).toContain("child");
  });

  it("multi-generation tree renders each descendant", () => {
    const a = makeItem({ childrenIds: ["b"] }, "a");
    const b = makeItem({ parentId: "a", childrenIds: ["c"] }, "b");
    const c = makeItem({ parentId: "b" }, "c");
    render(<LineageViewer item={a} items={[a, b, c]} />);
    expect(screen.getByTestId("lineage-descendant-b")).toBeInTheDocument();
    expect(screen.getByTestId("lineage-descendant-c")).toBeInTheDocument();
  });

  it("missing parent is surfaced as a missing ancestor", () => {
    const child = makeItem({ parentId: "ghost" }, "child");
    render(<LineageViewer item={child} items={[child]} />);
    const ancestor = screen.getByTestId("lineage-ancestor-ghost");
    expect(ancestor.dataset.missing).toBe("true");
  });

  it("cycle in the parent chain is detected and rendered as a warning", () => {
    // a -> b -> a (parent of a is b, parent of b is a).
    const a = makeItem({ parentId: "b" }, "a");
    const b = makeItem({ parentId: "a" }, "b");
    render(<LineageViewer item={a} items={[a, b]} />);
    expect(screen.getByTestId("lineage-cycle-warning")).toBeInTheDocument();
  });

  it("cycle in the children list is detected and rendered as a warning", () => {
    // a.childrenIds = [b, a] — a is its own child.
    const a = makeItem({ childrenIds: ["b", "a"] }, "a");
    const b = makeItem({ parentId: "a" }, "b");
    render(<LineageViewer item={a} items={[a, b]} />);
    expect(screen.getByTestId("lineage-cycle-warning")).toBeInTheDocument();
  });

  it("clicking an ancestor invokes onOpenItem with the resolved MediaItem", () => {
    const root = makeItem({ childrenIds: ["child"] }, "root");
    const child = makeItem({ parentId: "root" }, "child");
    const onOpenItem = vi.fn();
    render(<LineageViewer item={child} items={[root, child]} onOpenItem={onOpenItem} />);
    // The testid is on the <li> wrapper; the click handler is on the inner button.
    const li = screen.getByTestId("lineage-ancestor-root");
    const button = li.querySelector("button") as HTMLButtonElement;
    fireEvent.click(button);
    expect(onOpenItem).toHaveBeenCalledWith(root);
  });

  it("does NOT mutate the source records (renders read-only)", () => {
    const a = makeItem({ childrenIds: ["b"] }, "a");
    const b = makeItem({ parentId: "a" }, "b");
    const beforeA = JSON.stringify(a);
    const beforeB = JSON.stringify(b);
    render(<LineageViewer item={a} items={[a, b]} />);
    expect(JSON.stringify(a)).toBe(beforeA);
    expect(JSON.stringify(b)).toBe(beforeB);
  });
});

describe("buildLineageChain (pure helper)", () => {
  it("returns empty ancestors/descendants for an isolated item", () => {
    const a = makeItem({}, "a");
    const chain = buildLineageChain(a, new Map([["a", a]]));
    expect(chain.ancestors).toEqual([]);
    expect(chain.descendants).toEqual([]);
    expect(chain.hasCycle).toBe(false);
    expect(chain.hasMissing).toBe(false);
  });

  it("marks hasMissing when a parent is not in the byId map", () => {
    const child = makeItem({ parentId: "ghost" }, "child");
    const chain = buildLineageChain(child, new Map([["child", child]]));
    expect(chain.hasMissing).toBe(true);
  });

  it("marks hasCycle when parent chain loops", () => {
    const a = makeItem({ parentId: "b" }, "a");
    const b = makeItem({ parentId: "a" }, "b");
    const chain = buildLineageChain(a, new Map([["a", a], ["b", b]]));
    expect(chain.hasCycle).toBe(true);
  });

  it("caps traversal depth (defensive)", () => {
    // Build a 30-deep chain a1 → a2 → ... → a30 → a1 (cycle)
    const items: MediaItem[] = [];
    for (let i = 1; i <= 30; i++) {
      items.push(makeItem({ id: `a${i}`, parentId: `a${i + 1}` }, `a${i}`));
    }
    items[items.length - 1] = makeItem({ id: "a30", parentId: "a1" }, "a30");
    const byId = new Map(items.map((i) => [i.id, i]));
    const chain = buildLineageChain(items[0]!, byId, 8);
    expect(chain.ancestors.length).toBeLessThanOrEqual(8);
  });
});

describe("buildAncestorChain / buildDescendantTree (pure helpers)", () => {
  it("buildAncestorChain returns oldest-first", () => {
    const a = makeItem({ childrenIds: ["b"] }, "a");
    const b = makeItem({ parentId: "a", childrenIds: ["c"] }, "b");
    const c = makeItem({ parentId: "b" }, "c");
    const byId = new Map([["a", a], ["b", b], ["c", c]]);
    const { nodes } = buildAncestorChain("c", byId);
    expect(nodes.map((n) => n.id)).toEqual(["a", "b"]);
  });

  it("buildDescendantTree returns direct children (deduped)", () => {
    const a = makeItem({ childrenIds: ["b", "c"] }, "a");
    const b = makeItem({ parentId: "a", childrenIds: ["d"] }, "b");
    const c = makeItem({ parentId: "a" }, "c");
    const d = makeItem({ parentId: "b" }, "d");
    const byId = new Map([["a", a], ["b", b], ["c", c], ["d", d]]);
    const { nodes, hasCycle } = buildDescendantTree("a", byId);
    expect(nodes.map((n) => n.id).sort()).toEqual(["b", "c", "d"]);
    expect(hasCycle).toBe(false);
  });

  it("buildDescendantTree flags cycle when a child references an ancestor", () => {
    const a = makeItem({ childrenIds: ["b", "a"] }, "a"); // a is its own child
    const b = makeItem({ parentId: "a" }, "b");
    const byId = new Map([["a", a], ["b", b]]);
    const { hasCycle } = buildDescendantTree("a", byId);
    expect(hasCycle).toBe(true);
  });
});
