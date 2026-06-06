import { useState, useRef } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { useModels } from '../../hooks/use-models'
import { selectHasVeniceKey, useAuthStore } from '../../stores/auth-store'
import { useTTS, useTranscription } from '../../hooks/use-audio'
import { useBlobUrl } from '../../hooks/use-blob-url'
import { Select } from '../ui/select'
import { Label, TextArea, PrimaryButton, ErrorText, EmptyState, ExamplePrompts } from '../ui/shared'
import { GenerationView } from '../ui/generation-view'
import { cn } from '../../lib/utils'
import { toast } from '../../stores/toast-store'
import { getPromptStartersForCategory } from '../../services/promptStarterService'

const VOICES = [
  // American Female
  'af_alloy', 'af_aoede', 'af_bella', 'af_heart', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
  // American Male
  'am_adam', 'am_echo', 'am_eric', 'am_fable', 'am_liam', 'am_michael', 'am_onyx',
  // British Female
  'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily',
  // British Male
  'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
  // Chinese
  'zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxuan', 'zf_xiaoyan', 'zf_xiaoyi',
  'zm_yunjian', 'zm_yunxi', 'zm_yunxia', 'zm_yunyang',
  // Japanese
  'jf_alpha', 'jf_gongitsune', 'jf_nezumi', 'jf_tebukuro',
  'jm_kumo',
  // French
  'ff_siwis',
  // Hindi
  'hf_alpha', 'hf_beta',
  'hm_omega', 'hm_psi',
  // Italian
  'if_sara',
  'im_nicola',
  // Portuguese (Brazil)
  'pf_dora',
  'pm_alex', 'pm_santa',
  // Spanish
  'ef_dora',
  'em_alex', 'em_santa',
]
const FORMATS = ['mp3', 'opus', 'aac', 'flac', 'wav'] as const

export function AudioView() {
  const hasVeniceKey = useAuthStore(selectHasVeniceKey)
  const selectedModel = useSettingsStore((s) => s.selectedModels.audio)
  const { data: models } = useModels('tts')
  const model = selectedModel || models?.[0]?.id || 'tts-kokoro'

  const [tab, setTab] = useState<'tts' | 'transcribe'>('tts')
  const [text, setText] = useState('')
  const [starters, setStarters] = useState<string[]>(() => getPromptStartersForCategory('audio', 3))
  const [voice, setVoice] = useState('af_heart')
  const [speed, setSpeed] = useState(1)
  const [format, setFormat] = useState<string>('mp3')
  const [audioUrl, setAudioBlob] = useBlobUrl()
  const [file, setFile] = useState<File | null>(null)
  const [transcript, setTranscript] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const tts = useTTS()
  const transcription = useTranscription()

  const voiceOptions = VOICES.map((v) => {
    const prefix = v.slice(0, 2)
    const langMap: Record<string, { flag: string; gender: string; lang: string }> = {
      af: { flag: '🇺🇸', gender: 'F', lang: 'American English (Female)' },
      am: { flag: '🇺🇸', gender: 'M', lang: 'American English (Male)' },
      bf: { flag: '🇬🇧', gender: 'F', lang: 'British English (Female)' },
      bm: { flag: '🇬🇧', gender: 'M', lang: 'British English (Male)' },
      zf: { flag: '🇨🇳', gender: 'F', lang: 'Mandarin (Female)' },
      zm: { flag: '🇨🇳', gender: 'M', lang: 'Mandarin (Male)' },
      jf: { flag: '🇯🇵', gender: 'F', lang: 'Japanese (Female)' },
      jm: { flag: '🇯🇵', gender: 'M', lang: 'Japanese (Male)' },
      ff: { flag: '🇫🇷', gender: 'F', lang: 'French (Female)' },
      hf: { flag: '🇮🇳', gender: 'F', lang: 'Hindi (Female)' },
      hm: { flag: '🇮🇳', gender: 'M', lang: 'Hindi (Male)' },
      if: { flag: '🇮🇹', gender: 'F', lang: 'Italian (Female)' },
      im: { flag: '🇮🇹', gender: 'M', lang: 'Italian (Male)' },
      pf: { flag: '🇧🇷', gender: 'F', lang: 'Portuguese (Female)' },
      pm: { flag: '🇧🇷', gender: 'M', lang: 'Portuguese (Male)' },
      ef: { flag: '🇪🇸', gender: 'F', lang: 'Spanish (Female)' },
      em: { flag: '🇪🇸', gender: 'M', lang: 'Spanish (Male)' },
    }
    const meta = langMap[prefix]
    const name = v.slice(3)
    const display = meta ? `${meta.flag} ${meta.gender} · ${name} (${meta.lang})` : v
    return { value: v, label: display }
  })
  const formatOptions = FORMATS.map((f) => ({ value: f, label: f.toUpperCase() }))

  const handleTTS = () => {
    if (!text.trim()) return
    setAudioBlob(null)
    tts.mutate(
      { model, input: text.trim(), voice, speed, response_format: format as typeof FORMATS[number] },
      {
        onSuccess: (blob) => setAudioBlob(blob),
        onError: (err) => toast.fromError(err, 'TTS failed'),
      },
    )
  }

  const controls = (
    <>
      <div className="flex gap-px bg-white/[0.03] rounded-lg p-0.5 border border-white/[0.05]">
        {(['tts', 'transcribe'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn(
            'flex-1 px-3 py-2 text-[13px] font-medium rounded-[7px] transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]',
            tab === t ? 'bg-white text-black shadow-sm' : 'text-white/55 hover:text-white/85',
          )}>
            {t === 'tts' ? 'Text to Speech' : 'Transcribe'}
          </button>
        ))}
      </div>

      {tab === 'tts' ? (
        <>
          <div>
            <Label hint={`${text.length}/4096`}>Text</Label>
            <TextArea value={text} onChange={setText} placeholder="Enter text to convert to speech…" rows={5} />
          </div>
          <div><Label>Voice</Label><Select value={voice} onChange={setVoice} options={voiceOptions} searchable /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Format</Label><Select value={format} onChange={setFormat} options={formatOptions} /></div>
            <div>
              <Label hint={`${speed}×`}>Speed</Label>
              <input type="range" min={0.25} max={4} step={0.25} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} className="w-full" />
            </div>
          </div>
          <PrimaryButton onClick={handleTTS} disabled={!text.trim() || !hasVeniceKey} loading={tts.isPending} size="lg">Generate Speech</PrimaryButton>
          {tts.error && <ErrorText>{tts.error.message}</ErrorText>}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full border border-dashed border-white/[0.1] hover:border-white/[0.22] hover:bg-white/[0.02] rounded-xl p-8 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
          >
            <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="mx-auto mb-2 text-white/40"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
            <p className="text-[14px] text-white/65">{file ? file.name : 'Click to select audio file'}</p>
          </button>
          <PrimaryButton onClick={() => { if (file) transcription.mutate(file, { onSuccess: (d) => setTranscript(d.text), onError: (err) => toast.fromError(err, 'Transcription failed') }) }} disabled={!file || !hasVeniceKey} loading={transcription.isPending} size="lg">
            Transcribe
          </PrimaryButton>
          {transcription.error && <ErrorText>{transcription.error.message}</ErrorText>}
        </>
      )}
    </>
  )

  const output = (
    <div className="flex flex-col min-h-full">
        {tab === 'tts' ? (
          audioUrl ? (
            <div className="flex flex-col gap-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <Label>Output</Label>
                <a href={audioUrl} download={`venice-speech.${format}`} className="text-[14px] text-white/20 hover:text-white/40 transition-colors flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                  Download
                </a>
              </div>
              <audio controls src={audioUrl} className="w-full" />
              <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4">
                <p className="text-[15px] text-white/30 leading-relaxed">{text}</p>
              </div>
            </div>
          ) : !text ? (
            <div className="flex items-center justify-center h-full">
              <ExamplePrompts
                items={starters}
                onPick={setText}
                onShuffle={() => setStarters(getPromptStartersForCategory('audio', 3))}
              />
            </div>
          ) : (
            <EmptyState>Press Generate to synthesize speech</EmptyState>
          )
        ) : (
          transcript ? (
            <div className="flex flex-col gap-3 animate-fade-in">
              <Label>Transcript</Label>
              <div className="bg-surface border border-white/[0.06] rounded-xl p-6 text-[15px] text-white/85 whitespace-pre-wrap leading-relaxed">
                {transcript}
              </div>
            </div>
          ) : (
            <EmptyState>Transcript appears here</EmptyState>
          )
        )}
    </div>
  )

  return <GenerationView controls={controls} output={output} />
}
