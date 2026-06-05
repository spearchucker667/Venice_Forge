import { useState, useEffect, lazy, Suspense } from 'react'
import { useSettingsStore, type Tab } from './stores/settings-store'
import { useChatStore } from './stores/chat-store'
import { useAuthStore } from './stores/auth-store'
import { Sidebar } from './components/layout/sidebar'
import { Header } from './components/layout/header'
import { ApiKeyDialog } from './components/layout/api-key-dialog'
import { InspectorPane } from './components/layout/inspector-pane'
import { FirstRunModal } from './components/FirstRunModal'
import { ChatView } from './components/chat/chat-view'
import { ImagePage } from './components/image/image-page'
import { AudioView } from './components/audio/audio-view'
import { MusicView } from './components/music/music-view'
import { VideoView } from './components/video/video-view'
import { EmbeddingsView } from './components/embeddings/embeddings-view'
import { StatusView } from './components/StatusView'
import { SettingsView } from './components/SettingsView'
import { SearchScrapeView } from './components/SearchScrapeView'
import { CharactersView } from './components/CharactersView'
import { ErrorBoundary } from './components/ui/error-boundary'
import { Toaster } from './components/ui/toaster'
import { FIRST_RUN_ACK_KEY } from './shared/legal'
import { applyTheme, BUILTIN_VENICE, BUILTIN_DARK, BUILTIN_LIGHT, BUILTIN_COPPER, BUILTIN_DRACULA, BUILTIN_GRUVBOX_DARK, BUILTIN_ROSEPINE } from './theme'

const LazyWorkflowsView = lazy(() => import('./components/workflows/workflows-view').then((m) => ({ default: m.WorkflowsView })))
function WorkflowsView() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-white/30">Loading workflows…</div>}><LazyWorkflowsView /></Suspense>
}

const LazyPlaygroundView = lazy(() => import('./components/playground/playground-view').then((m) => ({ default: m.PlaygroundView })))
function PlaygroundView() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-white/30">Loading playground…</div>}><LazyPlaygroundView /></Suspense>
}

const LazyRpStudioView = lazy(() => import('./components/rp-studio').then((m) => ({ default: m.RpStudioView })))
function RpStudioViewLazy() {
  return <Suspense fallback={<div className="flex items-center justify-center h-full text-[12px] text-white/30">Loading RP studio…</div>}><LazyRpStudioView /></Suspense>
}

const views = {
  chat: ChatView,
  image: ImagePage,
  audio: AudioView,
  music: MusicView,
  video: VideoView,
  embeddings: EmbeddingsView,
  workflows: WorkflowsView,
  playground: PlaygroundView,
  status: StatusView,
  settings: SettingsView,
  search: SearchScrapeView,
  characters: CharactersView,
  'rp-studio': RpStudioViewLazy,
} as const

const TAB_ORDER: Tab[] = ['chat', 'image', 'audio', 'music', 'video', 'embeddings', 'search', 'characters', 'rp-studio', 'workflows', 'playground', 'settings', 'status']

export function App() {
  const needsUnlock = useAuthStore((s) => s.hasEncrypted && !s.apiKey)
  const [apiKeyOpen, setApiKeyOpen] = useState(needsUnlock)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  // LEGAL: show the 18+ age-gate on first launch. Persists via FIRST_RUN_ACK_KEY.
  const [firstRunAcked, setFirstRunAcked] = useState<boolean>(
    () => typeof window !== "undefined" && localStorage.getItem(FIRST_RUN_ACK_KEY) === "1"
  )
  const activeTab = useSettingsStore((s) => s.activeTab)
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)
  
  // Theme state lifecycle synchronization
  const selectedThemeId = useSettingsStore((s) => s.selectedThemeId)
  const customTheme = useSettingsStore((s) => s.customTheme)
  const appearanceMode = useSettingsStore((s) => s.appearanceMode)

  useEffect(() => {
    let theme = BUILTIN_VENICE;
    if (selectedThemeId === 'custom' && customTheme) {
      theme = customTheme;
    } else if (selectedThemeId === 'builtin-light') {
      theme = BUILTIN_LIGHT;
    } else if (selectedThemeId === 'builtin-copper') {
      theme = BUILTIN_COPPER;
    } else if (selectedThemeId === 'builtin-dracula') {
      theme = BUILTIN_DRACULA;
    } else if (selectedThemeId === 'builtin-dark') {
      theme = BUILTIN_DARK;
    } else if (selectedThemeId === 'builtin-gruvbox-dark') {
      theme = BUILTIN_GRUVBOX_DARK;
    } else if (selectedThemeId === 'builtin-rosepine') {
      theme = BUILTIN_ROSEPINE;
    }
    applyTheme(theme);

    try {
      localStorage.setItem('vf.theme.bootstrap', JSON.stringify({
        selectedThemeId,
        appearanceMode,
        customTheme,
      }));
    } catch {
      // ignore write failures (e.g. disabled local storage)
    }
  }, [selectedThemeId, customTheme, appearanceMode]);

  const ActiveView = views[activeTab]


  const acknowledgeFirstRun = () => {
    try { localStorage.setItem(FIRST_RUN_ACK_KEY, "1") } catch { /* private mode etc. */ }
    setFirstRunAcked(true)
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey
      if (!isMeta) return

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
        setActiveTab(TAB_ORDER[num - 1])
        setMobileSidebarOpen(false)
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setActiveTab])

  return (
    <div className="flex h-[100dvh] w-screen overflow-hidden">
      {/* Mobile drawer overlay */}
      {mobileSidebarOpen && (
        <button
          aria-label="Close menu"
          className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}
      <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
      <div className="flex flex-col flex-1 min-w-0">
        <Header
          onOpenApiKey={() => setApiKeyOpen(true)}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
        />
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <main className="flex-1 min-h-0 overflow-hidden">
            <ErrorBoundary key={activeTab}>
              <ActiveView />
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
      <Toaster />
    </div>
  )
}
