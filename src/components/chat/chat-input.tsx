import { useState, useRef, useEffect, useCallback } from 'react'
import { cn } from '../../lib/utils'
import { toast } from '../../stores/toast-store'
import { redactErrorMessage } from '../../shared/redaction'
import { IngestedAttachment } from '../../types/ingestion'
import { processFileAttachment } from '../../services/ingestion/attachmentAssembler'
import { MAX_ATTACHMENTS_PER_MESSAGE } from '../../services/ingestion/ingestionLimits'
import type { ChatMemoryStatus } from '../../hooks/use-chat'

interface ChatInputProps {
  onSend: (message: string, attachments?: IngestedAttachment[]) => void
  onStop: () => void
  isStreaming: boolean
  disabled?: boolean
  disableImageAttach?: boolean
  visionUnsupportedModelId?: string
  memoryStatus?: ChatMemoryStatus
}

const SUPPORTED_ATTACHMENT_ACCEPT = [
  '.pdf',
  '.docx',
  '.doc',
  '.md',
  '.markdown',
  '.txt',
  '.json',
  '.jsonl',
  '.yaml',
  '.yml',
  '.csv',
  '.xls',
  '.xlsx',
  '.xml',
  '.html',
  '.htm',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.rb',
  '.php',
  '.cs',
  '.c',
  '.cpp',
  '.cc',
  '.cxx',
  '.h',
  '.hpp',
  '.java',
  '.kt',
  '.kts',
  '.swift',
  '.scala',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.ps1',
  '.bat',
  '.cmd',
  '.sql',
  '.toml',
  '.ini',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.avif',
  '.bmp',
  '.svg',
  '.tif',
  '.tiff',
  '.heic',
  '.heif',
  'text/plain',
  'application/pdf',
  'application/json',
  'image/*',
].join(',')

export function ChatInput({ onSend, onStop, isStreaming, disabled, disableImageAttach, visionUnsupportedModelId = 'Selected model', memoryStatus = 'idle' }: ChatInputProps) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<IngestedAttachment[]>([])
  const [dragOver, setDragOver] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const previousDisableImageAttach = useRef(disableImageAttach)

  useEffect(() => { textareaRef.current?.focus() }, [])

  const warnVisionUnsupported = useCallback(() => {
    toast.warn(
      'AI is not vision capable',
      `“${visionUnsupportedModelId}” cannot read image attachments. Select a vision-capable model or convert the image/PDF to text first.`,
    )
  }, [visionUnsupportedModelId])

  useEffect(() => {
    const switchedToNonVision = !previousDisableImageAttach.current && disableImageAttach
    previousDisableImageAttach.current = disableImageAttach
    if (switchedToNonVision && attachments.some((att) => att.modelRequirements.requiresVision)) {
      warnVisionUnsupported()
    }
  }, [attachments, disableImageAttach, warnVisionUnsupported])

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (disabled) return
    if (!trimmed && attachments.length === 0) return
    onSend(trimmed, attachments.length > 0 ? attachments : undefined)
    setValue('')
    setAttachments([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const attachDisabled = disabled
  const attachTitle = 'Attach file (or drag/paste)'

  const handleFileUpload = async (files: FileList | File[] | null) => {
    if (!files) return
    const list = Array.from(files)
    const remainingSlots = Math.max(0, MAX_ATTACHMENTS_PER_MESSAGE - attachments.length)

    if (remainingSlots === 0) {
      toast.warn(
        'Attachment limit reached',
        `You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`,
      )
      return
    }

    if (list.length > remainingSlots) {
      toast.warn(
        'Too many attachments',
        `Only ${remainingSlots} of ${list.length} files were added. The limit is ${MAX_ATTACHMENTS_PER_MESSAGE} files per message.`,
      )
    }

    const toProcess = list.slice(0, remainingSlots)
    for (const file of toProcess) {
      try {
        const attachment = await processFileAttachment(file, { providerSupportsVision: !disableImageAttach })
        if (disableImageAttach && attachment.modelRequirements.requiresVision) {
          warnVisionUnsupported()
        }
        setAttachments((prev) => [...prev, attachment])
        if (attachment.extraction.warnings.length > 0) {
           attachment.extraction.warnings.forEach(w => toast.warn('Attachment note', w));
        }
      } catch (err) {
        toast.error('Attachment failed', redactErrorMessage(err))
      }
    }
  }

  return (
    <div className="px-4 sm:px-6 pb-5 pt-2">
      <div className="w-full max-w-[860px] mx-auto">
        {attachments.length > 0 && (
          <div className="flex gap-2 mb-2 overflow-x-auto pb-1">
            {attachments.map((att, i) => {
              if (att.kind === 'image' && att.dataUrl) {
                const isSafe = ["data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,", "blob:"].some(prefix => att.dataUrl!.startsWith(prefix));
                const safeImg = isSafe ? att.dataUrl!.replace(/[<>"']/g, "") : "";
                return (
                  <div key={att.id} className="relative group shrink-0" title={att.name}>
                    <img src={safeImg} alt={`Attachment ${i + 1}`} className="h-16 w-16 object-cover rounded-lg border border-border" />
                    <button
                      onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                      aria-label={`Remove attachment ${att.name}`}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger hover:bg-danger/90 text-danger-fg border border-danger rounded-full flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                );
              }
              // Document/text attachment card
              return (
                <div key={att.id} className="relative group shrink-0 flex items-center gap-2 h-16 px-3 bg-surface border border-border rounded-lg max-w-[200px]" title={att.name}>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="text-[13px] font-medium text-text-primary truncate">{att.name}</span>
                    <span className="text-[11px] text-text-muted uppercase tracking-wider">{att.kind}</span>
                  </div>
                  <button
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove attachment ${att.name}`}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-danger hover:bg-danger/90 text-danger-fg border border-danger rounded-full flex items-center justify-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div
          className={cn(
            'mesh-input relative rounded-2xl overflow-hidden shadow-lg',
            'focus-within:border-accent focus-within:shadow-xl',
            dragOver ? 'border-accent bg-accent/10' : 'border-border',
          )}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!disabled) setDragOver(true) }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setDragOver(false) }}
          onDrop={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDragOver(false)
            if (!disabled) void handleFileUpload(e.dataTransfer.files)
          }}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
            }}
            onPaste={(e) => {
              if (disabled) return
              const items = e.clipboardData?.items
              if (!items) return
              const files: File[] = []
              for (const item of items) {
                if (item.kind === 'file') {
                  const file = item.getAsFile()
                  if (file) files.push(file)
                }
              }
              if (files.length > 0) {
                void handleFileUpload(files)
              }
            }}
            placeholder={disabled ? 'Connect an API key to start…' : dragOver ? 'Drop file to attach' : 'Ask anything — Enter to send, Shift+Enter for newline. Attach a file to send without text.'}
            rows={1}
            aria-label="Message input"
            className="w-full bg-transparent px-5 pt-4 pb-1 text-[16px] text-text-primary outline-none resize-none max-h-48 placeholder:text-text-muted leading-relaxed"
            disabled={disabled}
          />
          <div className="flex items-center justify-between px-3 pb-2.5">
            <div className="flex items-center gap-2">
              <input ref={fileRef} type="file" multiple accept={SUPPORTED_ATTACHMENT_ACCEPT} className="hidden" onChange={(e) => handleFileUpload(e.target.files)} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={attachDisabled}
                aria-label="Attach file"
                className="flex items-center gap-1.5 px-2 py-1.5 text-text-muted hover:text-text-primary text-[13px] transition-colors rounded-lg hover:bg-surface-elevated disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                title={attachTitle}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <MemoryStatusIndicator status={memoryStatus} />
            </div>
            {isStreaming ? (
              <button
                onClick={onStop}
                aria-label="Stop generating"
                className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium text-text-primary bg-surface-elevated hover:bg-surface border border-border rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <svg width="9" height="9" viewBox="0 0 8 8" fill="currentColor"><rect width="8" height="8" rx="1" /></svg>
                Stop
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={(!value.trim() && attachments.length === 0) || disabled}
                aria-label="Send message"
                className={cn(
                  'w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2',
                  (value.trim() || attachments.length > 0) && !disabled
                    ? 'bg-accent text-accent-fg hover:bg-accent-hover active:scale-95 shadow-sm'
                    : 'bg-surface-elevated text-text-muted border border-border',
                )}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MemoryStatusIndicator({ status }: { status: ChatMemoryStatus }) {
  if (status === 'idle') return null
  const config: Record<ChatMemoryStatus, { label: string; dot: string; title: string }> = {
    disabled: {
      label: 'Memory off',
      dot: 'bg-text-muted/40',
      title: 'Memory retrieval is disabled in Settings.',
    },
    idle: { label: '', dot: '', title: '' },
    loading: {
      label: 'Memory…',
      dot: 'bg-accent animate-pulse',
      title: 'Retrieving relevant memory for this message.',
    },
    injected: {
      label: 'Memory active',
      dot: 'bg-emerald-400',
      title: 'Relevant memory context will be included with this message.',
    },
    failed: {
      label: 'Memory failed',
      dot: 'bg-amber-400',
      title: 'Memory retrieval failed. Your message was sent without memory context.',
    },
  }
  const { label, dot, title } = config[status]
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-text-muted" title={title}>
      <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />
      <span>{label}</span>
    </div>
  )
}
