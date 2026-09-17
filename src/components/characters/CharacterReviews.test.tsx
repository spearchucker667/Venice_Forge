/** @fileoverview Component tests for the hosted character reviews section
 *  (GET /characters/{slug}/reviews — read-only preview API). */

import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { CharacterReviews } from './CharacterReviews'
import { getCharacterReviews } from '../../services/characterService'
import type { CharacterReviewsResult } from '../../types/characters'

vi.mock('../../services/characterService', () => ({
  getCharacterReviews: vi.fn(),
  CHARACTER_REVIEWS_PAGE_SIZE_DEFAULT: 20,
}))

const mockedGetReviews = vi.mocked(getCharacterReviews)

function makeReview(overrides: Record<string, unknown> = {}) {
  return {
    characterId: 'char-1',
    createdAt: '2025-02-09T03:23:53.708Z',
    id: 'rev-1',
    isOwner: false,
    locale: 'en',
    message: 'Thoughtful and grounded.',
    rating: 5,
    userAvatarUrl: null,
    username: 'product_user_42',
    ...overrides,
  }
}

function makeResult(overrides: {
  data?: unknown[]
  pagination?: Partial<CharacterReviewsResult['pagination']>
  summary?: Partial<CharacterReviewsResult['summary']>
} = {}): CharacterReviewsResult {
  const data = (overrides.data ?? [makeReview()]) as CharacterReviewsResult['data']
  return {
    data,
    pagination: { page: 1, pageSize: 20, total: data.length, totalPages: 1, ...overrides.pagination },
    summary: { averageRating: 5, totalReviews: data.length, ...overrides.summary },
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('CharacterReviews', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('requests reviews for the given slug', async () => {
    mockedGetReviews.mockResolvedValueOnce(makeResult())
    render(<CharacterReviews slug="alan-watts" />, { wrapper })
    await waitFor(() =>
      expect(mockedGetReviews).toHaveBeenCalledWith(
        'alan-watts',
        expect.objectContaining({ page: 1 }),
      ),
    )
  })

  it('shows a loading state while the first page loads', () => {
    mockedGetReviews.mockReturnValueOnce(new Promise(() => {}))
    render(<CharacterReviews slug="alan-watts" />, { wrapper })
    expect(screen.getByText('Loading reviews…')).toBeInTheDocument()
  })

  it('renders the summary and the review list', async () => {
    mockedGetReviews.mockResolvedValueOnce(makeResult())
    render(<CharacterReviews slug="alan-watts" />, { wrapper })
    await waitFor(() =>
      expect(screen.getByText('product_user_42')).toBeInTheDocument(),
    )
    expect(screen.getByText('Thoughtful and grounded.')).toBeInTheDocument()
    expect(screen.getByLabelText('5 out of 5 stars')).toBeInTheDocument()
    expect(screen.getByText(/ratings/i)).toBeInTheDocument()
  })

  it('renders reviews without a message', async () => {
    mockedGetReviews.mockResolvedValueOnce(
      makeResult({ data: [makeReview({ id: 'rev-2', message: null, rating: 4 })] }),
    )
    render(<CharacterReviews slug="alan-watts" />, { wrapper })
    await waitFor(() => expect(screen.getByText('product_user_42')).toBeInTheDocument())
    expect(screen.getByLabelText('4 out of 5 stars')).toBeInTheDocument()
  })

  it('shows an empty state when the character has no reviews', async () => {
    mockedGetReviews.mockResolvedValueOnce(makeResult({ data: [] }))
    render(<CharacterReviews slug="alan-watts" />, { wrapper })
    await waitFor(() =>
      expect(screen.getByText('No reviews yet.')).toBeInTheDocument(),
    )
  })

  it('shows an error state when the request fails', async () => {
    mockedGetReviews.mockRejectedValueOnce(new Error('boom'))
    render(<CharacterReviews slug="alan-watts" />, { wrapper })
    await waitFor(() =>
      expect(screen.getByText(/failed to load reviews/i)).toBeInTheDocument(),
    )
  })

  it('loads and appends the next page on demand', async () => {
    mockedGetReviews.mockImplementation((_slug, options) => {
      const page = options?.page ?? 1
      return Promise.resolve(
        page === 1
          ? makeResult({
              data: [makeReview({ id: 'rev-1', username: 'first_user' })],
              pagination: { page: 1, pageSize: 20, total: 2, totalPages: 2 },
              summary: { averageRating: 4.5, totalReviews: 2 },
            })
          : makeResult({
              data: [makeReview({ id: 'rev-2', username: 'second_user', rating: 4 })],
              pagination: { page: 2, pageSize: 20, total: 2, totalPages: 2 },
              summary: { averageRating: 4.5, totalReviews: 2 },
            }),
      )
    })
    render(<CharacterReviews slug="alan-watts" />, { wrapper })
    await waitFor(() => expect(screen.getByText('first_user')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Load more reviews' }))
    await waitFor(() => expect(screen.getByText('second_user')).toBeInTheDocument())
    expect(screen.getByText('first_user')).toBeInTheDocument()
  })

  it('does not offer a load-more control on the last page', async () => {
    mockedGetReviews.mockResolvedValueOnce(makeResult())
    render(<CharacterReviews slug="alan-watts" />, { wrapper })
    await waitFor(() =>
      expect(screen.getByText('product_user_42')).toBeInTheDocument(),
    )
    expect(
      screen.queryByRole('button', { name: 'Load more reviews' }),
    ).not.toBeInTheDocument()
  })
})
