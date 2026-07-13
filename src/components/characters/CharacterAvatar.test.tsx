import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useCharacterImage } from '../../hooks/useCharacterImage'
import { CharacterAvatar } from './CharacterAvatar'

vi.mock('../../hooks/useCharacterImage', () => ({ useCharacterImage: vi.fn() }))

describe('CharacterAvatar', () => {
  it('uses the shared cache resolver with a stable identity key', () => {
    vi.mocked(useCharacterImage).mockReturnValue({ imageUrl: 'venice-character-cache://abc', loading: false, error: undefined, retry: vi.fn(), fallbackInitials: 'VF', showInitials: false })
    render(<CharacterAvatar character={{ name: 'Venice Forge', slug: 'vf' }} cacheKey="conversation-1" />)
    expect(useCharacterImage).toHaveBeenCalledWith(expect.objectContaining({ slug: 'vf' }), { cacheKey: 'conversation-1' })
    expect(screen.getByRole('img')).toHaveAttribute('src', 'venice-character-cache://abc')
  })

  it('falls back to initials after an image error', () => {
    vi.mocked(useCharacterImage).mockReturnValue({ imageUrl: 'https://example.com/broken.png', loading: false, error: undefined, retry: vi.fn(), fallbackInitials: 'LC', showInitials: false })
    render(<CharacterAvatar character={{ name: 'Local Character', localCharacterId: 'local-1' }} cacheKey="local-1" />)
    fireEvent.error(screen.getByRole('img'))
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('LC')).toBeInTheDocument()
  })
})
