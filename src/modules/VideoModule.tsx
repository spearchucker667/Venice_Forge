// Code Owner: fayeblade (@spearchucker667)
// Video generation module — orchestrates params, preview, and polling.
import React, { useState, useRef, useEffect, useCallback } from "react";
import { queueVideoGeneration, retrieveVideoGeneration, type QueueVideoRequest } from "../services/videoGenerationService";
import { assessChildExploitationSafety, recordDecision } from "../shared/safety";
import { VideoGenerationForm } from "../components/VideoGenerationForm";
import { VideoGenerationPreview } from "../components/VideoGenerationPreview";
import type { ModuleProps, VideoDraft } from "../types/app";

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

  async function pollStatus(queueId: string, model: string, signal: AbortSignal) {
    if (signal.aborted) return;

    try {
      const res = await retrieveVideoGeneration(model, queueId, { signal, dispatch });
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
          const url = URL.createObjectURL(res.blob);
          videoObjectUrlRef.current = url;
          patch({
            generationProgress: "",
            status: "COMPLETED",
            videoUrl: url,
          });
        } else {
          patch({
            generationProgress: "",
            status: "COMPLETED",
            downloadUrl: draft.downloadUrl,
          });
        }
        return;
      }

      patch({ status: res.status });
      if (!signal.aborted) {
        pollTimerRef.current = setTimeout(() => void pollStatus(queueId, model, signal), 5000);
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
    const selectedId = state.selectedVideoModel;
    const requiresVideo = /video-to-video|topaz-video-upscale/i.test(selectedId);
    const requiresImage = /image-to-video|reference-to-video/i.test(selectedId);
    if (loading) return;
    if (!requiresVideo && !draft.prompt.trim()) return;
    if (requiresImage && !draft.imageUrl.trim()) {
      setError("This video model requires a source image URL.");
      return;
    }
    if (requiresVideo && !draft.sourceVideoUrl.trim()) {
      setError("This video model requires a source video URL.");
      return;
    }
    if (state.usingFallbackModels) {
      setError("Fallback models are active. Please refresh the model catalog before sending requests.");
      return;
    }
    if (!state.models.video.some((model) => model.id === state.selectedVideoModel)) {
      setError("Selected model is not available in the video model catalog.");
      return;
    }

    setError("");
    setSuccess("");

    const guardText = [draft.prompt, draft.negative].filter((value) => value.trim()).join("\n");
    const guardDecision = assessChildExploitationSafety({ text: guardText, endpoint: "/video/queue", method: "POST", source: "video" });
    recordDecision(guardDecision);
    if (!guardDecision.allow || guardDecision.action === "block") {
      setError(guardDecision.userMessage);
      return;
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
        prompt: draft.prompt,
        negative_prompt: draft.negative || undefined,
        aspect_ratio: draft.aspectRatio,
        duration: draft.duration,
        resolution: requiresVideo ? undefined : draft.resolution,
        audio: draft.audio,
        image_url: draft.imageUrl || undefined,
        video_url: draft.sourceVideoUrl || undefined,
      };

      const res = await queueVideoGeneration(payload, { signal, dispatch });

      patch({
        queueId: res.queue_id,
        downloadUrl: res.download_url || null,
        generationProgress: "Waiting in queue...",
        status: "PROCESSING",
      });

      pollTimerRef.current = setTimeout(() => void pollStatus(res.queue_id, state.selectedVideoModel, signal), 3000);
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
    <section className="flex h-full flex-col bg-bg">
      <div className="flex-none border-b border-border/40 bg-bg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-semibold tracking-tight text-text-primary">Video Studio</h2>
            <div className="mt-1 text-sm text-text-secondary">Queue text-to-video, image-to-video, and video upscaling jobs asynchronously.</div>
          </div>
        </div>
      </div>

      <div className="grid flex-1 grid-cols-1 items-start gap-8 overflow-y-auto p-6 lg:grid-cols-[minmax(320px,520px)_1fr]">
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
      </div>
    </section>
  );
}
