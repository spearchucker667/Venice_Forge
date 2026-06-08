/** @fileoverview VERIFY-043 — RecipeComparison side-by-side diff renders the
 *  expected rows and highlights changed fields. */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  buildRecipeComparison,
  RecipeComparison,
} from "./recipe-comparison";
import type { GenerationRecipe } from "../../types/project";

describe("buildRecipeComparison", () => {
  it("marks only the fields that differ as changed", () => {
    const original: GenerationRecipe = {
      prompt: "A copper city at dusk",
      model: "flux-dev",
      width: 1024,
      height: 1024,
      seed: 0,
    };
    const sanitized: GenerationRecipe = {
      prompt: "A copper city at dusk",
      model: "flux-dev",
      width: 768,
      height: 768,
      seed: 0,
    };
    const rows = buildRecipeComparison(original, sanitized);
    const changedFields = rows.filter((r) => r.changed).map((r) => r.field);
    expect(changedFields).toEqual(expect.arrayContaining(["width", "height"]));
    expect(changedFields).not.toContain("prompt");
    expect(changedFields).not.toContain("model");
    expect(changedFields).not.toContain("seed");
  });
});

describe("RecipeComparison", () => {
  it("renders the table with rows for every recipe field", () => {
    const original: GenerationRecipe = { prompt: "x", model: "flux-dev" };
    const sanitized: GenerationRecipe = { prompt: "x", model: "flux-dev" };
    render(<RecipeComparison original={original} sanitized={sanitized} />);
    expect(screen.getByTestId("recipe-comparison")).toBeInTheDocument();
    expect(screen.getByTestId("recipe-comparison-row-prompt")).toBeInTheDocument();
    expect(screen.getByTestId("recipe-comparison-row-model")).toBeInTheDocument();
    expect(screen.getByTestId("recipe-comparison-row-width")).toBeInTheDocument();
  });

  it("shows 'Identical' when the recipes match", () => {
    const recipe: GenerationRecipe = { prompt: "x", model: "flux-dev" };
    render(<RecipeComparison original={recipe} sanitized={recipe} />);
    expect(screen.getByText("Identical")).toBeInTheDocument();
  });

  it("shows a changed-field count when the recipes differ", () => {
    const original: GenerationRecipe = { prompt: "x", model: "flux-dev", width: 1024, height: 1024 };
    const sanitized: GenerationRecipe = { prompt: "x", model: "flux-dev", width: 768, height: 768 };
    render(<RecipeComparison original={original} sanitized={sanitized} />);
    expect(screen.getByText(/2 fields will change/)).toBeInTheDocument();
  });
});
