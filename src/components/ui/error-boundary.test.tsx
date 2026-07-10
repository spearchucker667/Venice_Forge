/** @fileoverview ErrorBoundary safe error handling (T-092/T-093 regression guards). */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './error-boundary'
import * as logger from '../../shared/logger'

function Thrower({ error }: { error: Error }): React.ReactElement {
  throw error
}

function getDetailsPre() {
  return screen.getByText(/Show details/i).closest('details')!.querySelector('pre')
}

describe('ErrorBoundary — T-093: default fallback must not render raw secrets or paths', () => {
  it('redacts API keys from the displayed error message', () => {
    const error = new Error('Venice call failed with sk-1234567890abcdef')
    render(
      <ErrorBoundary>
        <Thrower error={error} />
      </ErrorBoundary>,
    )

    const pre = getDetailsPre()
    expect(pre).toHaveTextContent('Venice call failed with [REDACTED]')
    expect(pre).not.toHaveTextContent('sk-1234567890abcdef')
  })

  it('redacts local file paths from the displayed stack trace', () => {
    const error = new Error('render failed')
    error.stack = `Error: render failed\n    at Thrower (/Users/example/Projects/app/src/thrower.tsx:5:10)\n    at div`
    render(
      <ErrorBoundary>
        <Thrower error={error} />
      </ErrorBoundary>,
    )

    const pre = getDetailsPre()
    expect(pre).toHaveTextContent('[REDACTED-PATH]')
    expect(pre).not.toHaveTextContent('/Users/example/Projects/app')
  })

  it('redacts source URLs from the displayed stack trace', () => {
    const error = new Error('render failed')
    error.stack = `Error: render failed\n    at Thrower (http://localhost:5173/src/thrower.tsx?t=123:5:10)\n    at div`
    render(
      <ErrorBoundary>
        <Thrower error={error} />
      </ErrorBoundary>,
    )

    const pre = getDetailsPre()
    expect(pre).toHaveTextContent('[REDACTED-PATH]')
    expect(pre).not.toHaveTextContent('http://localhost:5173/src/thrower.tsx')
  })
})

describe('ErrorBoundary — T-092: logging must not leak raw secrets or paths', () => {
  it('logs redacted error details and component stacks', () => {
    const loggerSpy = vi.spyOn(logger, 'error').mockImplementation(() => {})
    const error = new Error('request failed with Bearer vn-abcdef1234567890')
    error.stack = `Error: request failed with Bearer vn-abcdef1234567890\n    at Thrower (/Users/example/Projects/app/src/thrower.tsx:5:10)`

    render(
      <ErrorBoundary>
        <Thrower error={error} />
      </ErrorBoundary>,
    )

    expect(loggerSpy).toHaveBeenCalledTimes(1)
    const logArgs = loggerSpy.mock.calls[0]
    const loggedPayload = JSON.stringify(logArgs)
    expect(loggedPayload).not.toContain('vn-abcdef1234567890')
    expect(loggedPayload).not.toContain('/Users/example/Projects/app')
    expect(loggedPayload).not.toContain('http://localhost:5173/src/thrower.tsx')
    expect(loggedPayload).toContain('[REDACTED]')
    expect(loggedPayload).toContain('[REDACTED-PATH]')
    expect(logArgs[2]).toEqual(
      expect.objectContaining({
        componentStack: expect.stringContaining('[REDACTED-PATH]'),
      }),
    )

    loggerSpy.mockRestore()
  })

  it('passes the raw error to the optional onError callback without modifying it', () => {
    const onError = vi.fn()
    const error = new Error('raw callback test')
    render(
      <ErrorBoundary onError={onError}>
        <Thrower error={error} />
      </ErrorBoundary>,
    )

    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith(error, expect.objectContaining({ componentStack: expect.any(String) }))
  })
})
