// VERIFY-053 regression guard: Characters view renders cached local avatar
// URLs or initials fallback, and never uses inline JSX style attributes.

/** @fileoverview Tests for the Characters view avatar rendering. */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar } from "./CharactersView";
import { useCharacterImage } from "../hooks/useCharacterImage";
import type { VeniceCharacter } from "../types/characters";

vi.mock("../hooks/useCharacterImage");

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
