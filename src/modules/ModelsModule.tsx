import React, { useState } from "react";
import { Field } from "../components/Field";
import { ModelSelect } from "../components/ModelSelect";
import { Chip } from "../components/Chip";
import { ModelRefreshButton } from "../components/ModelRefreshButton";
import type { AppState, AppDispatch } from "../types/app";
import type { ModelInfo } from "../types/venice";
export { refreshModels } from "../services/modelService";

function modelBadges(model: ModelInfo): string[] {
  const haystack = [
    model.id,
    model.name,
    model.type,
    JSON.stringify(model.traits || {}),
    JSON.stringify(model.capabilities || {}),
    JSON.stringify(model.features || {}),
  ].join(" ").toLowerCase();
  const badges: string[] = [];
  if (/private/.test(haystack)) badges.push("private");
  if (/uncensored/.test(haystack)) badges.push("uncensored");
  if (/text-to-video/.test(haystack)) badges.push("text to video");
  if (/image-to-video|reference-to-video/.test(haystack)) badges.push("image to video");
  if (/upscale/.test(haystack)) badges.push("upscale");
  if (model.isFallback) badges.push("fallback");
  return badges.slice(0, 4);
}

const FILTER_TAGS = [
  "All",
  "Video",
  "Text to Video",
  "Image to Video",
  "Video to Video",
  "Reference to Video",
  "Upscale",
  "Image Edit",
  "Combine / Multi-Edit",
  "Supports Audio",
  "Private",
  "Anonymized",
  "Deprecated"
];

function matchesFilter(model: ModelInfo, filter: string): boolean {
  if (filter === "All") return true;
  const haystack = [
    model.id,
    model.name,
    model.type,
    JSON.stringify(model.traits || {}),
    JSON.stringify(model.capabilities || {}),
    JSON.stringify(model.features || {}),
  ].join(" ").toLowerCase();

  switch (filter) {
    case "Video": return /video/.test(haystack);
    case "Text to Video": return /text-to-video|text_to_video/.test(haystack);
    case "Image to Video": return /image-to-video|image_to_video/.test(haystack);
    case "Video to Video": return /video-to-video|video_to_video/.test(haystack);
    case "Reference to Video": return /reference-to-video|reference_to_video/.test(haystack);
    case "Upscale": return /upscale/.test(haystack);
    case "Image Edit": return /edit|inpaint/.test(haystack);
    case "Combine / Multi-Edit": return /multi-edit|multi_edit/.test(haystack);
    case "Supports Audio": return /audio/.test(haystack);
    case "Private": return /private/.test(haystack);
    case "Anonymized": return /anonymized/.test(haystack);
    case "Deprecated": return /deprecated/.test(haystack);
    default: return true;
  }
}

export function ModelsModule({ state, dispatch }: { state: AppState; dispatch: AppDispatch }) {
  const [activeFilter, setActiveFilter] = useState("All");

  const groups = [
    "text",
    "image",
    "audio",
    "video",
    "embeddings",
    "unknown",
  ];

  return (
    <section className="flex flex-col h-full bg-bg">
      <div className="flex-none p-6 border-b border-border/40 bg-bg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-semibold tracking-tight text-text-primary">Models</h2>
            <div className="text-sm text-text-secondary mt-1">
              GET /models grouped by model metadata, type, traits, and ID heuristics.
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ModelRefreshButton state={state} dispatch={dispatch} />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {state.modelLoadError && (
          <div className="rounded-xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">
            {state.modelLoadError}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pb-2">
          {FILTER_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => setActiveFilter(tag)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                activeFilter === tag
                  ? "bg-accent text-white border border-accent"
                  : "bg-surface text-text-secondary border border-border/50 hover:bg-surface-elevated hover:text-text-primary"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Field label="Current chat model">
            <ModelSelect
              value={state.selectedChatModel}
              models={state.models.text?.filter(m => matchesFilter(m, activeFilter)) || []}
              onChange={(model: string) =>
                dispatch({ type: "SET_SELECTED_CHAT_MODEL", model })
              }
            />
          </Field>
          <Field label="Current image model">
            <ModelSelect
              value={state.selectedImageModel}
              models={state.models.image?.filter(m => matchesFilter(m, activeFilter)) || []}
              onChange={(model: string) =>
                dispatch({ type: "SET_SELECTED_IMAGE_MODEL", model })
              }
            />
          </Field>
          <Field label="Current video model">
            <ModelSelect
              value={state.selectedVideoModel}
              models={state.models.video?.filter(m => matchesFilter(m, activeFilter)) || []}
              onChange={(model: string) =>
                dispatch({ type: "SET_SELECTED_VIDEO_MODEL", model })
              }
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {groups.map((group) => {
            const groupModels = (state.models[group] || []).filter(m => matchesFilter(m, activeFilter));
            
            return (
            <div className="flex flex-col h-full rounded-lg border border-border/50 bg-surface overflow-hidden" key={group}>
              <div className="flex items-center justify-between p-4 border-b border-border/50 bg-surface/30">
                <strong className="text-sm font-semibold text-text-primary capitalize">{group}</strong>
                <Chip tone={group === "video" ? "video" : ""}>{groupModels.length}</Chip>
              </div>
              <div className="flex-1 overflow-y-auto p-2 max-h-[400px] space-y-2">
                {groupModels.map((m: ModelInfo) => (
                  <button
                    type="button"
                    className="w-full rounded-lg p-3 bg-surface-elevated/55 border border-transparent text-left transition-colors hover:border-border hover:bg-surface-elevated"
                    key={`${group}-${m.id}`}
                    onClick={() => {
                      if (group === "text") dispatch({ type: "SET_SELECTED_CHAT_MODEL", model: m.id });
                      if (group === "image") dispatch({ type: "SET_SELECTED_IMAGE_MODEL", model: m.id });
                      if (group === "video") dispatch({ type: "SET_SELECTED_VIDEO_MODEL", model: m.id });
                    }}
                  >
                    <div className="font-mono text-xs text-accent font-medium mb-1 break-all">{m.id}</div>
                    <div className="text-xs text-text-secondary">
                      {m.name || m.display_name || ""}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Chip tone={group === "video" ? "video" : "muted"} className="uppercase tracking-wider">
                        {m.type || group || "unknown"}
                      </Chip>
                      {modelBadges(m).map((badge) => (
                        <Chip key={badge} tone="muted" className="uppercase tracking-wider">
                          {badge}
                        </Chip>
                      ))}
                    </div>
                  </button>
                ))}
                {!groupModels.length && (
                  <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                    <img
                      src="./assets/branding/venice-keys-red.svg"
                      alt=""
                      className="h-8 w-8 opacity-15"
                      aria-hidden="true"
                    />
                    <div className="text-sm text-text-muted">No models matched this filter.</div>
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
