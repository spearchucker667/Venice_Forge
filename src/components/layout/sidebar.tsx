import { useDeferredValue, useMemo, useState } from 'react'
import { cn } from '../../lib/utils'
import { useSettingsStore, type Tab } from '../../stores/settings-store'
import { useChatStore } from '../../stores/chat-store'
import { toast } from '../../stores/toast-store'
import { VeniceLogo, VeniceWordmark } from '../ui/logo'
import type { Conversation } from '../../types/conversation'
import { desktopConfig, isElectron } from '../../services/desktopBridge'
import { reloadConfig } from '../../stores/config-store'
import { TAB_REGISTRY, TAB_GROUP_LABELS, type TabGroup, type TabId } from '../../config/tabs'

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
  image: ImageIcon,
  media: GalleryIcon,
  gallery: GalleryIcon,
  audio: AudioIcon,
  music: MusicIcon,
  video: VideoIcon,
  embeddings: EmbedIcon,
  search: SearchIcon,
  characters: CharactersIcon,
  'rp-studio': RpStudioIcon,
  workflows: WorkflowIcon,
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
      typeof message.content === 'string' ? message.content : '',
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
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const createConversation = useChatStore((s) => s.createConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const selectedModel = useSettingsStore((s) => s.selectedModels.chat)
  const [search, setSearch] = useState('')

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
          toast.error('Failed to restore', err instanceof Error ? err.message : String(err))
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

  const expanded = sidebarOpen || mobileOpen

  return (
    <aside
      aria-label="Primary navigation"
      className={cn(
        'flex flex-col h-full bg-surface border-r border-border transition-all duration-200 ease-out',
        'fixed top-0 left-0 z-40 w-72 h-[100dvh] md:static md:h-full md:w-auto',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        sidebarOpen ? 'md:w-64' : 'md:w-[60px]',
      )}
    >
      <div className={cn('flex items-center gap-2.5 h-14 shrink-0 border-b border-border', expanded ? 'px-4' : 'md:px-3 md:justify-center px-4')}>
        <VeniceLogo size={20} />
        {expanded && <VeniceWordmark className="text-[15px] tracking-tight" />}
        <button
          onClick={onMobileClose}
          aria-label="Close menu"
          className="md:hidden ml-auto p-1 text-text-secondary hover:text-text-primary rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <nav aria-label="Sections" className="flex flex-col gap-3 py-3 overflow-y-auto">
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
                      'relative flex items-center gap-2.5 rounded-lg text-[14px] transition-all duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2 cursor-pointer',
                      expanded ? 'px-2.5 py-2' : 'md:px-0 md:py-2 md:justify-center px-2.5 py-2',
                      isActive
                        ? 'bg-accent/10 text-accent font-semibold'
                        : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated/40',
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-[var(--color-accent)]" />
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
        <div className="flex flex-col flex-1 min-h-0 mt-1 border-t border-border">
          <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
            <span className="text-[10.5px] font-semibold text-text-muted uppercase tracking-[0.1em]">History</span>
            <button
              onClick={() => createConversation(selectedModel || 'qwen3-next-80b')}
              aria-label="New chat"
              className="text-text-secondary hover:text-text-primary transition-colors p-1 rounded-md hover:bg-surface-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] cursor-pointer"
              title="New chat (⌘N)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </button>
          </div>
          {conversations.length > 5 && (
            <div className="px-3 pb-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                aria-label="Search conversations"
                className="w-full bg-surface border border-border rounded-md px-2.5 py-1 text-[13px] text-text-primary outline-none focus:border-accent placeholder:text-text-muted"
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
          )}
          <div className="flex-1 overflow-y-auto px-2 pb-3" role="list">
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

      {!expanded && <div className="hidden md:block flex-1" />}

      {expanded && (
        <div className="px-3 py-2.5 border-t border-border space-y-2.5">
          {/* Developer / Red-Team controls */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Red-Team Mode</span>
              <button
                type="button"
                role="switch"
                aria-checked={redTeamMode}
                onClick={toggleRedTeamMode}
                className={cn(
                  "w-8 h-4 rounded-full transition-colors relative cursor-pointer",
                  redTeamMode ? "bg-accent" : "bg-border"
                )}
                aria-label="Toggle Red-Team Mode"
              >
                <div className={cn(
                  "w-3.5 h-3.5 rounded-full bg-white absolute top-[1px] transition-all",
                  redTeamMode ? "left-4" : "left-[1px]"
                )} />
              </button>
            </div>
            <p className="text-[10.5px] leading-relaxed text-text-muted">
              Shows raw model output and local safety decisions. Enabling it also opens the Inspector.
            </p>
            <div className="flex items-center justify-between pt-1 border-t border-border/70">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Family Safe Mode</span>
              <button
                type="button"
                role="switch"
                aria-checked={localFamilySafeModeEnabled}
                onClick={() => void toggleFamilySafeMode()}
                className={cn(
                  "w-8 h-4 rounded-full transition-colors relative cursor-pointer",
                  localFamilySafeModeEnabled ? "bg-accent" : "bg-border"
                )}
                aria-label="Toggle Family Safe Mode"
                title={localFamilySafeModeEnabled ? "Family Safe Mode enabled" : "Adult Mode enabled"}
              >
                <div className={cn(
                  "w-3.5 h-3.5 rounded-full bg-white absolute top-[1px] transition-all",
                  localFamilySafeModeEnabled ? "left-4" : "left-[1px]"
                )} />
              </button>
            </div>
            <p className="text-[10.5px] leading-relaxed text-text-muted">
              {localFamilySafeModeEnabled ? 'ON: local family filter runs.' : 'OFF: Adult Mode skips the local filter.'}
            </p>
            <button
              onClick={() => setShowInspector(!showInspector)}
              className={cn(
                "flex items-center justify-center gap-1.5 w-full py-1 px-2 border border-border hover:border-accent hover:text-accent rounded-md text-[11px] font-semibold transition-colors cursor-pointer",
                showInspector ? "bg-accent/10 border-accent text-accent" : "text-text-secondary"
              )}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              <span>{showInspector ? 'Hide Inspector' : 'Show Inspector'}</span>
            </button>
          </div>

          <div className="text-[11px] text-text-secondary space-y-0.5">
            <div className="flex justify-between"><span>New chat</span><kbd className="font-mono text-text-muted">⌘N</kbd></div>
            <div className="flex justify-between"><span>Switch tab</span><kbd className="font-mono text-text-muted">⌘1-8</kbd></div>
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
        className="min-w-0 flex-1 truncate text-left rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-accent)]"
      >
        {conv.title || 'Untitled'}
      </button>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); onExport() }}
          aria-label={`Export ${conv.title}`}
          title="Export as Markdown"
          className="text-text-secondary hover:text-text-primary p-1 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-accent)] cursor-pointer"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
        </button>
        {confirming ? (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); setConfirming(false) }}
            aria-label="Confirm delete"
            className="text-danger hover:underline px-1.5 text-[11px] font-semibold rounded cursor-pointer"
          >
            Delete?
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setConfirming(true); setTimeout(() => setConfirming(false), 2500) }}
            aria-label={`Delete ${conv.title}`}
            title="Delete"
            className="text-text-secondary hover:text-danger p-1 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-accent)] cursor-pointer"
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
    lines.push(m.content)
    lines.push('')
  }
  return lines.join('\n')
}
