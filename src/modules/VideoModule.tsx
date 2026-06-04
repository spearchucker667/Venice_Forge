// Code Owner: fayeblade (@spearchucker667)
// Video generation module — orchestrates params, preview, and polling.
import React, { useState, useRef, useEffect, useCallback } from "react";
import { queueVideo, retrieveVideo, type QueueVideoRequest } from "../services/mediaService";
import { assessChildExploitationSafety, recordDecision } from "../shared/safety";
import { VideoGenerationForm } from "../components/VideoGenerationForm";
import { VideoGenerationPreview } from "../components/VideoGenerationPreview";
import { blobToDataUrl } from "../utils/image";
import { saveImageRecord } from "../services/imageWorkflowService";
import { normalizeMediaModelSpec } from "../utils/mediaModelSpecs";
import type { ModuleProps, VideoDraft } from "../types/app";
import { GenerationView } from "../components/ui/generation-view";

export function VideoModule({ state, dispatch }: ModuleProps) {
  const draft = state.videoDraft;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoObjectUrlRef = useRef<string | null>(null);

  const patch = useCallback((updates: Partial<VideoDraft>) => {
    dispatch({ type: "SET_VIDEO_DRAFT", patch: updates });
  }, [dispatch]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (videoObjectUrlRef.current) {
        URL.revokeObjectURL(videoObjectUrlRef.current);
        videoObjectUrlRef.current = null;
      }
    };
  }, []);

  async function saveToGallery(durableSource: string, downloadUrl: string | null, queueId: string, model: string) {
    await saveImageRecord(dispatch, {
      id: crypto.randomUUID(),
      image: durableSource,
      prompt: draft.prompt,
      negative: draft.negative,
      model,
      timestamp: Date.now(),
      mediaType: "video",
      workflow: draft.videoMode,
      queueId,
      downloadUrl: downloadUrl || undefined,
      duration: draft.duration,
      resolution: draft.resolution,
      upscaleFactor: draft.upscaleFactor,
      audio: draft.audio
    });
  }

  async function pollStatus(
    queueId: string,
    model: string,
    signal: AbortSignal,
    queuedDownloadUrl: string | null
  ) {
    if (signal.aborted) return;

    try {
      const res = await retrieveVideo(model, queueId, { signal, dispatch });
      if (res.error) {
        setError(res.error);
        setLoading(false);
        patch({ generationProgress: "", status: "ERROR" });
        return;
      }

      if (res.status === "COMPLETED") {
        setLoading(false);
        setSuccess("Video generation completed.");

        if (res.blob) {
          if (videoObjectUrlRef.current) {
            URL.revokeObjectURL(videoObjectUrlRef.current);
          }
          const previewUrl = URL.createObjectURL(res.blob);
          videoObjectUrlRef.current = previewUrl;

          const durableSource = queuedDownloadUrl || await blobToDataUrl(res.blob);
          patch({
            generationProgress: "",
            status: "COMPLETED",
            videoUrl: previewUrl,
            downloadUrl: queuedDownloadUrl,
          });

          await saveToGallery(durableSource, queuedDownloadUrl, queueId, model);
        } else if (queuedDownloadUrl) {
          patch({
            generationProgress: "",
            status: "COMPLETED",
            downloadUrl: queuedDownloadUrl,
          });
          await saveToGallery(queuedDownloadUrl, queuedDownloadUrl, queueId, model);
        } else {
          throw new Error("Video completed but no durable media URL was returned.");
        }
        return;
      }

      patch({ status: res.status });
      if (!signal.aborted) {
        pollTimerRef.current = setTimeout(() => void pollStatus(queueId, model, signal, queuedDownloadUrl), 5000);
      }
    } catch (err: unknown) {
      if (signal.aborted) return;
      const errorObject = err as { name?: string; message?: string };
      setError(errorObject.message || "Failed to retrieve video status.");
      setLoading(false);
      patch({ generationProgress: "", status: "ERROR" });
    }
  }

  async function generate() {
    setPromptTouched(true);
    const selectedModel = state.models.video.find((m) => m.id === state.selectedVideoModel);
    
    if (loading) return;
    if (state.usingFallbackModels) {
      setError("Fallback models are active. Please refresh the model catalog before sending requests.");
      return;
    }
    if (!selectedModel) {
      setError("Selected model is not available in the video model catalog.");
      return;
    }

    const spec = normalizeMediaModelSpec(selectedModel);
    const inputs = spec.inputs || [];
    const currentMode = draft.videoMode;
    const promptRequired = inputs.includes("prompt") && !inputs.includes("video_url") && currentMode !== "video-upscale";
    const requiresImage = inputs.includes("image_url");
    const requiresVideo = inputs.includes("video_url");

    if (promptRequired && !draft.prompt.trim()) return;
    if (requiresImage && !draft.imageUrl.trim()) {
      setError("This video model requires a source image URL.");
      return;
    }
    if (requiresVideo && !draft.sourceVideoUrl.trim()) {
      setError("This video model requires a source video URL.");
      return;
    }

    setError("");
    setSuccess("");

    if (inputs.includes("prompt")) {
      const guardText = [draft.prompt, draft.negative].filter((value) => value.trim()).join("\n");
      const guardDecision = assessChildExploitationSafety({ text: guardText, endpoint: "/video/queue", method: "POST", source: "video" });
      recordDecision(guardDecision);
      if (!guardDecision.allow || guardDecision.action === "block") {
        setError(guardDecision.userMessage);
        return;
      }
    }

    abortRef.current?.abort();
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);

    setLoading(true);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    patch({
      generationProgress: "Submitting request...",
      queueId: null,
      status: null,
      videoUrl: "",
      downloadUrl: null,
    });

    try {
      const payload: QueueVideoRequest = {
        model: state.selectedVideoModel,
      };

      if (inputs.includes("prompt") && draft.prompt.trim()) payload.prompt = draft.prompt;
      if (inputs.includes("negative_prompt") && draft.negative.trim()) payload.negative_prompt = draft.negative;
      if (inputs.includes("aspect_ratio")) payload.aspect_ratio = draft.aspectRatio;
      if (inputs.includes("duration")) payload.duration = draft.duration;
      if (inputs.includes("resolution")) payload.resolution = draft.resolution;
      if (inputs.includes("upscale_factor")) payload.upscale_factor = draft.upscaleFactor;
      if (inputs.includes("audio")) payload.audio = draft.audio;
      if (inputs.includes("image_url") && draft.imageUrl.trim()) payload.image_url = draft.imageUrl;
      if (inputs.includes("video_url") && draft.sourceVideoUrl.trim()) payload.video_url = draft.sourceVideoUrl;

      const res = await queueVideo(payload, { signal, dispatch });

      patch({
        queueId: res.queue_id,
        downloadUrl: res.download_url || null,
        generationProgress: "Waiting in queue...",
        status: "PROCESSING",
      });

      pollTimerRef.current = setTimeout(
        () => void pollStatus(res.queue_id, state.selectedVideoModel, signal, res.download_url || null),
        3000
      );
    } catch (err: unknown) {
      if (signal.aborted) return;
      const errorObject = err as { name?: string; message?: string };
      if (errorObject.name !== "AbortError") {
        setError(errorObject.message || "Video generation failed to queue.");
      }
      setLoading(false);
      patch({ generationProgress: "", status: null });
    }
  }

  function cancel() {
    abortRef.current?.abort();
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setLoading(false);
    patch({ generationProgress: "", status: "CANCELLED" });
    setSuccess("Generation cancelled.");
  }

  function handleDownload() {
    const a = document.createElement("a");

    if (draft.videoUrl) {
      a.href = draft.videoUrl;
      a.download = `venice-video-${Date.now()}.mp4`;
    } else if (draft.downloadUrl) {
      a.href = draft.downloadUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
    } else {
      return;
    }

    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <GenerationView
      controls={
        <VideoGenerationForm
          state={state}
          dispatch={dispatch}
          draft={draft}
          loading={loading}
          error={error}
          success={success}
          promptTouched={promptTouched}
          setPromptTouched={setPromptTouched}
          onGenerate={generate}
          onCancel={cancel}
        />
      }
      output={
        <div className="flex flex-col gap-4">
          <VideoGenerationPreview draft={draft} />

          {(draft.videoUrl || draft.downloadUrl) && !loading && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 text-sm font-medium text-text-primary shadow-sm transition-all duration-200 hover:border-accent hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-accent"
              >
                Download Generated Video
              </button>
            </div>
          )}
        </div>
      }
    />
  );
}
