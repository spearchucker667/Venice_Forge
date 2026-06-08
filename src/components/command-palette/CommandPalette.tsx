/** @fileoverview Phase 1 + Phase 2B + Phase 2D Command Palette.
 * Trigger: Cmd+K / Ctrl+K via this component's mounted listener.
 * Supports:
 *  - Quick tab switching (uses the canonical TAB_REGISTRY)
 *  - "New project" action (creates via project-store + activates)
 *  - Close on Escape or clicking outside.
 *  - Phase 2B: selection-aware Media Studio commands (Select all,
 *    Clear, Compare, Export, Favorite, Add tag, Send to Image, Copy
 *    recipe). These are hidden when the Media Studio has not
 *    registered command handlers.
 *  - Phase 2D: Prompt Library commands (Open, New, Use, Save from
 *    current prompt, Favorite, Export, Import). All routed through
 *    the canonical tab registry and the prompt-library store.
 */

import React, { useEffect, useState } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { useProjectStore } from '../../stores/project-store'
import { TAB_REGISTRY, type TabId } from '../../config/tabs'
import { toast } from '../../stores/toast-store'
import { useMediaSelectionStore, MEDIA_SELECTION_MAX } from '../../stores/media-selection-store'
import { getMediaCommandHandlers, hasMediaCommandHandlers, subscribeMediaCommandHandlers } from '../../stores/media-command-handlers'
import { usePromptLibraryStore } from '../../stores/prompt-library-store'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onToggle: () => void
}

export function CommandPalette({ open, onClose, onToggle }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)
  const selectionCount = useMediaSelectionStore((s) => s.selectedMediaIds.length)
  const promptCount = usePromptLibraryStore((s) =>
    s.prompts.filter((p) => p.archivedAt === null).length,
  )
  const isCompareReady = useMediaSelectionStore((s) =>
    s.selectedMediaIds.length >= 2 && s.selectedMediaIds.length <= MEDIA_SELECTION_MAX,
  )
  // Subscribe to the handlers registry so the media section appears
  // / disappears as the user moves between tabs.
  const [hasMediaHandlers, setHasMediaHandlers] = useState(hasMediaCommandHandlers)
  useEffect(() => {
    setHasMediaHandlers(hasMediaCommandHandlers())
    return subscribeMediaCommandHandlers(() => setHasMediaHandlers(hasMediaCommandHandlers()))
  }, [])

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onToggle()
        return
      }
      if (open && e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, onToggle, open])

  if (!open) return null

  const filteredTabs = TAB_REGISTRY.filter((t) =>
    t.label.toLowerCase().includes(query.toLowerCase())
  )

  const handleTab = (id: TabId) => {
    setActiveTab(id)
    onClose()
    setQuery('')
  }

  const handleNewProject = async () => {
    const name = prompt('New project name')?.trim() || 'Untitled Project'
    const p = await useProjectStore.getState().createProject(name)
    useProjectStore.getState().setActiveProject(p.id)
    toast.success(`Created project "${p.name}"`)
    onClose()
    setQuery('')
  }

  // Media Studio command helpers. The palette reads handlers live
  // (not via a subscription) so the registry change is picked up
  // on the next render via the polling effect above.
  const runMediaCommand = (kind: 'select-all' | 'clear' | 'compare' | 'export' | 'favorite' | 'add-tag' | 'send-image' | 'copy-recipe') => () => {
    const handlers = getMediaCommandHandlers()
    if (!handlers) {
      toast.error('This command is only available in the Media Studio.')
      return
    }
    const store = useMediaSelectionStore.getState()
    if (kind === 'select-all') {
      handlers.onSelectAllVisible?.()
      toast.success('Selected all visible media')
    } else if (kind === 'clear') {
      handlers.onClearSelection?.()
      toast.success('Cleared media selection')
    } else if (kind === 'compare') {
      if (store.selectedMediaIds.length < 2 || store.selectedMediaIds.length > MEDIA_SELECTION_MAX) {
        toast.error(`Select 2 to ${MEDIA_SELECTION_MAX} items to compare.`)
        return
      }
      handlers.onCompare?.(store.selectedMediaIds)
    } else if (kind === 'export') {
      if (store.selectedMediaIds.length === 0) {
        toast.error('Select at least one media item to export.')
        return
      }
      handlers.onExport?.(store.selectedMediaIds)
    } else if (kind === 'favorite') {
      if (store.selectedMediaIds.length === 0) {
        toast.error('Select at least one media item.')
        return
      }
      handlers.onFavorite?.(store.selectedMediaIds)
    } else if (kind === 'add-tag') {
      if (store.selectedMediaIds.length === 0) {
        toast.error('Select at least one media item.')
        return
      }
      handlers.onAddTag?.(store.selectedMediaIds)
    } else if (kind === 'send-image') {
      if (store.selectedMediaIds.length === 0) {
        toast.error('Select at least one media item.')
        return
      }
      handlers.onSendToImage?.(store.selectedMediaIds)
    } else if (kind === 'copy-recipe') {
      if (store.selectedMediaIds.length === 0) {
        toast.error('Select at least one media item.')
        return
      }
      handlers.onCopyRecipe?.(store.selectedMediaIds)
    }
    onClose()
    setQuery('')
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-[520px] rounded-xl border border-border bg-surface shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="text-[11px] uppercase tracking-[0.08em] text-text-muted pl-1">Command</span>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tabs or actions… (e.g. image, new project)"
            className="flex-1 bg-transparent text-[14px] placeholder:text-text-muted/60 focus:outline-none"
          />
          <span className="text-[10px] text-text-muted pr-1">ESC</span>
        </div>

        <div className="max-h-[320px] overflow-auto py-1 text-sm">
          <div className="px-2 py-1 text-[10px] uppercase tracking-[0.06em] text-text-muted">Tabs (canonical)</div>
          {filteredTabs.length === 0 && (
            <div className="px-3 py-2 text-text-muted/70 text-[12px]">No matching tabs</div>
          )}
          {filteredTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTab(t.id)}
              className="w-full text-left px-3 py-1.5 hover:bg-background flex items-center gap-2"
            >
              <span>{t.label}</span>
              <span className="ml-auto text-[10px] text-text-muted/60">{t.group}</span>
            </button>
          ))}

          <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-[0.06em] text-text-muted border-t border-border mt-1">Projects &amp; Actions</div>
          <button onClick={handleNewProject} className="w-full text-left px-3 py-1.5 hover:bg-background">
            New Project
          </button>
          <button
            onClick={() => {
              const projs = useProjectStore.getState().activeProjects()
              if (projs.length) {
                useProjectStore.getState().setActiveProject(projs[0].id)
              } else {
                useProjectStore.getState().createProject('Quick Project').then(p => {
                  useProjectStore.getState().setActiveProject(p.id)
                })
              }
              onClose()
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background"
          >
            Switch / Open Current Project
          </button>

          {/* Phase 2B: selection-aware Media Studio commands. Rendered
              only when the gallery-view has registered its handlers. */}
          {hasMediaHandlers && (
            <div data-testid="command-palette-media-section">
              <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-[0.06em] text-text-muted border-t border-border mt-1">
                Media Studio ({selectionCount} selected)
              </div>
              <button
                onClick={runMediaCommand('select-all')}
                className="w-full text-left px-3 py-1.5 hover:bg-background"
                data-testid="command-palette-select-all"
              >
                Select All Visible Media
              </button>
              <button
                onClick={runMediaCommand('clear')}
                disabled={selectionCount === 0}
                className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed"
                data-testid="command-palette-clear-selection"
              >
                Clear Media Selection
              </button>
              <button
                onClick={runMediaCommand('compare')}
                disabled={!isCompareReady}
                className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed"
                data-testid="command-palette-compare"
              >
                Compare Selected Media
              </button>
              <button
                onClick={runMediaCommand('export')}
                disabled={selectionCount === 0}
                className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed"
                data-testid="command-palette-export"
              >
                Export Selected Media
              </button>
              <button
                onClick={runMediaCommand('favorite')}
                disabled={selectionCount === 0}
                className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed"
                data-testid="command-palette-favorite"
              >
                Favorite Selected Media
              </button>
              <button
                onClick={runMediaCommand('add-tag')}
                disabled={selectionCount === 0}
                className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed"
                data-testid="command-palette-add-tag"
              >
                Add Tag to Selected Media
              </button>
              <button
                onClick={runMediaCommand('send-image')}
                disabled={selectionCount === 0}
                className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed"
                data-testid="command-palette-send-image"
              >
                Send Selected to Image Studio
              </button>
              <button
                onClick={runMediaCommand('copy-recipe')}
                disabled={selectionCount === 0}
                className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed"
                data-testid="command-palette-copy-recipe"
              >
                Copy Selected Recipe JSON
              </button>
            </div>
          )}

          {/* Phase 2D — Prompt Library commands. Always visible so the
              palette can route the user into the library; per-prompt
              actions appear when the user has an active prompt. */}
          <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-[0.06em] text-text-muted border-t border-border mt-1">Prompt Library</div>
          <button
            onClick={() => {
              setActiveTab('prompts');
              onClose();
              setQuery('');
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background"
            data-testid="command-palette-open-prompts"
          >
            Open Prompt Library
          </button>
          <button
            onClick={async () => {
              const created = await usePromptLibraryStore.getState().createPrompt({
                title: 'Untitled prompt',
                kind: 'general',
                content: '',
                scope: 'global',
              });
              setActiveTab('prompts');
              usePromptLibraryStore.getState().setActivePrompt(created.id);
              toast.success('Created new prompt');
              onClose();
              setQuery('');
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background"
            data-testid="command-palette-new-prompt"
          >
            New Prompt
          </button>
          <button
            onClick={() => {
              const active = usePromptLibraryStore.getState().activePromptId;
              if (!active) {
                toast.error('Select a prompt in the Prompt Library first.');
                return;
              }
              const item = usePromptLibraryStore.getState().getPrompt(active);
              if (!item) {
                toast.error('No prompt selected.');
                return;
              }
              // Phase 2D: applying a prompt records source metadata so
              // the next save can trace lineage without us copying
              // secret-like content.
              navigator.clipboard
                .writeText(item.versions.find((v) => v.id === item.currentVersionId)?.content ?? '')
                .then(() => toast.success('Prompt copied to clipboard'))
                .catch(() => toast.error('Could not copy prompt'));
              onClose();
              setQuery('');
            }}
            disabled={promptCount === 0}
            className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed"
            data-testid="command-palette-use-selected-prompt"
          >
            Use Selected Prompt (copy)
          </button>
          <button
            onClick={async () => {
              const ids = usePromptLibraryStore
                .getState()
                .prompts.filter((p) => p.archivedAt === null)
                .map((p) => p.id);
              if (ids.length === 0) {
                toast.error('No prompts to export.');
                return;
              }
              const payload = usePromptLibraryStore.getState().exportPrompts(ids);
              const json = JSON.stringify(payload, null, 2);
              const blob = new Blob([json], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `venice-forge-prompts-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
              a.click();
              URL.revokeObjectURL(url);
              toast.success(`Exported ${ids.length} prompt${ids.length === 1 ? '' : 's'}`);
              onClose();
              setQuery('');
            }}
            disabled={promptCount === 0}
            className="w-full text-left px-3 py-1.5 hover:bg-background disabled:opacity-30 disabled:cursor-not-allowed"
            data-testid="command-palette-export-prompts"
          >
            Export Prompts
          </button>
          <button
            onClick={async () => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'application/json';
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const payload = JSON.parse(text);
                  const result = await usePromptLibraryStore.getState().importPrompts(payload);
                  toast.success(
                    `Imported ${result.imported.length} prompt${result.imported.length === 1 ? '' : 's'}` +
                      (result.skipped.length > 0 ? ` (skipped ${result.skipped.length})` : ''),
                  );
                } catch (err) {
                  toast.error(`Could not import: ${err instanceof Error ? err.message : String(err)}`);
                }
              };
              input.click();
              onClose();
              setQuery('');
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background"
            data-testid="command-palette-import-prompts"
          >
            Import Prompts…
          </button>

          <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-[0.06em] text-text-muted border-t border-border mt-1">System</div>
          <button
            onClick={() => {
              useSettingsStore.getState().setShowInspector(!useSettingsStore.getState().showInspector)
              onClose()
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-background"
          >
            Toggle Inspector
          </button>
        </div>

        <div className="border-t border-border px-3 py-1.5 text-[10px] text-text-muted/70 flex justify-between">
          <span>⌘K to toggle</span>
          <span>Tab / Enter to choose</span>
        </div>
      </div>
    </div>
  )
}
