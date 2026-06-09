/** @fileoverview Select accessibility + keyboard navigation (P1-015). */

import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Select } from './select'

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Charlie' },
  { value: 'd', label: 'Delta' },
]

function TestSelect({ value = '', onChange = vi.fn() }: { value?: string; onChange?: (v: string) => void }) {
  return <Select value={value} onChange={onChange} options={OPTIONS} placeholder="Choose a letter" />
}

describe('Select — accessibility', () => {
  it('trigger exposes listbox ARIA', () => {
    render(<TestSelect />)
    const trigger = screen.getByRole('button')
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveAttribute('aria-label', 'Choose a letter')
  })

  it('listbox and options expose correct roles when open', async () => {
    render(<TestSelect />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(OPTIONS.length)
    expect(options[0]).toHaveAttribute('aria-selected', 'false')
  })

  it('marks the selected option with aria-selected', async () => {
    render(<TestSelect value="b" />)
    await userEvent.click(screen.getByRole('button'))
    const options = screen.getAllByRole('option')
    expect(options[1]).toHaveAttribute('aria-selected', 'true')
    expect(options[0]).toHaveAttribute('aria-selected', 'false')
  })

  it('closes when clicking outside', async () => {
    render(<TestSelect />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    fireEvent.mouseDown(document.body)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})

describe('Select — keyboard navigation', () => {
  it('opens on Enter and highlights the selected option', async () => {
    render(<TestSelect value="c" />)
    const trigger = screen.getByRole('button')
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    const highlighted = screen.getAllByRole('option').find((el) => el.getAttribute('data-highlighted') === 'true')
    expect(highlighted).toHaveTextContent('Charlie')
  })

  it('moves highlight with ArrowDown and ArrowUp', async () => {
    render(<TestSelect />)
    await userEvent.click(screen.getByRole('button'))
    const options = () => screen.getAllByRole('option')
    expect(options()[0]).toHaveAttribute('data-highlighted', 'true')
    await userEvent.keyboard('{ArrowDown}')
    expect(options()[1]).toHaveAttribute('data-highlighted', 'true')
    await userEvent.keyboard('{ArrowUp}')
    expect(options()[0]).toHaveAttribute('data-highlighted', 'true')
  })

  it('wraps highlight from first to last on ArrowUp', async () => {
    render(<TestSelect />)
    await userEvent.click(screen.getByRole('button'))
    const options = screen.getAllByRole('option')
    await userEvent.keyboard('{ArrowUp}')
    expect(options[options.length - 1]).toHaveAttribute('data-highlighted', 'true')
  })

  it('wraps highlight from last to first on ArrowDown', async () => {
    render(<TestSelect value="d" />)
    await userEvent.click(screen.getByRole('button'))
    const options = screen.getAllByRole('option')
    expect(options[options.length - 1]).toHaveAttribute('data-highlighted', 'true')
    await userEvent.keyboard('{ArrowDown}')
    expect(options[0]).toHaveAttribute('data-highlighted', 'true')
  })

  it('jumps to Home and End', async () => {
    render(<TestSelect value="c" />)
    await userEvent.click(screen.getByRole('button'))
    const options = screen.getAllByRole('option')
    await userEvent.keyboard('{End}')
    expect(options[options.length - 1]).toHaveAttribute('data-highlighted', 'true')
    await userEvent.keyboard('{Home}')
    expect(options[0]).toHaveAttribute('data-highlighted', 'true')
  })

  it('selects highlighted option on Enter and closes', async () => {
    const onChange = vi.fn()
    render(<TestSelect onChange={onChange} />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledWith('b')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes on Escape without selecting', async () => {
    const onChange = vi.fn()
    render(<TestSelect onChange={onChange} />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('typeahead jumps to matching option', async () => {
    render(<TestSelect />)
    await userEvent.click(screen.getByRole('button'))
    const options = screen.getAllByRole('option')
    await userEvent.keyboard('d')
    expect(options.find((el) => el.getAttribute('data-highlighted') === 'true')).toHaveTextContent('Delta')
    await userEvent.keyboard('a')
    expect(options.find((el) => el.getAttribute('data-highlighted') === 'true')).toHaveTextContent('Alpha')
  })
})
