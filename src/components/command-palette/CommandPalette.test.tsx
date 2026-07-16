import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TAB_REGISTRY } from '../../config/tabs'
import { useProjectStore } from '../../stores/project-store'
import { usePromptLibraryStore } from '../../stores/prompt-library-store'
import { useSettingsStore } from '../../stores/settings-store'
import { toast } from '../../stores/toast-store'
import { ModalRequestHost } from '../ui/modal-requests'
import { CommandPalette } from './CommandPalette'

vi.mock('../../utils/file-reader', () => ({
  readBoundedJsonFile: vi.fn(),
}));

function PaletteHarness() {
  const [open, setOpen] = React.useState(false)
  return (
    <CommandPalette
      open={open}
      onClose={() => setOpen(false)}
      onToggle={() => setOpen((current) => !current)}
    />
  )
}

describe('CommandPalette', () => {
  beforeEach(() => {
    useSettingsStore.setState({ activeTab: 'chat', activeProjectId: null } as never)
    useProjectStore.setState({ projects: [], loaded: true, loading: false, lastError: null })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('opens with macOS or non-macOS shortcuts and closes with Escape', () => {
    render(<PaletteHarness />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('routes tab commands through canonical TAB_REGISTRY ids', () => {
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    const image = TAB_REGISTRY.find((tab) => tab.id === 'image')
    expect(image).toBeTruthy()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${image!.label}\\s*${image!.group}$`, 'i') }))
    })
    expect(useSettingsStore.getState().activeTab).toBe('image')
  })

  it('creates and activates a project through the project-store contract', async () => {
    const project = { id: 'project-new', name: 'New Project', createdAt: 1, updatedAt: 1, archivedAt: null }
    const createProject = vi.spyOn(useProjectStore.getState(), 'createProject').mockResolvedValue(project)
    const setActiveProject = vi.spyOn(useProjectStore.getState(), 'setActiveProject')
    render(
      <>
        <CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />
        <ModalRequestHost />
      </>,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'New Project' }))
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'New project name' }), {
      target: { value: 'New Project' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    await vi.waitFor(() => expect(createProject).toHaveBeenCalledWith('New Project'))
    expect(setActiveProject).toHaveBeenCalledWith('project-new')
  })

  it('does not present recipe placeholders without selected recipe context', () => {
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    expect(screen.queryByText(/selected recipe/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/same seed/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/copy recipe/i)).not.toBeInTheDocument()
  })

  it('removes its global keyboard listener on unmount', () => {
    const onToggle = vi.fn()
    const view = render(<CommandPalette open={false} onClose={vi.fn()} onToggle={onToggle} />)
    view.unmount()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(onToggle).not.toHaveBeenCalled()
  })
})

// P1-014: keyboard navigation + aria-activedescendant
describe('CommandPalette — keyboard navigation', () => {
  const getActiveItem = () => screen.getByRole('dialog').querySelector<HTMLElement>('[data-active="true"]')
  const getInput = () => screen.getByRole('dialog').querySelector<HTMLInputElement>('input')

  it('starts with the first item active and exposes aria-activedescendant', async () => {
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    await vi.waitFor(() => expect(getActiveItem()).toBeInTheDocument())
    expect(getActiveItem()).toHaveAttribute('id')
    expect(getInput()).toHaveAttribute('aria-activedescendant', getActiveItem()!.id)
  })

  it('moves active item with ArrowDown and wraps', async () => {
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    await vi.waitFor(() => expect(getActiveItem()).toBeInTheDocument())
    const first = getActiveItem()!.id
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowDown' })
    await vi.waitFor(() => expect(getActiveItem()!.id).not.toBe(first))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowUp' })
    await vi.waitFor(() => expect(getActiveItem()!.id).toBe(first))
  })

  it('wraps from last to first with ArrowDown and first to last with ArrowUp', async () => {
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    await vi.waitFor(() => expect(getActiveItem()).toBeInTheDocument())
    const items = screen.getByRole('dialog').querySelectorAll<HTMLElement>('[data-command-item]')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Home' })
    await vi.waitFor(() => expect(getActiveItem()!.id).toBe(items[0].id))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowUp' })
    await vi.waitFor(() => expect(getActiveItem()!.id).toBe(items[items.length - 1].id))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowDown' })
    await vi.waitFor(() => expect(getActiveItem()!.id).toBe(items[0].id))
  })

  it('jumps to Home and End', async () => {
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    await vi.waitFor(() => expect(getActiveItem()).toBeInTheDocument())
    const items = screen.getByRole('dialog').querySelectorAll<HTMLElement>('[data-command-item]')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowDown' })
    await vi.waitFor(() => expect(getActiveItem()!.id).not.toBe(items[0].id))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Home' })
    await vi.waitFor(() => expect(getActiveItem()!.id).toBe(items[0].id))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'End' })
    await vi.waitFor(() => expect(getActiveItem()!.id).toBe(items[items.length - 1].id))
  })

  it('activates the active item on Enter', async () => {
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    await vi.waitFor(() => expect(getActiveItem()).toBeInTheDocument())
    const items = screen.getByRole('dialog').querySelectorAll<HTMLElement>('[data-command-item]')
    // First item is the first canonical tab
    const firstTab = TAB_REGISTRY[0]
    expect(items[0]).toHaveTextContent(firstTab.label)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Enter' })
    await vi.waitFor(() => expect(useSettingsStore.getState().activeTab).toBe(firstTab.id))
  })

  it('resets active item to first on query change', async () => {
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    await vi.waitFor(() => expect(getActiveItem()).toBeInTheDocument())
    const allItems = () => screen.getByRole('dialog').querySelectorAll<HTMLElement>('[data-command-item]')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'End' })
    await vi.waitFor(() => expect(getActiveItem()!.id).toBe(allItems()[allItems().length - 1].id))
    const input = getInput()!
    fireEvent.change(input, { target: { value: 'image' } })
    await vi.waitFor(() => expect(getActiveItem()!.id).toBe(allItems()[0].id))
  })
})

// Phase 2B: VERIFY-044 selection-aware Media Studio commands
import { useMediaSelectionStore, MEDIA_SELECTION_MAX } from '../../stores/media-selection-store'
import { registerMediaCommandHandlers, getMediaCommandHandlers } from '../../stores/media-command-handlers'
import { MEDIA_ITEM_VERSION, type MediaItem } from '../../types/media'

function makeItem(over: Partial<MediaItem> = {}, id = "m-1"): MediaItem {
  return {
    id,
    image: "data:image/png;base64,AA",
    prompt: "p",
    model: "flux-dev",
    timestamp: 1,
    mediaType: "image",
    operation: "generate",
    parentId: null,
    childrenIds: [],
    tags: [],
    note: "",
    favorite: false,
    mediaItemVersion: MEDIA_ITEM_VERSION,
    ...over,
  } as MediaItem
}

describe("CommandPalette — Phase 2B selection-aware Media Studio commands", () => {
  beforeEach(() => {
    useMediaSelectionStore.setState({
      selectedMediaIds: [],
      focusedMediaId: null,
      lastSelectedMediaId: null,
      visibleMediaIds: [],
    })
  })

  afterEach(() => {
    act(() => {
      registerMediaCommandHandlers({
        visibleIds: () => [],
        resolveItems: () => [],
        isMediaActive: () => false,
      })()
    })
  })

  it("does NOT render media commands when no handlers are registered", () => {
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    expect(screen.queryByTestId("command-palette-media-section")).toBeNull()
  })

  it("renders media commands once handlers are registered", () => {
    registerMediaCommandHandlers({
      visibleIds: () => ["a", "b"],
      resolveItems: () => [makeItem({}, "a"), makeItem({}, "b")],
      isMediaActive: () => true,
      onSelectAllVisible: vi.fn(),
    })
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    expect(screen.getByTestId("command-palette-media-section")).toBeInTheDocument()
    expect(screen.getByTestId("command-palette-select-all")).toBeInTheDocument()
  })

  it("Clear / Compare / Export / Favorite / Add tag / Send / Copy are disabled when nothing is selected", () => {
    registerMediaCommandHandlers({
      visibleIds: () => ["a"],
      resolveItems: () => [makeItem({}, "a")],
      isMediaActive: () => true,
    })
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    const disabled = [
      "command-palette-clear-selection",
      "command-palette-compare",
      "command-palette-export",
      "command-palette-favorite",
      "command-palette-add-tag",
      "command-palette-send-image",
      "command-palette-copy-recipe",
    ]
    for (const id of disabled) {
      const btn = screen.getByTestId(id) as HTMLButtonElement
      expect(btn.disabled).toBe(true)
    }
  })

  it("Compare requires 2..4 selected", () => {
    registerMediaCommandHandlers({
      visibleIds: () => ["a", "b", "c", "d", "e"],
      resolveItems: () => ["a", "b", "c", "d", "e"].map((i) => makeItem({}, i)),
      isMediaActive: () => true,
      onCompare: vi.fn(),
    })
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    // 1 selected → still disabled
    act(() => { useMediaSelectionStore.getState().selectMedia("a") })
    expect((screen.getByTestId("command-palette-compare") as HTMLButtonElement).disabled).toBe(true)
    // 2 selected → enabled
    act(() => { useMediaSelectionStore.getState().toggleMedia("b") })
    expect((screen.getByTestId("command-palette-compare") as HTMLButtonElement).disabled).toBe(false)
    // 3 selected → still enabled
    act(() => { useMediaSelectionStore.getState().toggleMedia("c") })
    expect((screen.getByTestId("command-palette-compare") as HTMLButtonElement).disabled).toBe(false)
    // 4 selected (max) → still enabled
    act(() => { useMediaSelectionStore.getState().toggleMedia("d") })
    expect((screen.getByTestId("command-palette-compare") as HTMLButtonElement).disabled).toBe(false)
  })

  it("Select all invokes onSelectAllVisible with the visible ids", async () => {
    const onSelectAllVisible = vi.fn()
    registerMediaCommandHandlers({
      visibleIds: () => ["a", "b", "c"],
      resolveItems: () => ["a", "b", "c"].map((i) => makeItem({}, i)),
      isMediaActive: () => true,
      onSelectAllVisible,
    })
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId("command-palette-select-all"))
      await Promise.resolve()
    })
    expect(onSelectAllVisible).toHaveBeenCalledTimes(1)
  })

  it("Export requires at least one selected", () => {
    const onExport = vi.fn()
    registerMediaCommandHandlers({
      visibleIds: () => ["a", "b"],
      resolveItems: () => ["a", "b"].map((i) => makeItem({}, i)),
      isMediaActive: () => true,
      onExport,
    })
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    expect((screen.getByTestId("command-palette-export") as HTMLButtonElement).disabled).toBe(true)
    act(() => { useMediaSelectionStore.getState().selectMedia("a") })
    expect((screen.getByTestId("command-palette-export") as HTMLButtonElement).disabled).toBe(false)
    act(() => {
      fireEvent.click(screen.getByTestId("command-palette-export"))
    })
    expect(onExport).toHaveBeenCalledWith(["a"])
  })

  it("Send Selected to Image routes via the registered handler", () => {
    const onSendToImage = vi.fn()
    registerMediaCommandHandlers({
      visibleIds: () => ["a"],
      resolveItems: () => [makeItem({}, "a")],
      isMediaActive: () => true,
      onSendToImage,
    })
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    act(() => { useMediaSelectionStore.getState().selectMedia("a") })
    act(() => {
      fireEvent.click(screen.getByTestId("command-palette-send-image"))
    })
    expect(onSendToImage).toHaveBeenCalledWith(["a"])
  })

  it("Copy Selected Recipe JSON invokes onCopyRecipe", () => {
    const onCopyRecipe = vi.fn()
    registerMediaCommandHandlers({
      visibleIds: () => ["a", "b"],
      resolveItems: () => ["a", "b"].map((i) => makeItem({}, i)),
      isMediaActive: () => true,
      onCopyRecipe,
    })
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    act(() => {
      useMediaSelectionStore.getState().selectMedia("a")
      useMediaSelectionStore.getState().toggleMedia("b")
    })
    act(() => {
      fireEvent.click(screen.getByTestId("command-palette-copy-recipe"))
    })
    expect(onCopyRecipe).toHaveBeenCalledWith(["a", "b"])
  })

  it("Favorite Selected Media invokes onFavorite", () => {
    const onFavorite = vi.fn()
    registerMediaCommandHandlers({
      visibleIds: () => ["a"],
      resolveItems: () => [makeItem({}, "a")],
      isMediaActive: () => true,
      onFavorite,
    })
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    act(() => { useMediaSelectionStore.getState().selectMedia("a") })
    act(() => {
      fireEvent.click(screen.getByTestId("command-palette-favorite"))
    })
    expect(onFavorite).toHaveBeenCalledWith(["a"])
  })

  it("Add Tag to Selected Media invokes onAddTag", () => {
    const onAddTag = vi.fn()
    registerMediaCommandHandlers({
      visibleIds: () => ["a"],
      resolveItems: () => [makeItem({}, "a")],
      isMediaActive: () => true,
      onAddTag,
    })
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    act(() => { useMediaSelectionStore.getState().selectMedia("a") })
    act(() => {
      fireEvent.click(screen.getByTestId("command-palette-add-tag"))
    })
    expect(onAddTag).toHaveBeenCalledWith(["a"])
  })

  it("Compare invokes onCompare when 2 selected", () => {
    const onCompare = vi.fn()
    registerMediaCommandHandlers({
      visibleIds: () => ["a", "b"],
      resolveItems: () => ["a", "b"].map((i) => makeItem({}, i)),
      isMediaActive: () => true,
      onCompare,
    })
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    act(() => {
      useMediaSelectionStore.getState().selectMedia("a")
      useMediaSelectionStore.getState().toggleMedia("b")
    })
    act(() => {
      fireEvent.click(screen.getByTestId("command-palette-compare"))
    })
    expect(onCompare).toHaveBeenCalledWith(["a", "b"])
  })

  it("clear handler is registered and accepts the registered cleanup", () => {
    const cleanup = registerMediaCommandHandlers({
      visibleIds: () => [],
      resolveItems: () => [],
      isMediaActive: () => true,
    })
    expect(getMediaCommandHandlers()).toBeTruthy()
    cleanup()
    expect(getMediaCommandHandlers()).toBeNull()
  })

  it("MEDIA_SELECTION_MAX is exported and is 4", () => {
    expect(MEDIA_SELECTION_MAX).toBe(4)
  })
})

// Phase 2F: RP Studio commands
import { useCharacterCardStore } from '../../stores/character-card-store'
import { useScenarioStore } from '../../stores/scenario-store'
import * as rpHelpers from '../../services/rpHelpers'
import * as studioHandoff from '../../services/characterCards/characterCardStudioHandoff'

describe("CommandPalette — Phase 2F RP Studio commands", () => {
  beforeEach(() => {
    useCharacterCardStore.setState({ cards: [], editingId: null })
    useScenarioStore.setState({ scenarios: [] })
    vi.spyOn(rpHelpers, 'startChatForCharacter').mockResolvedValue('chat-1')
  })

  it("renders RP Studio section and Open button", () => {
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    expect(screen.getAllByText("RP Studio").length).toBeGreaterThanOrEqual(1)
    expect(screen.getByTestId("command-palette-open-rp-studio")).toBeInTheDocument()
  })

  it("Open RP Studio routes to rp-studio tab", () => {
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    act(() => {
      fireEvent.click(screen.getByTestId("command-palette-open-rp-studio"))
    })
    expect(useSettingsStore.getState().activeTab).toBe('rp-studio')
  })

  it("Create ST Card creates a local-only draft and routes to rp-studio", async () => {
    const createBlank = vi.spyOn(studioHandoff, 'createBlankCharacterCardDraft').mockResolvedValue('draft-1')
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId("command-palette-new-character"))
    })
    expect(createBlank).toHaveBeenCalled()
    expect(useSettingsStore.getState().activeTab).toBe('rp-studio')
  })

  it("Start Chat calls startChatForCharacter with active card id", async () => {
    const cardId = 'c-1'
    useCharacterCardStore.setState({ editingId: cardId })
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId("command-palette-start-character-chat"))
    });
    expect(rpHelpers.startChatForCharacter).toHaveBeenCalledWith(cardId)
  })

  it("New Scenario creates blank scenario and routes to scenes tab", () => {
    const createBlank = vi.spyOn(useScenarioStore.getState(), 'createBlank')
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    act(() => {
      fireEvent.click(screen.getByTestId("command-palette-new-scenario"))
    })
    expect(createBlank).toHaveBeenCalled()
    expect(useSettingsStore.getState().activeTab).toBe('scenes')
  })
})

// Phase 2H: VERIFY-050 Storage / Privacy commands
import { useStoragePrivacyStore } from '../../stores/storage-privacy-store'

describe("CommandPalette — Phase 2H Storage / Privacy commands", () => {
  it("Open Privacy Dashboard routes to privacy tab", () => {
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    act(() => {
      fireEvent.click(screen.getByTestId("command-palette-open-privacy"))
    })
    expect(useSettingsStore.getState().activeTab).toBe('privacy')
  })

  it("Refresh Storage Inventory calls the store action", async () => {
    const refreshInventory = vi.spyOn(useStoragePrivacyStore.getState(), 'refreshInventory').mockResolvedValue(undefined)
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId("command-palette-refresh-inventory"))
    });
    expect(refreshInventory).toHaveBeenCalled()
  })

  it("Copy Safe Privacy Summary calls the store action", async () => {
    const copySafeSummary = vi.spyOn(useStoragePrivacyStore.getState(), 'copySafeSummary').mockResolvedValue(undefined)
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    await act(async () => {
      fireEvent.click(screen.getByTestId("command-palette-copy-privacy-summary"))
    });
    expect(copySafeSummary).toHaveBeenCalled()
  })

  it("Export Safe Privacy Summary calls the store action", () => {
    const exportSafeSummary = vi.spyOn(useStoragePrivacyStore.getState(), 'exportSafeSummary').mockReturnValue(undefined)
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    act(() => {
      fireEvent.click(screen.getByTestId("command-palette-export-privacy-summary"))
    })
    expect(exportSafeSummary).toHaveBeenCalled()
  })
})

// Phase 5: VERIFY-075 Prompt Library import/sync reconciliation surfaced in Command Palette
describe("CommandPalette — Phase 5 Prompt Library import reconciliation", () => {
  beforeEach(() => {
    usePromptLibraryStore.setState({
      prompts: [],
      activePromptId: null,
      hydrated: true,
      loading: false,
      loadError: null,
    });
  });

  it("imports prompts with reconcile=true and surfaces imported + synced counts", async () => {
    const { readBoundedJsonFile } = await import('../../utils/file-reader');
    vi.mocked(readBoundedJsonFile).mockResolvedValue({
      version: 1,
      app: 'Venice Forge',
      exportedAt: new Date().toISOString(),
      prompts: [],
    } as never);

    const importPrompts = vi.spyOn(usePromptLibraryStore.getState(), 'importPrompts').mockResolvedValue({
      imported: [{ id: 'p-new', title: 'New', kind: 'general', scope: 'global' }] as never[],
      reconciled: [{ id: 'p-existing', title: 'Existing', kind: 'general', scope: 'global' }] as never[],
      skipped: [],
    });
    const success = vi.spyOn(toast, 'success').mockReturnValue("00000000-0000-4000-8000-000000000001");

    const createElementSpy = vi.spyOn(document, 'createElement');
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    let input: HTMLInputElement | null = null;
    await act(async () => {
      fireEvent.click(screen.getByTestId("command-palette-import-prompts"))
      input = createElementSpy.mock.results.find((r) => r.value?.type === 'file')?.value ?? null;
    });

    if (!input) throw new Error('file input was not created');
    const file = new File(['{}'], 'prompts.json', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file] });
    await act(async () => {
      fireEvent.change(input!);
    });

    await vi.waitFor(() => expect(importPrompts).toHaveBeenCalled());
    expect(importPrompts).toHaveBeenCalledWith(expect.anything(), { reconcile: true });
    expect(success).toHaveBeenCalledWith(expect.stringMatching(/imported 1 prompt/));
    expect(success).toHaveBeenCalledWith(expect.stringMatching(/synced 1 prompt/));
  });
})
