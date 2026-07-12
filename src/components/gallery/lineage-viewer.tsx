/** @fileoverview Phase 2B Media Studio lineage viewer.
 *
 * Walks the existing `parentId` / `childrenIds` graph on MediaItem to
 * render a simple ancestor + descendants tree for a given media item.
 *
 * Safety:
 *   - Cycles (a child listing its ancestor as a child, or two records
 *     pointing at each other) are detected via a visited set and
 *     rendered as a "cycle detected" warning instead of looping.
 *   - Missing parents / children (referenced by id but not present in
 *     the supplied record set) are surfaced as "missing" rows so the
 *     user can repair the lineage.
 *   - Pure: no mutation of MediaItem records. The viewer only reads
 *     from the supplied `byId` lookup.
 */

import { useMemo } from "react";
import type { MediaItem } from "../../types/media";

export interface LineageNode {
  id: string;
  item: MediaItem | null | undefined;
  /** True when the id is referenced but absent from `byId`. */
  missing: boolean;
  /** True when this node closes a cycle in the ancestor chain. */
  cycle: boolean;
}

export interface LineageChain {
  /** Ancestor chain (oldest → newest → focus). Empty when focus has no parent. */
  ancestors: LineageNode[];
  /** Direct children of the focus item (and the focus itself, if requested). */
  descendants: LineageNode[];
  /** True if the parent graph contained a cycle. */
  hasCycle: boolean;
  /** True if the parent or any child reference is missing from `byId`. */
  hasMissing: boolean;
}

function makeNode(
  id: string,
  byId: Map<string, MediaItem>,
  visited: Set<string>,
): LineageNode {
  // Order matters: presence (missing flag) is independent of cycle
  // detection. A node can be both missing AND a cycle closer — but for
  // the user, "missing" is the more important signal so it wins.
  const item: MediaItem | null = byId.get(id) ?? null;
  const cycle = visited.has(id) && !item;
  return {
    id,
    item: item === null ? null : item,
    missing: !item,
    cycle,
  };
}

/** Pure: walk parent pointers from the focus item up to the root.
 *  Returns the ancestor chain oldest-first. Caps at `maxDepth` to
 *  defend against pathological / future data. */
export function buildAncestorChain(
  focusId: string,
  byId: Map<string, MediaItem>,
  maxDepth = 16,
): { nodes: LineageNode[]; hasCycle: boolean } {
  const visited = new Set<string>();
  const nodes: LineageNode[] = [];
  let current = byId.get(focusId);
  if (!current) {
    return { nodes: [], hasCycle: false };
  }
  while (current && current.parentId) {
    if (visited.has(current.parentId)) {
      nodes.push({ id: current.parentId, item: null, missing: false, cycle: true });
      return { nodes: nodes.reverse(), hasCycle: true };
    }
    visited.add(current.parentId);
    const parent = byId.get(current.parentId);
    nodes.push(makeNode(current.parentId, byId, new Set([current.parentId])));
    if (nodes[nodes.length - 1].missing) {
      current = undefined;
      break;
    }
    current = parent;
    if (nodes.length >= maxDepth) break;
  }
  return { nodes: nodes.reverse(), hasCycle: false };
}

/** Pure: collect direct children (and, recursively, descendants up to
 *  a cap) for the focus item. */
export function buildDescendantTree(
  focusId: string,
  byId: Map<string, MediaItem>,
  maxDepth = 16,
): { nodes: LineageNode[]; hasCycle: boolean; hasMissing: boolean } {
  const visited = new Set<string>([focusId]);
  const out: LineageNode[] = [];
  let hasCycle = false;
  let hasMissing = false;
  const queue: Array<{ id: string; depth: number }> = [{ id: focusId, depth: 0 }];
  while (queue.length > 0) {
    const head = queue.shift()!;
    if (head.depth >= maxDepth) continue;
    const item = byId.get(head.id);
    if (!item) continue;
    for (const childId of item.childrenIds) {
      if (visited.has(childId)) {
        out.push({ id: childId, item: null, missing: false, cycle: true });
        hasCycle = true;
        continue;
      }
      visited.add(childId);
      const childItem = byId.get(childId);
      const node: LineageNode = {
        id: childId,
        item: childItem ?? null,
        missing: !childItem,
        cycle: false,
      };
      out.push(node);
      if (node.missing) {
        hasMissing = true;
        continue;
      }
      queue.push({ id: childId, depth: head.depth + 1 });
    }
  }
  return { nodes: out, hasCycle, hasMissing };
}

/** Compose a full chain for the focus item. */
export function buildLineageChain(
  focus: MediaItem,
  byId: Map<string, MediaItem>,
  maxDepth = 16,
): LineageChain {
  const ancestorResult = buildAncestorChain(focus.id, byId, maxDepth);
  const descendantResult = buildDescendantTree(focus.id, byId, maxDepth);
  const hasMissing =
    ancestorResult.nodes.some((n) => n.missing) || descendantResult.hasMissing;
  return {
    ancestors: ancestorResult.nodes,
    descendants: descendantResult.nodes,
    hasCycle: ancestorResult.hasCycle || descendantResult.hasCycle,
    hasMissing,
  };
}

export interface LineageViewerProps {
  /** The media item whose lineage to render. */
  item: MediaItem;
  /** Lookup of all currently-known media items. */
  items: MediaItem[];
  /** Optional click handler when the user wants to open a related item. */
  onOpenItem?: (item: MediaItem) => void;
  className?: string;
  /** Optional label that the test uses to find the section. */
  ariaLabel?: string;
}

export function LineageViewer({
  item,
  items,
  onOpenItem,
  className,
  ariaLabel = "Media lineage",
}: LineageViewerProps) {
  const byId = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);
  const chain = useMemo(
    () => buildLineageChain(item, byId),
    [item, byId],
  );

  return (
    <section
      className={className}
      aria-label={ariaLabel}
      data-testid="lineage-viewer"
      data-has-cycle={chain.hasCycle}
      data-has-missing={chain.hasMissing}
    >
      {chain.hasCycle && (
        <div
          role="alert"
          className="mb-1.5 rounded-md border border-amber-400/30 bg-amber-500/[0.06] px-2 py-1 text-[12px] text-amber-200/90"
          data-testid="lineage-cycle-warning"
        >
          Cycle detected in the lineage chain — showing a truncated view.
        </div>
      )}
      {chain.hasMissing && !chain.hasCycle && (
        <div
          role="alert"
          className="mb-1.5 rounded-md border border-amber-400/30 bg-amber-500/[0.06] px-2 py-1 text-[12px] text-amber-200/90"
          data-testid="lineage-missing-warning"
        >
          Some lineage references are missing from the loaded set.
        </div>
      )}

      {chain.ancestors.length > 0 && (
        <ol className="space-y-1" data-testid="lineage-ancestors">
          {chain.ancestors.map((node, index) => (
            <li
              key={`a-${node.id}-${node.cycle ? "cycle" : node.missing ? "missing" : "item"}-${index}`}
              className="flex items-center gap-1.5 text-[12px]"
              data-testid={`lineage-ancestor-${node.id}`}
              data-missing={node.missing}
              data-cycle={node.cycle}
            >
              <span className="text-text-muted">↳</span>
              {node.cycle ? (
                <span className="text-warning">cycle: {node.id}</span>
              ) : node.missing ? (
                <span className="text-text-muted">(missing) {node.id}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenItem?.(node.item!)}
                  className="line-clamp-1 rounded border border-border bg-surface-elevated px-1.5 py-0.5 text-left hover:border-accent hover:text-accent"
                >
                  {node.item!.prompt || node.item!.id}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      <div
        className={`mt-1 flex items-center gap-1.5 rounded-md border border-accent/30 bg-accent/[0.06] px-2 py-1 text-[12px] ${
          chain.ancestors.length > 0 ? "ml-3" : ""
        }`}
        data-testid="lineage-focus"
      >
        <span className="text-accent">●</span>
        <span className="line-clamp-1 text-text-primary">
          {item.prompt || item.id}
        </span>
        <span className="ml-auto text-[12px] text-text-muted">{item.operation}</span>
      </div>

      {chain.descendants.length > 0 && (
        <ul className="mt-1 space-y-1" data-testid="lineage-descendants">
          {chain.descendants.map((node, index) => (
            <li
              key={`d-${node.id}-${node.cycle ? "cycle" : node.missing ? "missing" : "item"}-${index}`}
              className="ml-3 flex items-center gap-1.5 text-[12px]"
              data-testid={`lineage-descendant-${node.id}`}
              data-missing={node.missing}
              data-cycle={node.cycle}
            >
              <span className="text-text-muted">↳</span>
              {node.cycle ? (
                <span className="text-warning">cycle: {node.id}</span>
              ) : node.missing ? (
                <span className="text-text-muted">(missing) {node.id}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenItem?.(node.item!)}
                  className="line-clamp-1 rounded border border-border bg-surface-elevated px-1.5 py-0.5 text-left hover:border-accent hover:text-accent"
                >
                  {node.item!.prompt || node.item!.id}
                </button>
              )}
              {node.item && (
                <span className="ml-auto text-[12px] text-text-muted">
                  {node.item.operation}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {chain.ancestors.length === 0 && chain.descendants.length === 0 && (
        <p className="mt-1 text-[12px] text-text-muted">No lineage recorded.</p>
      )}
    </section>
  );
}
