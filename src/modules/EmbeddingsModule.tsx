import React, { useState } from 'react';
import { ModuleProps } from '../types/app';
import { GenerationView } from '../components/ui/generation-view';
import { veniceFetch } from '../services/veniceClient';
import type { ModelInfo } from '../types/venice'; // eslint-disable-line @typescript-eslint/no-unused-vars

const PREVIEW_COUNT = 100;

interface EmbeddingResponse {
  object: string;
  data: Array<{ object: string; index: number; embedding: number[] }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

export function EmbeddingsModule({ state, dispatch }: ModuleProps) {
  const [input, setInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EmbeddingResponse | null>(null);

  // For embeddings, use the first available embeddings model or a default
  const embeddingsModels = state.models.embeddings || [];
  const model = embeddingsModels[0]?.id || 'text-embedding-bge-m3';

  const embedding = data?.data?.[0]?.embedding;
  const dims = embedding?.length ?? 0;
  const displayValues = expanded ? embedding : embedding?.slice(0, PREVIEW_COUNT);

  const handleCopyVector = () => {
    if (embedding) {
      navigator.clipboard.writeText(JSON.stringify(embedding));
      dispatch({ type: 'ADD_TOAST', toast: { id: Date.now().toString(), message: 'Vector copied to clipboard', type: 'info' } });
    }
  };

  const handleGenerate = async () => {
    if (!input.trim()) return;
    setIsPending(true);
    setError(null);
    setExpanded(false);

    try {
      const response = await veniceFetch<any>('/embeddings', { // eslint-disable-line @typescript-eslint/no-explicit-any
        method: 'POST',
        body: { model, input: input.trim() },
        dispatch,
      });
      
      // Safety guard failures usually throw an error from veniceClient
      if (!response.data || response.data.error) {
        throw new Error(response.data?.error?.message || response.data?.error || 'Generation failed');
      }
      
      setData(response.data as EmbeddingResponse);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'An unexpected error occurred');
      dispatch({ type: 'ADD_TOAST', toast: { id: Date.now().toString(), message: e.message || 'Generation failed', type: 'error' } });
    } finally {
      setIsPending(false);
    }
  };

  const controls = (
    <div className="space-y-4">
      <div>
        <label htmlFor="embed-input" className="block text-sm font-medium text-text-secondary mb-2">
          Input text
        </label>
        <textarea
          id="embed-input"
          className="w-full rounded-lg border border-border/50 bg-[#0d0d11] p-3 text-sm text-white/90 placeholder:text-white/25 outline-none focus:border-white/[0.22] transition-colors resize-none leading-relaxed"
          placeholder="Enter text to embed…"
          rows={6}
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </div>
      <button
        className="w-full rounded-lg font-medium py-2 text-[14px] bg-white text-black hover:bg-white/90 active:scale-[0.99] shadow-sm transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={handleGenerate}
        disabled={!input.trim() || isPending}
      >
        {isPending ? 'Generating...' : 'Generate Embeddings'}
      </button>
      {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
    </div>
  );

  const output = (
    <div className="flex flex-col h-full">
      {!data && !input && !isPending ? (
        <div className="flex items-center justify-center h-full">
          <div className="max-w-md w-full flex flex-col gap-2">
            <div className="text-[12px] uppercase tracking-[0.08em] text-white/35 font-medium text-left mb-2">Try one of these</div>
            {[
              'The quick brown fox jumps over the lazy dog.',
              'Embeddings turn text into a vector you can search by meaning.',
              'San Francisco is a city in northern California known for its fog and bridges.',
            ].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setInput(p)}
                className="text-left px-3 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04] transition-all text-[14px] text-white/65 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/40"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      ) : isPending ? (
        <div className="flex items-center justify-center h-full">
          <div className="flex flex-col items-center gap-3">
            <div className="w-7 h-7 border border-white/[0.08] border-t-white/40 rounded-full animate-spin" />
            <span className="text-white/55 text-center text-sm">Generating vector...</span>
          </div>
        </div>
      ) : data && embedding ? (
        <div className="animate-fade-in flex flex-col gap-4">
          <div className="flex items-center gap-6 text-[14px] mb-4">
            <Stat label="Model" value={data.model} />
            <Stat label="Dimensions" value={String(dims)} />
            <Stat label="Tokens" value={String(data.usage.prompt_tokens)} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-text-secondary">Vector ({dims} dimensions)</span>
              <button 
                onClick={handleCopyVector} 
                className="text-[13px] text-white/40 hover:text-white transition-colors"
              >
                Copy JSON
              </button>
            </div>
            <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4 max-h-[calc(100vh-240px)] overflow-y-auto">
              <code className="text-[14px] text-white/40 font-mono break-all leading-loose">
                [{displayValues?.map((n, i) => (
                  <span key={i}>
                    <span className="text-white/70">{n.toFixed(6)}</span>
                    {i < (displayValues.length) - 1 && <span className="text-white/20">, </span>}
                  </span>
                ))}
                {!expanded && dims > PREVIEW_COUNT && <span className="text-white/20">, ...</span>}]
              </code>
            </div>
            {dims > PREVIEW_COUNT && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-[13px] text-white/40 hover:text-white mt-3 transition-colors underline underline-offset-2 block"
              >
                {expanded ? `Show first ${PREVIEW_COUNT}` : `Show all ${dims} values`}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-full text-white/30 text-[14px]">
          Embedding vectors appear here
        </div>
      )}
    </div>
  );

  return <GenerationView controls={controls} output={output} />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-white/30">{label}</span>
      <span className="text-white/80 bg-white/[0.04] border border-white/[0.06] rounded px-2 py-0.5 font-mono text-[13px]">
        {value}
      </span>
    </div>
  );
}
