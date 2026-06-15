import { useId, useState } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { useModels } from '../../hooks/use-models'
import { selectHasVeniceKey, useAuthStore } from '../../stores/auth-store'
import { useMusic } from '../../hooks/use-music'
import { Label, TextArea, PrimaryButton, ErrorText, ExamplePrompts } from '../ui/shared'
import { GenerationView } from '../ui/generation-view'
import { cn } from '../../lib/utils'
import type { MusicQueueRequest } from '../../types/venice'
import { getPromptStartersForCategory } from '../../services/promptStarterService'

// Model capabilities
interface MusicModelConfig {
  lyrics: boolean
  instrumental: boolean
  voice: boolean
  duration: boolean
}

const MODEL_CONFIGS: Record<string, MusicModelConfig> = {
  'ace-step-1.5': { lyrics: true, instrumental: true, voice: false, duration: true },
  'elevenlabs-music': { lyrics: true, instrumental: true, voice: true, duration: false },
  'minimax-music-2.0': { lyrics: true, instrumental: true, voice: false, duration: false },
  'stable-audio-2.5': { lyrics: false, instrumental: false, voice: false, duration: true },
  'elevenlabs-sound-effects': { lyrics: false, instrumental: false, voice: false, duration: true },
  'mmaudio-v2': { lyrics: false, instrumental: false, voice: false, duration: true },
}

function getConfig(modelId: string): MusicModelConfig {
  const key = Object.keys(MODEL_CONFIGS).find((k) => modelId.toLowerCase().includes(k))
  return key ? MODEL_CONFIGS[key] : { lyrics: false, instrumental: false, voice: false, duration: true }
}

export function MusicView() {
  const promptId = useId()
  const lyricsId = useId()
  const hasVeniceKey = useAuthStore(selectHasVeniceKey)
  const selectedModel = useSettingsStore((s) => s.selectedModels.music)
  const { data: models } = useModels('music')
  const model = selectedModel || models?.[0]?.id || ''
  const config = getConfig(model)

  const [prompt, setPrompt] = useState('')
  const [starters, setStarters] = useState<string[]>(() => getPromptStartersForCategory('music', 4))
  const [lyrics, setLyrics] = useState('')
  const [duration, setDuration] = useState(30)
  const [instrumental, setInstrumental] = useState(false)

  const { queue, isQueueing, status, audioUrl, error, reset, cancel, elapsedMs } = useMusic()
  const isProcessing = status === 'queued' || status === 'processing'

  const handleGenerate = () => {
    if (!prompt.trim()) return
    const req: MusicQueueRequest = {
      model,
      prompt: prompt.trim(),
    }
    if (config.lyrics && lyrics.trim()) req.lyrics_prompt = lyrics.trim()
    if (config.duration) req.duration_seconds = duration
    if (config.instrumental && instrumental) req.force_instrumental = true
    queue(req)
  }

  const controls = (
    <>
      <div>
        <Label htmlFor={promptId}>Prompt</Label>
        <TextArea id={promptId} value={prompt} onChange={setPrompt} placeholder="An upbeat electronic track with a driving bassline and ethereal synths…" rows={4} />
      </div>

      {config.lyrics && (
        <div>
          <Label htmlFor={lyricsId}>Lyrics</Label>
          <TextArea id={lyricsId} value={lyrics} onChange={setLyrics} placeholder="Optional lyrics or vocal direction…" rows={3} />
        </div>
      )}

      {config.duration && (
        <div>
          <Label hint={`${duration}s`}>Duration</Label>
          <input type="range" min={5} max={120} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full" />
        </div>
      )}

      {config.instrumental && (
        <div className="flex items-center justify-between">
          <Label>Instrumental only</Label>
          <button
            onClick={() => setInstrumental(!instrumental)}
            aria-pressed={instrumental}
            className={cn('w-9 h-5 rounded-full transition-colors relative', instrumental ? 'bg-[var(--color-accent)]' : 'bg-surface-elevated')}
          >
            <div className={cn('absolute top-[2px] w-[16px] h-[16px] rounded-full bg-accent-fg transition-all', instrumental ? 'left-[20px]' : 'left-[2px]')} />
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        {config.lyrics && <Tag>Lyrics</Tag>}
        {config.instrumental && <Tag>Instrumental</Tag>}
        {config.voice && <Tag>Voice</Tag>}
        {config.duration && <Tag>Custom Duration</Tag>}
      </div>

      <PrimaryButton
        onClick={handleGenerate}
        disabled={!prompt.trim() || !hasVeniceKey || isQueueing || isProcessing}
        loading={isQueueing || isProcessing}
        size="lg"
      >
        {isProcessing ? (status === 'queued' ? 'Queued…' : 'Generating…') : 'Generate Music'}
      </PrimaryButton>
      {error && (
        <div className="flex items-center justify-between gap-2">
          <ErrorText>{error}</ErrorText>
          <button onClick={reset} className="text-[13px] text-text-secondary hover:text-text-primary underline underline-offset-2 shrink-0 transition-colors">Reset</button>
        </div>
      )}
    </>
  )

  const output = (
    <div className="flex flex-col h-full">
        {audioUrl ? (
          <div className="animate-fade-in flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <Label>Output</Label>
              <a href={audioUrl} download="venice-music.mp3" target="_blank" rel="noopener noreferrer" className="text-[14px] text-text-muted hover:text-text-muted transition-colors flex items-center gap-1.5">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                Download
              </a>
            </div>
            <audio controls src={audioUrl} className="w-full" />
            <div className="bg-surface-elevated border border-border rounded-lg p-4">
              <p className="text-[15px] text-text-muted leading-relaxed">{prompt}</p>
              {lyrics && <p className="text-[14px] text-text-muted mt-2 italic">{lyrics}</p>}
            </div>
            <button onClick={reset} className="self-start text-[14px] text-text-muted hover:text-text-muted transition-colors">Generate another</button>
          </div>
        ) : (
          <div className="flex items-center justify-center flex-1 text-text-muted text-[15px]">
            {isProcessing ? (
              <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
                <div className="w-7 h-7 border border-border border-t-accent rounded-full animate-spin" />
                <span className="text-text-secondary text-center">
                  {status === 'queued' ? 'Queued — waiting for a slot' : 'Composing your track'}
                  {elapsedMs > 0 && (
                    <span className="block text-[12px] text-text-muted font-mono mt-1">
                      {formatElapsedMusic(elapsedMs)} · typically 20s–90s
                    </span>
                  )}
                </span>
                <button
                  onClick={cancel}
                  className="text-[13px] text-text-muted hover:text-text-secondary underline underline-offset-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : !prompt ? (
              <ExamplePrompts
                items={starters}
                onPick={setPrompt}
                onShuffle={() => setStarters(getPromptStartersForCategory('music', 4))}
              />
            ) : (
              <span>Press Generate to create your track</span>
            )}
          </div>
        )}
    </div>
  )

  return <GenerationView controls={controls} output={output} />
}

// MUSIC_EXAMPLES migrated to dynamic prompt starters

function formatElapsedMusic(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[12px] text-text-secondary bg-surface-elevated border border-border rounded px-1.5 py-0.5">
      {children}
    </span>
  )
}
