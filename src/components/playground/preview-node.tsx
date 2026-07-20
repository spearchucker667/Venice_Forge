import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import type { VeniceNodeData } from '../../stores/workflow-store'
import { NODE_SCHEMAS } from '../../lib/workflow-schema'
import { usePlaygroundStore } from '../../stores/playground-store'
import { cn } from '../../lib/utils'
import { ManagedVideoPlayer } from '../media/ManagedVideoPlayer'

const COLORS: Record<string, string> = {
  textInput: 'border-blue-500/30',
  chat: 'border-purple-500/30',
  imageGen: 'border-pink-500/30',
  tts: 'border-green-500/30',
  music: 'border-yellow-500/30',
  video: 'border-orange-500/30',
  output: 'border-border',
}

type PreviewNode = Node<VeniceNodeData>

function PreviewNodeComponent({ id, data }: NodeProps<PreviewNode>) {
  const schema = NODE_SCHEMAS[data.nodeType]
  const border = COLORS[data.nodeType] ?? 'border-border'
  const hasInput = schema?.input !== 'none'
  const hasOutput = schema?.output !== 'none'
  const result = usePlaygroundStore((s) => s.runResults[id])

  const summary: string | undefined = (() => {
    if (data.nodeType === 'textInput') return data.inputText?.trim() || undefined
    if (data.nodeType === 'output') return undefined
    return data.prompt?.trim() || undefined
  })()

  const meta: string[] = []
  if (data.model) meta.push(data.model)
  if (data.nodeType === 'chat' && data.webSearch && data.webSearch !== 'off') meta.push(`web:${data.webSearch}`)
  if (data.nodeType === 'imageGen') {
    if (data.width && data.height) meta.push(`${data.width}×${data.height}`)
    if (data.steps) meta.push(`${data.steps} steps`)
  }
  if (data.nodeType === 'music' && data.duration) meta.push(`${data.duration}s`)
  if (data.nodeType === 'video' && data.videoAspectRatio) meta.push(data.videoAspectRatio)
  if (data.nodeType === 'tts' && data.voice) meta.push(data.voice)

  const statusRing =
    result?.status === 'running' ? 'ring-2 ring-accent animate-pulse'
    : result?.status === 'done' ? 'ring-2 ring-green-500/30'
    : result?.status === 'error' ? 'ring-2 ring-red-500/30'
    : ''

  const output = result?.output
  const outputKind = result?.outputKind
  const isImage = outputKind === 'image' || output?.startsWith('[image:')
  const isAudio = outputKind === 'audio' || output?.startsWith('[audio:')
  const isVideo = outputKind === 'video' || output?.startsWith('[video:')

  const strippedOutput = (() => {
    if (!output) return undefined
    if (output.startsWith('[image:')) return output.slice(7, -1)
    if (output.startsWith('[audio:')) return output.slice(7, -1)
    if (output.startsWith('[video:')) return output.slice(7, -1)
    return output
  })()

  return (
    <div className={cn('rounded-xl border-2 bg-surface-elevated shadow-xl min-w-[240px] max-w-[280px]', border, statusRing)}>
      {hasInput && <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-surface-elevated !border-2 !border-[var(--color-surface-elevated)]" />}

      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-border/50">
        <span className="text-[13.5px] font-medium text-text-secondary">{schema?.label ?? data.nodeType}</span>
        {result?.status === 'running' && <span className="ml-auto text-[12px] text-text-muted">Running…</span>}
        {result?.status === 'done' && <span className="ml-auto text-[12px] text-green-400/50">Done</span>}
        {result?.status === 'error' && <span className="ml-auto text-[12px] text-red-400/60">Error</span>}
        {!result?.status && meta.length > 0 && (
          <span className="ml-auto text-[12px] text-text-muted truncate max-w-[140px]" title={meta.join(' · ')}>{meta.join(' · ')}</span>
        )}
      </div>

      {summary && !result?.status && (
        <div className="px-3.5 py-2.5">
          <p className="text-[12.5px] text-text-secondary leading-relaxed line-clamp-3 whitespace-pre-wrap">{summary}</p>
        </div>
      )}

      {result?.status === 'error' && (
        <div className="px-3.5 py-2.5">
          <p className="text-[12.5px] text-red-400/70 leading-relaxed whitespace-pre-wrap">{result.error}</p>
        </div>
      )}

      {result?.status === 'done' && strippedOutput && (
        <div className="px-3.5 py-2.5">
          {isImage ? (
            <img src={strippedOutput} alt="" className="w-full rounded border border-border" />
          ) : isAudio ? (
            <audio src={strippedOutput} controls className="w-full h-8" />
          ) : isVideo ? (
            <ManagedVideoPlayer src={strippedOutput} className="w-full rounded border border-border" />
          ) : (
            <p className="text-[12.5px] text-text-secondary leading-relaxed line-clamp-6 whitespace-pre-wrap">{strippedOutput}</p>
          )}
        </div>
      )}

      {hasOutput && <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-surface-elevated !border-2 !border-[var(--color-surface-elevated)]" />}
    </div>
  )
}

export const PreviewNode = memo(PreviewNodeComponent)
