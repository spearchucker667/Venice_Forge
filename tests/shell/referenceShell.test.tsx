/**
 * @fileoverview Phase 2 Reference Shell Invariant Tests.
 *
 * Verifies that the global shell components (Header, Sidebar, InspectorPane,
 * DiagnosticsDrawer, TaskCenterDrawer) correctly apply the reference-driven
 * graphite cockpit styling tokens (--color-vf-shell-bg, --color-vf-panel-border,
 * --color-vf-panel-bg, etc.) while preserving all navigation, accessibility,
 * and resize contracts.
 */

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/services/desktopBridge", () => ({
  isElectron: () => false,
  desktopApiKey: { isConfigured: () => Promise.resolve(false) },
  desktopJinaApiKey: { isConfigured: () => Promise.resolve(false) },
  desktopProviderApiKey: { isConfigured: () => Promise.resolve(false) },
  desktopProviderSettings: { get: () => Promise.resolve({}) },
  desktopApp: { getDiagnostics: () => Promise.resolve({}) },
  desktopConfig: { writeSanitized: vi.fn() },
  desktopConversations: {
    list: () => Promise.resolve({ ok: false, records: [], error: "mock" }),
    save: () => Promise.resolve({ ok: false, id: "mock", error: "mock" }),
    delete: () => Promise.resolve({ ok: false, error: "mock" }),
    pullContext: () =>
      Promise.resolve({
        ok: false,
        context: { injectedText: "", facts: [], summaries: [], tokenEstimate: 0 },
        error: "mock",
      }),
  },
  desktopChat: {
    list: () =>
      Promise.resolve({
        ok: false,
        conversations: [],
        truncated: false,
        totalScanned: 0,
        error: "mock",
      }),
    save: () => Promise.resolve({ ok: false, id: "mock", error: "mock" }),
    delete: () => Promise.resolve({ ok: false, error: "mock" }),
  },
}));

vi.mock("../../src/stores/config-store", () => ({ reloadConfig: vi.fn() }));

vi.mock("../../src/hooks/use-models", () => ({
  useModels: () => ({
    data: [],
    isFetching: false,
    error: null,
    refetch: vi.fn(async () => ({ isSuccess: true, data: [], error: null })),
  }),
}));

import { Header } from "../../src/components/layout/header";
import { Sidebar } from "../../src/components/layout/sidebar";
import { InspectorPane } from "../../src/components/layout/inspector-pane";
import { DiagnosticsDrawer } from "../../src/components/status/DiagnosticsDrawer";
import { TaskCenterDrawer } from "../../src/components/status/TaskCenterDrawer";
import { useSettingsStore, SIDEBAR_DEFAULT_WIDTH } from "../../src/stores/settings-store";
import { useChatStore } from "../../src/stores/chat-store";
import { useStatusStore } from "../../src/stores/status-store";
import { useTaskUIStore } from "../../src/stores/task-ui-store";
import { useAuthStore } from "../../src/stores/auth-store";
import { useProjectStore } from "../../src/stores/project-store";

describe("Reference Shell UI Invariants", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      sidebarOpen: true,
      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      activeTab: "chat",
      redTeamMode: false,
      showInspector: true,
      localFamilySafeModeEnabled: true,
      activeProjectId: null,
      selectedModels: {},
    });
    useChatStore.setState({
      conversations: [],
      conversationSummaries: [],
      activeConversationId: null,
      _hasLoadedHistory: true,
    });
    useAuthStore.setState({
      apiKey: "test-key",
      hasEncrypted: true,
      isConfigured: true,
    } as never);
    useProjectStore.setState({ projects: [], loaded: true, loading: false, lastError: null });
    useStatusStore.setState({ drawerOpen: false, focusedSectionId: null });
    useTaskUIStore.setState({ taskCenterOpen: false });
  });

  it("Header uses reference graphite background and 1px border tokens", () => {
    render(<Header onOpenApiKey={vi.fn()} />);
    const header = screen.getByRole("banner");
    expect(header).toBeInTheDocument();
    expect(header.className).toContain("bg-vf-shell-bg");
    expect(header.className).toContain("border-b");
    expect(header.className).toContain("border-vf-panel-border");

    // Action buttons use reference border and panel background
    const taskCenterBtn = screen.getByRole("button", { name: "Toggle task center" });
    expect(taskCenterBtn.className).toContain("border-vf-panel-border");
    expect(taskCenterBtn.className).toContain("bg-vf-panel-bg");
  });

  it("Sidebar uses graphite background, 1px right border, and rounded-md items", () => {
    const { container } = render(<Sidebar />);
    const aside = container.querySelector("aside");
    expect(aside).toBeInTheDocument();
    expect(aside?.className).toContain("bg-vf-shell-bg");
    expect(aside?.className).toContain("border-r");
    expect(aside?.className).toContain("border-vf-panel-border");
    expect(aside?.className).toContain("mesh-sidebar");

    // Active item has inset accent highlight
    const chatTab = screen.getByRole("button", { name: "Chat" });
    expect(chatTab.className).toContain("rounded-md");
    expect(chatTab.className).toContain("shadow-[inset_2px_0_0_var(--color-accent)]");

    // Resize handle exists with accessible semantics
    const resizer = screen.getByRole("separator");
    expect(resizer).toHaveAttribute("aria-orientation", "vertical");
  });

  it("InspectorPane applies graphite panel background and left border", () => {
    render(<InspectorPane />);
    const inspector = screen.getByRole("complementary", { name: "Developer traffic inspector" });
    expect(inspector).toBeInTheDocument();
    expect(inspector.className).toContain("bg-vf-shell-bg");
    expect(inspector.className).toContain("border-l");
    expect(inspector.className).toContain("border-vf-panel-border");
  });

  it("DiagnosticsDrawer renders with graphite cockpit tokens and utility rail sections", () => {
    useStatusStore.setState({ drawerOpen: true });
    useStatusStore.getState().recompute();
    render(<DiagnosticsDrawer />);

    const panel = screen.getByTestId("diagnostics-drawer-panel");
    expect(panel).toBeInTheDocument();
    expect(panel.className).toContain("bg-vf-shell-bg");
    expect(panel.className).toContain("border-l");
    expect(panel.className).toContain("border-vf-panel-border");

    const overviewSection = screen.getByTestId("diagnostics-section-diagnostics-overview");
    expect(overviewSection.className).toContain("vf-utility-rail-section");
    expect(overviewSection.className).toContain("border-vf-panel-border");
  });

  it("TaskCenterDrawer renders with graphite cockpit tokens and backdrop scrim", () => {
    useTaskUIStore.setState({ taskCenterOpen: true });
    render(<TaskCenterDrawer />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog.className).toContain("bg-vf-shell-bg");
    expect(dialog.className).toContain("border-l");
    expect(dialog.className).toContain("border-vf-panel-border");
  });
});
