/** @fileoverview VF design-system primitives (2026-09-13). */
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IconButton, Pill, Toolbar, Card, EmptyState } from './primitives'

describe('IconButton', () => {
  it('renders an accessible button with the provided label', () => {
    render(
      <IconButton
        ariaLabel="Copy"
        icon={<span data-testid="icon" />}
        onClick={() => undefined}
      />,
    )
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
  })

  it('calls onClick when activated', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <IconButton
        ariaLabel="Delete"
        icon={<span data-testid="icon" />}
        onClick={onClick}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled and not clickable when disabled', () => {
    const onClick = vi.fn()
    render(
      <IconButton
        ariaLabel="Regenerate"
        icon={<span data-testid="icon" />}
        onClick={onClick}
        disabled
      />,
    )
    expect(screen.getByRole('button', { name: 'Regenerate' })).toBeDisabled()
  })

  it('renders with role=button when asPlainButton is true', () => {
    render(
      <IconButton
        ariaLabel="Compose"
        icon={<span data-testid="icon" />}
        asPlainButton
      />,
    )
    expect(screen.getByRole('button', { name: 'Compose' })).toBeInTheDocument()
  })
})

describe('Pill', () => {
  it('renders the supplied label with the default neutral tone', () => {
    render(<Pill>Streaming</Pill>)
    const pill = screen.getByText('Streaming')
    expect(pill).toBeInTheDocument()
    expect(pill.closest('[data-tone="neutral"]')).not.toBeNull()
  })

  it('exposes a data-tone attribute for themeable tones', () => {
    render(<Pill tone="danger">Cached</Pill>)
    expect(screen.getByText('Cached').closest('[data-tone="danger"]')).not.toBeNull()
  })

  it('renders a leading icon when provided', () => {
    render(
      <Pill leading={<span data-testid="dot" />}>
        Image
      </Pill>,
    )
    expect(screen.getByTestId('dot')).toBeInTheDocument()
  })
})

describe('Toolbar', () => {
  it('renders children inside an inline-flex container with role=toolbar', () => {
    render(
      <Toolbar>
        <button type="button">A</button>
        <button type="button">B</button>
      </Toolbar>,
    )
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument()
  })

  it('omits the action-bar surface when bare', () => {
    render(
      <Toolbar bare>
        <button type="button">A</button>
      </Toolbar>,
    )
    const toolbar = screen.getByRole('toolbar')
    expect(toolbar.className).not.toContain('vf-action-bar')
  })
})

describe('Card', () => {
  it('renders the children inside an elevated card', () => {
    render(
      <Card>
        <span data-testid="child">Hello</span>
      </Card>,
    )
    const child = screen.getByTestId('child')
    const card = child.parentElement
    expect(card).toHaveAttribute('data-elevation', 'elevated')
  })

  it('supports the elevated-2 elevation tier', () => {
    render(
      <Card elevation="elevated-2">
        <span data-testid="child">Hello</span>
      </Card>,
    )
    const card = screen.getByTestId('child').parentElement
    expect(card).toHaveAttribute('data-elevation', 'elevated-2')
    expect(card?.className).toContain('surface-elevated-2')
  })
})

describe('EmptyState', () => {
  it('renders eyebrow, headline, helper, and optional action', () => {
    render(
      <EmptyState
        eyebrow={<span>Tip</span>}
        headline="Start a new chat"
        helper="Pick a model and send a message."
        action={<button type="button">New chat</button>}
      />,
    )
    expect(screen.getByText('Tip')).toBeInTheDocument()
    expect(screen.getByText('Start a new chat')).toBeInTheDocument()
    expect(screen.getByText('Pick a model and send a message.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument()
  })
})
