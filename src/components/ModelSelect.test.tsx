// @vitest-environment jsdom
/** @fileoverview Unit tests for deprecation surfacing in the model picker. */
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModelSelect } from "./ModelSelect";
import type { ModelInfo } from "../types/venice";

const MODELS: ModelInfo[] = [
  { id: "active-model", name: "Active Model" },
  {
    id: "retiring-model",
    name: "Retiring Model",
    model_spec: {
      deprecation: {
        autoRemap: false,
        date: "2026-10-01T00:00:00.000Z",
        removesAt: "2026-10-15T00:00:00.000Z",
        replacementModelId: "active-model",
      },
    },
  } as ModelInfo,
];

describe("ModelSelect deprecation surfacing", () => {
  it("shows no warning when the selected model is not deprecated", () => {
    const onChange = vi.fn();
    render(
      <ModelSelect
        value="active-model"
        models={MODELS}
        onChange={onChange}
      />,
    );
    expect(
      screen.queryByTestId("model-select-deprecation-warning"),
    ).not.toBeInTheDocument();
  });

  it("shows a retirement warning with sunset date and replacement for a deprecated selection", () => {
    const onChange = vi.fn();
    render(
      <ModelSelect
        value="retiring-model"
        models={MODELS}
        onChange={onChange}
      />,
    );
    const warning = screen.getByTestId("model-select-deprecation-warning");
    expect(warning).toHaveTextContent("scheduled for retirement");
    expect(warning).toHaveTextContent("Suggested replacement: active-model.");
  });

  it("never swaps the selection — the deprecated model stays selected", () => {
    const onChange = vi.fn();
    render(
      <ModelSelect
        value="retiring-model"
        models={MODELS}
        onChange={onChange}
      />,
    );
    // The trigger still displays the deprecated model; no onChange fired.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId("model-select-deprecation-warning")).toBeInTheDocument();
  });

  it("annotates deprecated models with a badge in the option list", () => {
    const onChange = vi.fn();
    render(
      <ModelSelect
        value="active-model"
        models={MODELS}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("button"));
    const badges = screen.getAllByText("Deprecated");
    expect(badges.length).toBeGreaterThan(0);
  });

  it("keeps current behavior when the selected model is absent from the catalog", () => {
    const onChange = vi.fn();
    render(
      <ModelSelect
        value="removed-model"
        models={MODELS}
        onChange={onChange}
      />,
    );
    // Removed-from-catalog models have no metadata: no warning layer, and
    // the selection is left exactly as-is.
    expect(
      screen.queryByTestId("model-select-deprecation-warning"),
    ).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
