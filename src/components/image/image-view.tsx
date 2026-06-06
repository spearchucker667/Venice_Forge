import { useState, useMemo, useEffect } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { useModels } from '../../hooks/use-models'
import { useStyles } from '../../hooks/use-styles'
import { useImageGenerate } from '../../hooks/use-image'
import { selectHasVeniceKey, useAuthStore } from '../../stores/auth-store'
import { Select } from '../ui/select'
import { Label, TextArea, PrimaryButton, PillGroup, ErrorText, ExamplePrompts } from '../ui/shared'
import { GenerationView } from '../ui/generation-view'
import type { ImageConstraints } from '../../types/venice'
import { useMediaStore } from '../../stores/media-store'
import { generateId } from '../../lib/utils'
import { getPromptStartersForCategory } from '../../services/promptStarterService'
import { isElectron } from '../../services/desktopBridge'
import { PROMPT_TEMPLATES } from '../../constants/promptTemplates'
import { processBase64Image, routeAsset } from '../../utils/imageProcessor'


function toImageSrc(b64: string): string {
  if (b64.startsWith('data:')) return b64
  if (b64.startsWith('/9j/')) return `data:image/jpeg;base64,${b64}`
  if (b64.startsWith('iVBOR')) return `data:image/png;base64,${b64}`
  if (b64.startsWith('UklGR')) return `data:image/webp;base64,${b64}`
  return `data:image/png;base64,${b64}`
}

const DEFAULT_SIZES = [
  { value: '0', label: '512' },
  { value: '1', label: '768' },
  { value: '2', label: '1024' },
  { value: '3', label: '1280' },
]
const DEFAULT_SIZE_MAP = [
  { w: 512, h: 512 }, { w: 768, h: 768 }, { w: 1024, h: 1024 }, { w: 1280, h: 1280 },
]

export function ImageView() {
  const hasVeniceKey = useAuthStore(selectHasVeniceKey)
  const selectedModel = useSettingsStore((s) => s.selectedModels.image)
  const veniceApiSafeMode = useSettingsStore((s) => s.veniceApiSafeMode)
  const { data: models } = useModels('image')
  const { data: styles } = useStyles()
  const model = selectedModel || models?.[0]?.id || 'z-image-turbo'

  // Get constraints for the selected model
  const modelData = models?.find((m) => m.id === model)
  const constraints = modelData?.model_spec?.constraints as ImageConstraints | undefined
  const hasAspectRatios = constraints?.aspectRatios && constraints.aspectRatios.length > 0
  const hasResolutions = constraints?.resolutions && constraints.resolutions.length > 0
  const maxSteps = constraints?.steps?.max || 50
  const defaultSteps = constraints?.steps?.default || 20
  const promptLimit = constraints?.promptCharacterLimit || 4096

  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [starters, setStarters] = useState<string[]>(() => getPromptStartersForCategory('image', 4))
  const [sizeIdx, setSizeIdx] = useState('2')
  const [aspectRatio, setAspectRatio] = useState('')
  const [resolution, setResolution] = useState('')
  const [style, setStyle] = useState('')
  const [steps, setSteps] = useState(defaultSteps)
  const [variants, setVariants] = useState(1)
  const [hideWatermark] = useState(true)
  const [images, setImages] = useState<string[]>([])
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  // Build aspect ratio options from model constraints
  const aspectOptions = useMemo(() => {
    if (!hasAspectRatios) return []
    return [
      { value: '', label: 'Auto' },
      ...constraints!.aspectRatios!.map((a) => ({ value: a, label: a })),
    ]
  }, [constraints, hasAspectRatios])

  // Build resolution options from model constraints (some models support 1K/2K/4K)
  const resolutionOptions = useMemo(() => {
    if (!hasResolutions) return []
    return constraints!.resolutions!.map((r) => ({ value: r, label: r }))
  }, [constraints, hasResolutions])

  // Pre-select defaults from the model constraints so the request always
  // carries a sizing field. The picker still shows "Auto" for the user,
  // but the active value is the first model-advertised aspect ratio (or
  // the model-defaultAspectRatio if advertised). This fixes the case
  // where the user clicked Generate before touching the picker, which
  // used to submit NO size fields and silently fall back to the model
  // default — confusing because the displayed pill didn't match the
  // sent payload.
  useEffect(() => {
    if (hasAspectRatios && !aspectRatio) {
      const next = constraints?.defaultAspectRatio
        && constraints.aspectRatios!.includes(constraints.defaultAspectRatio)
        ? constraints.defaultAspectRatio
        : constraints!.aspectRatios![0];
      setAspectRatio(next);
    }
    if (hasResolutions && !resolution) {
      const next = constraints?.defaultResolution
        && constraints.resolutions!.includes(constraints.defaultResolution)
        ? constraints.defaultResolution
        : constraints!.resolutions![0];
      if (next) setResolution(next);
    }
    if (defaultSteps && steps === 0) setSteps(defaultSteps);
  }, [constraints, hasAspectRatios, hasResolutions, aspectRatio, resolution, defaultSteps, steps]);

  const downloadImage = async (b64: string, index?: number) => {
    const filename = `venice-image${index !== undefined ? `-${index + 1}` : ''}.png`;
    const routedFolder = routeAsset(prompt);
    if (isElectron()) {
      try {
        const result = await window.veniceForge!.files.saveRoutedImage(b64, filename, routedFolder);
        if (!result.ok) {
          console.error(`Save failed: ${result.error}`);
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      const a = document.createElement('a')
      a.href = toImageSrc(b64)
      a.download = filename
      a.click()
    }
  }

  const mutation = useImageGenerate()
  const styleOptions = [{ value: '', label: 'None' }, ...(styles?.map((s) => ({ value: s, label: s })) ?? [])]

  const handleGenerate = () => {
    if (!prompt.trim()) return
    const size = DEFAULT_SIZE_MAP[Number(sizeIdx)]

    const req: Record<string, unknown> = {
      prompt: prompt.trim(),
      negative_prompt: negativePrompt.trim() || undefined,
      model,
      style_preset: style || undefined,
      variants,
      hide_watermark: hideWatermark,
      safe_mode: veniceApiSafeMode,
      steps,
    }

    // Sizing: only ONE shape goes on the wire. Models in the Nano Banana
    // class advertise `aspectRatios` and use the `aspect_ratio` field;
    // SD-classic models (flux-dev, z-image-turbo, hidream, etc.) do not
    // and require explicit `width`/`height`. Mixing them up produces a
    // 400 from the swagger's `additionalProperties: false` on some
    // model classes — surfaced to the user as a generic "invalid
    // params" / "dimensions issue" that this fix removes.
    if (hasAspectRatios && aspectRatio) {
      req.aspect_ratio = aspectRatio
    } else if (!hasAspectRatios) {
      req.width = size.w
      req.height = size.h
    }

    // Resolution for models that support named resolutions (e.g. Nano
    // Banana 1K/2K/4K). Additive on top of the aspect ratio.
    if (hasResolutions && resolution) {
      req.resolution = resolution
    }

    mutation.mutate(
      req as unknown as Parameters<typeof mutation.mutate>[0],
      {
        onSuccess: (data) => {
          const rawImages = data.images.map((img) => typeof img === 'string' ? img : img.b64_json)
          const processedImages: string[] = []
          const batchId = variants > 1 ? generateId() : null;
          const now = Date.now();

          rawImages.forEach((img, index) => {
            const { base64: processedImg, report } = processBase64Image(img);
            const routedFolder = routeAsset(req.prompt as string);
            processedImages.push(processedImg);

            const id = generateId();
            const mediaItem = {
              id,
              image: processedImg,
              prompt: req.prompt as string,
              negative: req.negative_prompt as string | undefined,
              model: req.model as string,
              width: req.width as number | undefined,
              height: req.height as number | undefined,
              aspectRatio: req.aspect_ratio as string | undefined,
              style: req.style_preset as string | undefined,
              steps: req.steps as number | undefined,
              cfg: req.cfg_scale as number | undefined,
              safeMode: req.safe_mode as boolean | undefined,
              disableWatermark: req.hide_watermark as boolean | undefined,
              batchId,
              batchIndex: batchId ? index : null,
              batchCount: batchId ? rawImages.length : null,
              timestamp: now,
              upscaled: false,
              mediaType: 'image' as const,
              operation: 'generate' as const,
              parentId: null,
              childrenIds: [] as string[],
              tags: [] as string[],
              note: '',
              favorite: false,
              metadataRemoved: report.metadataRemoved,
              originalBytes: report.originalBytes,
              processedBytes: report.processedBytes,
              mimeType: report.mimeType,
              assetCategory: routedFolder,
            };

            // BUG-003 regression guard: do NOT persist twice. The previous
            // implementation called `StorageService.saveItem("images", ...)`
            // AND then `useMediaStore.getState().upsert(mediaItem)`, but
            // `upsert` itself routes through `StorageService.putMedia` which
            // writes to the same `images` IDB store. Two IDB transactions
            // per generated image doubled write amplification and could
            // race on identical ids. The store `upsert` is the single
            // canonical path (it also migrates legacy GalleryImage fields
            // to the new MediaItem shape).
            void useMediaStore.getState().upsert(mediaItem);
          });

          setImages((prev) => [...processedImages, ...prev])
        },
      },
    )
  }

  const controls = (
    <>
      <div>
        <div className="flex items-center justify-between">
          <Label hint={`${prompt.length}/${promptLimit}`}>Prompt</Label>
          <div className="relative group">
            <select
              onChange={(e) => {
                const val = e.target.value;
                if (val) {
                  const t = PROMPT_TEMPLATES.find(x => x.id === val);
                  if (t) {
                    if (t.category === "negative") {
                      setNegativePrompt((prev) => prev ? `${prev}, ${t.appendText}` : t.appendText);
                    } else {
                      setPrompt((prev) => prev ? `${prev}${t.appendText}` : t.appendText.replace(/^, /, ""));
                    }
                  }
                  e.target.value = ""; // reset
                }
              }}
              className="text-[12px] bg-white/[0.04] text-white/50 border border-white/[0.08] rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent hover:text-white/80 transition-colors cursor-pointer"
              defaultValue=""
            >
              <option value="" disabled>Add Template...</option>
              {Object.entries(
                PROMPT_TEMPLATES.reduce((acc, t) => {
                  if (!acc[t.category]) acc[t.category] = [];
                  acc[t.category].push(t);
                  return acc;
                }, {} as Record<string, typeof PROMPT_TEMPLATES>)
              ).map(([category, items]) => (
                <optgroup key={category} label={category.toUpperCase()}>
                  {items.map(item => (
                    <option key={item.id} value={item.id} title={item.description}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        </div>
        <TextArea value={prompt} onChange={setPrompt} placeholder="A serene mountain landscape at golden hour…" />
      </div>
      <div><Label>Negative prompt</Label><TextArea value={negativePrompt} onChange={setNegativePrompt} placeholder="blurry, low quality…" rows={2} /></div>

      {hasAspectRatios ? (
        <div><Label>Aspect Ratio</Label><PillGroup options={aspectOptions} value={aspectRatio} onChange={setAspectRatio} /></div>
      ) : (
        <div><Label>Size</Label><PillGroup options={DEFAULT_SIZES} value={sizeIdx} onChange={setSizeIdx} /></div>
      )}

      {hasResolutions && (
        <div><Label>Resolution</Label><PillGroup options={resolutionOptions} value={resolution || resolutionOptions[0]?.value || ''} onChange={setResolution} /></div>
      )}

      <div><Label>Style</Label><Select value={style} onChange={setStyle} options={styleOptions} searchable placeholder="None" /></div>

      <div>
        <Label hint={String(steps)}>Steps</Label>
        <input type="range" min={1} max={maxSteps} value={steps} onChange={(e) => setSteps(Number(e.target.value))} className="w-full" />
      </div>
      <div>
        <Label hint={String(variants)}>Variants</Label>
        <input type="range" min={1} max={4} value={variants} onChange={(e) => setVariants(Number(e.target.value))} className="w-full" />
      </div>

      <PrimaryButton onClick={handleGenerate} disabled={!prompt.trim() || !hasVeniceKey} loading={mutation.isPending} size="lg">
        {mutation.isPending ? 'Generating…' : 'Generate'}
      </PrimaryButton>
      {mutation.error && <ErrorText>{mutation.error.message}</ErrorText>}
    </>
  )

  const output = (
    <>
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-sm animate-fade-in" onClick={() => setSelectedImage(null)}>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <img src={toImageSrc(selectedImage)} alt="Generated" className="max-w-[90vw] max-h-[90vh] rounded-xl shadow-2xl" />
            <div className="absolute top-3 right-3 flex gap-1.5">
              <button onClick={() => downloadImage(selectedImage)} aria-label="Download" className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white/70 hover:text-white transition-colors backdrop-blur-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              </button>
              <button onClick={() => setSelectedImage(null)} aria-label="Close" className="p-2 bg-black/60 hover:bg-black/80 rounded-lg text-white/70 hover:text-white transition-colors backdrop-blur-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        </div>
      )}
      {images.length === 0 ? (
        <div className="flex items-center justify-center h-full">
          {mutation.isPending ? (
            <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
              <div className="w-8 h-8 border-2 border-white/[0.08] border-t-[var(--color-accent)] rounded-full animate-spin" />
              <span className="text-[13px] text-white/55">Generating…</span>
            </div>
          ) : (
            <ExamplePrompts
              items={starters}
              onPick={setPrompt}
              onShuffle={() => setStarters(getPromptStartersForCategory('image', 4))}
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {mutation.isPending && Array.from({ length: variants }).map((_, i) => (
            <div key={`skel-${i}`} className="aspect-square rounded-xl skeleton" />
          ))}
          {images.map((img, i) => (
            <div key={i} className="relative group">
              <img
                src={toImageSrc(img)}
                alt={`Generated ${i + 1}`}
                className="w-full rounded-xl cursor-pointer border border-white/[0.05] hover:border-white/[0.18] transition-all duration-200"
                onClick={() => setSelectedImage(img)}
              />
              <button
                onClick={(e) => { e.stopPropagation(); downloadImage(img, i) }}
                aria-label="Download"
                className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/85 rounded-lg text-white/70 hover:text-white opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"
                title="Download"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )

  return <GenerationView controls={controls} output={output} />
}
