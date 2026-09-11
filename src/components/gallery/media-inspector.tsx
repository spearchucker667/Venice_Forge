/** @fileoverview Inspector panel: edits tags / note / favorite on a single
 * MediaItem. Uses the media-store actions for persistence. Also shows
 * seed/metadata and provides enhance/remix/copy actions. */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Heart,
  Trash2,
  Tag as TagIcon,
  NotebookPen,
  Sparkles,
  Copy,
  Wand2,
  Shuffle,
  Settings,
  RefreshCw,
  Repeat,
  Maximize2,
  ImagePlus,
  Download,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { isImeCompositionEvent } from "../../lib/keyboard";
import { GhostButton, Label, TextArea, Badge } from "../ui/shared";
import {
  mediaActionCapabilities,
  mediaCapabilities,
  mediaItemSource,
  normalizedTags,
  splitTags,
} from "../../utils/mediaItem";
import {
  enhancePrompt,
  remixPrompt,
} from "../../services/prompt-enhancer-service";
import { derivePromptEnhancerModelFacts } from "../../services/prompt-enhancer-context";
import {
  buildDimensionOptions,
  getImageModelCapabilities,
  resolveStyleReferenceCapabilities,
} from "../../config/image-model-capabilities";
import { useConfigStore } from "../../stores/config-store";
import { useModels } from "../../hooks/use-models";
import type { MediaItem } from "../../types/media";
import {
  extractGenerationRecipe,
  type GenerationRecipe,
} from "../../types/project";
import { RecipeCompatibilityCard } from "./recipe-compatibility-card";
import {
  usePromptLibraryStore,
  resolvePromptProjectId,
} from "../../stores/prompt-library-store";
import { toast } from "../../stores/toast-store";
import { copyText } from "../../stores/media-send-to";
import { useSettingsStore } from "../../stores/settings-store";
import { useCharacterCreatorLaunchStore } from "../../stores/character-creator-launch-store";
import { desktopMedia, isElectron } from "../../services/desktopBridge";
import { buildMediaFilename } from "../../stores/media-export-bundle";
import { Trans, useTranslation } from "react-i18next";

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
  onRegenerate?: (
    item: MediaItem,
    opts?: { sameSeed?: boolean; promptOverride?: string },
  ) => void;
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
  const { t: tRuntime } = useTranslation("common");
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
    () =>
      mediaCapabilities({
        model: item.model,
        liveCapabilities: liveVisionSupports,
      }),
    [item.model, liveVisionSupports],
  );
  const actionCapabilities = useMemo(
    () => mediaActionCapabilities(item),
    [item],
  );
  const hasAnyCapability =
    capabilities.upscale ||
    capabilities.edit ||
    capabilities.video ||
    capabilities.vision;

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
  const hasDanglingParent =
    item.parentId !== null &&
    item.parentId !== undefined &&
    parentItem === null;
  const hasDanglingChildren = missingChildIds.length > 0;
  const hasAnyDangling = hasDanglingParent || hasDanglingChildren;

  const handleClearDanglingParent = async () => {
    await onPatch(item.id, { parentId: null });
  };

  const handleClearDanglingChildren = async () => {
    const filtered = item.childrenIds.filter(
      (id) => !missingChildIds.includes(id),
    );
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
  const enhancerConfig = useConfigStore(
    (s) => s.config?.internal_prompt_enhancer ?? null,
  );
  const enhancerEnabled = enhancerConfig?.enabled !== false;

  const hasSeed = typeof item.seed === "number" && Number.isInteger(item.seed);
  const generationRecipe = useMemo(() => extractGenerationRecipe(item), [item]);
  const enhancerModelFacts = useMemo(() => {
    if (!item.model) return undefined;
    const runtimeModel = modelsQuery.data?.find(
      (candidate) => candidate.id === item.model,
    );
    const runtimeConstraints = runtimeModel?.model_spec?.constraints;
    return derivePromptEnhancerModelFacts({
      modelId: item.model,
      runtimeModel,
      capabilities: getImageModelCapabilities(item.model),
      dimensionMode: buildDimensionOptions(
        item.model,
        runtimeConstraints && !("model_type" in runtimeConstraints)
          ? runtimeConstraints
          : undefined,
      ).dimensionMode,
      referenceCapabilities: resolveStyleReferenceCapabilities(
        item.model,
        runtimeModel?.model_spec,
      ),
    });
  }, [item.model, modelsQuery.data]);
  const enhancerDimensions = useMemo(
    () => ({
      width: generationRecipe?.width,
      height: generationRecipe?.height,
      aspectRatio: generationRecipe?.aspectRatio,
      resolution: generationRecipe?.resolution,
    }),
    [generationRecipe],
  );

  const handleCopyPrompt = useCallback(() => {
    void copyText(item.prompt || "");
  }, [item.prompt]);

  const handleCopyNegative = useCallback(() => {
    void copyText(item.negative || "");
  }, [item.negative]);

  const handleCopySeed = useCallback(() => {
    if (hasSeed) void copyText(String(item.seed));
  }, [hasSeed, item.seed]);

  const handleInspectorDownload = useCallback(async () => {
    try {
      const result = await desktopMedia.saveMediaAs({
        source: mediaItemSource(item) ?? undefined,
        mediaId: item.generatedMediaId,
        mimeType: item.mimeType,
        suggestedName: buildMediaFilename(item),
      });
      if (result.status === "failed") throw new Error(result.error);
      if (result.status === "saved") toast.success(
        tRuntime(
          "runtimeGenerated.components.gallery.mediaInspector.notification.mediaSaved",
        ),
      );
    } catch (error) {
      toast.fromError(
        error,
        tRuntime(
          "runtimeGenerated.components.gallery.mediaInspector.notification.mediaDownloadFailed",
        ),
      );
    }
  }, [item, tRuntime]);

  const handleCopyMetadata = useCallback(() => {
    const meta: Record<string, unknown> = {};
    if (item.model) meta.model = item.model;
    if (item.width || item.height)
      meta.dimensions = `${item.width ?? "?"}×${item.height ?? "?"}`;
    if (typeof item.seed === "number") meta.seed = item.seed;
    if (item.style) meta.style = item.style;
    if (item.steps !== undefined && item.steps !== null)
      meta.steps = item.steps;
    if (item.cfg !== undefined && item.cfg !== null) meta.cfg = item.cfg;
    if (item.source) meta.source = item.source;
    if (item.negative) meta.negative = item.negative;
    if (item.aspectRatio) meta.aspectRatio = item.aspectRatio;
    if (item.resolution) meta.resolution = item.resolution;
    void copyText(JSON.stringify(meta, null, 2));
  }, [item]);

  const handleCopyRecipe = useCallback(() => {
    if (generationRecipe)
      void copyText(JSON.stringify(generationRecipe, null, 2));
  }, [generationRecipe]);

  const handleSaveRecipeToLibrary = useCallback(async () => {
    if (!generationRecipe) return;
    try {
      const firstLine =
        (generationRecipe.prompt || item.prompt || "Image recipe")
          .split("\n")[0]
          ?.slice(0, 80) || "Image recipe";
      await usePromptLibraryStore.getState().createPrompt({
        title: firstLine,
        kind: "recipe",
        content: generationRecipe.prompt || item.prompt,
        negativeContent: generationRecipe.negativePrompt ?? item.negative,
        scope: "global",
        projectId: resolvePromptProjectId(item.projectId ?? null),
        modelHints: generationRecipe.model
          ? [generationRecipe.model]
          : undefined,
        source: { type: "media", sourceId: item.id },
      });
      toast.success(
        tRuntime(
          "runtimeGenerated.components.gallery.mediaInspector.notification.savedRecipeToPromptLibrary",
        ),
      );
    } catch (err) {
      toast.fromError(
        err,
        tRuntime(
          "runtimeGenerated.components.gallery.mediaInspector.notification.couldNotSaveRecipe",
        ),
      );
    }
  }, [generationRecipe, item.prompt, item.negative, item.id, item.projectId, tRuntime]);

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
          targetModel: enhancerModelFacts,
          dimensions: enhancerDimensions,
          stylePreset: generationRecipe?.style ?? item.style,
          generationMode: generationRecipe?.operation ?? item.operation,
        },
        enhancerConfig,
      );
      setEnhanceState({ mode: "enhance", result: prompt, loading: false });
    } catch {
      setEnhanceState(null);
    }
  }, [
    item.prompt,
    item.negative,
    enhancerModelFacts,
    enhancerDimensions,
    generationRecipe,
    item.style,
    item.operation,
    enhancerEnabled,
    enhancerConfig,
  ]);

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
          targetModel: enhancerModelFacts,
          dimensions: enhancerDimensions,
          stylePreset: generationRecipe?.style ?? item.style,
          generationMode: generationRecipe?.operation ?? item.operation,
        },
        enhancerConfig,
      );
      setEnhanceState({ mode: "remix", result: prompt, loading: false });
    } catch {
      setEnhanceState(null);
    }
  }, [
    item.prompt,
    item.negative,
    enhancerModelFacts,
    enhancerDimensions,
    generationRecipe,
    item.style,
    item.operation,
    enhancerEnabled,
    enhancerConfig,
  ]);

  const handleApplyEnhance = useCallback(async () => {
    if (!enhanceState || !enhanceState.result) return;
    await onPatch(item.id, {
      prompt: enhanceState.result,
      enhancedPrompt:
        enhanceState.mode === "enhance"
          ? enhanceState.result
          : item.enhancedPrompt,
      originalPrompt: item.originalPrompt || item.prompt,
      remixPrompt:
        enhanceState.mode === "remix" ? enhanceState.result : item.remixPrompt,
    });
    setEnhanceState(null);
  }, [
    enhanceState,
    onPatch,
    item.id,
    item.enhancedPrompt,
    item.originalPrompt,
    item.prompt,
    item.remixPrompt,
  ]);

  const handleApplyRemixToStudio = useCallback(() => {
    if (!enhanceState || enhanceState.mode !== "remix" || !enhanceState.result)
      return;
    if (onApplyRemix) onApplyRemix(item, enhanceState.result);
    setEnhanceState(null);
  }, [enhanceState, onApplyRemix, item]);

  const handleRemixAndGenerate = useCallback(() => {
    if (!enhanceState || enhanceState.mode !== "remix" || !enhanceState.result)
      return;
    if (onRegenerate)
      onRegenerate(item, {
        sameSeed: false,
        promptOverride: enhanceState.result,
      });
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

  const hasMetadata =
    typeof item.seed === "number" ||
    item.source ||
    item.style ||
    item.steps !== undefined ||
    item.cfg !== undefined ||
    item.aspectRatio;

  return (
    <aside
      className="flex h-full w-full flex-col gap-4 overflow-y-auto soft-separator-x mesh-surface px-4 py-4"
      aria-label={tRuntime(
        "runtimeGenerated.components.gallery.mediaInspector.attribute.mediaInspector",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            <Trans i18nKey="common:surface.componentsGalleryMediaInspector.heading.inspector" />
          </h3>
          <p className="mt-1 line-clamp-2 text-[13px] text-text-primary">
            {item.prompt ||
              tRuntime(
                "runtimeGenerated.components.gallery.mediaInspector.text.untitled",
              )}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
        >
          <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.close" />
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
            <Heart
              className={cn("h-3.5 w-3.5", item.favorite && "fill-current")}
            />
            {item.favorite
              ? tRuntime(
                  "runtimeGenerated.components.gallery.mediaInspector.text.favorited",
                )
              : tRuntime(
                  "runtimeGenerated.components.gallery.mediaInspector.text.markAsFavorite",
                )}
          </button>
          <GhostButton onClick={() => onDelete(item)} ariaLabel="Delete">
            <span className="inline-flex items-center gap-1.5 text-danger">
              <Trash2 className="h-3.5 w-3.5" />{" "}
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.delete" />
            </span>
          </GhostButton>
        </div>
      </section>

      {/* ── Seed / metadata section ─────────────────────────────────── */}
      {hasMetadata && (
        <section>
          <Label>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" />{" "}
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.parameters" />
            </span>
          </Label>
          <div className="space-y-1 text-[12px] text-text-secondary">
            {typeof item.seed === "number" && (
              <div className="flex justify-between">
                <span className="text-text-muted">
                  <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.seed" />
                </span>
                <span className="font-mono">{item.seed}</span>
              </div>
            )}
            {item.source && (
              <div className="flex justify-between">
                <span className="text-text-muted">
                  <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.source" />
                </span>
                <span>{item.source}</span>
              </div>
            )}
            {item.style && (
              <div className="flex justify-between">
                <span className="text-text-muted">
                  <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.style" />
                </span>
                <span>{item.style}</span>
              </div>
            )}
            {item.steps !== undefined && item.steps !== null && (
              <div className="flex justify-between">
                <span className="text-text-muted">
                  <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.steps" />
                </span>
                <span>{String(item.steps)}</span>
              </div>
            )}
            {item.cfg !== undefined && item.cfg !== null && (
              <div className="flex justify-between">
                <span className="text-text-muted">
                  <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.cfg" />
                </span>
                <span>{String(item.cfg)}</span>
              </div>
            )}
            {item.aspectRatio && (
              <div className="flex justify-between">
                <span className="text-text-muted">
                  <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.aspect" />
                </span>
                <span>{item.aspectRatio}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Enhanced / original prompts ─────────────────────────────── */}
      {currentModel && generationRecipe && (
        <section data-testid="inspector-recipe-compatibility">
          <Label>
            <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.recipeCompatibility" />
          </Label>
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
          <Label>
            <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.enhancedPrompt" />
          </Label>
          <p className="rounded-md border border-border bg-surface-elevated p-2 text-[12px] text-text-primary">
            {item.enhancedPrompt}
          </p>
        </section>
      )}
      {item.originalPrompt && item.originalPrompt !== item.prompt && (
        <section>
          <Label>
            <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.originalPrompt" />
          </Label>
          <p className="rounded-md border border-border bg-surface-elevated p-2 text-[12px] text-text-muted">
            {item.originalPrompt}
          </p>
        </section>
      )}
      {item.remixPrompt && (
        <section>
          <Label>
            <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.remixPrompt" />
          </Label>
          <p className="rounded-md border border-border bg-surface-elevated p-2 text-[12px] text-text-primary">
            {item.remixPrompt}
          </p>
        </section>
      )}

      {/* ── Action buttons ──────────────────────────────────────────── */}
      <section>
        <Label>
          <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.actions" />
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {onUseSettings && (
            <button
              type="button"
              onClick={handleUseSettingsClick}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title={tRuntime(
                "runtimeGenerated.components.gallery.mediaInspector.attribute.loadThisImageSSettingsIntoImageStudioNoGeneration",
              )}
              data-testid="inspector-use-settings"
            >
              <Settings className="h-3 w-3" />{" "}
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.useSettings" />
            </button>
          )}
          {item.mediaType === "image" && (
            <button
              type="button"
              onClick={async () => {
                useCharacterCreatorLaunchStore.getState().launch({
                  mode: "new-from-image",
                  sourceMediaId: item.id,
                });
                useSettingsStore.getState().setActiveTab("character-creator");
                toast.success(
                  tRuntime(
                    "runtimeGenerated.components.gallery.mediaInspector.notification.aiCharacterCreatorLaunched",
                  ),
                );
                onClose();
              }}
              className="inline-flex items-center gap-1 rounded-md border border-accent px-2 py-1 text-[12px] text-accent hover:bg-accent/10"
              data-testid="inspector-create-st-card"
            >
              <ImagePlus className="h-3 w-3" />{" "}
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.createStCard" />
            </button>
          )}
          {onUseRecipe && (
            <button
              type="button"
              onClick={() => onUseRecipe(item)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title={tRuntime(
                "runtimeGenerated.components.gallery.mediaInspector.attribute.loadTheGenerationRecipePromptModelSeedDimensionsEtcInto",
              )}
              data-testid="inspector-use-recipe"
            >
              <Settings className="h-3 w-3" />{" "}
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.useRecipe" />
            </button>
          )}
          {onRegenerate && (
            <button
              type="button"
              onClick={handleRegenerateClick}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title={tRuntime(
                "runtimeGenerated.components.gallery.mediaInspector.attribute.regenerateUsingThisImageSSettingsNewRandomSeed",
              )}
              data-testid="inspector-regenerate"
            >
              <RefreshCw className="h-3 w-3" />{" "}
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.regenerate" />
            </button>
          )}
          {onRegenerate && hasSeed && (
            <button
              type="button"
              onClick={handleRegenerateSameSeedClick}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title={tRuntime(
                "runtimeGenerated.components.gallery.mediaInspector.attribute.regenerateUsingTheSameSeedAsThisImage",
              )}
              data-testid="inspector-regenerate-same-seed"
            >
              <Repeat className="h-3 w-3" />{" "}
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.sameSeed" />
            </button>
          )}
          {onUpscale && actionCapabilities.canUpscale && (
            <button
              type="button"
              onClick={handleUpscaleClick}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title={tRuntime(
                "runtimeGenerated.components.gallery.mediaInspector.attribute.upscaleEnhanceThisImage",
              )}
              data-testid="inspector-upscale"
            >
              <Maximize2 className="h-3 w-3" />{" "}
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.upscale" />
            </button>
          )}
          {onOpenImageTools && actionCapabilities.canEdit && (
            <button
              type="button"
              onClick={handleEditClick}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title={tRuntime(
                "runtimeGenerated.components.gallery.mediaInspector.attribute.openThisImageInTheImageEditor",
              )}
              data-testid="inspector-edit"
            >
              <ImagePlus className="h-3 w-3" />{" "}
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.edit" />
            </button>
          )}
          {(item.generatedMediaId || mediaItemSource(item)) && isElectron() && (
            <button
              type="button"
              onClick={() => void handleInspectorDownload()}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title={tRuntime(
                "runtimeGenerated.components.gallery.mediaInspector.attribute.saveTheMainProcessMediaFileWithANativeDialog",
              )}
              data-testid="inspector-download-generated-media"
            >
              <Download className="h-3 w-3" />{" "}
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.downloadMedia" />
            </button>
          )}
          <button
            type="button"
            onClick={handleCopyPrompt}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
            title={tRuntime(
              "runtimeGenerated.components.gallery.mediaInspector.attribute.copyPromptText",
            )}
            data-testid="inspector-copy-prompt"
          >
            <Copy className="h-3 w-3" />{" "}
            <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.copyPrompt" />
          </button>
          {item.negative && (
            <button
              type="button"
              onClick={handleCopyNegative}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title={tRuntime(
                "runtimeGenerated.components.gallery.mediaInspector.attribute.copyNegativePrompt",
              )}
              data-testid="inspector-copy-negative"
            >
              <Copy className="h-3 w-3" />{" "}
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.copyNegative" />
            </button>
          )}
          {hasSeed && (
            <button
              type="button"
              onClick={handleCopySeed}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title={tRuntime(
                "runtimeGenerated.components.gallery.mediaInspector.attribute.copySeedValue1",
                { value1: item.seed },
              )}
              data-testid="inspector-copy-seed"
            >
              <Copy className="h-3 w-3" />{" "}
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.copySeed" />
            </button>
          )}
          <button
            type="button"
            onClick={handleCopyMetadata}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
            title={tRuntime(
              "runtimeGenerated.components.gallery.mediaInspector.attribute.copyMetadataAsJson",
            )}
            data-testid="inspector-copy-metadata"
          >
            <Copy className="h-3 w-3" />{" "}
            <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.copyMetadata" />
          </button>
          {generationRecipe && (
            <button
              type="button"
              onClick={() => void handleSaveRecipeToLibrary()}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title={tRuntime(
                "runtimeGenerated.components.gallery.mediaInspector.attribute.saveRecipeToPromptLibrary",
              )}
              data-testid="inspector-save-recipe-to-library"
            >
              <NotebookPen className="h-3 w-3" />{" "}
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.saveRecipe" />
            </button>
          )}
          {generationRecipe && (
            <button
              type="button"
              onClick={handleCopyRecipe}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title={tRuntime(
                "runtimeGenerated.components.gallery.mediaInspector.attribute.copyGenerationRecipeAsJson",
              )}
              data-testid="inspector-copy-recipe"
            >
              <Copy className="h-3 w-3" />{" "}
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.copyRecipe" />
            </button>
          )}
          {generationRecipe && (
            <button
              type="button"
              onClick={handleExportRecipe}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              title={tRuntime(
                "runtimeGenerated.components.gallery.mediaInspector.attribute.downloadGenerationRecipeAsAJsonFile",
              )}
              data-testid="inspector-export-recipe"
            >
              <Download className="h-3 w-3" />{" "}
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.exportRecipe" />
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
                    ? tRuntime(
                        "runtimeGenerated.components.gallery.mediaInspector.attribute.disabledInternalPromptEnhancerEnabledIsFalseInConfigYaml",
                      )
                    : tRuntime(
                        "runtimeGenerated.components.gallery.mediaInspector.attribute.enhancePromptViaInternalLlm",
                      )
                }
                data-testid="inspector-enhance"
              >
                <Wand2 className="h-3 w-3" />{" "}
                {enhanceState?.loading && enhanceState?.mode === "enhance"
                  ? tRuntime(
                      "runtimeGenerated.components.gallery.mediaInspector.text.enhancing",
                    )
                  : tRuntime(
                      "runtimeGenerated.components.gallery.mediaInspector.text.enhance",
                    )}
              </button>
              <button
                type="button"
                onClick={handleRemix}
                disabled={enhanceState?.loading || !enhancerEnabled}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-40"
                title={
                  !enhancerEnabled
                    ? tRuntime(
                        "runtimeGenerated.components.gallery.mediaInspector.attribute.disabledInternalPromptEnhancerEnabledIsFalseInConfigYaml",
                      )
                    : tRuntime(
                        "runtimeGenerated.components.gallery.mediaInspector.attribute.remixPromptViaInternalLlm",
                      )
                }
                data-testid="inspector-remix"
              >
                <Shuffle className="h-3 w-3" />{" "}
                {enhanceState?.loading && enhanceState?.mode === "remix"
                  ? tRuntime(
                      "runtimeGenerated.components.gallery.mediaInspector.text.remixing",
                    )
                  : tRuntime(
                      "runtimeGenerated.components.gallery.mediaInspector.text.remix",
                    )}
              </button>
            </>
          )}
        </div>
      </section>

      {/* ── Enhance / remix review modal ────────────────────────────── */}
      {enhanceState && !enhanceState.loading && enhanceState.result && (
        <section className="rounded-md border border-accent/40 bg-accent/[0.04] p-2.5">
          <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-accent">
            {enhanceState.mode === "enhance"
              ? tRuntime(
                  "runtimeGenerated.components.gallery.mediaInspector.text.enhanced",
                )
              : tRuntime(
                  "runtimeGenerated.components.gallery.mediaInspector.text.remixed",
                )}{" "}
            <Trans i18nKey="common:surface.componentsGalleryMediaInspector.heading.prompt" />
          </h4>
          <div className="space-y-2">
            <p className="rounded-md border border-border bg-surface-elevated p-2 text-[12px] text-text-primary">
              {enhanceState.result}
            </p>
            <p className="text-[12px] text-text-muted">
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.description.originalLdquo" />
              {item.prompt}
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.description.rdquo" />
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
                    <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.apply" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEnhanceState(null)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
                  >
                    <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.cancel" />
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
                      <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.applyToImageStudio" />
                    </button>
                  )}
                  {onApplyRemix && onRegenerate && (
                    <button
                      type="button"
                      onClick={handleRemixAndGenerate}
                      className="inline-flex items-center gap-1 rounded-md border border-accent px-2.5 py-1 text-[12px] text-accent hover:bg-accent/10"
                      data-testid="inspector-remix-and-generate"
                    >
                      <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.remixAmpGenerate" />
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
                      <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.saveRemix" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEnhanceState(null)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
                  >
                    <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.cancel" />
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
            {enhanceState.mode === "enhance"
              ? tRuntime(
                  "runtimeGenerated.components.gallery.mediaInspector.text.enhancing2",
                )
              : tRuntime(
                  "runtimeGenerated.components.gallery.mediaInspector.text.remixing2",
                )}{" "}
            <Trans i18nKey="common:surface.componentsGalleryMediaInspector.description.promptViaInternalLlm" />
          </p>
        </section>
      )}

      {hasAnyCapability && (
        <section>
          <Label>
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3 w-3" />{" "}
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.modelCapabilities" />
            </span>
          </Label>
          <div className="flex flex-wrap gap-1">
            {capabilities.upscale && (
              <Badge tone="emerald">
                <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.upscale" />
              </Badge>
            )}
            {capabilities.edit && (
              <Badge tone="violet">
                <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.edit" />
              </Badge>
            )}
            {capabilities.video && (
              <Badge tone="sky">
                <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.video" />
              </Badge>
            )}
            {capabilities.vision && (
              <Badge tone="amber">
                <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.vision" />
              </Badge>
            )}
          </div>
          <p className="mt-1.5 text-[12px] text-text-muted">
            <Trans i18nKey="common:surface.componentsGalleryMediaInspector.description.theseEndpointsAreRecognisedForTheSource" />
          </p>
        </section>
      )}

      <section>
        <Label htmlFor="media-tags">
          <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.tags" />
        </Label>
        <div className="flex gap-1.5">
          <input
            id="media-tags"
            type="text"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              if (isImeCompositionEvent(e)) return;
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAddTags();
              }
            }}
            placeholder={tRuntime(
              "runtimeGenerated.components.gallery.mediaInspector.attribute.addATagAndPressEnter",
            )}
            className="flex-1 rounded-md border border-border bg-surface-elevated px-2 py-1.5 text-[12px] text-text-primary focus:border-accent focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleAddTags()}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
          >
            <TagIcon className="h-3.5 w-3.5" />{" "}
            <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.add" />
          </button>
        </div>
        {item.tags.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.tags.map((tag) => (
              <button
                type="button"
                key={tag}
                onClick={() => void handleRemoveTag(tag)}
                title={tRuntime(
                  "runtimeGenerated.components.gallery.mediaInspector.attribute.removeTag",
                )}
                className="inline-flex items-center gap-1 rounded-md border border-border bg-surface-elevated px-1.5 py-0.5 text-[12px] text-text-secondary hover:border-rose-400/40 hover:text-rose-300"
              >
                #{tag}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-1.5 text-[12px] text-text-muted">
            <Trans i18nKey="common:surface.componentsGalleryMediaInspector.description.noTagsYet" />
          </p>
        )}
      </section>

      <section>
        <Label
          htmlFor="media-note"
          hint={tRuntime(
            "runtimeGenerated.components.gallery.mediaInspector.attribute.value1Chars",
            { value1: noteDraft.length },
          )}
        >
          Note
        </Label>
        <TextArea
          value={noteDraft}
          onChange={setNoteDraft}
          rows={4}
          placeholder={tRuntime(
            "runtimeGenerated.components.gallery.mediaInspector.attribute.captureAQuickReminderOrSeedValue",
          )}
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
            <NotebookPen className="h-3 w-3" />{" "}
            <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.saveNote" />
          </button>
        </div>
      </section>

      {parentItem && (
        <section>
          <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            <Trans i18nKey="common:surface.componentsGalleryMediaInspector.heading.parent" />
          </h4>
          <button
            type="button"
            onClick={() => onOpenParent(parentItem)}
            className="flex w-full items-center gap-2 rounded-md border border-border bg-surface-elevated p-2 text-left hover:border-accent"
          >
            <span className="line-clamp-1 text-[12px] text-text-primary">
              {parentItem.prompt ||
                tRuntime(
                  "runtimeGenerated.components.gallery.mediaInspector.text.untitled",
                )}
            </span>
            <span className="ml-auto text-[12px] text-text-muted">
              <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.view" />
            </span>
          </button>
        </section>
      )}

      {childrenItems.length > 0 && (
        <section>
          <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            <Trans i18nKey="common:surface.componentsGalleryMediaInspector.heading.children" />
            {childrenItems.length})
          </h4>
          <ul className="space-y-1.5">
            {childrenItems.map((child) => (
              <li key={child.id}>
                <button
                  type="button"
                  onClick={() => onOpenChild(child)}
                  className="flex w-full items-center gap-2 rounded-md border border-border bg-surface-elevated p-2 text-left hover:border-accent"
                >
                  <span className="line-clamp-1 text-[12px] text-text-primary">
                    {child.prompt ||
                      tRuntime(
                        "runtimeGenerated.components.gallery.mediaInspector.text.untitled",
                      )}
                  </span>
                  <span className="ml-auto text-[12px] text-text-muted">
                    {child.operation}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasAnyDangling && (
        <section
          aria-label={tRuntime(
            "runtimeGenerated.components.gallery.mediaInspector.attribute.missingReferences",
          )}
          className="rounded-md border border-amber-400/30 bg-amber-500/[0.06] p-2.5"
        >
          <h4 className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-amber-200/90">
            <Trans i18nKey="common:surface.componentsGalleryMediaInspector.heading.missingReferences" />
          </h4>
          <p className="mb-2 text-[12px] text-text-secondary">
            {hasDanglingParent && hasDanglingChildren
              ? tRuntime(
                  "runtimeGenerated.components.gallery.mediaInspector.text.thisItemReferencesRecordsThatNoLongerExistClearThe",
                )
              : hasDanglingParent
                ? tRuntime(
                    "runtimeGenerated.components.gallery.mediaInspector.text.thisItemSParentRecordIsMissingClearTheParent",
                  )
                : tRuntime(
                    "runtimeGenerated.components.gallery.mediaInspector.text.value1ChildValue2CouldNotBeResolvedClearTheStale",
                    {
                      value1: missingChildIds.length,
                      value2:
                        missingChildIds.length === 1
                          ? "reference"
                          : "references",
                      value3: missingChildIds.length === 1 ? "" : "s",
                    },
                  )}
          </p>
          {hasDanglingParent && (
            <div className="mb-1.5 flex items-center gap-2 text-[12px] text-text-muted">
              <span className="font-mono">
                <Trans i18nKey="common:surface.componentsGalleryMediaInspector.text.parentid" />
                {item.parentId}
              </span>
              <button
                type="button"
                onClick={() => void handleClearDanglingParent()}
                className="ml-auto rounded-md border border-amber-400/40 px-2 py-1 text-amber-200/90 hover:border-amber-300 hover:text-amber-100"
              >
                <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.clearParentLink" />
              </button>
            </div>
          )}
          {hasDanglingChildren && (
            <div className="flex items-center gap-2 text-[12px] text-text-muted">
              <span className="line-clamp-1 font-mono">
                {missingChildIds.length === 1
                  ? tRuntime(
                      "runtimeGenerated.components.gallery.mediaInspector.text.childrenidsValue1",
                      { value1: missingChildIds[0] },
                    )
                  : tRuntime(
                      "runtimeGenerated.components.gallery.mediaInspector.text.childrenidsValue1Missing",
                      { value1: missingChildIds.length },
                    )}
              </span>
              <button
                type="button"
                onClick={() => void handleClearDanglingChildren()}
                className="ml-auto rounded-md border border-amber-400/40 px-2 py-1 text-amber-200/90 hover:border-amber-300 hover:text-amber-100"
              >
                <Trans i18nKey="common:surface.componentsGalleryMediaInspector.action.clear" />{" "}
                {missingChildIds.length === 1
                  ? tRuntime(
                      "runtimeGenerated.components.gallery.mediaInspector.text.value1MissingRef",
                    )
                  : tRuntime(
                      "runtimeGenerated.components.gallery.mediaInspector.text.value1MissingRefs",
                      { value1: missingChildIds.length },
                    )}
              </button>
            </div>
          )}
        </section>
      )}
    </aside>
  );
}
