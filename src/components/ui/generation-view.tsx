import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

interface Props {
  controls: ReactNode
  output: ReactNode
  history?: ReactNode
  className?: string
}

/**
 * Common layout for image / audio / music / video generation:
 *   ┌─────────┬───────────────────┐
 *   │ Form    │ Output / Gallery  │
 *   │ (left)  │ (right, primary)  │
 *   └─────────┴───────────────────┘
 *
 * On narrow screens, controls collapse above output.
 */
export function GenerationView({ controls, output, history, className }: Props) {
  return (
    <div className={cn('flex flex-col md:flex-row h-full min-h-0 bg-surface relative overflow-hidden', className)}>
      <aside className="shrink-0 border-b md:border-b-0 md:border-r border-border/40 flex flex-col bg-surface-elevated max-h-[55vh] md:max-h-none w-full md:w-[clamp(340px,30vw,460px)] soft-separator-x">
        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          {controls}
        </div>
        {history && (
          <div className="border-t border-border/40 flex-1 min-h-0 overflow-y-auto p-3">
            {history}
          </div>
        )}
      </aside>
      <main className="flex-1 min-h-0 min-w-0 overflow-y-auto p-5 md:p-8 bg-surface/40">
        {output}
      </main>
    </div>
  )
}
