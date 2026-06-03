import React, { useState } from "react";
import { ModuleProps } from "../types/app";

export function AudioModule({ dispatch }: ModuleProps) {
  const [prompt, setPrompt] = useState("");

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-surface p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-display font-bold text-text-primary mb-2">Audio Studio</h1>
        <p className="text-sm text-text-secondary">
          Generate music, sound effects, and text-to-speech audio using Venice's multimodal capabilities.
        </p>
      </div>

      <div className="max-w-3xl space-y-6">
        <div className="rounded-xl border border-border/40 bg-surface-elevated p-5">
          <h2 className="text-sm font-semibold text-text-primary mb-4 uppercase tracking-wider">Audio Generation</h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="audio-prompt" className="block text-sm font-medium text-text-secondary mb-2">
                Prompt
              </label>
              <textarea
                id="audio-prompt"
                className="w-full rounded-lg border border-border/50 bg-bg p-3 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                placeholder="Describe the audio or music you want to generate..."
                rows={4}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <button
                className="inline-flex items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
                onClick={() => dispatch({ type: "ADD_TOAST", toast: { id: Date.now().toString(), message: "Audio generation coming soon", type: "info" } })}
              >
                Generate Audio
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
