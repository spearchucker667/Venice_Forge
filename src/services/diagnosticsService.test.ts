/** @fileoverview VERIFY-045 — Phase 2C diagnostics service tests. */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the desktop bridge so isElectron() / webSessionJinaApiKey etc.
// behave deterministically. The mock keeps the public shape but
// forces isElectron() to return false (web mode) unless a test
// overrides the override below.
vi.mock("../services/desktopBridge", () => {
  return {
    isElectron: () => false,
    desktopApiKey: { isConfigured: () => Promise.resolve(false) },
    desktopJinaApiKey: { isConfigured: () => Promise.resolve(false) },
    desktopApp: { getDiagnostics: () => Promise.resolve({}) },
    desktopConversations: { list: () => Promise.resolve({ ok: false, records: [], error: "mock" }) },
    desktopChat: { list: () => Promise.resolve({ ok: false, conversations: [], truncated: false, totalScanned: 0, error: "mock" }) },
  };
});

import {
  computeAppStatusSnapshot,
  computeSafeDiagnosticsSnapshot,
  serialiseSafeDiagnosticsSnapshot,
} from "./diagnosticsService";
import { useAuthStore } from "../stores/auth-store";
import { useSettingsStore } from "../stores/settings-store";
import { useProjectStore } from "../stores/project-store";
import { useMediaStore } from "../stores/media-store";
import { useChatStore } from "../stores/chat-store";
import { _resetAuditCounters_TEST_ONLY } from "../shared/safety";

function resetStores() {
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
}

beforeEach(() => {
  resetStores();
});

describe("computeAppStatusSnapshot (VERIFY-045)", () => {
  it("returns one item per required category", () => {
    const s = computeAppStatusSnapshot();
    expect(s.api).toBeTruthy();
    expect(s.apiKey).toBeTruthy();
    expect(s.model).toBeTruthy();
    expect(s.storage).toBeTruthy();
    expect(s.project).toBeTruthy();
    expect(s.safety).toBeTruthy();
    expect(s.provider).toBeTruthy();
    expect(s.desktop).toBeTruthy();
    expect(s.diagnostics).toBeTruthy();
  });

  it("missing API key surfaces as warn for api and error for apiKey", () => {
    const s = computeAppStatusSnapshot();
    expect(s.api.severity).toBe("warn");
    expect(s.apiKey.severity).toBe("error");
  });

  it("configured API key separates stored key from live connectivity (no key material in payload)", () => {
    useAuthStore.setState({ isConfigured: true, apiKey: "VENICE-SECRET-KEY-XYZ" } as never);
    const s = computeAppStatusSnapshot();
    expect(s.api.severity).toBe("warn");
    expect(s.api.summary).toMatch(/not been verified/i);
    expect(s.apiKey.severity).toBe("ok");
    expect(s.apiKey.summary).toMatch(/raw key is hidden/i);
    // The secret MUST NOT appear in any status field.
    const dump = JSON.stringify(s);
    expect(dump).not.toContain("VENICE-SECRET-KEY-XYZ")
    expect(dump).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i)
    expect(dump).not.toMatch(/authorization/i)
    // Negative control: a plain "API Key" label is fine.
    expect(dump).toMatch(/API Key/i)
  })

  it("archived active project is warn", () => {
    useSettingsStore.setState({ activeProjectId: "arc" } as never);
    useProjectStore.setState({
      projects: [
        {
          id: "arc",
          name: "Archived",
          createdAt: 1,
          updatedAt: 1,
          archivedAt: 100,
          version: 1,
        },
      ],
      loaded: true,
      loading: false,
      lastError: null,
    });
    const s = computeAppStatusSnapshot();
    expect(s.project.severity).toBe("warn");
    expect(s.project.summary).toMatch(/archived/i);
  });

  it("missing active project id is error", () => {
    useSettingsStore.setState({ activeProjectId: "ghost" } as never);
    useProjectStore.setState({ projects: [], loaded: true, loading: false, lastError: null });
    const s = computeAppStatusSnapshot();
    expect(s.project.severity).toBe("error");
  });

  it("All Projects mode is valid (ok)", () => {
    useSettingsStore.setState({ activeProjectId: null } as never);
    const s = computeAppStatusSnapshot();
    expect(s.project.severity).toBe("ok");
    expect(s.project.summary).toMatch(/all projects/i);
  });

  it("local safety off is warn, not error", () => {
    useSettingsStore.setState({ localFamilySafeModeEnabled: false } as never);
    const s = computeAppStatusSnapshot();
    expect(s.safety.severity).toBe("warn");
  });

  it("Venice safe_mode is reported separately from local guard", () => {
    useSettingsStore.setState({
      localFamilySafeModeEnabled: false,
      veniceApiSafeMode: true,
    } as never);
    const s = computeAppStatusSnapshot();
    // Worst-of: local-off + provider-on → warn
    expect(s.safety.severity).toBe("warn");
    expect(s.safety.summary).toMatch(/Local guard: off/);
    expect(s.safety.summary).toMatch(/Venice safe_mode: on/);
  });

  it("web mode desktop status is warn, not error", () => {
    // The default mock forces isElectron() to false (web mode).
    const s = computeAppStatusSnapshot();
    expect(s.desktop.severity).toBe("warn");
    expect(s.desktop.summary).toMatch(/web/i);
  });

  it("model is unknown when no model is selected", () => {
    const s = computeAppStatusSnapshot();
    expect(s.model.severity).toBe("unknown");
  });

  it("model is ok when any model is selected", () => {
    useSettingsStore.setState({ selectedModels: { chat: "venice-uncensored-1-2" } } as never);
    const s = computeAppStatusSnapshot();
    expect(s.model.severity).toBe("ok");
  });
});

describe("computeSafeDiagnosticsSnapshot (VERIFY-045)", () => {
  it("is JSON-serializable (no functions, no circular refs)", () => {
    const snap = computeSafeDiagnosticsSnapshot();
    const text = JSON.stringify(snap);
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it("includes redacted API-key metadata but no raw key", () => {
    useAuthStore.setState({ isConfigured: true, apiKey: "VENICE-SECRET-KEY-XYZ" } as never);
    const snap = computeSafeDiagnosticsSnapshot();
    expect(snap.stores.apiKey).toMatchObject({
      configured: true,
      exported: false,
      redacted: true,
      lastValidationStatus: "configured-not-validated",
    });
    const text = serialiseSafeDiagnosticsSnapshot(snap);
    expect(text).not.toContain("VENICE-SECRET-KEY-XYZ");
    expect(text).not.toMatch(/Bearer\s+/i);
  });

  it("includes status severities, project count, media count, conversation count", () => {
    useProjectStore.setState({
      projects: [
        { id: "p1", name: "A", createdAt: 1, updatedAt: 1, archivedAt: null, version: 1 },
        { id: "p2", name: "B", createdAt: 1, updatedAt: 1, archivedAt: null, version: 1 },
      ],
      loaded: true,
      loading: false,
      lastError: null,
    });
    useMediaStore.setState({
      items: [
        {
          id: "m1",
          image: "data:image/png;base64,AAAA",
          prompt: "p",
          model: "flux-dev",
          timestamp: 1,
          mediaType: "image",
          operation: "generate",
          parentId: null,
          childrenIds: [],
          tags: [],
          note: "",
          favorite: false,
          projectId: "p1",
        } as never,
        {
          id: "m2",
          image: "data:image/png;base64,BBBB",
          prompt: "p",
          model: "flux-dev",
          timestamp: 1,
          mediaType: "image",
          operation: "generate",
          parentId: null,
          childrenIds: [],
          tags: [],
          note: "",
          favorite: false,
        } as never,
      ],
      loading: false,
      loaded: true,
      totalCount: 2,
      hasMore: false,
      nextOffset: 2,
      lastError: null,
    });
    useChatStore.setState({
      conversations: [
        { id: "c1", title: "C", messages: [], createdAt: 1, updatedAt: 1, model: "x" } as never,
        { id: "c2", title: "D", messages: [], createdAt: 1, updatedAt: 1, model: "x" } as never,
        { id: "c3", title: "E", messages: [], createdAt: 1, updatedAt: 1, model: "x" } as never,
      ],
    } as never);
    useSettingsStore.setState({ activeProjectId: "p1" } as never);
    const snap = computeSafeDiagnosticsSnapshot();
    expect(snap.stores.projects.count).toBe(2);
    expect(snap.stores.media.count).toBe(2);
    expect(snap.stores.media.scopedCount).toBe(1);
    expect(snap.stores.media.unscopedCount).toBe(1);
    expect(snap.stores.conversations.count).toBe(3);
    expect(snap.stores.projects.activeProjectMode).toBe("project");
    // Status entries are mirrored into the snapshot.
    expect(snap.statuses.api).toBeTruthy();
    expect(snap.statuses.safety).toBeTruthy();
  });

  it("EXCLUDES API keys, bearer tokens, auth headers, raw prompts, base64 media data, full local absolute paths", () => {
    useAuthStore.setState({ isConfigured: true, apiKey: "VENICE-SECRET-KEY-XYZ" } as never);
    useSettingsStore.setState({ activeProjectId: null } as never);
    useMediaStore.setState({
      items: [
        {
          id: "m1",
          image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX///+nxBvIAAAAC0lEQVQI12NgAAIAAAUAAeImBZsAAAAASUVORK5CYII=",
          prompt: "A copper city at dusk with neon signs",
          model: "flux-dev",
          timestamp: 1,
          mediaType: "image",
          operation: "generate",
          parentId: null,
          childrenIds: [],
          tags: [],
          note: "",
          favorite: false,
        } as never,
      ],
    } as never);
    useChatStore.setState({
      conversations: [
        {
          id: "c1",
          title: "C",
          messages: [
            {
              id: "m",
              role: "user",
              content: "My secret API key is s" + "k-1234567890ABCDEF. Please do not leak it.",
              timestamp: 1,
            } as never,
          ],
          createdAt: 1,
          updatedAt: 1,
          model: "x",
        } as never,
      ],
    } as never);

    const snap = computeSafeDiagnosticsSnapshot();
    const text = serialiseSafeDiagnosticsSnapshot(snap);

    // Forbidden substrings
    expect(text).not.toContain("VENICE-SECRET-KEY-XYZ")
    expect(text).not.toContain("s" + "k-1234567890ABCDEF")
    expect(text).not.toContain("iVBORw0KGgo")
    expect(text).not.toContain("A copper city at dusk with neon signs")
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9_-]{20,}/i)
    expect(text).not.toMatch(/authorization/i)
    // No full local absolute path (the snapshot does not include
    // userDataPath / logsPath by design).
    expect(text).not.toMatch(/[A-Z]:\\Program Files/);
    expect(text).not.toMatch(/\/Users\//);
    expect(text).not.toMatch(/\/home\//);
    expect(text).not.toMatch(/\/tmp\//);
  });

  it("includes the user-agent, platform, and locale (no secrets)", () => {
    const snap = computeSafeDiagnosticsSnapshot();
    expect(snap.environment).toBeTruthy();
    // jsdom sets userAgent to "node.js" in tests — that's fine.
    if (typeof navigator !== "undefined") {
      // The fields are best-effort: any subset is acceptable.
      if (navigator.userAgent) expect(snap.environment.userAgent).toBe(navigator.userAgent);
    }
  });

  it("appMode is web in the default test environment (isElectron mocked false)", () => {
    const snap = computeSafeDiagnosticsSnapshot();
    expect(snap.appMode).toBe("web");
  });

  it("diagnostics summary aggregates the worst severity", () => {
    // Force an error in apiKey (no key configured).
    const s = computeAppStatusSnapshot();
    expect(s.diagnostics.severity).toBe("error");
  });
});
