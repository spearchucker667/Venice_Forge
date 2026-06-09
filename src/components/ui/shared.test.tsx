/** @fileoverview Shared UI components accessibility (Wave 2). */

import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TextArea, PillGroup } from './shared'

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
