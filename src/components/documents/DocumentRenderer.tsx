import type { DocumentBlock } from '../../agent/contracts/documents'
import { Trans } from 'react-i18next';
import { ChatMarkdown } from '../chat/ChatMarkdown'

// Blocks whose text contains TeX math ($...$ / $$...$$) are rendered through
// the canonical safe markdown+math renderer. Only plain-text blocks
// (paragraph/quote) take this path; headings, lists, tables, code, and other
// structured blocks keep their dedicated renderers.
const MATH_PATTERN = /\$\$[\s\S]+?\$\$|\$[^$\n]+\$/

function containsMath(text: string): boolean {
  return MATH_PATTERN.test(text)
}

export function DocumentRenderer({ blocks }: { blocks: DocumentBlock[] }) {
  if (!blocks || blocks.length === 0) {
    return <div className="text-[13px] text-foreground-muted italic py-4"><Trans i18nKey="common:surface.componentsDocumentsDocumentrenderer.text.documentIsEmpty" /></div>
  }

  return (
    <div className="space-y-4 text-foreground text-[14px] leading-relaxed select-text">
      {blocks.map((block) => {
        switch (block.type) {
          case 'heading': {
            const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
            const sizeClasses: Record<number, string> = {
              1: 'text-2xl font-bold mt-4 mb-2 text-foreground border-y border-vf-panel-border pb-1',
              2: 'text-xl font-bold mt-3 mb-2 text-foreground',
              3: 'text-lg font-semibold mt-3 mb-1 text-foreground',
              4: 'text-base font-semibold mt-2 mb-1 text-foreground',
              5: 'text-sm font-semibold mt-2 mb-1 text-foreground',
              6: 'text-xs font-semibold mt-2 mb-1 text-foreground-muted uppercase tracking-wider',
            }
            return (
              <Tag key={block.id} className={sizeClasses[block.level] || 'font-bold'}>
                {block.text}
              </Tag>
            )
          }
          case 'paragraph':
            if (containsMath(block.text)) {
              return (
                <div key={block.id} className="text-foreground/90">
                  <ChatMarkdown content={block.text} />
                </div>
              )
            }
            return (
              <p key={block.id} className="text-foreground/90 whitespace-pre-wrap">
                {block.text}
              </p>
            )
          case 'quote':
            if (containsMath(block.text)) {
              return (
                <blockquote
                  key={block.id}
                  className="border-l-4 border-accent/60 pl-3 py-1 text-foreground-muted italic bg-vf-panel-bg-raised/40 rounded-r-md"
                >
                  <ChatMarkdown content={block.text} />
                </blockquote>
              )
            }
            return (
              <blockquote
                key={block.id}
                className="border-l-4 border-accent/60 pl-3 py-1 text-foreground-muted italic bg-vf-panel-bg-raised/40 rounded-r-md"
              >
                {block.text}
              </blockquote>
            )
          case 'code':
            return (
              <div key={block.id} className="rounded-md border border-vf-panel-border bg-vf-panel-bg-sunken p-3 font-mono text-[13px] overflow-x-auto">
                {block.language && (
                  <div className="text-[11px] text-foreground-muted uppercase tracking-wider mb-1 font-sans">
                    {block.language}
                  </div>
                )}
                <pre className="whitespace-pre overflow-x-auto text-foreground/90">{block.text}</pre>
              </div>
            )
          case 'list': {
            const ListTag = block.ordered ? 'ol' : 'ul'
            return (
              <ListTag
                key={block.id}
                className={`pl-5 space-y-1 ${block.ordered ? 'list-decimal' : 'list-disc'} text-foreground/90`}
              >
                {block.items.map((item) => (
                  <li key={item.id}>{item.text}</li>
                ))}
              </ListTag>
            )
          }
          case 'table':
            return (
              <div key={block.id} className="overflow-x-auto my-3 rounded-md border border-vf-panel-border">
                <table className="w-full text-left text-[13px] border-collapse">
                  <tbody>
                    {block.rows.map((row, rIdx) => (
                      <tr
                        key={row.id}
                        className={rIdx === 0 ? 'bg-vf-panel-bg-raised font-semibold border-y border-vf-panel-border' : 'border-b border-vf-panel-border hover:bg-vf-control-hover'}
                      >
                        {row.cells.map((cell) => (
                          <td key={cell.id} className="p-2 border-r border-vf-panel-border last:border-r-0">
                            {cell.text}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'pageBreak':
            return (
              <div key={block.id} className="my-6 border-b border-dashed border-vf-panel-border text-center relative">
                <span className="bg-vf-panel-bg px-2 text-[11px] text-foreground-muted uppercase tracking-widest absolute -top-2.5 left-1/2 -translate-x-1/2">
                  <Trans i18nKey="common:surface.componentsDocumentsDocumentrenderer.text.pageBreak" /></span>
              </div>
            )
          default:
            return null
        }
      })}
    </div>
  )
}
