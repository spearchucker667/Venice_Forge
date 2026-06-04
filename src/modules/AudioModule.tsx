/* eslint-disable */
import React, { useState, useRef, useEffect } from 'react'
import { ModuleProps } from '../types/app'
import { GenerationView } from '../components/ui/generation-view'
import { veniceFetch } from '../services/veniceClient'
import { extractModelName } from '../services/veniceClient'
import { downloadImage as downloadMedia } from '../utils/download'

const AUDIO_EXAMPLES = [
  'Welcome to Venice Forge. The future of voice is here, and it speaks every language.',
  'In a quiet town nestled between two mountains, a small library held a very old book.',
  'Did you know? A single octopus has nine brains — one central, plus one in each arm.',
]

const VOICES = [
  'af_alloy', 'af_aoede', 'af_bella', 'af_heart', 'af_jessica', 'af_kore', 'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
  'am_adam', 'am_echo', 'am_eric', 'am_fable', 'am_liam', 'am_michael', 'am_onyx',
  'bf_alice', 'bf_emma', 'bf_isabella', 'bf_lily',
  'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
  'zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxuan', 'zf_xiaoyan', 'zf_xiaoyi',
  'zm_yunjian', 'zm_yunxi', 'zm_yunxia', 'zm_yunyang',
  'jf_alpha', 'jf_gongitsune', 'jf_nezumi', 'jf_tebukuro',
  'jm_kumo',
  'ff_siwis',
  'hf_alpha', 'hf_beta',
  'hm_omega', 'hm_psi',
  'if_sara',
  'im_nicola',
  'pf_dora',
  'pm_alex', 'pm_santa',
  'ef_dora',
  'em_alex', 'em_santa',
]
const FORMATS = ['mp3', 'opus', 'aac', 'flac', 'wav'] as const

export function AudioModule({ state, dispatch }: ModuleProps) {
  const [tab, setTab] = useState<'tts' | 'transcribe'>('tts')
  const [text, setText] = useState('')
  const [voice, setVoice] = useState('af_heart')
  const [speed, setSpeed] = useState(1)
  const [format, setFormat] = useState<string>('mp3')
  const [audioUrl, setAudioUrl] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [transcript, setTranscript] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)

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

  const handleTTS = async () => {
    if (!text.trim() || loading) return
    setLoading(true)
    setAudioUrl('')
    try {
      const { data } = await veniceFetch('/audio/speech', {
        method: 'POST',
        body: {
          model: 'tts-kokoro',
          input: text,
          voice,
          speed,
          response_format: format,
        },
        dispatch
      })
      if (data && (data as any).dataUrl) {
        setAudioUrl((data as any).dataUrl)
      }
    } catch (e) {
      dispatch({ type: 'ADD_TOAST', toast: { id: Date.now().toString(), type: 'error', message: e instanceof Error ? e.message : 'TTS failed' }})
    } finally {
      setLoading(false)
    }
  }

  const handleTranscribe = async () => {
    if (!file || loading) return
    setLoading(true)
    setTranscript('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('model', 'whisper-1')

      const { data } = await veniceFetch('/audio/transcriptions', {
        method: 'POST',
        body: formData,
        isFormData: true,
        dispatch
      })
      if (data && (data as any).text) {
        setTranscript((data as any).text)
      }
    } catch (e) {
      dispatch({ type: 'ADD_TOAST', toast: { id: Date.now().toString(), type: 'error', message: e instanceof Error ? e.message : 'Transcription failed' }})
    } finally {
      setLoading(false)
    }
  }

  const controls = (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2 p-1 bg-surface-elevated rounded-lg border border-border">
        <button
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === 'tts' ? 'bg-surface-elevated text-text-primary' : 'text-text-tertiary hover:text-text-primary'}`}
          onClick={() => setTab('tts')}
        >
          Text to Speech
        </button>
        <button
          className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === 'transcribe' ? 'bg-surface-elevated text-text-primary' : 'text-text-tertiary hover:text-text-primary'}`}
          onClick={() => setTab('transcribe')}
        >
          Transcribe
        </button>
      </div>

      {tab === 'tts' && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-[13px] font-medium text-text-secondary mb-2">Text</label>
            <textarea
              className="w-full bg-surface-secondary border border-border rounded-lg p-3 text-[14px] outline-none min-h-[160px] resize-none focus:border-white/20 transition-colors"
              placeholder="Enter text to synthesize..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {text === '' && (
              <div className="flex flex-wrap gap-2 mt-3">
                {AUDIO_EXAMPLES.map((ex, i) => (
                  <button key={i} className="text-left text-[12px] px-2.5 py-1.5 rounded-full bg-surface-elevated hover:bg-surface-elevated hover:bg-surface-elevated text-text-tertiary hover:text-text-primary transition-colors border border-border" onClick={() => setText(ex)}>
                    {ex.substring(0, 30)}...
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-[13px] font-medium text-text-secondary mb-1.5">Voice</label>
              <select className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-[14px] outline-none" value={voice} onChange={(e) => setVoice(e.target.value)}>
                {voiceOptions.map((v) => <option key={v.value} value={v.value} className="bg-surface-elevated">{v.label}</option>)}
              </select>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-[13px] font-medium text-text-secondary mb-1.5">Speed ({speed}x)</label>
                <input type="range" className="w-full" min="0.25" max="4.0" step="0.25" value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))} />
              </div>
              <div className="w-24">
                <label className="block text-[13px] font-medium text-text-secondary mb-1.5">Format</label>
                <select className="w-full bg-surface-elevated border border-border rounded-lg px-3 py-2 text-[14px] outline-none" value={format} onChange={(e) => setFormat(e.target.value)}>
                  {FORMATS.map(f => <option key={f} value={f} className="bg-surface-elevated">{f.toUpperCase()}</option>)}
                </select>
              </div>
            </div>
          </div>
          <button
            className="w-full rounded-lg font-medium py-2.5 text-[14px] bg-white text-black hover:bg-white/90 active:scale-[0.99] disabled:opacity-50 disabled:active:scale-100 transition-all mt-2"
            onClick={handleTTS}
            disabled={!text.trim() || loading}
          >
            {loading ? 'Generating...' : 'Generate Audio'}
          </button>
        </div>
      )}

      {tab === 'transcribe' && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="block text-[13px] font-medium text-text-secondary mb-2">Audio File</label>
            <div className="border border-dashed border-border rounded-xl p-6 text-center hover:bg-surface-elevated transition-colors cursor-pointer" onClick={() => fileRef.current?.click()}>
              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="text-[24px]">🎵</div>
                  <div className="text-[14px] font-medium text-text-primary">{file.name}</div>
                  <div className="text-[12px] text-text-tertiary">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-white/[0.05] flex items-center justify-center text-text-tertiary mb-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                  </div>
                  <div className="text-[14px] font-medium text-text-primary">Click to upload</div>
                  <div className="text-[12px] text-text-tertiary">MP3, MP4, MPEG, MPGA, M4A, WAV, WEBM</div>
                </div>
              )}
            </div>
            <input type="file" className="hidden" ref={fileRef} accept="audio/*,video/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <button
            className="w-full rounded-lg font-medium py-2.5 text-[14px] bg-white text-black hover:bg-white/90 active:scale-[0.99] disabled:opacity-50 disabled:active:scale-100 transition-all"
            onClick={handleTranscribe}
            disabled={!file || loading}
          >
            {loading ? 'Transcribing...' : 'Transcribe Audio'}
          </button>
        </div>
      )}
    </div>
  )

  const output = (
    <div className="flex flex-col h-full gap-4">
      {tab === 'tts' && (
        audioUrl ? (
          <div className="bg-surface-elevated rounded-xl border border-border p-6 flex flex-col items-center justify-center gap-6">
            <audio src={audioUrl} controls className="w-full max-w-md" autoPlay />
            <button onClick={() => downloadMedia(audioUrl, `tts-${Date.now()}.${format}`)} className="text-[13px] text-text-secondary hover:text-text-primary underline">Download Audio</button>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-tertiary text-[14px]">
            {loading ? 'Synthesizing voice...' : 'Enter text to generate audio'}
          </div>
        )
      )}

      {tab === 'transcribe' && (
        transcript ? (
          <div className="bg-surface-elevated rounded-xl border border-border p-6">
            <h3 className="text-[14px] font-medium text-text-primary mb-4">Transcript</h3>
            <div className="text-[15px] leading-relaxed text-text-primary whitespace-pre-wrap">
              {transcript}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-text-tertiary text-[14px]">
            {loading ? 'Transcribing...' : 'Upload an audio file to transcribe'}
          </div>
        )
      )}
    </div>
  )

  return <GenerationView controls={controls} output={output} />
}
