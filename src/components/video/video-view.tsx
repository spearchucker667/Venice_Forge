import { useState, useRef, useMemo, useEffect } from 'react'
import { useAuthStore } from '../../stores/auth-store'
import { useVideoModels, type VideoModelGroup } from '../../hooks/use-models'
import { useVideo } from '../../hooks/use-video'
import { Select } from '../ui/select'
import { Label, TextArea, PrimaryButton, PillGroup, ErrorText } from '../ui/shared'
import { GenerationView } from '../ui/generation-view'
import { cn, generateId } from '../../lib/utils'
import { toast } from '../../stores/toast-store'
import { useMediaStore } from '../../stores/media-store'
import type { VideoQueueRequest, VideoConstraints } from '../../types/venice'

export function VideoView() {
  const apiKey = useAuthStore((s) => s.apiKey)
  const { groups, isLoading: modelsLoading } = useVideoModels()
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [mode, setMode] = useState<'text' | 'image'>('text')

  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [duration, setDuration] = useState('')
  const [resolution, setResolution] = useState('')
  const [aspect, setAspect] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageName, setImageName] = useState('')
  const [audioEnabled, setAudioEnabled] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  const { queue, isQueueing, status, videoUrl, error, reset, cancel, elapsedMs, queueId, lastRequest } = useVideo()
  const isProcessing = status === 'queued' || status === 'processing'

  // Resolve current group and constraints
  const group: VideoModelGroup | undefined = useMemo(() => {
    if (!selectedGroup && groups.length > 0) return groups[0]
    return groups.find((g) => g.name === selectedGroup)
  }, [groups, selectedGroup])

  const activeModel = mode === 'image' ? group?.imageModel : group?.textModel
  const constraints = activeModel?.model_spec?.constraints as VideoConstraints | undefined

  // Auto-select first group when models load
  const currentGroupName = group?.name || ''

  // Can this group do image-to-video?
  const hasImageMode = !!group?.imageModel
  const hasTextMode = !!group?.textModel

  // Build option lists from constraints
  const durationOpts = useMemo(() =>
    (constraints?.durations || []).map((d) => ({ value: d, label: d })),
    [constraints],
  )
  const resolutionOpts = useMemo(() =>
    (constraints?.resolutions || []).map((r) => ({ value: r, label: r })),
    [constraints],
  )
  const aspectOpts = useMemo(() =>
    (constraints?.aspect_ratios || []).map((a) => ({ value: a, label: a })),
    [constraints],
  )

  // Ensure selected values are valid for current model
  const effectiveDuration = durationOpts.some((o) => o.value === duration) ? duration : durationOpts[0]?.value || ''
  const effectiveResolution = resolutionOpts.some((o) => o.value === resolution) ? resolution : resolutionOpts[0]?.value || ''
  const effectiveAspect = aspectOpts.some((o) => o.value === aspect) ? aspect : aspectOpts[0]?.value || ''

  // P0: pre-select defaults from the model constraints so the request
  // ALWAYS carries a `duration` (required by the swagger `QueueVideoRequest`)
  // and so the pickers show what is actually being sent. The previous
  // behaviour left the pickers empty until the user clicked one, which
  // produced a 400 "duration required" for any user who hit Generate
  // without first touching the duration pill — surfaced to the operator
  // as a generic "video dimensions" / "invalid params" error.
  useEffect(() => {
    if (!duration && durationOpts[0]) setDuration(durationOpts[0].value)
  }, [duration, durationOpts])
  useEffect(() => {
    if (!resolution && resolutionOpts[0]) setResolution(resolutionOpts[0].value)
  }, [resolution, resolutionOpts])
  useEffect(() => {
    if (!aspect && aspectOpts[0]) setAspect(aspectOpts[0].value)
  }, [aspect, aspectOpts])

  // Persist a Media Studio record the first time a job completes for a given
  // queue id. We do not save the (very large) video bytes into the encrypted
  // IDB record — instead we keep the upstream `downloadUrl` and let the user
  // re-download on demand. This keeps the gallery store light and avoids
  // duplicating the asset across IDB and the cache.
  // BUG-004 regression guard: track every queueId that has been persisted
  // to the Media Studio, regardless of whether it was auto-saved or
  // manually saved. The previous implementation used a single
  // `lastSavedQueueIdRef` that only remembered the last auto-save, so
  // clicking the "Save to Media Studio" button after an auto-save would
  // create a duplicate record. The set is intentionally per-component
  // (not global) because the same queueId from a previous job can be
  // legitimately re-rendered after navigation.
  const savedQueueIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (status !== 'completed' || !videoUrl || !queueId) return
    if (savedQueueIdsRef.current.has(queueId)) return
    savedQueueIdsRef.current.add(queueId)
    const mediaItem = {
      id: generateId(),
      image: videoUrl,
      prompt: lastRequest?.prompt ?? prompt.trim(),
      model: lastRequest?.model ?? 'venice-video',
      timestamp: Date.now(),
      mediaType: 'video' as const,
      operation: 'video-generate' as const,
      parentId: null,
      childrenIds: [] as string[],
      tags: [] as string[],
      note: '',
      favorite: false,
      queueId,
      duration: lastRequest?.duration,
      resolution: lastRequest?.resolution,
      aspectRatio: lastRequest?.aspect_ratio,
      audio: lastRequest?.audio,
      downloadUrl: videoUrl,
    }
    void useMediaStore.getState().upsert(mediaItem)
  }, [status, videoUrl, queueId, lastRequest, prompt])

  const groupOptions = useMemo(() =>
    groups.map((g) => ({
      value: g.name,
      label: g.name,
    })),
    [groups],
  )

  const handleImageUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setImageUrl(reader.result as string)
      setImageName(file.name)
    }
    reader.readAsDataURL(file)
  }

  const handleGenerate = () => {
    if (!prompt.trim() || !activeModel) return
    // P0: the swagger QueueVideoRequest requires `duration`. If the model
    // advertises duration options we MUST send one; refuse to submit a
    // request that would 400. The useEffect above pre-selects the first
    // duration option on render, so this branch is only reachable if a
    // model config is malformed (advertises durations but exposes none).
    if (durationOpts.length > 0 && !effectiveDuration) return
    const req: VideoQueueRequest = {
      model: activeModel.id,
      prompt: prompt.trim(),
      negative_prompt: negativePrompt.trim() || undefined,
      // `duration` is REQUIRED by the swagger; only omit when the model
      // exposes no duration options (in which case the server falls back
      // to the model default). This is the fix for the reported
      // "video dimensions issue": the previous code passed `undefined`
      // here, which 400s on every model that has a fixed duration.
      ...(effectiveDuration ? { duration: effectiveDuration } : {}),
      ...(effectiveResolution ? { resolution: effectiveResolution } : {}),
      ...(effectiveAspect ? { aspect_ratio: effectiveAspect } : {}),
    }
    if (mode === 'image' && imageUrl) {
      req.image_url = imageUrl
    }
    if (constraints?.audio && constraints.audio_configurable) {
      req.audio = audioEnabled
    }
    queue(req)
  }

  // Tags for model capabilities
  const tags: string[] = []
  if (group) {
    if (group.sets.includes('uncensored')) tags.push('Uncensored')
    if (group.sets.includes('open_source')) tags.push('Open Source')
    if (group.sets.includes('photorealistic')) tags.push('Photorealistic')
    if (group.sets.includes('cinematic')) tags.push('Cinematic')
    if (group.sets.includes('fast')) tags.push('Fast')
    if (constraints?.audio) tags.push('Audio')
    if (constraints?.audio_input) tags.push('Audio Input')
  }

  const controls = (
    <>
        {/* Model selector */}
        <div>
          <Label>Model</Label>
          <Select
            value={currentGroupName}
            onChange={(v) => { setSelectedGroup(v); setDuration(''); setResolution(''); setAspect('') }}
            options={groupOptions}
            searchable
            placeholder={modelsLoading ? 'Loading...' : 'Select model...'}
          />
        </div>

        {/* Text / Image mode toggle */}
        {(hasTextMode || hasImageMode) && (
          <div className="flex gap-px bg-white/[0.02] rounded-lg p-0.5 border border-white/[0.04]">
            {hasTextMode && (
              <button
                onClick={() => setMode('text')}
                className={cn(
                  'flex-1 px-3 py-2.5 text-[15px] font-medium rounded-[7px] transition-all duration-150',
                  mode === 'text' ? 'bg-white text-black' : 'text-white/25 hover:text-white/45',
                )}
              >
                Text to Video
              </button>
            )}
            {hasImageMode && (
              <button
                onClick={() => setMode('image')}
                className={cn(
                  'flex-1 px-3 py-2.5 text-[15px] font-medium rounded-[7px] transition-all duration-150',
                  mode === 'image' ? 'bg-white text-black' : 'text-white/25 hover:text-white/45',
                )}
              >
                Image to Video
              </button>
            )}
          </div>
        )}

        <div>
          <Label>Prompt</Label>
          <TextArea value={prompt} onChange={setPrompt} placeholder="A cinematic drone shot over misty mountains at sunrise..." rows={4} />
        </div>

        <div>
          <Label>Negative prompt</Label>
          <TextArea value={negativePrompt} onChange={setNegativePrompt} placeholder="low quality, blurry..." rows={2} />
        </div>

        {/* Image upload for image-to-video */}
        {mode === 'image' && (
          <div>
            <Label>Reference image</Label>
            {imageUrl ? (
              <div className="relative group">
                <img src={imageUrl} alt="Reference" className="w-full rounded-lg border border-white/[0.06]" />
                <button
                  type="button"
                  onClick={() => { setImageUrl(null); setImageName('') }}
                  aria-label="Remove reference image"
                  className="absolute top-1.5 right-1.5 p-1 bg-black/60 rounded-md text-white/50 hover:text-white opacity-0 group-hover:opacity-100 transition-all"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
                <span className="text-[16px] text-white/15 mt-1 block truncate">{imageName}</span>
              </div>
            ) : (
              <div
                onClick={() => fileRef.current?.click()}
                className="border border-dashed border-white/[0.08] hover:border-white/[0.15] rounded-lg py-5 text-center cursor-pointer transition-colors"
              >
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleImageUpload(e.target.files[0]) }} />
                <p className="text-[14px] text-white/15">Click to add image</p>
              </div>
            )}
          </div>
        )}

        {/* Duration */}
        {durationOpts.length > 0 && (
          <div>
            <Label>Duration</Label>
            {durationOpts.length <= 5 ? (
              <PillGroup options={durationOpts} value={effectiveDuration} onChange={setDuration} />
            ) : (
              <DurationSlider
                options={durationOpts.map((o) => o.value)}
                value={effectiveDuration}
                onChange={setDuration}
              />
            )}
          </div>
        )}

        {/* Resolution & Aspect */}
        <div className="grid grid-cols-2 gap-3">
          {resolutionOpts.length > 0 && (
            <div>
              <Label>Resolution</Label>
              <Select value={effectiveResolution} onChange={setResolution} options={resolutionOpts} />
            </div>
          )}
          {aspectOpts.length > 0 && (
            <div>
              <Label>Aspect</Label>
              <Select value={effectiveAspect} onChange={setAspect} options={aspectOpts} />
            </div>
          )}
        </div>

        {/* Audio toggle */}
        {constraints?.audio && constraints.audio_configurable && (
          <div className="flex items-center justify-between">
            <Label>Generate audio</Label>
            <button
              type="button"
              role="switch"
              aria-checked={audioEnabled}
              aria-label={audioEnabled ? 'Generate audio enabled' : 'Generate audio disabled'}
              onClick={() => setAudioEnabled(!audioEnabled)}
              className={cn(
                'w-8 h-[18px] rounded-full transition-colors relative',
                audioEnabled ? 'bg-white' : 'bg-white/[0.08]',
              )}
            >
              <div className={cn(
                'absolute top-[2px] w-[14px] h-[14px] rounded-full transition-all',
                audioEnabled ? 'left-[16px] bg-black' : 'left-[2px] bg-white/30',
              )} />
            </button>
          </div>
        )}

        {/* Capability tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <span key={t} className="text-[16px] text-white/20 bg-white/[0.03] border border-white/[0.04] rounded px-1.5 py-0.5">{t}</span>
            ))}
          </div>
        )}

        <PrimaryButton
          onClick={handleGenerate}
          disabled={!prompt.trim() || !apiKey || !activeModel || isQueueing || isProcessing || (mode === 'image' && !imageUrl)}
          loading={isQueueing || isProcessing}
        >
          {isProcessing ? (status === 'queued' ? 'Queued...' : 'Processing...') : 'Generate Video'}
        </PrimaryButton>
      {error && (
        <div className="flex items-center justify-between gap-2">
          <ErrorText>{error}</ErrorText>
          <button type="button" aria-label="Reset video generation form" onClick={reset} className="text-[13px] text-white/55 hover:text-white underline underline-offset-2 shrink-0 transition-colors">Reset</button>
        </div>
      )}
    </>
  )

  const output = (
    <div className="flex flex-col h-full">
        {videoUrl ? (
          <div className="animate-fade-in flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>Output</Label>
              <div className="flex items-center gap-3">
                {(() => {
                  const alreadySaved = !!queueId && savedQueueIdsRef.current.has(queueId)
                  return (
                <button
                  type="button"
                  onClick={() => {
                    // BUG-004 regression guard: the manual save button must
                    // be idempotent. If the auto-save effect already
                    // recorded this queueId, do nothing and show feedback.
                    if (queueId && savedQueueIdsRef.current.has(queueId)) {
                      toast.success('Already in Media Studio')
                      return
                    }
                    const item = {
                      id: generateId(),
                      image: videoUrl,
                      prompt: lastRequest?.prompt ?? prompt.trim(),
                      model: lastRequest?.model ?? 'venice-video',
                      timestamp: Date.now(),
                      mediaType: 'video' as const,
                      operation: 'video-generate' as const,
                      parentId: null,
                      childrenIds: [] as string[],
                      tags: [] as string[],
                      note: '',
                      favorite: false,
                      queueId: queueId ?? undefined,
                      duration: lastRequest?.duration,
                      resolution: lastRequest?.resolution,
                      aspectRatio: lastRequest?.aspect_ratio,
                      audio: lastRequest?.audio,
                      downloadUrl: videoUrl,
                    }
                    if (queueId) savedQueueIdsRef.current.add(queueId)
                    void useMediaStore.getState().upsert(item)
                    toast.success('Saved to Media Studio')
                  }}
                  disabled={alreadySaved}
                  className={cn(
                    'text-[14px] flex items-center gap-1.5 transition-opacity',
                    alreadySaved
                      ? 'text-white/30 cursor-default'
                      : 'text-[var(--color-accent)] hover:opacity-85',
                  )}
                  title={alreadySaved ? 'Already saved to Media Studio' : 'Save to Media Studio'}
                  aria-label={alreadySaved ? 'Already saved to Media Studio' : 'Save to Media Studio'}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                  {alreadySaved ? 'Saved' : 'Save to Media Studio'}
                </button>
                  )
                })()}
                <a href={videoUrl} download="venice-video.mp4" target="_blank" rel="noopener noreferrer" className="text-[14px] text-white/20 hover:text-white/40 transition-colors flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                  Download
                </a>
              </div>
            </div>
            <video controls src={videoUrl} className="w-full rounded-lg bg-black border border-white/[0.04]" />
            <button type="button" aria-label="Generate another video" onClick={reset} className="self-start text-[14px] text-white/15 hover:text-white/35 transition-colors">Generate another</button>
          </div>
        ) : (
          <div className="flex items-center justify-center flex-1 text-white/30 text-[15px]">
            {isProcessing ? (
              <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
                <div className="w-7 h-7 border border-white/[0.08] border-t-white/40 rounded-full animate-spin" />
                <span className="text-white/55 text-center">
                  {status === 'queued' ? 'Queued — waiting for a slot' : 'Generating your video'}
                  {elapsedMs > 0 && (
                    <span className="block text-[12px] text-white/30 font-mono mt-1">
                      {formatElapsed(elapsedMs)} · typically 30s–2min
                    </span>
                  )}
                </span>
                <button
                  onClick={cancel}
                  className="text-[13px] text-white/35 hover:text-white/65 underline underline-offset-2 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span>Generated videos appear here</span>
                <span className="text-[12px] text-white/35">Average generation time: 30s–2min</span>
              </div>
            )}
          </div>
        )}
    </div>
  )

  return <GenerationView controls={controls} output={output} />
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

// Duration slider for models with many duration options (e.g. Kling O3 with 3s-15s)
function DurationSlider({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const idx = options.indexOf(value)
  const currentIdx = idx >= 0 ? idx : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[16px] text-white/30 font-mono">{options[currentIdx]}</span>
        <span className="text-[16px] text-white/15">{options[0]} — {options[options.length - 1]}</span>
      </div>
      <input
        type="range"
        min={0}
        max={options.length - 1}
        value={currentIdx}
        onChange={(e) => onChange(options[Number(e.target.value)])}
        className="w-full"
      />
    </div>
  )
}
