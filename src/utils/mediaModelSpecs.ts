import type { ModelInfo } from "../types/venice";

export type MediaDirection =
  | "text-to-image"
  | "image-edit"
  | "image-multi-edit"
  | "image-upscale"
  | "text-to-video"
  | "image-to-video"
  | "video-to-video"
  | "reference-to-video"
  | "video-upscale";

export type MediaInputKind =
  | "prompt"
  | "negative_prompt"
  | "image_url"
  | "end_image_url"
  | "video_url"
  | "audio_url"
  | "reference_image_urls"
  | "reference_video_urls"
  | "reference_audio_urls"
  | "elements"
  | "scene_image_urls"
  | "duration"
  | "aspect_ratio"
  | "resolution"
  | "upscale_factor"
  | "audio"
  | "quality"
  | "output_format"
  | "safe_mode";

export interface NormalizedMediaModelSpec {
  id: string;
  name: string;
  type: string;
  privacy?: string;
  ownedBy?: string;
  deprecated?: boolean;
  beta?: boolean;
  directions: MediaDirection[];
  inputs: MediaInputKind[];
  durations?: string[];
  defaultDuration?: string;
  aspectRatios?: string[];
  defaultAspectRatio?: string;
  resolutions?: string[];
  defaultResolution?: string;
  upscaleFactors?: number[];
  defaultUpscaleFactor?: number;
  supportsAudio?: boolean;
  supportsAudioConfig?: boolean;
  promptCharacterLimit?: number;
  pricing?: unknown;
  raw: unknown;
  specSource: "live-model-spec" | "official-docs" | "inferred" | "fallback";
}

export function normalizeMediaModelSpec(model: ModelInfo): NormalizedMediaModelSpec {
  const id = model.id.toLowerCase();
  const rawSpec = (model.traits || model.capabilities || model.features || {}) as Record<string, unknown>;
  const isVideo = model.type === "video" || /video/i.test(model.type || "");
  const isImage = model.type === "image" || /image|inpaint|upscale/i.test(model.type || "");

  const spec: NormalizedMediaModelSpec = {
    id: model.id,
    name: model.name || model.display_name || model.id,
    type: model.type || "unknown",
    privacy: rawSpec.privacy as string | undefined,
    ownedBy: model.owned_by,
    deprecated: (rawSpec.deprecated as boolean | undefined) || false,
    beta: (rawSpec.beta as boolean | undefined) || false,
    directions: [],
    inputs: ["prompt"], // Assume prompt is needed by default unless stripped later
    pricing: rawSpec.pricing,
    raw: rawSpec,
    specSource: model.source === "fallback" ? "fallback" : (Object.keys(rawSpec).length > 0 ? "live-model-spec" : "inferred")
  };

  if (isVideo) {
    if (id.includes("topaz-video-upscale")) {
      spec.directions.push("video-upscale");
      spec.inputs = ["video_url", "upscale_factor"];
      spec.upscaleFactors = (rawSpec.upscale_factors as number[] | undefined) || [2, 4];
      spec.defaultUpscaleFactor = 2;
    } else {
      if (id.includes("text-to-video") || rawSpec.text_to_video) spec.directions.push("text-to-video");
      if (id.includes("image-to-video") || rawSpec.image_to_video) spec.directions.push("image-to-video");
      if (id.includes("video-to-video") || rawSpec.video_to_video) spec.directions.push("video-to-video");
      
      // Fallback for generic video models that might support text-to-video and image-to-video
      if (spec.directions.length === 0) {
        spec.directions.push("text-to-video", "image-to-video");
      }

      const defaultInputs: MediaInputKind[] = ["prompt", "negative_prompt", "aspect_ratio", "resolution", "duration"];
      spec.inputs = Array.from(new Set([...spec.inputs, ...defaultInputs]));
      if (spec.directions.includes("image-to-video")) spec.inputs.push("image_url");
      if (spec.directions.includes("video-to-video")) spec.inputs.push("video_url");
    }

    // Default durations/resolutions/aspects based on common models
    if (id.includes("wan")) {
      spec.durations = ["5s"];
      spec.defaultDuration = "5s";
      spec.resolutions = ["480p", "720p", "1080p"];
      spec.defaultResolution = "1080p";
    }
  }

  if (isImage) {
    if (id.includes("edit") || id.includes("inpaint")) {
      spec.directions.push("image-edit", "image-multi-edit");
      spec.inputs = ["prompt", "image_url", "aspect_ratio", "resolution", "output_format", "safe_mode", "quality"];
    } else if (id.includes("upscale")) {
      spec.directions.push("image-upscale");
      spec.inputs = ["image_url", "upscale_factor"];
    } else {
      spec.directions.push("text-to-image");
      spec.inputs = ["prompt", "negative_prompt", "aspect_ratio", "resolution", "safe_mode"];
    }
  }

  return spec;
}
