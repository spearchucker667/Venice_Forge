import { useState, useRef, useEffect, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage, ContentPart } from '../../types/venice'
import { cn } from '../../lib/utils'
import { useSettingsStore } from '../../stores/settings-store'
import { maybeRunLocalFamilyGuard } from '../../shared/safety'
import { safeMediaPreviewUrl } from '../../utils/safePreviewUrl'
import { CharacterSceneCard } from './CharacterSceneCard'
import type { CharacterSceneGenerationResult } from '../../types/characterSceneGeneration'

// Allow http/https/mailto links and image data: URIs only. Strips javascript:,
// vbscript:, file:, and any other smuggled protocols.
const SAFE_URL_PROTOCOLS = /^(https?:|mailto:|#)/i
function safeUrlTransform(url: string, key: string): string {
  if (!url) return ''
  // react-markdown's default already handles most protocol filtering; we layer
  // an explicit allow-list on top because we render untrusted model output.
  const cleaned = defaultUrlTransform(url)
  if (!cleaned) return ''
  if (key === 'src' && cleaned.startsWith('data:image/')) return cleaned
  if (SAFE_URL_PROTOCOLS.test(cleaned)) return cleaned
  return ''
}

function CodeBlock({ children, className, ...props }: ComponentPropsWithoutRef<'code'>) {
  const match = /language-(\w+)/.exec(className || '')
  const lang = match ? match[1] : ''
  const codeStr = String(children).replace(/\n$/, '')
  const [codeCopied, setCodeCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  if (!className && !String(children).includes('\n')) {
    return <code className={className} {...props}>{children}</code>
  }

  return (
    <div className="relative group/code">
      {lang && (
        <div className="absolute top-0 left-0 px-3 py-1.5 text-[13px] text-text-muted/30 font-mono uppercase tracking-wider select-none">{lang}</div>
      )}
      <button
        onClick={() => {
          navigator.clipboard.writeText(codeStr)
          setCodeCopied(true)
          if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
          copyTimeoutRef.current = setTimeout(() => setCodeCopied(false), 1500)
        }}
        className="absolute top-1.5 right-1.5 px-2 py-1 text-[13px] font-medium text-text-muted/40 hover:text-text-secondary bg-surface-elevated/40 hover:bg-surface-elevated/80 rounded-md transition-all opacity-0 group-hover/code:opacity-100 cursor-pointer"
      >
        {codeCopied ? 'Copied' : 'Copy'}
      </button>
      <code className={className} {...props}>{children}</code>
    </div>
  )
}

// Extract text and images from multimodal content
function extractContent(content: string | ContentPart[]): { text: string; images: string[] } {
  if (!content) return { text: '', images: [] }
  if (typeof content === 'string') return { text: content, images: [] }
  let text = ''
  const images: string[] = []
  for (const part of content) {
    if (part.type === 'text' && part.text) text += part.text
    if (part.type === 'image_url' && part.image_url?.url) images.push(part.image_url.url)
  }
  return { text, images }
}

interface MessageBubbleProps {
  message: ChatMessage
  index: number
  onCopy: () => void
  onDelete: () => void
  onRegenerate?: () => void
  onGenerateScene?: () => void
  isCharacterBound?: boolean
}

export function MessageBubble({ message, onCopy, onDelete, onRegenerate, onGenerateScene, isCharacterBound }: MessageBubbleProps) {
  const [hovering, setHovering] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const { text: content, images } = extractContent(message.content)
  const redTeamMode = useSettingsStore((s) => s.redTeamMode)
  const localFamilySafeModeEnabled = useSettingsStore((s) => s.localFamilySafeModeEnabled)
  const characterSceneGenerationEnabled = useSettingsStore((s) => s.characterSceneGenerationEnabled)
  const sceneGeneration = message.metadata?.sceneGeneration as CharacterSceneGenerationResult | undefined

  const localSafetyDecision = content && localFamilySafeModeEnabled ? (() => {
    try {
      return maybeRunLocalFamilyGuard(
        { endpoint: '/chat/completions', method: 'POST', text: content, source: 'chat' },
        true,
      ).guardDecision ?? null
    } catch {
      return null
    }
  })() : null

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    onCopy()
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500)
  }

  const actions = (
    <div className={`flex items-center gap-0.5 h-6 transition-opacity duration-150 ${hovering ? 'opacity-100' : 'opacity-0'}`}>
      <ActionBtn label={copied ? 'Copied' : 'Copy'} onClick={handleCopy}>
        {copied ? (
          <svg aria-hidden="true" focusable="false" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        ) : (
          <svg aria-hidden="true" focusable="false" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
        )}
      </ActionBtn>
      {!isUser && onRegenerate && (
        <ActionBtn label="Regenerate" onClick={onRegenerate}>
          <svg aria-hidden="true" focusable="false" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
        </ActionBtn>
      )}
      {!isUser && isAssistant && characterSceneGenerationEnabled && isCharacterBound && onGenerateScene && (
        <ActionBtn label="Create scene" onClick={onGenerateScene}>
          <svg aria-hidden="true" focusable="false" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
        </ActionBtn>
      )}
      <ActionBtn label="Delete" onClick={onDelete}>
        <svg aria-hidden="true" focusable="false" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
      </ActionBtn>
    </div>
  )

  if (isUser) {
    return (
      <div className="flex justify-end" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
        <div className="flex items-end gap-1.5 max-w-[78%]">
          {actions}
          <div className="bg-surface-elevated border border-border rounded-2xl rounded-br-md px-4 py-2.5 shadow-sm">
            {images.length > 0 && (
              <div className="flex gap-1.5 mb-2">
                {images.map((img, i) => {
                  const safeImg = safeMediaPreviewUrl(img, [
                    "data:image/png;base64,",
                    "data:image/jpeg;base64,",
                    "data:image/webp;base64,",
                    "blob:",
                    "https://",
                    "http://",
                  ]);
                  if (!safeImg) return null;
                  return (
                    <img key={i} src={safeImg} alt={`Attachment ${i + 1}`} className="h-24 rounded-lg border border-border" />
                  );
                })}
              </div>
            )}
            <div className="text-text-primary text-[15.5px] leading-relaxed whitespace-pre-wrap break-words">
              {content}
            </div>
            {redTeamMode && localSafetyDecision && (
              <div className="mt-2 text-[11px] font-mono p-2 bg-surface border border-border/40 rounded-md text-left text-text-secondary select-text space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-text-muted">Safety:</span>
                  <span className={localSafetyDecision.allow ? "text-accent font-semibold" : "text-danger font-semibold"}>
                    {localSafetyDecision.allow ? "ALLOW" : "BLOCKED"}
                  </span>
                </div>
                {localSafetyDecision.reasonCode && (
                  <div><span className="font-semibold text-text-muted">Code:</span> {localSafetyDecision.reasonCode}</div>
                )}
                {localSafetyDecision.signals && localSafetyDecision.signals.length > 0 && (
                  <div><span className="font-semibold text-text-muted">Signals:</span> {localSafetyDecision.signals.map(s => `${s.category}:${s.source}`).join(', ')}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-white/95 to-white/75 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <svg aria-hidden="true" focusable="false" viewBox="0 0 32 32" width="14" height="14" fill="none">
          <g fill="#0a0a0c">
            <rect x="6.2" y="7.5" width="1.6" height="18" rx="0.8" transform="rotate(-42 6.2 7.5)" />
            <rect x="24.2" y="6.3" width="1.6" height="18" rx="0.8" transform="rotate(42 24.2 6.3)" />
            <polygon points="7.2,8.8 3.8,7.2 4.5,5.5 8.5,7.2" />
            <polygon points="24.8,8.8 28.2,7.2 27.5,5.5 23.5,7.2" />
            <rect x="14.3" y="14.3" width="3.4" height="3.4" rx="0.4" transform="rotate(45 16 16)" />
            <circle cx="9.2" cy="24.5" r="4" />
            <circle cx="9.2" cy="24.5" r="1.7" fill="#fff" />
            <circle cx="22.8" cy="24.5" r="4" />
            <circle cx="22.8" cy="24.5" r="1.7" fill="#fff" />
            <path d="M16 5.5L12.5 8.5V12.5L16 10.5L19.5 12.5V8.5Z" />
          </g>
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        {/* Reasoning content (thinking) */}
        {message.reasoning_content && (
          <div className="mb-2">
            <button
              onClick={() => setReasoningOpen(!reasoningOpen)}
              className="flex items-center gap-1.5 text-[14px] text-text-muted hover:text-text-secondary transition-colors mb-1 cursor-pointer"
            >
              <svg aria-hidden="true" focusable="false" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                className={cn('transition-transform duration-150', reasoningOpen && 'rotate-90')}>
                <path d="M3.5 2L6.5 5L3.5 8" />
              </svg>
              Thinking
            </button>
            {reasoningOpen && (
              <div className="bg-surface border border-border rounded-lg px-3 py-2 text-[15px] text-text-muted leading-relaxed whitespace-pre-wrap animate-fade-in max-h-60 overflow-y-auto">
                {message.reasoning_content}
              </div>
            )}
          </div>
        )}

        {content ? (
          redTeamMode ? (
            <div className="space-y-2">
              <div className="bg-surface-elevated/40 border border-border rounded-lg p-3 font-mono text-[13px] whitespace-pre-wrap break-all leading-relaxed select-text">
                {content}
              </div>
              {localSafetyDecision && (
                <div className="text-[11px] font-mono p-2 bg-surface border border-border/40 rounded-md text-text-secondary select-text space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-text-muted">Safety:</span>
                    <span className={localSafetyDecision.allow ? "text-accent font-semibold" : "text-danger font-semibold"}>
                      {localSafetyDecision.allow ? "ALLOW" : "BLOCKED"}
                    </span>
                  </div>
                  {localSafetyDecision.reasonCode && (
                    <div><span className="font-semibold text-text-muted">Code:</span> {localSafetyDecision.reasonCode}</div>
                  )}
                  {localSafetyDecision.signals && localSafetyDecision.signals.length > 0 && (
                    <div><span className="font-semibold text-text-muted">Signals:</span> {localSafetyDecision.signals.map(s => `${s.category}:${s.source}`).join(', ')}</div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="prose-venice text-[15.5px] leading-relaxed text-text-primary">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                urlTransform={safeUrlTransform}
                components={{
                  code: CodeBlock,
                  a: ({ href, children, ...props }) => (
                    <a {...props} href={href} target="_blank" rel="noopener noreferrer ugc">
                      {children}
                    </a>
                  ),
                }}
              >{content}</ReactMarkdown>
            </div>
          )
        ) : (
          <span className="inline-flex gap-1.5 py-1.5">
            <span className="w-1 h-1 rounded-full bg-text-muted animate-pulse-dot" />
            <span className="w-1 h-1 rounded-full bg-text-muted animate-pulse-dot [animation-delay:200ms]" />
            <span className="w-1 h-1 rounded-full bg-text-muted animate-pulse-dot [animation-delay:400ms]" />
          </span>
        )}
        {isAssistant && sceneGeneration && (
          <CharacterSceneCard
            status={sceneGeneration.status}
            prompt={sceneGeneration.prompt}
            imageUrl={sceneGeneration.imageUrl}
            error={sceneGeneration.error}
            rateLimitReason={sceneGeneration.rateLimitReason}
            onRetry={onGenerateScene}
            onRegenerate={onGenerateScene}
            onCopyPrompt={() => {
              if (sceneGeneration.prompt) {
                navigator.clipboard.writeText(sceneGeneration.prompt)
              }
            }}
          />
        )}
        <div className="mt-0.5">{actions}</div>
      </div>
    </div>
  )
}

function ActionBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="p-1 text-text-muted/40 hover:text-text-secondary transition-colors rounded-md hover:bg-surface-elevated cursor-pointer"
    >
      {children}
    </button>
  )
}
