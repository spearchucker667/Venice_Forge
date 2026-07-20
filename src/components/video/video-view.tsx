import { useState, useRef, useMemo, useEffect, useCallback, useId } from 'react'
import { selectHasVeniceKey, useAuthStore } from '../../stores/auth-store'
import { useVideoModels, type VideoModelGroup } from '../../hooks/use-models'
import { useVideo } from '../../hooks/use-video'

import { useSettingsStore } from '../../stores/settings-store'
import { Select } from '../ui/select'
import { Label, TextArea, PrimaryButton, PillGroup, ErrorText } from '../ui/shared'
import { GenerationView } from '../ui/generation-view'
import { cn, generateId } from '../../lib/utils'
import { toast } from '../../stores/toast-store'
import { useMediaStore } from '../../stores/media-store'
import type { VideoQueueRequest, VideoConstraints } from '../../types/venice'
import { isSupportedImageFile, readImageAttachment } from '../../services/attachmentService'
import { formatModelLabelWithCost } from '../../utils/pricing'
import { desktopFiles, isElectron } from '../../services/desktopBridge'
import { GenerationLoadingIndicator } from '../generation/GenerationLoadingIndicator'
import { ManagedVideoPlayer } from '../media/ManagedVideoPlayer'

export function VideoView() {
  const promptId = useId()
  const negativePromptId = useId()
  const modelId = useId()
  const resolutionId = useId()
  const aspectId = useId()
  const hasVeniceKey = useAuthStore(selectHasVeniceKey)
  const { groups, isLoading: modelsLoading } = useVideoModels()
  const selectedGroup = useSettingsStore(s => s.selectedVideoModelGroup)
  const setSelectedGroup = useSettingsStore(s => s.setSelectedVideoModelGroup)
  const selectedMode = useSettingsStore(s => s.selectedVideoMode)
  const setSelectedMode = useSettingsStore(s => s.setSelectedVideoMode)
  const mode = selectedMode || 'text'
  const setMode = setSelectedMode

  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [duration, setDuration] = useState('')
  const [resolution, setResolution] = useState('')
  const [aspect, setAspect] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageName, setImageName] = useState('')
  const [audioEnabled, setAudioEnabled] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  const { queue, isQueueing, status, stage, videoUrl, error, reset, cancel, elapsedMs, queueId, resultMediaId, lastRequest } = useVideo()
  const isProcessing = status === 'queued' || status === 'processing'

  // Resolve current group and constraints
  const group: VideoModelGroup | undefined = useMemo(() => {
    if (!selectedGroup && groups.length > 0) return groups[0]
    return groups.find((g) => g.name === selectedGroup)
  }, [groups, selectedGroup])

  const activeModel = mode === 'image' ? group?.imageModel : group?.textModel
  const constraints = activeModel?.model_spec?.constraints as VideoConstraints | undefined

  const setSelectedModelId = useSettingsStore(s => s.setSelectedVideoModelId)
  useEffect(() => {
    if (activeModel?.id) setSelectedModelId(activeModel.id)
  }, [activeModel, setSelectedModelId])

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
  // queue id. Desktop completion is main-owned and may return a durable
  // `venice-media://<sha256>` URL; web mode retains the normalized completion
  // URL. The Media Studio record stores that bounded URL, never duplicate bytes.
  // BUG-004 regression guard: track every queueId that has been persisted
  // to the Media Studio, regardless of whether it was auto-saved or
  // manually saved. The previous implementation used a single
  // `lastSavedQueueIdRef` that only remembered the last auto-save, so
  // clicking the "Save to Media Studio" button after an auto-save would
  // create a duplicate record. The set is intentionally per-component
  // (not global) because the same queueId from a previous job can be
  // legitimately re-rendered after navigation.
  const savedQueueIdsRef = useRef<Set<string>>(new Set())

  const formatGroupLabel = useCallback(
    (g: VideoModelGroup) => {
      const model = mode === 'image' ? g.imageModel : g.textModel
      if (!model) return g.name
      try {
        return formatModelLabelWithCost(model)
      } catch {
        return g.name
      }
    },
    [mode],
  )

  const groupOptions = useMemo(() =>
    groups.map((g) => ({
      value: g.name,
      label: formatGroupLabel(g),
    })),
    [groups, formatGroupLabel],
  )

  const handleImageUpload = async (file: File) => {
    if (!isSupportedImageFile(file)) {
      toast.warn(`Unsupported image type: ${file.type || file.name}. Use PNG, JPEG, or WEBP.`)
      return
    }
    try {
      const attachment = await readImageAttachment(file)
      setImageUrl(attachment.content)
      setImageName(file.name)
    } catch {
      toast.error('Failed to read image', 'Please choose a PNG, JPEG, or WEBP image under the size limit.')
    }
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
          <Label htmlFor={modelId}>Model</Label>
          <Select
            id={modelId}
            value={currentGroupName}
            onChange={(v) => { setSelectedGroup(v); setDuration(''); setResolution(''); setAspect('') }}
            options={groupOptions}
            searchable
            placeholder={modelsLoading ? 'Loading...' : 'Select model...'}
          />
        </div>

        {/* Generation mode: text or image */}
        {(hasTextMode || hasImageMode) && (
          <div className="flex flex-col gap-2">
            <Label>Generation Mode</Label>
            <div className="flex gap-px bg-surface-elevated rounded-lg p-0.5 border border-border">
              {hasTextMode && (
                <button
                  onClick={() => setMode('text')}
                  aria-pressed={mode === 'text'}
                  className={cn(
                    'flex-1 px-3 py-2.5 text-[15px] font-medium rounded-[7px] transition-all duration-150',
                    mode === 'text' ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text-muted',
                  )}
                >
                  Text to Video
                </button>
              )}
              {hasImageMode && (
                <button
                  onClick={() => setMode('image')}
                  aria-pressed={mode === 'image'}
                  className={cn(
                    'flex-1 px-3 py-2.5 text-[15px] font-medium rounded-[7px] transition-all duration-150',
                    mode === 'image' ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text-muted',
                  )}
                >
                  Image to Video
                </button>
              )}
            </div>
          </div>
        )}

        <div>
          <Label htmlFor={promptId}>Prompt</Label>
          <TextArea id={promptId} value={prompt} onChange={setPrompt} placeholder="A cinematic drone shot over misty mountains at sunrise..." rows={4} />
        </div>

        <div>
          <Label htmlFor={negativePromptId}>Negative prompt</Label>
          <TextArea id={negativePromptId} value={negativePrompt} onChange={setNegativePrompt} placeholder="low quality, blurry..." rows={2} />
        </div>

        {/* Image upload for image-to-video */}
        {mode === 'image' && (
          <div>
            <Label>Reference image</Label>
            {imageUrl ? (
              <div className="relative group">
                <img src={imageUrl} alt="Reference" className="w-full rounded-lg border border-border" />
                <button
                  type="button"
                  onClick={() => { setImageUrl(null); setImageName('') }}
                  aria-label="Remove reference image"
                  className="absolute top-1.5 right-1.5 p-1 bg-overlay rounded-md text-text-secondary hover:text-text-primary opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 transition-all"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
                <span className="text-[16px] text-text-muted mt-1 block truncate">{imageName}</span>
              </div>
            ) : (
              <>
                <input ref={fileRef} id="video-reference-image" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { if (e.target.files?.[0]) void handleImageUpload(e.target.files[0]) }} />
                <button type="button" onClick={() => {
                  const input = fileRef.current
                  if (!input) return
                  input.value = ''
                  if (typeof input.showPicker === 'function') input.showPicker()
                  else input.click()
                }} aria-label="Choose reference image" className="block w-full cursor-pointer border border-dashed border-border hover:border-accent rounded-lg py-5 text-center transition-colors">
                  <p className="text-[14px] text-text-muted">Click to add image</p>
                </button>
              </>
            )}
          </div>
        )}

        {/* Duration */}
        {durationOpts.length > 0 && (
          <div>
            <Label>Duration</Label>
            {durationOpts.length <= 5 ? (
              <PillGroup options={durationOpts} value={effectiveDuration} onChange={setDuration} ariaLabel="Video duration" />
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
              <Label htmlFor={resolutionId}>Resolution</Label>
              <Select id={resolutionId} value={effectiveResolution} onChange={setResolution} options={resolutionOpts} />
            </div>
          )}
          {aspectOpts.length > 0 && (
            <div>
              <Label htmlFor={aspectId}>Aspect</Label>
              <Select id={aspectId} value={effectiveAspect} onChange={setAspect} options={aspectOpts} />
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
                audioEnabled ? 'bg-accent' : 'bg-surface-elevated',
              )}
            >
              <div className={cn(
                'absolute top-[2px] w-[14px] h-[14px] rounded-full transition-all',
                audioEnabled ? 'left-[16px] bg-accent-fg' : 'left-[2px] bg-text-muted',
              )} />
            </button>
          </div>
        )}

        {/* Capability tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map((t) => (
              <span key={t} className="text-xs text-text-muted bg-surface-elevated border border-border rounded px-1.5 py-0.5">{t}</span>
            ))}
          </div>
        )}

        <PrimaryButton
          onClick={handleGenerate}
          disabled={!prompt.trim() || !hasVeniceKey || !activeModel || isQueueing || isProcessing || (mode === 'image' && !imageUrl)}
          loading={isQueueing || isProcessing}
        >
          {isProcessing ? (status === 'queued' ? 'Queued...' : 'Processing...') : 'Generate Video'}
        </PrimaryButton>
      {error && (
        <div className="flex items-center justify-between gap-2">
          <ErrorText>{error}</ErrorText>
          <button type="button" aria-label="Reset video generation form" onClick={reset} className="text-[13px] text-text-secondary hover:text-text-primary underline underline-offset-2 shrink-0 transition-colors">Reset</button>
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
                  const alreadySaved = Boolean(resultMediaId || (queueId && (savedQueueIdsRef.current.has(queueId) || useMediaStore.getState().items.some((media) => media.queueId === queueId))))
                  return (
                <button
                  type="button"
                  onClick={async () => {
                    // BUG-004 regression guard: the manual save button must
                    // be idempotent. If the auto-save effect already
                    // recorded this queueId, do nothing and show feedback.
                    if (queueId && (savedQueueIdsRef.current.has(queueId) || useMediaStore.getState().items.some((media) => media.queueId === queueId))) {
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
                      generatedMediaId: resultMediaId ?? undefined,
                    }
                    if (queueId) savedQueueIdsRef.current.add(queueId)
                    try {
                      await useMediaStore.getState().upsert(item, {
                        attachActiveProject: true,
                        source: 'generated',
                      })
                      toast.success('Saved to Media Studio')
                    } catch (saveError) {
                      if (queueId) savedQueueIdsRef.current.delete(queueId)
                      toast.fromError(saveError, 'Save to Media Studio failed')
                    }
                  }}
                  disabled={alreadySaved}
                  className={cn(
                    'text-[14px] flex items-center gap-1.5 transition-opacity',
                    alreadySaved
                      ? 'text-text-muted cursor-default'
                      : 'text-accent hover:opacity-85',
                  )}
                  title={alreadySaved ? 'Already saved to Media Studio' : 'Save to Media Studio'}
                  aria-label={alreadySaved ? 'Already saved to Media Studio' : 'Save to Media Studio'}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                  {alreadySaved ? 'Saved' : 'Save to Media Studio'}
                </button>
                  )
                })()}
                <button type="button" onClick={() => void (async () => {
                  try {
                    if (isElectron()) {
                      if (!resultMediaId) throw new Error('The durable video is not ready to save yet.')
                      const saved = await desktopFiles.saveGeneratedMedia(resultMediaId, 'venice-video.mp4')
                      if (saved) toast.success('Video saved')
                      return
                    }
                    const anchor = document.createElement('a')
                    anchor.href = videoUrl
                    anchor.download = 'venice-video.mp4'
                    anchor.click()
                  } catch (downloadError) {
                    toast.fromError(downloadError, 'Video download failed')
                  }
                })()} className="text-[14px] text-text-muted hover:text-text-muted transition-colors flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                  Download
                </button>
              </div>
            </div>
            <ManagedVideoPlayer src={videoUrl} className="w-full rounded-lg bg-overlay border border-border" />
            <button type="button" aria-label="Generate another video" onClick={reset} className="self-start text-[14px] text-text-muted hover:text-text-muted transition-colors">Generate another</button>
          </div>
        ) : isProcessing ? (
          <div className="flex flex-1 items-center justify-center" aria-live="polite">
            <GenerationLoadingIndicator
              state={stage === 'retrieving' || stage === 'saving' ? 'processing' : status === 'queued' ? 'queued' : 'generating'}
              label={stage === 'retrieving' ? 'Retrieving video…' : stage === 'saving' ? 'Saving securely…' : status === 'queued' ? 'Video queued…' : 'Rendering video…'}
              detail={elapsedMs > 0 ? `${Math.floor(elapsedMs / 1000)}s elapsed` : undefined}
              showCancel
              onCancel={cancel}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center flex-1 text-text-muted text-[15px]">
            <div className="flex flex-col items-center gap-2">
              <span>Generated videos appear here</span>
              <span className="text-[12px] text-text-muted">Average generation time: 30s–2min</span>
            </div>
          </div>
        )}

    </div>
  )

  return <GenerationView controls={controls} output={output} />
}



// Duration slider for models with many duration options (e.g. Kling O3 with 3s-15s)
function DurationSlider({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  const idx = options.indexOf(value)
  const currentIdx = idx >= 0 ? idx : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[16px] text-text-muted font-mono">{options[currentIdx]}</span>
        <span className="text-[16px] text-text-muted">{options[0]} — {options[options.length - 1]}</span>
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
