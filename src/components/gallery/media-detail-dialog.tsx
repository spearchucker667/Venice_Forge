/** @fileoverview Detail dialog. Full-size preview with prev/next filmstrip,
 * keyboard nav, and a small inline action bar (favorite, delete). The
 * Inspector is rendered alongside as a side panel. */

import { useEffect, useMemo, useRef } from "react";
import { ChevronLeft, ChevronRight, Heart, Trash2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/shared";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { mediaItemSource, formatDimensions, formatDuration, isVideoItem, isAudioItem } from "../../utils/mediaItem";
import type { MediaItem } from "../../types/media";

interface MediaDetailDialogProps {
  item: MediaItem;
  allItems: MediaItem[];
  onClose: () => void;
  onNavigate: (direction: "prev" | "next") => void;
  onToggleFavorite: (item: MediaItem) => void;
  onDelete: (item: MediaItem) => void;
  onSelect: (item: MediaItem) => void;
}

export function MediaDetailDialog({
  item,
  allItems,
  onClose,
  onNavigate,
  onToggleFavorite,
  onDelete,
  onSelect,
}: MediaDetailDialogProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const isVideo = isVideoItem(item);
  const isAudio = isAudioItem(item);
  const src = mediaItemSource(item);
  const dims = formatDimensions(item);
  const duration = formatDuration(item.duration);

  const currentIndex = useMemo(
    () => allItems.findIndex((candidate) => candidate.id === item.id),
    [allItems, item.id],
  );

  useFocusTrap(overlayRef, true, onClose, closeRef);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onNavigate("prev");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onNavigate("next");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNavigate]);

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Media detail"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      className="mesh-panel fixed inset-0 z-50 flex rounded-none border-0 bg-overlay backdrop-blur-sm"
    >
      <div className="relative flex flex-1 flex-col">
        <header className="flex items-center justify-between soft-separator-y mesh-header mesh-surface px-5 py-3 text-text-primary">
          <div className="flex items-center gap-2">
            <Badge tone={isVideo ? "rose" : isAudio ? "sky" : "slate"}>{isVideo ? "Video" : isAudio ? "Audio" : "Image"}</Badge>
            <Badge tone="slate">{item.operation}</Badge>
            {dims && <Badge tone="slate">{dims}</Badge>}
            {duration && <Badge tone="rose">{duration}</Badge>}
            {item.model && <span className="text-[12px] text-text-muted">{item.model}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onToggleFavorite(item)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] transition-colors",
                item.favorite
                  ? "border-rose-400/40 bg-rose-500/10 text-rose-300"
                  : "border-border text-text-secondary hover:border-accent hover:text-accent",
              )}
            >
              <Heart className={cn("h-3.5 w-3.5", item.favorite && "fill-current")} />
              {item.favorite ? "Favorited" : "Favorite"}
            </button>
            <button
              type="button"
              onClick={() => onDelete(item)}
              className="inline-flex items-center gap-1 rounded-md border border-danger/30 px-2 py-1 text-[12px] text-danger hover:bg-danger/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
            >
              Close (Esc)
            </button>
          </div>
        </header>

        <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-overlay p-4">
          <button
            type="button"
            onClick={() => onNavigate("prev")}
            disabled={currentIndex <= 0}
            aria-label="Previous"
            className="absolute left-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-overlay text-text-primary transition-opacity hover:border-accent disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {src ? (
            isVideo ? (
              <video
                src={src}
                controls
                autoPlay
                className="max-h-[80vh] max-w-[90vw] rounded-lg border border-border object-contain"
              />
            ) : (
              <img
                src={src}
                alt={item.prompt || "Generated image preview"}
                className="max-h-[80vh] max-w-[90vw] rounded-lg border border-border object-contain"
              />
            )
          ) : (
            <div className="grid h-64 w-96 place-items-center rounded-lg border border-border bg-surface text-text-muted">
              Preview unavailable
            </div>
          )}
          <button
            type="button"
            onClick={() => onNavigate("next")}
            disabled={currentIndex < 0 || currentIndex >= allItems.length - 1}
            aria-label="Next"
            className="absolute right-2 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full border border-border bg-overlay text-text-primary transition-opacity hover:border-accent disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="border-t border-border/50 bg-overlay px-4 py-2">
          <p className="line-clamp-2 text-[12.5px] text-text-primary" title={item.prompt}>
            {item.prompt || "Untitled"}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-muted">
            {typeof item.seed === "number" && (
              <span>Seed: <span className="font-mono text-text-secondary">{item.seed}</span></span>
            )}
            {item.source && <span>Source: <span className="text-text-secondary">{item.source}</span></span>}
            {item.style && <span>Style: <span className="text-text-secondary">{item.style}</span></span>}
            {item.steps !== undefined && item.steps !== null && (
              <span>Steps: <span className="text-text-secondary">{String(item.steps)}</span></span>
            )}
            {item.cfg !== undefined && item.cfg !== null && (
              <span>CFG: <span className="text-text-secondary">{String(item.cfg)}</span></span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-text-muted">
            {item.tags.length > 0 ? item.tags.map((t) => `#${t}`).join(" ") : "No tags"} ·{" "}
            {new Date(item.timestamp).toLocaleString()}
          </p>
        </div>
      </div>

      <aside className="hidden w-72 shrink-0 soft-separator-x mesh-surface p-4 text-text-primary lg:flex lg:flex-col">
        <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-text-muted">Filmstrip</h3>
        <div className="grid grid-cols-3 gap-2 overflow-y-auto pr-1">
          {allItems.map((candidate) => {
            const cs = mediaItemSource(candidate);
            const selected = candidate.id === item.id;
            return (
              <button
                type="button"
                key={candidate.id}
                onClick={() => onSelect(candidate)}
                className={cn(
                  "relative aspect-square overflow-hidden rounded-md border bg-surface-elevated",
                  selected ? "border-accent ring-2 ring-accent/40" : "border-border hover:border-accent",
                )}
                aria-label={`Open ${candidate.prompt || "untitled"}`}
              >
                {cs ? (
                  // Use img for filmstrip thumbnails. For videos, this shows
                  // a static frame when the browser decodes the first frame;
                  // for venice-media:// the fallback placeholder is shown.
                  isVideoItem(candidate) ? (
                    <div className="relative h-full w-full">
                      <img
                        src={cs}
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                      />
                    </div>
                  ) : (
                    <img src={cs} alt="" className="h-full w-full object-cover" />
                  )
                ) : (
                  <div className="grid h-full w-full place-items-center text-text-muted">?</div>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[12px] text-text-muted">
          {currentIndex + 1} / {allItems.length} · Use ←/→ to navigate
        </p>
      </aside>
    </div>
  );
}
