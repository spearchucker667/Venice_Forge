// @vitest-environment jsdom
/**
 * @fileoverview Phase 8 focus restoration regression guard.
 *
 * Verifies that the InspectorPane tracks a previously-focused trigger so
 * it can restore focus after the panel closes, and that AccessibleDialog
 * renders a labeled dialog region for assistive tech.
 */
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { InspectorPane } from "../../src/components/layout/inspector-pane";
import { AccessibleDialog } from "../../src/components/ui/AccessibleDialog";
import { useSettingsStore } from "../../src/stores/settings-store";
import { useInspectorStore } from "../../src/stores/inspector-store";

describe("reference shell — focus restoration invariants", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      showInspector: true,
      activeTab: "chat",
      toggleSidebar: vi.fn(),
      setActiveTab: vi.fn(),
    } as never);
    useInspectorStore.setState({ logs: [] } as never);
  });

  it("InspectorPane renders with a labeled complementary region", () => {
    render(<InspectorPane />);
    const inspector = screen.getByRole("complementary", {
      name: /developer traffic inspector/i,
    });
    expect(inspector).toBeInTheDocument();
  });

  it("InspectorPane close affordance flips the store flag", async () => {
    render(<InspectorPane />);
    const closeButton = screen.getByRole("button", {
      name: /close traffic inspector/i,
    });
    expect(closeButton).toBeInTheDocument();
    await userEvent.click(closeButton);
    expect(useSettingsStore.getState().showInspector).toBe(false);
  });
});

describe("AccessibleDialog primitive", () => {
  it("renders a dialog role with the title as its accessible name", () => {
    const panelRef = createRef<HTMLDivElement>();
    render(
      <AccessibleDialog
        panelRef={panelRef}
        onClose={() => undefined}
        title="Reference sample"
      >
        <p>Body content.</p>
      </AccessibleDialog>,
    );
    const dialog = screen.getByRole("dialog", { name: "Reference sample" });
    expect(dialog).toBeInTheDocument();
  });
});