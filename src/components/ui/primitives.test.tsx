/** @fileoverview VF design-system primitives (2026-09-13). */
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IconButton, Pill, Toolbar, Card, EmptyState, Input, ShellPanel, PanelHeader, UtilityRailSection, DenseListRow, AccentProgress } from './primitives'

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

  it('keyboard-activates asPlainButton with Enter and Space', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <IconButton
        ariaLabel="Compose"
        icon={<span data-testid="icon" />}
        asPlainButton
        onClick={onClick}
      />,
    )
    const button = screen.getByRole('button', { name: 'Compose' })
    button.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onClick).toHaveBeenCalledTimes(2)
  })

  it('does not activate a disabled asPlainButton', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <IconButton
        ariaLabel="Compose"
        icon={<span data-testid="icon" />}
        asPlainButton
        disabled
        onClick={onClick}
      />,
    )
    const button = screen.getByRole('button', { name: 'Compose' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    button.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
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
  it('renders children inside an inline-flex container, omitting role=toolbar by default', () => {
    render(
      <Toolbar>
        <button type="button">A</button>
        <button type="button">B</button>
      </Toolbar>,
    )
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'A' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument()
  })

  it('emits role=toolbar when asToolbar or an accessible label is provided', () => {
    render(
      <Toolbar asToolbar aria-label="Action strip">
        <button type="button">A</button>
      </Toolbar>,
    )
    expect(screen.getByRole('toolbar', { name: 'Action strip' })).toBeInTheDocument()
  })

  it('omits the action-bar surface when bare', () => {
    render(
      <Toolbar bare asToolbar>
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

describe('Input', () => {
  it('renders an accessible input', () => {
    render(<Input aria-label="Search" placeholder="Filter..." />)
    const input = screen.getByRole('textbox', { name: 'Search' })
    expect(input).toBeInTheDocument()
    expect(input).toHaveAttribute('placeholder', 'Filter...')
  })

  it('renders leading and trailing adornments', () => {
    render(
      <Input
        aria-label="Filter"
        leading={<span data-testid="leading-icon">Icon</span>}
        trailing={<span data-testid="trailing-icon">Clear</span>}
      />,
    )
    expect(screen.getByTestId('leading-icon')).toBeInTheDocument()
    expect(screen.getByTestId('trailing-icon')).toBeInTheDocument()
  })

  it('handles input events and disabled state', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Input aria-label="Name" onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Name' })
    await user.type(input, 'Venice')
    expect(onChange).toHaveBeenCalled()
  })
})


describe('Input accessibility and interaction', () => {
  it('exposes validation and described help while preserving caller overrides', () => {
    const { rerender } = render(<><Input aria-label="Name" tone="danger" aria-describedby="name-help" /><span id="name-help">Use a unique name</span></>)
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('textbox')).toHaveAccessibleDescription('Use a unique name')
    rerender(<Input aria-label="Name" tone="danger" aria-invalid={false} />)
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-invalid', 'false')
  })

  it('keeps a trailing action keyboard accessible and blocks disabled input edits', async () => {
    const user = userEvent.setup()
    const clear = vi.fn()
    const change = vi.fn()
    render(<Input aria-label="Filter" disabled onChange={change} trailing={<button type="button" onClick={clear}>Clear</button>} />)
    expect(screen.getByRole('textbox')).toBeDisabled()
    await user.type(screen.getByRole('textbox'), 'ignored')
    expect(change).not.toHaveBeenCalled()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Clear' })).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(clear).toHaveBeenCalledOnce()
  })
})

describe('Reference shell primitives', () => {
  it('ShellPanel renders a framed panel and supports inset variant', () => {
    const { container: a } = render(<ShellPanel>content</ShellPanel>)
    expect(a.firstChild).toHaveClass('vf-shell-panel')
    const { container: b } = render(<ShellPanel inset>content</ShellPanel>)
    expect(b.firstChild).toHaveClass('vf-inset-canvas')
  })

  it('PanelHeader renders title and trailing actions', () => {
    render(
      <PanelHeader title="Metrics" actions={<button>act</button>} />,
    )
    expect(screen.getByText('Metrics')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'act' })).toBeInTheDocument()
  })

  it('UtilityRailSection renders its section label', () => {
    render(<UtilityRailSection title="Tasks">body</UtilityRailSection>)
    expect(screen.getByText('Tasks')).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('DenseListRow exposes selected state via data attribute', () => {
    render(<DenseListRow selected label="row" />)
    expect(screen.getByText('row').closest('[data-selected="true"]')).not.toBeNull()
  })

  it('AccentProgress renders an accessible progressbar', () => {
    render(<AccentProgress value={0.4} label="Generating" />)
    const bar = screen.getByRole('progressbar', { name: 'Generating' })
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(bar).toHaveAttribute('aria-valuenow', '40')
  })
})
