// VERIFY-053 regression guard: Characters view renders cached local avatar
// URLs or initials fallback, and never uses inline JSX style attributes.

/** @fileoverview Tests for the Characters view avatar rendering. */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Avatar, CharactersView } from "./CharactersView";
import { useCharacterImage } from "../hooks/useCharacterImage";
import type { VeniceCharacter } from "../types/characters";
import { useCharacterStore } from '../stores/character-store'
import { useCharacterCardStore } from '../stores/character-card-store'
import { useSettingsStore } from '../stores/settings-store'
import { useChatStore } from '../stores/chat-store'

vi.mock("../hooks/useCharacterImage");
vi.mock("../services/characterService", () => ({
  listCharacters: vi.fn().mockResolvedValue([]),
  getCharacter: vi.fn(),
}));

const mockedUseCharacterImage = vi.mocked(useCharacterImage);

const CHARACTER: VeniceCharacter = {
  id: "char-1",
  slug: "alan-watts",
  name: "Alan Watts",
  photoUrl: "https://outerface.venice.ai/api/characters/char-1/photo",
};

describe("Avatar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the cached image URL from the hook", () => {
    mockedUseCharacterImage.mockReturnValue({
      imageUrl: "file:///tmp/cache/char-1.bin",
      loading: false,
      error: undefined,
      retry: vi.fn(),
      fallbackInitials: "AW",
      showInitials: false,
    });

    render(<Avatar character={CHARACTER} />);
    const img = screen.getByAltText("Alan Watts avatar") as HTMLImageElement;
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("src", "file:///tmp/cache/char-1.bin");
  });

  it("falls back to initials when no image URL is available", () => {
    mockedUseCharacterImage.mockReturnValue({
      imageUrl: undefined,
      loading: false,
      error: "Failed to load",
      retry: vi.fn(),
      fallbackInitials: "AW",
      showInitials: true,
    });

    const { container } = render(<Avatar character={CHARACTER} />);
    expect(screen.getByText("AW")).toBeInTheDocument();
    expect(container.querySelector("img")).not.toBeInTheDocument();
  });

  it("does not use inline style attributes (VERIFY-007)", () => {
    mockedUseCharacterImage.mockReturnValue({
      imageUrl: undefined,
      loading: false,
      error: undefined,
      retry: vi.fn(),
      fallbackInitials: "AW",
      showInitials: true,
    });

    const { container } = render(<Avatar character={CHARACTER} />);
    expect(container.querySelector("[style]")).toBeNull();
  });
});

describe('CharactersView hosted hub adapters', () => {
  it('favorites, shows details, refreshes, and duplicates a hosted character locally', async () => {
    mockedUseCharacterImage.mockReturnValue({ imageUrl: undefined, loading: false, error: undefined, retry: vi.fn(), fallbackInitials: 'AW', showInitials: true })
    const refresh = vi.fn().mockResolvedValue(CHARACTER)
    const upsert = vi.fn().mockImplementation(async (card) => card)
    useCharacterStore.setState({
      results: [CHARACTER],
      isLoading: false,
      error: null,
      hasMore: false,
      searchCharacters: vi.fn().mockResolvedValue(undefined),
      fetchBySlug: refresh,
    })
    useCharacterCardStore.setState({ cards: [], load: vi.fn().mockResolvedValue(undefined), upsert })
    useSettingsStore.setState({ favoriteHostedCharacterSlugs: [] })
    useChatStore.setState({ conversations: [], createCharacterConversation: vi.fn() })

    render(<CharactersView />)

    fireEvent.click(screen.getByRole('button', { name: 'Favorite' }))
    expect(useSettingsStore.getState().favoriteHostedCharacterSlugs).toEqual(['alan-watts'])

    fireEvent.click(screen.getByRole('button', { name: 'favorites' }))
    expect(screen.getByTestId('character-card')).toHaveAttribute('data-character-slug', 'alan-watts')

    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByRole('dialog', { name: 'Alan Watts' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close character details' }))

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(refresh).toHaveBeenCalledWith('alan-watts'))

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate locally' }))
    await waitFor(() => expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Alan Watts Copy',
      metadata: { sourceHostedSlug: 'alan-watts' },
    })))
  })
})
