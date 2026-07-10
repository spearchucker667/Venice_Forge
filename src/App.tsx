import { useState, useEffect, lazy, Suspense } from 'react'
import { useSettingsStore, type Tab } from './stores/settings-store'
import { useChatStore } from './stores/chat-store'
import { useAuthStore } from './stores/auth-store'
import { useConfigStore } from './stores/config-store'
import { ensureProjectsLoaded } from './stores/project-store'
import { desktopSync } from './services/desktopBridge'
import { Sidebar } from './components/layout/sidebar'
import { Header } from './components/layout/header'
import { ApiKeyDialog } from './components/layout/api-key-dialog'
import { InspectorPane } from './components/layout/inspector-pane'
import { FirstRunModal } from './components/FirstRunModal'
import { OnboardingSplash } from './components/OnboardingSplash'
import { ChatView } from './components/chat/chat-view'
import { CommandPalette } from './components/command-palette/CommandPalette'
import { AppMeshOverlay } from './components/layout/AppMeshOverlay'
import { DiagnosticsDrawer } from './components/status/DiagnosticsDrawer'
// Lazy loaded views below
import { ErrorBoundary } from './components/ui/error-boundary'
import { ModalRequestHost } from './components/ui/modal-requests'
import { Toaster } from './components/ui/toaster'
import { FIRST_RUN_ACK_KEY } from './shared/legal'
import { applyTheme, resolveInitialTheme } from './theme'
import { CANONICAL_TAB_ORDER, normaliseTab, type TabId } from './config/tabs'
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion'
import { useProfileVolatileReset } from './hooks/useProfileVolatileReset'

/** Exported for regression testing: identifies whether a keyboard event target
 *  is an editable element where global shortcuts should be ignored. */
export function isShortcutTargetEditable(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  return !!(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
}

// Heavyweight views are dynamically imported so the initial renderer bundle
// does not pay for Settings (956 lines), Media Studio (936 lines), Search &
// Scrape (789 lines), Scene Composer (768), Prompt Library (686), or the
// Storage / Privacy dashboard (249) until the user actually navigates to
// them. Each lazy wrapper preserves the existing React.lazy / Suspense
// fallback contract used by Workflows / Playground / RP Studio (P2-008).

const LazyWorkflowsView = lazy(() => import('./components/workflows/workflows-view').then((m) => ({ default: m.WorkflowsView })))
function WorkflowsViewLazy() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-text-muted/50">Loading workflows…</div>}><LazyWorkflowsView /></Suspense>
}

const LazyPlaygroundView = lazy(() => import('./components/playground/playground-view').then((m) => ({ default: m.PlaygroundView })))
function PlaygroundView() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-text-muted/50">Loading playground…</div>}><LazyPlaygroundView /></Suspense>
}

const LazyRpStudioView = lazy(() => import('./components/rp-studio').then((m) => ({ default: m.RpStudioView })))
function RpStudioViewLazy() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-text-muted/50">Loading RP studio…</div>}><LazyRpStudioView /></Suspense>
}

const LazyHistoryView = lazy(() => import('./components/chat/HistoryView'))
function HistoryView() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-text-muted/50">Loading history…</div>}><LazyHistoryView /></Suspense>
}

const LazyImagePage = lazy(() => import('./components/image/image-page').then(m => ({ default: m.ImagePage })))
function ImagePage() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-text-muted/50">Loading Image Studio…</div>}><LazyImagePage /></Suspense>
}

const LazyAudioView = lazy(() => import('./components/audio/audio-view').then(m => ({ default: m.AudioView })))
function AudioView() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-text-muted/50">Loading Audio…</div>}><LazyAudioView /></Suspense>
}

const LazyMusicView = lazy(() => import('./components/music/music-view').then(m => ({ default: m.MusicView })))
function MusicView() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-text-muted/50">Loading Music…</div>}><LazyMusicView /></Suspense>
}

const LazyVideoView = lazy(() => import('./components/video/video-view').then(m => ({ default: m.VideoView })))
function VideoView() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-text-muted/50">Loading Video…</div>}><LazyVideoView /></Suspense>
}

const LazyEmbeddingsView = lazy(() => import('./components/embeddings/embeddings-view').then(m => ({ default: m.EmbeddingsView })))
function EmbeddingsView() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-text-muted/50">Loading Embeddings…</div>}><LazyEmbeddingsView /></Suspense>
}

const LazyStatusView = lazy(() => import('./components/StatusView').then(m => ({ default: m.StatusView })))
function StatusView() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-text-muted/50">Loading Status…</div>}><LazyStatusView /></Suspense>
}

const LazyCharactersView = lazy(() => import('./components/CharactersView').then(m => ({ default: m.CharactersView })))
function CharactersView() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-text-muted/50">Loading Characters…</div>}><LazyCharactersView /></Suspense>
}

const LazySettingsView = lazy(() => import('./components/SettingsView').then((m) => ({ default: m.SettingsView })))
function SettingsView() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-text-muted/50">Loading settings…</div>}><LazySettingsView /></Suspense>
}

const LazySearchScrapeView = lazy(() => import('./components/SearchScrapeView').then((m) => ({ default: m.SearchScrapeView })))
function SearchScrapeView() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-text-muted/50">Loading search…</div>}><LazySearchScrapeView /></Suspense>
}

const LazyMediaStudioView = lazy(() => import('./components/gallery/gallery-view').then((m) => ({ default: m.MediaStudioView })))
function MediaStudioView() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-text-muted/50">Loading media studio…</div>}><LazyMediaStudioView /></Suspense>
}

const LazyPromptLibraryView = lazy(() => import('./components/prompts/PromptLibraryView').then((m) => ({ default: m.PromptLibraryView })))
function PromptLibraryView() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-text-muted/50">Loading prompt library…</div>}><LazyPromptLibraryView /></Suspense>
}

const LazySceneComposerView = lazy(() => import('./components/scenes/SceneComposerView').then((m) => ({ default: m.SceneComposerView })))
function SceneComposerView() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-text-muted/50">Loading scenes…</div>}><LazySceneComposerView /></Suspense>
}

const LazyStoragePrivacyDashboard = lazy(() => import('./components/privacy/StoragePrivacyDashboard').then((m) => ({ default: m.StoragePrivacyDashboard })))
function StoragePrivacyDashboard() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-text-muted/50">Loading storage…</div>}><LazyStoragePrivacyDashboard /></Suspense>
}

const views: Record<TabId, React.ComponentType> = {
  chat: ChatView,
  history: HistoryView,
  image: ImagePage,
  media: MediaStudioView,
  prompts: PromptLibraryView,
  scenes: SceneComposerView,
  // Legacy aliases — render the same view as their canonical target so a
  // stale `activeTab='gallery'` still shows the Media Studio instead of an
  // empty page. The store normalises aliases on set, so this is only a
  // belt-and-braces fallback for hydration races.
  gallery: MediaStudioView,
  audio: AudioView,
  music: MusicView,
  video: VideoView,
  embeddings: EmbeddingsView,
  workflows: WorkflowsViewLazy,
  privacy: StoragePrivacyDashboard,
  playground: PlaygroundView,
  status: StatusView,
  settings: SettingsView,
  search: SearchScrapeView,
  characters: CharactersView,
  'rp-studio': RpStudioViewLazy,
  // Unused legacy ids — fall back to Config.
  models: SettingsView,
  batch: SettingsView,
  diagnostics: StatusView,
} as const;

/**
 * Canonical tab order. Used by the keyboard shortcut `⌘1`..`⌘N` and by
 * tests that need the "official" surface area. The sidebar and App both
 * render the same order; the source of truth is `CANONICAL_TAB_ORDER` in
 * `src/config/tabs.ts`.
 */
export const TAB_ORDER: readonly TabId[] = CANONICAL_TAB_ORDER;

export function App() {
  const needsUnlock = useAuthStore((s) => !s.isConfigured && !s.apiKey)
  const [apiKeyOpen, setApiKeyOpen] = useState(needsUnlock)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  // LEGAL: show the 18+ age-gate on first launch. Persists via FIRST_RUN_ACK_KEY.
  const [firstRunAcked, setFirstRunAcked] = useState<boolean>(
    () => typeof window !== "undefined" && localStorage.getItem(FIRST_RUN_ACK_KEY) === "1" /* localStorage-allowed: first-run legal ack */
  )
  // Phase 1 command palette (⌘K / Ctrl+K)
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
  const activeTab = useSettingsStore((s) => s.activeTab)
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)
  usePrefersReducedMotion()
  // Subscribe to active-profile changes so volatile per-profile caches
  // (pending Image Studio handoffs, traffic inspector logs, active
  // conversation id) are cleared before `requestSwitchProfile` reloads the page.
  useProfileVolatileReset()

  // Theme state lifecycle synchronization. Uses the registry-based
  // `resolveInitialTheme` so a future theme can be added without
  // touching this file.
  const selectedThemeId = useSettingsStore((s) => s.selectedThemeId)
  const customTheme = useSettingsStore((s) => s.customTheme)
  const appearanceMode = useSettingsStore((s) => s.appearanceMode)
  const yamlThemes = useConfigStore((s) => s.yamlThemes)

  useEffect(() => {
    const theme = resolveInitialTheme({ selectedThemeId, appearanceMode, customTheme }, yamlThemes)
    applyTheme(theme)

    try {
      localStorage.setItem('vf.theme.bootstrap', JSON.stringify({ selectedThemeId, appearanceMode, customTheme })) /* localStorage-allowed: theme bootstrap FOUC cache */;
    } catch {
      // ignore write failures (e.g. disabled local storage)
    }
  }, [selectedThemeId, customTheme, appearanceMode, yamlThemes]);

  // Centralized project ensure (with safe default) at app root. Idempotent via _hydrated guard.
  // This avoids duplicate effects from sidebar (which could contribute to update depth in test trees with frequent mounts).
  useEffect(() => {
    ensureProjectsLoaded().catch(() => {})
  }, []);

  // Sync Folder Initialization
  const syncFolderPath = useSettingsStore((s) => s.syncFolderPath);
  useEffect(() => {
    if (typeof window !== "undefined" && syncFolderPath) {
      desktopSync.setSyncFolder({ path: syncFolderPath }).catch((err: unknown) => {
        console.error("Failed to initialize sync folder on boot:", err);
      });
    }
  }, [syncFolderPath]);

  const normalisedActiveTab = normaliseTab(activeTab)
  const ActiveView = views[normalisedActiveTab] ?? views.chat


  const acknowledgeFirstRun = () => {
    try { localStorage.setItem(FIRST_RUN_ACK_KEY, "1") /* localStorage-allowed: first-run legal ack */ } catch { /* private mode etc. */ }
    setFirstRunAcked(true)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey
      if (!isMeta) return

      if (isShortcutTargetEditable(e)) return

      if (e.key === 'n') {
        e.preventDefault()
        setActiveTab('chat')
        setMobileSidebarOpen(false)
        useChatStore.getState().setActiveConversation(null)
        return
      }

      const num = parseInt(e.key, 10)
      if (num >= 1 && num <= TAB_ORDER.length) {
        e.preventDefault()
        setActiveTab(TAB_ORDER[num - 1] as Tab)
        setMobileSidebarOpen(false)
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setActiveTab])

  return (
    <div className="relative isolate flex h-[100dvh] w-screen overflow-hidden bg-bg">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 z-[100] px-3 py-2 rounded-md bg-accent text-accent-fg text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Skip to main content
      </a>
      <AppMeshOverlay />
      {/* Mobile drawer overlay */}
      {mobileSidebarOpen && (
        <button
          aria-label="Close menu"
          className="md:hidden fixed inset-0 z-30 bg-overlay backdrop-blur-sm animate-fade-in"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
      <div className="relative z-10 flex flex-col flex-1 min-w-0">
        <Header
          onOpenApiKey={() => setApiKeyOpen(true)}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <main id="main-content" tabIndex={-1} className="mesh-panel flex-1 min-h-0 overflow-hidden rounded-none border-0 shadow-none outline-none">
            <ErrorBoundary key={normalisedActiveTab}>
              <div key={normalisedActiveTab} className="section-transition h-full">
                <ActiveView />
              </div>
            </ErrorBoundary>
          </main>
          <InspectorPane />
        </div>
      </div>
      <ApiKeyDialog open={apiKeyOpen} onClose={() => setApiKeyOpen(false)} />
      <FirstRunModal
        open={!firstRunAcked}
        onAcknowledge={acknowledgeFirstRun}
        onDismiss={() => { /* cannot dismiss the age gate; user must acknowledge */ }}
      />
      {firstRunAcked && <OnboardingSplash />}
      <Toaster />
      <ModalRequestHost />
      <CommandPalette
        open={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        onToggle={() => setCmdPaletteOpen((value) => !value)}
      />
      <DiagnosticsDrawer />
    </div>
  )
}
