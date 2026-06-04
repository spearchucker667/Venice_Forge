import { useState, type ComponentPropsWithoutRef } from 'react'
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ChatMessage, ContentPart } from '../../types/venice'
import { cn } from '../../lib/utils'

// Allow http/https/mailto links and image data: URIs only. Strips javascript:,
// vbscript:, file:, and any other smuggled protocols.
const SAFE_URL_PROTOCOLS = /^(https?:|mailto:|#|\/|\.)/i
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

  if (!className && !String(children).includes('\n')) {
    return <code className={className} {...props}>{children}</code>
  }

  return (
    <div className="relative group/code">
      {lang && (
        <div className="absolute top-0 left-0 px-3 py-1.5 text-[13px] text-white/15 font-mono uppercase tracking-wider select-none">{lang}</div>
      )}
      <button
        onClick={() => { navigator.clipboard.writeText(codeStr); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 1500) }}
        className="absolute top-1.5 right-1.5 px-2 py-1 text-[13px] font-medium text-white/15 hover:text-white/40 bg-white/[0.03] hover:bg-white/[0.06] rounded-md transition-all opacity-0 group-hover/code:opacity-100"
      >
        {codeCopied ? 'Copied' : 'Copy'}
      </button>
      <code className={className} {...props}>{children}</code>
    </div>
  )
}

// Extract text and images from multimodal content
function extractContent(content: string | ContentPart[]): { text: string; images: string[] } {
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
}

export function MessageBubble({ message, onCopy, onDelete, onRegenerate }: MessageBubbleProps) {
  const [hovering, setHovering] = useState(false)
  const [copied, setCopied] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const isUser = message.role === 'user'
  const { text: content, images } = extractContent(message.content)

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    onCopy()
    setTimeout(() => setCopied(false), 1500)
  }

  const actions = (
    <div className={`flex items-center gap-0.5 h-6 transition-opacity duration-150 ${hovering ? 'opacity-100' : 'opacity-0'}`}>
      <ActionBtn label={copied ? 'Copied' : 'Copy'} onClick={handleCopy}>
        {copied ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></svg>
        )}
      </ActionBtn>
      {!isUser && onRegenerate && (
        <ActionBtn label="Regenerate" onClick={onRegenerate}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>
        </ActionBtn>
      )}
      <ActionBtn label="Delete" onClick={onDelete}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" /></svg>
      </ActionBtn>
    </div>
  )

  if (isUser) {
    return (
      <div className="flex justify-end" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
        <div className="flex items-end gap-1.5 max-w-[78%]">
          {actions}
          <div className="bg-white/[0.07] border border-white/[0.05] rounded-2xl rounded-br-md px-4 py-2.5 shadow-sm">
            {images.length > 0 && (
              <div className="flex gap-1.5 mb-2">
                {images.map((img, i) => (
                  <img key={i} src={img} alt={`Attachment ${i + 1}`} className="h-24 rounded-lg border border-white/[0.06]" />
                ))}
              </div>
            )}
            <div className="text-white/95 text-[15.5px] leading-relaxed whitespace-pre-wrap break-words">
              {content}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-3" onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}>
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-white/95 to-white/75 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
        <svg viewBox="0 0 32 32" width="14" height="14" fill="none">
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
              className="flex items-center gap-1.5 text-[14px] text-white/20 hover:text-white/35 transition-colors mb-1"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                className={cn('transition-transform duration-150', reasoningOpen && 'rotate-90')}>
                <path d="M3.5 2L6.5 5L3.5 8" />
              </svg>
              Thinking
            </button>
            {reasoningOpen && (
              <div className="bg-white/[0.02] border border-white/[0.04] rounded-lg px-3 py-2 text-[15px] text-white/30 leading-relaxed whitespace-pre-wrap animate-fade-in max-h-60 overflow-y-auto">
                {message.reasoning_content}
              </div>
            )}
          </div>
        )}

        {content ? (
          <div className="prose-venice text-[15.5px] leading-relaxed text-white/85">
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
        ) : (
          <span className="inline-flex gap-1.5 py-1.5">
            <span className="w-1 h-1 rounded-full bg-white/25 animate-pulse-dot" />
            <span className="w-1 h-1 rounded-full bg-white/25 animate-pulse-dot" style={{ animationDelay: '0.2s' }} />
            <span className="w-1 h-1 rounded-full bg-white/25 animate-pulse-dot" style={{ animationDelay: '0.4s' }} />
          </span>
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
      className="p-1 text-white/15 hover:text-white/40 transition-colors rounded-md hover:bg-white/[0.04]"
    >
      {children}
    </button>
  )
}
