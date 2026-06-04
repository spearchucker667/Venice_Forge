import { useState } from 'react'
import { useSettingsStore } from '../../stores/settings-store'
import { useModels } from '../../hooks/use-models'
import { useAuthStore } from '../../stores/auth-store'
import { useEmbeddings } from '../../hooks/use-embeddings'
import { Label, TextArea, PrimaryButton, ErrorText, EmptyState } from '../ui/shared'
import { GenerationView } from '../ui/generation-view'

const PREVIEW_COUNT = 100

export function EmbeddingsView() {
  const apiKey = useAuthStore((s) => s.apiKey)
  const selectedModel = useSettingsStore((s) => s.selectedModels.embeddings)
  const { data: models } = useModels('embedding')
  const model = selectedModel || models?.[0]?.id || 'bge-m3'

  const [input, setInput] = useState('')
  const [expanded, setExpanded] = useState(false)
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
      <div><Label>Input text</Label><TextArea value={input} onChange={setInput} placeholder="Enter text to embed…" rows={6} /></div>
      <PrimaryButton onClick={() => { mutation.mutate({ model, input: input.trim() }); setExpanded(false) }} disabled={!input.trim() || !apiKey} loading={mutation.isPending} size="lg">
        Generate Embeddings
      </PrimaryButton>
      {mutation.error && <ErrorText>{mutation.error.message}</ErrorText>}
    </>
  )

  const output = (
    <div className="flex flex-col h-full">
        {!data && !input ? (
          <div className="flex items-center justify-center h-full">
            <div className="max-w-md w-full flex flex-col gap-2">
              <div className="text-[12px] uppercase tracking-[0.08em] text-white/35 font-medium text-left">Try one of these</div>
              {[
                'The quick brown fox jumps over the lazy dog.',
                'Embeddings turn text into a vector you can search by meaning.',
                'San Francisco is a city in northern California known for its fog and bridges.',
              ].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setInput(p)}
                  className="text-left px-3 py-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] hover:border-white/[0.14] hover:bg-white/[0.04] transition-all text-[14px] text-white/65 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/40"
                >
                  {p}
                </button>
              ))}
            </div>
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
                <button onClick={handleCopyVector} className="text-[13px] text-white/20 hover:text-white/40 transition-colors">Copy</button>
              </div>
              <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-4 max-h-[calc(100vh-240px)] overflow-y-auto">
                <code className="text-[14px] text-white/35 font-mono break-all leading-loose">
                  [{displayValues?.map((n, i) => (
                    <span key={i}>
                      <span className="text-white/50">{n.toFixed(6)}</span>
                      {i < (displayValues.length) - 1 && <span className="text-white/15">, </span>}
                    </span>
                  ))}
                  {!expanded && dims > PREVIEW_COUNT && <span className="text-white/15">, ...</span>}]
                </code>
              </div>
              {dims > PREVIEW_COUNT && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-[13px] text-white/20 hover:text-white/40 mt-2 transition-colors"
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
      <span className="text-white/20">{label}</span>
      <span className="text-white/55 bg-white/[0.03] border border-white/[0.04] rounded px-2 py-0.5 font-mono text-[13px]">{value}</span>
    </div>
  )
}
