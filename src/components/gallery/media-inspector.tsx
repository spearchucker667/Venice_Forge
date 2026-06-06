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
    </aside>
  );
}
