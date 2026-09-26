import { useState, useEffect, useMemo } from "react";
import {
  ScanSearch,
  FileImage,
  ClipboardPaste,
  HardDriveUpload,
  Loader2,
  Globe,
  ExternalLink,
  Trash2,
} from "lucide-react";
import { useImageInspectorStore } from "../../stores/image-inspector-store";
import {
  desktopImageInspector,
  isElectron,
} from "../../services/desktopBridge";
import { Label, TextArea, PillGroup } from "../ui/shared";
import { Select } from "../ui/select";
import { toast } from "../../stores/toast-store";
import { cn } from "../../lib/utils";
import type {
  ImageAnalysisDepth,
  PromptTarget,
} from "../../types/imageInspector";
import { useModels } from "../../hooks/use-models";
import { modelSupportsVision } from "../../constants/venice";
import { GenerationLoadingIndicator } from "../generation/GenerationLoadingIndicator";
import { askDecision } from "../ui/modal-requests";
import type { VeniceModel } from "../../types/venice";
import { Trans, useTranslation } from "react-i18next";
import { ResolvedMediaImg } from "../media/ResolvedMediaImg";

function formatUsdRate(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
}

export function formatImageInspectorModelCost(
  model: VeniceModel | undefined,
): string {
  const input = model?.model_spec?.pricing?.input?.usd;
  const output = model?.model_spec?.pricing?.output?.usd;
  if (input === undefined && output === undefined) return "Cost unavailable";
  return `${formatUsdRate(input)} input / ${formatUsdRate(output)} output per 1M tokens`;
}

export function ImageInspectorView() {
  const { t: tRuntime } = useTranslation("common");
  const store = useImageInspectorStore();
  const {
    activeSession,
    sessions,
    loading,
    searchResults,
    startAnalysis,
    cancelAnalysis,
    createSession,
    loadSession,
    deleteSession,
    refreshSessions,
  } = store;

  const { data: models = [] } = useModels();

  const [depth, setDepth] = useState<ImageAnalysisDepth>("standard");
  const [target, setTarget] = useState<PromptTarget>("generic");
  const [instructions, setInstructions] = useState("");
  const [selectedModelId, setSelectedModelId] = useState<string>("");

  // Filter models strictly to vision-capable models using canonical modelSupportsVision
  const visionModels = useMemo(() => {
    return models.filter((m) =>
      modelSupportsVision(m.id, m.model_spec?.capabilities),
    );
  }, [models]);
  const selectedModel = visionModels.find(
    (model) => model.id === selectedModelId,
  );

  useEffect(() => {
    if (
      visionModels.length > 0 &&
      (!selectedModelId || !visionModels.some((m) => m.id === selectedModelId))
    ) {
      setSelectedModelId(visionModels[0].id);
    }
  }, [visionModels, selectedModelId]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const handleUploadClick = async () => {
    if (!isElectron()) {
      toast.error(
        tRuntime(
          "runtimeGenerated.components.imageInspector.imageinspectorview.notification.imageInspectorUploadIsOnlySupportedInTheDesktopApp",
        ),
      );
      return;
    }
    try {
      const result = await desktopImageInspector.chooseImage();
      if (result.ok && result.result) {
        await createSession(result.result);
      } else if (!("canceled" in result && result.canceled)) {
        toast.error(
          result.error ||
            tRuntime(
              "runtimeGenerated.components.imageInspector.imageinspectorview.notification.failedToProcessImage",
            ),
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : tRuntime(
              "runtimeGenerated.components.imageInspector.imageinspectorview.notification.unknownError",
            ),
      );
    }
  };

  const handleClipboardPaste = async () => {
    if (!isElectron()) return;
    try {
      const result = await desktopImageInspector.ingestClipboardImage();
      if (result.ok && result.result) {
        await createSession(result.result);
      } else {
        toast.error(
          result.error ||
            tRuntime(
              "runtimeGenerated.components.imageInspector.imageinspectorview.notification.noImageFoundOnClipboard",
            ),
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : tRuntime(
              "runtimeGenerated.components.imageInspector.imageinspectorview.notification.unknownError",
            ),
      );
    }
  };

  const handleDeleteSession = async (id: string, title: string) => {
    const shouldDelete = await askDecision({
      title: tRuntime(
        "runtimeGenerated.components.imageInspector.imageinspectorview.metadata.deleteImageInspection",
      ),
      detail: `This permanently removes “${title}” from Image Inspector history. The underlying Media Studio image is not deleted.`,
      actionLabel: "Delete",
      danger: true,
    });
    if (shouldDelete) await deleteSession(id);
  };

  const activeInput = activeSession?.inputs[0];
  const analysis = activeSession?.analysis;

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden bg-vf-shell-bg">
      {/* Left Pane: Sessions & Input */}
      <div className="w-full md:w-[320px] lg:w-[340px] flex-shrink-0 border-b md:border-b-0 md:border-r border-vf-panel-border flex flex-col bg-vf-panel-bg overflow-hidden max-h-[35vh] md:max-h-none">
        <div className="p-4 border-b border-vf-panel-border">
          <h2 className="text-[14px] font-semibold text-text-primary mb-4 flex items-center gap-2">
            <ScanSearch className="w-4 h-4" />
            <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.heading.imageInspector" />
          </h2>

          <div className="flex gap-2">
            <button
              onClick={handleUploadClick}
              className="flex-1 bg-accent text-accent-fg hover:bg-accent-hover rounded-md font-medium text-[12px] py-1.5 flex items-center justify-center gap-2 transition-colors shadow-[0_0_8px_var(--color-vf-accent-glow)]"
            >
              <HardDriveUpload className="w-3 h-3" />
              <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.action.openFile" />
            </button>
            <button
              onClick={handleClipboardPaste}
              className="flex items-center justify-center bg-vf-panel-bg-raised hover:bg-vf-panel-bg-muted text-text-muted rounded-md px-3 border border-vf-panel-border transition-colors"
              title={tRuntime(
                "runtimeGenerated.components.imageInspector.imageinspectorview.attribute.pasteFromClipboard",
              )}
            >
              <ClipboardPaste className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {sessions.length === 0 ? (
            <div className="text-[12px] text-text-muted/50 text-center py-8">
              <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.text.noRecentImages" />
              <br />
              <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.text.openAFileToStartInspecting" />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-md text-[13px] flex items-center gap-1 transition-colors",
                    activeSession?.id === s.id
                      ? "bg-accent/10 text-accent-fg"
                      : "hover:bg-vf-panel-bg-muted text-text-muted",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => loadSession(s.id)}
                    className="min-w-0 flex-1 text-left p-2 flex items-center gap-3 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                    aria-label={tRuntime(
                      "runtimeGenerated.components.imageInspector.imageinspectorview.attribute.openImageInspectionValue1",
                      { value1: s.title },
                    )}
                  >
                    <div className="w-10 h-10 rounded overflow-hidden bg-vf-panel-bg-muted flex-shrink-0 border border-vf-panel-border">
                      {s.inputs[0]?.uri && (
                        <ResolvedMediaImg
                          src={s.inputs[0].uri}
                          className="w-full h-full object-cover"
                          alt=""
                        />
                      )}
                    </div>
                    <div className="overflow-hidden">
                      <div className="truncate font-medium">{s.title}</div>
                      <div className="text-[11px] opacity-60 mt-0.5">
                        {new Date(s.createdAt).toLocaleDateString()}{" "}
                        <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.text.middot" />{" "}
                        {s.status}
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteSession(s.id, s.title)}
                    disabled={s.status === "analyzing"}
                    className="mr-1 rounded p-2 text-text-muted hover:bg-error/10 hover:text-error disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
                    aria-label={tRuntime(
                      "runtimeGenerated.components.imageInspector.imageinspectorview.attribute.deleteImageInspectionValue1",
                      { value1: s.title },
                    )}
                    title={
                      s.status === "analyzing"
                        ? tRuntime(
                            "runtimeGenerated.components.imageInspector.imageinspectorview.attribute.cancelAnalysisBeforeDeleting",
                          )
                        : tRuntime(
                            "runtimeGenerated.components.imageInspector.imageinspectorview.attribute.deleteInspection",
                          )
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Pane: Active Image & Analysis */}
      <div className="flex-1 flex flex-col min-w-0 bg-vf-shell-bg overflow-y-auto">
        {!activeSession ? (
          <div className="flex-1 flex items-center justify-center flex-col text-text-muted/50">
            <ScanSearch className="w-16 h-16 opacity-20 mb-4" />
            <div className="text-[14px]">
              <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.text.selectOrUploadAnImageToInspect" />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col lg:flex-row p-6 gap-6 max-w-6xl mx-auto w-full">
            {/* Image Preview & Config */}
            <div className="flex flex-col gap-6 w-full lg:w-[400px] flex-shrink-0">
              <div className="rounded-md border border-vf-panel-border overflow-hidden bg-vf-panel-bg-muted flex items-center justify-center min-h-[300px]">
                {activeInput?.uri ? (
                  <ResolvedMediaImg
                    src={activeInput.uri}
                    className="max-w-full max-h-[500px] object-contain"
                    alt={tRuntime(
                      "runtimeGenerated.components.imageInspector.imageinspectorview.attribute.target",
                    )}
                  />
                ) : (
                  <FileImage className="w-8 h-8 text-text-muted/30" />
                )}
              </div>

              <div className="space-y-5 bg-vf-panel-bg p-5 rounded-md border border-vf-panel-border">
                {/* Vision Model Selection (Strictly Limited to Vision Models) */}
                <div className="space-y-2">
                  <Label>
                    <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.text.visionModel" />
                  </Label>
                  {visionModels.length > 0 ? (
                    <Select
                      value={selectedModelId}
                      onChange={(v) => setSelectedModelId(v)}
                      className="w-full"
                      placeholder={tRuntime(
                        "runtimeGenerated.components.imageInspector.imageinspectorview.attribute.selectAVisionModel",
                      )}
                      options={visionModels.map((m) => ({
                        value: m.id,
                        label: tRuntime(
                          "runtimeGenerated.components.imageInspector.imageinspectorview.metadata.value1Value2",
                          {
                            value1: m.model_spec?.name || m.id,
                            value2: formatImageInspectorModelCost(m),
                          },
                        ),
                      }))}
                    />
                  ) : (
                    <div className="text-[12px] p-2 bg-error/10 border border-error/20 rounded text-error">
                      <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.text.noVisionCapableModelsAvailableInCatalog" />
                    </div>
                  )}
                  {selectedModel && (
                    <div
                      className="text-[11px] text-text-muted"
                      data-testid="image-inspector-model-cost"
                    >
                      {formatImageInspectorModelCost(selectedModel)}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>
                    <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.text.analysisDepth" />
                  </Label>
                  <PillGroup
                    ariaLabel="Analysis Depth"
                    options={[
                      {
                        value: "quick",
                        label: tRuntime(
                          "runtimeGenerated.components.imageInspector.imageinspectorview.metadata.quick",
                        ),
                      },
                      {
                        value: "standard",
                        label: tRuntime(
                          "runtimeGenerated.components.imageInspector.imageinspectorview.metadata.standard",
                        ),
                      },
                      {
                        value: "maximum",
                        label: tRuntime(
                          "runtimeGenerated.components.imageInspector.imageinspectorview.metadata.maximum",
                        ),
                      },
                      {
                        value: "forensic",
                        label: tRuntime(
                          "runtimeGenerated.components.imageInspector.imageinspectorview.metadata.forensic",
                        ),
                      },
                    ]}
                    value={depth}
                    onChange={(v) => setDepth(v as ImageAnalysisDepth)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>
                    <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.text.promptTarget" />
                  </Label>
                  <Select
                    value={target}
                    onChange={(v) => setTarget(v as PromptTarget)}
                    className="w-full"
                    options={[
                      {
                        value: "generic",
                        label: tRuntime(
                          "runtimeGenerated.components.imageInspector.imageinspectorview.metadata.genericNaturalLanguage",
                        ),
                      },
                      {
                        value: "venice-image",
                        label: tRuntime(
                          "runtimeGenerated.components.imageInspector.imageinspectorview.metadata.veniceImageStudio",
                        ),
                      },
                      {
                        value: "flux",
                        label: tRuntime(
                          "runtimeGenerated.components.imageInspector.imageinspectorview.metadata.flux",
                        ),
                      },
                      {
                        value: "midjourney",
                        label: tRuntime(
                          "runtimeGenerated.components.imageInspector.imageinspectorview.metadata.midjourney",
                        ),
                      },
                    ]}
                  />
                </div>

                <div className="space-y-2">
                  <Label>
                    <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.text.specificInstructionsOptional" />
                  </Label>
                  <TextArea
                    value={instructions}
                    onChange={(v) => setInstructions(v)}
                    placeholder={tRuntime(
                      "runtimeGenerated.components.imageInspector.imageinspectorview.attribute.eGFocusOnLightingAndComposition",
                    )}
                  />
                </div>

                {activeSession.status === "analyzing" ? (
                  <button
                    onClick={() => cancelAnalysis()}
                    className="w-full bg-error text-error-fg hover:bg-error/90 rounded-md font-medium py-2.5 mt-2 flex items-center justify-center gap-2 transition-colors"
                  >
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.action.cancelAnalysis" />
                  </button>
                ) : (
                  <button
                    onClick={() =>
                      startAnalysis(
                        selectedModelId,
                        depth,
                        target,
                        instructions,
                        selectedModel?.model_spec?.capabilities
                          ?.supportsResponseSchema === true,
                      )
                    }
                    disabled={
                      loading || visionModels.length === 0 || !selectedModelId
                    }
                    className="w-full bg-accent text-accent-fg hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed rounded-md font-medium py-2.5 mt-2 flex items-center justify-center gap-2 transition-colors shadow-[0_0_8px_var(--color-vf-accent-glow)]"
                  >
                    <ScanSearch className="w-4 h-4" />
                    <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.action.analyzeImage" />
                  </button>
                )}
              </div>
            </div>

            {/* Analysis Results & Search Discovery */}
            <div className="flex-1 flex flex-col min-w-0 space-y-6">
              {analysis ? (
                <div className="bg-vf-panel-bg p-6 rounded-md border border-vf-panel-border space-y-6">
                  <div>
                    <h3 className="text-[14px] font-semibold text-text-primary mb-2 border-b border-vf-panel-border pb-2">
                      <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.heading.analysisSummary" />
                    </h3>
                    <p className="text-[13px] text-text-muted leading-relaxed whitespace-pre-wrap">
                      {analysis.summary ||
                        tRuntime(
                          "runtimeGenerated.components.imageInspector.imageinspectorview.text.noSummaryAvailable",
                        )}
                    </p>
                  </div>

                  {analysis.replicationPrompt && (
                    <div>
                      <h3 className="text-[14px] font-semibold text-text-primary mb-2 border-b border-vf-panel-border pb-2">
                        <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.heading.replicationPrompt" />
                      </h3>
                      <div className="bg-vf-shell-bg rounded p-3 text-[13px] text-text-primary border border-vf-panel-border font-mono whitespace-pre-wrap select-all">
                        {analysis.replicationPrompt.positive}
                      </div>
                      {analysis.replicationPrompt.negative && (
                        <div className="mt-2 bg-vf-shell-bg/50 rounded p-3 text-[12px] text-error/80 border border-error/20 font-mono whitespace-pre-wrap select-all">
                          <strong>
                            <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.text.negative" />
                          </strong>{" "}
                          {analysis.replicationPrompt.negative}
                        </div>
                      )}
                    </div>
                  )}

                  {analysis.subjects && analysis.subjects.length > 0 && (
                    <div>
                      <h3 className="text-[14px] font-semibold text-text-primary mb-2 border-b border-vf-panel-border pb-2">
                        <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.heading.subjects" />
                      </h3>
                      <ul className="list-disc pl-5 text-[13px] text-text-muted space-y-1">
                        {analysis.subjects.map((sub, i) => (
                          <li key={i}>
                            <strong>
                              {sub.description.split(":")[0] ||
                                tRuntime(
                                  "runtimeGenerated.components.imageInspector.imageinspectorview.text.subject",
                                )}
                              :
                            </strong>{" "}
                            {sub.description}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Direct image matching is fail-closed until a supported provider is configured. */}
                  <div className="pt-4 border-t border-vf-panel-border">
                    <h3 className="text-[14px] font-semibold text-text-primary mb-3 flex items-center gap-2">
                      <Globe className="w-4 h-4 text-accent" />
                      <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.heading.imageBasedSourceSearch" />
                    </h3>

                    <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-[12px] text-text-muted">
                      <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.text.directSourceImageMatchingIsUnavailableWith" />
                    </div>

                    {/* Preserve display of results created by earlier application versions. */}
                    {searchResults.length > 0 && (
                      <div className="mt-4 space-y-3">
                        <div className="text-[12px] font-medium text-text-muted">
                          <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.text.legacyTextQueryResults" />
                          {searchResults.length})
                        </div>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto p-1">
                          {searchResults.map((res) => (
                            <div
                              key={res.id}
                              className="p-3 bg-vf-shell-bg rounded border border-vf-panel-border text-[12px] space-y-1"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <a
                                  href={res.pageUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium text-accent hover:underline truncate flex items-center gap-1"
                                >
                                  {res.title}
                                  <ExternalLink className="w-3 h-3 flex-shrink-0" />
                                </a>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-vf-panel-bg-muted text-text-muted border border-vf-panel-border">
                                  {res.sourceDomain}
                                </span>
                              </div>
                              {res.matchReason && (
                                <p className="text-[11px] text-text-muted line-clamp-2">
                                  {res.matchReason}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : activeSession.status === "analyzing" ? (
                <div className="flex-1 flex items-center justify-center bg-vf-panel-bg rounded-md border border-vf-panel-border min-h-[400px]">
                  <GenerationLoadingIndicator
                    state="processing"
                    size="lg"
                    label={tRuntime(
                      "runtimeGenerated.components.imageInspector.imageinspectorview.attribute.analyzingImageContents",
                    )}
                    detail="Extracting composition, style, and subjects to generate a high-quality prompt."
                  />
                </div>
              ) : activeSession.status === "failed" ? (
                <div className="flex-1 flex items-center justify-center bg-error/5 rounded-md border border-error/30 min-h-[400px] p-8">
                  <div className="max-w-lg text-center">
                    <div className="text-[14px] font-semibold text-error">
                      <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.text.imageAnalysisFailed" />
                    </div>
                    <div className="text-[12px] text-text-muted mt-2">
                      {activeSession.error?.message ||
                        tRuntime(
                          "runtimeGenerated.components.imageInspector.imageinspectorview.text.theSelectedVisionModelCouldNotAnalyzeThisImage",
                        )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex items-center justify-center bg-vf-panel-bg/50 rounded-md border border-vf-panel-border border-dashed min-h-[400px]">
                  <div className="text-[13px] text-text-muted/50">
                    <Trans i18nKey="common:surface.componentsImageInspectorImageinspectorview.text.analysisResultsWillAppearHere" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
