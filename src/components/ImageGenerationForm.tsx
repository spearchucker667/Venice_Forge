// Code Owner: fayeblade (@spearchucker667)
// Image generation parameter form — extracted from ImageModule.
import React, { useMemo, useEffect } from "react";
import { Field } from "./Field";
import { ModelSelect } from "./ModelSelect";
import { ModelRefreshButton } from "./ModelRefreshButton";
import { StatusBlock } from "./StatusBlock";
import { CollapsibleSection } from "./CollapsibleSection";
import { normalizeMediaModelSpec, MediaDirection } from "../utils/mediaModelSpecs";
import { ModuleProps, ImageDraft } from "../types/app";

interface ImageGenerationFormProps extends ModuleProps {
  draft: ImageDraft;
  loading: boolean;
  error: string;
  success: string;
  promptTouched: boolean;
  setPromptTouched: (v: boolean) => void;
  onGenerate: () => void;
  onCancel: () => void;
  onDownload: () => void;
  onSaveAgain: () => void;
  onUpscale: () => void;
}

const MODES = [
  { value: "text-to-image", label: "Generate" },
  { value: "image-edit", label: "Edit" },
  { value: "image-multi-edit", label: "Combine" },
  { value: "image-upscale", label: "Upscale" }
];

export function ImageGenerationForm({
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
  onDownload,
  onSaveAgain,
  onUpscale,
}: ImageGenerationFormProps) {
  function patch(updates: Partial<ImageDraft>) {
    dispatch({ type: "SET_IMAGE_DRAFT", patch: updates });
  }

  const modelSpecs = useMemo(() => {
    return state.models.image.map(normalizeMediaModelSpec);
  }, [state.models.image]);

  const currentMode = draft.imageMode as MediaDirection;
  
  const compatibleModels = useMemo(() => {
    return modelSpecs.filter(spec => spec.directions.includes(currentMode)).map(spec => {
      const original = state.models.image.find(m => m.id === spec.id);
      return original || { id: spec.id, name: spec.name };
    });
  }, [modelSpecs, currentMode, state.models.image]);

  useEffect(() => {
    if (!state.models.image.length) return;
    const isCompatible = compatibleModels.some(m => m.id === state.selectedImageModel);
    if (!isCompatible && compatibleModels.length > 0) {
      dispatch({ type: "SET_SELECTED_IMAGE_MODEL", model: compatibleModels[0].id });
    }
  }, [currentMode, compatibleModels, state.selectedImageModel, dispatch, state.models.image]);

  const currentSpec = useMemo(() => {
    return modelSpecs.find(s => s.id === state.selectedImageModel);
  }, [modelSpecs, state.selectedImageModel]);

  const inputs = currentSpec?.inputs || [];
  const requiresPrompt = inputs.includes("prompt") && currentMode !== "image-upscale";
  const requiresImage = currentMode !== "text-to-image" && currentMode !== "image-multi-edit";
  const requiresMultiImage = currentMode === "image-multi-edit";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Studio Mode">
          <select
            value={draft.imageMode}
            onChange={(e) => patch({ imageMode: e.target.value })}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
          >
            {MODES.map(mode => (
              <option key={mode.value} value={mode.value}>{mode.label}</option>
            ))}
          </select>
        </Field>
        
        <Field label="Model">
          <ModelSelect
            value={state.selectedImageModel}
            models={compatibleModels as import("../types/venice").ModelInfo[]}
            onChange={(model) => dispatch({ type: "SET_SELECTED_IMAGE_MODEL", model })}
          />
        </Field>
      </div>

      <div className="mb-1">
        <ModelRefreshButton state={state} dispatch={dispatch} />
      </div>

      {requiresPrompt && (
        <Field label="Prompt">
          <textarea
            value={draft.prompt}
            onChange={(e) => {
              patch({ prompt: e.target.value });
              if (promptTouched && e.target.value.trim()) setPromptTouched(false);
            }}
            placeholder="Premium cinematic product render…"
            rows={4}
            className="w-full resize-y rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder-text-muted transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            aria-invalid={promptTouched && !draft.prompt.trim()}
            aria-describedby="image-prompt-error"
          />
          {promptTouched && !draft.prompt.trim() && (
            <div id="image-prompt-error" className="mt-1.5 text-sm text-danger animate-[fadeIn_0.3s_ease]" role="alert">
              Please enter a prompt before generating.
            </div>
          )}
        </Field>
      )}

      {requiresImage && (
        <Field label="Source Image URL">
          <input
            value={draft.imageUrl}
            onChange={(e) => patch({ imageUrl: e.target.value })}
            placeholder="https://example.com/source.png or data:image/..."
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder-text-muted transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </Field>
      )}

      {requiresMultiImage && (
        <Field label="Source Image URLs (Comma separated)">
          <textarea
            value={(draft.imageUrls || []).join(", ")}
            onChange={(e) => patch({ imageUrls: e.target.value.split(",").map(s => s.trim()).filter(Boolean) })}
            placeholder="https://example.com/1.png, https://example.com/2.png"
            rows={2}
            className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder-text-muted transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </Field>
      )}

      <CollapsibleSection title="Advanced Settings & Batch">
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

          <div className="grid grid-cols-3 gap-4">
            {inputs.includes("aspect_ratio") && (
              <Field label="Aspect ratio">
                <select
                  value={draft.aspectRatio}
                  onChange={(e) => patch({ aspectRatio: e.target.value })}
                  className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
                >
                  <option value="1:1">1:1</option>
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="4:3">4:3</option>
                  <option value="3:4">3:4</option>
                  <option value="custom">custom</option>
                </select>
              </Field>
            )}
            
            {draft.aspectRatio === "custom" && currentMode === "text-to-image" && (
              <>
                <Field label="Width">
                  <input
                    type="number"
                    min="256"
                    max="1280"
                    step="64"
                    value={String(draft.width)}
                    onChange={(e) => patch({ width: Number(e.target.value) })}
                    className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </Field>
                <Field label="Height">
                  <input
                    type="number"
                    min="256"
                    max="1280"
                    step="64"
                    value={String(draft.height)}
                    onChange={(e) => patch({ height: Number(e.target.value) })}
                    className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </Field>
              </>
            )}
            
            {inputs.includes("upscale_factor") && (
              <Field label="Upscale Factor">
                <select
                  value={draft.upscaleFactor}
                  onChange={(e) => patch({ upscaleFactor: parseInt(e.target.value, 10) })}
                  className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
                >
                  <option value={2}>2x</option>
                  <option value={4}>4x</option>
                </select>
              </Field>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            {currentMode === "text-to-image" && (
              <>
                <Field label="Steps">
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={draft.steps}
                    onChange={(e) => patch({ steps: Number(e.target.value) })}
                    className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </Field>
                <Field label="CFG scale">
                  <input
                    type="number"
                    min="1"
                    max="20"
                    step="0.5"
                    value={draft.cfg}
                    onChange={(e) => patch({ cfg: Number(e.target.value) })}
                    className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </Field>
                <Field label="Style preset">
                  <select
                    value={draft.style}
                    onChange={(e) => patch({ style: e.target.value })}
                    className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
                  >
                    <option value="">none</option>
                    <option value="3D Model">3D Model</option>
                    <option value="Analog Film">Analog Film</option>
                    <option value="Anime">Anime</option>
                    <option value="Cinematic">Cinematic</option>
                    <option value="Comic Book">Comic Book</option>
                    <option value="Digital Art">Digital Art</option>
                    <option value="Fantasy Art">Fantasy Art</option>
                    <option value="Photographic">Photographic</option>
                    <option value="Pixel Art">Pixel Art</option>
                  </select>
                </Field>
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {currentMode === "text-to-image" && (
              <Field label="Image count">
                <select
                  value={draft.imageCount || 1}
                  onChange={(e) => patch({ imageCount: Number(e.target.value) })}
                  disabled={loading}
                  className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
                >
                  {[...Array(10)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
                <div className="mt-1 text-xs text-text-muted">
                  Creates up to 10 separate images from the same prompt. Large batches are queued to respect rate limits.
                </div>
              </Field>
            )}
            
            {inputs.includes("safe_mode") && (
              <Field label="Safeguard / Watermark">
                <div className="mt-2 flex flex-col gap-3">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={draft.safeMode}
                      onChange={(e) => patch({ safeMode: e.target.checked })}
                      className="h-4 w-4 rounded border-border/50 bg-surface/60 text-accent focus:ring-accent/50"
                    />
                    <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">safe_mode</span>
                  </label>
                  {currentMode === "text-to-image" && (
                    <label className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={draft.disableWatermark}
                        onChange={(e) => patch({ disableWatermark: e.target.checked })}
                        className="h-4 w-4 rounded border-border/50 bg-surface/60 text-accent focus:ring-accent/50"
                      />
                      <span className="text-sm text-text-secondary group-hover:text-text-primary transition-colors">disable watermark</span>
                    </label>
                  )}
                </div>
                <div className="mt-1 text-xs text-text-muted">
                  Safe mode filters explicit content.
                </div>
              </Field>
            )}
          </div>
        </div>
      </CollapsibleSection>

      <StatusBlock error={error} success={success} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn primary"
          onClick={onGenerate}
          disabled={loading || (requiresPrompt && !draft.prompt.trim())}
          aria-disabled={loading || (requiresPrompt && !draft.prompt.trim())}
        >
          {loading ? "Generating…" : "Generate + auto-save"}
        </button>
        <button
          className="btn"
          onClick={onCancel}
          disabled={!loading}
        >
          Cancel
        </button>
        <button
          className="btn"
          onClick={onDownload}
          disabled={!draft.currentImage}
        >
          Download result
        </button>
        <button
          className="btn"
          onClick={onSaveAgain}
          disabled={!draft.currentImage}
        >
          Save another copy
        </button>
        <button
          className="btn"
          onClick={onUpscale}
          disabled={!draft.currentImage || loading}
        >
          {loading ? "Enhancing…" : "Enhance & upscale"}
        </button>
      </div>
    </div>
  );
}
