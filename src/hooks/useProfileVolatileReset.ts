/**
 * @fileoverview Volatile state reset hook for profile switches.
 *
 * When the active profile changes (via `broadcastActiveProfileChange`),
 * persistent storage and settings are already re-keyed because
 * `storageService.stampProfileId` keys rows by profile and `safe-storage`
 * reads via `getActiveProfileId()`. In-memory state, however, has no
 * automatic cross-profile reset: a half-edited image-workspace draft, a
 * stale traffic inspector log, or the previously-active conversation id
 * could leak through to the newly-active profile until the page reload
 * triggered by `profileStore.requestSwitchProfile` finishes.
 *
 * This hook installs a single subscription that synchronously clears EVERY
 * profile-scoped in-memory store through the PROFILE_SCOPED_RESETS registry.
 * Every store that persists user data keyed by profile must register a reset
 * function here — this is the canonical list, not a fragile hand-maintained
 * subset.
 *
 * Registered stores (in order of dependency safety):
 *   1. useImageWorkspaceStore.reset()     — pending Image Studio drafts
 *   2. useInspectorStore.clearLogs()      — Traffic Inspector entries
 *   3. useChatStore (conversations)       — chat conversation cache
 *   4. useWorkflowTemplateStore           — active workflow template
 *   5. useBackgroundTaskStore             — in-flight background tasks
 *   6. useMediaStore                      — media item cache (loaded on demand)
 *   7. usePromptLibraryStore             — prompt library cache
 *   8. useResearchStore                   — research session cache
 *   9. useRpChatStore                     — RP chat cache
 *
 * The subscriber runs BEFORE `profileStore.switchProfile` calls
 * `window.location.reload()` (the reload remains the canonical purge for
 * components like React-DnD, theme, etc.), so any code path that somehow
 * survives an unreachable reload also gets a clean slate at the data layer.
 */
import { useEffect } from "react";
import { subscribeActiveProfile, getActiveProfileId } from "../services/activeProfile";
import { useImageWorkspaceStore } from "../stores/image-workspace-store";
import { useInspectorStore } from "../stores/inspector-store";
import { hydrateConversationHistory, useChatStore } from "../stores/chat-store";
import { useWorkflowTemplateStore } from "../stores/workflow-template-store";
import { useBackgroundTaskStore } from "../stores/background-task-store";
import { useMediaStore } from "../stores/media-store";
import { usePromptLibraryStore } from "../stores/prompt-library-store";
import { useResearchStore } from "../stores/research-store";
import { useRpChatStore } from "../stores/rp-chat-store";

/** Profile-scoped reset registry.
 *
 * Each entry is a zero-argument function that resets one in-memory store to
 * a clean initial state appropriate for a newly-selected profile.
 *
 * Rules:
 *  - Do NOT call async functions here — the reset must complete synchronously
 *    before the page reload begins.
 *  - Wrap each call in a try/catch so a single failed reset does not prevent
 *    the remaining stores from clearing.
 *  - When adding a new persistent profile-scoped store, add its reset here.
 */
const PROFILE_SCOPED_RESETS: Array<{ name: string; reset: () => void }> = [
  {
    name: "image-workspace",
    reset: () => useImageWorkspaceStore.getState().reset(),
  },
  {
    name: "inspector",
    reset: () => useInspectorStore.getState().clearLogs(),
  },
  {
    name: "chat",
    reset: () => {
      const chat = useChatStore.getState();
      chat.setConversations([]);
      chat.setActiveConversation(null);
      useChatStore.setState({ _hasLoadedHistory: false });
      hydrateConversationHistory();
    },
  },
  {
    name: "workflow-template",
    reset: () => useWorkflowTemplateStore.getState().setActiveWorkflow(null),
  },
  {
    name: "background-tasks",
    reset: () => useBackgroundTaskStore.setState({ tasks: {} }),
  },
  {
    name: "media",
    reset: () => {
      // Media store has no explicit reset — clear the in-memory cache so the
      // new profile does not see the previous profile's gallery. The store
      // reloads lazily from IDB (keyed by profile) on next gallery open.
      useMediaStore.setState({
        items: [],
        loading: false,
        loadingMore: false,
        loaded: false,
        totalCount: 0,
        hasMore: false,
        nextOffset: 0,
        lastError: null,
      });
    },
  },
  {
    name: "prompt-library",
    reset: () => {
      // Reset to unloaded state; the store reloads lazily from IDB.
      usePromptLibraryStore.setState({
        prompts: [],
        hydrated: false,
        loading: false,
        loadError: null,
        activePromptId: null,
      });
    },
  },
  {
    name: "research",
    reset: () => {
      useResearchStore.setState({
        sessions: [],
        activeSessionId: null,
        hydrated: false,
        isInitialLoading: false,
      });
    },
  },
  {
    name: "rp-chat",
    reset: () => {
      useRpChatStore.setState({
        chats: [],
        activeChatId: null,
        hasLoaded: false,
        isLoading: false,
        error: null,
        isStreaming: false,
      });
    },
  },
];

/**
 * Reset every volatile in-memory cache that stores profile-scoped data.
 *
 * Safe to call repeatedly; the underlying setters are no-ops when the
 * store is already at the empty baseline.
 */
export function resetVolatileProfileState(): void {
  for (const entry of PROFILE_SCOPED_RESETS) {
    try {
      entry.reset();
    } catch {
      /* store not yet initialised or failed — do not block remaining resets */
    }
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
      if (nextId === prevId || (nextId === initialId && prevId === initialId)) {
        return;
      }
      resetVolatileProfileState();
    });
  }, []);
}
