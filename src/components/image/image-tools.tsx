import { useEffect, useId, useMemo, useState, useRef, type DragEvent } from 'react'
import { selectHasVeniceKey, useAuthStore } from '../../stores/auth-store'
import { useImageEdit, useImageUpscale, useBackgroundRemove } from '../../hooks/use-image-tools'
import { useModels } from '../../hooks/use-models'
import { useBlobUrl } from '../../hooks/use-blob-url'
import { ModelSelect } from '../ModelSelect'
import { Label, TextArea, PrimaryButton, ErrorText, EmptyState } from '../ui/shared'
import { cn, generateId } from '../../lib/utils'
import { toast } from '../../stores/toast-store'
import { DEFAULT_IMAGE_EDIT_MODEL, IMAGE_EDIT_MODEL_IDS } from '../../constants/venice'
import { normalizeError } from '../../services/veniceClient/errors'
import { useMediaStore } from '../../stores/media-store'
import { blobToDataUrl } from '../../utils/image'
import type { MediaOperation } from '../../types/media'
import type { ModelInfo, VeniceModel } from '../../types/venice'
import { useImageWorkspaceStore } from '../../stores/image-workspace-store'
import { isSupportedImageFile, readImageAttachment } from '../../services/attachmentService'
import { inspectImageInput } from '../../services/media-request-adapter'
import { GenerationLoadingIndicator } from '../generation/GenerationLoadingIndicator'

type Tool = 'edit' | 'upscale' | 'remove-bg'

export function ImageTools() {
  const editPromptId = useId()
  const editModelId = useId()
  const hasVeniceKey = useAuthStore(selectHasVeniceKey)
  const { data: imageModels } = useModels('image')
  const [tool, setTool] = useState<Tool>('edit')
  const [imageData, setImageData] = useState<string | null>(null)
  const [imageName, setImageName] = useState('')
  const [parentId, setParentId] = useState<string | null>(null)
  const pendingHandoff = useImageWorkspaceStore((state) => state.pending)
  const [resultUrl, setResultBlob, resetResult] = useBlobUrl()
  const fileRef = useRef<HTMLInputElement>(null)

  // Edit state
  const [editPrompt, setEditPrompt] = useState('')
  const [editModel, setEditModel] = useState('')
  const filteredImageModels = useMemo<Array<ModelInfo & Pick<VeniceModel, 'model_spec'>>>(() => {
    const candidates = imageModels ?? []
    const seen = new Set<string>()
    const filtered = candidates
      .filter((model) => IMAGE_EDIT_MODEL_IDS.has(model.id))
      .filter((model) => {
        if (seen.has(model.id)) return false
        seen.add(model.id)
        return true
      })
    if (filtered.length === 0) {
      return [{ id: DEFAULT_IMAGE_EDIT_MODEL, name: DEFAULT_IMAGE_EDIT_MODEL }]
    }
    return filtered
  }, [imageModels])

  // Upscale state
  const [scale, setScale] = useState<2 | 4>(2)
  const [upscaleAdherence, setUpscaleAdherence] = useState(50)
  const creativity = (100 - upscaleAdherence) * 0.0002
  const sourceDiagnostics = useMemo(() => {
    if (!imageData) return null
    const requestKeys = tool === 'edit'
      ? ['image', 'model', 'prompt']
      : tool === 'upscale'
        ? ['creativity', 'image', 'scale']
        : ['image']
    try {
      return inspectImageInput(imageData, requestKeys, tool === 'upscale' ? scale : undefined)
    } catch {
      return null
    }
  }, [imageData, scale, tool])

  const editMutation = useImageEdit()
  const upscaleMutation = useImageUpscale()
  const bgRemoveMutation = useBackgroundRemove()
  const resultBlobRef = useRef<Blob | null>(null)
  const lastToolRef = useRef<Tool>('edit')
  const lastScaleRef = useRef<number>(2)
  const lastEditModelRef = useRef<string>('')
  const lastPromptRef = useRef<string>('')

  useEffect(() => {
    if (filteredImageModels.length === 0) return
    if (!filteredImageModels.some((model) => model.id === editModel)) {
      setEditModel(filteredImageModels[0].id)
    }
  }, [editModel, filteredImageModels])

  useEffect(() => {
    if (!pendingHandoff || pendingHandoff.target !== 'tools') return
    setTool(pendingHandoff.tool)
    setImageData(pendingHandoff.image)
    setImageName(pendingHandoff.filename)
    setParentId(pendingHandoff.parentId)
    if (pendingHandoff.tool === 'edit') setEditPrompt(pendingHandoff.prompt)
    resetResult()
    useImageWorkspaceStore.getState().consume(pendingHandoff.id)
  }, [pendingHandoff, resetResult])

  const handleFileSelect = async (file: File) => {
    if (!isSupportedImageFile(file)) {
      toast.warn(`Unsupported image type: ${file.type || file.name}. Use PNG, JPEG, or WEBP.`)
      return
    }
    try {
      const attachment = await readImageAttachment(file)
      setImageData(attachment.content)
      setImageName(file.name)
      setParentId(null)
      resetResult()
    } catch (err) {
      toast.fromError(err, 'Failed to read image')
    }
  }

  const handleDroppedFile = async (file: File) => {
    if (!isSupportedImageFile(file)) return
    try {
      const attachment = await readImageAttachment(file)
      setImageData(attachment.content)
      setImageName(file.name)
      setParentId(null)
      resetResult()
    } catch (err) {
      toast.fromError(err, 'Failed to read image')
    }
  }

  const handleSourceDragOver = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleSourceDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    void handleDroppedFile(file)
  }

  const handleProcess = () => {
    if (!imageData) return
    resetResult()
    resultBlobRef.current = null
    lastToolRef.current = tool
    lastScaleRef.current = scale
    lastEditModelRef.current = editModel
    lastPromptRef.current = tool === 'edit' ? editPrompt.trim() : ''
    const opts = {
      onSuccess: (blob: Blob) => {
        resultBlobRef.current = blob
        setResultBlob(blob)
      },
      onError: (err: unknown) => toast.fromError(err, 'Image tool failed'),
    }
    if (tool === 'edit') {
      editMutation.mutate({ image: imageData, prompt: editPrompt.trim(), model: editModel }, opts)
    } else if (tool === 'upscale') {
      upscaleMutation.mutate(
        { image: imageData, scale, creativity },
        opts,
      )
    } else {
      bgRemoveMutation.mutate(imageData, opts)
    }
  }

  const handleSaveToMedia = async () => {
    const blob = resultBlobRef.current
    if (!blob) {
      toast.error('No result to save yet')
      return
    }
    try {
      const dataUrl = await blobToDataUrl(blob)
      const op: MediaOperation = lastToolRef.current === 'upscale' ? 'upscale' : lastToolRef.current === 'remove-bg' ? 'background-remove' : 'edit'
      const modelId = lastToolRef.current === 'edit' ? lastEditModelRef.current : 'venice-image-tools'
      const mediaItem = {
        id: generateId(),
        image: dataUrl,
        prompt: lastPromptRef.current || `${lastToolRef.current} result`,
        model: modelId,
        timestamp: Date.now(),
        mediaType: 'image' as const,
        operation: op,
        parentId,
        childrenIds: [] as string[],
        tags: [] as string[],
        note: '',
        favorite: false,
        upscaleFactor: lastToolRef.current === 'upscale' ? lastScaleRef.current : undefined,
      };
      if (parentId) {
        await useMediaStore.getState().upsertDerivative(mediaItem, parentId)
      } else {
        await useMediaStore.getState().upsert(mediaItem, {
          attachActiveProject: true,
          source: 'generated',
        })
      }
      toast.success('Saved to Media Studio')
    } catch (err) {
      toast.fromError(err, 'Save failed')
    }
  }

  const isLoading = editMutation.isPending || upscaleMutation.isPending || bgRemoveMutation.isPending
  const error = editMutation.error || upscaleMutation.error || bgRemoveMutation.error

  const classifiedError = useMemo(() => {
    if (!error) return null
    const status = (error as { status?: number }).status ?? null
    const message = error instanceof Error ? error.message : String(error)
    return normalizeError(status, message)
  }, [error])

  const downloadResult = () => {
    if (!resultUrl) return
    const a = document.createElement('a')
    a.href = resultUrl
    a.download = `venice-${tool}-result.png`
    a.click()
  }

  return (
    <div className="flex h-full">
      <div className="w-96 border-r border-border/50 p-6 flex flex-col gap-4 overflow-y-auto shrink-0">
        {/* Tool selector */}
        <div className="flex gap-px bg-surface-elevated rounded-lg p-0.5 border border-border">
          {([['edit', 'Edit'], ['upscale', 'Upscale'], ['remove-bg', 'Remove BG']] as const).map(([id, label]) => (
            <button key={id} onClick={() => { setTool(id); resetResult() }} className={cn(
              'flex-1 px-2 py-2.5 text-[14px] font-medium rounded-[7px] transition-all duration-150',
              tool === id ? 'bg-accent text-accent-fg' : 'text-text-muted hover:text-text-muted',
            )}>
              {label}
            </button>
          ))}
        </div>

        {/* Image upload */}
        <div>
          <Label>Source image</Label>
          {imageData ? (
            <div className="relative group">
              <img src={imageData} alt="Source" className="w-full rounded-lg border border-border" />
              <button
                onClick={() => { setImageData(null); setImageName(''); setParentId(null); resetResult() }}
                aria-label="Remove source image"
                type="button"
                className="absolute top-1.5 right-1.5 p-1 bg-overlay rounded-md text-text-secondary hover:text-text-primary opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
              <span className="text-[13px] text-text-muted mt-1 block truncate">{imageName}</span>
              {sourceDiagnostics?.width && sourceDiagnostics.height && (
                <p className="mt-1 text-[12px] text-text-muted" aria-label="Source image diagnostics">
                  {sourceDiagnostics.mimeType?.replace('image/', '').toUpperCase()} · {sourceDiagnostics.width}×{sourceDiagnostics.height} · {sourceDiagnostics.byteCount?.toLocaleString()} bytes
                  {sourceDiagnostics.projectedWidth && sourceDiagnostics.projectedHeight
                    ? ` · output ${sourceDiagnostics.projectedWidth}×${sourceDiagnostics.projectedHeight}`
                    : ''}
                  {' · '}{sourceDiagnostics.requestKeys.join(', ')}
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              aria-label="Drop or click to upload image"
              onClick={() => fileRef.current?.click()}
              onDragOver={handleSourceDragOver}
              onDrop={handleSourceDrop}
              className="w-full border border-dashed border-border hover:border-accent rounded-lg py-8 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
            >
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]) }} />
              <p className="text-[14px] text-text-muted">Click to upload image</p>
            </button>
          )}
        </div>

        {/* Tool-specific controls */}
        {tool === 'edit' && (
          <>
            <div><Label htmlFor={editPromptId}>Edit prompt</Label><TextArea id={editPromptId} value={editPrompt} onChange={setEditPrompt} placeholder="Change the background to a sunset beach..." rows={3} /></div>
            <div><Label htmlFor={editModelId}>Model</Label><ModelSelect id={editModelId} value={editModel} onChange={setEditModel} models={filteredImageModels} ariaLabel="Edit model" getLabel={(model) => model.model_spec?.name || model.name || model.id} /></div>
          </>
        )}

        {tool === 'upscale' && (
          <>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Scale</Label>
                <span className="text-[13px] text-text-muted font-mono">{scale}x</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {([2, 4] as const).map((factor) => (
                  <button key={factor} type="button" aria-pressed={scale === factor} onClick={() => setScale(factor)} className={cn('rounded-md border px-3 py-2 text-[13px]', scale === factor ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-secondary')}>{factor}×</button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>Source adherence</Label>
                <span className="text-[13px] text-text-muted font-mono">{upscaleAdherence}%</span>
              </div>
              <input aria-label="Upscale source adherence" type="range" min={0} max={100} step={5} value={upscaleAdherence} onChange={(e) => setUpscaleAdherence(Math.min(100, Math.max(0, Number(e.target.value))))} className="w-full" />
              <p className="mt-1 text-[12px] text-text-muted">
                Higher values stay closer to the source; lower values allow the upscaler to add more texture and detail.
              </p>
            </div>
            <div className="rounded-md border border-border bg-surface px-3 py-2 text-[12px] text-text-muted">
              Venice upscaling does not accept a text prompt. For prompt-directed changes, switch to Edit.
              <button type="button" onClick={() => setTool('edit')} className="ml-2 text-accent underline underline-offset-2">Open Edit</button>
            </div>
          </>
        )}

        <PrimaryButton
          onClick={handleProcess}
          disabled={!imageData || !hasVeniceKey || isLoading || (tool === 'edit' && !editPrompt.trim())}
          loading={isLoading}
        >
          {tool === 'edit' ? 'Edit Image' : tool === 'upscale' ? 'Upscale Image' : 'Remove Background'}
        </PrimaryButton>
        {error && <ErrorText>{classifiedError}</ErrorText>}
      </div>

      <div className="flex-1 p-6 overflow-y-auto flex flex-col min-w-0">
        {isLoading ? (
          <div className="flex min-h-[18rem] items-center justify-center" aria-live="polite">
            <GenerationLoadingIndicator
              state="processing"
              label={tool === 'edit' ? 'Editing image…' : tool === 'upscale' ? 'Upscaling image…' : 'Removing background…'}
              detail="The result will appear here when processing completes."
            />
          </div>
        ) : resultUrl ? (
          <div className="animate-fade-in flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>Result</Label>
              <div className="flex items-center gap-3">
                <button onClick={() => void handleSaveToMedia()} className="text-[14px] text-accent hover:opacity-85 transition-opacity flex items-center gap-1.5" title="Save to Media Studio">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                  Save to Media Studio
                </button>
                <button onClick={downloadResult} className="text-[14px] text-text-muted hover:text-text-muted transition-colors flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                  Download
                </button>
              </div>
            </div>
            <img src={resultUrl} alt="Result" className={cn('w-full rounded-lg border border-border', tool === 'remove-bg' && 'bg-[repeating-conic-gradient(var(--surface-muted)_0%_25%,var(--surface-elevated)_0%_50%)_0_0/20px_20px]')} />
          </div>
        ) : (
          <EmptyState>{tool === 'edit' ? 'Edited image appears here' : tool === 'upscale' ? 'Upscaled image appears here' : 'Result appears here'}</EmptyState>
        )}
      </div>
    </div>
  )
}
