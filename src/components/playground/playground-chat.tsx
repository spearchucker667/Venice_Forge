import { useState, useRef, useEffect } from 'react'
import { usePlaygroundStore, type PlaygroundActivity } from '../../stores/playground-store'
import { useAuthStore } from '../../stores/auth-store'
import { useSettingsStore } from '../../stores/settings-store'
import { useModelCatalog } from '../../hooks/use-model-catalog'
import { useAgentModels } from '../../hooks/use-agent-models'
import { callAgent, DEFAULT_AGENT_MODEL } from '../../lib/playground-agent'
import { runAgentTools, type RunStep } from '../../lib/playground-agent-tools'
import { applyPatch, type WorkflowPatch } from '../../lib/workflow-mutations'
import { generateId } from '../../lib/utils'
import { cn } from '../../lib/utils'

const STARTER_PROMPTS = [
  'Build a workflow that makes a 9:16 reel using web search to research the topic, then writes a script and generates the video',
  'Research a topic with web search, summarize into 5 bullets, and narrate it as audio',
  'Turn a concept into a vivid image prompt, then generate the image',
  'Write a short song with lyrics, then generate it as music',
]

function summarizeStep(step: RunStep): PlaygroundActivity {
  const ok = !('error' in step.result) || !step.result.error
  const a = step.args
  switch (step.tool) {
    case 'clear':
      return { tool: step.tool, summary: 'Cleared canvas', ok }
    case 'add_node': {
      const id = (step.result as { id?: string }).id
      const type = String(a.node_type ?? '?')
      return { tool: step.tool, summary: ok ? `Added ${type}${id ? ` "${id}"` : ''}` : `Failed to add ${type}: ${(step.result as { error?: string }).error}`, ok }
    }
    case 'connect': {
      const s = String(a.source ?? ''), t = String(a.target ?? '')
      return { tool: step.tool, summary: ok ? `Connected ${s} → ${t}` : `Connect failed (${s} → ${t}): ${(step.result as { error?: string }).error}`, ok }
    }
    case 'set_params':
      return { tool: step.tool, summary: ok ? `Updated params on ${String(a.id ?? '')}` : `set_params failed: ${(step.result as { error?: string }).error}`, ok }
    case 'remove_node':
      return { tool: step.tool, summary: ok ? `Removed ${String(a.id ?? '')}` : `remove failed: ${(step.result as { error?: string }).error}`, ok }
    case 'pick_model': {
      const model = (step.result as { model?: string }).model
      return { tool: step.tool, summary: ok ? `Picked ${model} for ${String(a.node_type ?? '')}` : `pick_model failed`, ok }
    }
    case 'ask_user':
      return { tool: step.tool, summary: 'Awaiting your reply', ok }
    case 'done':
      return { tool: step.tool, summary: 'Finished', ok }
    default:
      return { tool: step.tool, summary: step.tool, ok }
  }
}

export function PlaygroundChat() {
  const { messages, draft, isThinking, addMessage, updateMessage, setThinking, applyAgentPatches } = usePlaygroundStore()
  const hasKey = useAuthStore((s) => s.apiKey !== null)
  const agentModelId = useSettingsStore((s) => s.playgroundAgentModel) || DEFAULT_AGENT_MODEL
  const { catalog } = useModelCatalog()
  const { models: agentModels } = useAgentModels()
  const agentCaps = agentModels.find((m) => m.id === agentModelId)?.capabilities
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, isThinking])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isThinking) return
    if (!hasKey) {
      setError('Connect your Venice API key first.')
      return
    }
    setError(null)
    setInput('')

    const userMsg = { id: generateId(), role: 'user' as const, content: trimmed }
    const pendingMsg = { id: generateId(), role: 'assistant' as const, content: '', pending: true, activity: [] }
    addMessage(userMsg)
    addMessage(pendingMsg)
    setThinking(true)

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const history = messages
      .filter((m) => !m.pending && !m.error)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      const useTools = agentCaps?.supportsFunctionCalling === true

      if (useTools) {
        // Tool-call mode — incremental, streams activity, self-corrects on errors.
        const activity: PlaygroundActivity[] = []
        const result = await runAgentTools({
          userMessage: trimmed,
          draft,
          history,
          catalog,
          agentModels,
          model: agentModelId,
          capabilities: agentCaps,
          signal: controller.signal,
          applyPatch: (patch: WorkflowPatch) => {
            try {
              const current = usePlaygroundStore.getState().draft
              const r = applyPatch({ nodes: current.nodes, edges: current.edges }, patch)
              usePlaygroundStore.setState({ draft: { nodes: r.nodes, edges: r.edges } })
              return { ok: true, id: r.addedNodeId, edge_id: r.addedEdgeId }
            } catch (e) {
              return { error: e instanceof Error ? e.message : 'Patch failed' }
            }
          },
          onStep: (step) => {
            activity.push(summarizeStep(step))
            updateMessage(pendingMsg.id, { activity: [...activity] })
          },
        })

        updateMessage(pendingMsg.id, {
          content: result.say || 'Done.',
          activity,
          pending: false,
        })
      } else {
        // Legacy JSON-patch mode for models without function calling.
        const response = await callAgent({
          userMessage: trimmed,
          draft,
          history,
          catalog,
          model: agentModelId,
          capabilities: agentCaps,
          signal: controller.signal,
        })

        let patchError: string | undefined
        try {
          if (response.patches.length > 0) applyAgentPatches(response.patches)
        } catch (e) {
          patchError = e instanceof Error ? e.message : 'Failed to apply patches'
        }

        const invalidNote = response.invalidPatches > 0
          ? ` (${response.invalidPatches} invalid patch${response.invalidPatches === 1 ? '' : 'es'} ignored)`
          : ''

        const fallbackSay = response.patches.length === 0 && !response.say
          ? 'The agent returned an unparseable response. Try a different model from the picker above, or simplify the request.'
          : response.say || (response.patches.length > 0 ? 'Updated the workflow.' : '')

        updateMessage(pendingMsg.id, {
          content: fallbackSay + invalidNote,
          patches: response.patches,
          error: patchError,
          pending: false,
        })
      }
    } catch (e) {
      if (controller.signal.aborted) {
        updateMessage(pendingMsg.id, { content: '', error: 'Cancelled', pending: false })
      } else {
        const message = e instanceof Error ? e.message : 'Agent request failed'
        updateMessage(pendingMsg.id, { content: '', error: message, pending: false })
      }
    } finally {
      setThinking(false)
      abortRef.current = null
    }
  }

  const cancel = () => {
    abortRef.current?.abort()
  }

  return (
    <div className="flex flex-col h-full var(--color-surface)">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-3 pt-8">
            <div className="text-[15px] text-white/85 font-semibold mb-1">What should I build?</div>
            <div className="text-[13px] text-white/45 mb-4">Describe a workflow in plain language. I&apos;ll assemble it on the canvas in real time.</div>
            <div className="flex flex-col gap-2">
              {STARTER_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => send(p)}
                  className="text-left px-3 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04] transition-all text-[13px] text-white/65 hover:text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn('flex flex-col gap-1.5', m.role === 'user' ? 'items-end' : 'items-start')}
              >
                <div
                  className={cn(
                    'max-w-[88%] px-3.5 py-2 rounded-xl text-[13.5px] leading-relaxed whitespace-pre-wrap',
                    m.role === 'user'
                      ? 'bg-white/[0.09] text-white border border-white/[0.05]'
                      : 'bg-white/[0.04] border border-white/[0.07] text-white/85',
                  )}
                >
                  {m.pending && (!m.activity || m.activity.length === 0) ? (
                    <span className="text-white/45 inline-flex items-center gap-1.5">
                      <span className="inline-block w-3 h-3 border-2 border-white/20 border-t-[var(--color-accent)] rounded-full animate-spin" />
                      Thinking…
                    </span>
                  ) : m.error ? (
                    <span className="text-red-300/95">{m.error}</span>
                  ) : (
                    m.content || <span className="text-white/35 italic">(no message)</span>
                  )}
                </div>

                {m.activity && m.activity.length > 0 && (
                  <div className="max-w-[88%] flex flex-col gap-px text-[11.5px] font-mono text-white/45 px-1">
                    {m.activity.map((a, i) => (
                      <div key={i} className={cn('flex items-center gap-1.5', !a.ok && 'text-rose-300/85')}>
                        <span className="text-white/30">·</span>
                        <span>{a.summary}</span>
                      </div>
                    ))}
                    {m.pending && (
                      <div className="flex items-center gap-1.5 text-white/35">
                        <span className="inline-block w-2 h-2 border border-white/20 border-t-[var(--color-accent)] rounded-full animate-spin" />
                        <span>Working…</span>
                      </div>
                    )}
                  </div>
                )}

                {m.patches && m.patches.length > 0 && !m.activity?.length && (
                  <div className="max-w-[88%] px-3 py-1 text-[11px] text-white/40 font-mono tracking-wide">
                    {m.patches.length} patch{m.patches.length === 1 ? '' : 'es'} applied
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-white/[0.06] p-3">
        {error && <div className="mb-2 text-[13px] text-red-300/95">{error}</div>}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            placeholder={isThinking ? 'Agent is working…' : 'Describe a workflow or change…'}
            rows={2}
            disabled={isThinking}
            className="flex-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-[13.5px] text-white/90 outline-none resize-none placeholder:text-white/30 focus:border-white/[0.2] disabled:opacity-60"
          />
          {isThinking ? (
            <button
              onClick={cancel}
              className="shrink-0 px-3 py-2 text-[13px] text-white/85 hover:text-white border border-white/[0.12] hover:bg-white/[0.05] rounded-lg transition-colors"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={() => send(input)}
              disabled={!input.trim()}
              className="shrink-0 px-4 py-2 text-[13px] font-medium bg-white text-black rounded-lg hover:bg-white/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
