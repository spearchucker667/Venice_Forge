/** @fileoverview VERIFY-042 + VERIFY-044 mounted Command Palette contracts. */

import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TAB_REGISTRY } from '../../config/tabs'
import { useProjectStore } from '../../stores/project-store'
import { useSettingsStore } from '../../stores/settings-store'
import { CommandPalette } from './CommandPalette'

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
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${image!.label}\\s*${image!.group}$`, 'i') }))
    expect(useSettingsStore.getState().activeTab).toBe('image')
  })

  it('creates and activates a project through the project-store contract', async () => {
    const project = { id: 'project-new', name: 'New Project', createdAt: 1, updatedAt: 1, archivedAt: null }
    vi.spyOn(window, 'prompt').mockReturnValue('New Project')
    const createProject = vi.spyOn(useProjectStore.getState(), 'createProject').mockResolvedValue(project)
    const setActiveProject = vi.spyOn(useProjectStore.getState(), 'setActiveProject')
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))
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
    registerMediaCommandHandlers({
      visibleIds: () => [],
      resolveItems: () => [],
      isMediaActive: () => false,
    })()
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

  it("Select all invokes onSelectAllVisible with the visible ids", () => {
    const onSelectAllVisible = vi.fn()
    registerMediaCommandHandlers({
      visibleIds: () => ["a", "b", "c"],
      resolveItems: () => ["a", "b", "c"].map((i) => makeItem({}, i)),
      isMediaActive: () => true,
      onSelectAllVisible,
    })
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    fireEvent.click(screen.getByTestId("command-palette-select-all"))
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
    fireEvent.click(screen.getByTestId("command-palette-export"))
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
    fireEvent.click(screen.getByTestId("command-palette-send-image"))
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
    fireEvent.click(screen.getByTestId("command-palette-copy-recipe"))
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
    fireEvent.click(screen.getByTestId("command-palette-favorite"))
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
    fireEvent.click(screen.getByTestId("command-palette-add-tag"))
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
    fireEvent.click(screen.getByTestId("command-palette-compare"))
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
    fireEvent.click(screen.getByTestId("command-palette-open-rp-studio"))
    expect(useSettingsStore.getState().activeTab).toBe('rp-studio')
  })

  it("New Character creates blank character and routes to rp-studio", () => {
    const createBlank = vi.spyOn(useCharacterCardStore.getState(), 'createBlank')
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    fireEvent.click(screen.getByTestId("command-palette-new-character"))
    expect(createBlank).toHaveBeenCalled()
    expect(useSettingsStore.getState().activeTab).toBe('rp-studio')
  })

  it("Start Chat calls startChatForCharacter with active card id", async () => {
    const cardId = 'c-1'
    useCharacterCardStore.setState({ editingId: cardId })
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    fireEvent.click(screen.getByTestId("command-palette-start-character-chat"))
    expect(rpHelpers.startChatForCharacter).toHaveBeenCalledWith(cardId)
  })

  it("New Scenario creates blank scenario and routes to scenes tab", () => {
    const createBlank = vi.spyOn(useScenarioStore.getState(), 'createBlank')
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    fireEvent.click(screen.getByTestId("command-palette-new-scenario"))
    expect(createBlank).toHaveBeenCalled()
    expect(useSettingsStore.getState().activeTab).toBe('scenes')
  })
})

// Phase 2H: VERIFY-050 Storage / Privacy commands
import { useStoragePrivacyStore } from '../../stores/storage-privacy-store'

describe("CommandPalette — Phase 2H Storage / Privacy commands", () => {
  it("Open Privacy Dashboard routes to privacy tab", () => {
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    fireEvent.click(screen.getByTestId("command-palette-open-privacy"))
    expect(useSettingsStore.getState().activeTab).toBe('privacy')
  })

  it("Refresh Storage Inventory calls the store action", async () => {
    const refreshInventory = vi.spyOn(useStoragePrivacyStore.getState(), 'refreshInventory').mockResolvedValue(undefined)
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    fireEvent.click(screen.getByTestId("command-palette-refresh-inventory"))
    expect(refreshInventory).toHaveBeenCalled()
  })

  it("Copy Safe Privacy Summary calls the store action", async () => {
    const copySafeSummary = vi.spyOn(useStoragePrivacyStore.getState(), 'copySafeSummary').mockResolvedValue(undefined)
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    fireEvent.click(screen.getByTestId("command-palette-copy-privacy-summary"))
    expect(copySafeSummary).toHaveBeenCalled()
  })

  it("Export Safe Privacy Summary calls the store action", () => {
    const exportSafeSummary = vi.spyOn(useStoragePrivacyStore.getState(), 'exportSafeSummary').mockReturnValue(undefined)
    render(<CommandPalette open onClose={vi.fn()} onToggle={vi.fn()} />)
    fireEvent.click(screen.getByTestId("command-palette-export-privacy-summary"))
    expect(exportSafeSummary).toHaveBeenCalled()
  })
})
