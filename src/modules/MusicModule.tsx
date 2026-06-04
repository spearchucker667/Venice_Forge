import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ModuleProps } from '../types/app';
import { GenerationView } from '../components/ui/generation-view';
import { veniceFetch } from '../services/veniceClient';

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 120; // ~6 minutes

interface MusicModelConfig {
  lyrics: boolean;
  instrumental: boolean;
  voice: boolean;
  duration: boolean;
}

const MODEL_CONFIGS: Record<string, MusicModelConfig> = {
  'ace-step-1.5': { lyrics: true, instrumental: true, voice: false, duration: true },
  'elevenlabs-music': { lyrics: true, instrumental: true, voice: true, duration: false },
  'minimax-music-2.0': { lyrics: true, instrumental: true, voice: false, duration: false },
  'stable-audio-2.5': { lyrics: false, instrumental: false, voice: false, duration: true },
  'elevenlabs-sound-effects': { lyrics: false, instrumental: false, voice: false, duration: true },
  'mmaudio-v2': { lyrics: false, instrumental: false, voice: false, duration: true },
};

function getConfig(modelId: string): MusicModelConfig {
  const key = Object.keys(MODEL_CONFIGS).find((k) => modelId.toLowerCase().includes(k));
  return key ? MODEL_CONFIGS[key] : { lyrics: false, instrumental: false, voice: false, duration: true };
}

const MUSIC_EXAMPLES = [
  'Lo-fi hip-hop beat with vinyl crackle and rain — 80 bpm, mellow',
  'Cinematic orchestral build — slow strings rising into triumphant brass',
  'Synthwave with retro arpeggios, warm pads, gated reverb drums — 105 bpm',
  'Acoustic folk fingerpicking, soft female vocals, intimate room sound',
];

function formatElapsedMusic(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[12px] text-white/55 bg-white/[0.04] border border-white/[0.06] rounded px-1.5 py-0.5">
      {children}
    </span>
  );
}

export function MusicModule({ state, dispatch }: ModuleProps) {
  const [prompt, setPrompt] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [duration, setDuration] = useState(30);
  const [instrumental, setInstrumental] = useState(false);

  const [status, setStatus] = useState<'idle' | 'queued' | 'processing' | 'completed' | 'failed'>('idle');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const pollRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const tickRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const requestIdRef = useRef<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const cancelledRef = useRef(false);

  const musicModels = state.models.music || [];
  const model = musicModels[0]?.id || 'ace-step-1.5';
  const config = getConfig(model);

  const isQueueing = status === 'queued' && !requestIdRef.current; // eslint-disable-line @typescript-eslint/no-unused-vars
  const isProcessing = status === 'queued' || status === 'processing';

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = undefined; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = undefined; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback(() => {
    attemptsRef.current = 0;
    startedAtRef.current = Date.now();
    setElapsedMs(0);

    tickRef.current = setInterval(() => {
      if (startedAtRef.current) setElapsedMs(Date.now() - startedAtRef.current);
    }, 1000);

    pollRef.current = setInterval(async () => {
      if (cancelledRef.current) return;
      attemptsRef.current += 1;
      
      if (attemptsRef.current > MAX_ATTEMPTS) {
        stopPolling();
        setError('Generation took too long. Cancel and try again.');
        setStatus('failed');
        return;
      }
      
      try {
        const result = await veniceFetch<any>('/audio/retrieve', { // eslint-disable-line @typescript-eslint/no-explicit-any
          method: 'POST',
          body: { id: requestIdRef.current },
          dispatch
        });
        
        if (!result.data || result.data.error) {
          throw new Error(result.data?.error?.message || result.data?.error || 'Polling failed');
        }

        const s = (result.data.status || '').toLowerCase() as 'queued' | 'processing' | 'completed' | 'failed';
        setStatus(s);
        
        if (s === 'completed' && result.data.audio_url) {
          setAudioUrl(result.data.audio_url);
          stopPolling();
        } else if (s === 'failed') {
          setError(result.data.error || 'Music generation failed');
          stopPolling();
        }
      } catch (err: unknown) {
        if (attemptsRef.current >= MAX_ATTEMPTS) {
          const e = err as { message?: string };
          setError(e.message || 'Polling failed');
          stopPolling();
        }
      }
    }, POLL_INTERVAL_MS);
  }, [dispatch, stopPolling]);

  const queue = async () => {
    if (!prompt.trim()) return;
    cancelledRef.current = false;
    setStatus('queued');
    setAudioUrl(null);
    setError(null);
    requestIdRef.current = null;

    try {
      const body: Record<string, unknown> = {
        model,
        prompt: prompt.trim(),
      };
      if (config.lyrics && lyrics.trim()) body.lyrics_prompt = lyrics.trim();
      if (config.duration) body.duration_seconds = duration;
      if (config.instrumental && instrumental) body.force_instrumental = true;

      const result = await veniceFetch<any>('/audio/queue', { // eslint-disable-line @typescript-eslint/no-explicit-any
        method: 'POST',
        body,
        dispatch
      });

      if (!result.data || result.data.error) {
        throw new Error(result.data?.error?.message || result.data?.error || 'Queue failed');
      }

      requestIdRef.current = result.data.queue_id || result.data.id;
      startPolling();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Queue failed');
      setStatus('failed');
    }
  };

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    stopPolling();
    setStatus('idle');
    setError(null);
    requestIdRef.current = null;
    startedAtRef.current = null;
    setElapsedMs(0);
  }, [stopPolling]);

  const reset = useCallback(() => {
    cancel();
    setAudioUrl(null);
  }, [cancel]);

  const controls = (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-2">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="An upbeat electronic track with a driving bassline and ethereal synths…"
          rows={4}
          className="w-full rounded-lg border border-border/50 bg-[#0d0d11] p-3 text-sm text-white/90 placeholder:text-white/25 outline-none focus:border-white/[0.22] transition-colors resize-none leading-relaxed"
        />
      </div>

      {config.lyrics && (
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Lyrics</label>
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder="Optional lyrics or vocal direction…"
            rows={3}
            className="w-full rounded-lg border border-border/50 bg-[#0d0d11] p-3 text-sm text-white/90 placeholder:text-white/25 outline-none focus:border-white/[0.22] transition-colors resize-none leading-relaxed"
          />
        </div>
      )}

      {config.duration && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-text-secondary">Duration</label>
            <span className="text-[13px] text-white/40">{duration}s</span>
          </div>
          <input
            type="range"
            min={5}
            max={120}
            step={5}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            className="w-full accent-white"
          />
        </div>
      )}

      {config.instrumental && (
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-text-secondary">Instrumental only</label>
          <button
            onClick={() => setInstrumental(!instrumental)}
            aria-pressed={instrumental}
            className={`w-9 h-5 rounded-full transition-colors relative ${instrumental ? 'bg-white' : 'bg-white/[0.1]'}`}
          >
            <div className={`absolute top-[2px] w-[16px] h-[16px] rounded-full bg-black transition-all ${instrumental ? 'left-[20px]' : 'left-[2px]'}`} />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {config.lyrics && <Tag>Lyrics</Tag>}
        {config.instrumental && <Tag>Instrumental</Tag>}
        {config.voice && <Tag>Voice</Tag>}
        {config.duration && <Tag>Custom Duration</Tag>}
      </div>

      <button
        onClick={queue}
        disabled={!prompt.trim() || isProcessing}
        className="w-full rounded-lg font-medium py-2.5 text-[14px] bg-white text-black hover:bg-white/90 active:scale-[0.99] shadow-sm transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isProcessing ? (status === 'queued' ? 'Queued…' : 'Generating…') : 'Generate Music'}
      </button>

      {error && (
        <div className="flex flex-col gap-2">
          <div className="text-red-400 text-sm">{error}</div>
          <button onClick={reset} className="text-[13px] text-white/40 hover:text-white transition-colors underline underline-offset-2 self-start">
            Reset
          </button>
        </div>
      )}
    </div>
  );

  const output = (
    <div className="flex flex-col h-full">
      {audioUrl ? (
        <div className="animate-fade-in flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-white/[0.05] pb-4">
            <span className="text-sm font-medium text-text-secondary">Output Audio</span>
            <a
              href={audioUrl}
              download="venice-music.mp3"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[14px] text-white/40 hover:text-white transition-colors flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Download
            </a>
          </div>
          <audio controls src={audioUrl} className="w-full rounded-md shadow-sm" />
          
          <div className="bg-[#0c0c10] border border-white/[0.05] rounded-xl p-5 shadow-sm">
            <p className="text-[15px] text-white/60 leading-relaxed font-medium">{prompt}</p>
            {lyrics && (
              <div className="mt-4 pt-4 border-t border-white/[0.05]">
                <p className="text-[13px] uppercase tracking-wider text-white/30 font-semibold mb-2">Lyrics</p>
                <p className="text-[14px] text-white/40 italic whitespace-pre-wrap">{lyrics}</p>
              </div>
            )}
          </div>
          
          <button onClick={reset} className="self-start text-[14px] text-white/40 hover:text-white transition-colors underline underline-offset-2 mt-2">
            Generate another track
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center flex-1 text-white/30 text-[15px]">
          {isProcessing ? (
            <div className="flex flex-col items-center gap-4 animate-fade-in">
              <div className="w-8 h-8 border-[3px] border-white/10 border-t-white/60 rounded-full animate-spin" />
              <div className="flex flex-col items-center gap-1">
                <span className="text-white/80 font-medium text-[15px]">
                  {status === 'queued' ? 'Queued — waiting for a slot' : 'Composing your track'}
                </span>
                {elapsedMs > 0 && (
                  <span className="block text-[13px] text-white/40 font-mono tracking-wide">
                    {formatElapsedMusic(elapsedMs)} <span className="mx-1 text-white/20">·</span> typically 20s–90s
                  </span>
                )}
              </div>
              <button
                onClick={cancel}
                className="mt-2 text-[13px] text-white/40 hover:text-white transition-colors underline underline-offset-2"
              >
                Cancel Generation
              </button>
            </div>
          ) : !prompt ? (
            <div className="max-w-md w-full flex flex-col gap-2">
              <div className="text-[12px] uppercase tracking-[0.08em] text-white/35 font-medium text-left mb-2">Try one of these</div>
              {MUSIC_EXAMPLES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrompt(p)}
                  className="text-left px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04] transition-all text-[14px] text-white/70 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/40 leading-relaxed shadow-sm"
                >
                  {p}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/20 mb-2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>
              <span className="text-white/50 text-[15px]">Press Generate to create your track</span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  return <GenerationView controls={controls} output={output} />;
}
