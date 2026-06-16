import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '../../lib/utils'
import { useSettingsStore, type Tab } from '../../stores/settings-store'
import { useChatStore } from '../../stores/chat-store'
import { useProjectStore } from '../../stores/project-store'
import { toast } from '../../stores/toast-store'
import { VeniceLogo, VeniceWordmark } from '../ui/logo'
import { askDecision, askText } from '../ui/modal-requests'
import type { Conversation } from '../../types/conversation'
import { desktopConfig, isElectron } from '../../services/desktopBridge'
import { reloadConfig } from '../../stores/config-store'
import { TAB_REGISTRY, TAB_GROUP_LABELS, type TabGroup, type TabId } from '../../config/tabs'
import { contentToSearchText, contentToMarkdownText } from '../../utils/messageContent'

function ChatIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>)
}
function StatusIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v6l4 2" /></svg>)
}
function ImageIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>)
}
function GalleryIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>)
}
function AudioIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" /></svg>)
}
function VideoIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>)
}
function MusicIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="17.5" r="2.5" /><circle cx="17.5" cy="15.5" r="2.5" /><path d="M8 17.5V5l12-2v12.5" /></svg>)
}
function EmbedIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></svg>)
}
function WorkflowIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2" /><circle cx="6" cy="19" r="2" /><circle cx="18" cy="19" r="2" /><path d="M12 7v4M12 11l-6 6M12 11l6 6" /></svg>)
}
function HistoryIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l4 2" /></svg>)
}
function PlaygroundIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></svg>)
}
function SearchIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>)
}
function CharactersIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></svg>)
}
function RpStudioIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></svg>)
}
function SettingsIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" /></svg>)
}
function PromptsIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" /></svg>)
}
function SceneIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>)
}
function PrivacyIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><circle cx="12" cy="11" r="3" /><path d="M12 14v4" /></svg>)
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
  const conversations = useChatStore((s) => s.conversations)
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
      enabled ? 'Red-Team Mode enabled' : 'Red-Team Mode disabled',
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
  const searchIndex = useMemo(
    () => conversations.map((conversation) => ({ conversation, text: buildConversationSearchText(conversation) })),
    [conversations],
  )
  const searchResult = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    if (!query) return { conversations, totalMatches: conversations.length }

    const matches: Conversation[] = []
    let totalMatches = 0
    for (const entry of searchIndex) {
      if (!entry.text.includes(query)) continue
      totalMatches += 1
      if (matches.length < MAX_CONVERSATION_SEARCH_RESULTS) matches.push(entry.conversation)
    }
    return { conversations: matches, totalMatches }
  }, [conversations, deferredSearch, searchIndex])
  const filtered = searchResult.conversations

  const handleDelete = async (conv: Conversation) => {
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
          await useChatStore.getState().restoreConversation(conv)
          toast.success('Conversation restored')
        } catch (err) {
          toast.fromError(err, 'Failed to restore')
        }
      },
    })
  }

  const exportConversation = (conv: Conversation) => {
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
    createConversation(selectedModel || 'qwen3-next-80b')
    setActiveTab('chat')
    setChatOptionsOpen(false)
    onMobileClose?.()
  }

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId)

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
          className="md:hidden ml-auto p-1 text-text-secondary hover:text-text-primary rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
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
          <div className="text-[10px] uppercase tracking-[0.08em] text-text-muted font-semibold mb-1.5 px-1 flex items-center justify-between">
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
              className="text-[10px] normal-case tracking-normal border border-border rounded px-1.5 py-0.5 hover:bg-surface-elevated"
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
            className="w-full text-[12.5px] rounded-md border border-border bg-bg/60 px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
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
            <div className="mt-1.5 flex gap-1.5 text-[10px]">
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
                className="rounded border border-border px-1.5 py-0.5 hover:bg-surface-elevated"
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
                className="rounded border border-border px-1.5 py-0.5 hover:bg-surface-elevated"
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
                className="rounded border border-border px-1.5 py-0.5 hover:bg-surface-elevated text-danger"
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
                <div className="px-2 pb-1.5 text-[10.5px] uppercase tracking-[0.1em] text-text-muted font-semibold">
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
                className="flex items-center gap-1.5 text-[10.5px] font-semibold text-text-muted uppercase tracking-[0.1em] hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent rounded px-1 -ml-1 cursor-pointer"
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
                      <div role="status" className="pt-1 text-[10.5px] text-text-muted">Searching…</div>
                    )}
                    {deferredSearch.trim() && searchResult.totalMatches > filtered.length && (
                      <div role="status" className="pt-1 text-[10.5px] text-text-muted">
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
        <div className="shrink-0 soft-separator-y p-3 gap-2 flex flex-col max-h-[35vh] overflow-y-auto">
          {/* Developer / Red-Team controls */}
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted leading-none">Red-Team Mode</span>
              <p className="text-[10.5px] leading-snug text-text-muted mt-0.5 [@media(max-height:720px)]:hidden">
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
              aria-label="Toggle Red-Team Mode"
            >
              <div className={cn(
                "w-3.5 h-3.5 rounded-full bg-surface-elevated shadow-sm absolute top-[1px] transition-all",
                redTeamMode ? "left-4" : "left-[1px]"
              )} />
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <div className="min-w-0">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted leading-none">Family Safe Mode</span>
              <p className="text-[10.5px] leading-snug text-text-muted mt-0.5 [@media(max-height:720px)]:hidden">
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
              "flex items-center justify-center gap-1.5 w-full py-1.5 px-2 border rounded-md text-[11px] font-semibold transition-colors cursor-pointer shrink-0",
              showInspector ? "bg-accent/10 border-accent text-accent" : "border-border text-text-secondary hover:border-accent hover:text-accent"
            )}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <span>{showInspector ? 'Hide Inspector' : 'Show Inspector'}</span>
          </button>

          <div className="pt-2 text-[11px] text-text-secondary flex flex-col gap-1 shrink-0 [@media(max-height:640px)]:hidden">
            <div className="flex justify-between items-center leading-none"><span>New chat</span><kbd className="font-mono text-text-muted">⌘N</kbd></div>
            <div className="flex justify-between items-center leading-none"><span>Switch tab</span><kbd className="font-mono text-text-muted">⌘1-8</kbd></div>
          </div>
        </div>
      )}
    </aside>
  )
}

function ConversationRow({ conv, isActive, onSelect, onDelete, onExport }: {
  conv: Conversation
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
        className="min-w-0 flex-1 truncate text-left rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent"
      >
        {conv.title || 'Untitled'}
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
            className="text-danger hover:underline px-1.5 text-[11px] font-semibold rounded cursor-pointer"
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
  const lines: string[] = [`# ${conv.title}`, '', `_Model: ${conv.model} · Created: ${new Date(conv.createdAt).toISOString()}_`, '']
  for (const m of conv.messages) {
    lines.push(`## ${m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Assistant' : 'System'}`)
    lines.push(contentToMarkdownText(m.content))
    lines.push('')
  }
  return lines.join('\n')
}
