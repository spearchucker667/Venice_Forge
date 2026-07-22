import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { useSettingsStore, type Tab } from '../../stores/settings-store'
import { selectConversationSummaries, useChatStore, type ConversationSummary } from '../../stores/chat-store'
import { useShallow } from 'zustand/shallow'
import { useProjectStore } from '../../stores/project-store'
import { toast } from '../../stores/toast-store'
import { VeniceLogo, VeniceWordmark } from '../ui/logo'
import { askDecision, askText } from '../ui/modal-requests'
import type { Conversation } from '../../types/conversation'
import { desktopConfig, isElectron } from '../../services/desktopBridge'
import { reloadConfig } from '../../stores/config-store'
import { TAB_REGISTRY, TAB_GROUP_LABELS, type TabGroup, type TabId } from '../../config/tabs'
import { contentToSearchText, contentToMarkdownText } from '../../utils/messageContent'
import { DEFAULT_CHAT_MODEL } from '../../constants/venice'
import { getConversationDisplayTitle } from '../../utils/conversationDisplayTitle'
import { CharacterAvatar } from '../characters/CharacterAvatar'
import { Meteocon } from '../ui/Meteocon'

function ChatIcon() {
  return <Meteocon name="clear-day" size={20} />
}
function CharacterChatsIcon() {
  return <Meteocon name="clear-night" size={20} />
}
function StatusIcon() {
  return <Meteocon name="humidity" size={20} />
}
function ImageIcon() {
  return <Meteocon name="rainbow-clear" size={20} />
}
function GalleryIcon() {
  return <Meteocon name="horizon" size={20} />
}
function AudioIcon() {
  return <Meteocon name="wind" size={20} />
}
function VideoIcon() {
  return <Meteocon name="partly-cloudy-day" size={20} />
}
function MusicIcon() {
  return <Meteocon name="star" size={20} />
}
function EmbedIcon() {
  return <Meteocon name="raindrop" size={20} />
}
function WorkflowIcon() {
  return <Meteocon name="code-purple" size={20} />
}
function HistoryIcon() {
  return <Meteocon name="time-morning" size={20} />
}
function PlaygroundIcon() {
  return <Meteocon name="snowflake" size={20} />
}
function SearchIcon() {
  return <Meteocon name="compass" size={20} />
}
function CharactersIcon() {
  return <Meteocon name="thunderstorms" size={20} />
}
function RpStudioIcon() {
  return <Meteocon name="tornado" size={20} />
}
function SettingsIcon() {
  return <Meteocon name="barometer" size={20} />
}
function PromptsIcon() {
  return <Meteocon name="code-green" size={20} />
}
function SceneIcon() {
  return <Meteocon name="cloudy" size={20} />
}
function PrivacyIcon() {
  return <Meteocon name="umbrella" size={20} />
}
function DocumentsIcon() {
  return <Meteocon name="thermometer" size={20} />
}

interface NavGroup {
  label: string
  items: Array<{ id: Tab; label: string; Icon: () => React.JSX.Element }>
}

/**
 * Sidebar icon registry. Centralising this here keeps `App.tsx` and tests
 * out of the JSX-icon business and makes it trivial to swap an icon for a
 * future tab — just add an entry keyed by tab id.
 */
const TAB_ICONS: Record<TabId, () => React.JSX.Element> = {
  chat: ChatIcon,
  'character-chats': CharacterChatsIcon,
  history: HistoryIcon,
  image: ImageIcon,
  media: GalleryIcon,
  prompts: PromptsIcon,
  scenes: SceneIcon,
  gallery: GalleryIcon,
  audio: AudioIcon,
  music: MusicIcon,
  video: VideoIcon,
  embeddings: EmbedIcon,
  search: SearchIcon,
  characters: CharactersIcon,
  'rp-studio': RpStudioIcon,
  workflows: WorkflowIcon,
  documents: DocumentsIcon,
  privacy: PrivacyIcon,
  playground: PlaygroundIcon,
  settings: SettingsIcon,
  status: StatusIcon,
  // Unused legacy ids — fall back to a generic icon if ever rendered.
  models: EmbedIcon,
  batch: WorkflowIcon,
  diagnostics: StatusIcon,
}

const GROUP_ORDER: readonly TabGroup[] = ['conversation', 'generate', 'build', 'system']
const MAX_CONVERSATION_SEARCH_RESULTS = 200

export function buildConversationSearchText(conversation: Conversation): string {
  return [
    conversation.title,
    ...conversation.messages.flatMap((message) => [
      contentToSearchText(message.content),
      typeof message.reasoning_content === 'string' ? message.reasoning_content : '',
    ]),
  ].join('\n').toLowerCase()
}

const navGroups: NavGroup[] = GROUP_ORDER.map((group) => ({
  label: TAB_GROUP_LABELS[group],
  items: TAB_REGISTRY
    .filter((t) => t.group === group)
    .map((t) => ({ id: t.id, label: t.label, Icon: TAB_ICONS[t.id] ?? ChatIcon })),
}))

interface Props {
  mobileOpen?: boolean
  onMobileClose?: () => void
}

export function Sidebar({ mobileOpen, onMobileClose }: Props) {
  const activeTab = useSettingsStore((s) => s.activeTab)
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)
  const sidebarOpen = useSettingsStore((s) => s.sidebarOpen)
  const redTeamMode = useSettingsStore((s) => s.redTeamMode)
  const setRedTeamMode = useSettingsStore((s) => s.setRedTeamMode)
  const localFamilySafeModeEnabled = useSettingsStore((s) => s.localFamilySafeModeEnabled)
  const setLocalFamilySafeModeEnabled = useSettingsStore((s) => s.setLocalFamilySafeModeEnabled)
  const showInspector = useSettingsStore((s) => s.showInspector)
  const setShowInspector = useSettingsStore((s) => s.setShowInspector)
  const conversationSummaries = useChatStore(useShallow(selectConversationSummaries))
  const activeConversationId = useChatStore((s) => s.activeConversationId)
  const activeProjectId = useSettingsStore((s) => s.activeProjectId)
  const projects = useProjectStore((s) => s.projects)
  // Derive active (non-archived) list via useMemo over the stable projects array ref
  // from the store. Using (s) => s.activeProjects() inside useProjectStore selector
  // allocates a fresh array on every snapshot/equality check and triggers
  // "Maximum update depth" + "getSnapshot should be cached" during passive mount
  // effects in React 19 + jsdom (observed in full serial and isolated sidebar mounts).
  const activeProjectList = useMemo(() => projects.filter((p) => !p.archivedAt), [projects])

  // Note: ensureProjectsLoaded (with default) is called from App root effect to avoid multiple effects in sidebar mounts/tests that could contribute to update depth.
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const createConversation = useChatStore((s) => s.createConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const selectedModel = useSettingsStore((s) => s.selectedModels.chat)
  const [search, setSearch] = useState('')
  const [chatOptionsOpen, setChatOptionsOpen] = useState(false)
  const [historyExpanded, setHistoryExpanded] = useState(true)
  const chatOptionsRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  

  const toggleRedTeamMode = () => {
    const enabled = !redTeamMode
    setRedTeamMode(enabled)
    if (enabled) setShowInspector(true)
    toast.success(
      enabled ? 'Traffic Inspector enabled' : 'Traffic Inspector disabled',
      enabled ? 'Raw responses, safety decisions, and adult character controls are visible.' : 'Standard rendering restored.',
    )
  }

  const toggleFamilySafeMode = async () => {
    const enabled = !localFamilySafeModeEnabled
    setLocalFamilySafeModeEnabled(enabled)
    if (isElectron()) {
      const result = await desktopConfig.writeSanitized({
        safety: { local_family_safe_mode_enabled: enabled },
      })
      if (!result.ok) {
        setLocalFamilySafeModeEnabled(!enabled)
        toast.error('Family Safe Mode was not saved', result.error || 'Config write failed.')
        return
      }
      await reloadConfig()
    }
    // Note: the local family filter and Venice API's `safe_mode` parameter
    // are independent. Toggling this switch does NOT change Venice API
    // Safe Mode; see Settings → Safety for that control.
    toast.success(
      enabled
        ? 'Family Safe Mode enabled — local family filter runs on every prompt'
        : 'Adult Mode enabled — local family filter is skipped',
    )
  }

  const deferredSearch = useDeferredValue(search)
  const standardConversations = useMemo(
    () => conversationSummaries.filter((conversation) => conversation.kind === 'standard'),
    [conversationSummaries],
  )
  const searchIndex = useMemo(() => {
    if (!historyExpanded || !deferredSearch.trim()) return []
    return standardConversations.map((conversation) => ({ conversation, text: conversation.searchablePreview }))
  }, [standardConversations, deferredSearch, historyExpanded])
  const searchResult = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    if (!query) return { conversations: standardConversations.slice(0, MAX_CONVERSATION_SEARCH_RESULTS), totalMatches: standardConversations.length }

    const matches: ConversationSummary[] = []
    let totalMatches = 0
    for (const entry of searchIndex) {
      if (!entry.text.includes(query)) continue
      totalMatches += 1
      if (matches.length < MAX_CONVERSATION_SEARCH_RESULTS) matches.push(entry.conversation)
    }
    return { conversations: matches, totalMatches }
  }, [deferredSearch, searchIndex, standardConversations])
  const filtered = searchResult.conversations

  const handleDelete = async (conv: ConversationSummary) => {
    const durableConversation = useChatStore.getState().conversations.find((candidate) => candidate.id === conv.id)
    await deleteConversation(conv.id)
    toast.error('Conversation deleted', conv.title || 'Untitled', {
      label: 'Undo',
      onClick: async () => {
        // Persist the undo: re-insert the conversation at the top of the
        // list AND write it back through the same IPC save path so the
        // main-process file on disk matches the renderer state. A
        // previous version only mutated the in-memory Zustand state,
        // which would be lost on the next reload because the canonical
        // source of truth is the JSON file under `chat-history/`.
        try {
          if (!durableConversation) throw new Error('Conversation is no longer available to restore.')
          await useChatStore.getState().restoreConversation(durableConversation)
          toast.success('Conversation restored')
        } catch (err) {
          toast.fromError(err, 'Failed to restore')
        }
      },
    })
  }

  const exportConversation = (summary: ConversationSummary) => {
    const conv = useChatStore.getState().conversations.find((candidate) => candidate.id === summary.id)
    if (!conv) return
    const md = conversationToMarkdown(conv)
    const blob = new Blob([md], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(conv.title || 'conversation').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const startNewChat = () => {
    createConversation(selectedModel || DEFAULT_CHAT_MODEL)
    setActiveTab('chat')
    setChatOptionsOpen(false)
    onMobileClose?.()
  }

  const activeConversation = conversationSummaries.find((conversation) => conversation.id === activeConversationId)

  useEffect(() => {
    if (!chatOptionsOpen) return
    const closeOnPointerDown = (event: MouseEvent) => {
      if (!chatOptionsRef.current?.contains(event.target as Node)) setChatOptionsOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setChatOptionsOpen(false)
    }
    document.addEventListener('mousedown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [chatOptionsOpen])

  const expanded = sidebarOpen || mobileOpen

  return (
    <aside
      aria-label="Primary navigation"
      className={cn(
        'flex flex-col h-full min-h-0 mesh-surface mesh-sidebar soft-separator-x shell-region',
        'fixed top-0 left-0 z-40 w-72 h-[100dvh] md:static md:h-full md:w-auto',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        sidebarOpen ? 'md:w-64' : 'md:w-[60px]',
      )}
    >
      <div className={cn('flex items-center gap-2.5 h-14 shrink-0 soft-separator-y', expanded ? 'px-4' : 'md:px-3 md:justify-center px-4')}>
        <VeniceLogo size={20} />
        {expanded && <VeniceWordmark className="text-[15px] tracking-tight" />}
        <button
          onClick={onMobileClose}
          aria-label="Close menu"
          className="md:hidden ml-auto p-2 text-text-secondary hover:text-text-primary rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      {/* Project Workspace (polished Phase 1 slice).
          Real switcher (select), create, rename, archive, reference-safe delete.
          New assets (e.g. chats) default to active project via projectRefs.
          Default project is ensured on load (safe for fresh/corrupt/migration). */}
      {expanded && (
        <div className="px-3 pt-1 pb-2 soft-separator-y shrink-0">
          <div className="text-[12px] uppercase tracking-[0.08em] text-text-muted font-semibold mb-1.5 px-1 flex items-center justify-between">
            <span>Project</span>
            <button
              onClick={async () => {
                const name = (await askText({
                  title: 'New project name',
                  actionLabel: 'Create',
                  validate: (value) => value.trim() ? null : 'Enter a project name.',
                }))?.trim()
                if (!name) return
                try {
                  const p = await useProjectStore.getState().createProject(name)
                  useProjectStore.getState().setActiveProject(p.id)
                  toast.success(`Created "${p.name}"`)
                } catch (e: unknown) {
                  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : 'Failed to create project'
                  toast.error(msg)
                }
              }}
              className="text-[12px] normal-case tracking-normal border border-transparent bg-surface-elevated rounded px-1.5 py-0.5 hover:border-text-muted"
              title="Create new project"
            >
              + New
            </button>
          </div>

          <select
            value={activeProjectId || ''}
            onChange={(e) => {
              const id = e.currentTarget.value || null
              useProjectStore.getState().setActiveProject(id)
            }}
            className="w-full text-[12.5px] rounded-md mesh-input px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="Active project"
            title="Switch active project"
          >
            <option value="">All Projects</option>
            {activeProjectList.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={startNewChat}
            className="mesh-input mt-2 flex w-full items-center justify-center rounded-lg px-3 py-2 text-[13px] font-semibold text-text-primary hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            title="New chat (⌘N)"
          >
            + New chat
          </button>

          {activeProjectId && (
            <div className="mt-1.5 flex gap-1.5 text-[12px]">
              <button
                onClick={async () => {
                  const current = projects.find((p) => p.id === activeProjectId)
                  if (!current) return
                  const name = (await askText({
                    title: 'Rename project',
                    initialValue: current.name,
                    actionLabel: 'Rename',
                    validate: (value) => value.trim() ? null : 'Enter a project name.',
                  }))?.trim()
                  if (!name || name === current.name) return
                  await useProjectStore.getState().renameProject(activeProjectId, name)
                  toast.success('Project renamed')
                }}
                className="rounded border border-transparent bg-surface-elevated px-1.5 py-0.5 hover:border-text-muted"
              >
                Rename
              </button>
              <button
                onClick={async () => {
                  if (!activeProjectId) return
                  const shouldArchive = await askDecision({
                    title: 'Archive project?',
                    detail: 'Media and conversation references will be preserved.',
                    actionLabel: 'Archive',
                  })
                  if (!shouldArchive) return
                  await useProjectStore.getState().archiveProject(activeProjectId)
                  toast.success('Project archived')
                }}
                className="rounded border border-transparent bg-surface-elevated px-1.5 py-0.5 hover:border-text-muted"
              >
                Archive
              </button>
              <button
                onClick={async () => {
                  if (!activeProjectId) return
                  const shouldDelete = await askDecision({
                    title: 'Delete project?',
                    detail: 'Projects referenced by media or conversations must be archived instead.',
                    actionLabel: 'Delete',
                    danger: true,
                  })
                  if (!shouldDelete) return
                  const ok = await useProjectStore.getState().deleteProject(activeProjectId)
                  if (ok) toast.success('Project deleted')
                  else toast.error('Project cannot be deleted while media or conversations reference it. Archive it instead.')
                }}
                className="rounded border border-transparent bg-surface-elevated px-1.5 py-0.5 hover:border-text-muted text-danger"
              >
                Delete
              </button>
            </div>
          )}
          <div className="mt-1 px-1 text-[9px] text-text-muted/60">Projects are IDB-encrypted • generated items use the active project</div>
        </div>
      )}

      {/* Scrollable middle section: nav + history share the remaining height. */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <nav aria-label="Sections" className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3 py-3">
          {navGroups.map((group) => (
            <div key={group.label} className={cn(expanded ? 'px-2' : 'md:px-1.5 px-2')}>
              {expanded && (
                <div className="px-2 pb-1.5 text-[12px] uppercase tracking-[0.1em] text-text-muted font-semibold">
                  {group.label}
                </div>
              )}
              <div className="flex flex-col gap-px">
                {group.items.map(({ id, label, Icon }) => {
                  const isActive = activeTab === id
                  return (
                    <button
                      key={id}
                      onClick={() => { setActiveTab(id); onMobileClose?.() }}
                      aria-current={isActive ? 'page' : undefined}
                      title={!expanded ? label : undefined}
                      className={cn(
                        'relative flex items-center gap-2.5 rounded-lg text-[14px] transition-all duration-150 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 cursor-pointer',
                        expanded ? 'px-2.5 py-2' : 'md:px-0 md:py-2 md:justify-center px-2.5 py-2',
                        isActive
                          ? 'bg-accent/10 text-accent font-semibold'
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40',
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-accent" />
                      )}
                      <Icon />
                      {expanded && <span className="font-medium">{label}</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {expanded && activeTab === 'chat' && (
          <div className="flex flex-col flex-1 min-h-0 soft-separator-y">
            <div className="relative flex items-center justify-between px-3 pt-3 pb-1.5 shrink-0" ref={chatOptionsRef}>
              <button
                type="button"
                onClick={() => setHistoryExpanded((open) => !open)}
                aria-expanded={historyExpanded}
                aria-controls="chat-history-list"
                aria-label={historyExpanded ? "Collapse History" : "Expand History"}
                title={historyExpanded ? "Collapse History" : "Expand History"}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-text-muted uppercase tracking-[0.1em] hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded px-1 -ml-1 cursor-pointer"
              >
                History
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transition-transform duration-200 ${historyExpanded ? '' : '-rotate-90'}`}
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setChatOptionsOpen((open) => !open)}
                aria-label="Chat options"
                aria-haspopup="menu"
                aria-expanded={chatOptionsOpen}
                className="mesh-input text-text-secondary hover:text-text-primary p-1.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent cursor-pointer"
                title="Chat options"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>
              </button>
              {chatOptionsOpen && (
                <div role="menu" aria-label="Chat options" className="mesh-panel absolute right-3 top-10 z-50 min-w-48 rounded-xl p-1.5 text-[12.5px] shadow-xl">
                  <button role="menuitem" className="menu-action" onClick={startNewChat}>New chat</button>
                  <button role="menuitem" className="menu-action" onClick={() => { setChatOptionsOpen(false); searchInputRef.current?.focus() }}>Search chats</button>
                  <button role="menuitem" className="menu-action" disabled={!activeConversation} onClick={() => { if (activeConversation) exportConversation(activeConversation); setChatOptionsOpen(false) }}>Export active chat</button>
                  <button role="menuitem" className="menu-action text-danger" disabled={!activeConversation} onClick={async () => {
                    if (activeConversation) {
                      const shouldDelete = await askDecision({
                        title: 'Delete chat?',
                        detail: activeConversation.title || 'Untitled',
                        actionLabel: 'Delete',
                        danger: true,
                      })
                      if (shouldDelete) void handleDelete(activeConversation)
                    }
                    setChatOptionsOpen(false)
                  }}>Delete active chat</button>
                  <button role="menuitem" className="menu-action" disabled={!activeConversationId} onClick={() => { setActiveConversation(null); setChatOptionsOpen(false) }}>Clear active chat selection</button>
                </div>
              )}
            </div>
            {historyExpanded && (
              <div id="chat-history-list" className="flex flex-col flex-1 min-h-0">
                <div className="px-3 pb-2 shrink-0">
                    <input
                      ref={searchInputRef}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search…"
                      aria-label="Search conversations"
                      className="mesh-input w-full rounded-md px-2.5 py-1 text-[13px] text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
                    />
                    {deferredSearch !== search && (
                      <div role="status" className="pt-1 text-[12px] text-text-muted">Searching…</div>
                    )}
                    {deferredSearch.trim() && searchResult.totalMatches > filtered.length && (
                      <div role="status" className="pt-1 text-[12px] text-text-muted">
                        Showing first {filtered.length} of {searchResult.totalMatches} matches
                      </div>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-3 min-h-0" role="list">
                  {filtered.length === 0 ? (
                    <div className="px-2 py-6 text-[13px] text-text-muted text-center">
                      {deferredSearch ? 'No matches' : 'No conversations yet'}
                    </div>
                  ) : (
                    filtered.map((conv) => (
                      <ConversationRow
                        key={conv.id}
                        conv={conv}
                        isActive={conv.id === activeConversationId}
                        onSelect={() => setActiveConversation(conv.id)}
                        onDelete={() => handleDelete(conv)}
                        onExport={() => exportConversation(conv)}
                      />
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="shrink-0 soft-separator-y p-3 gap-2 flex flex-col">
          {/* Traffic Inspector controls */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-text-muted leading-none">Traffic Inspector</span>
              <p className="text-[12px] leading-snug text-text-muted mt-0.5 [@media(max-height:800px)]:hidden">
                Shows raw model output and local safety decisions.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={redTeamMode}
              onClick={toggleRedTeamMode}
              className={cn(
                "w-8 h-4 rounded-full transition-colors relative cursor-pointer shrink-0",
                redTeamMode ? "bg-accent" : "bg-border"
              )}
              aria-label="Toggle Traffic Inspector"
            >
              <div className={cn(
                "w-3.5 h-3.5 rounded-full bg-surface-elevated shadow-sm absolute top-[1px] transition-all",
                redTeamMode ? "left-4" : "left-[1px]"
              )} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="min-w-0">
              <span className="text-[12px] font-semibold uppercase tracking-wider text-text-muted leading-none">Family Safe Mode</span>
              <p className="text-[12px] leading-snug text-text-muted mt-0.5 [@media(max-height:800px)]:hidden">
                {localFamilySafeModeEnabled ? 'ON: local family filter runs.' : 'OFF: Adult Mode skips the local filter.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={localFamilySafeModeEnabled}
              onClick={() => void toggleFamilySafeMode()}
              className={cn(
                "w-8 h-4 rounded-full transition-colors relative cursor-pointer shrink-0",
                localFamilySafeModeEnabled ? "bg-accent" : "bg-border"
              )}
              aria-label="Toggle Family Safe Mode"
              title={localFamilySafeModeEnabled ? "Family Safe Mode enabled" : "Adult Mode enabled"}
            >
              <div className={cn(
                "w-3.5 h-3.5 rounded-full bg-surface-elevated shadow-sm absolute top-[1px] transition-all",
                localFamilySafeModeEnabled ? "left-4" : "left-[1px]"
              )} />
            </button>
          </div>

          <button
            onClick={() => setShowInspector(!showInspector)}
            className={cn(
              "flex items-center justify-center gap-1.5 w-full py-1.5 px-2 border rounded-md text-[12px] font-semibold transition-colors cursor-pointer shrink-0",
              showInspector ? "bg-accent/10 border-accent text-accent" : "border-border text-text-secondary hover:border-accent hover:text-accent"
            )}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <span>{showInspector ? 'Hide Inspector' : 'Show Inspector'}</span>
          </button>
          <div className="pt-2 text-[12px] text-text-secondary flex flex-col gap-1 shrink-0 [@media(max-height:800px)]:hidden">
            <div className="flex justify-between items-center leading-none"><span>New chat</span><kbd className="font-mono text-text-muted">⌘N</kbd></div>
            <div className="flex justify-between items-center leading-none"><span>Switch tab</span><kbd className="font-mono text-text-muted">⌘1-8</kbd></div>
          </div>
        </div>
      )}
    </aside>
  )
}

function ConversationRow({ conv, isActive, onSelect, onDelete, onExport }: {
  conv: ConversationSummary
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onExport: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) {
        clearTimeout(confirmTimeoutRef.current)
      }
    }
  }, [])

  const startConfirm = () => {
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
    setConfirming(true)
    confirmTimeoutRef.current = setTimeout(() => setConfirming(false), 2500)
  }

  const cancelConfirm = () => {
    if (confirmTimeoutRef.current) {
      clearTimeout(confirmTimeoutRef.current)
      confirmTimeoutRef.current = null
    }
    setConfirming(false)
  }

  return (
    <div
      role="listitem"
      className={cn(
        'group relative flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[13px] cursor-pointer transition-colors',
        isActive
          ? 'bg-accent/15 text-accent font-semibold'
          : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive ? 'page' : undefined}
        className="min-w-0 flex flex-1 items-center gap-2 truncate text-left rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
      >
        {conv.character && <CharacterAvatar character={conv.character} cacheKey={`sidebar-${conv.id}`} size="sm" />}
        <span className="truncate">{getConversationDisplayTitle(conv)}</span>
      </button>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onExport() }}
          aria-label={`Export ${conv.title}`}
          title="Export as Markdown"
          className="text-text-secondary hover:text-text-primary p-1 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent cursor-pointer"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
        </button>
        {confirming ? (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); cancelConfirm() }}
            aria-label="Confirm delete"
            className="text-danger hover:underline px-1.5 text-[12px] font-semibold rounded cursor-pointer"
          >
            Delete?
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); startConfirm() }}
            aria-label={`Delete ${conv.title}`}
            title="Delete"
            className="text-text-secondary hover:text-danger p-1 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent cursor-pointer"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

function conversationToMarkdown(conv: Conversation): string {
  const lines: string[] = [`# ${getConversationDisplayTitle(conv)}`, '', `_Model: ${conv.model} · Created: ${new Date(conv.createdAt).toISOString()}_`, '']
  for (const m of conv.messages) {
    lines.push(`## ${m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Assistant' : 'System'}`)
    lines.push(contentToMarkdownText(m.content))
    lines.push('')
  }
  return lines.join('\n')
}
