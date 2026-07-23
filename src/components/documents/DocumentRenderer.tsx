import type { DocumentBlock } from '../../agent/contracts/documents'

export function DocumentRenderer({ blocks }: { blocks: DocumentBlock[] }) {
  if (!blocks || blocks.length === 0) {
    return <div className="text-[13px] text-foreground-muted italic py-4">Document is empty.</div>
  }

  return (
    <div className="space-y-4 text-foreground text-[14px] leading-relaxed select-text">
      {blocks.map((block) => {
        switch (block.type) {
          case 'heading': {
            const Tag = `h${block.level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
            const sizeClasses: Record<number, string> = {
              1: 'text-2xl font-bold mt-4 mb-2 text-foreground border-b border-border pb-1',
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
            return (
              <p key={block.id} className="text-foreground/90 whitespace-pre-wrap">
                {block.text}
              </p>
            )
          case 'quote':
            return (
              <blockquote
                key={block.id}
                className="border-l-4 border-accent/60 pl-3 py-1 text-foreground-muted italic bg-surface-elevated/40 rounded-r-md"
              >
                {block.text}
              </blockquote>
            )
          case 'code':
            return (
              <div key={block.id} className="rounded-lg border border-border bg-surface-sunken p-3 font-mono text-[13px] overflow-x-auto">
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
              <div key={block.id} className="overflow-x-auto my-3 rounded-lg border border-border">
                <table className="w-full text-left text-[13px] border-collapse">
                  <tbody>
                    {block.rows.map((row, rIdx) => (
                      <tr
                        key={row.id}
                        className={rIdx === 0 ? 'bg-surface-elevated font-semibold border-b border-border' : 'border-b border-border/40 hover:bg-surface-elevated/30'}
                      >
                        {row.cells.map((cell) => (
                          <td key={cell.id} className="p-2 border-r border-border/30 last:border-r-0">
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
              <div key={block.id} className="my-6 border-b border-dashed border-border/80 text-center relative">
                <span className="bg-surface px-2 text-[11px] text-foreground-muted uppercase tracking-widest absolute -top-2.5 left-1/2 -translate-x-1/2">
                  Page Break
                </span>
              </div>
            )
          default:
            return null
        }
      })}
    </div>
  )
}
