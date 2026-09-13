import {
  useState,
  useMemo,
  useEffect,
  useCallback,
  useRef,
  useId,
} from "react";
import { useSettingsStore } from "../../stores/settings-store";
import { useModels } from "../../hooks/use-models";
import { useStyles } from "../../hooks/use-styles";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useImageGenerate } from "../../hooks/use-image";
import { selectHasVeniceKey, useAuthStore } from "../../stores/auth-store";
import { Select } from "../ui/select";
import {
  Label,
  TextArea,
  PrimaryButton,
  PillGroup,
  ErrorText,
  ExamplePrompts,
} from "../ui/shared";
import { GenerationView } from "../ui/generation-view";
import type { ImageConstraints } from "../../types/venice";
import { useMediaStore } from "../../stores/media-store";
import {
  usePromptLibraryStore,
  resolvePromptProjectId,
} from "../../stores/prompt-library-store";
import { toast } from "../../stores/toast-store";
import { redactErrorMessage } from "../../shared/redaction";
import type { MediaItem } from "../../types/media";
import { useCharacterCreatorLaunchStore } from "../../stores/character-creator-launch-store";
import { generateId } from "../../lib/utils";
import { getPromptStartersForCategory } from "../../services/promptStarterService";
import { isElectron, desktopMedia } from "../../services/desktopBridge";
import { PROMPT_TEMPLATES } from "../../constants/promptTemplates";
import { processBase64Image, routeAsset } from "../../utils/imageProcessor";
import { getExtensionFromDataUrl } from "../../utils/image";
import { downloadImage as downloadImageUtil } from "../../utils/download";
import { safeVeniceMediaUrl } from "../../utils/mediaItem";
import {
  getImageModelCapabilities,
  buildDimensionOptions,
  getRecipeCapabilityList,
  resolveStyleReferenceCapabilities,
} from "../../config/image-model-capabilities";
import { enhancePrompt } from "../../services/prompt-enhancer-service";
import { derivePromptEnhancerModelFacts } from "../../services/prompt-enhancer-context";
import {
  buildImagePayload,
  clampSeed,
  IMAGE_PROMPT_MAX_CHARS,
  randomSeed,
  type ImageSeedState,
} from "../../utils/payloadBuilders";
import { useConfigStore } from "../../stores/config-store";
import {
  useImageWorkspaceStore,
  type ImageGenerateHandoff,
} from "../../stores/image-workspace-store";
import { GenerationLoadingIndicator } from "../generation/GenerationLoadingIndicator";

import { DEFAULT_IMAGE_MODEL } from "../../constants/venice";
import { Trans, useTranslation } from "react-i18next";
import { ContextMenu, useContextMenu } from "../ui/ContextMenu";
import type { ContextMenuItem } from "../ui/ContextMenu";
import { copyText } from "../../utils/download";
import {
  readStyleReferenceFile,
  StyleReferenceFileError,
  type StyleReferenceInput,
} from "../../utils/styleReferenceFiles";

function toImageSrc(b64: string): string {
  if (!b64) return "";
  // `venice-media:` strings MUST pass the strict 64-hex validator. Without
  // this guard, malformed durable URLs (wrong length / case / non-hex) are
  // forwarded verbatim to image elements, producing the broken card seen
  // in the screenshot regression. See VERIFY-MEDIA-DURABLE-001.
  if (safeVeniceMediaUrl(b64)) return b64;
  if (
    b64.startsWith("data:") ||
    b64.startsWith("http://") ||
    b64.startsWith("https://") ||
    b64.startsWith("blob:")
  )
    return b64;
  return `data:image/png;base64,${b64}`;
}

const MEDIA_RECORD_RETRY_DELAYS_MS = [25, 100, 250] as const;
const TRANSIENT_MEDIA_RECORD_ERRORS = new Set([
  "AbortError",
  "InvalidStateError",
  "TransactionInactiveError",
  "UnknownError",
]);

async function persistMediaRecordWithRetry(
  operation: () => Promise<unknown>,
): Promise<void> {
  for (
    let attempt = 0;
    attempt <= MEDIA_RECORD_RETRY_DELAYS_MS.length;
    attempt += 1
  ) {
    try {
      await operation();
      return;
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (
        !TRANSIENT_MEDIA_RECORD_ERRORS.has(name) ||
        attempt === MEDIA_RECORD_RETRY_DELAYS_MS.length
      ) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, MEDIA_RECORD_RETRY_DELAYS_MS[attempt]),
      );
    }
  }
}

interface PendingImageSave {
  mediaItem: MediaItem;
  parentId?: string;
  recoveryId?: string;
}

export function ImageView() {
  const { t: tRuntime } = useTranslation("common");
  const { t } = useTranslation("media");
  const lightboxMenu = useContextMenu();
  const promptId = useId();
  const negativePromptId = useId();
  const styleId = useId();
  const seedId = useId();
  const stepsId = useId();
  const variantsId = useId();
  const styleReferencesId = useId();
  const hasVeniceKey = useAuthStore(selectHasVeniceKey);
  const selectedModel = useSettingsStore((s) => s.selectedModels.image);
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel);
  const veniceApiSafeMode = useSettingsStore((s) => s.veniceApiSafeMode);
  const { data: models } = useModels("image");
  const { data: styles } = useStyles();
  const model = selectedModel || models?.[0]?.id || DEFAULT_IMAGE_MODEL;

  const modelData = models?.find((m) => m.id === model);
  const constraints = modelData?.model_spec?.constraints as
    ImageConstraints | undefined;

  const caps = useMemo(() => getImageModelCapabilities(model), [model]);
  const dimOptions = useMemo(
    () => buildDimensionOptions(model, constraints),
    [model, constraints],
  );
  const styleReferenceCapabilities = useMemo(
    () => resolveStyleReferenceCapabilities(model, modelData?.model_spec),
    [model, modelData?.model_spec],
  );
  const styleReferencesEnabled =
    styleReferenceCapabilities.supported &&
    styleReferenceCapabilities.maxReferences > 0;
  const enhancerModelFacts = useMemo(
    () =>
      derivePromptEnhancerModelFacts({
        modelId: model,
        runtimeModel: modelData,
        capabilities: caps,
        dimensionMode: dimOptions.dimensionMode,
        referenceCapabilities: styleReferenceCapabilities,
      }),
    [caps, dimOptions.dimensionMode, model, modelData, styleReferenceCapabilities],
  );
  const capabilitySummary = useMemo(
    () =>
      getRecipeCapabilityList({
        ...caps,
        supportsReferences: styleReferencesEnabled,
        referenceLimit: styleReferencesEnabled
          ? styleReferenceCapabilities.maxReferences
          : 0,
      }).map((descriptor) =>
        tRuntime(descriptor.key, descriptor.values),
      ),
    [caps, styleReferenceCapabilities.maxReferences, styleReferencesEnabled, tRuntime],
  );
  const compatibleNegativeModel = useMemo(
    () =>
      models?.find(
        (candidate) =>
          getImageModelCapabilities(candidate.id).supportsNegativePrompt,
      )?.id,
    [models],
  );

  const modelPricing = modelData?.model_spec?.pricing;
  const modelCostLabel = useMemo(() => {
    if (!modelPricing) return null;
    const parts: string[] = [];
    if (modelPricing.input?.usd !== undefined)
      parts.push(`$${modelPricing.input.usd}/1M in`);
    if (modelPricing.output?.usd !== undefined)
      parts.push(`$${modelPricing.output.usd}/1M out`);
    return parts.length > 0 ? parts.join(" · ") : null;
  }, [modelPricing]);

  const hasAspectRatios =
    (dimOptions.dimensionMode === "aspectRatio" ||
      dimOptions.dimensionMode === "aspectResolution") &&
    !!dimOptions.aspectRatios?.length;
  const maxSteps = constraints?.steps?.max || 50;
  const defaultSteps = constraints?.steps?.default || 20;
  const promptLimit = Math.min(
    constraints?.promptCharacterLimit || IMAGE_PROMPT_MAX_CHARS,
    IMAGE_PROMPT_MAX_CHARS,
  );

  const [prompt, setPrompt] = useState("");
  const setPromptClamped = useCallback(
    (next: React.SetStateAction<string>) => {
      setPrompt((prev) => {
        const base =
          typeof next === "function"
            ? (next as (prev: string) => string)(prev)
            : next;
        return base.slice(0, promptLimit);
      });
    },
    [promptLimit],
  );
  const [negativePrompt, setNegativePrompt] = useState("");
  const [starters, setStarters] = useState(() =>
    getPromptStartersForCategory("image", 4),
  );
  const [sizeKey, setSizeKey] = useState("1024x1024");
  const [aspectRatio, setAspectRatio] = useState("");
  const [resolution, setResolution] = useState("");
  const [quality, setQuality] = useState("");
  const [style, setStyle] = useState("");
  const [styleReferences, setStyleReferences] = useState<StyleReferenceInput[]>([]);
  const [steps, setSteps] = useState(defaultSteps);
  const [cfgScale, setCfgScale] = useState<number | undefined>(undefined);
  const [variants, setVariants] = useState(1);
  const [hideWatermark] = useState(true);
  const [images, setImages] = useState<string[]>([]);
  const [pendingImageSaves, setPendingImageSaves] = useState<
    Record<string, PendingImageSave>
  >({});
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const lightboxRef = useRef<HTMLDivElement>(null);
  useFocusTrap(lightboxRef, !!selectedImage, () => setSelectedImage(null));
  const [generationContext, setGenerationContext] = useState<
    | (Pick<ImageGenerateHandoff, "parentId" | "operation"> & {
        recipeMeta?: Record<string, unknown>;
      })
    | null
  >(null);
  const [queuedAutoGenerateId, setQueuedAutoGenerateId] = useState<
    string | null
  >(null);
  const pendingHandoff = useImageWorkspaceStore((state) => state.pending);

  // Seed state — mode "off" omits the field entirely; "fixed" sends an
  // integer in [-999999999, 999999999]. We do not expose a "null" mode
  // because the Venice swagger does not document `seed: null` as a
  // first-class value.
  const [seedMode, setSeedMode] = useState<"off" | "fixed">("off");
  const [seedValue, setSeedValue] = useState<number>(() => randomSeed());

  // Enhance prompt review flow
  const [enhancing, setEnhancing] = useState(false);
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null);
  const [showEnhanceReview, setShowEnhanceReview] = useState(false);

  // Template preview flow
  const [previewTemplate, setPreviewTemplate] = useState<
    (typeof PROMPT_TEMPLATES)[number] | null
  >(null);
  const appendTemplateText = (current: string, incoming: string) => {
    const left = current.trim().replace(/[\s,]+$/, "");
    const right = incoming.trim().replace(/^[\s,]+/, "");
    return left && right ? `${left}, ${right}` : left || right;
  };

  // Prompt-enhancer config (renderer-bound snapshot of internal_prompt_enhancer).
  // When `enabled` is false, the enhance button is disabled and the
  // user is told why.
  const enhancerConfig = useConfigStore(
    (s) => s.config?.internal_prompt_enhancer ?? null,
  );
  const enhancerEnabled = enhancerConfig?.enabled !== false;

  const aspectOptions = useMemo(() => {
    if (!hasAspectRatios) return [];
    return [
      ...(dimOptions.aspectRatios?.map((a) => ({
        value: a.id,
        label: a.labelKey ? t(a.labelKey) : (a.label ?? a.id),
      })) ?? []),
    ];
  }, [dimOptions, hasAspectRatios, t]);

  const whOptions = useMemo(() => {
    if (hasAspectRatios || !dimOptions.widthHeightOptions) return [];
    return dimOptions.widthHeightOptions.map((o) => ({
      value: `${o.width}x${o.height}`,
      label: o.labelKey
        ? t(o.labelKey)
        : (o.label ??
          tRuntime(
            "runtimeGenerated.components.image.imageView.metadata.value1Value2",
            { value1: o.width, value2: o.height },
          )),
    }));
  }, [dimOptions, hasAspectRatios, t, tRuntime]);

  const resolutionOptions = useMemo(() => {
    if (!dimOptions.resolutions?.length) return [];
    return dimOptions.resolutions.map((r) => ({
      value: r.id,
      label: r.labelKey ? t(r.labelKey) : (r.label ?? r.id),
    }));
  }, [dimOptions, t]);

  // Reset dimensions when model changes
  useEffect(() => {
    if (hasAspectRatios) {
      const next =
        dimOptions.defaultDimensions.aspectRatio ??
        aspectOptions[0]?.value ??
        "";
      setAspectRatio(next);
      setResolution(
        dimOptions.defaultDimensions.resolution ??
          resolutionOptions[0]?.value ??
          "",
      );
      setSizeKey("1024x1024");
    } else {
      const def = caps.defaultDimensions;
      setSizeKey(`${def.width ?? 1024}x${def.height ?? 1024}`);
      setAspectRatio("");
      setResolution("");
    }
    setQuality(dimOptions.defaultQuality ?? "");
  }, [
    caps,
    dimOptions,
    hasAspectRatios,
    aspectOptions,
    resolutionOptions,
  ]);

  useEffect(() => {
    setSteps(defaultSteps);
  }, [model, defaultSteps]);

  useEffect(() => {
    setStyleReferences([]);
  }, [model]);

  useEffect(() => {
    setStyleReferences((current) => {
      if (!styleReferencesEnabled) return current.length > 0 ? [] : current;
      if (current.length <= styleReferenceCapabilities.maxReferences) return current;
      return current.slice(0, styleReferenceCapabilities.maxReferences);
    });
  }, [styleReferenceCapabilities.maxReferences, styleReferencesEnabled]);

  const handleStyleReferenceFiles = useCallback(
    async (files: FileList | null) => {
      if (!styleReferencesEnabled || !files?.length) return;
      const remaining = Math.max(
        0,
        styleReferenceCapabilities.maxReferences - styleReferences.length,
      );
      if (remaining === 0) {
        toast.warn(t("imageStudioRuntime.styleReferenceLimitReached"));
        return;
      }

      const selectedFiles = Array.from(files).slice(0, remaining);
      if (files.length > remaining) {
        toast.warn(
          t("imageStudioRuntime.styleReferenceLimitReached"),
          t("imageStudioRuntime.styleReferenceLimitDetail", {
            count: styleReferenceCapabilities.maxReferences,
          }),
        );
      }

      for (const file of selectedFiles) {
        try {
          const reference = await readStyleReferenceFile(file);
          setStyleReferences((current) => {
            if (current.length >= styleReferenceCapabilities.maxReferences) return current;
            if (current.some((candidate) => candidate.contentHash === reference.contentHash)) {
              return current;
            }
            return [...current, reference];
          });
        } catch (error) {
          const description =
            error instanceof StyleReferenceFileError
              ? t(
                  error.code === "unsupported-type"
                    ? "imageStudioRuntime.styleReferenceUnsupportedType"
                    : error.code === "empty-file"
                      ? "imageStudioRuntime.styleReferenceEmptyFile"
                      : error.code === "too-large"
                        ? "imageStudioRuntime.styleReferenceTooLarge"
                        : "imageStudioRuntime.styleReferenceReadFailed",
                )
              : t("imageStudioRuntime.styleReferenceReadFailed");
          toast.error(t("imageStudioRuntime.styleReferenceRejected"), description);
        }
      }
    },
    [
      styleReferenceCapabilities.maxReferences,
      styleReferences.length,
      styleReferencesEnabled,
      t,
    ],
  );

  const downloadImage = async (b64: string, index?: number) => {
    const ext = getExtensionFromDataUrl(b64);
    const filename = `venice-image${index !== undefined ? `-${index + 1}` : ""}.${ext}`;
    try {
      if (isElectron()) {
        const pending = pendingImageSaves[b64];
        if (pending?.recoveryId) {
          const recoveryExport = await desktopMedia.saveGeneratedImageRecovery(
            pending.recoveryId,
            filename,
          );
          if (recoveryExport.ok) {
            if (!recoveryExport.canceled) {
              toast.success(t("imageStudioRuntime.imageDownloaded"));
            }
            return;
          }
        }
        const result = await desktopMedia.saveMediaAs({
          source: toImageSrc(b64),
          suggestedName: filename,
        });
        if (result.status === "saved") toast.success(t("imageStudioRuntime.imageDownloaded"));
        if (result.status === "failed") throw new Error(result.error);
      } else {
        const fallback = await downloadImageUtil(toImageSrc(b64), filename);
        if (fallback.confirmed) {
          toast.success(t("imageStudioRuntime.imageDownloaded"));
        } else {
          toast.error(
            t("imageStudioRuntime.imageSaveFailed"),
            t("imageStudioRuntime.imageDownloadFailedDetail"),
          );
        }
      }
    } catch (err) {
      toast.error(
        t("imageStudioRuntime.imageSaveFailed"),
        redactErrorMessage(err),
      );
    }
  };

  const retryPendingImageSave = async (image: string) => {
    const pending = pendingImageSaves[image];
    if (!pending) return;
    try {
      let mediaItem = { ...pending.mediaItem };
      let durableImage = image;
      if (pending.recoveryId) {
        const persistence = await desktopMedia.retryGeneratedImage(
          pending.recoveryId,
        );
        if (!persistence.ok || !persistence.media) {
          throw new Error(
            persistence.error || "Generated image could not be persisted.",
          );
        }
        durableImage = persistence.media.url;
        mediaItem = {
          ...mediaItem,
          image: durableImage,
          processedBytes: persistence.media.byteCount,
          mimeType: persistence.media.mimeType,
          generatedMediaId: persistence.media.id,
          sha256: persistence.media.sha256,
        };
      }
      if (pending.parentId) {
        await persistMediaRecordWithRetry(() =>
          useMediaStore
            .getState()
            .upsertDerivative(mediaItem, pending.parentId!),
        );
      } else {
        await persistMediaRecordWithRetry(() =>
          useMediaStore.getState().upsert(mediaItem, {
            attachActiveProject: true,
            source: "generated",
          }),
        );
      }
      setImages((current) =>
        current.map((candidate) =>
          candidate === image ? durableImage : candidate,
        ),
      );
      setSelectedImage((current) =>
        current === image ? durableImage : current,
      );
      setPendingImageSaves((current) => {
        const next = { ...current };
        delete next[image];
        return next;
      });
      toast.success(t("imageTools.savedToMedia"));
    } catch (error) {
      toast.error(
        t("imageStudioRuntime.imageSaveFailed"),
        redactErrorMessage(error),
      );
    }
  };

  const mutation = useImageGenerate();
  const styleOptions = [
    { value: "", label: t("imageStudioRuntime.none") },
    ...(styles?.map((s) => ({ value: s, label: s })) ?? []),
  ];

  const handleEnhance = useCallback(async () => {
    if (!prompt.trim()) return;
    if (!enhancerEnabled) return;
    setEnhancing(true);
    try {
      const result = await enhancePrompt(
        {
          mode: "enhance",
          prompt: prompt.trim(),
          negativePrompt: negativePrompt || null,
          targetModel: enhancerModelFacts,
          dimensions: hasAspectRatios
            ? {
                aspectRatio: aspectRatio || undefined,
                resolution: resolution || undefined,
              }
            : {
                width: Number(sizeKey.split("x")[0]) || undefined,
                height: Number(sizeKey.split("x")[1]) || undefined,
              },
          stylePreset: style || undefined,
          generationMode: caps.operation ?? "text-to-image",
        },
        enhancerConfig,
      );
      if (result.fallbackReason) {
        setEnhancedPrompt(null);
        setShowEnhanceReview(false);
        const description =
          result.fallbackReason === "safety-block"
            ? t(
                result.safetyLayer === "mandatory-child-safety"
                  ? "imageStudioRuntime.enhancementSafetyBlockedMandatory"
                  : result.safetyLayer === "optional-family-policy"
                    ? "imageStudioRuntime.enhancementSafetyBlockedFamily"
                    : result.safetyLayer === "provider-policy"
                      ? "imageStudioRuntime.enhancementSafetyBlockedProvider"
                      : "imageStudioRuntime.enhancementSafetyBlocked",
              )
            : result.fallbackReason === "provider-error"
              ? t("imageStudioRuntime.enhancementProviderError")
              : t("imageStudioRuntime.enhancementInvalidOutput");
        toast.error(t("imageStudioRuntime.enhancementFailed"), description);
        return;
      }
      setEnhancedPrompt(result.prompt);
      if (result.truncated) {
        toast.warn(
          t("imageStudioRuntime.enhancedPromptShortened"),
          t("imageStudioRuntime.enhancedPromptShortenedDetail", {
            max: IMAGE_PROMPT_MAX_CHARS,
          }),
        );
      }
      setShowEnhanceReview(true);
    } catch (error) {
      toast.error(
        t("imageStudioRuntime.enhancementFailed"),
        redactErrorMessage(error),
      );
    } finally {
      setEnhancing(false);
    }
  }, [
    prompt,
    negativePrompt,
    enhancerEnabled,
    enhancerConfig,
    enhancerModelFacts,
    hasAspectRatios,
    aspectRatio,
    resolution,
    sizeKey,
    style,
    caps.operation,
    t,
  ]);

  const applyEnhancedPrompt = useCallback(() => {
    if (enhancedPrompt) setPromptClamped(enhancedPrompt);
    setShowEnhanceReview(false);
    setEnhancedPrompt(null);
  }, [enhancedPrompt, setPromptClamped]);

  const cancelEnhanceReview = useCallback(() => {
    setShowEnhanceReview(false);
    setEnhancedPrompt(null);
  }, []);

  const handleSavePromptToLibrary = useCallback(
    async (kind: "image" | "negative", content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      const firstLine =
        trimmed.split("\n")[0]?.slice(0, 80) ||
        (kind === "negative" ? "Negative prompt" : "Image prompt");
      try {
        await usePromptLibraryStore.getState().createPrompt({
          title: firstLine,
          kind,
          content: trimmed,
          scope: "global",
          projectId: resolvePromptProjectId(null),
          source: { type: "image" },
        });
        toast.success(
          t("imageStudioRuntime.savedPrompt", {
            kind: t(`imageStudioRuntime.promptKinds.${kind}`),
          }),
        );
      } catch (err) {
        toast.fromError(err, t("imageStudioRuntime.couldNotSavePrompt"));
      }
    },
    [t],
  );

  // Add effect to listen for save current prompt command
  useEffect(() => {
    const handleSaveCurrentPrompt = () => {
      // Save both prompt and negative prompt
      if (prompt.trim()) {
        void handleSavePromptToLibrary("image", prompt);
      }
      if (negativePrompt.trim()) {
        void handleSavePromptToLibrary("negative", negativePrompt);
      }
    };

    window.addEventListener(
      "saveCurrentPromptToLibrary",
      handleSaveCurrentPrompt,
    );
    return () => {
      window.removeEventListener(
        "saveCurrentPromptToLibrary",
        handleSaveCurrentPrompt,
      );
    };
  }, [prompt, negativePrompt, handleSavePromptToLibrary]);

  const buildSeedState = useCallback((): ImageSeedState => {
    if (seedMode === "fixed") return { mode: "fixed", value: seedValue };
    return { mode: "off", value: null };
  }, [seedMode, seedValue]);

  /**
   * Applies a draft (typically derived from a gallery item) to the
   * Image Studio state without generating. Used by the gallery's
   * "Use settings" action. The optional `seed` field controls
   * whether seed mode is "fixed" (with the supplied value) or
   * "off" (when the source item had no seed).
   */
  const applyDraftFromGallery = useCallback(
    (draft: {
      prompt?: string;
      negative?: string;
      negativePrompt?: string;
      style?: string;
      steps?: number;
      cfgScale?: number;
      imageCount?: number;
      width?: number;
      height?: number;
      aspectRatio?: string;
      resolution?: string;
      quality?: string;
      seed?: number | null;
    }) => {
      if (typeof draft.prompt === "string") setPromptClamped(draft.prompt);
      const neg = draft.negativePrompt ?? draft.negative;
      if (typeof neg === "string") setNegativePrompt(neg);
      if (typeof draft.style === "string") setStyle(draft.style);
      if (typeof draft.steps === "number" && Number.isFinite(draft.steps))
        setSteps(draft.steps);
      if (typeof draft.cfgScale === "number" && Number.isFinite(draft.cfgScale))
        setCfgScale(draft.cfgScale);
      if (
        typeof draft.imageCount === "number" &&
        Number.isFinite(draft.imageCount)
      ) {
        setVariants(Math.max(1, Math.min(4, Math.round(draft.imageCount))));
      }
      if (
        typeof draft.aspectRatio === "string" &&
        draft.aspectRatio.length > 0
      ) {
        setAspectRatio(draft.aspectRatio);
        setSizeKey("1024x1024");
      } else if (
        typeof draft.width === "number" &&
        typeof draft.height === "number"
      ) {
        setSizeKey(`${draft.width}x${draft.height}`);
        setAspectRatio("");
      }
      if (typeof draft.resolution === "string") setResolution(draft.resolution);
      if (typeof draft.quality === "string") setQuality(draft.quality);
      if (typeof draft.seed === "number" && Number.isInteger(draft.seed)) {
        setSeedMode("fixed");
        setSeedValue(draft.seed);
      } else {
        setSeedMode("off");
      }
      // Auto-generation is scheduled separately so these state updates
      // commit before the shared payload builder reads them.
    },
    [setPromptClamped],
  );

  const handleGenerate = () => {
    if (!prompt.trim()) return;

    const currentPrompt =
      enhancedPrompt && showEnhanceReview ? enhancedPrompt : prompt.trim();
    if (currentPrompt.length > IMAGE_PROMPT_MAX_CHARS) {
      toast.warn(
        t("imageStudioRuntime.promptTooLong"),
        t("imageStudioRuntime.promptTooLongDetail", {
          max: IMAGE_PROMPT_MAX_CHARS,
        }),
      );
      return;
    }

    let width: number | undefined;
    let height: number | undefined;
    let aspectRatioField: string | undefined;

    if (hasAspectRatios) {
      aspectRatioField = aspectRatio || undefined;
    } else {
      const parts = sizeKey.split("x");
      width = Number(parts[0]);
      height = Number(parts[1]);
    }

    const seedState = buildSeedState();
    const activeGenerationContext = generationContext;
    setGenerationContext(null);

    // Use the shared payload builder. The builder enforces exactly one
    // sizing shape (aspect_ratio vs width/height), respects the model's
    // resolution support, and applies safe_mode via the endpoint matrix.
    const req = buildImagePayload(
      model,
      {
        prompt: currentPrompt,
        negative: negativePrompt.trim() || undefined,
        width,
        height,
        aspectRatio: aspectRatioField,
        resolution:
          dimOptions.dimensionMode === "aspectResolution"
            ? resolution || undefined
            : undefined,
        quality: dimOptions.qualities?.length
          ? quality || undefined
          : undefined,
        steps: Math.min(maxSteps, Math.max(1, steps)),
        cfg: cfgScale,
        style: style || undefined,
        safeMode: veniceApiSafeMode,
        disableWatermark: hideWatermark,
        imageCount: variants,
        supportsVariants: caps.supportsVariants,
        supportsNegativePrompt: caps.supportsNegativePrompt,
        supportsSeed: caps.supportsSeed,
        supportsStyle: caps.supportsStyle,
        supportsSteps: caps.supportsSteps,
        supportsCfgScale: caps.supportsCfgScale,
        supportsReferences: styleReferencesEnabled,
        maxStyleReferences: styleReferenceCapabilities.maxReferences,
        supportsStyleReferenceStrength:
          styleReferenceCapabilities.supportsStrength,
        references: styleReferences,
      },
      undefined,
      seedState,
    ) as Record<string, unknown> & {
      prompt: string;
      model: string;
      steps: number;
      cfg_scale?: number;
      hide_watermark: boolean;
      return_binary: boolean;
    };

    mutation.mutate(req as unknown as Parameters<typeof mutation.mutate>[0], {
      onSuccess: async (data) => {
        if (data.queued) {
          toast.info(
            t("imageStudioRuntime.replicateQueued"),
            t("imageStudioRuntime.replicateQueuedDetail"),
          );
          return;
        }
        const rawImages = data.images.map((img) =>
          typeof img === "string" ? img : img.b64_json,
        );
        const processedImages: string[] = [];
        const batchId = variants > 1 ? generateId() : null;
        const now = Date.now();
        const isEnhanced = enhancedPrompt !== null && prompt !== currentPrompt;

        for (const [index, img] of rawImages.entries()) {
          let displayImage: string | undefined;
          let pendingMediaItem: MediaItem | undefined;
          let persistenceFailure:
            | { error?: string; recoveryId?: string }
            | undefined;
          try {
            const { base64: processedImg, report } = processBase64Image(img);
            const routedFolder = routeAsset(currentPrompt);
            displayImage = processedImg;
            let durableMedia:
              | {
                  id: string;
                  url: string;
                  mimeType: string;
                  byteCount: number;
                  sha256: string;
                }
              | undefined;

            if (isElectron()) {
              const persistence = await desktopMedia.persistGeneratedImage(
                processedImg,
              );
              if (!persistence.ok || !persistence.media) {
                persistenceFailure = persistence;
              } else {
                durableMedia = persistence.media;
                displayImage = durableMedia.url;
              }
            }

            // Only stable main-owned URLs are written to desktop IndexedDB;
            // web mode retains its existing data-URL fallback.
            processedImages.push(displayImage);

            const id = generateId();
            const mediaItem: MediaItem = {
              id,
              image: displayImage,
              prompt: currentPrompt,
              negative: negativePrompt.trim() || undefined,
              model,
              width: req.width as number | undefined,
              height: req.height as number | undefined,
              aspectRatio: req.aspect_ratio as string | undefined,
              resolution: req.resolution as string | undefined,
              quality: req.quality as string | undefined,
              style: req.style_preset as string | undefined,
              steps: req.steps as number | undefined,
              cfg: req.cfg_scale as number | undefined,
              safeMode: req.safe_mode as boolean | undefined,
              disableWatermark: req.hide_watermark as boolean | undefined,
              seed: seedState.mode === "fixed" ? seedState.value : undefined,
              source: "image-page",
              batchId,
              batchIndex: batchId ? index : null,
              batchCount: batchId ? rawImages.length : null,
              timestamp: now,
              upscaled: false,
              mediaType: "image",
              operation: activeGenerationContext?.operation ?? "generate",
              parentId: activeGenerationContext?.parentId ?? null,
              childrenIds: [],
              tags: [],
              note: "",
              favorite: false,
              metadataRemoved: report.metadataRemoved,
              originalBytes: report.originalBytes,
              processedBytes:
                durableMedia?.byteCount ?? report.processedBytes,
              mimeType: durableMedia?.mimeType ?? report.mimeType,
              generatedMediaId: durableMedia?.id,
              sha256: durableMedia?.sha256,
              assetCategory: routedFolder,
              cost:
                modelPricing?.input?.usd !== undefined ||
                modelPricing?.output?.usd !== undefined
                  ? {
                      inputPrice: modelPricing?.input?.usd,
                      outputPrice: modelPricing?.output?.usd,
                    }
                  : undefined,
            };

            if (isEnhanced) {
              mediaItem.enhancedPrompt = currentPrompt;
              mediaItem.originalPrompt = prompt.trim();
            }

            if (activeGenerationContext?.recipeMeta) {
              mediaItem.recipe = {
                prompt: currentPrompt,
                model: model,
                negativePrompt: negativePrompt.trim() || undefined,
                width: req.width as number | undefined,
                height: req.height as number | undefined,
                aspectRatio: req.aspect_ratio as string | undefined,
                seed: seedState.mode === "fixed" ? seedState.value : undefined,
                steps: req.steps as number | undefined,
                cfgScale: req.cfg_scale as number | undefined,
                style: req.style_preset as string | undefined,
                quality: req.quality as string | undefined,
                metadata: activeGenerationContext.recipeMeta,
                operation: activeGenerationContext?.operation,
              };
            }

            pendingMediaItem = mediaItem;
            if (persistenceFailure) {
              throw new Error(
                persistenceFailure.error ||
                  "Generated image could not be persisted.",
              );
            }

            if (activeGenerationContext?.parentId) {
              await persistMediaRecordWithRetry(() =>
                useMediaStore
                  .getState()
                  .upsertDerivative(
                    mediaItem,
                    activeGenerationContext.parentId!,
                  ),
              );
            } else {
              await persistMediaRecordWithRetry(() =>
                useMediaStore.getState().upsert(mediaItem, {
                  attachActiveProject: true,
                  source: "generated",
                }),
              );
            }
          } catch (saveError) {
            // If the main-process persistence boundary itself failed, retain
            // the decoded provider image so the user can still download it.
            if (displayImage && !processedImages.includes(displayImage)) {
              processedImages.push(displayImage);
            }
            if (displayImage && pendingMediaItem) {
              setPendingImageSaves((current) => ({
                ...current,
                [displayImage!]: {
                  mediaItem: pendingMediaItem!,
                  parentId: activeGenerationContext?.parentId ?? undefined,
                  recoveryId: persistenceFailure?.recoveryId,
                },
              }));
            }
            toast.error(
              t("imageStudioRuntime.imageSaveFailed"),
              redactErrorMessage(saveError),
            );
          }
        }

        if (processedImages.length > 0) {
          setImages((prev) => [...processedImages, ...prev]);
        }
        setShowEnhanceReview(false);
        setEnhancedPrompt(null);
      },
    });
  };

  // Intentional state-sync: Absorbs a one-shot cross-route draft handoff
  // (e.g. remixing an image from the gallery) into the local form state.
  useEffect(() => {
    if (!pendingHandoff || pendingHandoff.target !== "generate") return;
    if (pendingHandoff.draft.model) {
      useSettingsStore
        .getState()
        .setSelectedModel("image", pendingHandoff.draft.model);
    }
    applyDraftFromGallery(pendingHandoff.draft);
    setGenerationContext(
      pendingHandoff.autoGenerate
        ? {
            parentId: pendingHandoff.parentId,
            operation: pendingHandoff.operation,
            recipeMeta: pendingHandoff.draft.recipeMeta,
          }
        : null,
    );
    if (pendingHandoff.autoGenerate) setQueuedAutoGenerateId(pendingHandoff.id);
    useImageWorkspaceStore.getState().consume(pendingHandoff.id);
  }, [pendingHandoff, applyDraftFromGallery]);

  // Intentional state-sync: Consumes a one-shot trigger ID to automatically
  // start generation (e.g. immediately after a prompt-library template loads).
  useEffect(() => {
    if (!queuedAutoGenerateId) return;
    setQueuedAutoGenerateId(null);
    handleGenerate();
    // The queue id is the one-shot trigger. Depending on the render-local
    // handler would retrigger this effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedAutoGenerateId]);

  const controls = (
    <>
      {/* Model capability summary. Reflects the live registry so the user
          knows what is and is not available BEFORE they fill out the form. */}
      <div
        className="text-[12px] text-text-secondary flex flex-wrap gap-x-2 gap-y-0.5 px-2 py-1.5 rounded-md bg-surface/40 border border-border/60"
        aria-label={t("imageStudioRuntime.capabilitiesFor", {
          model: caps.label,
          capabilities: capabilitySummary.join(", "),
        })}
        data-testid="image-capability-summary"
      >
        <span className="text-text-primary font-medium">{caps.label}</span>
        <span aria-hidden="true">·</span>
        {capabilitySummary.map((item) => (
          <span key={item} className="opacity-90">
            {item}
          </span>
        ))}
        {modelCostLabel && (
          <>
            <span aria-hidden="true">·</span>
            <span className="opacity-90" data-testid="image-model-cost">
              {modelCostLabel}
            </span>
          </>
        )}
      </div>
      <div>
        <div className="flex flex-col gap-1.5 mb-1.5">
          <Label htmlFor={promptId} hint={`${prompt.length}/${promptLimit}`}>
            <Trans i18nKey="common:surface.componentsImageImageView.text.prompt" />
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSavePromptToLibrary("image", prompt)}
              disabled={!prompt.trim()}
              className="text-[12px] px-2 py-1 rounded-md border border-border text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
              aria-label={t("imageStudioRuntime.savePromptToLibrary")}
              data-testid="image-save-prompt-to-library"
            >
              <Trans i18nKey="common:surface.componentsImageImageView.action.saveToLibrary" />
            </button>
            <button
              type="button"
              onClick={handleEnhance}
              disabled={!prompt.trim() || enhancing || !enhancerEnabled}
              className="text-[12px] px-2 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/20 border border-accent/30 transition-colors disabled:opacity-50 cursor-pointer"
              aria-label={t("imageStudioRuntime.enhancePrompt")}
              title={
                !enhancerEnabled
                  ? t("imageStudioRuntime.enhancerDisabled")
                  : t("imageStudioRuntime.enhancerTitle")
              }
            >
              {enhancing
                ? t("imageStudioRuntime.enhancing")
                : t("imageStudioRuntime.enhancePrompt")}
            </button>
            <select
              aria-label={t("imageStudioRuntime.promptTemplate")}
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  const t = PROMPT_TEMPLATES.find((x) => x.id === val);
                  if (t) {
                    setPreviewTemplate(t);
                  }
                  e.target.value = "";
                }
              }}
              className="relative z-40 text-[12px] bg-surface-elevated text-text-secondary border border-border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent hover:text-text-secondary transition-colors cursor-pointer min-w-[120px]"
              defaultValue=""
            >
              <option value="" disabled>
                <Trans i18nKey="common:surface.componentsImageImageView.option.addTemplate" />
              </option>
              {Object.entries(
                PROMPT_TEMPLATES.filter((t) =>
                  t.compatibleModes.includes("image"),
                ).reduce(
                  (acc, t) => {
                    if (!acc[t.category]) acc[t.category] = [];
                    acc[t.category].push(t);
                    return acc;
                  },
                  {} as Record<string, typeof PROMPT_TEMPLATES>,
                ),
              ).map(([category, items]) => (
                <optgroup key={category} label={category.toUpperCase()}>
                  {items.map((item) => (
                    <option
                      key={item.id}
                      value={item.id}
                      title={item.description}
                    >
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
        <TextArea
          id={promptId}
          value={prompt}
          onChange={setPromptClamped}
          maxLength={promptLimit}
          placeholder={t("imageStudioRuntime.promptPlaceholder")}
          ariaLabel={t("imageStudioRuntime.imagePrompt")}
        />
      </div>

      {/* Enhance prompt review flow */}
      {showEnhanceReview && enhancedPrompt && (
        <div className="p-3 mt-2 rounded-lg border border-accent/30 bg-accent/5">
          <Label>
            <Trans i18nKey="common:surface.componentsImageImageView.text.enhancedPromptPreview" />
          </Label>
          <div className="text-[12.5px] text-text-primary mt-1 p-2 rounded bg-surface border border-border break-words [overflow-wrap:anywhere] whitespace-pre-wrap">
            {enhancedPrompt}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              onClick={applyEnhancedPrompt}
              className="px-3 py-1 text-[12px] rounded-md bg-accent text-accent-fg hover:bg-accent-hover transition-colors cursor-pointer"
            >
              <Trans i18nKey="common:surface.componentsImageImageView.action.useEnhancedPrompt" />
            </button>
            <button
              type="button"
              onClick={cancelEnhanceReview}
              className="px-3 py-1 text-[12px] rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              <Trans i18nKey="common:surface.componentsImageImageView.action.keepOriginal" />
            </button>
          </div>
        </div>
      )}

      {/* Template preview flow */}
      {previewTemplate && (
        <div className="p-3 mt-2 rounded-lg border border-accent/30 bg-accent/5">
          <Label>
            <Trans i18nKey="common:surface.componentsImageImageView.text.applyTemplate" />{" "}
            {previewTemplate.label}
          </Label>
          {previewTemplate.positiveText && (
            <div className="text-[12.5px] text-text-primary mt-1 mb-2 p-2 rounded bg-surface border border-border break-all whitespace-pre-wrap">
              <strong className="text-text-secondary">
                <Trans i18nKey="common:surface.componentsImageImageView.text.positive" />
              </strong>{" "}
              {previewTemplate.positiveText}
            </div>
          )}
          {previewTemplate.negativeText && (
            <div className="text-[12.5px] text-text-primary mt-1 mb-2 p-2 rounded bg-surface border border-border break-all whitespace-pre-wrap">
              <strong className="text-text-secondary">
                <Trans i18nKey="common:surface.componentsImageImageView.text.negative" />
              </strong>{" "}
              {previewTemplate.negativeText}
            </div>
          )}
          {previewTemplate.negativeText && !caps.supportsNegativePrompt && (
            <div
              role="alert"
              className="mt-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-[12px] text-warning"
            >
              {model}{" "}
              <Trans i18nKey="common:surface.componentsImageImageView.text.doesNotSupportNegativePromptsTheTemplate" />
              {compatibleNegativeModel && (
                <button
                  type="button"
                  onClick={() =>
                    setSelectedModel("image", compatibleNegativeModel)
                  }
                  className="ml-2 underline underline-offset-2"
                >
                  <Trans i18nKey="common:surface.componentsImageImageView.action.switchTo" />{" "}
                  {compatibleNegativeModel}
                </button>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              type="button"
              onClick={() => {
                if (
                  previewTemplate.negativeText &&
                  !caps.supportsNegativePrompt
                )
                  return;
                if (previewTemplate.positiveText)
                  setPromptClamped((prev) =>
                    appendTemplateText(prev, previewTemplate.positiveText!),
                  );
                if (previewTemplate.negativeText)
                  setNegativePrompt((prev) =>
                    appendTemplateText(prev, previewTemplate.negativeText!),
                  );
                setPreviewTemplate(null);
              }}
              disabled={Boolean(
                previewTemplate.negativeText && !caps.supportsNegativePrompt,
              )}
              className="px-3 py-1 text-[12px] rounded-md bg-accent text-accent-fg hover:bg-accent-hover transition-colors cursor-pointer"
            >
              <Trans i18nKey="common:surface.componentsImageImageView.action.append" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (
                  previewTemplate.negativeText &&
                  !caps.supportsNegativePrompt
                )
                  return;
                if (previewTemplate.positiveText)
                  setPromptClamped(
                    previewTemplate.positiveText.replace(/^, /, ""),
                  );
                if (previewTemplate.negativeText)
                  setNegativePrompt(previewTemplate.negativeText!);
                setPreviewTemplate(null);
              }}
              disabled={Boolean(
                previewTemplate.negativeText && !caps.supportsNegativePrompt,
              )}
              className="px-3 py-1 text-[12px] rounded-md border border-accent text-accent hover:bg-accent/10 transition-colors cursor-pointer"
            >
              <Trans i18nKey="common:surface.componentsImageImageView.action.replace" />
            </button>
            <button
              type="button"
              onClick={() => setPreviewTemplate(null)}
              className="px-3 py-1 text-[12px] rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              <Trans i18nKey="common:surface.componentsImageImageView.action.cancel" />
            </button>
          </div>
        </div>
      )}

      {caps.supportsNegativePrompt && (
        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor={negativePromptId}>
              <Trans i18nKey="common:surface.componentsImageImageView.text.negativePrompt" />
            </Label>
            <button
              type="button"
              onClick={() =>
                void handleSavePromptToLibrary("negative", negativePrompt)
              }
              disabled={!negativePrompt.trim()}
              className="text-[12px] px-2 py-1 rounded-md border border-border text-text-secondary hover:border-accent hover:text-accent disabled:opacity-50"
              aria-label={t("imageStudioRuntime.saveNegativePromptToLibrary")}
              data-testid="image-save-negative-to-library"
            >
              <Trans i18nKey="common:surface.componentsImageImageView.action.saveToLibrary" />
            </button>
          </div>
          <TextArea
            id={negativePromptId}
            value={negativePrompt}
            onChange={setNegativePrompt}
            placeholder={t("imageStudioRuntime.negativePromptPlaceholder")}
            rows={2}
          />
        </div>
      )}

      {hasAspectRatios ? (
        <div>
          <Label>
            <Trans i18nKey="common:surface.componentsImageImageView.text.aspectRatio" />
          </Label>
          <PillGroup
            options={aspectOptions}
            value={aspectRatio}
            onChange={setAspectRatio}
            ariaLabel={t("imageStudioRuntime.imageAspectRatio")}
          />
        </div>
      ) : (
        <div>
          <Label>
            <Trans i18nKey="common:surface.componentsImageImageView.text.aspectRatio" />
          </Label>
          <PillGroup
            options={whOptions}
            value={sizeKey}
            onChange={setSizeKey}
            ariaLabel={t("imageStudioRuntime.imageAspectRatio")}
          />
        </div>
      )}

      {dimOptions.resolutions?.length && (
        <div>
          <Label>
            <Trans i18nKey="common:surface.componentsImageImageView.text.resolution" />
          </Label>
          <PillGroup
            options={resolutionOptions}
            value={resolution || resolutionOptions[0]?.value || ""}
            onChange={setResolution}
            ariaLabel={t("imageStudioRuntime.imageResolution")}
          />
        </div>
      )}

      {dimOptions.qualities?.length && (
        <div>
          <Label>
            <Trans i18nKey="common:surface.componentsImageImageView.text.quality" />
          </Label>
          <PillGroup
            options={dimOptions.qualities.map((option) => ({
              value: option.id,
              label: option.labelKey
                ? t(option.labelKey)
                : (option.label ?? option.id),
            }))}
            value={quality || dimOptions.defaultQuality || ""}
            onChange={setQuality}
            ariaLabel={t("imageStudioRuntime.imageQuality")}
          />
        </div>
      )}

      {caps.supportsStyle !== false && styles && styles.length > 0 && (
        <div>
          <Label htmlFor={styleId}>
            <Trans i18nKey="common:surface.componentsImageImageView.text.style" />
          </Label>
          <Select
            id={styleId}
            value={style}
            onChange={setStyle}
            options={styleOptions}
            searchable
            placeholder={t("imageStudioRuntime.none")}
          />
        </div>
      )}

      {styleReferencesEnabled && (
        <fieldset className="rounded-lg border border-border/60 bg-surface/40 p-3 space-y-2">
          <legend className="px-1 text-[12px] font-semibold text-foreground-muted uppercase tracking-[0.08em]">
            {t("imageStudioRuntime.styleReferences")}
          </legend>
          <p
            id={`${styleReferencesId}-description`}
            className="text-[12px] text-text-secondary"
          >
            {t("imageStudioRuntime.styleReferenceHelp", {
              count: styleReferenceCapabilities.maxReferences,
            })}
          </p>
          <Label htmlFor={styleReferencesId}>
            {t("imageStudioRuntime.addStyleReferenceImages")}
          </Label>
          <input
            id={styleReferencesId}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple={styleReferenceCapabilities.maxReferences > 1}
            disabled={
              styleReferences.length >= styleReferenceCapabilities.maxReferences
            }
            aria-describedby={`${styleReferencesId}-description ${styleReferencesId}-count`}
            onChange={(event) => {
              const files = event.currentTarget.files;
              void handleStyleReferenceFiles(files);
              event.currentTarget.value = "";
            }}
            className="block w-full text-[12px] text-text-secondary file:mr-2 file:rounded-md file:border file:border-border file:bg-surface-elevated file:px-2 file:py-1 file:text-text-primary hover:file:border-accent disabled:opacity-50"
          />
          <p
            id={`${styleReferencesId}-count`}
            role="status"
            className="text-[12px] text-text-secondary"
          >
            {t("imageStudioRuntime.styleReferenceCount", {
              count: styleReferences.length,
              max: styleReferenceCapabilities.maxReferences,
            })}
          </p>
          {styleReferences.length > 0 && (
            <ul className="space-y-2" aria-label={t("imageStudioRuntime.selectedStyleReferences")}>
              {styleReferences.map((reference) => (
                <li
                  key={reference.entityId}
                  className="rounded-md border border-border/60 bg-surface-elevated p-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[12px] text-text-primary">
                      {reference.name}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setStyleReferences((current) =>
                          current.filter(
                            (candidate) => candidate.entityId !== reference.entityId,
                          ),
                        )
                      }
                      aria-label={t("imageStudioRuntime.removeStyleReference", {
                        name: reference.name,
                      })}
                      className="shrink-0 rounded-md border border-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
                    >
                      {t("imageStudioRuntime.remove")}
                    </button>
                  </div>
                  {styleReferenceCapabilities.supportsStrength && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.1}
                        value={reference.strength}
                        onChange={(event) => {
                          const strength = Number(event.currentTarget.value);
                          setStyleReferences((current) =>
                            current.map((candidate) =>
                              candidate.entityId === reference.entityId
                                ? { ...candidate, strength }
                                : candidate,
                            ),
                          );
                        }}
                        aria-label={t("imageStudioRuntime.styleReferenceStrength", {
                          name: reference.name,
                        })}
                        className="min-w-0 flex-1"
                      />
                      <output className="w-8 text-right text-[12px] text-text-secondary">
                        {reference.strength.toFixed(1)}
                      </output>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      )}

      {/* Seed controls */}
      {caps.supportsSeed && (
        <div>
          <Label htmlFor={seedId}>
            <Trans i18nKey="common:surface.componentsImageImageView.text.seed" />
          </Label>
          <div className="flex items-center gap-2 mt-1">
            <label
              htmlFor={seedId}
              className="flex items-center gap-1.5 text-[12px] text-text-secondary cursor-pointer select-none"
            >
              <input
                id={seedId}
                type="checkbox"
                checked={seedMode === "fixed"}
                onChange={(e) =>
                  setSeedMode(e.target.checked ? "fixed" : "off")
                }
                className="rounded border-border bg-surface-elevated text-accent w-3.5 h-3.5 cursor-pointer"
              />
              <Trans i18nKey="common:surface.componentsImageImageView.label.useFixedSeed" />
            </label>
          </div>
          {seedMode === "fixed" && (
            <div className="flex items-center gap-2 mt-1">
              <input
                id={`${seedId}-value`}
                type="number"
                value={seedValue}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (Number.isFinite(v)) {
                    const clamped = clampSeed(v);
                    if (clamped !== null) setSeedValue(clamped);
                  }
                }}
                min={-999999999}
                max={999999999}
                className="w-32 bg-surface-elevated border border-border rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent transition-colors"
                aria-label={t("imageStudioRuntime.seedValue")}
              />
              <button
                type="button"
                onClick={() => setSeedValue(randomSeed())}
                className="px-2 py-1 text-[12px] rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                aria-label={t("imageStudioRuntime.randomizeSeed")}
              >
                <Trans i18nKey="common:surface.componentsImageImageView.action.randomize" />
              </button>
              <button
                type="button"
                onClick={() => setSeedMode("off")}
                className="px-2 py-1 text-[12px] rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
                aria-label={t("imageStudioRuntime.clearSeed")}
              >
                <Trans i18nKey="common:surface.componentsImageImageView.action.clear" />
              </button>
            </div>
          )}
        </div>
      )}

      {caps.supportsSteps !== false && (
        <div>
          <div className="flex justify-between">
            <Label htmlFor={stepsId}>
              <Trans i18nKey="common:surface.componentsImageImageView.text.steps" />
            </Label>
            <output htmlFor={stepsId} className="text-xs text-text-secondary">
              {steps}
            </output>
          </div>
          <input
            id={stepsId}
            type="range"
            min={1}
            max={maxSteps}
            value={steps}
            onChange={(e) => setSteps(Number(e.target.value))}
            className="w-full"
            aria-valuetext={t("imageStudioRuntime.stepsValue", {
              count: steps,
            })}
          />
        </div>
      )}
      {caps.supportsVariants && (
        <div>
          <div className="flex justify-between">
            <Label htmlFor={variantsId}>
              <Trans i18nKey="common:surface.componentsImageImageView.text.variants" />
            </Label>
            <output htmlFor={variantsId} className="text-xs text-text-secondary">
              {variants}
            </output>
          </div>
          <input
            id={variantsId}
            type="range"
            min={1}
            max={4}
            value={variants}
            onChange={(e) => setVariants(Number(e.target.value))}
            className="w-full"
            aria-valuetext={t("imageStudioRuntime.variantsValue", {
              count: variants,
            })}
          />
        </div>
      )}

      <PrimaryButton
        onClick={handleGenerate}
        disabled={
          !prompt.trim() || prompt.length > promptLimit || !hasVeniceKey
        }
        loading={mutation.isPending}
        size="lg"
      >
        {mutation.isPending
          ? t("imageStudioRuntime.generating")
          : t("imageStudioRuntime.generate")}
      </PrimaryButton>
      {mutation.error && (
        <ErrorText>{redactErrorMessage(mutation.error)}</ErrorText>
      )}
    </>
  );

  const output = (
    <>
      {selectedImage && (
        <div
          ref={lightboxRef}
          role="dialog"
          aria-modal="true"
          aria-label={t("imageStudioRuntime.imagePreview")}
          className="fixed inset-0 z-50 flex items-center justify-center bg-overlay backdrop-blur-sm animate-fade-in"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={toImageSrc(selectedImage)}
              alt={t("imageStudioRuntime.generated")}
              onContextMenu={(e) => {
                e.stopPropagation();
                lightboxMenu.openAt(e);
              }}
              className="max-w-[90vw] max-h-[90vh] rounded-xl shadow-2xl"
            />
            <div className="absolute top-3 right-3 flex gap-1.5">
              <button
                onClick={() => downloadImage(selectedImage)}
                aria-label={t("imageStudioRuntime.download")}
                className="p-2 bg-overlay hover:bg-overlay rounded-lg text-text-secondary hover:text-text-primary transition-colors backdrop-blur-sm"
              >
                <svg
                  aria-hidden="true"
                  focusable="false"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              </button>
              <button
                onClick={() => setSelectedImage(null)}
                aria-label={t("imageStudioRuntime.close")}
                className="p-2 bg-overlay hover:bg-overlay rounded-lg text-text-secondary hover:text-text-primary transition-colors backdrop-blur-sm"
              >
                <svg
                  aria-hidden="true"
                  focusable="false"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <ContextMenu
            position={lightboxMenu.menu}
            items={
              [
                {
                  key: "save-as",
                  label: tRuntime("actions.saveAs"),
                  onSelect: () => {
                    void downloadImage(selectedImage);
                  },
                },
                {
                  key: "copy",
                  label: t("contextMenu.copyImage"),
                  onSelect: () => {
                    void copyText(toImageSrc(selectedImage));
                  },
                },
              ] satisfies ContextMenuItem[]
            }
            onClose={lightboxMenu.close}
            ariaLabel="Image preview actions"
          />
        </div>
      )}
      {mutation.isPending ? (
        <div
          className="flex min-h-[20rem] items-center justify-center"
          aria-live="polite"
        >
          <GenerationLoadingIndicator
            state="generating"
            label={t("imageStudioRuntime.generatingImage")}
            detail={t("imageStudioRuntime.generatingImageDetail")}
          />
        </div>
      ) : images.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          <ExamplePrompts
            items={starters}
            onPick={setPromptClamped}
            onShuffle={() =>
              setStarters(getPromptStartersForCategory("image", 4))
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {images.map((img, i) => (
            <div key={img} className="relative group">
              <button
                type="button"
                onClick={(event) => {
                  event.currentTarget.focus();
                  setSelectedImage(img);
                }}
                aria-label={t("imageStudioRuntime.openGeneratedImage", {
                  number: i + 1,
                })}
                className="block w-full rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <img
                  src={toImageSrc(img)}
                  alt={t("imageStudioRuntime.generatedNumber", {
                    number: i + 1,
                  })}
                  className="w-full rounded-xl border border-border hover:border-accent transition-all duration-200"
                />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  downloadImage(img, i);
                }}
                aria-label={t("imageStudioRuntime.download")}
                className="absolute top-2 right-2 p-1.5 bg-overlay hover:bg-overlay rounded-lg text-text-secondary hover:text-text-primary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 transition-all backdrop-blur-sm"
                title={t("imageStudioRuntime.download")}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              </button>
              {pendingImageSaves[img] && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void retryPendingImageSave(img);
                  }}
                  className="absolute top-2 left-2 rounded-md border border-warning/60 bg-overlay px-2 py-1 text-xs text-warning backdrop-blur-sm"
                  aria-label={tRuntime(
                    "surface.componentsCharacterCreatorCharactercreatorview.action.retrySave",
                  )}
                  title={t("imageStudioRuntime.imageSaveFailed")}
                >
                  {tRuntime(
                    "surface.componentsCharacterCreatorCharactercreatorview.action.retrySave",
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={async (event) => {
                  event.stopPropagation();
                  const media = useMediaStore
                    .getState()
                    .items.find((item) => item.image === img);
                  if (!media) {
                    toast.error(t("imageStudioRuntime.saveBeforeCard"));
                    return;
                  }
                  useCharacterCreatorLaunchStore.getState().launch({
                    mode: "new-from-image",
                    sourceMediaId: media.id,
                  });
                  useSettingsStore.getState().setActiveTab("character-creator");
                  toast.success(
                    t("imageStudioRuntime.characterCreatorLaunched"),
                  );
                }}
                className="absolute bottom-2 left-2 rounded-lg border border-accent bg-overlay px-2 py-1 text-[11px] text-accent opacity-0 transition-all group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
                data-testid="image-create-st-card"
              >
                <Trans i18nKey="common:surface.componentsImageImageView.action.createStCard" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );

  return <GenerationView controls={controls} output={output} />;
}
