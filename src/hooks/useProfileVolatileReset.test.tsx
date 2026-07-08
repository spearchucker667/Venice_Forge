/**
 * @fileoverview Tests for the active-profile volatile-state reset.
 *
 * VERIFY-066 regression guard: profile switching must clear stale
 * in-memory caches that were keyed off the previous profile id.
 */
import { describe, expect, it, beforeEach } from "vitest";
import {
  subscribeActiveProfile,
  broadcastActiveProfileChange,
  setActiveProfileId,
} from "../services/activeProfile";
import { useImageWorkspaceStore } from "../stores/image-workspace-store";
import { useInspectorStore } from "../stores/inspector-store";
import { useChatStore } from "../stores/chat-store";
import { useWorkflowTemplateStore } from "../stores/workflow-template-store";
import { resetVolatileProfileState } from "../hooks/useProfileVolatileReset";

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem("venice-active-profile-id", "default");

  useImageWorkspaceStore.getState().reset();
  useInspectorStore.getState().clearLogs();
  useChatStore.getState().setConversations([]);
  useChatStore.getState().setActiveConversation(null);
  useWorkflowTemplateStore.getState().setActiveWorkflow(null);
});

describe("resetVolatileProfileState", () => {
  it("clears image-workspace drafts, inspector logs, conversations, and active workflow", () => {
    useImageWorkspaceStore
      .getState()
      .enqueueGenerate({ draft: { prompt: "leaky-prompt" }, autoGenerate: false, parentId: null, operation: "regenerate" });
    useInspectorStore.getState().addLog({
      endpoint: "/chat/completions",
      method: "POST",
      transport: "venice",
      requestHeaders: {},
      requestBody: { leaked: true },
    });
    useChatStore.getState().setConversations([
      { id: "c1", title: "from-default", messages: [], updatedAt: 1 },
    ] as never);
    useChatStore.getState().setActiveConversation("c1");
    useWorkflowTemplateStore.getState().setActiveWorkflow("wf-1");

    resetVolatileProfileState();

    expect(useImageWorkspaceStore.getState().pending).toBeNull();
    expect(useInspectorStore.getState().logs).toEqual([]);
    expect(useChatStore.getState().conversations).toEqual([]);
    expect(useChatStore.getState().activeConversationId).toBeNull();
    expect(useWorkflowTemplateStore.getState().activeWorkflowId).toBeNull();
  });

  it("does not throw when called on a fresh-booted system with no prior state", () => {
    expect(() => resetVolatileProfileState()).not.toThrow();
  });
});

describe("subscribe / broadcast dedup", () => {
  it("fires the listener once on a real switch and dedupes repeats", () => {
    const seen: Array<[string, string]> = [];
    const unsub = subscribeActiveProfile((next, prev) => seen.push([next, prev]));

    // Identical-to-prev is a no-op even when called directly via broadcast.
    broadcastActiveProfileChange("default");
    expect(seen).toEqual([]);

    setActiveProfileId("work");
    setActiveProfileId("work"); // dedup, no second broadcast
    expect(seen).toEqual([["work", "default"]]);

    unsub();
  });

  it("isolates listener exceptions so other subscribers still fire", () => {
    const calls: string[] = [];
    subscribeActiveProfile(() => {
      throw new Error("intentional");
    });
    subscribeActiveProfile((next) => calls.push(next));

    setActiveProfileId("work");
    expect(calls).toEqual(["work"]);
  });
});
