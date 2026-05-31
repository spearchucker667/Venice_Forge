import React, { useState, useRef, useEffect, useCallback } from "react";
import { veniceFetch, veniceStreamChat } from "../services/veniceClient";
import { assessChildExploitationSafety, recordDecision } from "../shared/safety";
import {
  DEFAULT_SYSTEM_PROMPT,
  modelSupportsVision,
  MAX_ATTACHMENTS_PER_MESSAGE,
} from "../constants/venice";
import { Markdown } from "../utils/markdown";
import { copyText } from "../utils/download";
import { buildChatPayload, type ChatMessageContent } from "../utils/payloadBuilders";
import { isValidChatResponse } from "../utils/veniceValidation";
import { Field } from "../components/Field";
import { ModelSelect } from "../components/ModelSelect";
import { ModelRefreshButton } from "../components/ModelRefreshButton";
// import { DiagPreview } from "../components/DiagnosticsPreview";
import { StatusBlock } from "../components/StatusBlock";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { ConfirmModal } from "../components/ConfirmModal";
import { AttachmentTray } from "../components/AttachmentTray";
import { ModuleProps } from "../types/app";
import type { Conversation, ConversationMessage } from "../types/conversation";
import type { Attachment } from "../types/attachment";
import {
  createConversation,
  saveConversation,
  deleteConversation,
  deriveTitle,
} from "../services/chatStorage";
import {
  processFileAttachment,
  scrapeUrlAttachment,
  assembleAttachmentContext,
} from "../services/attachmentService";
import {
  saveMemory,
  selectMemoriesForInjection,
  listMemories,
  deleteMemory,
  type MemoryBlock,
} from "../services/memoryService";
import type { Memory } from "../services/memoryService";

interface ChatUiMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  importedFrom?: string;
}

function buildMessageContent(
  text: string,
  images: Array<{ name: string; dataUrl: string }>,
  supportsVision: boolean
): ChatMessageContent {
  if (!images.length || !supportsVision) return text;
  const parts: ChatMessageContent = [
    { type: "text", text },
    ...images.map((img) => ({
      type: "image_url" as const,
      image_url: { url: img.dataUrl, detail: "auto" as const },
    })),
  ];
  return parts;
}

export function ChatModule({ state, dispatch }: ModuleProps) {
  const conversations = state.conversations;
  const activeId = state.activeConversationId;
  const activeConversation = conversations.find((c) => c.id === activeId) || null;

  const [systemPrompt, setSystemPrompt] = useState(
    activeConversation?.systemPrompt ?? state.settings.defaultSystemPrompt
  );
  const [userPrompt, setUserPrompt] = useState("");
  const [messages, setMessages] = useState<ChatUiMessage[]>([]);
  const [webSearch, setWebSearch] = useState(state.settings.webSearch);
  const [webScraping, setWebScraping] = useState(state.settings.webScraping);
  const [webCitations, setWebCitations] = useState(state.settings.webCitations);
  const [includeVeniceSystemPrompt, setIncludeVeniceSystemPrompt] = useState(
    state.settings.includeVeniceSystemPrompt
  );
  const [characterSlug, setCharacterSlug] = useState("");
  const [stream, setStream] = useState(false);
  const [enableXSearch, setEnableXSearch] = useState(false);
  const [stripThinking, setStripThinking] = useState(false);
  const [disableThinking, setDisableThinking] = useState(false);
  const [reasoningEffort, setReasoningEffort] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [promptTouched, setPromptTouched] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const endRef = useRef<HTMLDivElement>(null);

  // New state for P2/P3 features
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentNotices, setAttachmentNotices] = useState<string[]>([]);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [forkMode, setForkMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showImportPicker, setShowImportPicker] = useState(false);
  const [_importSelectedIds, _setImportSelectedIds] = useState<Set<string>>(new Set());
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [importStage, setImportStage] = useState<"select-conv" | "select-messages">("select-conv");
  const [importConversationId, setImportConversationId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync local messages when active conversation changes
  useEffect(() => {
    if (activeConversation) {
      setMessages(
        activeConversation.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        }))
      );
      setSystemPrompt(activeConversation.systemPrompt || state.settings.defaultSystemPrompt);
    } else {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "Ready. Send a prompt to call Venice /chat/completions.",
        },
      ]);
      setSystemPrompt(state.settings.defaultSystemPrompt);
    }
    setAttachments([]);
    setAttachmentNotices([]);
    setSelectedMessageIds(new Set());
    setForkMode(false);
  }, [activeId, state.settings.defaultSystemPrompt, conversations]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  useEffect(() => {
    setSystemPrompt(state.settings.defaultSystemPrompt);
    setWebSearch(state.settings.webSearch);
    setWebScraping(state.settings.webScraping);
    setWebCitations(state.settings.webCitations);
    setIncludeVeniceSystemPrompt(state.settings.includeVeniceSystemPrompt);
  }, [
    state.settings.defaultSystemPrompt,
    state.settings.webSearch,
    state.settings.webScraping,
    state.settings.webCitations,
    state.settings.includeVeniceSystemPrompt,
  ]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const ensureActiveConversation = useCallback(async (): Promise<Conversation> => {
    if (activeConversation) return activeConversation;
    const conv = createConversation(state.selectedChatModel, systemPrompt || DEFAULT_SYSTEM_PROMPT);
    conv.model = state.selectedChatModel;
    await saveConversation(conv);
    const updated = [...conversations, conv];
    dispatch({ type: "SET_CONVERSATIONS", items: updated });
    dispatch({ type: "SET_ACTIVE_CONVERSATION", id: conv.id });
    return conv;
  }, [activeConversation, conversations, dispatch, state.selectedChatModel, systemPrompt]);

  const persistMessages = useCallback(
    async (conv: Conversation, newMessages: ChatUiMessage[]) => {
      const updated: Conversation = {
        ...conv,
        messages: newMessages.map((m): ConversationMessage => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: Date.now(),
        })),
        updatedAt: Date.now(),
        model: state.selectedChatModel,
        systemPrompt,
        title: conv.title === "New Chat" ? deriveTitle(newMessages) : conv.title,
      };
      await saveConversation(updated);
      const refreshed = state.conversations.map((c) => (c.id === updated.id ? updated : c));
      dispatch({ type: "SET_CONVERSATIONS", items: refreshed });
    },
    [dispatch, state.conversations, state.selectedChatModel, systemPrompt]
  );

  async function send() {
    const trimmedPrompt = userPrompt.trim();
    if (!trimmedPrompt || loading) {
      if (!trimmedPrompt) setPromptTouched(true);
      return;
    }
    setPromptTouched(false);
    if (state.usingFallbackModels) {
      setError("Fallback models are active. Please refresh the model catalog before sending requests.");
      return;
    }
    setError("");
    setAttachmentNotices([]);

    // Assemble attachments
    const attachCtx = assembleAttachmentContext(attachments);
    setAttachmentNotices(attachCtx.notices);

    // Select memories for injection
    let memoryBlock: MemoryBlock = { text: "", used: 0, truncated: false };
    try {
      memoryBlock = await selectMemoriesForInjection(activeConversation?.id);
    } catch {
      // Memory is advisory — continue without it on error
    }

    // Build the full text for safety guard (user prompt + attachment text + memory)
    const assembledText = [memoryBlock.text, attachCtx.text, trimmedPrompt]
      .filter(Boolean)
      .join("\n\n");

    // Safety guard on the FINAL assembled payload
    const guardDecision = assessChildExploitationSafety({
      text: assembledText,
      endpoint: "/chat/completions",
      method: "POST",
      source: "chat",
    });
    recordDecision(guardDecision);
    if (!guardDecision.allow || guardDecision.action === "block") {
      setError(guardDecision.userMessage);
      return;
    }

    abortRef.current?.abort();
    setLoading(true);
    const runId = ++runIdRef.current;

    // Snapshot prompt and attachments so they can be restored if the request fails
    const snapshotPrompt = trimmedPrompt;
    const snapshotAttachments = [...attachments];

    const conv = await ensureActiveConversation();

    const supportsVision = modelSupportsVision(state.selectedChatModel);
    const userContent = buildMessageContent(trimmedPrompt, attachCtx.images, supportsVision);
    const userMessage: ChatUiMessage = { id: crypto.randomUUID(), role: "user", content: trimmedPrompt };
    const assistantMsgId = crypto.randomUUID();

    // Exclude the welcome placeholder from history and persistence
    const baseMessages = messages.filter((m) => m.id !== "welcome");

    const history: Array<{ role: "system" | "user" | "assistant"; content: ChatMessageContent }> = [
      { role: "system", content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
      ...baseMessages.filter((m) => ["user", "assistant"].includes(m.role)).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content as ChatMessageContent,
      })),
      { role: "user", content: userContent },
    ];

    setMessages((prev) => [
      ...prev,
      userMessage,
      { id: assistantMsgId, role: "assistant", content: "" } as ChatUiMessage,
    ]);
    setUserPrompt("");
    setAttachments([]);

    const payload = buildChatPayload(
      state.selectedChatModel,
      history,
      {
        includeVeniceSystemPrompt,
        webSearch,
        webScraping,
        webCitations,
      },
      {
        stream,
        characterSlug,
        reasoningEffort,
        enableXSearch,
        stripThinking,
        disableThinking,
      },
      memoryBlock.text || undefined
    );

    abortRef.current = new AbortController();

    try {
      if (stream) {
        let acc = "";
        await veniceStreamChat(payload, {
          signal: abortRef.current.signal,
          dispatch,
          onDelta: (delta: string) => {
            acc += delta;
            setMessages((prev) => {
              const next = [...prev];
              const lastIdx = next.length - 1;
              if (lastIdx >= 0) {
                next[lastIdx] = { ...next[lastIdx], role: "assistant", content: acc };
              }
              return next;
            });
          },
        });
        if (runIdRef.current !== runId) return;
        // Build final messages and persist without side effects in a state updater
        const finalMessages: ChatUiMessage[] = [
          ...baseMessages,
          userMessage,
          { id: assistantMsgId, role: "assistant" as const, content: acc },
        ];
        await persistMessages(conv, finalMessages);
      } else {
        const { data } = await veniceFetch("/chat/completions", {
          method: "POST",
          body: payload,
          signal: abortRef.current.signal,
          dispatch,
        });
        if (!isValidChatResponse(data)) {
          throw new Error("Invalid chat response from server.");
        }
        const content =
          data.choices[0]?.message?.content ||
          data.choices[0]?.text ||
          "";
        if (runIdRef.current !== runId) return;
        // Set and persist final messages without side effects in a state updater
        const finalMessages: ChatUiMessage[] = [
          ...baseMessages,
          userMessage,
          { id: assistantMsgId, role: "assistant" as const, content },
        ];
        setMessages(finalMessages);
        await persistMessages(conv, finalMessages);
      }
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      if (error.name !== "AbortError") {
        setError(error.message || "Chat request failed");
        // Restore prompt and attachments so the user can retry
        if (runIdRef.current === runId) {
          setUserPrompt(snapshotPrompt);
          setAttachments(snapshotAttachments);
        }
      }
      if (runIdRef.current === runId) {
        // Roll back messages to the pre-send state
        const rollback: ChatUiMessage[] =
          baseMessages.length > 0
            ? baseMessages
            : [{ id: "welcome", role: "assistant" as const, content: "Ready. Send a prompt to call Venice /chat/completions." }];
        setMessages(rollback);
        await persistMessages(conv, baseMessages);
      }
    } finally {
      if (runIdRef.current === runId) {
        setLoading(false);
      }
    }
  }

  function cancel() {
    runIdRef.current++;
    abortRef.current?.abort();
    setLoading(false);
  }

  async function clear() {
    cancel();
    setMessages([]);
    setError("");
    if (activeConversation) {
      const updated: Conversation = { ...activeConversation, messages: [], updatedAt: Date.now() };
      await saveConversation(updated);
      const refreshed = state.conversations.map((c) => (c.id === updated.id ? updated : c));
      dispatch({ type: "SET_CONVERSATIONS", items: refreshed });
    }
    dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Conversation cleared.", type: "info" } });
  }

  async function handleNewChat() {
    cancel();
    const conv = createConversation(state.selectedChatModel, systemPrompt || DEFAULT_SYSTEM_PROMPT);
    conv.model = state.selectedChatModel;
    await saveConversation(conv);
    const updated = [conv, ...state.conversations];
    dispatch({ type: "SET_CONVERSATIONS", items: updated });
    dispatch({ type: "SET_ACTIVE_CONVERSATION", id: conv.id });
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: "Ready. Send a prompt to call Venice /chat/completions.",
      },
    ]);
  }

  async function handleSwitchConversation(id: string) {
    cancel();
    if (activeConversation) {
      const messagesToPersist = messages.filter((m) => m.id !== "welcome");
      if (messagesToPersist.length > 0) {
        await persistMessages(activeConversation, messagesToPersist);
      }
    }
    dispatch({ type: "SET_ACTIVE_CONVERSATION", id });
  }

  async function handleDeleteConversation(conv: Conversation) {
    await deleteConversation(conv.id);
    const updated = state.conversations.filter((c) => c.id !== conv.id);
    dispatch({ type: "SET_CONVERSATIONS", items: updated });
    if (activeId === conv.id) {
      dispatch({ type: "SET_ACTIVE_CONVERSATION", id: updated[0]?.id ?? null });
    }
    setDeleteTarget(null);
  }

  async function handleRenameSubmit(conv: Conversation) {
    const title = renameValue.trim() || conv.title;
    const updated: Conversation = { ...conv, title, updatedAt: Date.now() };
    await saveConversation(updated);
    const refreshed = state.conversations.map((c) => (c.id === updated.id ? updated : c));
    dispatch({ type: "SET_CONVERSATIONS", items: refreshed });
    setRenamingId(null);
    setRenameValue("");
  }

  async function handleSaveToMemory(content: string) {
    try {
      // Safety guard before sending content to Venice for summarization
      const guardDecision = assessChildExploitationSafety({
        text: content.slice(0, 4000),
        endpoint: "/chat/completions",
        method: "POST",
        source: "chat",
      });
      recordDecision(guardDecision);
      if (!guardDecision.allow || guardDecision.action === "block") {
        dispatch({
          type: "ADD_TOAST",
          toast: { id: crypto.randomUUID(), message: "Memory blocked by safety filter.", type: "error" },
        });
        return;
      }
      // Summarize via a short Venice call
      const { data } = await veniceFetch("/chat/completions", {
        method: "POST",
        body: {
          model: state.selectedChatModel,
          messages: [
            { role: "system", content: "Summarize the following into one concise sentence." },
            { role: "user", content: content.slice(0, 4000) },
          ],
        },
      });
      const summary =
        (data as unknown as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content ||
        content.slice(0, 200);
      await saveMemory(summary, ["chat"], activeConversation?.id);
      dispatch({
        type: "ADD_TOAST",
        toast: { id: crypto.randomUUID(), message: "Saved to memory.", type: "success" },
      });
    } catch {
      dispatch({
        type: "ADD_TOAST",
        toast: { id: crypto.randomUUID(), message: "Failed to save memory.", type: "error" },
      });
    }
  }

  async function handleFork() {
    if (!activeConversation || selectedMessageIds.size === 0) return;
    const selectedMessages = messages.filter((m) => selectedMessageIds.has(m.id));
    const conv = createConversation(
      state.selectedChatModel,
      systemPrompt || DEFAULT_SYSTEM_PROMPT,
      {
        parentConversationId: activeConversation.id,
        forkedFromMessageIds: Array.from(selectedMessageIds),
      }
    );
    conv.messages = selectedMessages.map((m): ConversationMessage => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: Date.now(),
    }));
    conv.model = state.selectedChatModel;
    await saveConversation(conv);
    const updated = [conv, ...state.conversations];
    dispatch({ type: "SET_CONVERSATIONS", items: updated });
    dispatch({ type: "SET_ACTIVE_CONVERSATION", id: conv.id });
    setForkMode(false);
    setSelectedMessageIds(new Set());
  }

  const loadMemories = useCallback(async () => {
    try {
      const items = await listMemories();
      setMemories(items);
    } catch {
      setMemories([]);
    }
  }, []);

  useEffect(() => {
    if (memoryPanelOpen) {
      void loadMemories();
    }
  }, [memoryPanelOpen, loadMemories]);

  async function handleDeleteMemory(id: string) {
    try {
      await deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {
      dispatch({
        type: "ADD_TOAST",
        toast: { id: crypto.randomUUID(), message: "Failed to delete memory.", type: "error" },
      });
    }
  }

  async function handleImportMessages() {
    if (!importConversationId || !activeConversation) return;
    const source = conversations.find((c) => c.id === importConversationId);
    if (!source) return;
    const selected = source.messages.filter((m) => _importSelectedIds.has(m.id));
    if (!selected.length) {
      setShowImportPicker(false);
      return;
    }
    const imported: ChatUiMessage[] = selected.map((m) => ({
      id: crypto.randomUUID(),
      role: m.role as "user" | "assistant",
      content: m.content,
      importedFrom: source.title,
    }));
    const nextMessages = [...messages, ...imported];
    setMessages(nextMessages);
    await persistMessages(activeConversation, nextMessages);
    setShowImportPicker(false);
    setImportConversationId(null);
    _setImportSelectedIds(new Set());
    setImportStage("select-conv");
  }

  function toggleMessageSelection(id: string) {
    setSelectedMessageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    await addFileAttachments(files);
  }

  async function addFileAttachments(files: File[]) {
    const newAttachments: Attachment[] = [];
    for (const file of files) {
      if (attachments.length + newAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE) break;
      try {
        const att = await processFileAttachment(file);
        newAttachments.push(att);
      } catch (err) {
        setAttachmentNotices((prev) => [...prev, err instanceof Error ? err.message : String(err)]);
      }
    }
    setAttachments((prev) => [...prev, ...newAttachments]);
  }

  async function handleAttachUrl() {
    const url = window.prompt("Enter URL to attach:");
    if (!url) return;
    try {
      const att = await scrapeUrlAttachment(url);
      setAttachments((prev) => [...prev, att].slice(0, MAX_ATTACHMENTS_PER_MESSAGE));
    } catch (err) {
      setAttachmentNotices((prev) => [...prev, err instanceof Error ? err.message : String(err)]);
    }
  }

  function handleCommand(cmd: string) {
    setCommandPaletteOpen(false);
    const c = cmd.trim().toLowerCase();
    if (c === "/attach" || c === "attach") {
      fileInputRef.current?.click();
    } else if (c === "/image" || c === "image") {
      imageInputRef.current?.click();
    } else if (c === "/search" || c === "search") {
      handleAttachUrl();
    } else {
      setError(`Unknown command: ${cmd}. Available: /attach, /image, /search`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === "/" && !userPrompt) {
      setCommandPaletteOpen(true);
    }
  }

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && m.content);

  const supportsVision = modelSupportsVision(state.selectedChatModel);

  return (
    <section className="flex h-full bg-bg relative">
      {/* Left sidebar */}
      <aside
        className={`flex flex-col border-r border-border/50 bg-bg/40 transition-all duration-200 ${
          sidebarCollapsed ? "w-0 opacity-0 overflow-hidden" : "w-[200px] opacity-100"
        }`}
      >
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-border/50">
          <button
            className="text-xs font-medium text-accent hover:text-accent-hover"
            onClick={handleNewChat}
          >
            + New Chat
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {conversations.map((conv) => {
            const isActive = conv.id === activeId;
            return (
              <div
                key={conv.id}
                className={`group flex items-center gap-1 rounded px-2 py-1 cursor-pointer transition-colors ${
                  isActive
                    ? "bg-accent/20 border border-accent/30"
                    : "hover:bg-surface-elevated/60 border border-transparent"
                }`}
                onClick={() => handleSwitchConversation(conv.id)}
              >
                {renamingId === conv.id ? (
                  <input
                    autoFocus
                    className="flex-1 min-w-0 bg-surface/60 border border-border/50 rounded px-1.5 py-0.5 text-xs text-text-primary"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleRenameSubmit(conv)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRenameSubmit(conv);
                      if (e.key === "Escape") {
                        setRenamingId(null);
                        setRenameValue("");
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <>
                    <span
                      className="flex-1 min-w-0 truncate text-xs font-medium text-text-primary"
                      onDoubleClick={() => {
                        setRenamingId(conv.id);
                        setRenameValue(conv.title);
                      }}
                      title={conv.title}
                    >
                      {conv.title}
                    </span>
                    <button
                      className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-opacity text-[10px] px-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(conv);
                      }}
                      title="Delete"
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            );
          })}
          {conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 px-2 py-6 text-center">
              <div className="text-xs text-text-muted">
                No conversations yet.
                <br />
                Start a new chat.
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex-none h-8 flex items-center gap-2 px-2 border-b border-border/50 bg-bg/50">
          <button
            className="text-text-muted hover:text-text-primary text-xs px-1"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? "»" : "«"}
          </button>

          {renamingId === "toolbar-title" ? (
            <input
              autoFocus
              className="flex-1 min-w-0 bg-transparent border-b border-accent text-xs text-text-primary outline-none"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => {
                if (activeConversation) handleRenameSubmit(activeConversation);
                setRenamingId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && activeConversation) handleRenameSubmit(activeConversation);
                if (e.key === "Escape") {
                  setRenamingId(null);
                  setRenameValue("");
                }
              }}
            />
          ) : (
            <span
              className="flex-1 min-w-0 truncate text-xs font-medium text-text-primary cursor-pointer"
              onClick={() => {
                if (activeConversation) {
                  setRenamingId("toolbar-title");
                  setRenameValue(activeConversation.title);
                }
              }}
              title={activeConversation?.title || "New Chat"}
            >
              {activeConversation?.title || "New Chat"}
            </span>
          )}

          <ModelSelect
            value={state.selectedChatModel}
            models={state.models.text}
            onChange={(model) => dispatch({ type: "SET_SELECTED_CHAT_MODEL", model })}
          />

          <button
            className="text-text-muted hover:text-text-primary text-xs px-1"
            onClick={() => setMemoryPanelOpen(!memoryPanelOpen)}
            aria-label="Memory panel"
            title="Memory"
          >
            🧠
          </button>

          <div className="relative">
            <button
              className="text-text-muted hover:text-text-primary text-xs px-1"
              onClick={() => setForkMode(!forkMode)}
              aria-label="Toggle fork mode"
              title="Fork"
            >
              {forkMode ? "✓" : "⋯"}
            </button>
          </div>
        </div>

        {/* Messages + Settings */}
        <div
          className="flex-1 overflow-y-auto flex flex-col gap-2 min-h-0 px-3 py-2"
          onDrop={handleFileDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          {/* Model & Settings — kept for test parity */}
          <CollapsibleSection title="Model & Settings">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-1">
              <Field label="Model">
                <ModelSelect
                  value={state.selectedChatModel}
                  models={state.models.text}
                  onChange={(model) =>
                    dispatch({ type: "SET_SELECTED_CHAT_MODEL", model })
                  }
                />
              </Field>
              <Field label="Optional character_slug">
                <input
                  value={characterSlug}
                  onChange={(e) => setCharacterSlug(e.target.value)}
                  placeholder="alan-watts"
                  className="w-full bg-surface/50 border border-border/50 rounded-lg px-3 py-2 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all"
                />
              </Field>
            </div>

            <div className="mt-2 p-1">
              <ModelRefreshButton state={state} dispatch={dispatch} />
            </div>

            <div className="mt-4 p-1">
              <Field label="System prompt">
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={3}
                  className="w-full bg-surface/50 border border-border/50 rounded-lg px-3 py-2 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all min-h-[60px]"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 p-1">
              <Field label="Web search">
                <select
                  value={webSearch}
                  onChange={(e) => setWebSearch(e.target.value)}
                  className="w-full bg-surface/50 border border-border/50 rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all appearance-none"
                >
                  <option value="off">off</option>
                  <option value="on">on</option>
                  <option value="auto">auto</option>
                </select>
              </Field>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Venice parameters</label>
                <div className="flex flex-col gap-2 p-2 rounded-lg border border-border/50 bg-surface-elevated/40">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={webScraping}
                      onChange={(e) => setWebScraping(e.target.checked)}
                      className="w-3 h-3 rounded border-border/50 bg-surface/60 text-accent focus:ring-accent/50"
                    />
                    <span className="text-xs font-medium text-text-secondary group-hover:text-text-primary transition-colors">Web scraping</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={webCitations}
                      onChange={(e) => setWebCitations(e.target.checked)}
                      className="w-3 h-3 rounded border-border/50 bg-surface/60 text-accent focus:ring-accent/50"
                    />
                    <span className="text-xs font-medium text-text-secondary group-hover:text-text-primary transition-colors">Citations</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Response mode</label>
                <div className="flex flex-col gap-2 p-2 rounded-lg border border-border/50 bg-surface-elevated/40">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={includeVeniceSystemPrompt}
                      onChange={(e) => setIncludeVeniceSystemPrompt(e.target.checked)}
                      className="w-3 h-3 rounded border-border/50 bg-surface/60 text-accent focus:ring-accent/50"
                    />
                    <span className="text-xs font-medium text-text-secondary group-hover:text-text-primary transition-colors">Include Venice system prompt</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={stream}
                      onChange={(e) => setStream(e.target.checked)}
                      className="w-3 h-3 rounded border-border/50 bg-surface/60 text-accent focus:ring-accent/50"
                    />
                    <span className="text-xs font-medium text-text-secondary group-hover:text-text-primary transition-colors">Stream response</span>
                  </label>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 p-1">
              <Field label="Reasoning effort">
                <select
                  value={reasoningEffort}
                  onChange={(e) => setReasoningEffort(e.target.value)}
                  className="w-full bg-surface/50 border border-border/50 rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all appearance-none"
                >
                  <option value="">(model default)</option>
                  <option value="none">none</option>
                  <option value="minimal">minimal</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="xhigh">xhigh</option>
                  <option value="max">max</option>
                </select>
              </Field>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Reasoning / thinking</label>
                <div className="flex flex-col gap-2 p-2 rounded-lg border border-border/50 bg-surface-elevated/40">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={stripThinking}
                      onChange={(e) => setStripThinking(e.target.checked)}
                      className="w-3 h-3 rounded border-border/50 bg-surface/60 text-accent focus:ring-accent/50"
                    />
                    <span className="text-xs font-medium text-text-secondary group-hover:text-text-primary transition-colors">Strip &lt;think&gt; blocks</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={disableThinking}
                      onChange={(e) => setDisableThinking(e.target.checked)}
                      className="w-3 h-3 rounded border-border/50 bg-surface/60 text-accent focus:ring-accent/50"
                    />
                    <span className="text-xs font-medium text-text-secondary group-hover:text-text-primary transition-colors">Disable thinking</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">Grok / xAI</label>
                <div className="flex flex-col gap-2 p-2 rounded-lg border border-border/50 bg-surface-elevated/40">
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={enableXSearch}
                      onChange={(e) => setEnableXSearch(e.target.checked)}
                      className="w-3 h-3 rounded border-border/50 bg-surface/60 text-accent focus:ring-accent/50"
                    />
                    <span className="text-xs font-medium text-text-secondary group-hover:text-text-primary transition-colors">xAI web + X search</span>
                  </label>
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* Message list */}
          <div className="flex-1 space-y-2" aria-live="polite">
            {messages.map((m, idx) => (
              <div
                key={m.id || `${m.role}-${m.content?.slice(0, 8)}`}
                className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"} group`}
              >
                <div
                  className={`max-w-[90%] relative ${
                    m.role === "user"
                      ? "bg-accent/15 rounded-r-lg rounded-bl-lg px-3 py-2"
                      : "border-l-2 border-accent pl-3 pr-2 py-2"
                  }`}
                >
                  {/* Fork checkbox */}
                  {forkMode && m.role !== "system" && (
                    <input
                      type="checkbox"
                      checked={selectedMessageIds.has(m.id)}
                      onChange={() => toggleMessageSelection(m.id)}
                      className="absolute -left-5 top-1.5 w-3 h-3"
                      aria-label={`Select message ${idx + 1}`}
                    />
                  )}

                  {/* Message actions (hover) */}
                  <div className="absolute -top-4 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    {m.role === "assistant" && m.content && (
                      <button
                        type="button"
                        className="text-[10px] text-text-muted hover:text-accent"
                        onClick={() => handleSaveToMemory(m.content)}
                        title="Save to memory"
                        aria-label="Save to memory"
                      >
                        🔖
                      </button>
                    )}
                    {m.content && (
                      <button
                        type="button"
                        className="text-[10px] text-text-muted hover:text-accent"
                        onClick={() => copyText(m.content)}
                        title="Copy message"
                        aria-label="Copy message"
                      >
                        ⎘
                      </button>
                    )}
                  </div>

                  {/* Role label */}
                  <div className={`text-[10px] font-semibold tracking-wider uppercase mb-0.5 ${m.role === "user" ? "text-accent" : "text-text-muted"}`}>
                    {m.role}
                    {m.role === "assistant" && idx === messages.length - 1 && loading && (
                      <span className="ml-1 inline-flex gap-0.5">
                        <span className="w-1 h-1 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="w-1 h-1 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="w-1 h-1 bg-accent rounded-full animate-bounce"></span>
                      </span>
                    )}
                  </div>

                  {/* Imported context bridge */}
                  {m.importedFrom && (
                    <div className="text-[9px] text-warning mb-0.5">
                      &lt;imported_context from="{m.importedFrom}"&gt;
                    </div>
                  )}

                  {/* Content */}
                  <div className="text-xs leading-relaxed text-text-primary">
                    <Markdown text={m.content || (loading && idx === messages.length - 1 ? "" : "")} />
                  </div>
                </div>
              </div>
            ))}
            <div ref={endRef}></div>
          </div>
        </div>

        {/* Input zone */}
        <div className="flex-none border-t border-border/50 bg-bg/50">
          {/* Attachment tray */}
          <AttachmentTray
            attachments={attachments}
            onRemove={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
            disabled={loading}
          />

          {/* Attachment notices */}
          {attachmentNotices.length > 0 && (
            <div className="px-3 pb-1 space-y-0.5">
              {attachmentNotices.map((n, i) => (
                <div key={i} className="text-[10px] text-warning">{n}</div>
              ))}
            </div>
          )}

          {/* Fork actions */}
          {forkMode && (
            <div className="flex items-center gap-2 px-3 py-1 border-b border-border/30">
              <span className="text-[10px] text-text-secondary">
                {selectedMessageIds.size} selected
              </span>
              <button
                className="text-[10px] px-2 py-0.5 rounded bg-accent text-accent-foreground disabled:opacity-50"
                disabled={selectedMessageIds.size === 0}
                onClick={handleFork}
              >
                Fork
              </button>
              <button
                className="text-[10px] px-2 py-0.5 rounded bg-surface-elevated border border-border text-text-secondary"
                onClick={() => {
                  setForkMode(false);
                  setSelectedMessageIds(new Set());
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Command palette */}
          {commandPaletteOpen && (
            <div className="px-3 py-1 border-b border-border/30 flex gap-2 items-center">
              <span className="text-[10px] text-text-muted">/</span>
              {["attach", "image", "search"].map((cmd) => (
                <button
                  key={cmd}
                  type="button"
                  className="text-[10px] px-1.5 py-0.5 rounded bg-surface-elevated border border-border text-text-secondary hover:border-accent"
                  onClick={() => handleCommand(cmd)}
                >
                  {cmd}
                </button>
              ))}
              <button
                type="button"
                className="text-[10px] text-text-muted hover:text-text-primary ml-auto"
                onClick={() => setCommandPaletteOpen(false)}
              >
                Esc
              </button>
            </div>
          )}

          <StatusBlock error={error} />

          <div className="flex items-end gap-2 px-3 py-2">
            <div className="flex gap-1">
              <button
                type="button"
                className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-elevated"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                title="Attach file"
                aria-label="Attach file"
              >
                📎
              </button>
              <button
                type="button"
                className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-elevated"
                onClick={() => imageInputRef.current?.click()}
                disabled={loading || !supportsVision}
                title={supportsVision ? "Attach image" : "Vision not supported by this model"}
                aria-label="Attach image"
              >
                🖼
              </button>
              <button
                type="button"
                className="h-6 w-6 flex items-center justify-center rounded text-text-muted hover:text-text-primary hover:bg-surface-elevated"
                onClick={handleAttachUrl}
                disabled={loading}
                title="Attach URL"
                aria-label="Attach URL"
              >
                🔗
              </button>
            </div>

            <textarea
              ref={textareaRef}
              aria-label="User prompt"
              value={userPrompt}
              onChange={(e) => {
                setUserPrompt(e.target.value);
                if (promptTouched && e.target.value.trim()) setPromptTouched(false);
                // Auto-expand
                const el = e.target;
                el.style.height = "auto";
                const maxH = window.innerHeight * 0.3;
                el.style.height = `${Math.min(el.scrollHeight, maxH)}px`;
              }}
              placeholder="Ask Venice something… (type / for commands)"
              aria-invalid={promptTouched && !userPrompt.trim()}
              aria-describedby="chat-prompt-error"
              onKeyDown={handleKeyDown}
              rows={1}
              className="flex-1 min-w-0 bg-surface/50 border border-border/50 rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all resize-none overflow-y-auto"
              style={{ height: "auto", maxHeight: "30vh" }}
            />

            <div className="flex flex-col gap-1">
              <button
                className="h-6 w-6 flex items-center justify-center rounded bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
                onClick={send}
                disabled={loading}
                aria-label="Send"
                title="Send"
              >
                →
              </button>
            </div>
          </div>

          {promptTouched && !loading && !userPrompt.trim() && (
            <div id="chat-prompt-error" className="px-3 pb-2 text-xs text-danger" role="alert">
              Please enter a prompt before sending.
            </div>
          )}

          <div className="flex gap-2 px-3 pb-2">
            <button className="text-[10px] text-text-muted hover:text-text-secondary" onClick={cancel} disabled={!loading}>
              Cancel
            </button>
            <button className="text-[10px] text-text-muted hover:text-text-secondary" onClick={clear}>
              Clear
            </button>
            <button
              className="text-[10px] text-text-muted hover:text-text-secondary"
              onClick={() => copyText(lastAssistant?.content || "")}
              disabled={!lastAssistant?.content}
            >
              Copy response
            </button>
            <button
              className="text-[10px] text-text-muted hover:text-text-secondary"
              onClick={() => setShowImportPicker(true)}
            >
              Import
            </button>
          </div>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) addFileAttachments(files);
          e.target.value = "";
        }}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length) addFileAttachments(files);
          e.target.value = "";
        }}
      />

      {/* Memory panel */}
      {memoryPanelOpen && (
        <div className="absolute right-0 top-0 bottom-0 w-64 bg-bg border-l border-border/50 shadow-lg z-10 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
            <span className="text-xs font-medium text-text-primary">Memory</span>
            <button
              className="text-text-muted hover:text-text-primary text-xs"
              onClick={() => setMemoryPanelOpen(false)}
              aria-label="Close memory panel"
            >
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            <div className="text-[10px] text-text-muted italic">
              Memories are injected into prompts automatically.
            </div>
            <button
              className="text-[10px] px-2 py-1 rounded bg-accent text-accent-foreground"
              onClick={loadMemories}
            >
              Refresh
            </button>
            {memories.length === 0 && (
              <div className="text-[10px] text-text-muted">No memories yet.</div>
            )}
            {memories.map((m) => (
              <div key={m.id} className="rounded border border-border/50 bg-surface-elevated/40 p-2">
                <div className="text-[10px] text-text-primary leading-snug">{m.content}</div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[9px] text-text-muted">
                    {m.tags.join(", ") || "no tags"}
                  </span>
                  <button
                    className="text-[9px] text-danger hover:text-danger/80"
                    onClick={() => handleDeleteMemory(m.id)}
                    aria-label="Delete memory"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Import picker modal */}
      {showImportPicker && (
        <div className="absolute inset-0 bg-overlay z-20 flex items-center justify-center">
          <div className="bg-bg border border-border/50 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
              <span className="text-xs font-medium text-text-primary">Import messages</span>
              <button
                className="text-text-muted hover:text-text-primary text-xs"
                onClick={() => {
                  setShowImportPicker(false);
                  setImportConversationId(null);
                  _setImportSelectedIds(new Set());
                  setImportStage("select-conv");
                }}
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {importStage === "select-conv" ? (
                <>
                  <div className="text-[10px] text-text-muted">Select a conversation:</div>
                  {conversations
                    .filter((c) => c.id !== activeId)
                    .map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between rounded border border-border/50 px-2 py-1.5 cursor-pointer hover:bg-surface-elevated/40"
                        onClick={() => {
                          setImportConversationId(c.id);
                          _setImportSelectedIds(new Set(c.messages.map((m) => m.id)));
                          setImportStage("select-messages");
                        }}
                      >
                        <span className="text-xs text-text-primary truncate">{c.title}</span>
                        <span className="text-[10px] text-text-muted">{c.messages.length} msgs</span>
                      </div>
                    ))}
                  {conversations.filter((c) => c.id !== activeId).length === 0 && (
                    <div className="text-[10px] text-text-muted">No other conversations.</div>
                  )}
                </>
              ) : (
                <>
                  <div className="text-[10px] text-text-muted">Select messages to import:</div>
                  {conversations
                    .find((c) => c.id === importConversationId)
                    ?.messages.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-start gap-2 rounded border border-border/50 px-2 py-1.5 cursor-pointer hover:bg-surface-elevated/40"
                      >
                        <input
                          type="checkbox"
                          checked={_importSelectedIds.has(m.id)}
                          onChange={() => {
                            _setImportSelectedIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(m.id)) next.delete(m.id);
                              else next.add(m.id);
                              return next;
                            });
                          }}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-semibold text-text-muted uppercase">{m.role}</div>
                          <div className="text-[10px] text-text-primary truncate">{m.content}</div>
                        </div>
                      </label>
                    ))}
                </>
              )}
            </div>
            {importStage === "select-messages" && (
              <div className="flex justify-end gap-2 px-4 py-2 border-t border-border/50">
                <button
                  className="text-[10px] px-2 py-1 rounded border border-border text-text-secondary"
                  onClick={() => {
                    setImportStage("select-conv");
                    setImportConversationId(null);
                    _setImportSelectedIds(new Set());
                  }}
                >
                  Back
                </button>
                <button
                  className="text-[10px] px-2 py-1 rounded bg-accent text-accent-foreground disabled:opacity-50"
                  disabled={_importSelectedIds.size === 0}
                  onClick={handleImportMessages}
                >
                  Import {_importSelectedIds.size}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmModal
          open={!!deleteTarget}
          message="Delete conversation"
          detail={`Delete "${deleteTarget.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={() => handleDeleteConversation(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}
