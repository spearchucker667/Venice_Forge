/** @fileoverview Card used in the Media Studio grid. Renders a generated-or-video
 * thumbnail, title, badges, and quick action buttons. */

import { memo, useEffect, useState } from "react";
import {
  Heart,
  Star,
  Trash2,
  Image as ImageIcon,
  Play,
  Music,
  Lock,
  Unlock,
} from "lucide-react";
import { Badge } from "../ui/shared";
import { useMediaThumb } from "../../hooks/useMediaThumb";
import { useResolvedMediaUrl } from "../../hooks/useResolvedMediaUrl";
import {
  mediaItemSource,
  formatDimensions,
  formatDuration,
  isVideoItem,
  isAudioItem,
} from "../../utils/mediaItem";
import { cn } from "../../lib/utils";
import type { MediaItem } from "../../types/media";
import { Trans, useTranslation } from "react-i18next";
import { ContextMenu, useContextMenu } from "../ui/ContextMenu";
import type { ContextMenuItem } from "../ui/ContextMenu";

const OP_TONE: Record<
  string,
  "emerald" | "sky" | "violet" | "amber" | "pink" | "slate" | "rose" | "teal"
> = {
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
  onSelect: (item: MediaItem, multi: boolean, shiftKey?: boolean) => void;
  onOpen: (item: MediaItem) => void;
  onToggleFavorite: (item: MediaItem) => void;
  onSaveAs: (item: MediaItem) => unknown | Promise<unknown>;
  onVaultToggle: (item: MediaItem) => void;
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
  onSaveAs,
  onVaultToggle,
  onDelete,
}: MediaCardProps) {
  const { t: tRuntime } = useTranslation("common");
  const cardMenu = useContextMenu();
  const [thumbFailed, setThumbFailed] = useState(false);
  const { url, loading } = useMediaThumb(item);

  // Reset stale failed-thumbnail state when the underlying record changes
  // (repair, line-source update, or thumbnail-source swap). Without this,
  // a once-failed card stays in the fallback forever and never retries.
  // VERIFY-MEDIA-DURABLE-001 regression guard.
  useEffect(() => {
    setThumbFailed(false);
  }, [item.id, item.image, item.thumbHash]);
  const isVideo = isVideoItem(item);
  const isAudio = isAudioItem(item);
  const dims = formatDimensions(item);
  const duration = formatDuration(item.duration);
  // The fallback renders the durable source directly, so it must carry a
  // capability token — a tokenless venice-media:// URL is rejected with 403
  // by the main-process protocol handler.
  const { url: fallbackSrc } = useResolvedMediaUrl(mediaItemSource(item));

  const cardMenuItems: ContextMenuItem[] = [
    {
      key: "open",
      label: tRuntime("actions.open"),
      onSelect: () => onOpen(item),
    },
    {
      key: "save-as",
      label: tRuntime("actions.saveAs"),
      onSelect: () => void onSaveAs(item),
      disabled: !fallbackSrc && !item.generatedMediaId,
    },
    { kind: "separator", key: "sep-open" },
    {
      key: "favorite",
      label: tRuntime(item.favorite ? "actions.unfavorite" : "actions.favorite"),
      onSelect: () => onToggleFavorite(item),
    },
    {
      key: "vault",
      label: tRuntime(item.vaultHidden ? "actions.unlock" : "actions.lock"),
      onSelect: () => onVaultToggle(item),
    },
    { kind: "separator", key: "sep-1" },
    {
      key: "delete",
      label: tRuntime("actions.delete"),
      destructive: true,
      onSelect: () => onDelete(item),
    },
  ];

  return (
    <article
      className={cn(
        "mesh-card media-card-virtualized group relative flex flex-col overflow-hidden rounded-md",
        active
          ? "border-accent ring-2 ring-accent/40"
          : selected
            ? "border-accent/60"
            : "border-vf-panel-border hover:border-accent/40",
      )}
      onContextMenu={cardMenu.openAt}
    >
      <button
        type="button"
        onClick={(e) => {
          if (multiSelectMode || e.metaKey || e.ctrlKey || e.shiftKey) {
            onSelect(item, true, e.shiftKey);
            return;
          }
          onOpen(item);
        }}
        onContextMenu={(event) => {
          event.stopPropagation();
          onSelect(item, !multiSelectMode);
          cardMenu.openAt(event);
        }}
        className="relative block aspect-square w-full overflow-hidden bg-vf-panel-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
        aria-label={tRuntime(
          "runtimeGenerated.components.gallery.mediaCard.attribute.openValue1Value2",
          {
            value1: isVideo ? "video" : "image",
            value2: item.prompt || "untitled",
          },
        )}
      >
        {url && !thumbFailed ? (
          // Always use <img> for thumbnails — the URL from useMediaThumb is a
          // poster image (data:image/webp or data:image/png), never a video
          // stream. Passing an image data URL into <video> causes decode
          // failures and media-src CSP violations.
          <img
            src={url}
            alt={
              item.prompt ||
              (isVideo
                ? tRuntime(
                    "runtimeGenerated.components.gallery.mediaCard.attribute.generatedVideo",
                  )
                : tRuntime(
                    "runtimeGenerated.components.gallery.mediaCard.attribute.generatedImage",
                  ))
            }
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
            onError={() => setThumbFailed(true)}
          />
        ) : fallbackSrc && !thumbFailed && !isVideo && !isAudio ? (
          // Fallback for images only — do not try to render a video/audio
          // durable URL as an img src.
          <img
            src={fallbackSrc}
            alt={
              item.prompt ||
              tRuntime(
                "runtimeGenerated.components.gallery.mediaCard.attribute.generatedImage",
              )
            }
            className="h-full w-full object-cover"
            onError={() => setThumbFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-text-muted">
            {isVideo ? (
              <Play className="h-6 w-6" />
            ) : isAudio ? (
              <Music className="h-6 w-6" />
            ) : (
              <ImageIcon className="h-6 w-6" />
            )}
            <span className="text-[12px]">
              {loading
                ? tRuntime(
                    "runtimeGenerated.components.gallery.mediaCard.text.loading",
                  )
                : tRuntime(
                    "runtimeGenerated.components.gallery.mediaCard.text.previewUnavailable",
                  )}
            </span>
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
              "absolute left-2 top-2 grid h-5 w-5 place-items-center rounded border bg-vf-panel-bg/80 text-[12px] font-bold",
              selected
                ? "border-accent bg-accent text-accent-fg shadow-[0_0_8px_var(--color-vf-accent-glow)]"
                : "border-vf-panel-border text-text-muted",
            )}
            aria-hidden="true"
          >
            {selected ? "✓" : ""}
          </span>
        )}

        {item.favorite && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-overlay px-1.5 py-0.5 text-[12px] text-danger backdrop-blur">
            <Heart className="h-3 w-3 fill-current" />
            <span>
              <Trans i18nKey="common:surface.componentsGalleryMediaCard.text.favorite" />
            </span>
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
          <Badge tone={OP_TONE[item.operation] ?? "slate"}>
            {OP_LABEL[item.operation] ??
              tRuntime(
                "runtimeGenerated.components.gallery.mediaCard.text.item",
              )}
          </Badge>
          {isVideo ? (
            <Badge tone="rose">
              <Trans i18nKey="common:surface.componentsGalleryMediaCard.text.video" />
            </Badge>
          ) : isAudio ? (
            <Badge tone="sky">
              <Trans i18nKey="common:surface.componentsGalleryMediaCard.text.audio" />
            </Badge>
          ) : (
            <Badge tone="slate">
              <Trans i18nKey="common:surface.componentsGalleryMediaCard.text.image" />
            </Badge>
          )}
          {dims && <Badge tone="slate">{dims}</Badge>}
          {typeof item.seed === "number" && (
            <Badge tone="amber">
              <Trans i18nKey="common:surface.componentsGalleryMediaCard.text.seed" />{" "}
              {item.seed}
            </Badge>
          )}
        </div>
        <p
          className="line-clamp-2 text-[12.5px] text-text-primary"
          title={item.prompt}
        >
          {item.prompt ||
            tRuntime(
              "runtimeGenerated.components.gallery.mediaCard.text.untitled",
            )}
        </p>
        <p className="truncate text-[12px] text-text-muted" title={item.model}>
          {item.model}
        </p>
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-md border border-vf-panel-border bg-vf-panel-bg-raised px-1.5 py-0.5 text-[12px] text-text-secondary"
              >
                #{tag}
              </span>
            ))}
            {item.tags.length > 3 && (
              <span className="text-[12px] text-text-muted">
                +{item.tags.length - 3}{" "}
                <Trans i18nKey="common:surface.componentsGalleryMediaCard.text.more" />
              </span>
            )}
          </div>
        )}

        <div className="mt-1 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggleFavorite(item)}
            aria-label={
              item.favorite
                ? tRuntime(
                    "runtimeGenerated.components.gallery.mediaCard.attribute.unfavorite",
                  )
                : tRuntime(
                    "runtimeGenerated.components.gallery.mediaCard.attribute.markAsFavorite",
                  )
            }
            className={cn(
              "rounded-md border px-2 py-1 text-[12px] transition-colors",
              item.favorite
                ? "border-danger/40 bg-danger/10 text-danger"
                : "border-vf-panel-border text-text-secondary hover:border-accent hover:text-accent",
            )}
          >
            <Star className={cn("h-3 w-3", item.favorite && "fill-current")} />
          </button>
          <button
            type="button"
            onClick={() => onVaultToggle(item)}
            aria-label={
              item.vaultHidden
                ? tRuntime(
                    "runtimeGenerated.components.gallery.mediaCard.attribute.removeFromVault",
                  )
                : tRuntime(
                    "runtimeGenerated.components.gallery.mediaCard.attribute.moveToVault",
                  )
            }
            className={cn(
              "rounded-md border px-2 py-1 text-[12px] transition-colors",
              item.vaultHidden
                ? "border-accent/40 bg-accent/[0.08] text-accent"
                : "border-vf-panel-border text-text-secondary hover:border-accent hover:text-accent",
            )}
          >
            {item.vaultHidden ? (
              <Unlock className="h-3 w-3" />
            ) : (
              <Lock className="h-3 w-3" />
            )}
          </button>
          <button
            type="button"
            onClick={() => onDelete(item)}
            aria-label={tRuntime(
              "runtimeGenerated.components.gallery.mediaCard.attribute.delete",
            )}
            className="ml-auto rounded-md border border-danger/30 px-2 py-1 text-[12px] text-danger hover:bg-danger/10"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      <ContextMenu
        position={cardMenu.menu}
        items={cardMenuItems}
        onClose={cardMenu.close}
        ariaLabel="Media card actions"
      />
    </article>
  );
}

export const MediaCard = memo(MediaCardImpl);
