// Code Owner: fayeblade (@spearchucker667)
// Video generation parameter form.
import React from "react";
import { Field } from "./Field";
import { ModelSelect } from "./ModelSelect";
import { ModelRefreshButton } from "./ModelRefreshButton";
import { StatusBlock } from "./StatusBlock";
import { CollapsibleSection } from "./CollapsibleSection";
import type { ModuleProps, VideoDraft } from "../types/app";

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

  const selectedModel = state.models.video.find((model) => model.id === state.selectedVideoModel);
  const selectedId = selectedModel?.id || state.selectedVideoModel;
  const requiresImage = /image-to-video|reference-to-video/i.test(selectedId);
  const requiresVideo = /video-to-video|topaz-video-upscale/i.test(selectedId);
  const promptRequired = !requiresVideo;
  const canSubmit =
    !state.usingFallbackModels &&
    (!promptRequired || !!draft.prompt.trim()) &&
    (!requiresImage || !!draft.imageUrl.trim()) &&
    (!requiresVideo || !!draft.sourceVideoUrl.trim());

  return (
    <div className="space-y-5">
      <Field label="Video model">
        <ModelSelect
          value={state.selectedVideoModel}
          models={state.models.video}
          onChange={(model) =>
            dispatch({ type: "SET_SELECTED_VIDEO_MODEL", model })
          }
        />
      </Field>

      <div className="mb-1">
        <ModelRefreshButton state={state} dispatch={dispatch} />
      </div>

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
          aria-describedby="video-prompt-error"
        />
        {promptTouched && promptRequired && !draft.prompt.trim() && (
          <div id="video-prompt-error" className="mt-1.5 text-sm text-danger animate-[fadeIn_0.3s_ease]" role="alert">
            Please enter a prompt before generating.
          </div>
        )}
      </Field>

      {(requiresImage || requiresVideo) && (
        <div className="rounded-xl border border-info/25 bg-info/10 p-3 text-sm text-info">
          {requiresVideo
            ? "This selected model expects a source video URL. Resolution is controlled by the video model constraints."
            : "This selected model expects a source image URL or data URL in addition to the motion prompt."}
        </div>
      )}

      <CollapsibleSection title="Advanced Settings">
        <div className="space-y-5">
          <Field label="Negative prompt">
            <input
              value={draft.negative}
              onChange={(e) => patch({ negative: e.target.value })}
              placeholder="low quality, blurry, distorted"
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder-text-muted transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </Field>

          <Field label="Source image URL">
            <input
              value={draft.imageUrl}
              onChange={(e) => patch({ imageUrl: e.target.value })}
              placeholder="https://example.com/reference.png or data:image/..."
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder-text-muted transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </Field>

          <Field label="Source video URL">
            <input
              value={draft.sourceVideoUrl}
              onChange={(e) => patch({ sourceVideoUrl: e.target.value })}
              placeholder="https://example.com/source.mp4 or data:video/..."
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-primary placeholder-text-muted transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
              </select>
            </Field>

            <Field label="Duration">
              <select
                value={draft.duration}
                onChange={(e) => patch({ duration: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
              >
                <option value="3s">3s</option>
                <option value="5s">5s</option>
                <option value="10s">10s</option>
                <option value="15s">15s</option>
              </select>
            </Field>

            <Field label="Resolution">
              <select
                value={draft.resolution}
                onChange={(e) => patch({ resolution: e.target.value })}
                className="w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-text-primary transition-all focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent appearance-none"
              >
                <option value="480p">480p</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="true_1080p">true_1080p</option>
              </select>
            </Field>

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
