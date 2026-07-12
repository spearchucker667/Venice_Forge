import { useState, useRef, useEffect, memo, useMemo, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeSanitize from 'rehype-sanitize'
import type { ChatMessage, ContentPart } from '../../types/venice'
import { cn } from '../../lib/utils'
import { useSettingsStore } from '../../stores/settings-store'
import { maybeRunLocalFamilyGuard } from '../../shared/safety'
import { copyText } from '../../stores/media-send-to'
import { useKatexCss } from '../../hooks/useKatexCss'
import { CharacterSceneCard } from './CharacterSceneCard'
import type { CharacterSceneGenerationResult } from '../../types/characterSceneGeneration'

// Relative path so the default avatar resolves correctly both in Vite dev
// (where index.html is served from project root) and in the packaged Electron
// app (where loadFile points at dist/index.html beside ./assets/branding).
export const DEFAULT_AI_AVATAR_SRC = 'assets/branding/venice-seal-red-fill.svg'

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

type InjectedContextSource = NonNullable<ChatMessage['metadata']>['injectedContextSource']

function formatInjectedContextSource(source: InjectedContextSource | undefined): string {
  switch (source) {
    case 'memory':
      return 'Memory'
    case 'prior_context':
      return 'Prior context'
    case 'approved_context':
      return 'Approved context'
    case 'mixed':
      return 'Mixed context'
    default:
      return 'Injected context'
  }
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
          void copyText(codeStr)
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
  onEdit?: (content: ChatMessage['content']) => void
  onDeleteFromHere?: () => void
  onRegenerateFromHere?: () => void
  onForkFromHere?: () => void
  onRegenerate?: () => void
  onGenerateScene?: () => void
  isCharacterBound?: boolean
  assistantAvatarUrl?: string
}

function MessageBubbleImpl({ message, onCopy, onDelete, onEdit, onDeleteFromHere, onRegenerateFromHere, onForkFromHere, onRegenerate, onGenerateScene, isCharacterBound, assistantAvatarUrl }: MessageBubbleProps) {
  useKatexCss()

  const [hovering, setHovering] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'
  const { text: content, images } = extractContent(message.content)
  const redTeamMode = useSettingsStore((s) => s.redTeamMode)
  const localFamilySafeModeEnabled = useSettingsStore((s) => s.localFamilySafeModeEnabled)
  const characterSceneGenerationEnabled = useSettingsStore((s) => s.characterSceneGenerationEnabled)
  const sceneGeneration = message.metadata?.sceneGeneration as CharacterSceneGenerationResult | undefined
  const injectedContext = typeof message.metadata?.injectedContext === 'string'
    ? message.metadata.injectedContext.trim()
    : ''
  const injectedContextLabel = formatInjectedContextSource(message.metadata?.injectedContextSource)

  const localSafetyDecision = useMemo(() => {
    // BUG-React#3 regression guard: only run the safety guard in Traffic Inspector AND
    // when Family Safe Mode is enabled; non-redteam users should never pay the
    // regex/lookup cost on every render.
    if (!redTeamMode || !content || !localFamilySafeModeEnabled) return null
    try {
      return maybeRunLocalFamilyGuard(
        { endpoint: '/chat/completions', method: 'POST', text: content, source: 'chat' },
        true,
      ).guardDecision ?? null
    } catch {
      return null
    }
  }, [content, localFamilySafeModeEnabled, redTeamMode])

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }
    }
  }, [])

  const handleCopy = () => {
    void copyText(content)
    setCopied(true)
    onCopy()
    if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    copyTimeoutRef.current = setTimeout(() => setCopied(false), 1500)
  }

  const beginEdit = () => {
    setEditText(content)
    setIsEditing(true)
  }

  const saveEdit = () => {
    const nextContent: ChatMessage['content'] = typeof message.content === 'string'
      ? editText
      : message.content.map((part) => part.type === 'text' ? { ...part, text: editText } : { ...part })
    onEdit?.(nextContent)
    setIsEditing(false)
  }

  const injectedContextDisclosure = injectedContext ? (
    <details className="mt-3 rounded-lg border border-border/50 bg-surface-elevated/30 text-left text-[12px] text-text-secondary">
      <summary className="cursor-pointer select-none px-3 py-2 font-medium text-text-primary">
        {injectedContextLabel} attached to this message
      </summary>
      <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words border-t border-border/40 px-3 py-2 font-mono text-[12px] leading-relaxed text-text-muted">
        {injectedContext}
      </pre>
    </details>
  ) : null

  const actions = (
    <div className={`flex items-center gap-0.5 h-6 transition-opacity duration-150 focus-within:opacity-100 ${hovering ? 'opacity-100' : 'opacity-0'}`}>
      <ActionBtn label={copied ? 'Copied' : 'Copy'} onClick={handleCopy}>
        {copied ? (
          <svg aria-hidden="true" focusable="false" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        ) : (
          <svg aria-hidden="true" focusable="false" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
        )}
      </ActionBtn>
      {onEdit && (
        <ActionBtn label="Edit message" onClick={beginEdit}>
          <svg aria-hidden="true" focusable="false" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4Z"/></svg>
        </ActionBtn>
      )}
      {onForkFromHere && <ActionBtn label="Fork chat from here" onClick={onForkFromHere}>⑂</ActionBtn>}
      {onDeleteFromHere && <ActionBtn label="Delete from here" onClick={onDeleteFromHere}>⌫</ActionBtn>}
      {onRegenerateFromHere && <ActionBtn label="Regenerate from here" onClick={onRegenerateFromHere}>↻</ActionBtn>}
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
                  const allowedPrefixes = [
                    "data:image/png;base64,",
                    "data:image/jpeg;base64,",
                    "data:image/webp;base64,",
                    "blob:",
                    "https://",
                    "http://"
                  ]
                  const isSafe = allowedPrefixes.some(prefix => img.startsWith(prefix))
                  const safeImg = isSafe ? img.replace(/[<>"']/g, "") : ""
                  if (safeImg) {
                    return (
                      <img key={i} src={safeImg} alt={`Attachment ${i + 1}`} className="h-24 rounded-lg border border-border" />
                    )
                  }
                  return null
                })}
                </div>
              )}
            {isEditing ? (
              <div className="space-y-2">
                <textarea
                  aria-label="Edit message text"
                  autoFocus
                  value={editText}
                  onChange={(event) => setEditText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setIsEditing(false)
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) saveEdit()
                  }}
                  className="min-h-24 w-full resize-y rounded-md border border-border bg-surface p-2 text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setIsEditing(false)} className="rounded-md px-2 py-1 text-sm text-text-secondary hover:bg-surface">Cancel</button>
                  <button type="button" onClick={saveEdit} className="rounded-md bg-accent px-2 py-1 text-sm text-accent-fg">Save</button>
                </div>
              </div>
            ) : (
              <div className="text-text-primary text-[15.5px] leading-relaxed whitespace-pre-wrap break-words">
                {content}
              </div>
            )}
            {redTeamMode && localSafetyDecision && (
              <div className="mt-2 text-[12px] font-mono p-2 bg-surface border border-border/40 rounded-md text-left text-text-secondary select-text space-y-1">
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
            {injectedContextDisclosure}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
      <div className="w-8 h-8 rounded-lg bg-surface-elevated border border-border flex items-center justify-center shrink-0 mt-0.5 shadow-sm overflow-hidden">
        <img
          src={assistantAvatarUrl || DEFAULT_AI_AVATAR_SRC}
          alt="AI avatar"
          width={32}
          height={32}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
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

        {isEditing ? (
          <div className="space-y-2">
            <textarea
              aria-label="Edit message text"
              autoFocus
              value={editText}
              onChange={(event) => setEditText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setIsEditing(false)
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) saveEdit()
              }}
              className="min-h-28 w-full resize-y rounded-md border border-border bg-surface p-2 text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setIsEditing(false)} className="rounded-md px-2 py-1 text-sm text-text-secondary hover:bg-surface-elevated">Cancel</button>
              <button type="button" onClick={saveEdit} className="rounded-md bg-accent px-2 py-1 text-sm text-accent-fg">Save</button>
            </div>
          </div>
        ) : content ? (
          redTeamMode ? (
            <div className="space-y-2">
              <div className="bg-surface-elevated/40 border border-border rounded-lg p-3 font-mono text-[13px] whitespace-pre-wrap break-all leading-relaxed select-text">
                {content}
              </div>
              {localSafetyDecision && (
                <div className="text-[12px] font-mono p-2 bg-surface border border-border/40 rounded-md text-text-secondary select-text space-y-1">
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
                remarkPlugins={[remarkGfm, remarkMath]}
                rehypePlugins={[rehypeKatex, rehypeSanitize]}
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
        {injectedContextDisclosure}
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
                void copyText(sceneGeneration.prompt)
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
      className="p-2 text-text-muted/40 hover:text-text-secondary transition-colors rounded-md hover:bg-surface-elevated cursor-pointer"
    >
      {children}
    </button>
  )
}

// BUG-React#2 regression guard
export const MessageBubble = memo(MessageBubbleImpl)
