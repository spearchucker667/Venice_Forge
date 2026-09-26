import {
  useEffect,
  useId,
  useMemo,
  useState,
  useRef,
  type DragEvent,
} from "react";
import { selectHasVeniceKey, useAuthStore } from "../../stores/auth-store";
import {
  useImageEdit,
  useImageUpscale,
  useBackgroundRemove,
} from "../../hooks/use-image-tools";
import { useModels } from "../../hooks/use-models";
import { useBlobUrl } from "../../hooks/use-blob-url";
import { ModelSelect } from "../ModelSelect";
import {
  Label,
  TextArea,
  PrimaryButton,
  ErrorText,
  EmptyState,
} from "../ui/shared";
import { cn, generateId } from "../../lib/utils";
import { toast } from "../../stores/toast-store";
import {
  DEFAULT_IMAGE_EDIT_MODEL,
  modelSupportsEdit,
} from "../../constants/venice";
import { normalizeError } from "../../services/veniceClient/errors";
import { useMediaStore } from "../../stores/media-store";
import { blobToDataUrl } from "../../utils/image";
import type { MediaOperation } from "../../types/media";
import type { ModelInfo, VeniceModel } from "../../types/venice";
import { useImageWorkspaceStore } from "../../stores/image-workspace-store";
import {
  isSupportedImageFile,
  readImageAttachment,
} from "../../services/attachmentService";
import { inspectImageInput } from "../../services/media-request-adapter";
import { GenerationLoadingIndicator } from "../generation/GenerationLoadingIndicator";
import { Trans, useTranslation } from "react-i18next";
import { ContextMenu, useContextMenu } from "../ui/ContextMenu";
import type { ContextMenuItem } from "../ui/ContextMenu";
import {
  desktopMedia,
} from "../../services/desktopBridge";
import { copyText } from "../../utils/download";

type Tool = "edit" | "upscale" | "remove-bg";

interface ImageToolsProps {
  /** The dedicated editor exposes only editing; Image Studio keeps all tools. */
  editOnly?: boolean;
}

export function ImageTools({ editOnly = false }: ImageToolsProps) {
  const { t } = useTranslation("media");
  const sourceMenu = useContextMenu();
  const resultMenu = useContextMenu();
  const editPromptId = useId();
  const editModelId = useId();
  const hasVeniceKey = useAuthStore(selectHasVeniceKey);
  const { data: imageModels } = useModels("inpaint");
  const [tool, setTool] = useState<Tool>("edit");
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageName, setImageName] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const pendingHandoff = useImageWorkspaceStore((state) => state.pending);
  const [resultUrl, setResultBlob, resetResult] = useBlobUrl();
  const fileRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const resultIdRef = useRef<string | null>(null);

  // Edit state
  const [editPrompt, setEditPrompt] = useState("");
  const [editModel, setEditModel] = useState("");
  const filteredImageModels = useMemo<
    Array<ModelInfo & Pick<VeniceModel, "model_spec">>
  >(() => {
    const candidates = imageModels ?? [];
    const seen = new Set<string>();
    const filtered = candidates
      .filter((model) => modelSupportsEdit(model))
      .filter((model) => {
        if (seen.has(model.id)) return false;
        seen.add(model.id);
        return true;
      });
    if (filtered.length === 0) {
      return [{ id: DEFAULT_IMAGE_EDIT_MODEL, name: DEFAULT_IMAGE_EDIT_MODEL }];
    }
    return filtered;
  }, [imageModels]);

  // Upscale state
  const [scale, setScale] = useState<2 | 4>(2);
  const [upscaleAdherence, setUpscaleAdherence] = useState(50);
  const creativity = (100 - upscaleAdherence) * 0.0002;
  const sourceDiagnostics = useMemo(() => {
    if (!imageData) return null;
    const requestKeys =
      tool === "edit"
        ? ["image", "model", "prompt"]
        : tool === "upscale"
          ? ["creativity", "image", "scale"]
          : ["image"];
    try {
      return inspectImageInput(
        imageData,
        requestKeys,
        tool === "upscale" ? scale : undefined,
      );
    } catch {
      return null;
    }
  }, [imageData, scale, tool]);

  const editMutation = useImageEdit();
  const upscaleMutation = useImageUpscale();
  const bgRemoveMutation = useBackgroundRemove();
  const resultBlobRef = useRef<Blob | null>(null);
  const lastToolRef = useRef<Tool>("edit");
  const lastScaleRef = useRef<number>(2);
  const lastEditModelRef = useRef<string>("");
  const lastPromptRef = useRef<string>("");

  useEffect(() => {
    if (filteredImageModels.length === 0) return;
    if (!filteredImageModels.some((model) => model.id === editModel)) {
      setEditModel(filteredImageModels[0].id);
    }
  }, [editModel, filteredImageModels]);

  useEffect(() => {
    if (!pendingHandoff || pendingHandoff.target !== "tools") return;
    if (editOnly && pendingHandoff.tool !== "edit") return;
    setTool(pendingHandoff.tool);
    setImageData(pendingHandoff.image);
    setImageName(pendingHandoff.filename);
    setParentId(pendingHandoff.parentId);
    if (pendingHandoff.tool === "edit") setEditPrompt(pendingHandoff.prompt);
    resetResult();
    useImageWorkspaceStore.getState().consume(pendingHandoff.id);
  }, [pendingHandoff, resetResult, editOnly]);

  const handleFileSelect = async (file: File) => {
    if (!isSupportedImageFile(file)) {
      toast.warn(
        t("imageTools.unsupportedType", { type: file.type || file.name }),
      );
      return;
    }
    try {
      const attachment = await readImageAttachment(file);
      setImageData(attachment.content);
      setImageName(file.name);
      setParentId(null);
      resetResult();
    } catch (err) {
      toast.fromError(err, t("imageTools.failedToRead"));
    }
  };

  const handleDroppedFile = async (file: File) => {
    if (!isSupportedImageFile(file)) return;
    try {
      const attachment = await readImageAttachment(file);
      setImageData(attachment.content);
      setImageName(file.name);
      setParentId(null);
      resetResult();
    } catch (err) {
      toast.fromError(err, t("imageTools.failedToRead"));
    }
  };

  const handleSourceDragOver = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const handleSourceDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    void handleDroppedFile(file);
  };

  const handleProcess = () => {
    if (!imageData) return;
    resetResult();
    resultBlobRef.current = null;
    lastToolRef.current = tool;
    lastScaleRef.current = scale;
    lastEditModelRef.current = editModel;
    lastPromptRef.current = tool === "edit" ? editPrompt.trim() : "";
    const opts = {
      onSuccess: (blob: Blob) => {
        resultBlobRef.current = blob;
        resultIdRef.current = generateId();
        setResultBlob(blob);
      },
      onError: (err: unknown) => toast.fromError(err, t("imageTools.failed")),
    };
    if (tool === "edit") {
      editMutation.mutate(
        { image: imageData, prompt: editPrompt.trim(), model: editModel },
        opts,
      );
    } else if (tool === "upscale") {
      upscaleMutation.mutate({ image: imageData, scale, creativity }, opts);
    } else {
      bgRemoveMutation.mutate(imageData, opts);
    }
  };

  const handleSaveToMedia = async () => {
    if (savingRef.current) return;
    const blob = resultBlobRef.current;
    if (!blob) {
      toast.error(t("imageTools.noResult"));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const dataUrl = await blobToDataUrl(blob);
      const op: MediaOperation =
        lastToolRef.current === "upscale"
          ? "upscale"
          : lastToolRef.current === "remove-bg"
            ? "background-remove"
            : "edit";
      const modelId =
        lastToolRef.current === "edit"
          ? lastEditModelRef.current
          : "venice-image-tools";
      const mediaItem = {
        id: resultIdRef.current ?? generateId(),
        image: dataUrl,
        prompt:
          lastPromptRef.current ||
          t("imageTools.resultPrompt", {
            tool: t(`imageTools.tools.${lastToolRef.current}`),
          }),
        model: modelId,
        timestamp: Date.now(),
        mediaType: "image" as const,
        operation: op,
        parentId,
        childrenIds: [] as string[],
        tags: [] as string[],
        note: "",
        favorite: false,
        upscaleFactor:
          lastToolRef.current === "upscale" ? lastScaleRef.current : undefined,
      };
      if (parentId) {
        await useMediaStore.getState().upsertDerivative(mediaItem, parentId);
      } else {
        await useMediaStore.getState().upsert(mediaItem, {
          attachActiveProject: true,
          source: "generated",
        });
      }
      if (resultBlobRef.current === blob) {
        resultBlobRef.current = null;
        resultIdRef.current = null;
        resetResult();
      }
      toast.success(t("imageTools.savedToMedia"));
    } catch (err) {
      toast.fromError(err, t("imageTools.saveFailed"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleDeleteResult = () => {
    if (savingRef.current) return;
    resultBlobRef.current = null;
    resultIdRef.current = null;
    resetResult();
  };

  const isLoading =
    editMutation.isPending ||
    upscaleMutation.isPending ||
    bgRemoveMutation.isPending;
  const error =
    editMutation.error || upscaleMutation.error || bgRemoveMutation.error;

  const classifiedError = useMemo(() => {
    if (!error) return null;
    const status = (error as { status?: number }).status ?? null;
    const message = error instanceof Error ? error.message : String(error);
    return normalizeError(status, message);
  }, [error]);

  const downloadResult = () => {
    void handleSaveAsResult();
  };

  const handleSaveAsResult = async () => {
    const blob = resultBlobRef.current;
    if (!blob) {
      toast.error(t("imageTools.noResult"));
      return;
    }
    const suggestedName = `venice-${tool}-result.png`;
    try {
      const dataUrl = await blobToDataUrl(blob);
      const result = await desktopMedia.saveMediaAs({ source: dataUrl, suggestedName });
      if (result.status === "failed") throw new Error(result.error);
      if (result.status === "saved") toast.success(t("imageTools.savedToMedia"));
    } catch (err) {
      toast.fromError(err, t("imageTools.saveFailed"));
    }
  };

  const handleCopyResult = async () => {
    const blob = resultBlobRef.current;
    if (!blob) return;
    try {
      await copyText(await blobToDataUrl(blob));
      toast.success(t("imageTools.savedToMedia"));
    } catch {
      toast.fromError(new Error("Copy failed"), t("imageTools.saveFailed"));
    }
  };

  const handleCopySource = async () => {
    if (!imageData) return;
    try {
      await copyText(imageData);
      toast.success(t("imageTools.savedToMedia"));
    } catch {
      toast.fromError(new Error("Copy failed"), t("imageTools.saveFailed"));
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <div className="w-full lg:w-96 lg:border-r border-vf-panel-border p-6 flex flex-col gap-4 overflow-y-auto shrink-0">
        {/* Tool selector */}
        {!editOnly && <div className="flex gap-px bg-vf-panel-bg-raised rounded-md p-0.5 border border-vf-panel-border">
          {(["edit", "upscale", "remove-bg"] as const).map((id) => (
            <button
              key={id}
              disabled={saving}
              onClick={() => {
                setTool(id);
                resetResult();
              }}
              className={cn(
                "flex-1 px-2 py-2.5 text-[14px] font-medium rounded-[7px] transition-all duration-150",
                tool === id
                  ? "bg-accent text-accent-fg shadow-[0_0_8px_var(--color-vf-accent-glow)]"
                  : "text-text-muted hover:text-text-muted",
              )}
            >
              {t(`imageTools.tools.${id}`)}
            </button>
          ))}
        </div>}

        {/* Image upload */}
        <div>
          <Label>
            <Trans i18nKey="common:surface.componentsImageImageTools.text.sourceImage" />
          </Label>
          {imageData ? (
            <div
              className="relative group"
              onContextMenu={sourceMenu.openAt}
            >
              <img
                src={imageData}
                alt={t("imageTools.source")}
                className="w-full rounded-md border border-vf-panel-border"
              />
              <button
                onClick={() => {
                  setImageData(null);
                  setImageName("");
                  setParentId(null);
                  resetResult();
                }}
                disabled={saving}
                aria-label={t("imageTools.removeSource")}
                type="button"
                className="absolute top-1.5 right-1.5 p-1 bg-overlay rounded-md text-text-secondary hover:text-text-primary opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <span className="text-[13px] text-text-muted mt-1 block truncate">
                {imageName}
              </span>
              {sourceDiagnostics?.width && sourceDiagnostics.height && (
                <p
                  className="mt-1 text-[12px] text-text-muted"
                  aria-label={t("imageTools.sourceDiagnostics")}
                >
                  {sourceDiagnostics.mimeType
                    ?.replace("image/", "")
                    .toUpperCase()}{" "}
                  · {sourceDiagnostics.width}×{sourceDiagnostics.height} ·{" "}
                  {sourceDiagnostics.byteCount?.toLocaleString()}{" "}
                  <Trans i18nKey="common:surface.componentsImageImageTools.description.bytes" />
                  {sourceDiagnostics.projectedWidth &&
                  sourceDiagnostics.projectedHeight
                    ? t("imageTools.outputDimensions", {
                        width: sourceDiagnostics.projectedWidth,
                        height: sourceDiagnostics.projectedHeight,
                      })
                    : ""}
                  {" · "}
                  {sourceDiagnostics.requestKeys.join(", ")}
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled={saving}
              aria-label={t("imageTools.dropUpload")}
              onClick={() => fileRef.current?.click()}
              onDragOver={handleSourceDragOver}
              onDrop={handleSourceDrop}
              className="w-full border border-dashed border-vf-panel-border hover:border-accent rounded-md py-8 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            >
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                }}
              />
              <p className="text-[14px] text-text-muted">
                <Trans i18nKey="common:surface.componentsImageImageTools.description.clickToUploadImage" />
              </p>
            </button>
          )}
        </div>

        {/* Tool-specific controls */}
        {tool === "edit" && (
          <>
            <div>
              <Label htmlFor={editPromptId}>
                <Trans i18nKey="common:surface.componentsImageImageTools.text.editPrompt" />
              </Label>
              <TextArea
                id={editPromptId}
                value={editPrompt}
                onChange={setEditPrompt}
                placeholder={t("imageTools.editPlaceholder")}
                rows={3}
              />
            </div>
            <div>
              <Label htmlFor={editModelId}>
                <Trans i18nKey="common:surface.componentsImageImageTools.text.model" />
              </Label>
              <ModelSelect
                id={editModelId}
                value={editModel}
                onChange={setEditModel}
                models={filteredImageModels}
                ariaLabel={t("imageTools.editModel")}
                getLabel={(model) =>
                  model.model_spec?.name || model.name || model.id
                }
              />
            </div>
          </>
        )}

        {tool === "upscale" && (
          <>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>
                  <Trans i18nKey="common:surface.componentsImageImageTools.text.scale" />
                </Label>
                <span className="text-[13px] text-text-muted font-mono">
                  {scale}x
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([2, 4] as const).map((factor) => (
                  <button
                    key={factor}
                    type="button"
                    aria-pressed={scale === factor}
                    onClick={() => setScale(factor)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-[13px]",
                      scale === factor
                        ? "border-accent bg-accent/10 text-accent"
                        : "border-vf-panel-border text-text-secondary",
                    )}
                  >
                    {factor}×
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>
                  <Trans i18nKey="common:surface.componentsImageImageTools.text.sourceAdherence" />
                </Label>
                <span className="text-[13px] text-text-muted font-mono">
                  {upscaleAdherence}%
                </span>
              </div>
              <input
                aria-label={t("imageTools.upscaleAdherence")}
                type="range"
                min={0}
                max={100}
                step={5}
                value={upscaleAdherence}
                onChange={(e) =>
                  setUpscaleAdherence(
                    Math.min(100, Math.max(0, Number(e.target.value))),
                  )
                }
                className="w-full"
              />
              <p className="mt-1 text-[12px] text-text-muted">
                <Trans i18nKey="common:surface.componentsImageImageTools.description.higherValuesStayCloserToTheSource" />
              </p>
            </div>
            <div className="rounded-md border border-vf-panel-border bg-vf-panel-bg px-3 py-2 text-[12px] text-text-muted">
              <Trans i18nKey="common:surface.componentsImageImageTools.text.veniceUpscalingDoesNotAcceptAText" />
              <button
                type="button"
                onClick={() => setTool("edit")}
                className="ml-2 text-accent underline underline-offset-2"
              >
                <Trans i18nKey="common:surface.componentsImageImageTools.action.openEdit" />
              </button>
            </div>
          </>
        )}

        <PrimaryButton
          onClick={handleProcess}
          disabled={
            !imageData ||
            !hasVeniceKey ||
            isLoading ||
            saving ||
            (tool === "edit" && !editPrompt.trim())
          }
          loading={isLoading}
        >
          {t(`imageTools.actions.${tool}`)}
        </PrimaryButton>
        {error && <ErrorText>{classifiedError}</ErrorText>}
      </div>

      <div className="flex-1 min-h-48 lg:min-h-0 p-6 overflow-y-auto flex flex-col min-w-0">
        {isLoading ? (
          <div
            className="flex min-h-[18rem] items-center justify-center"
            aria-live="polite"
          >
            <GenerationLoadingIndicator
              state="processing"
              label={t(`imageTools.loading.${tool}`)}
              detail={t("imageTools.processingDetail")}
            />
          </div>
) : resultUrl ? (
          <div className="animate-fade-in flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>
                <Trans i18nKey="common:surface.componentsImageImageTools.text.result" />
              </Label>
              <div className="flex items-center gap-3">
                <button
                  disabled={saving}
                  onClick={() => void handleSaveToMedia()}
                  className="text-[14px] text-accent hover:opacity-85 transition-opacity flex items-center gap-1.5"
                  title={t("imageTools.saveToMedia")}
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  <Trans i18nKey="common:surface.componentsImageImageTools.action.saveToMediaStudio" />
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleDeleteResult}
                  className="text-[14px] text-text-muted hover:text-text-primary disabled:opacity-50"
                >
                  <Trans i18nKey="common:actions.delete" />
                </button>
                <button
                  onClick={downloadResult}
                  onContextMenu={(event) => event.stopPropagation()}
                  className="text-[14px] text-text-muted hover:text-text-muted transition-colors flex items-center gap-1.5"
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  <Trans i18nKey="common:surface.componentsImageImageTools.action.download" />
                </button>
              </div>
            </div>
            <img
              src={resultUrl}
              alt={t("imageTools.result")}
              onContextMenu={resultMenu.openAt}
              className={cn(
                "w-full rounded-md border border-vf-panel-border",
                tool === "remove-bg" &&
                  "bg-[repeating-conic-gradient(var(--surface-muted)_0%_25%,var(--surface-elevated)_0%_50%)_0_0/20px_20px]",
              )}
            />
          </div>
        ) : (
          <EmptyState>{t(`imageTools.empty.${tool}`)}</EmptyState>
        )}
      </div>
      <ContextMenu
        position={sourceMenu.menu}
        items={
          imageData
            ? ([
                {
                  key: "copy",
                  label: t("contextMenu.copyImage"),
                  onSelect: () => void handleCopySource(),
                },
              ] satisfies ContextMenuItem[])
            : []
        }
        onClose={sourceMenu.close}
        ariaLabel="Source image actions"
      />
      <ContextMenu
        position={resultMenu.menu}
        items={
          resultUrl
            ? ([
                {
                  key: "save-as",
                  label: t("contextMenu.saveAs"),
                  onSelect: () => void handleSaveAsResult(),
                },
                {
                  key: "save-media",
                  label: t("contextMenu.saveToMediaStudio"),
                  onSelect: () => void handleSaveToMedia(),
                },
                {
                  key: "copy",
                  label: t("contextMenu.copyImage"),
                  onSelect: () => void handleCopyResult(),
                },
              ] satisfies ContextMenuItem[])
            : []
        }
        onClose={resultMenu.close}
        ariaLabel="Result image actions"
      />
    </div>
  );
}
