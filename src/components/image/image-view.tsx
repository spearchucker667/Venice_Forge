import { useState, useMemo, useEffect, useCallback } from 'react'
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
import type { MediaItem } from '../../types/media'
import { generateId } from '../../lib/utils'
import { getPromptStartersForCategory } from '../../services/promptStarterService'
import { isElectron } from '../../services/desktopBridge'
import { PROMPT_TEMPLATES } from '../../constants/promptTemplates'
import { processBase64Image, routeAsset } from '../../utils/imageProcessor'
import { getImageModelCapabilities, buildDimensionOptions } from '../../config/image-model-capabilities'
import { enhancePrompt } from '../../services/prompt-enhancer-service'
import type { ImageSeedState } from '../../utils/payloadBuilders'


function toImageSrc(b64: string): string {
  if (b64.startsWith('data:')) return b64
  if (b64.startsWith('/9j/')) return `data:image/jpeg;base64,${b64}`
  if (b64.startsWith('iVBOR')) return `data:image/png;base64,${b64}`
  if (b64.startsWith('UklGR')) return `data:image/webp;base64,${b64}`
  return `data:image/png;base64,${b64}`
}

const WH_OPTIONS = [
  { value: '512x512', label: '512×512', w: 512, h: 512 },
  { value: '512x768', label: '512×768', w: 512, h: 768 },
  { value: '576x1024', label: '576×1024', w: 576, h: 1024 },
  { value: '768x512', label: '768×512', w: 768, h: 512 },
  { value: '768x768', label: '768×768', w: 768, h: 768 },
  { value: '768x1024', label: '768×1024', w: 768, h: 1024 },
  { value: '1024x576', label: '1024×576', w: 1024, h: 576 },
  { value: '1024x768', label: '1024×768', w: 1024, h: 768 },
  { value: '1024x1024', label: '1024×1024', w: 1024, h: 1024 },
  { value: '1024x1280', label: '1024×1280', w: 1024, h: 1280 },
  { value: '1280x720', label: '1280×720', w: 1280, h: 720 },
  { value: '1280x1024', label: '1280×1024', w: 1280, h: 1024 },
  { value: '1280x1280', label: '1280×1280', w: 1280, h: 1280 },
]

export function ImageView() {
  const hasVeniceKey = useAuthStore(selectHasVeniceKey)
  const selectedModel = useSettingsStore((s) => s.selectedModels.image)
  const veniceApiSafeMode = useSettingsStore((s) => s.veniceApiSafeMode)
  const { data: models } = useModels('image')
  const { data: styles } = useStyles()
  const model = selectedModel || models?.[0]?.id || 'z-image-turbo'

  const modelData = models?.find((m) => m.id === model)
  const constraints = modelData?.model_spec?.constraints as ImageConstraints | undefined

  const caps = useMemo(() => getImageModelCapabilities(model), [model])
  const dimOptions = useMemo(() => buildDimensionOptions(model, constraints), [model, constraints])

  const hasAspectRatios = dimOptions.dimensionMode === "aspectRatio" && !!dimOptions.aspectRatios?.length
  const maxSteps = constraints?.steps?.max || 50
  const defaultSteps = constraints?.steps?.default || 20
  const promptLimit = constraints?.promptCharacterLimit || 4096

  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [starters, setStarters] = useState<string[]>(() => getPromptStartersForCategory('image', 4))
  const [sizeKey, setSizeKey] = useState('1024x1024')
  const [aspectRatio, setAspectRatio] = useState('')
  const [resolution, setResolution] = useState('')
  const [style, setStyle] = useState('')
  const [steps, setSteps] = useState(defaultSteps)
  const [variants, setVariants] = useState(1)
  const [hideWatermark] = useState(true)
  const [images, setImages] = useState<string[]>([])
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  // Seed state
  const [seedMode, setSeedMode] = useState<'off' | 'fixed'>('off')
  const [seedValue, setSeedValue] = useState<number>(Math.floor(Math.random() * 1000000000))

  // Enhance prompt review flow
  const [enhancing, setEnhancing] = useState(false)
  const [enhancedPrompt, setEnhancedPrompt] = useState<string | null>(null)
  const [showEnhanceReview, setShowEnhanceReview] = useState(false)

  const aspectOptions = useMemo(() => {
    if (!hasAspectRatios) return []
    return [
      ...(dimOptions.aspectRatios?.map((a) => ({ value: a.id, label: a.label })) ?? []),
    ]
  }, [dimOptions, hasAspectRatios])

  const resolutionOptions = useMemo(() => {
    if (!(dimOptions.resolutions?.length)) return []
    return dimOptions.resolutions.map((r) => ({ value: r.id, label: r.label }))
  }, [dimOptions])

  // Reset dimensions when model changes
  useEffect(() => {
    if (hasAspectRatios) {
      const next = dimOptions.defaultDimensions.aspectRatio ?? aspectOptions[0]?.value ?? '';
      setAspectRatio((prev) => prev || next);
      setSizeKey('1024x1024');
    } else {
      const def = caps.defaultDimensions;
      setSizeKey(`${def.width ?? 1024}x${def.height ?? 1024}`);
      setAspectRatio('');
    }
    if (defaultSteps && steps === 0) setSteps(defaultSteps);
  }, [caps, dimOptions, hasAspectRatios, aspectOptions, defaultSteps, steps]);

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

  const handleEnhance = useCallback(async () => {
    if (!prompt.trim()) return
    setEnhancing(true)
    try {
      const result = await enhancePrompt({
        mode: 'enhance',
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || null,
      })
      setEnhancedPrompt(result.prompt)
      setShowEnhanceReview(true)
    } catch {
      // error handled silently — user keeps original prompt
    } finally {
      setEnhancing(false)
    }
  }, [prompt, negativePrompt])

  const applyEnhancedPrompt = useCallback(() => {
    if (enhancedPrompt) setPrompt(enhancedPrompt)
    setShowEnhanceReview(false)
    setEnhancedPrompt(null)
  }, [enhancedPrompt])

  const cancelEnhanceReview = useCallback(() => {
    setShowEnhanceReview(false)
    setEnhancedPrompt(null)
  }, [])

  const buildSeedState = useCallback((): ImageSeedState => {
    if (seedMode === 'fixed') return { mode: 'fixed', value: seedValue }
    return { mode: 'off', value: null }
  }, [seedMode, seedValue])

  const handleGenerate = () => {
    if (!prompt.trim()) return

    const currentPrompt = enhancedPrompt && showEnhanceReview ? enhancedPrompt : prompt.trim()

    let width: number | undefined
    let height: number | undefined
    let aspectRatioField: string | undefined

    if (hasAspectRatios) {
      aspectRatioField = aspectRatio || undefined
    } else {
      const parts = sizeKey.split('x')
      width = Number(parts[0])
      height = Number(parts[1])
    }

    const seedState = buildSeedState()

    const req: Record<string, unknown> = {
      prompt: currentPrompt,
      negative_prompt: negativePrompt.trim() || undefined,
      model,
      style_preset: style || undefined,
      variants,
      hide_watermark: hideWatermark,
      safe_mode: veniceApiSafeMode,
      steps,
    }

    if (aspectRatioField) {
      req.aspect_ratio = aspectRatioField
    } else if (width && height) {
      req.width = width
      req.height = height
    }

    if (resolution) req.resolution = resolution

    // Apply seed
    if (seedState.mode === 'fixed') {
      req.seed = seedState.value
    }

    mutation.mutate(
      req as unknown as Parameters<typeof mutation.mutate>[0],
      {
        onSuccess: (data) => {
          const rawImages = data.images.map((img) => typeof img === 'string' ? img : img.b64_json)
          const processedImages: string[] = []
          const batchId = variants > 1 ? generateId() : null;
          const now = Date.now();
          const isEnhanced = enhancedPrompt !== null && prompt !== currentPrompt;

          rawImages.forEach((img, index) => {
            const { base64: processedImg, report } = processBase64Image(img);
            const routedFolder = routeAsset(currentPrompt);
            processedImages.push(processedImg);

            const id = generateId();
            const mediaItem: Record<string, unknown> = {
              id,
              image: processedImg,
              prompt: currentPrompt,
              negative: negativePrompt.trim() || undefined,
              model,
              width: req.width as number | undefined,
              height: req.height as number | undefined,
              aspectRatio: req.aspect_ratio as string | undefined,
              style: req.style_preset as string | undefined,
              steps: req.steps as number | undefined,
              cfg: req.cfg_scale as number | undefined,
              safeMode: req.safe_mode as boolean | undefined,
              disableWatermark: req.hide_watermark as boolean | undefined,
              seed: seedState.mode === 'fixed' ? seedState.value : undefined,
              source: 'image-page',
              batchId,
              batchIndex: batchId ? index : null,
              batchCount: batchId ? rawImages.length : null,
              timestamp: now,
              upscaled: false,
              mediaType: 'image',
              operation: 'generate',
              parentId: null,
              childrenIds: [],
              tags: [],
              note: '',
              favorite: false,
              metadataRemoved: report.metadataRemoved,
              originalBytes: report.originalBytes,
              processedBytes: report.processedBytes,
              mimeType: report.mimeType,
              assetCategory: routedFolder,
            };

            if (isEnhanced) {
              mediaItem.enhancedPrompt = currentPrompt;
              mediaItem.originalPrompt = prompt.trim();
            }

            void useMediaStore.getState().upsert(mediaItem as unknown as MediaItem);
          });

          setImages((prev) => [...processedImages, ...prev])
          setShowEnhanceReview(false)
          setEnhancedPrompt(null)
        },
      },
    )
  }

  const controls = (
    <>
      <div>
        <div className="flex items-center justify-between">
          <Label hint={`${prompt.length}/${promptLimit}`}>Prompt</Label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleEnhance}
              disabled={!prompt.trim() || enhancing}
              className="text-[11px] px-2 py-1 rounded-md bg-accent/10 text-accent hover:bg-accent/20 border border-accent/30 transition-colors disabled:opacity-50 cursor-pointer"
              aria-label="Enhance prompt"
              title="Use internal LLM to enhance this prompt"
            >
              {enhancing ? 'Enhancing…' : 'Enhance prompt'}
            </button>
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
                  e.target.value = "";
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

      {/* Enhance prompt review flow */}
      {showEnhanceReview && enhancedPrompt && (
        <div className="p-3 rounded-lg border border-accent/30 bg-accent/5">
          <Label>Enhanced Prompt Preview</Label>
          <div className="text-[12.5px] text-text-primary mt-1 p-2 rounded bg-surface border border-border">
            {enhancedPrompt}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={applyEnhancedPrompt}
              className="px-3 py-1 text-[11.5px] rounded-md bg-accent text-accent-fg hover:bg-accent-hover transition-colors cursor-pointer"
            >
              Use enhanced prompt
            </button>
            <button
              type="button"
              onClick={cancelEnhanceReview}
              className="px-3 py-1 text-[11.5px] rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              Keep original
            </button>
          </div>
        </div>
      )}

      <div><Label>Negative prompt</Label><TextArea value={negativePrompt} onChange={setNegativePrompt} placeholder="blurry, low quality…" rows={2} /></div>

      {hasAspectRatios ? (
        <div><Label>Aspect Ratio</Label><PillGroup options={aspectOptions} value={aspectRatio} onChange={setAspectRatio} /></div>
      ) : (
        <div>
          <Label>Dimensions</Label>
          <Select
            value={sizeKey}
            onChange={setSizeKey}
            options={WH_OPTIONS.map(o => ({ value: o.value, label: o.label }))}
          />
        </div>
      )}

      {(dimOptions.resolutions?.length) && (
        <div><Label>Resolution</Label><PillGroup options={resolutionOptions} value={resolution || resolutionOptions[0]?.value || ''} onChange={setResolution} /></div>
      )}

      <div><Label>Style</Label><Select value={style} onChange={setStyle} options={styleOptions} searchable placeholder="None" /></div>

      {/* Seed controls */}
      <div>
        <Label>Seed</Label>
        <div className="flex items-center gap-2 mt-1">
          <label className="flex items-center gap-1.5 text-[12px] text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={seedMode === 'fixed'}
              onChange={(e) => setSeedMode(e.target.checked ? 'fixed' : 'off')}
              className="rounded border-border bg-surface-elevated text-accent w-3.5 h-3.5 cursor-pointer"
            />
            Use fixed seed
          </label>
        </div>
        {seedMode === 'fixed' && (
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              value={seedValue}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!isNaN(v) && isFinite(v)) setSeedValue(v);
              }}
              min={-999999999}
              max={999999999}
              className="w-32 bg-surface-elevated border border-border rounded-md px-2 py-1 text-[12.5px] text-text-primary outline-none focus:border-accent transition-colors"
              aria-label="Seed value"
            />
            <button
              type="button"
              onClick={() => setSeedValue(Math.floor(Math.random() * 1000000000))}
              className="px-2 py-1 text-[11px] rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              aria-label="Randomize seed"
            >
              Randomize
            </button>
            <button
              type="button"
              onClick={() => setSeedMode('off')}
              className="px-2 py-1 text-[11px] rounded-md bg-surface border border-border text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
              aria-label="Clear seed"
            >
              Clear
            </button>
          </div>
        )}
      </div>

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
