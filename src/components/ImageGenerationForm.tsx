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
    <div className="grid">
      <Field label="Model">
        <ModelSelect
          value={state.selectedImageModel}
          models={state.models.image}
          onChange={(model) =>
            dispatch({ type: "SET_SELECTED_IMAGE_MODEL", model })
          }
        />
      </Field>

      <div style={{ marginBottom: 4 }}>
        <ModelRefreshButton state={state} dispatch={dispatch} />
      </div>

      <Field label="Prompt">
        <textarea
          value={draft.prompt}
          onChange={(e) => {
            patch({ prompt: e.target.value });
            if (promptTouched && e.target.value.trim()) setPromptTouched(false);
          }}
          onBlur={() => { if (!draft.prompt.trim()) setPromptTouched(true); }}
          placeholder="Premium cinematic product render…"
          rows={4}
          aria-invalid={promptTouched && !draft.prompt.trim()}
          aria-describedby="image-prompt-error"
        />
        {promptTouched && !draft.prompt.trim() && (
          <div id="image-prompt-error" className="validation-error" role="alert">
            Please enter a prompt before generating.
          </div>
        )}
      </Field>

      <CollapsibleSection title="Advanced Settings & Batch">
        <div className="grid">
          <Field label="Negative prompt">
            <input
              value={draft.negative}
              onChange={(e) => patch({ negative: e.target.value })}
              placeholder="low quality, blurry, distorted"
            />
          </Field>

          <div className="grid three">
            <Field label="Aspect ratio">
              <select
                value={draft.aspectRatio}
                onChange={(e) => patch({ aspectRatio: e.target.value })}
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
              />
            </Field>
          </div>

          <div className="grid three">
            <Field label="Steps">
              <input
                type="number"
                min="1"
                max="50"
                value={draft.steps}
                onChange={(e) => patch({ steps: e.target.value })}
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
              />
            </Field>
            <Field label="Style preset">
              <select
                value={draft.style}
                onChange={(e) => patch({ style: e.target.value })}
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

          <div className="grid two">
            <Field label="Image count">
              <select
                value={draft.imageCount || 1}
                onChange={(e) => patch({ imageCount: Number(e.target.value) })}
                disabled={loading}
              >
                {[...Array(10)].map((_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
              <div className="tiny muted" style={{ marginTop: 4 }}>
                Creates up to 10 separate images from the same prompt. Large batches are queued to respect rate limits.
              </div>
            </Field>
            <Field label="Safeguard / Watermark">
              <div className="grid two" style={{ marginTop: 8 }}>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={draft.safeMode}
                    onChange={(e) => patch({ safeMode: e.target.checked })}
                  />
                  safe_mode
                </label>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={draft.disableWatermark}
                    onChange={(e) => patch({ disableWatermark: e.target.checked })}
                  />
                  disable watermark
                </label>
              </div>
              <div className="tiny muted" style={{ marginTop: 4 }}>
                Watermark disabling is sent only when supported by the selected Venice image endpoint/model.
              </div>
            </Field>
          </div>
        </div>
      </CollapsibleSection>

      <StatusBlock error={error} success={success} />

      <div className="chip-row">
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
