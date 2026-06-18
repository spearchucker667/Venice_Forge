import { useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { useChatStore } from '../../stores/chat-store'
import { usePromptLibraryStore } from '../../stores/prompt-library-store'
import { cn } from '../../lib/utils'

export function VeniceParams() {
  const customPrompts = usePromptLibraryStore(s => s.prompts.filter(p => !p.archivedAt && (p.kind === 'system' || p.kind === 'chat' || p.kind === 'general')))
  const { 
    veniceParams, 
    setVeniceParams, 
    systemPrompt, 
    setSystemPrompt, 
    temperature, 
    setTemperature, 
    topP, 
    setTopP, 
    maxTokens, 
    setMaxTokens,
    activeConversationId,
    setActiveConversation,
    conversations
  } = useChatStore(
    useShallow((s) => ({
      veniceParams: s.veniceParams,
      setVeniceParams: s.setVeniceParams,
      systemPrompt: s.systemPrompt,
      setSystemPrompt: s.setSystemPrompt,
      temperature: s.temperature,
      setTemperature: s.setTemperature,
      topP: s.topP,
      setTopP: s.setTopP,
      maxTokens: s.maxTokens,
      setMaxTokens: s.setMaxTokens,
      activeConversationId: s.activeConversationId,
      setActiveConversation: s.setActiveConversation,
      conversations: s.conversations,
    })),
  )
  const [showSettings, setShowSettings] = useState(false)

  const activeConv = activeConversationId ? conversations.find(c => c.id === activeConversationId) : null
  const hasMessages = (activeConv?.messages?.length ?? 0) > 0

  return (
    <div className="px-4 py-1.5">
      <div className="flex items-center gap-1">
        <SearchPill
          value={veniceParams.enable_web_search || 'off'}
          onChange={(v) => setVeniceParams({ enable_web_search: v })}
        />
        <Pill
          label="Citations"
          active={veniceParams.enable_web_citations === true}
          onClick={() => setVeniceParams({ enable_web_citations: !veniceParams.enable_web_citations })}
        />
        <Pill
          label="Scrape"
          active={veniceParams.enable_web_scraping === true}
          onClick={() => setVeniceParams({ enable_web_scraping: !veniceParams.enable_web_scraping })}
        />
        <Pill
          label="X search"
          active={veniceParams.enable_x_search === true}
          onClick={() => setVeniceParams({ enable_x_search: !veniceParams.enable_x_search })}
        />
        <Pill
          label="Search in stream"
          active={veniceParams.include_search_results_in_stream === true}
          onClick={() => setVeniceParams({ include_search_results_in_stream: !veniceParams.include_search_results_in_stream })}
        />
        <div className="ml-auto flex items-center gap-2">
          {activeConversationId !== null && hasMessages && (
            <button
              onClick={() => setActiveConversation(null)}
              className="flex items-center gap-1 text-[13px] font-medium px-2.5 py-[2px] rounded-full bg-surface-elevated/40 text-text-muted/60 hover:text-text-secondary hover:bg-surface-elevated/50 transition-colors duration-100 cursor-pointer"
              title="New Chat (⌘N)"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              New Chat
            </button>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={cn(
              'flex items-center gap-1 text-[13px] font-medium px-2 py-[2px] rounded-full transition-colors duration-100',
              showSettings ? 'bg-text-primary text-bg' : 'bg-surface-elevated/40 text-text-muted/40 hover:text-text-muted/60 hover:bg-surface-elevated/50 cursor-pointer',
            )}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            Settings
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="mt-2.5 pb-1 flex flex-col gap-2.5">
          <div>
            
            <div className="flex justify-between items-center mb-1">
              <label className="text-[13px] text-text-muted/40 font-medium block uppercase tracking-[0.08em]">App System Prompt</label>
              {customPrompts.length > 0 && (
                <select
                  className="bg-surface-elevated border border-border rounded px-2 py-0.5 text-[11px] text-text-muted outline-none hover:text-text-secondary transition-colors max-w-[200px] cursor-pointer"
                  onChange={(e) => {
                    const id = e.target.value;
                    if (id) {
                      const store = usePromptLibraryStore.getState();
                      const version = store.getCurrentVersion(id);
                      if (version && version.content) {
                        setSystemPrompt(version.content);
                      }
                    }
                    // Reset selection immediately to allow re-selection
                    e.target.value = "";
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Load from library...</option>
                  {customPrompts.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              )}
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Optional. Leave empty to avoid adding an app-authored system message."
              rows={2}
              className="w-full bg-surface-muted border border-border rounded-lg px-3 py-2 text-[15px] text-text-secondary outline-none resize-none placeholder:text-text-muted/30 focus:border-border-strong transition-colors"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <ParamSlider label="Temperature" value={temperature} onChange={setTemperature} min={0} max={2} step={0.1} />
            <ParamSlider label="Top P" value={topP} onChange={setTopP} min={0} max={1} step={0.05} />
            <ParamSlider label="Max Tokens" value={maxTokens} onChange={setMaxTokens} min={256} max={32768} step={256} format={(v) => v >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : String(v)} />
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Toggle label="Venice default prompt" active={veniceParams.include_venice_system_prompt !== false} onChange={(v) => setVeniceParams({ include_venice_system_prompt: v })} />
            <Toggle label="Disable thinking" active={veniceParams.disable_thinking === true} onChange={(v) => setVeniceParams({ disable_thinking: v })} />
            <Toggle label="Strip thinking" active={veniceParams.strip_thinking_response === true} onChange={(v) => setVeniceParams({ strip_thinking_response: v })} />
          </div>
        </div>
      )}
    </div>
  )
}

function ParamSlider({ label, value, onChange, min, max, step, format }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; format?: (v: number) => string
}) {
  const display = format ? format(value) : String(value)
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <label className="text-[12px] text-text-muted/40 font-medium uppercase tracking-[0.08em]">{label}</label>
        <span className="text-[12px] text-text-muted/50 font-mono">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
    </div>
  )
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'text-[13px] font-medium px-2 py-[2px] rounded-full transition-colors duration-100',
        active
          ? 'bg-text-primary text-bg'
          : 'bg-surface-elevated/40 text-text-muted/40 hover:text-text-muted/60 hover:bg-surface-elevated/50',
      )}
    >
      {label}
    </button>
  )
}

const SEARCH_MODES = ['off', 'on', 'auto'] as const
type SearchMode = (typeof SEARCH_MODES)[number]

function SearchPill({ value, onChange }: { value: string; onChange: (v: SearchMode) => void }) {
  const current = SEARCH_MODES.indexOf(value as SearchMode)
  const next = () => onChange(SEARCH_MODES[(current + 1) % SEARCH_MODES.length])
  const label = `Search: ${value}`
  const active = value !== 'off'

  return (
    <button
      onClick={next}
      className={cn(
        'text-[13px] font-medium px-2 py-[2px] rounded-full transition-colors duration-100',
        active
          ? 'bg-text-primary text-bg'
          : 'bg-surface-elevated/40 text-text-muted/40 hover:text-text-muted/60 hover:bg-surface-elevated/50',
      )}
    >
      {label}
    </button>
  )
}

function Toggle({ label, active, onChange }: { label: string; active: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!active)}
      className="flex items-center gap-2 text-[14px] text-text-muted/60 hover:text-text-secondary transition-colors"
    >
      <div className={cn(
        'w-6 h-3.5 rounded-full transition-colors duration-150 relative',
        active ? 'bg-text-primary' : 'bg-border',
      )}>
        <div className={cn(
          'absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all duration-150',
          active ? 'left-3 bg-bg' : 'left-0.5 bg-text-muted/40',
        )} />
      </div>
      {label}
    </button>
  )
}
