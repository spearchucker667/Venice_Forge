// Code Owner: fayeblade (@spearchucker667)
// Video generation module — orchestrates params, preview, and polling.
import React, { useState, useRef, useEffect, useCallback } from "react";
import { queueVideoGeneration, retrieveVideoGeneration, QueueVideoRequest } from "../services/videoGenerationService";
import { assessChildExploitationSafety, recordDecision } from "../shared/safety";
import { VideoGenerationForm } from "../components/VideoGenerationForm";
import { VideoGenerationPreview } from "../components/VideoGenerationPreview";
import { ModuleProps, VideoDraft } from "../types/app";

export function VideoModule({ state, dispatch }: ModuleProps) {
  const draft = state.videoDraft;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patch = useCallback((updates: Partial<VideoDraft>) => {
    dispatch({ type: "SET_VIDEO_DRAFT", patch: updates });
  }, [dispatch]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
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
        setSuccess("Video generation completed!");
        
        if (res.blob) {
          const url = URL.createObjectURL(res.blob);
          patch({ 
            generationProgress: "", 
            status: "COMPLETED",
            videoUrl: url
          });
        } else {
          // If the API provided a download URL instead of raw data in the response,
          // it would be in the original queue response, but if we need it here, we'd handle it.
          // For now, clear progress.
          patch({ generationProgress: "", status: "COMPLETED" });
        }
        return; // Done!
      } else {
        // PROCESSING or other
        patch({ status: res.status });
        // Poll again in 5 seconds
        if (!signal.aborted) {
          pollTimerRef.current = setTimeout(() => pollStatus(queueId, model, signal), 5000);
        }
      }
    } catch (err: unknown) {
      if (signal.aborted) return;
      const error = err as { name?: string; message?: string };
      setError(error.message || "Failed to retrieve video status.");
      setLoading(false);
      patch({ generationProgress: "", status: "ERROR" });
    }
  }

  async function generate() {
    setPromptTouched(true);
    if (!draft.prompt.trim() || loading) return;
    if (state.usingFallbackModels) {
      setError("Fallback models are active. Please refresh the model catalog before sending requests.");
      return;
    }

    setError("");
    setSuccess("");
    
    // Advisory safety check — records audit decision before blocking.
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
      downloadUrl: null
    });

    try {
      const payload: QueueVideoRequest = {
        model: state.selectedVideoModel,
        prompt: draft.prompt,
        negative_prompt: draft.negative || undefined,
        aspect_ratio: draft.aspectRatio,
        duration: draft.duration,
        resolution: draft.resolution,
        audio: draft.audio
      };

      const res = await queueVideoGeneration(payload, { signal, dispatch });
      
      patch({ 
        queueId: res.queue_id,
        downloadUrl: res.download_url || null,
        generationProgress: "Waiting in queue...",
        status: "PROCESSING"
      });

      // Start polling
      pollTimerRef.current = setTimeout(() => pollStatus(res.queue_id, state.selectedVideoModel, signal), 3000);

    } catch (err: unknown) {
      if (signal.aborted) return;
      const error = err as { name?: string; message?: string };
      if (error.name !== "AbortError") {
        setError(error.message || "Video generation failed to queue.");
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
    if (draft.videoUrl) {
      const a = document.createElement("a");
      a.href = draft.videoUrl;
      a.download = `venice-video-${Date.now()}.mp4`;
      a.click();
    } else if (draft.downloadUrl) {
      window.open(draft.downloadUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <section className="flex flex-col h-full bg-bg">
      <div className="flex-none p-6 border-b border-border/40 bg-bg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-display font-semibold tracking-tight text-text-primary">Video Studio</h2>
            <div className="text-sm text-text-secondary mt-1">Queue and generate AI videos asynchronously.</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
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
          <VideoGenerationPreview state={state} dispatch={dispatch} draft={draft} />
          
          {(draft.videoUrl || draft.downloadUrl) && !loading && (
            <div className="flex justify-center">
              <button
                onClick={handleDownload}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-6 text-sm font-medium text-text-primary shadow-sm transition-all duration-200 hover:border-accent hover:bg-surface-elevated focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                Download Generated Video
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
