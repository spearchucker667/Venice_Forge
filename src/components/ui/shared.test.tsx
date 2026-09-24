/** @fileoverview Shared UI components accessibility (Wave 2). */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TextArea, PillGroup, PrimaryButton } from './shared'

vi.mock('../../services/uiSoundController', () => ({
  uiSoundController: { play: vi.fn() },
}))

describe('TextArea — accessible name', () => {
  it('does not derive aria-label from placeholder', () => {
    render(<TextArea value="" onChange={vi.fn()} placeholder="Type here…" />)
    const textarea = screen.getByRole('textbox')
    expect(textarea).not.toHaveAttribute('aria-label')
  })

  it('sets aria-label when ariaLabel prop is provided', () => {
    render(<TextArea value="" onChange={vi.fn()} ariaLabel="Description" />)
    expect(screen.getByRole('textbox', { name: 'Description' })).toBeInTheDocument()
  })

  it('is accessible by visible label via htmlFor/id', () => {
    render(
      <>
        <label htmlFor="desc">Description</label>
        <TextArea id="desc" value="" onChange={vi.fn()} />
      </>,
    )
    expect(screen.getByRole('textbox', { name: 'Description' })).toBeInTheDocument()
  })

  it('bounds the editor with vertical resize, internal scroll, and max height (VF-20260923-P1-022)', () => {
    render(<TextArea value="prompt text" onChange={vi.fn()} />)
    const textarea = screen.getByRole('textbox')
    expect(textarea.className).toContain('resize-y')
    expect(textarea.className).toContain('overflow-y-auto')
    expect(textarea.className).toContain('min-h-[80px]')
    expect(textarea.className).toContain('max-h-[min(40vh,360px)]')
    expect(textarea.className).not.toContain('resize-none')
  })

  it('merges custom className when supplied', () => {
    render(<TextArea value="" onChange={vi.fn()} className="custom-class" />)
    const textarea = screen.getByRole('textbox')
    expect(textarea.className).toContain('custom-class')
    expect(textarea.className).toContain('resize-y')
  })
})

describe('PrimaryButton — layout and accessibility', () => {
  it('applies w-full by default for standalone CTAs', () => {
    render(<PrimaryButton onClick={vi.fn()}>Save</PrimaryButton>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveClass('w-full')
  })

  it('omits w-full when fullWidth={false} so it can sit in a flex row', () => {
    render(
      <PrimaryButton fullWidth={false} onClick={vi.fn()}>
        + Document
      </PrimaryButton>,
    )
    const button = screen.getByRole('button', { name: '+ Document' })
    expect(button).not.toHaveClass('w-full')
    expect(button).toHaveClass('rounded-lg')
  })

  it('merges className after the base classes for layout overrides', () => {
    render(
      <PrimaryButton
        fullWidth={false}
        className="shrink-0 whitespace-nowrap"
        onClick={vi.fn()}
      >
        New
      </PrimaryButton>,
    )
    const button = screen.getByRole('button', { name: 'New' })
    expect(button).toHaveClass('shrink-0')
    expect(button).toHaveClass('whitespace-nowrap')
    // base styling still present
    expect(button).toHaveClass('rounded-lg')
  })

  it('invokes onClick and plays the primary sound when activated', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const { uiSoundController } = await import(
      '../../services/uiSoundController'
    )
    render(<PrimaryButton onClick={onClick}>Go</PrimaryButton>)
    await user.click(screen.getByRole('button', { name: 'Go' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(uiSoundController.play).toHaveBeenCalledWith('primaryClick')
  })

  it('is disabled when loading and exposes aria-busy', () => {
    render(
      <PrimaryButton loading onClick={vi.fn()}>
        Save
      </PrimaryButton>,
    )
    const button = screen.getByRole('button', { name: /working/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
  })
})

describe('PillGroup — accessible name', () => {
  const OPTIONS = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ]

  it('requires and exposes aria-label on the radiogroup', () => {
    render(<PillGroup options={OPTIONS} value="a" onChange={vi.fn()} ariaLabel="Choose one" />)
    const group = screen.getByRole('radiogroup', { name: 'Choose one' })
    expect(group).toBeInTheDocument()
  })

  it('supports aria-labelledby when provided', () => {
    render(
      <>
        <span id="pill-label">Pick a letter</span>
        <PillGroup options={OPTIONS} value="a" onChange={vi.fn()} ariaLabel="Choose one" labelledBy="pill-label" />
      </>,
    )
    const group = screen.getByRole('radiogroup')
    expect(group).toHaveAttribute('aria-labelledby', 'pill-label')
  })

  it('renders radios with aria-checked', () => {
    render(<PillGroup options={OPTIONS} value="a" onChange={vi.fn()} ariaLabel="Choose one" />)
    const radios = screen.getAllByRole('radio')
    expect(radios[0]).toHaveAttribute('aria-checked', 'true')
    expect(radios[1]).toHaveAttribute('aria-checked', 'false')
  })
})
