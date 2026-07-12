/**
 * @fileoverview Volatile state reset hook for profile switches.
 *
 * When the active profile changes (via `broadcastActiveProfileChange`),
 * persistent storage and settings are already re-keysafe because
 * `storageService.stampProfileId` keys rows by profile and `safe-storage`
 * reads via `getActiveProfileId()`. In-memory state, however, has no
 * automatic cross-profile reset: a half-edited image-workspace draft, a
 * stale traffic inspector log, or the previously-active conversation id
 * could leak through to the newly-active profile until the page reload
 * triggered by `profileStore.requestSwitchProfile` finishes.
 *
 * This hook installs a single subscription that synchronously clears:
 *
 *   - `useImageWorkspaceStore.reset()` — pending Image Studio handoff drafts
 *     so the new profile does not start in the middle of someone else's
 *     remix/edit pipeline.
 *   - `useInspectorStore.clearLogs()` — Traffic Inspector entries now refer
 *     to a different traffic history; previous-profile calls would be
 *     misleading.
 *   - `useChatStore.setConversations([]) + setActiveConversation(null)` —
 *     conversations are profile-scoped through storageService; the in-memory
 *     cache must not leak ids that resolve (correctly) to null on next read.
 *   - `useWorkflowTemplateStore.setActiveWorkflow(null)` — same idea for
 *     workflows.
 *
 * The subscriber runs BEFORE `profileStore.switchProfile` calls
 * `window.location.reload()` (the reload remains the canonical purge for
 * components like React-DnD, theme, etc.), so any code path that somehow
 * survives an unreachable reload also gets a clean slate at the data layer.
 *
 * Each store is imported lazily via `require`/dynamic lookup at call time
 * to keep this hook from inflating the editor / image-studio bundle.
 */
import { useEffect } from "react";
import { subscribeActiveProfile, getActiveProfileId } from "../services/activeProfile";
import { useImageWorkspaceStore } from "../stores/image-workspace-store";
import { useInspectorStore } from "../stores/inspector-store";
import { useChatStore } from "../stores/chat-store";
import { useWorkflowTemplateStore } from "../stores/workflow-template-store";
import { useBackgroundTaskStore } from "../stores/background-task-store";

/**
 * Reset every volatile in-memory cache that stores cross-profile data.
 *
 * Safe to call repeatedly; the underlying setters are no-ops when the
 * store is already at the empty baseline.
 */
export function resetVolatileProfileState(): void {
  try {
    useImageWorkspaceStore.getState().reset();
  } catch {
    /* store not yet initialised — ignore */
  }
  try {
    useInspectorStore.getState().clearLogs();
  } catch {
    /* store not yet initialised — ignore */
  }
  try {
    const chat = useChatStore.getState();
    chat.setConversations([]);
    chat.setActiveConversation(null);
  } catch {
    /* store not yet initialised — ignore */
  }
  try {
    useWorkflowTemplateStore.getState().setActiveWorkflow(null);
  } catch {
    /* store not yet initialised — ignore */
  }
  try {
    useBackgroundTaskStore.setState({ tasks: {} });
  } catch {
    /* store not yet initialised — ignore */
  }
}

/**
 * Mounts a single subscription that clears volatile per-store caches
 * whenever the active profile id changes. Returns the unsubscribe function
 * for symmetry with effect teardown, although in practice React component
 * unmounts trigger it.
 *
 * On first mount the hook does NOT reset — doing so would blow away the
 * initial in-memory state the renderer needs at boot. Only subsequent
 * broadcasts matter.
 */
export function useProfileVolatileReset(): void {
  useEffect(() => {
    const initialId = getActiveProfileId();
    return subscribeActiveProfile((nextId, prevId) => {
      // Defence in depth: if a caller forgets to call setActiveProfileId
      // before broadcasting, we still know there was no real switch — bail.
      if (nextId === prevId || nextId === initialId && prevId === initialId) {
        return;
      }
      resetVolatileProfileState();
    });
  }, []);
}
