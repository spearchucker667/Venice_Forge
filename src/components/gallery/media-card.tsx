/** @fileoverview Card used in the Media Studio grid. Renders a generated-or-video
 * thumbnail, title, badges, and quick action buttons. */

import { memo, useState } from "react";
import { Heart, Star, Trash2, Image as ImageIcon, Play, Music } from "lucide-react";
import { Badge } from "../ui/shared";
import { useMediaThumb } from "../../hooks/useMediaThumb";
import { mediaItemSource, formatDimensions, formatDuration, isVideoItem, isAudioItem } from "../../utils/mediaItem";
import { cn } from "../../lib/utils";
import type { MediaItem } from "../../types/media";

const OP_TONE: Record<string, "emerald" | "sky" | "violet" | "amber" | "pink" | "slate" | "rose" | "teal"> = {
  generate: "slate",
  upscale: "emerald",
  edit: "violet",
  "background-remove": "pink",
  variation: "sky",
  regenerate: "amber",
  "video-generate": "rose",
  "video-upscale": "teal",
  import: "slate",
};

const OP_LABEL: Record<string, string> = {
  generate: "Generated",
  upscale: "Upscaled",
  edit: "Edited",
  "background-remove": "BG Removed",
  variation: "Variation",
  regenerate: "Regenerated",
  "video-generate": "Video",
  "video-upscale": "Video×",
  import: "Imported",
};

interface MediaCardProps {
  item: MediaItem;
  selected: boolean;
  active: boolean;
  multiSelectMode: boolean;
  onSelect: (item: MediaItem, multi: boolean) => void;
  onOpen: (item: MediaItem) => void;
  onToggleFavorite: (item: MediaItem) => void;
  onDelete: (item: MediaItem) => void;
}

function MediaCardImpl({
  item,
  selected,
  active,
  multiSelectMode,
  onSelect,
  onOpen,
  onToggleFavorite,
  onDelete,
}: MediaCardProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const { url, loading } = useMediaThumb(item);
  const isVideo = isVideoItem(item);
  const isAudio = isAudioItem(item);
  const dims = formatDimensions(item);
  const duration = formatDuration(item.duration);
  const fallbackSrc = mediaItemSource(item);

  return (
    <article
      className={cn(
        "mesh-card media-card-virtualized group relative flex flex-col overflow-hidden rounded-xl",
        active ? "border-accent ring-2 ring-accent/40" : selected ? "border-accent/60" : "border-border hover:border-accent/40",
      )}
    >
      <button
        type="button"
        onClick={(_e) => {
          if (multiSelectMode) {
            onSelect(item, true);
            return;
          }
          onOpen(item);
        }}
        onContextMenu={(_e) => {
          onSelect(item, !multiSelectMode);
        }}
        className="relative block aspect-square w-full overflow-hidden bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        aria-label={`Open ${isVideo ? "video" : "image"}: ${item.prompt || "untitled"}`}
      >
        {url && !thumbFailed ? (
          // Always use <img> for thumbnails — the URL from useMediaThumb is a
          // poster image (data:image/webp or data:image/png), never a video
          // stream. Passing an image data URL into <video> causes decode
          // failures and media-src CSP violations.
          <img
            src={url}
            alt={item.prompt || (isVideo ? "Generated video" : "Generated image")}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            onError={() => setThumbFailed(true)}
          />
        ) : fallbackSrc && !thumbFailed && !isVideo && !isAudio ? (
          // Fallback for images only — do not try to render a video/audio
          // durable URL as an img src.
          <img
            src={fallbackSrc}
            alt={item.prompt || "Generated image"}
            className="h-full w-full object-cover"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
            {isVideo ? <Play className="h-6 w-6" /> : isAudio ? <Music className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
            <span className="text-[12px]">{loading ? "Loading…" : "Preview unavailable"}</span>
          </div>
        )}

        {/* Video/audio play overlay badge */}
        {(isVideo || isAudio) && url && !thumbFailed && (
          <span className="absolute bottom-2 left-2 rounded-md bg-overlay/80 p-1 text-text-primary backdrop-blur">
            <Play className="h-3.5 w-3.5" />
          </span>
        )}

        {multiSelectMode && (
          <span
            className={cn(
              "absolute left-2 top-2 grid h-5 w-5 place-items-center rounded border bg-surface/80 text-[12px] font-bold",
              selected ? "border-accent bg-accent text-accent-fg" : "border-border text-text-muted",
            )}
            aria-hidden="true"
          >
            {selected ? "✓" : ""}
          </span>
        )}

        {item.favorite && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-overlay px-1.5 py-0.5 text-[12px] text-rose-200 backdrop-blur">
            <Heart className="h-3 w-3 fill-current" />
            <span>Favorite</span>
          </span>
        )}

        {isVideo && duration && (
          <span className="absolute bottom-2 right-2 rounded-md bg-overlay px-1.5 py-0.5 text-[12px] font-medium text-text-primary">
            {duration}
          </span>
        )}
      </button>

      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-center gap-1.5">
          <Badge tone={OP_TONE[item.operation] ?? "slate"}>{OP_LABEL[item.operation] ?? "Item"}</Badge>
          {isVideo ? <Badge tone="rose">Video</Badge> : isAudio ? <Badge tone="sky">Audio</Badge> : <Badge tone="slate">Image</Badge>}
          {dims && <Badge tone="slate">{dims}</Badge>}
          {typeof item.seed === "number" && <Badge tone="amber">seed: {item.seed}</Badge>}
        </div>
        <p className="line-clamp-2 text-[12.5px] text-text-primary" title={item.prompt}>
          {item.prompt || "Untitled"}
        </p>
        <p className="truncate text-[12px] text-text-muted" title={item.model}>
          {item.model}
        </p>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-border bg-surface-elevated px-1.5 py-0.5 text-[12px] text-text-secondary"
              >
                #{tag}
              </span>
            ))}
            {item.tags.length > 3 && (
              <span className="text-[12px] text-text-muted">+{item.tags.length - 3} more</span>
            )}
          </div>
        )}

        <div className="mt-1 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggleFavorite(item)}
            aria-label={item.favorite ? "Unfavorite" : "Mark as favorite"}
            className={cn(
              "rounded-md border px-2 py-1 text-[12px] transition-colors",
              item.favorite
                ? "border-rose-400/40 bg-rose-500/[0.08] text-rose-300"
                : "border-border text-text-secondary hover:border-accent hover:text-accent",
            )}
          >
            <Star className={cn("h-3 w-3", item.favorite && "fill-current")} />
          </button>
          <button
            type="button"
            onClick={() => onDelete(item)}
            aria-label="Delete"
            className="ml-auto rounded-md border border-danger/30 px-2 py-1 text-[12px] text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </article>
  );
}

export const MediaCard = memo(MediaCardImpl);
