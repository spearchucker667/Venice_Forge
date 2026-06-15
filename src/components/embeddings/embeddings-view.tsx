import { useId, useState } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { useModels } from '../../hooks/use-models'
import { selectHasVeniceKey, useAuthStore } from '../../stores/auth-store'
import { useEmbeddings } from '../../hooks/use-embeddings'
import { Label, TextArea, PrimaryButton, ErrorText, EmptyState, ExamplePrompts } from '../ui/shared'
import { GenerationView } from '../ui/generation-view'
import { getPromptStartersForCategory } from '../../services/promptStarterService'
import { redactErrorMessage } from '../../shared/redaction'

const PREVIEW_COUNT = 100

export function EmbeddingsView() {
  const inputId = useId()
  const hasVeniceKey = useAuthStore(selectHasVeniceKey)
  const selectedModel = useSettingsStore((s) => s.selectedModels.embeddings)
  const { data: models } = useModels('embedding')
  const model = selectedModel || models?.[0]?.id || 'bge-m3'

  const [input, setInput] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [starters, setStarters] = useState<string[]>(() => getPromptStartersForCategory('embeddings', 3))
  const mutation = useEmbeddings()
  const data = mutation.data

  const embedding = data?.data[0]?.embedding
  const dims = embedding?.length ?? 0
  const displayValues = expanded ? embedding : embedding?.slice(0, PREVIEW_COUNT)

  const handleCopyVector = () => {
    if (embedding) navigator.clipboard.writeText(JSON.stringify(embedding))
  }

  const controls = (
    <>
      <div><Label htmlFor={inputId}>Input text</Label><TextArea id={inputId} value={input} onChange={setInput} placeholder="Enter text to embed…" rows={6} /></div>
      <PrimaryButton onClick={() => { mutation.mutate({ model, input: input.trim() }); setExpanded(false) }} disabled={!input.trim() || !hasVeniceKey} loading={mutation.isPending} size="lg">
        Generate Embeddings
      </PrimaryButton>
      {mutation.error && <ErrorText>{redactErrorMessage(mutation.error)}</ErrorText>}
    </>
  )

  const output = (
    <div className="flex flex-col h-full">
        {!data && !input ? (
          <div className="flex items-center justify-center h-full">
            <ExamplePrompts
              items={starters}
              onPick={setInput}
              onShuffle={() => setStarters(getPromptStartersForCategory('embeddings', 3))}
            />
          </div>
        ) : data ? (
          <div className="animate-fade-in flex flex-col gap-4">
            <div className="flex items-center gap-6 text-[14px]">
              <Stat label="Model" value={data.model} />
              <Stat label="Dimensions" value={String(dims)} />
              <Stat label="Tokens" value={String(data.usage.prompt_tokens)} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label>Vector ({dims} dimensions)</Label>
                <button onClick={handleCopyVector} className="text-[13px] text-text-muted hover:text-text-muted transition-colors">Copy</button>
              </div>
              <div className="bg-surface-elevated border border-border rounded-lg p-4 max-h-[calc(100vh-240px)] overflow-y-auto">
                <code className="text-[14px] text-text-muted font-mono break-all leading-loose">
                  [{displayValues?.map((n, i) => (
                    <span key={i}>
                      <span className="text-text-secondary">{n.toFixed(6)}</span>
                      {i < (displayValues.length) - 1 && <span className="text-text-muted">, </span>}
                    </span>
                  ))}
                  {!expanded && dims > PREVIEW_COUNT && <span className="text-text-muted">, ...</span>}]
                </code>
              </div>
              {dims > PREVIEW_COUNT && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-[13px] text-text-muted hover:text-text-muted mt-2 transition-colors"
                >
                  {expanded ? `Show first ${PREVIEW_COUNT}` : `Show all ${dims} values`}
                </button>
              )}
            </div>
          </div>
        ) : (
          <EmptyState>Embedding vectors appear here</EmptyState>
        )}
    </div>
  )

  return <GenerationView controls={controls} output={output} />
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-text-muted">{label}</span>
      <span className="text-text-secondary bg-surface-elevated border border-border rounded px-2 py-0.5 font-mono text-[13px]">{value}</span>
    </div>
  )
}
