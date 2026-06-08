/** @fileoverview VERIFY-043 — RecipeCompatibilityCard renders the right
 *  status, issues, and action callbacks. */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecipeCompatibilityCard } from "./recipe-compatibility-card";
import type { GenerationRecipe } from "../../types/project";

const baseRecipe: GenerationRecipe = {
  prompt: "A copper city at dusk",
  model: "flux-dev",
  width: 1024,
  height: 1024,
  seed: 0,
  negativePrompt: "fog",
  steps: 25,
  cfgScale: 7,
  style: "photo",
  variants: 2,
};

describe("RecipeCompatibilityCard", () => {
  it("renders 'Compatible' when the recipe fits the target model", () => {
    render(
      <RecipeCompatibilityCard recipe={baseRecipe} currentModel="flux-dev" />,
    );
    const status = screen.getByTestId("recipe-compatibility-status");
    expect(status.dataset.status).toBe("compatible");
  });

  it("renders 'Will be adjusted' when nano-banana-v1 is the target but the recipe has pixel dimensions", () => {
    render(
      <RecipeCompatibilityCard recipe={baseRecipe} currentModel="nano-banana-v1" />,
    );
    const status = screen.getByTestId("recipe-compatibility-status");
    expect(status.dataset.status).toBe("partial");
    expect(screen.getByTestId("recipe-compatibility-issues")).toBeInTheDocument();
  });

  it("invokes onUseWithCurrentModel with the sanitized recipe", () => {
    const handler = vi.fn();
    render(
      <RecipeCompatibilityCard
        recipe={baseRecipe}
        currentModel="nano-banana-v1"
        onUseWithCurrentModel={handler}
      />,
    );
    fireEvent.click(screen.getByTestId("recipe-use-with-current-model"));
    expect(handler).toHaveBeenCalledTimes(1);
    const sanitized = handler.mock.calls[0][0] as GenerationRecipe;
    expect(sanitized).not.toHaveProperty("width");
    expect(sanitized).not.toHaveProperty("height");
    expect(sanitized).toHaveProperty("aspectRatio");
  });

  it("invokes onUseOriginal with the original recipe (no sanitization)", () => {
    const handler = vi.fn();
    render(
      <RecipeCompatibilityCard
        recipe={baseRecipe}
        currentModel="nano-banana-v1"
        onUseOriginal={handler}
      />,
    );
    fireEvent.click(screen.getByTestId("recipe-use-original"));
    const original = handler.mock.calls[0][0] as GenerationRecipe;
    expect(original.width).toBe(1024);
    expect(original.height).toBe(1024);
  });

  it("toggles the comparison panel", () => {
    const toggle = vi.fn();
    render(
      <RecipeCompatibilityCard
        recipe={baseRecipe}
        currentModel="nano-banana-v1"
        showComparison={false}
        onToggleComparison={toggle}
      />,
    );
    fireEvent.click(screen.getByTestId("recipe-toggle-comparison"));
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("renders the comparison panel when showComparison is true", () => {
    render(
      <RecipeCompatibilityCard
        recipe={baseRecipe}
        currentModel="nano-banana-v1"
        showComparison={true}
        onToggleComparison={() => {}}
      />,
    );
    expect(screen.getByTestId("recipe-comparison")).toBeInTheDocument();
  });

  it("renders the empty state when no recipe is supplied", () => {
    render(<RecipeCompatibilityCard recipe={null} currentModel="flux-dev" />);
    expect(screen.getByTestId("recipe-compatibility-empty")).toBeInTheDocument();
  });
});
