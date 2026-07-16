import { useShallow } from 'zustand/shallow'
import { useSettingsStore } from '../../stores/settings-store'
import { selectActiveConversationCharacter, selectActiveConversationModel, useChatStore } from '../../stores/chat-store'
import { useModels } from '../../hooks/use-models'
import { selectHasVeniceKey, useAuthStore } from '../../stores/auth-store'
import { ModelSelect } from '../ModelSelect'
import { StatusDot } from '../ui/shared'
import { HeaderStatusCluster } from '../status/HeaderStatusCluster'
import { useTaskUIStore } from '../../stores/task-ui-store'
import { selectActiveTaskCount, useBackgroundTaskStore } from '../../stores/background-task-store'
import { getActiveProfileId } from '../../services/activeProfile'
import { resolveTab } from '../../config/tabs'
import { formatModelLabelWithCost } from '../../utils/pricing'
import { CharacterAvatar } from '../characters/CharacterAvatar'
import type { ModelInfo, VeniceModel } from '../../types/venice'
import { useCallback, useMemo } from 'react'

interface Props {
  onOpenApiKey: () => void
  onOpenMobileSidebar?: () => void
}

export function Header({ onOpenApiKey, onOpenMobileSidebar }: Props) {
  const { activeTab, selectedModels, setSelectedModel, toggleSidebar } = useSettingsStore(
    useShallow((s) => ({ activeTab: s.activeTab, selectedModels: s.selectedModels, setSelectedModel: s.setSelectedModel, toggleSidebar: s.toggleSidebar })),
  )
  const { activeConversationId, setActiveConversation, setConversationModel } = useChatStore(
    useShallow((s) => ({ activeConversationId: s.activeConversationId, setActiveConversation: s.setActiveConversation, setConversationModel: s.setConversationModel }))
  )
  const activeConversationModel = useChatStore(selectActiveConversationModel)
  const activeCharacter = useChatStore(selectActiveConversationCharacter)
  const hasVeniceKey = useAuthStore(selectHasVeniceKey)
  const authHydrationStatus = useAuthStore((state) => state.hydrationStatus)
  const toggleTaskCenter = useTaskUIStore((s) => s.toggleTaskCenter)

  const currentProfileId = getActiveProfileId()
  const taskCountSelector = useMemo(() => selectActiveTaskCount(currentProfileId), [currentProfileId])
  const activeTaskCount = useBackgroundTaskStore(taskCountSelector)
  const tabDesc = resolveTab(activeTab)
  const hasOwnSelector = tabDesc?.modelSelectorOwner === 'view' || !tabDesc?.modelType
  const modelType = tabDesc?.modelType || 'text'
  const { data: models } = useModels(hasOwnSelector ? undefined : modelType)
  const currentModel = hasOwnSelector ? '' : (activeConversationModel || selectedModels[activeTab] || '')

  const getModelLabel = useCallback((m: ModelInfo) => {
    return (modelType === 'image' || modelType === 'video') ? formatModelLabelWithCost(m as unknown as VeniceModel) : m.name || m.display_name || m.id;
  }, [modelType]);

  return (
    <header className="flex items-center gap-3 h-14 px-3 soft-separator-y mesh-surface mesh-header shrink-0 shell-region">
      <button
        type="button"
        onClick={() => onOpenMobileSidebar?.()}
        aria-label="Open menu"
        className="md:hidden text-text-secondary hover:text-text-primary transition-colors p-1.5 -ml-1 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] cursor-pointer"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
        </svg>
      </button>

      <button
        type="button"
        onClick={toggleSidebar}
        aria-label="Toggle sidebar"
        className="hidden md:block text-text-secondary hover:text-text-primary transition-colors p-2 -ml-1 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] cursor-pointer"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
          <path d="M3 4h18M3 12h12M3 20h18" />
        </svg>
      </button>

      <div className="flex items-center gap-2 min-w-0">
        {activeCharacter && <CharacterAvatar character={activeCharacter} cacheKey={`header-${activeConversationId}`} size="md" />}
        <div className="flex flex-col min-w-0">
          <span className="text-[14px] font-semibold text-text-primary leading-none">{tabDesc?.label ?? activeTab}</span>
          <span className="text-[12px] text-text-muted mt-0.5 leading-none truncate hidden sm:block">{tabDesc?.subtitle ?? ''}</span>
        </div>
      </div>

      {!hasOwnSelector && (
        <>
          <div className="w-px h-5 bg-border hidden sm:block" aria-hidden />
          <div className="flex items-center gap-1.5">
            <ModelSelect
              value={currentModel}
              models={(models as unknown as ModelInfo[]) || []}
              onChange={(v) => {
                if ((activeTab === 'chat' || activeTab === 'character-chats') && activeConversationId) {
                  setConversationModel(activeConversationId, v)
                  return
                }
                setSelectedModel(activeTab, v)
              }}
              getLabel={getModelLabel}
              placeholder="Select model…"
              ariaLabel="Selected model"
              className="w-36 sm:w-44 xl:w-64"
            />
            {(activeTab === 'chat' || activeTab === 'character-chats') && activeConversationId !== null && (
              <button
                type="button"
                onClick={() => setActiveConversation(null)}
                aria-label="New chat"
                title="New Chat (⌘N)"
                className="flex items-center justify-center w-8 h-8 rounded-md border border-transparent bg-surface-elevated hover:border-text-muted hover:bg-surface-elevated text-text-secondary hover:text-text-primary transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              </button>
            )}
          </div>
        </>
      )}

      <div className="flex-1" />

      <button
        type="button"
        onClick={toggleTaskCenter}
        aria-label="Toggle task center"
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-md border border-transparent bg-surface-elevated hover:border-text-muted transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent cursor-pointer"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span className="text-[13px] hidden xl:inline text-text-secondary">
          Tasks
        </span>
        {activeTaskCount > 0 && (
          <span className="flex items-center justify-center w-5 h-5 rounded-full bg-accent text-accent-fg text-[11px] font-bold">
            {activeTaskCount}
          </span>
        )}
      </button>

      <HeaderStatusCluster />

      <button
        type="button"
        onClick={onOpenApiKey}
        aria-label={authHydrationStatus === 'checking' ? 'Checking API key' : hasVeniceKey ? 'API key connected, manage' : 'Connect API key'}
        className="flex items-center gap-2 text-[13px] px-2.5 py-1.5 rounded-md border border-transparent bg-surface-elevated hover:border-text-muted transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2 cursor-pointer"
      >
        <StatusDot tone={hasVeniceKey ? 'teal' : 'slate'} pulsing={authHydrationStatus === 'checking' || !hasVeniceKey} />
        <span className={`hidden xl:inline ${hasVeniceKey ? 'text-text-primary font-medium' : 'text-text-secondary'}`}>
          {authHydrationStatus === 'checking' ? 'Checking key…' : hasVeniceKey ? 'Connected' : 'Connect API key'}
        </span>
      </button>
    </header>
  )
}
