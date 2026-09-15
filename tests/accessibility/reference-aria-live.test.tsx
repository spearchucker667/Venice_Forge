// @vitest-environment jsdom
/**
 * @fileoverview Phase 8 ARIA-live-region regression guard.
 *
 * Verifies that the Toaster surface exposes an aria-live region (the
 * canonical "polite" announcement channel) so assistive tech announces
 * transient notifications from the redesigned cockpit.
 */
import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import { ToastViewport } from "../../src/components/notifications/ToastViewport";

describe("reference shell — aria-live region invariants", () => {
  it("ToastViewport renders a polite live region for assistive tech", () => {
    render(<ToastViewport>{null}</ToastViewport>);
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
  });

  it("ToastViewport preserves the polite role regardless of children", () => {
    render(<ToastViewport>{null}</ToastViewport>);
    const polite = document.querySelector('[aria-live="polite"]');
    expect(polite?.getAttribute("aria-live")).toBe("polite");
  });
});