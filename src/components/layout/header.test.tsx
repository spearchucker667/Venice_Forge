import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Header } from './header'
import { useSettingsStore } from '../../stores/settings-store'
import { useChatStore } from '../../stores/chat-store'
import { useAuthStore } from '../../stores/auth-store'
import { TAB_IDS, resolveTab } from '../../config/tabs'

vi.mock('../../hooks/use-models', () => ({
  useModels: (type?: string) => ({
    data: type ? [{ id: 'mock-' + type, model_spec: { name: 'Mock ' + type } }] : []
  })
}))

describe('Header component', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      activeTab: 'chat',
      selectedModels: {},
      setSelectedModel: vi.fn(),
      toggleSidebar: vi.fn(),
    })
    useChatStore.setState({
      activeConversationId: null,
      setActiveConversation: vi.fn(),
    })
    useAuthStore.setState({
      apiKey: 'test-key',
    })
  })

  it('renders correctly for every TAB_IDS entry', () => {
    for (const tabId of TAB_IDS) {
      useSettingsStore.setState({ activeTab: tabId })
      const { container, unmount } = render(<Header onOpenApiKey={vi.fn()} />)
      
      const tabDesc = resolveTab(tabId)
      const expectedTitle = tabDesc?.label ?? tabId

      // Header title must be present and not "undefined" or empty string
      const titleElement = container.querySelector('.font-semibold')
      expect(titleElement).not.toBeNull()
      expect(titleElement?.textContent).toBe(expectedTitle)
      expect(titleElement?.textContent).not.toBe('undefined')
      expect(titleElement?.textContent?.trim().length).toBeGreaterThan(0)

      // Subtitle check
      if (tabDesc?.subtitle) {
        const subtitleElement = container.querySelector('.text-text-muted')
        expect(subtitleElement?.textContent).toBe(tabDesc.subtitle)
      }

      // Check model selector presence
      const hasSelector = !!tabDesc?.modelType
      const selectorElement = screen.queryByLabelText('Selected model')
      
      if (hasSelector) {
        expect(selectorElement).toBeInTheDocument()
      } else {
        expect(selectorElement).not.toBeInTheDocument()
      }

      unmount()
    }
  })

  it('verifies that model selector is present only for chat, image, audio, music, and embeddings', () => {
    const selectorTabs = ['chat', 'image', 'audio', 'music', 'embeddings']
    for (const tabId of selectorTabs) {
      useSettingsStore.setState({ activeTab: tabId as any })
      const { unmount } = render(<Header onOpenApiKey={vi.fn()} />)
      expect(screen.getByLabelText('Selected model')).toBeInTheDocument()
      unmount()
    }

    const nonSelectorTabs = [
      'media', 'prompts', 'scenes', 'privacy', 'settings',
      'status', 'search', 'characters', 'rp-studio', 'workflows',
      'playground', 'video'
    ]
    for (const tabId of nonSelectorTabs) {
      useSettingsStore.setState({ activeTab: tabId as any })
      const { unmount } = render(<Header onOpenApiKey={vi.fn()} />)
      expect(screen.queryByLabelText('Selected model')).not.toBeInTheDocument()
      unmount()
    }
  })
})
