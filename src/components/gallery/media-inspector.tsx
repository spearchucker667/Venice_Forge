/** @fileoverview Inspector panel: edits tags / note / favorite on a single
 * MediaItem. Uses the media-store actions for persistence. Also shows
 * seed/metadata and provides enhance/remix/copy actions. */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Heart, Trash2, Tag as TagIcon, NotebookPen, Sparkles,
  Copy, Wand2, Shuffle, Settings, RefreshCw, Repeat, Maximize2, ImagePlus, Download,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { GhostButton, Label, TextArea, Badge } from "../ui/shared";
import { mediaCapabilities, normalizedTags, splitTags } from "../../utils/mediaItem";
import { enhancePrompt, remixPrompt } from "../../services/prompt-enhancer-service";
import { useConfigStore } from "../../stores/config-store";
import { useModels } from "../../hooks/use-models";
import type { MediaItem } from "../../types/media";
import { extractGenerationRecipe, type GenerationRecipe } from "../../types/project";
import { RecipeCompatibilityCard } from "./recipe-compatibility-card";
import { usePromptLibraryStore, resolvePromptProjectId } from "../../stores/prompt-library-store";
import { toast } from "../../stores/toast-store";
import { copyText } from "../../stores/media-send-to";
import { createCharacterCardDraftFromMedia } from "../../services/characterCards/characterCardStudioHandoff";
import { useSettingsStore } from "../../stores/settings-store";
import { desktopFiles, isElectron } from "../../services/desktopBridge";

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
  /** Populates the Image Studio state with this item's stored parameters.
   *  No generation. */
  onUseSettings?: (item: MediaItem) => void;
  /** Regenerate using the stored metadata, optionally keeping the original seed. */
  onRegenerate?: (item: MediaItem, opts?: { sameSeed?: boolean; promptOverride?: string }) => void;
  /** Enhance / upscale the selected item via the existing image-tools flow. */
  onUpscale?: (item: MediaItem) => void;
  /** Apply a remixed prompt to the Image Studio (no auto-generation). */
  onApplyRemix?: (item: MediaItem, remixedPrompt: string) => void;
  /** Open the image-tools panel for the selected item. */
  onOpenImageTools?: (item: MediaItem) => void;
  /** Phase 1 — Use the stored (or reconstructed) GenerationRecipe in the target studio.
   *  The parent (gallery-view) wires this to the image-workspace handoff. */
  onUseRecipe?: (item: MediaItem) => void;
  /** Phase 2A — Use the recipe already sanitized for `currentModel`.
   *  Defaults to the same handoff as `onUseRecipe` when not supplied. */
  onUseSanitizedRecipe?: (item: MediaItem, sanitized: GenerationRecipe) => void;
  /** Phase 2A — Export the stored recipe as a downloadable JSON file. */
  onExportRecipe?: (item: MediaItem) => void;
  /** Phase 2A — The id of the currently selected target model. When
   *  supplied alongside a `generationRecipe`, the inspector renders the
   *  compatibility card. */
  currentModel?: string;
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
  onUseSettings,
  onRegenerate,
  onUpscale,
  onApplyRemix,
  onOpenImageTools,
  onUseRecipe,
  onUseSanitizedRecipe,
  onExportRecipe,
  currentModel,
}: MediaInspectorProps) {
  const [tagDraft, setTagDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState(item.note);
  const [showRecipeComparison, setShowRecipeComparison] = useState(false);

  // Live `/models` lookup. The cached response is shared across the
  // app via React Query; this is a best-effort capability enrichment
  // and never blocks rendering. When the cached list does not contain
  // the inspected model id, we fall back to the static allowlist in
  // `mediaCapabilities`.
  const modelsQuery = useModels();
  const liveVisionSupports = useMemo(() => {
    if (!item.model || !modelsQuery.data) return null;
    const match = modelsQuery.data.find((m) => m.id === item.model);
    if (!match) return null;
    return { supportsVision: match.model_spec?.capabilities?.supportsVision };
  }, [item.model, modelsQuery.data]);
  const capabilities = useMemo(
    () => mediaCapabilities({ model: item.model, liveCapabilities: liveVisionSupports }),
    [item.model, liveVisionSupports],
  );
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

  // ── Metadata & action helpers ──────────────────────────────────────────

  const [enhanceState, setEnhanceState] = useState<{
    mode: "enhance" | "remix";
    result: string;
    loading: boolean;
  } | null>(null);

  // Prompt-enhancer config (renderer-bound snapshot of internal_prompt_enhancer).
  // When `enabled` is false, the Enhance / Remix / Upscale prompt-affecting
  // actions are disabled in the inspector.
  const enhancerConfig = useConfigStore((s) => s.config?.internal_prompt_enhancer ?? null);
  const enhancerEnabled = enhancerConfig?.enabled !== false;

  const hasSeed = typeof item.seed === "number" && Number.isInteger(item.seed);
  const generationRecipe = useMemo(() => extractGenerationRecipe(item), [item]);

  const handleCopyPrompt = useCallback(() => {
    void copyText(item.prompt || "");
  }, [item.prompt]);

  const handleCopyNegative = useCallback(() => {
    void copyText(item.negative || "");
  }, [item.negative]);

  const handleCopySeed = useCallback(() => {
    if (hasSeed) void copyText(String(item.seed));
  }, [hasSeed, item.seed]);

  const handleCopyMetadata = useCallback(() => {
    const meta: Record<string, unknown> = {};
    if (item.model) meta.model = item.model;
    if (item.width || item.height) meta.dimensions = `${item.width ?? "?"}×${item.height ?? "?"}`;
    if (typeof item.seed === "number") meta.seed = item.seed;
    if (item.style) meta.style = item.style;
    if (item.steps !== undefined && item.steps !== null) meta.steps = item.steps;
    if (item.cfg !== undefined && item.cfg !== null) meta.cfg = item.cfg;
    if (item.source) meta.source = item.source;
    if (item.negative) meta.negative = item.negative;
    if (item.aspectRatio) meta.aspectRatio = item.aspectRatio;
    if (item.resolution) meta.resolution = item.resolution;
    void copyText(JSON.stringify(meta, null, 2));
  }, [item]);

  const handleCopyRecipe = useCallback(() => {
    if (generationRecipe) void copyText(JSON.stringify(generationRecipe, null, 2));
  }, [generationRecipe]);

  const handleSaveRecipeToLibrary = useCallback(async () => {
    if (!generationRecipe) return;
    try {
      const firstLine = (generationRecipe.prompt || item.prompt || "Image recipe")
        .split("\n")[0]
        ?.slice(0, 80) || "Image recipe";
      await usePromptLibraryStore.getState().createPrompt({
        title: firstLine,
        kind: "recipe",
        content: generationRecipe.prompt || item.prompt,
        negativeContent: generationRecipe.negativePrompt ?? item.negative,
        scope: "global",
        projectId: resolvePromptProjectId(item.projectId ?? null),
        modelHints: generationRecipe.model ? [generationRecipe.model] : undefined,
        source: { type: "media", sourceId: item.id },
      });
      toast.success("Saved recipe to Prompt Library");
    } catch (err) {
      toast.fromError(err, "Could not save recipe");
    }
  }, [generationRecipe, item.prompt, item.negative, item.id, item.projectId]);

  const handleExportRecipe = useCallback(() => {
    if (!generationRecipe) return;
    if (onExportRecipe) {
      onExportRecipe(item);
      return;
    }
    // Fallback: build a Blob and trigger a download. Browser-only path.
    if (typeof document === "undefined") return;
    const json = JSON.stringify(generationRecipe, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `recipe-${item.id.slice(0, 8)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [generationRecipe, onExportRecipe, item]);

  const handleUseSanitizedRecipe = useCallback(
    (sanitized: GenerationRecipe) => {
      if (onUseSanitizedRecipe) onUseSanitizedRecipe(item, sanitized);
      else if (onUseRecipe) onUseRecipe(item);
    },
    [onUseSanitizedRecipe, onUseRecipe, item],
  );

  const handleUseOriginalRecipe = useCallback(
    (original: GenerationRecipe) => {
      if (onUseRecipe) onUseRecipe(item);
      void original; // original is included for symmetry with the card; parent uses the item's stored recipe.
    },
    [onUseRecipe, item],
  );

  const handleEnhance = useCallback(async () => {
    if (!item.prompt) return;
    if (!enhancerEnabled) return;
    setEnhanceState({ mode: "enhance", result: "", loading: true });
    try {
      const { prompt } = await enhancePrompt(
        {
          mode: "enhance",
          prompt: item.prompt,
          negativePrompt: item.negative ?? null,
          model: item.model,
          seed: item.seed ?? null,
        },
        enhancerConfig,
      );
      setEnhanceState({ mode: "enhance", result: prompt, loading: false });
    } catch {
      setEnhanceState(null);
    }
  }, [item.prompt, item.negative, item.model, item.seed, enhancerEnabled, enhancerConfig]);

  const handleRemix = useCallback(async () => {
    if (!item.prompt) return;
    if (!enhancerEnabled) return;
    setEnhanceState({ mode: "remix", result: "", loading: true });
    try {
      const { prompt } = await remixPrompt(
        {
          mode: "remix",
          prompt: item.prompt,
          negativePrompt: item.negative ?? null,
          model: item.model,
          seed: item.seed ?? null,
        },
        enhancerConfig,
      );
      setEnhanceState({ mode: "remix", result: prompt, loading: false });
    } catch {
      setEnhanceState(null);
    }
  }, [item.prompt, item.negative, item.model, item.seed, enhancerEnabled, enhancerConfig]);

  const handleApplyEnhance = useCallback(async () => {
    if (!enhanceState || !enhanceState.result) return;
    await onPatch(item.id, {
      prompt: enhanceState.result,
      enhancedPrompt: enhanceState.mode === "enhance" ? enhanceState.result : item.enhancedPrompt,
      originalPrompt: item.originalPrompt || item.prompt,
      remixPrompt: enhanceState.mode === "remix" ? enhanceState.result : item.remixPrompt,
    });
    setEnhanceState(null);
  }, [enhanceState, onPatch, item.id, item.enhancedPrompt, item.originalPrompt, item.prompt, item.remixPrompt]);

  const handleApplyRemixToStudio = useCallback(() => {
    if (!enhanceState || enhanceState.mode !== "remix" || !enhanceState.result) return;
    if (onApplyRemix) onApplyRemix(item, enhanceState.result);
    setEnhanceState(null);
  }, [enhanceState, onApplyRemix, item]);

  const handleRemixAndGenerate = useCallback(() => {
    if (!enhanceState || enhanceState.mode !== "remix" || !enhanceState.result) return;
    if (onRegenerate) onRegenerate(item, { sameSeed: false, promptOverride: enhanceState.result });
    setEnhanceState(null);
  }, [enhanceState, onRegenerate, item]);

  const handleUseSettingsClick = useCallback(() => {
    if (onUseSettings) onUseSettings(item);
  }, [onUseSettings, item]);

  const handleRegenerateClick = useCallback(() => {
    if (onRegenerate) onRegenerate(item, { sameSeed: false });
  }, [onRegenerate, item]);

  const handleRegenerateSameSeedClick = useCallback(() => {
    if (onRegenerate) onRegenerate(item, { sameSeed: true });
  }, [onRegenerate, item]);

  const handleUpscaleClick = useCallback(() => {
    if (onUpscale) onUpscale(item);
  }, [onUpscale, item]);

  const handleEditClick = useCallback(() => {
    if (onOpenImageTools) onOpenImageTools(item);
  }, [onOpenImageTools, item]);

  const hasMetadata = typeof item.seed === "number" || item.source || item.style ||
    item.steps !== undefined || item.cfg !== undefined || item.aspectRatio;

  return (
    <aside
      className="flex h-full w-full flex-col gap-4 overflow-y-auto soft-separator-x mesh-surface px-4 py-4"
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
          className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
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

      {/* ── Seed / metadata section ─────────────────────────────────── */}
      {hasMetadata && (
        <section>
          <Label>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Parameters
            </span>
          </Label>
          <div className="space-y-1 text-[12px] text-text-secondary">
            {typeof item.seed === "number" && (
              <div className="flex justify-between">
                <span className="text-text-muted">Seed</span>
                <span className="font-mono">{item.seed}</span>
              </div>
            )}
            {item.source && (
              <div className="flex justify-between">
                <span className="text-text-muted">Source</span>
                <span>{item.source}</span>
              </div>
            )}
            {item.style && (
              <div className="flex justify-between">
                <span className="text-text-muted">Style</span>
                <span>{item.style}</span>
              </div>
            )}
            {item.steps !== undefined && item.steps !== null && (
              <div className="flex justify-between">
                <span className="text-text-muted">Steps</span>
                <span>{String(item.steps)}</span>
              </div>
            )}
            {item.cfg !== undefined && item.cfg !== null && (
              <div className="flex justify-between">
                <span className="text-text-muted">CFG</span>
                <span>{String(item.cfg)}</span>
              </div>
            )}
            {item.aspectRatio && (
              <div className="flex justify-between">
                <span className="text-text-muted">Aspect</span>
                <span>{item.aspectRatio}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Enhanced / original prompts ─────────────────────────────── */}
      {currentModel && generationRecipe && (
        <section data-testid="inspector-recipe-compatibility">
          <Label>Recipe compatibility</Label>
          <RecipeCompatibilityCard
            recipe={generationRecipe}
            currentModel={currentModel}
            onUseWithCurrentModel={handleUseSanitizedRecipe}
            onUseOriginal={handleUseOriginalRecipe}
            showComparison={showRecipeComparison}
            onToggleComparison={() => setShowRecipeComparison((v) => !v)}
          />
        </section>
      )}
      {item.enhancedPrompt && (
        <section>
          <Label>Enhanced Prompt</Label>
          <p className="rounded-md border border-border bg-surface-elevated p-2 text-[12px] text-text-primary">
            {item.enhancedPrompt}
          </p>
        </section>
      )}
      {item.originalPrompt && item.originalPrompt !== item.prompt && (
        <section>
          <Label>Original Prompt</Label>
          <p className="rounded-md border border-border bg-surface-elevated p-2 text-[12px] text-text-muted">
            {item.originalPrompt}
          </p>
        </section>
      )}
      {item.remixPrompt && (
        <section>
          <Label>Remix Prompt</Label>
          <p className="rounded-md border border-border bg-surface-elevated p-2 text-[12px] text-text-primary">
            {item.remixPrompt}
          </p>
        </section>
      )}

      {/* ── Action buttons ──────────────────────────────────────────── */}
      <section>
        <Label>Actions</Label>
        <div className="flex flex-wrap gap-1.5">
          {onUseSettings && (
            <button
              type="button"
              onClick={handleUseSettingsClick}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title="Load this image's settings into Image Studio (no generation)"
              data-testid="inspector-use-settings"
            >
              <Settings className="h-3 w-3" /> Use settings
            </button>
          )}
          {item.mediaType === "image" && <button
            type="button"
            onClick={async () => {
              await createCharacterCardDraftFromMedia(item.id);
              useSettingsStore.getState().setActiveTab("rp-studio");
              toast.success("ST Card draft created", "The durable Media Studio asset is linked as the avatar source.");
              onClose();
            }}
            className="inline-flex items-center gap-1 rounded-md border border-accent px-2 py-1 text-[12px] text-accent hover:bg-accent/10"
            data-testid="inspector-create-st-card"
          ><ImagePlus className="h-3 w-3" /> Create ST Card</button>}
          {onUseRecipe && (
            <button
              type="button"
              onClick={() => onUseRecipe(item)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title="Load the generation recipe (prompt, model, seed, dimensions, etc.) into the appropriate studio"
              data-testid="inspector-use-recipe"
            >
              <Settings className="h-3 w-3" /> Use recipe
            </button>
          )}
          {onRegenerate && (
            <button
              type="button"
              onClick={handleRegenerateClick}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title="Regenerate using this image's settings (new random seed)"
              data-testid="inspector-regenerate"
            >
              <RefreshCw className="h-3 w-3" /> Regenerate
            </button>
          )}
          {onRegenerate && hasSeed && (
            <button
              type="button"
              onClick={handleRegenerateSameSeedClick}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title="Regenerate using the same seed as this image"
              data-testid="inspector-regenerate-same-seed"
            >
              <Repeat className="h-3 w-3" /> Same seed
            </button>
          )}
          {onUpscale && capabilities.upscale && (
            <button
              type="button"
              onClick={handleUpscaleClick}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title="Upscale / enhance this image"
              data-testid="inspector-upscale"
            >
              <Maximize2 className="h-3 w-3" /> Upscale
            </button>
          )}
          {onOpenImageTools && capabilities.edit && (
            <button
              type="button"
              onClick={handleEditClick}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title="Open this image in the image editor"
              data-testid="inspector-edit"
            >
              <ImagePlus className="h-3 w-3" /> Edit
            </button>
          )}
          {item.mediaType !== "image" && item.generatedMediaId && isElectron() && (
            <button
              type="button"
              onClick={() => void desktopFiles.saveGeneratedMedia(
                item.generatedMediaId!,
                item.mediaType === "video" ? "venice-video.mp4" : "venice-audio",
              ).then((saved) => {
                if (saved) toast.success("Media saved");
              }).catch((error) => toast.fromError(error, "Media download failed"))}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title="Save the main-process media file with a native dialog"
              data-testid="inspector-download-generated-media"
            >
              <Download className="h-3 w-3" /> Download media
            </button>
          )}
          <button
            type="button"
            onClick={handleCopyPrompt}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
            title="Copy prompt text"
            data-testid="inspector-copy-prompt"
          >
            <Copy className="h-3 w-3" /> Copy prompt
          </button>
          {item.negative && (
            <button
              type="button"
              onClick={handleCopyNegative}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title="Copy negative prompt"
              data-testid="inspector-copy-negative"
            >
              <Copy className="h-3 w-3" /> Copy negative
            </button>
          )}
          {hasSeed && (
            <button
              type="button"
              onClick={handleCopySeed}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title={`Copy seed (${item.seed})`}
              data-testid="inspector-copy-seed"
            >
              <Copy className="h-3 w-3" /> Copy seed
            </button>
          )}
          <button
            type="button"
            onClick={handleCopyMetadata}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
            title="Copy metadata as JSON"
            data-testid="inspector-copy-metadata"
          >
            <Copy className="h-3 w-3" /> Copy metadata
          </button>
          {generationRecipe && (
            <button
              type="button"
              onClick={() => void handleSaveRecipeToLibrary()}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title="Save recipe to Prompt Library"
              data-testid="inspector-save-recipe-to-library"
            >
              <NotebookPen className="h-3 w-3" /> Save recipe
            </button>
          )}
          {generationRecipe && (
            <button
              type="button"
              onClick={handleCopyRecipe}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title="Copy generation recipe as JSON"
              data-testid="inspector-copy-recipe"
            >
              <Copy className="h-3 w-3" /> Copy recipe
            </button>
          )}
          {generationRecipe && (
            <button
              type="button"
              onClick={handleExportRecipe}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title="Download generation recipe as a JSON file"
              data-testid="inspector-export-recipe"
            >
              <Download className="h-3 w-3" /> Export recipe
            </button>
          )}
          {item.prompt && (
            <>
              <button
                type="button"
                onClick={handleEnhance}
                disabled={enhanceState?.loading || !enhancerEnabled}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
                title={
                  !enhancerEnabled
                    ? "Disabled: internal_prompt_enhancer.enabled is false in config.yaml"
                    : "Enhance prompt via internal LLM"
                }
                data-testid="inspector-enhance"
              >
                <Wand2 className="h-3 w-3" /> {enhanceState?.loading && enhanceState?.mode === "enhance" ? "Enhancing…" : "Enhance"}
              </button>
              <button
                type="button"
                onClick={handleRemix}
                disabled={enhanceState?.loading || !enhancerEnabled}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
                title={
                  !enhancerEnabled
                    ? "Disabled: internal_prompt_enhancer.enabled is false in config.yaml"
                    : "Remix prompt via internal LLM"
                }
                data-testid="inspector-remix"
              >
                <Shuffle className="h-3 w-3" /> {enhanceState?.loading && enhanceState?.mode === "remix" ? "Remixing…" : "Remix"}
              </button>
            </>
          )}
        </div>
      </section>

      {/* ── Enhance / remix review modal ────────────────────────────── */}
      {enhanceState && !enhanceState.loading && enhanceState.result && (
        <section className="rounded-md border border-accent/40 bg-accent/[0.04] p-2.5">
          <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-accent">
            {enhanceState.mode === "enhance" ? "Enhanced" : "Remixed"} prompt
          </h4>
          <div className="space-y-2">
            <p className="rounded-md border border-border bg-surface-elevated p-2 text-[12px] text-text-primary">
              {enhanceState.result}
            </p>
            <p className="text-[12px] text-text-muted">
              Original: &ldquo;{item.prompt}&rdquo;
            </p>
            <div className="flex flex-wrap gap-1.5">
              {enhanceState.mode === "enhance" ? (
                <>
                  <button
                    type="button"
                    onClick={handleApplyEnhance}
                    className="inline-flex items-center gap-1 rounded-md border border-accent px-2.5 py-1 text-[12px] text-accent hover:bg-accent/10"
                    data-testid="inspector-apply-enhance"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnhanceState(null)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {onApplyRemix && (
                    <button
                      type="button"
                      onClick={handleApplyRemixToStudio}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
                      data-testid="inspector-remix-apply-to-studio"
                    >
                      Apply to Image Studio
                    </button>
                  )}
                  {onApplyRemix && onRegenerate && (
                    <button
                      type="button"
                      onClick={handleRemixAndGenerate}
                      className="inline-flex items-center gap-1 rounded-md border border-accent px-2.5 py-1 text-[12px] text-accent hover:bg-accent/10"
                      data-testid="inspector-remix-and-generate"
                    >
                      Remix &amp; Generate
                    </button>
                  )}
                  {onApplyRemix && (
                    <button
                      type="button"
                      onClick={() => {
                        // Persist the remixed prompt without triggering the studio.
                        void onPatch(item.id, {
                          prompt: enhanceState.result,
                          remixPrompt: enhanceState.result,
                          originalPrompt: item.originalPrompt || item.prompt,
                        });
                        setEnhanceState(null);
                      }}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
                      data-testid="inspector-remix-save"
                    >
                      Save remix
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEnhanceState(null)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ── Loading state ───────────────────────────────────────────── */}
      {enhanceState?.loading && (
        <section className="rounded-md border border-border p-2.5">
          <p className="text-[12px] text-text-muted">
            {enhanceState.mode === "enhance" ? "Enhancing" : "Remixing"} prompt via internal LLM…
          </p>
        </section>
      )}

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
          <p className="mt-1.5 text-[12px] text-text-muted">
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
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-elevated px-1.5 py-0.5 text-[12px] text-text-secondary hover:border-rose-400/40 hover:text-rose-300"
              >
                #{tag}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-[12px] text-text-muted">No tags yet.</p>
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
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] text-text-secondary transition-colors hover:border-accent hover:text-accent disabled:opacity-30"
          >
            <NotebookPen className="h-3 w-3" /> Save note
          </button>
        </div>
      </section>

      {parentItem && (
        <section>
          <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            Parent
          </h4>
          <button
            type="button"
            onClick={() => onOpenParent(parentItem)}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-surface-elevated p-2 text-left hover:border-accent"
          >
            <span className="line-clamp-1 text-[12px] text-text-primary">{parentItem.prompt || "Untitled"}</span>
            <span className="ml-auto text-[12px] text-text-muted">View</span>
          </button>
        </section>
      )}

      {childrenItems.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-text-muted">
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
                  <span className="ml-auto text-[12px] text-text-muted">{child.operation}</span>
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
          <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-amber-200/90">
            Missing references
          </h4>
          <p className="mb-2 text-[12px] text-text-secondary">
            {hasDanglingParent && hasDanglingChildren
              ? "This item references records that no longer exist. Clear the stale pointers to repair the lineage."
              : hasDanglingParent
                ? "This item's parent record is missing. Clear the parent link to repair the lineage."
                : `${missingChildIds.length} child ${missingChildIds.length === 1 ? "reference" : "references"} could not be resolved. Clear the stale pointer${missingChildIds.length === 1 ? "" : "s"} to repair the lineage.`}
          </p>
          {hasDanglingParent && (
            <div className="mb-1.5 flex items-center gap-2 text-[12px] text-text-muted">
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
            <div className="flex items-center gap-2 text-[12px] text-text-muted">
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
