/** @fileoverview T-197 regression guard: toast-store central error helpers must
 *  redact descriptions before pushing them into UI state.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast, useToastStore } from './toast-store'

function resetStore() {
  useToastStore.setState({ toasts: [] })
}

describe('toast-store safe error handling (T-197)', () => {
  beforeEach(() => {
    resetStore()
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it('fromError redacts Venice API keys from Error messages', () => {
    const secret = 'vn-secret-key-12345'
    toast.fromError(new Error(`Request failed with ${secret}`))
    const t = useToastStore.getState().toasts[0]
    expect(t.description).not.toContain(secret)
    expect(t.description).toContain('[REDACTED]')
  })

  it('fromError redacts OpenAI-style API keys from Error messages', () => {
    const secret = 'sk-live-12345abcdef'
    toast.fromError(new Error(`Provider error: ${secret}`))
    const t = useToastStore.getState().toasts[0]
    expect(t.description).not.toContain(secret)
    expect(t.description).toContain('[REDACTED]')
  })

  it('fromError redacts bearer tokens from Error messages', () => {
    const token = 'abc123xyz'
    toast.fromError(new Error(`Auth failed: Bearer ${token}`))
    const t = useToastStore.getState().toasts[0]
    expect(t.description).not.toContain(token)
    expect(t.description).toContain('Bearer [REDACTED]')
  })

  it('fromError redacts secret assignments from Error messages', () => {
    toast.fromError(new Error('Config apiKey="super-secret-value" rejected'))
    const t = useToastStore.getState().toasts[0]
    expect(t.description).not.toContain('super-secret-value')
    expect(t.description).toContain('apiKey=[REDACTED]')
  })

  it('fromError redacts secrets from string errors', () => {
    const secret = 'sk-test-99999'
    toast.fromError(`Invalid token ${secret}`)
    const t = useToastStore.getState().toasts[0]
    expect(t.description).not.toContain(secret)
    expect(t.description).toContain('[REDACTED]')
  })

  it('fromError preserves non-sensitive error context', () => {
    toast.fromError(new Error('Network timeout'))
    const t = useToastStore.getState().toasts[0]
    expect(t.description).toBe('Network timeout')
  })

  it('fromError leaves description undefined for non-Error non-string values', () => {
    toast.fromError(null)
    const t = useToastStore.getState().toasts[0]
    expect(t.description).toBeUndefined()
  })

  it('toast.error stores caller-provided description unchanged', () => {
    toast.error('Title', 'Description')
    const t = useToastStore.getState().toasts[0]
    expect(t.description).toBe('Description')
  })
})
