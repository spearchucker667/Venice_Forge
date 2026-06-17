// Code Owner: fayeblade (@spearchucker667)
// Video generation parameter form.
import React, { useMemo, useEffect } from "react";
import { Field } from "./Field";
import { ModelSelect } from "./ModelSelect";
import { ModelRefreshButton } from "./ModelRefreshButton";
import { StatusBlock } from "./StatusBlock";
import { CollapsibleSection } from "./CollapsibleSection";
import type { ModuleProps, VideoDraft } from "../types/app";
import { normalizeMediaModelSpec, MediaDirection } from "../utils/mediaModelSpecs";
import { toast } from "../stores/toast-store";

interface VideoGenerationFormProps extends ModuleProps {
  draft: VideoDraft;
  loading: boolean;
  error: string;
  success: string;
  promptTouched: boolean;
  setPromptTouched: (v: boolean) => void;
  onGenerate: () => void;
  onCancel: () => void;
}

const MODES = [
  { value: "text-to-video", label: "Text to Video" },
  { value: "image-to-video", label: "Image to Video" },
  { value: "video-to-video", label: "Video to Video" },
  { value: "reference-to-video", label: "Reference to Video" },
  { value: "video-upscale", label: "Video Upscale" }
];

export function VideoGenerationForm({
  state,
  dispatch,
  draft,
  loading,
  error,
  success,
  promptTouched,
  setPromptTouched,
  onGenerate,
  onCancel,
}: VideoGenerationFormProps) {
  function patch(updates: Partial<VideoDraft>) {
    dispatch({ type: "SET_VIDEO_DRAFT", patch: updates });
  }


  // Derive specs for all video models
  const modelSpecs = useMemo(() => {
    return state.models.video.map(normalizeMediaModelSpec);
  }, [state.models.video]);

  // Filter models by the selected mode
  const currentMode = draft.videoMode as MediaDirection;
  const compatibleModels = useMemo(() => {
    return modelSpecs.filter(spec => spec.directions.includes(currentMode)).map(spec => {
      const original = state.models.video.find(m => m.id === spec.id);
      return original || { id: spec.id, name: spec.name };
    });
  }, [modelSpecs, currentMode, state.models.video]);

  // Ensure selected model is compatible, else switch to first compatible
  useEffect(() => {
    if (!state.models.video.length) return;
    const isCompatible = compatibleModels.some(m => m.id === state.selectedVideoModel);
    if (!isCompatible && compatibleModels.length > 0) {
      dispatch({ type: "SET_SELECTED_VIDEO_MODEL", model: compatibleModels[0].id });
    }
  }, [currentMode, compatibleModels, state.selectedVideoModel, dispatch, state.models.video]);

  const currentSpec = useMemo(() => {
    return modelSpecs.find(s => s.id === state.selectedVideoModel);
  }, [modelSpecs, state.selectedVideoModel]);

  const inputs = currentSpec?.inputs || [];
  const requiresImage = inputs.includes("image_url");
  const requiresVideo = inputs.includes("video_url");
  const promptRequired = inputs.includes("prompt") && !inputs.includes("video_url") && currentMode !== "video-upscale";

  const canSubmit =
    !state.usingFallbackModels &&
    (!promptRequired || !!draft.prompt.trim()) &&
    (!requiresImage || !!draft.imageUrl.trim()) &&
    (!requiresVideo || !!draft.sourceVideoUrl.trim());

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Generation Mode">
          <select
            value={draft.videoMode}
            onChange={(e) => patch({ videoMode: e.target.value })}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
          >
            {MODES.map(mode => (
              <option key={mode.value} value={mode.value}>{mode.label}</option>
            ))}
          </select>
        </Field>
        
        <Field label="Video model">
          <ModelSelect
            value={state.selectedVideoModel}
            models={compatibleModels as import("../types/venice").ModelInfo[]}
            onChange={(model) => dispatch({ type: "SET_SELECTED_VIDEO_MODEL", model })}
          />
        </Field>
      </div>

      <div className="mb-1">
        <ModelRefreshButton state={state} dispatch={dispatch} />
      </div>

      {inputs.includes("prompt") && currentMode !== "video-upscale" && (
        <Field label={promptRequired ? "Prompt" : "Prompt (optional)"}>
          <textarea
            value={draft.prompt}
            onChange={(e) => {
              patch({ prompt: e.target.value });
              if (promptTouched && e.target.value.trim()) setPromptTouched(false);
            }}
            placeholder="A cinematic shot of a futuristic city..."
            rows={4}
            className="w-full resize-y rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder-text-muted transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            aria-invalid={promptTouched && promptRequired && !draft.prompt.trim()}
          />
          {promptTouched && promptRequired && !draft.prompt.trim() && (
            <div className="mt-1.5 text-sm text-danger animate-[fadeIn_0.3s_ease]">
              Please enter a prompt before generating.
            </div>
          )}
        </Field>
      )}

      {(requiresImage || requiresVideo) && (
        <div className="rounded-xl border border-info/25 bg-info/10 p-3 text-sm text-info">
          {requiresVideo
            ? "This selected model expects a source video URL. Resolution is controlled by the video model constraints."
            : "This selected model expects a source image URL or data URL in addition to the motion prompt."}
        </div>
      )}

      <CollapsibleSection title="Advanced Settings">
        <div className="space-y-5">
          {inputs.includes("negative_prompt") && (
            <Field label="Negative prompt">
              <input
                value={draft.negative}
                onChange={(e) => patch({ negative: e.target.value })}
                placeholder="low quality, blurry, distorted"
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder-text-muted transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </Field>
          )}

          {requiresImage && (
            <Field label="Source Image (Drag & Drop or URL)">
              <div
                className="group relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/50 bg-surface/30 p-6 transition-all hover:border-accent/50 hover:bg-surface"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.add("border-accent", "bg-accent/5");
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove("border-accent", "bg-accent/5");
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.classList.remove("border-accent", "bg-accent/5");
                  
                  const file = e.dataTransfer.files?.[0];
                  if (!file) return;
                  if (!file.type.startsWith("image/")) {
                    toast.warn("Please drop an image file.");
                    return;
                  }
                  
                  try {
                    const { processFileAttachment } = await import("../services/attachmentService");
                    const attachment = await processFileAttachment(file);
                    patch({ imageUrl: attachment.content });
                  } catch (err: unknown) {
                    toast.fromError(err, "Failed to process image");
                  }
                }}
              >
                <div className="mb-4 text-center">
                  <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-surface-elevated text-text-muted group-hover:text-accent transition-colors">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                  </div>
                  <p className="text-sm font-medium text-text-primary">Drag & drop an image</p>
                  <p className="mt-1 text-xs text-text-muted">or click to browse files</p>
                  <input 
                    type="file" 
                    accept="image/png, image/jpeg, image/webp" 
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const { processFileAttachment } = await import("../services/attachmentService");
                        const attachment = await processFileAttachment(file);
                        patch({ imageUrl: attachment.content });
                      } catch (err: unknown) {
                        toast.fromError(err, "Failed to process image");
                      }
                      e.target.value = ""; // reset input
                    }}
                  />
                </div>
                
                <div className="w-full relative z-10">
                  <input
                    value={draft.imageUrl}
                    onChange={(e) => patch({ imageUrl: e.target.value })}
                    placeholder="https://example.com/reference.png or data:image/..."
                    className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder-text-muted transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    onClick={(e) => e.stopPropagation()} // Prevent triggering the file input
                  />
                </div>
              </div>
            </Field>
          )}

          {requiresVideo && (
            <Field label="Source video URL">
              <input
                value={draft.sourceVideoUrl}
                onChange={(e) => patch({ sourceVideoUrl: e.target.value })}
                placeholder="https://example.com/source.mp4 or data:video/..."
                className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder-text-muted transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {inputs.includes("aspect_ratio") && (
              <Field label="Aspect ratio">
                <select
                  value={draft.aspectRatio}
                  onChange={(e) => patch({ aspectRatio: e.target.value })}
                  className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
                >
                  {(currentSpec?.aspectRatios || ["1:1", "16:9", "9:16", "4:3", "3:4"]).map(ar => (
                    <option key={ar} value={ar}>{ar}</option>
                  ))}
                </select>
              </Field>
            )}

            {inputs.includes("duration") && (
              <Field label="Duration">
                <select
                  value={draft.duration}
                  onChange={(e) => patch({ duration: e.target.value })}
                  className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
                >
                  {(currentSpec?.durations || ["3s", "5s", "10s", "15s"]).map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </Field>
            )}

            {inputs.includes("resolution") && (
              <Field label="Resolution">
                <select
                  value={draft.resolution}
                  onChange={(e) => patch({ resolution: e.target.value })}
                  className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
                >
                  {(currentSpec?.resolutions || ["480p", "720p", "1080p", "true_1080p"]).map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </Field>
            )}
            
            {inputs.includes("upscale_factor") && (
              <Field label="Upscale Factor">
                <select
                  value={draft.upscaleFactor}
                  onChange={(e) => patch({ upscaleFactor: parseInt(e.target.value, 10) })}
                  className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
                >
                  {(currentSpec?.upscaleFactors || [2, 4]).map(f => (
                    <option key={f} value={f}>{f}x</option>
                  ))}
                </select>
              </Field>
            )}

            {inputs.includes("audio") && (
              <Field label="Audio">
                <select
                  value={draft.audio ? "true" : "false"}
                  onChange={(e) => patch({ audio: e.target.value === "true" })}
                  className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
                >
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </Field>
            )}
          </div>
        </div>
      </CollapsibleSection>

      <div className="flex gap-3">
        {loading ? (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl bg-danger/10 py-3.5 text-sm font-semibold text-danger shadow-sm transition-all hover:bg-danger/20"
          >
            Cancel Generation
          </button>
        ) : (
          <button
            type="button"
            onClick={onGenerate}
            disabled={!canSubmit}
            className="flex-1 rounded-xl bg-accent py-3.5 text-sm font-semibold text-accent-fg shadow-md transition-all hover:bg-accent-hover disabled:pointer-events-none disabled:opacity-50"
          >
            {draft.queueId ? "Queue Another Video" : "Queue Video Generation"}
          </button>
        )}
      </div>

      <StatusBlock error={error} success={success} />
    </div>
  );
}
