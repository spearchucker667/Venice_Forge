/** @fileoverview Inspector panel: edits tags / note / favorite on a single
 * MediaItem. Uses the media-store actions for persistence. */

import { useEffect, useMemo, useState } from "react";
import { Heart, Trash2, Tag as TagIcon, NotebookPen, Sparkles } from "lucide-react";
import { cn } from "../../lib/utils";
import { GhostButton, Label, TextArea, Badge } from "../ui/shared";
import { mediaCapabilities, normalizedTags, splitTags } from "../../utils/mediaItem";
import type { MediaItem } from "../../types/media";

interface MediaInspectorProps {
  item: MediaItem;
  parentItem: MediaItem | null;
  childrenItems: MediaItem[];
  /** Ids in `item.childrenIds` that are not present anywhere in the
   *  in-memory cache AND could not be loaded from IDB. Surfaced in the
   *  inspector as a "missing children" recovery section. */
  missingChildIds: string[];
  onPatch: (id: string, patch: Partial<MediaItem>) => Promise<void>;
  onDelete: (item: MediaItem) => void;
  onOpenChild: (child: MediaItem) => void;
  onOpenParent: (parent: MediaItem) => void;
  onClose: () => void;
}

export function MediaInspector({
  item,
  parentItem,
  childrenItems,
  missingChildIds,
  onPatch,
  onDelete,
  onOpenChild,
  onOpenParent,
  onClose,
}: MediaInspectorProps) {
  const [tagDraft, setTagDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState(item.note);

  const capabilities = useMemo(() => mediaCapabilities(item), [item.model]);
  const hasAnyCapability = capabilities.upscale || capabilities.edit || capabilities.video || capabilities.vision;

  useEffect(() => {
    setNoteDraft(item.note);
  }, [item.id, item.note]);

  const handleAddTags = async () => {
    const next = normalizedTags([...item.tags, ...splitTags(tagDraft)]);
    setTagDraft("");
    if (next.length === item.tags.length) return;
    await onPatch(item.id, { tags: next });
  };

  const handleRemoveTag = async (tag: string) => {
    await onPatch(item.id, { tags: item.tags.filter((t) => t !== tag) });
  };

  const handleSaveNote = async () => {
    if (noteDraft === item.note) return;
    await onPatch(item.id, { note: noteDraft });
  };

  // Dangling-ref recovery: a child id points to a record that no longer
  // exists in IDB, or a parent id points to a missing record. These
  // records cannot be displayed and the previous behaviour was to hide
  // the section silently. We now surface a "Missing" row with a single-
  // click recovery action that prunes the stale reference.
  const hasDanglingParent = item.parentId !== null && item.parentId !== undefined && parentItem === null;
  const hasDanglingChildren = missingChildIds.length > 0;
  const hasAnyDangling = hasDanglingParent || hasDanglingChildren;

  const handleClearDanglingParent = async () => {
    await onPatch(item.id, { parentId: null });
  };

  const handleClearDanglingChildren = async () => {
    const filtered = item.childrenIds.filter((id) => !missingChildIds.includes(id));
    if (filtered.length === item.childrenIds.length) return;
    await onPatch(item.id, { childrenIds: filtered });
  };

  return (
    <aside
      className="flex h-full w-full flex-col gap-4 overflow-y-auto border-l border-border bg-surface px-4 py-4"
      aria-label="Media inspector"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            Inspector
          </h3>
          <p className="mt-1 line-clamp-2 text-[13px] text-text-primary">{item.prompt || "Untitled"}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-2 py-1 text-[11px] text-text-secondary hover:border-accent hover:text-accent"
        >
          Close
        </button>
      </div>

      <section className="space-y-1.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPatch(item.id, { favorite: !item.favorite })}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[12px] transition-colors",
              item.favorite
                ? "border-rose-400/40 bg-rose-500/[0.08] text-rose-300"
                : "border-border text-text-secondary hover:border-accent hover:text-accent",
            )}
          >
            <Heart className={cn("h-3.5 w-3.5", item.favorite && "fill-current")} />
            {item.favorite ? "Favorited" : "Mark as favorite"}
          </button>
          <GhostButton onClick={() => onDelete(item)} ariaLabel="Delete">
            <span className="inline-flex items-center gap-1.5 text-danger">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </span>
          </GhostButton>
        </div>
      </section>

      {hasAnyCapability && (
        <section>
          <Label>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Model capabilities
            </span>
          </Label>
          <div className="flex flex-wrap gap-1">
            {capabilities.upscale && <Badge tone="emerald">upscale</Badge>}
            {capabilities.edit && <Badge tone="violet">edit</Badge>}
            {capabilities.video && <Badge tone="sky">video</Badge>}
            {capabilities.vision && <Badge tone="amber">vision</Badge>}
          </div>
          <p className="mt-1.5 text-[11px] text-text-muted">
            These endpoints are recognised for the source model. Re-running the
            same operation on this item will use them.
          </p>
        </section>
      )}

      <section>
        <Label htmlFor="media-tags">Tags</Label>
        <div className="flex gap-1.5">
          <input
            id="media-tags"
            type="text"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAddTags();
              }
            }}
            placeholder="Add a tag and press Enter"
            className="flex-1 rounded-md border border-border bg-surface-elevated px-2 py-1.5 text-[12px] text-text-primary focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleAddTags()}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
          >
            <TagIcon className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        {item.tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <button
                type="button"
                key={tag}
                onClick={() => void handleRemoveTag(tag)}
                title="Remove tag"
                className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-text-secondary hover:border-rose-400/40 hover:text-rose-300"
              >
                #{tag}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-[11px] text-text-muted">No tags yet.</p>
        )}
      </section>

      <section>
        <Label htmlFor="media-note" hint={`${noteDraft.length} chars`}>Note</Label>
        <TextArea
          value={noteDraft}
          onChange={setNoteDraft}
          rows={4}
          placeholder="Capture a quick reminder or seed value…"
          ariaLabel="Inspector note"
          maxLength={2000}
        />
        <div className="mt-1.5 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSaveNote()}
            disabled={noteDraft === item.note}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11.5px] text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:opacity-30"
          >
            <NotebookPen className="h-3 w-3" /> Save note
          </button>
        </div>
      </section>

      {parentItem && (
        <section>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            Parent
          </h4>
          <button
            type="button"
            onClick={() => onOpenParent(parentItem)}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-surface-elevated p-2 text-left hover:border-accent"
          >
            <span className="line-clamp-1 text-[12px] text-text-primary">{parentItem.prompt || "Untitled"}</span>
            <span className="ml-auto text-[10.5px] text-text-muted">View</span>
          </button>
        </section>
      )}

      {childrenItems.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            Children ({childrenItems.length})
          </h4>
          <ul className="space-y-1.5">
            {childrenItems.map((child) => (
              <li key={child.id}>
                <button
                  type="button"
                  onClick={() => onOpenChild(child)}
                  className="flex w-full items-center gap-2 rounded-md border border-border bg-surface-elevated p-2 text-left hover:border-accent"
                >
                  <span className="line-clamp-1 text-[12px] text-text-primary">{child.prompt || "Untitled"}</span>
                  <span className="ml-auto text-[10.5px] text-text-muted">{child.operation}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasAnyDangling && (
        <section
          aria-label="Missing references"
          className="rounded-md border border-amber-400/30 bg-amber-500/[0.06] p-2.5"
        >
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-amber-200/90">
            Missing references
          </h4>
          <p className="mb-2 text-[11.5px] text-text-secondary">
            {hasDanglingParent && hasDanglingChildren
              ? "This item references records that no longer exist. Clear the stale pointers to repair the lineage."
              : hasDanglingParent
                ? "This item's parent record is missing. Clear the parent link to repair the lineage."
                : `${missingChildIds.length} child ${missingChildIds.length === 1 ? "reference" : "references"} could not be resolved. Clear the stale pointer${missingChildIds.length === 1 ? "" : "s"} to repair the lineage.`}
          </p>
          {hasDanglingParent && (
            <div className="mb-1.5 flex items-center gap-2 text-[11px] text-text-muted">
              <span className="font-mono">parentId={item.parentId}</span>
              <button
                type="button"
                onClick={() => void handleClearDanglingParent()}
                className="ml-auto rounded-md border border-amber-400/40 px-2 py-1 text-amber-200/90 hover:border-amber-300 hover:text-amber-100"
              >
                Clear parent link
              </button>
            </div>
          )}
          {hasDanglingChildren && (
            <div className="flex items-center gap-2 text-[11px] text-text-muted">
              <span className="line-clamp-1 font-mono">
                {missingChildIds.length === 1
                  ? `childrenIds: ${missingChildIds[0]}`
                  : `childrenIds: ${missingChildIds.length} missing`}
              </span>
              <button
                type="button"
                onClick={() => void handleClearDanglingChildren()}
                className="ml-auto rounded-md border border-amber-400/40 px-2 py-1 text-amber-200/90 hover:border-amber-300 hover:text-amber-100"
              >
                Clear {missingChildIds.length === 1 ? "1 missing ref" : `${missingChildIds.length} missing refs`}
              </button>
            </div>
          )}
        </section>
      )}
    </aside>
  );
}
