import React, { useMemo, useState } from "react";
import { cn } from "../utils/tailwind-utils";
import { AppState, AppDispatch } from "../types/app";
import { VeniceLogo } from "./ui/logo";
import type { Conversation } from "../types/conversation";
import { createConversation, saveConversation, deleteConversation } from "../services/chatStorage";
import { DEFAULT_SYSTEM_PROMPT } from "../constants/venice";

interface VeniceSidebarProps {
  state: AppState;
  dispatch: AppDispatch;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function ChatIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>);
}
function ImageIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>);
}
function AudioIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" /></svg>);
}
function VideoIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" /></svg>);
}
function SearchIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>);
}
function BatchIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>);
}
function ModelsIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" /></svg>);
}
function GalleryIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>);
}
function SettingsIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" /></svg>);
}
function DiagnosticsIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>);
}

interface NavGroup {
  label: string;
  items: Array<{ id: string; label: string; Icon: React.FC }>;
}

const navGroups: NavGroup[] = [
  {
    label: 'Conversation',
    items: [{ id: 'chat', label: 'Chat', Icon: ChatIcon }],
  },
  {
    label: 'Generate',
    items: [
      { id: 'image', label: 'Image', Icon: ImageIcon },
      { id: 'audio', label: 'Audio', Icon: AudioIcon },
      { id: 'video', label: 'Video', Icon: VideoIcon },
    ],
  },
  {
    label: 'Tools & Data',
    items: [
      { id: 'search', label: 'Search/Scrape', Icon: SearchIcon },
      { id: 'batch', label: 'Batch', Icon: BatchIcon },
      { id: 'gallery', label: 'Gallery', Icon: GalleryIcon },
    ],
  },
  {
    label: 'System',
    items: [
      { id: 'models', label: 'Models', Icon: ModelsIcon },
      { id: 'settings', label: 'Settings', Icon: SettingsIcon },
      { id: 'diagnostics', label: 'Diagnostics', Icon: DiagnosticsIcon },
    ],
  },
];

export function VeniceSidebar({ state, dispatch, mobileOpen, onMobileClose }: VeniceSidebarProps) {
  const activeTab = state.activeTab;
  const sidebarOpen = !state.sidebarCollapsed;
  const conversations = state.conversations;
  const activeConversationId = state.activeConversationId;
  const selectedModel = state.selectedChatModel;
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, search]);

  const handleDelete = async (conv: Conversation) => {
    await deleteConversation(conv.id);
    const updated = state.conversations.filter(c => c.id !== conv.id);
    dispatch({ type: "SET_CONVERSATIONS", items: updated });
    if (state.activeConversationId === conv.id) {
      dispatch({ type: "SET_ACTIVE_CONVERSATION", id: updated[0]?.id ?? null });
    }
  };

  const handleCreateChat = async () => {
    const conv = createConversation(selectedModel, state.settings.defaultSystemPrompt || DEFAULT_SYSTEM_PROMPT);
    await saveConversation(conv);
    dispatch({ type: "SET_CONVERSATIONS", items: [conv, ...conversations] });
    dispatch({ type: "SET_ACTIVE_CONVERSATION", id: conv.id });
  };

  const expanded = sidebarOpen || mobileOpen;

  return (
    <aside
      aria-label="Primary navigation"
      className={cn(
        'flex flex-col h-full bg-[#0d0d11] border-r border-white/[0.05] transition-all duration-200 ease-out',
        'fixed top-0 left-0 z-40 w-72 h-[100dvh] md:static md:h-full md:w-auto',
        mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        sidebarOpen ? 'md:w-64' : 'md:w-[60px]',
      )}
    >
      <div className={cn('flex items-center gap-2.5 h-14 shrink-0 border-b border-white/[0.04]', expanded ? 'px-4' : 'md:px-3 md:justify-center px-4')}>
        <VeniceLogo size={20} />
        {expanded && <span className={cn('font-semibold tracking-[-0.02em] text-white/90 text-[15px]')}>Venice Forge</span>}
        <button
          onClick={onMobileClose}
          aria-label="Close menu"
          className="md:hidden ml-auto p-1 text-white/45 hover:text-white/80 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </div>

      <nav aria-label="Sections" className="flex flex-col gap-3 py-3 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label} className={cn(expanded ? 'px-2' : 'md:px-1.5 px-2')}>
            {expanded && (
              <div className="px-2 pb-1.5 text-[10.5px] uppercase tracking-[0.1em] text-white/30 font-semibold">
                {group.label}
              </div>
            )}
            <div className="flex flex-col gap-px">
              {group.items.map(({ id, label, Icon }) => {
                const isActive = activeTab === id;
                return (
                  <button
                    key={id}
                    onClick={() => { dispatch({ type: "SET_TAB", tab: id }); onMobileClose?.(); }}
                    aria-current={isActive ? 'page' : undefined}
                    title={!expanded ? label : undefined}
                    className={cn(
                      'relative flex items-center gap-2.5 rounded-lg text-[14px] transition-all duration-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2',
                      expanded ? 'px-2.5 py-2' : 'md:px-0 md:py-2 md:justify-center px-2.5 py-2',
                      isActive
                        ? 'bg-white/[0.06] text-white'
                        : 'text-white/55 hover:text-white hover:bg-white/[0.03]',
                    )}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-[var(--color-accent)]" />
                    )}
                    <Icon />
                    {expanded && <span className="font-medium">{label}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {expanded && activeTab === 'chat' && (
        <div className="flex flex-col flex-1 min-h-0 mt-1 border-t border-white/[0.04]">
          <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
            <span className="text-[10.5px] font-semibold text-white/40 uppercase tracking-[0.1em]">History</span>
            <button
              onClick={handleCreateChat}
              aria-label="New chat"
              className="text-white/55 hover:text-white transition-colors p-1 rounded-md hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
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
                className="w-full bg-white/[0.04] border border-white/[0.06] rounded-md px-2.5 py-1 text-[13px] text-white/85 outline-none focus:border-white/[0.2] placeholder:text-white/30"
              />
            </div>
          )}
          <div className="flex-1 overflow-y-auto px-2 pb-3" role="list">
            {filtered.length === 0 ? (
              <div className="px-2 py-6 text-[13px] text-white/30 text-center">
                {search ? 'No matches' : 'No conversations yet'}
              </div>
            ) : (
              filtered.map((conv) => (
                <ConversationRow
                  key={conv.id}
                  conv={conv}
                  isActive={conv.id === activeConversationId}
                  onSelect={() => dispatch({ type: "SET_ACTIVE_CONVERSATION", id: conv.id })}
                  onDelete={() => handleDelete(conv)}
                />
              ))
            )}
          </div>
        </div>
      )}

      {!expanded && <div className="hidden md:block flex-1" />}

      {expanded && (
        <div className="px-3 py-2.5 border-t border-white/[0.04]">
          <div className="text-[11px] text-white/35 space-y-0.5">
            <div className="flex justify-between"><span>New chat</span><kbd className="font-mono text-white/50">⌘N</kbd></div>
            <div className="flex justify-between"><span>Switch tab</span><kbd className="font-mono text-white/50">⌘1-8</kbd></div>
          </div>
        </div>
      )}
      
      <button
        onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
        className="hidden md:flex items-center justify-center h-8 mx-2 mb-2 rounded-md transition-colors text-white/45 hover:bg-white/[0.05] hover:text-white"
        title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {sidebarOpen ? (
            <><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="9" y1="3" x2="9" y2="21" /></>
          ) : (
            <><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><line x1="15" y1="3" x2="15" y2="21" /></>
          )}
        </svg>
      </button>
    </aside>
  );
}

function ConversationRow({ conv, isActive, onSelect, onDelete }: {
  conv: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      role="listitem"
      className={cn(
        'group relative flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[13px] cursor-pointer transition-colors',
        isActive
          ? 'bg-white/[0.07] text-white'
          : 'text-white/65 hover:text-white hover:bg-white/[0.03]',
      )}
      onClick={onSelect}
    >
      <span className="truncate flex-1">{conv.title || 'Untitled'}</span>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        {confirming ? (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); setConfirming(false); }}
            aria-label="Confirm delete"
            className="text-rose-300 hover:text-rose-200 px-1.5 text-[11px] font-semibold rounded"
          >
            Delete?
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setConfirming(true); setTimeout(() => setConfirming(false), 2500); }}
            aria-label={`Delete ${conv.title}`}
            title="Delete"
            className="text-white/45 hover:text-rose-300 p-1 rounded focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--color-accent)]"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
