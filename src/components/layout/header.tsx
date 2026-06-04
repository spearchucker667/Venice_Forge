import { useSettingsStore } from '../../stores/settings-store'
import { useModels } from '../../hooks/use-models'
import { useAuthStore } from '../../stores/auth-store'
import { Select } from '../ui/select'
import { StatusDot } from '../ui/shared'

const modelTypeMap: Record<string, string> = {
  chat: 'text',
  image: 'image',
  audio: 'tts',
  music: 'music',
  video: 'video',
  embeddings: 'embedding',
}

const tabLabels: Record<string, string> = {
  chat: 'Chat',
  image: 'Image',
  audio: 'Audio',
  music: 'Music',
  video: 'Video',
  embeddings: 'Embeddings',
  workflows: 'Workflows',
  playground: 'Playground',
}

const tabSubtitles: Record<string, string> = {
  chat: 'Conversational AI',
  image: 'Generate images from text',
  audio: 'Text-to-speech and transcription',
  music: 'Generate music and sound',
  video: 'Generate video clips',
  embeddings: 'Vector representations of text',
  workflows: 'Chain models visually',
  playground: 'Build workflows by chatting',
}

const noModelSelector = new Set(['video', 'workflows', 'playground'])

interface Props {
  onOpenApiKey: () => void
  onOpenMobileSidebar?: () => void
}

export function Header({ onOpenApiKey, onOpenMobileSidebar }: Props) {
  const { activeTab, selectedModels, setSelectedModel, toggleSidebar } = useSettingsStore()
  const apiKey = useAuthStore((s) => s.apiKey)
  const hasOwnSelector = noModelSelector.has(activeTab)
  const modelType = modelTypeMap[activeTab] || 'text'
  const { data: models } = useModels(hasOwnSelector ? undefined : modelType)
  const currentModel = hasOwnSelector ? '' : (selectedModels[activeTab] || models?.[0]?.id || '')
  const modelOptions = hasOwnSelector ? [] : (models?.map((m) => ({ value: m.id, label: m.model_spec?.name || m.id })) ?? [])

  return (
    <header className="flex items-center gap-3 h-14 px-3 border-b border-white/[0.05] bg-surface shrink-0">
      <button
        onClick={() => onOpenMobileSidebar?.()}
        aria-label="Open menu"
        className="md:hidden text-white/55 hover:text-white transition-colors p-1.5 -ml-1 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>

      <button
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
        className="hidden md:block text-white/55 hover:text-white transition-colors p-1.5 -ml-1 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <path d="M3 4h18M3 12h12M3 20h18" />
        </svg>
      </button>

      <div className="flex flex-col min-w-0">
        <span className="text-[14px] font-semibold text-white/95 leading-none">{tabLabels[activeTab]}</span>
        <span className="text-[11px] text-white/40 mt-0.5 leading-none truncate hidden sm:block">{tabSubtitles[activeTab]}</span>
      </div>

      {!hasOwnSelector && (
        <>
          <div className="w-px h-5 bg-white/[0.07] hidden sm:block" aria-hidden />
          <Select
            value={currentModel}
            onChange={(v) => setSelectedModel(activeTab, v)}
            options={modelOptions}
            searchable
            placeholder="Select model…"
            className="w-44 sm:w-64"
          />
        </>
      )}

      <div className="flex-1" />

      <button
        onClick={onOpenApiKey}
        aria-label={apiKey ? 'API key connected, manage' : 'Connect API key'}
        className="flex items-center gap-2 text-[13px] px-2.5 py-1.5 rounded-md border border-white/[0.08] hover:border-white/[0.2] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
      >
        <StatusDot tone={apiKey ? 'teal' : 'slate'} pulsing={!apiKey} />
        <span className={apiKey ? 'text-white/85 font-medium' : 'text-white/65'}>
          {apiKey ? 'Connected' : 'Connect API key'}
        </span>
      </button>
    </header>
  )
}
