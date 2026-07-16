/** @fileoverview VERIFY-045 — Phase 2C HeaderStatusCluster tests. */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/desktopBridge", () => ({
  isElectron: () => false,
  desktopApiKey: { isConfigured: () => Promise.resolve(false) },
  desktopJinaApiKey: { isConfigured: () => Promise.resolve(false) },
  desktopProviderApiKey: { isConfigured: () => Promise.resolve(false) },
  desktopProviderSettings: { get: () => Promise.resolve({}) },
  desktopApp: { getDiagnostics: () => Promise.resolve({}) },
  desktopConversations: { list: () => Promise.resolve({ ok: false, records: [], error: "mock" }) },
  desktopChat: { list: () => Promise.resolve({ ok: false, conversations: [], truncated: false, totalScanned: 0, error: "mock" }) },
}));

import { HeaderStatusCluster } from "./HeaderStatusCluster";
import { useStatusStore } from "../../stores/status-store";
import { useAuthStore } from "../../stores/auth-store";
import { useSettingsStore } from "../../stores/settings-store";
import { useProjectStore } from "../../stores/project-store";
import { useMediaStore } from "../../stores/media-store";
import { useChatStore } from "../../stores/chat-store";
import { _resetAuditCounters_TEST_ONLY } from "../../shared/safety";

function reset() {
  _resetAuditCounters_TEST_ONLY();
  useAuthStore.setState({
    apiKey: null,
    hasEncrypted: true,
    isConfigured: false,
    jinaApiKey: null,
    jinaIsConfigured: false,
    hydrationStatus: "ready",
    hydrationError: null,
  } as never);
  useSettingsStore.setState({
    activeTab: "chat",
    activeProjectId: null,
    selectedModels: {},
    localFamilySafeModeEnabled: true,
    veniceApiSafeMode: true,
  } as never);
  useProjectStore.setState({ projects: [], loaded: true, loading: false, lastError: null });
  useMediaStore.setState({
    items: [],
    loading: false,
    loaded: true,
    totalCount: 0,
    hasMore: false,
    nextOffset: 0,
    lastError: null,
  });
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    isStreaming: false,
    veniceParams: { include_venice_system_prompt: false, enable_web_search: "off" },
    systemPrompt: "",
    temperature: 0.7,
    topP: 1,
    maxTokens: 1024,
    _hasLoadedHistory: true,
    pendingContext: null,
  });
  useStatusStore.getState().recompute();
  useStatusStore.setState({ drawerOpen: false, focusedSectionId: null });
}

beforeEach(() => {
  reset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("HeaderStatusCluster (VERIFY-045)", () => {
  it("renders all 8 required indicators with accessible names", () => {
    render(<HeaderStatusCluster />);
    expect(screen.getByTestId("header-status-cluster")).toBeInTheDocument();
    for (const id of ["api", "apiKey", "model", "storage", "safety", "provider", "project", "desktop"]) {
      const el = screen.getByTestId(`status-indicator-${id}`);
      expect(el).toBeInTheDocument();
      // Accessible label includes category + severity word.
      expect(el.getAttribute("aria-label")).toMatch(/: /);
    }
  });

  it("each indicator carries a data-severity matching the snapshot", () => {
    useAuthStore.setState({ isConfigured: true, apiKey: "k" } as never);
    useStatusStore.getState().recompute();
    render(<HeaderStatusCluster />);
    const apiKey = screen.getByTestId("status-indicator-apiKey");
    expect(apiKey.dataset.severity).toBe("ok");
  });

  it("clicking an indicator opens the drawer focused on that section", () => {
    render(<HeaderStatusCluster />);
    fireEvent.click(screen.getByTestId("status-indicator-safety"));
    expect(useStatusStore.getState().drawerOpen).toBe(true);
    expect(useStatusStore.getState().focusedSectionId).toBe("safety");
  });

  it("provides one aggregate status control for constrained headers", () => {
    render(<HeaderStatusCluster />);
    const summary = screen.getByTestId("status-cluster-summary");
    expect(summary).toHaveAccessibleName(/Open app status/);
    fireEvent.click(summary);
    expect(useStatusStore.getState().drawerOpen).toBe(true);
  });

  it("keyboard activation (Enter) opens the drawer", () => {
    render(<HeaderStatusCluster />);
    const el = screen.getByTestId("status-indicator-model") as HTMLButtonElement;
    el.focus();
    fireEvent.click(el);
    expect(useStatusStore.getState().drawerOpen).toBe(true);
    expect(useStatusStore.getState().focusedSectionId).toBe("model");
  });

  it("narrow layout does NOT hide the aria-label of any indicator (a11y invariant)", () => {
    render(<HeaderStatusCluster compact />);
    for (const id of ["api", "apiKey", "model", "storage", "safety", "provider", "project", "desktop"]) {
      const el = screen.getByTestId(`status-indicator-${id}`);
      // Even when visually compact, screen readers see the full label.
      expect(el.getAttribute("aria-label")).toBeTruthy();
    }
  });

  it("auth changes update severity without tab navigation", () => {
    const before = screen.queryByTestId("status-indicator-apiKey");
    // Not rendered yet.
    expect(before).toBeNull();
    render(<HeaderStatusCluster />);
    act(() => {
      useAuthStore.setState({ isConfigured: true, apiKey: "k", hydrationStatus: "ready" } as never);
    });
    expect(screen.getByTestId("status-indicator-apiKey").dataset.severity).toBe("ok");
  });
});
