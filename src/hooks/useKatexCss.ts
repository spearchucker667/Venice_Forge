import { useEffect } from 'react'

// BUG-React#4 regression guard: single module-level singleton ensures the
// katex CSS chunk is fetched and inserted exactly once, regardless of how
// many MessageBubble instances mount across the lifetime of the renderer
// process. Each bubble used to fire its own `useEffect(() => import(...))`
// which produced a web of identical Promises per bubble mount; the CSS is
// deduped by Vite at runtime but the JS churn still showed up in profiling.
let katexCssPromise: Promise<unknown> | null = null

function ensureKatexCssLoaded(): Promise<unknown> {
  if (!katexCssPromise) {
    // @ts-expect-error - TS doesn't know about CSS imports without ambient declarations
    katexCssPromise = import('katex/dist/katex.min.css')
  }
  return katexCssPromise
}

export function useKatexCss(): void {
  useEffect(() => {
    void ensureKatexCssLoaded()
  }, [])
}
