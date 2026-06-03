// Code Owner: fayeblade (@spearchucker667)
// Video generation preview component.
import React from "react";
import { ModuleProps, VideoDraft } from "../types/app";

interface VideoGenerationPreviewProps extends ModuleProps {
  draft: VideoDraft;
}

export function VideoGenerationPreview({
  draft,
}: VideoGenerationPreviewProps) {
  return (
    <div className="space-y-3">
      <div className="flex min-h-[300px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface">
        {draft.generationProgress ? (
          <div className="flex flex-col items-center gap-3 p-6">
            <div className="text-sm text-text-secondary">{draft.generationProgress}</div>
            <div className="h-1.5 w-48 overflow-hidden rounded-full bg-surface-elevated">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-accent to-accent-hover" />
            </div>
            {draft.queueId && (
              <div className="text-xs text-text-muted mt-2">
                Queue ID: <span className="font-mono text-[10px] bg-surface-elevated px-1 py-0.5 rounded">{draft.queueId}</span>
              </div>
            )}
            {draft.status && (
              <div className="text-xs font-semibold text-accent/80 uppercase tracking-widest mt-1">
                Status: {draft.status}
              </div>
            )}
          </div>
        ) : draft.videoUrl ? (
          <video
            src={draft.videoUrl}
            controls
            autoPlay
            loop
            className="w-full max-h-[500px] object-contain rounded-xl"
          />
        ) : draft.downloadUrl ? (
           <div className="flex flex-col items-center gap-4 p-6 text-center">
             <div className="h-16 w-16 rounded-full bg-ok/10 text-ok grid place-items-center">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
             </div>
             <p className="text-text-primary">Video generation completed.</p>
             <a 
               href={draft.downloadUrl} 
               target="_blank" 
               rel="noopener noreferrer" 
               className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-border bg-surface-elevated px-4 text-sm font-medium text-text-primary transition-all duration-200 hover:border-accent hover:text-accent"
             >
               Download Video
             </a>
           </div>
        ) : (
          <div className="p-12 text-sm text-text-muted">Generated video preview</div>
        )}
      </div>
      <div className="text-xs text-text-muted">
        Prompt and controls persist when switching menus. Videos generation runs asynchronously via the queue.
      </div>
    </div>
  );
}
