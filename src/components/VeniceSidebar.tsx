import React from "react";
import { AppState, AppDispatch } from "../types/app";
import { TABS } from "../constants/venice";
import { TabButton } from "./TabButton";
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "./icons";

interface VeniceSidebarProps {
  state: AppState;
  dispatch: AppDispatch;
  onMobileClose?: () => void;
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

function AudioIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function BatchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ModelsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );
}

function GalleryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  );
}

function DiagnosticsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

const TAB_ICONS: Record<string, React.FC> = {
  chat: ChatIcon,
  image: ImageIcon,
  video: VideoIcon,
  audio: AudioIcon,
  search: SearchIcon,
  batch: BatchIcon,
  models: ModelsIcon,
  gallery: GalleryIcon,
  settings: SettingsIcon,
  diagnostics: DiagnosticsIcon,
};

export function VeniceSidebar({ state, dispatch, onMobileClose }: VeniceSidebarProps) {
  return (
    <aside
      aria-label="Primary navigation"
      className={`flex flex-col h-full transition-all duration-200 ease-out ${
        state.sidebarCollapsed
          ? "w-[60px] min-w-[60px] items-center"
          : "w-[260px] min-w-[260px]"
      }`}
      style={{
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}
    >
      <div
        className={`flex items-center gap-2.5 h-14 shrink-0 px-3`}
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {!state.sidebarCollapsed && (
          <img
            src="./assets/branding/venice-logo-lockup-red.svg"
            alt="Venice Forge"
            title="Venice Forge — unofficial third-party client for the Venice API"
            className="h-6 w-auto"
          />
        )}
        {state.sidebarCollapsed && (
          <img
            src="./assets/branding/venice-keys-red.svg"
            alt="Venice"
            title="Venice keys mark"
            className="h-8 w-8"
          />
        )}
      </div>

      <nav aria-label="Sections" className="flex flex-col gap-1 py-3 overflow-y-auto">
        {TABS.map(([id, label]) => {
          const Icon = TAB_ICONS[id] || ChatIcon;
          return (
            <TabButton
              key={id}
              id={id}
              label={label}
              active={state.activeTab === id}
              onClick={(tab) => {
                dispatch({ type: "SET_TAB", tab });
                onMobileClose?.();
              }}
              iconOnly={state.sidebarCollapsed}
              customIcon={<Icon />}
              className={state.sidebarCollapsed ? "h-14 w-14 !p-0" : ""}
            />
          );
        })}
      </nav>

      {!state.sidebarCollapsed && (
        <div
          className="px-3 py-2.5"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <div className="text-[11px] space-y-0.5" style={{ color: 'var(--text-muted)' }}>
            <div className="flex justify-between">
              <span>New chat</span>
              <kbd style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>⌘N</kbd>
            </div>
            <div className="flex justify-between">
              <span>Switch tab</span>
              <kbd style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>⌘1-8</kbd>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => dispatch({ type: "TOGGLE_SIDEBAR" })}
        className="hidden lg:flex items-center justify-center h-8 mx-2 mb-2 rounded-md transition-colors"
        style={{ color: 'var(--text-muted)' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--surface-elevated)';
          e.currentTarget.style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-muted)';
        }}
        title={state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={state.sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {state.sidebarCollapsed ? <PanelLeftOpenIcon size={14} /> : <PanelLeftCloseIcon size={14} />}
      </button>
    </aside>
  );
}