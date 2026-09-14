import { describe, it, expect } from 'vitest'
import { BUILTIN_VENICE } from './venice'
import { isAAPass } from '../contrast'

const dark = BUILTIN_VENICE.variants.dark.tokens
const light = BUILTIN_VENICE.variants.light.tokens

describe('BUILTIN_VENICE reference retune', () => {
  it('dark variant uses the graphite/crimson reference palette', () => {
    expect(dark.background).toBe('#050505')
    expect(dark.surface).toBe('#0d0d10')
    expect(dark.surfaceElevated).toBe('#16161a')
    expect(dark.accent).toBe('#ef555f')
    expect(dark.accentHover).toBe('#f65964')
    expect(dark.glow).toBe('rgba(239, 85, 95, 0.12)')
    expect(dark.textMuted).toBe('#7f7a86')
  })

  it('dark variant meets WCAG AA for text and accent pairs', () => {
    expect(isAAPass(dark.textPrimary, dark.background)).toBe(true)
    expect(isAAPass(dark.textPrimary, dark.surface)).toBe(true)
    expect(isAAPass(dark.accent, dark.background)).toBe(true)
    expect(isAAPass(dark.accentForeground, dark.accent)).toBe(true)
    expect(isAAPass(dark.textMuted, dark.background)).toBe(true)
    expect(isAAPass(dark.textMuted, dark.surface)).toBe(true)
  })

  it('light variant is a true readable light theme with crimson accent', () => {
    expect(isAAPass(light.textPrimary, light.background)).toBe(true)
    expect(isAAPass(light.textPrimary, light.surface)).toBe(true)
    expect(isAAPass(light.accent, light.background)).toBe(true)
    expect(isAAPass(light.accentForeground, light.accent)).toBe(true)
    expect(isAAPass(light.textSecondary, light.background)).toBe(true)
  })

  it('retune does not touch code-theme preset wiring', () => {
    expect(BUILTIN_VENICE.variants.dark.code.preset).toBe('venice')
    expect(BUILTIN_VENICE.variants.light.code.preset).toBe('venice')
  })
})
