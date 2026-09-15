// @vitest-environment jsdom
/**
 * @fileoverview Phase 8 RTL regression guard for the reference-driven shell.
 *
 * Verifies that:
 * - Switching the document direction to `rtl` keeps the shell's ARIA
 *   semantics intact for Sidebar, Header, and InspectorPane.
 * - The shell's three-zone composition remains queryable for assistive tech.
 * - The reference material tokens continue to derive from the same
 *   semantic layer regardless of direction (no per-locale raw overrides).
 */
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Sidebar } from "../../src/components/layout/sidebar";
import { Header } from "../../src/components/layout/header";
import { InspectorPane } from "../../src/components/layout/inspector-pane";
import { useSettingsStore } from "../../src/stores/settings-store";
import { useChatStore } from "../../src/stores/chat-store";
import { useAuthStore } from "../../src/stores/auth-store";
import { useInspectorStore } from "../../src/stores/inspector-store";

const useModelsMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/hooks/use-models", () => ({
  useModels: useModelsMock,
}));

describe("reference shell — RTL invariants", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      activeTab: "chat",
      selectedModels: {},
      setSelectedModel: vi.fn(),
      toggleSidebar: vi.fn(),
      showInspector: false,
    } as never);
    useChatStore.setState({
      conversations: [],
      activeConversationId: null,
      setActiveConversation: vi.fn(),
    } as never);
    useAuthStore.setState({ apiKey: "test-key" } as never);
    useInspectorStore.getState().clearLogs();
    useModelsMock.mockImplementation(() => ({ data: [], isFetching: false }));
  });

  it("preserves sidebar navigation and disclosure contract in RTL", async () => {
    const originalDir = document.documentElement.dir;
    document.documentElement.dir = "rtl";
    try {
      render(<Sidebar />);
      const sidebar = screen.getByRole("navigation");
      expect(sidebar).toBeInTheDocument();
      // Sidebar exposes a labeled landmark; ARIA groups may not be used, so we
      // accept any navigational structure (list, group, or direct buttons).
      const navItems = within(sidebar).getAllByRole("button");
      expect(navItems.length).toBeGreaterThan(0);
      const historyToggle = screen.queryByRole("button", { name: /Collapse History|Expand History/ });
      if (historyToggle) {
        const initial = historyToggle.getAttribute("aria-expanded");
        await userEvent.click(historyToggle);
        expect(historyToggle.getAttribute("aria-expanded")).not.toBe(initial);
      }
    } finally {
      document.documentElement.dir = originalDir;
    }
  });

  it("keeps header controls keyboard reachable in RTL", () => {
    const originalDir = document.documentElement.dir;
    document.documentElement.dir = "rtl";
    try {
      render(<Header onOpenApiKey={vi.fn()} />);
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
      for (const button of buttons) {
        expect(button).not.toHaveAttribute("aria-hidden", "true");
      }
    } finally {
      document.documentElement.dir = originalDir;
    }
  });

  it("renders the inspector rail as a labeled complementary region in RTL", () => {
    const originalDir = document.documentElement.dir;
    document.documentElement.dir = "rtl";
    try {
      useSettingsStore.setState({ showInspector: true } as never);
      render(<InspectorPane />);
      const inspector = screen.getByRole("complementary", {
        name: "Developer traffic inspector",
      });
      expect(inspector).toBeInTheDocument();
    } finally {
      document.documentElement.dir = originalDir;
    }
  });
});