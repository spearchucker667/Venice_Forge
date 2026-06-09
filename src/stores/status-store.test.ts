/** @fileoverview VERIFY-045 — Phase 2C status store tests. */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/desktopBridge", () => ({
  isElectron: () => false,
  desktopApiKey: { isConfigured: () => Promise.resolve(false) },
  desktopJinaApiKey: { isConfigured: () => Promise.resolve(false) },
  desktopApp: { getDiagnostics: () => Promise.resolve({}) },
  desktopConversations: { list: () => Promise.resolve({ ok: false, records: [], error: "mock" }) },
  desktopChat: { list: () => Promise.resolve({ ok: false, conversations: [], truncated: false, totalScanned: 0, error: "mock" }) },
}));

import { useStatusStore } from "./status-store";
import { useAuthStore } from "./auth-store";
import { useSettingsStore } from "./settings-store";
import { useProjectStore } from "./project-store";
import { useMediaStore } from "./media-store";
import { useChatStore } from "./chat-store";
import { _resetAuditCounters_TEST_ONLY } from "../shared/safety";

function reset() {
  _resetAuditCounters_TEST_ONLY();
  useAuthStore.setState({
    apiKey: null,
    hasEncrypted: true,
    isConfigured: false,
    jinaApiKey: null,
    jinaIsConfigured: false,
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
  useStatusStore.setState({
    status: useStatusStore.getState().status,
    snapshot: useStatusStore.getState().snapshot,
    lastRefreshedAt: null,
    isRefreshing: false,
    drawerOpen: false,
    focusedSectionId: null,
  });
}

beforeEach(() => {
  reset();
});

describe("useStatusStore (VERIFY-045)", () => {
  it("exposes a status snapshot, safe snapshot, and drawer flag", () => {
    const s = useStatusStore.getState();
    expect(s.status).toBeTruthy();
    expect(s.snapshot).toBeTruthy();
    expect(s.drawerOpen).toBe(false);
    expect(s.focusedSectionId).toBeNull();
    expect(s.isRefreshing).toBe(false);
  });

  it("recompute refreshes status + snapshot from current store state", () => {
    const before = useStatusStore.getState().status.apiKey.severity;
    expect(before).toBe("error");
    useAuthStore.setState({ isConfigured: true, apiKey: "k" } as never);
    useStatusStore.getState().recompute();
    const after = useStatusStore.getState().status.apiKey.severity;
    expect(after).toBe("ok");
  });

  it("refresh is non-overlapping (concurrent calls are no-ops)", async () => {
    const refresh = useStatusStore.getState().refresh;
    const p1 = refresh();
    const p2 = refresh();
    // Both resolve; the second is dropped on the isRefreshing guard.
    await Promise.all([p1, p2]);
    expect(useStatusStore.getState().isRefreshing).toBe(false);
    expect(useStatusStore.getState().lastRefreshedAt).not.toBeNull();
  });

  it("openDrawer / closeDrawer toggle the drawer flag and focused section", () => {
    useStatusStore.getState().openDrawer("api");
    expect(useStatusStore.getState().drawerOpen).toBe(true);
    expect(useStatusStore.getState().focusedSectionId).toBe("api");
    useStatusStore.getState().closeDrawer();
    expect(useStatusStore.getState().drawerOpen).toBe(false);
    expect(useStatusStore.getState().focusedSectionId).toBeNull();
  });

  it("setFocusedSection is independent of the drawer flag", () => {
    useStatusStore.getState().setFocusedSection("model");
    expect(useStatusStore.getState().focusedSectionId).toBe("model");
    expect(useStatusStore.getState().drawerOpen).toBe(false);
  });
});
