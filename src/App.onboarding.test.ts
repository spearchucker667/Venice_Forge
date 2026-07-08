import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Regression guard: OnboardingSplash is mounted in the app after the first-run age gate.
describe('App.tsx onboarding splash wiring', () => {
  const source = readFileSync(resolve(__dirname, './App.tsx'), 'utf8')

  it('imports OnboardingSplash', () => {
    expect(source).toMatch(/import \{ OnboardingSplash \} from ['"]\.\/components\/OnboardingSplash['"]/)
  })

  it('renders OnboardingSplash only after the first-run modal is acknowledged', () => {
    expect(source).toMatch(/\{firstRunAcked && <OnboardingSplash \/>\}/)
  })
})
