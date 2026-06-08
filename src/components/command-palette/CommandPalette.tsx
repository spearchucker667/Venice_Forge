/** @fileoverview Phase 1 Command Palette.
 * Trigger: Cmd+K / Ctrl+K via this component's mounted listener.
 * Supports:
 *  - Quick tab switching (uses the canonical TAB_REGISTRY)
 *  - "New project" action (creates via project-store + activates)
 *  - Close on Escape or clicking outside.
 *
 * Recipe commands are intentionally absent until selected-recipe context exists.
 */

import React, { useEffect, useState } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { useProjectStore } from '../../stores/project-store'
import { TAB_REGISTRY, type TabId } from '../../config/tabs'
import { toast } from '../../stores/toast-store'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  onToggle: () => void
}

export function CommandPalette({ open, onClose, onToggle }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)

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
