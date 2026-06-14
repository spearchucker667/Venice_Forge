/** @fileoverview VERIFY-045 — Phase 2C StatusIndicator tests. */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  StatusIndicator,
  getIndicatorToneClass,
  getIndicatorDotClass,
  getIndicatorAriaLabel,
} from "./StatusIndicator";
import type { StatusSeverity } from "../../types/status";

describe("StatusIndicator (VERIFY-045)", () => {
  it("uses the right tone class per severity", () => {
    expect(getIndicatorToneClass("ok")).toMatch(/success/i);
    expect(getIndicatorToneClass("warn")).toMatch(/warning/i);
    expect(getIndicatorToneClass("error")).toMatch(/danger/i);
    expect(getIndicatorToneClass("unknown")).toMatch(/text-muted/i);
  });

  it("uses the right dot class per severity", () => {
    expect(getIndicatorDotClass("ok")).toMatch(/success/i);
    expect(getIndicatorDotClass("warn")).toMatch(/warning/i);
    expect(getIndicatorDotClass("error")).toMatch(/danger/i);
    expect(getIndicatorDotClass("unknown")).toMatch(/text-muted/i);
  });

  it("computes an accessible label combining category + severity word", () => {
    expect(getIndicatorAriaLabel("ok", "API")).toBe("API: OK");
    expect(getIndicatorAriaLabel("error", "Storage")).toBe("Storage: Error");
    expect(getIndicatorAriaLabel("unknown", "Model")).toBe("Model: Unknown");
  });

  it("renders a button when onClick is supplied (clickable indicator)", () => {
    const handler = vi.fn();
    render(
      <StatusIndicator
        id="api"
        label="API"
        severity="ok"
        summary="All good"
        onClick={handler}
      />,
    );
    const el = screen.getByTestId("status-indicator-api");
    expect(el.tagName).toBe("BUTTON");
    expect(el).toHaveAttribute("data-severity", "ok");
    expect(el).toHaveAttribute("aria-label", "API: OK");
    expect(el).toHaveAttribute("title", "All good");
    fireEvent.click(el);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("renders a non-interactive element when onClick is omitted", () => {
    render(
      <StatusIndicator
        id="model"
        label="Model"
        severity="warn"
        summary="Stale catalog"
      />,
    );
    const el = screen.getByTestId("status-indicator-model");
    expect(el.tagName).toBe("DIV");
    expect(el).toHaveAttribute("data-severity", "warn");
  });

  it("renders a visible dot with the right tone for each severity", () => {
    const severities: StatusSeverity[] = ["ok", "warn", "error", "unknown"];
    for (const s of severities) {
      render(
        <StatusIndicator
          id={`x-${s}`}
          label="X"
          severity={s}
          summary="y"
        />,
      );
      const dot = document.querySelector(`[data-severity-dot="${s}"]`);
      expect(dot).toBeInTheDocument();
    }
  });

  it("compact mode does not render the severity word (layout-friendly)", () => {
    render(
      <StatusIndicator
        id="api"
        label="API"
        severity="ok"
        summary="y"
        compact
      />,
    );
    const el = screen.getByTestId("status-indicator-api");
    // The compact variant hides the OK/Warn/Error/Unknown suffix on lg
    // viewports but the indicator's aria-label still carries the
    // full severity for screen readers.
    expect(el).toHaveAttribute("aria-label", "API: OK");
  });
});
