// Code Owner: fayeblade (@spearchucker667)
// Image generation parameter form — extracted from ImageModule.
import React from "react";
import { Field } from "./Field";
import { ModelSelect } from "./ModelSelect";
import { ModelRefreshButton } from "./ModelRefreshButton";
import { StatusBlock } from "./StatusBlock";
import { CollapsibleSection } from "./CollapsibleSection";
import { AppState, AppDispatch, ImageDraft } from "../types/app";

interface ImageGenerationFormProps {
  state: AppState;
  dispatch: AppDispatch;
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

  return (
    <div className="space-y-5">
      <Field label="Model">
        <ModelSelect
          value={state.selectedImageModel}
          models={state.models.image}
          onChange={(model) =>
            dispatch({ type: "SET_SELECTED_IMAGE_MODEL", model })
          }
        />
      </Field>

      <div className="mb-1">
        <ModelRefreshButton state={state} dispatch={dispatch} />
      </div>

      <Field label="Prompt">
        <textarea
          value={draft.prompt}
          onChange={(e) => {
            patch({ prompt: e.target.value });
            if (promptTouched && e.target.value.trim()) setPromptTouched(false);
          }}
          placeholder="Premium cinematic product render…"
          rows={4}
          className="w-full resize-y rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder-zinc-600 shadow-inner transition-all focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
          aria-invalid={promptTouched && !draft.prompt.trim()}
          aria-describedby="image-prompt-error"
        />
        {promptTouched && !draft.prompt.trim() && (
          <div id="image-prompt-error" className="mt-1.5 text-sm text-red-400 animate-[fadeIn_0.3s_ease]" role="alert">
            Please enter a prompt before generating.
          </div>
        )}
      </Field>

      <CollapsibleSection title="Advanced Settings & Batch">
        <div className="space-y-5">
          <Field label="Negative prompt">
            <input
              value={draft.negative}
              onChange={(e) => patch({ negative: e.target.value })}
              placeholder="low quality, blurry, distorted"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder-zinc-600 shadow-inner transition-all focus:border-brand-500/50 focus:outline-none focus:ring-1 focus:ring-brand-500/30"
            />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Aspect ratio">
              <select
                value={draft.aspectRatio}
                onChange={(e) => patch({ aspectRatio: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white transition-all focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 appearance-none"
              >
                <option value="1:1">1:1</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="4:3">4:3</option>
                <option value="3:4">3:4</option>
                <option value="custom">custom</option>
              </select>
            </Field>
            <Field label="Width">
              <input
                type="number"
                min="256"
                max="1280"
                step="64"
                value={String(draft.width)}
                onChange={(e) => patch({ width: Number(e.target.value) })}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white transition-all focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
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
                className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white transition-all focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Steps">
              <input
                type="number"
                min="1"
                max="50"
                value={draft.steps}
                onChange={(e) => patch({ steps: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white transition-all focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </Field>
            <Field label="CFG scale">
              <input
                type="number"
                min="1"
                max="20"
                step="0.5"
                value={draft.cfg}
                onChange={(e) => patch({ cfg: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white transition-all focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </Field>
            <Field label="Style preset">
              <select
                value={draft.style}
                onChange={(e) => patch({ style: e.target.value })}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white transition-all focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 appearance-none"
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
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Image count">
              <select
                value={draft.imageCount || 1}
                onChange={(e) => patch({ imageCount: Number(e.target.value) })}
                disabled={loading}
                className="w-full rounded-lg border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-white transition-all focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 appearance-none"
              >
                {[...Array(10)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
              <div className="mt-1 text-xs text-zinc-500">
                Creates up to 10 separate images from the same prompt. Large batches are queued to respect rate limits.
              </div>
            </Field>
            <Field label="Safeguard / Watermark">
              <div className="mt-2 flex flex-col gap-3">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={draft.safeMode}
                    onChange={(e) => patch({ safeMode: e.target.checked })}
                    className="h-4 w-4 rounded border-white/20 bg-black/50 text-brand-500 focus:ring-brand-500/50"
                  />
                  <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">safe_mode</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={draft.disableWatermark}
                    onChange={(e) => patch({ disableWatermark: e.target.checked })}
                    className="h-4 w-4 rounded border-white/20 bg-black/50 text-brand-500 focus:ring-brand-500/50"
                  />
                  <span className="text-sm text-zinc-300 group-hover:text-white transition-colors">disable watermark</span>
                </label>
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                Watermark disabling is sent only when supported by the selected Venice image endpoint/model.
              </div>
            </Field>
          </div>
        </div>
      </CollapsibleSection>

      <StatusBlock error={error} success={success} />

      <div className="flex flex-wrap items-center gap-3">
        <button
          className="btn primary"
          onClick={onGenerate}
          disabled={loading}
          aria-disabled={loading || !draft.prompt.trim()}
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
          Download image
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
