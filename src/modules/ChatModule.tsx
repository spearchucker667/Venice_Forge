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
import { StatusBlock } from "../components/StatusBlock";
import { CollapsibleSection } from "../components/CollapsibleSection";
import { ConfirmModal } from "../components/ConfirmModal";
import { AttachmentTray } from "../components/AttachmentTray";
import { PaperclipIcon, ImageIcon, LinkIcon, SendIcon, XIcon } from "../components/icons";
import { VeniceLogo } from "../components/ui/logo";
import { ModuleProps } from "../types/app";
import type { Conversation, ConversationMessage } from "../types/conversation";
import { MemoryManagerModal } from "../components/MemoryManagerModal";
import type { Attachment } from "../types/attachment";
import StorageService from "../services/storageService";
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
  type MemoryBlock,
} from "../services/memoryService";

interface ChatUiMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  reasoning_content?: string;
  timestamp?: number;
  importedFrom?: string;
}

type MessageUpdate = ChatUiMessage[] | ((prev: ChatUiMessage[]) => ChatUiMessage[]);

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

function ReasoningAccordion({ content }: { content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2 mt-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-primary transition-colors mb-1"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
          className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`}>
          <path d="M3.5 2L6.5 5L3.5 8" />
        </svg>
        Thinking
      </button>
      {open && (
        <div className="bg-surface-elevated border border-border/50 rounded-lg px-3 py-2 text-[12px] text-text-secondary leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">
          {content}
        </div>
      )}
    </div>
  );
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
  const [urlPopoverOpen, setUrlPopoverOpen] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState("");
  const urlPopoverRef = useRef<HTMLDivElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const sendInFlightRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatUiMessage[]>([]);
  /** Snapshot of messages captured at the start of each send(), used by cancel() to roll back. */
  const preSendMessagesRef = useRef<ChatUiMessage[]>([]);

  // New state for P2/P3 features
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentNotices, setAttachmentNotices] = useState<string[]>([]);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [forkMode, setForkMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());
  const [isAgentMode, setIsAgentMode] = useState(true);
  const [showImportPicker, setShowImportPicker] = useState(false);
  const [_importSelectedIds, _setImportSelectedIds] = useState<Set<string>>(new Set());
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const [importStage, setImportStage] = useState<"select-conv" | "select-messages">("select-conv");
  const [importConversationId, setImportConversationId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const conversationsRef = useRef(state.conversations);
  conversationsRef.current = state.conversations;
  const selectedModelRef = useRef(state.selectedChatModel);
  selectedModelRef.current = state.selectedChatModel;
  const systemPromptRef = useRef(systemPrompt);
  systemPromptRef.current = systemPrompt;
  const commitMessages = useCallback((update: MessageUpdate) => {
    setMessages((prev) => {
      const current = messagesRef.current.length || prev.length ? messagesRef.current : prev;
      const next = typeof update === "function" ? update(current) : update;
      messagesRef.current = next;
      return next;
    });
  }, []);

  // Sync local messages when active conversation changes
  useEffect(() => {
    if (activeConversation) {
      commitMessages(
        activeConversation.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          reasoning_content: m.reasoning_content,
          timestamp: m.timestamp,
        }))
      );
      setSystemPrompt(activeConversation.systemPrompt || state.settings.defaultSystemPrompt);
    } else {
      commitMessages([
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
  }, [activeConversation, activeId, commitMessages, state.settings.defaultSystemPrompt]);

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
    const ok = await saveConversation(conv);
    if (!ok) throw new Error("Failed to save new conversation.");
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
          reasoning_content: m.reasoning_content,
          timestamp: m.timestamp ?? Date.now(),
        })),
        updatedAt: Date.now(),
        model: selectedModelRef.current,
        systemPrompt: systemPromptRef.current,
        title: conv.title === "New Chat" ? deriveTitle(newMessages) : conv.title,
      };
      const ok = await saveConversation(updated);
      if (!ok) throw new Error("Failed to persist conversation.");
      const refreshed = conversationsRef.current.map((c) => (c.id === updated.id ? updated : c));
      dispatch({ type: "SET_CONVERSATIONS", items: refreshed });
    },
    [dispatch]
  );

  async function send() {
    const trimmedPrompt = userPrompt.trim();
    const hasAttachments = attachments.length > 0;
    if ((!trimmedPrompt && !hasAttachments) || loading || sendInFlightRef.current) {
      if (!trimmedPrompt && !hasAttachments) setPromptTouched(true);
      return;
    }
    setPromptTouched(false);
    if (state.usingFallbackModels) {
      setError("Fallback models are active. Please refresh the model catalog before sending requests.");
      return;
    }
    setError("");
    setAttachmentNotices([]);
    sendInFlightRef.current = true;

    const effectivePrompt = trimmedPrompt || "Analyze the attached content.";

    // Assemble attachments
    const attachCtx = assembleAttachmentContext(attachments);
    setAttachmentNotices(attachCtx.notices);

    // Select memories for injection
    let memoryBlock: MemoryBlock = { text: "", used: 0, truncated: false };
    try {
      memoryBlock = await selectMemoriesForInjection(activeConversation?.id);
    } catch {
      dispatch({
        type: "ADD_TOAST",
        toast: { id: crypto.randomUUID(), message: "Memory injection unavailable. Continuing without it.", type: "warn" },
      });
    }

    // Build the full text for safety guard (user prompt + attachment text + memory)
    const assembledText = [memoryBlock.text, attachCtx.text, effectivePrompt]
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
      sendInFlightRef.current = false;
      return;
    }

    abortRef.current?.abort();
    setLoading(true);
    const runId = ++runIdRef.current;

    // Snapshot prompt and attachments so they can be restored if the request fails
    const snapshotPrompt = trimmedPrompt;
    const snapshotAttachments = [...attachments];

    let conv: Conversation;
    try {
      conv = await ensureActiveConversation();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to prepare conversation.";
      setError(message);
      setLoading(false);
      sendInFlightRef.current = false;
      return;
    }

    const supportsVision = modelSupportsVision(state.selectedChatModel);
    if (attachCtx.images.length > 0 && !supportsVision) {
      dispatch({
        type: "ADD_TOAST",
        toast: {
          id: crypto.randomUUID(),
          message: "This model does not support vision. Images were removed from your message.",
          type: "warn",
          duration: 6000,
        },
      });
    }
    const userContent = buildMessageContent(effectivePrompt, attachCtx.images, supportsVision);
    const userMessage: ChatUiMessage = { id: crypto.randomUUID(), role: "user", content: effectivePrompt, timestamp: Date.now() };
    const assistantMsgId = crypto.randomUUID();

    // Exclude the welcome placeholder from history and persistence
    const baseMessages = messagesRef.current.filter((m) => m.id !== "welcome");
    preSendMessagesRef.current = baseMessages;

    const history: Array<{ role: "system" | "user" | "assistant"; content: ChatMessageContent }> = [
      { role: "system", content: systemPrompt || DEFAULT_SYSTEM_PROMPT },
      ...baseMessages.filter((m) => ["user", "assistant"].includes(m.role)).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content as ChatMessageContent,
      })),
      { role: "user", content: userContent },
    ];

    commitMessages((prev) => [
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
        let accReasoning = "";
        await veniceStreamChat(payload, {
          signal: abortRef.current.signal,
          dispatch,
          onDelta: (chunk: { content: string; reasoning: string }) => {
            acc += chunk.content;
            accReasoning += chunk.reasoning;
            commitMessages((prev) => {
              const next = [...prev];
              const lastIdx = next.length - 1;
              if (lastIdx >= 0) {
                next[lastIdx] = { ...next[lastIdx], role: "assistant", content: acc, reasoning_content: accReasoning };
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
          { id: assistantMsgId, role: "assistant" as const, content: acc, reasoning_content: accReasoning },
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
        const reasoning =
          data.choices[0]?.message?.reasoning_content ||
          "";
        if (runIdRef.current !== runId) return;
        // Set and persist final messages without side effects in a state updater
        const finalMessages: ChatUiMessage[] = [
          ...baseMessages,
          userMessage,
          { id: assistantMsgId, role: "assistant" as const, content, reasoning_content: reasoning },
        ];
        commitMessages(finalMessages);
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
        commitMessages(rollback);
        await persistMessages(conv, baseMessages);
      }
    } finally {
      if (runIdRef.current === runId) {
        setLoading(false);
      }
      sendInFlightRef.current = false;
    }
  }

  function cancel() {
    const wasInFlight = sendInFlightRef.current;
    runIdRef.current++;
    abortRef.current?.abort();
    sendInFlightRef.current = false;
    setLoading(false);
    // Roll back the optimistic user+assistant messages that send() already committed
    if (wasInFlight) {
      const rollback = preSendMessagesRef.current;
      preSendMessagesRef.current = [];
      const restored = rollback.length > 0
        ? rollback
        : [{ id: "welcome", role: "assistant" as const, content: "Ready. Send a prompt to call Venice /chat/completions." }];
      commitMessages(restored);
    }
  }

  async function clear() {
    cancel();
    commitMessages([]);
    setError("");
    try {
      if (activeConversation) {
        const updated: Conversation = { ...activeConversation, messages: [], updatedAt: Date.now() };
        await saveConversation(updated);
        const refreshed = state.conversations.map((c) => (c.id === updated.id ? updated : c));
        dispatch({ type: "SET_CONVERSATIONS", items: refreshed });
      }
      dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Conversation cleared.", type: "info" } });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to clear conversation";
      dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message, type: "error" } });
    }
  }

  async function handleNewChat() { // eslint-disable-line @typescript-eslint/no-unused-vars
    cancel();
    const conv = createConversation(state.selectedChatModel, systemPrompt || DEFAULT_SYSTEM_PROMPT);
    conv.model = state.selectedChatModel;
    try {
      await saveConversation(conv);
      const updated = [conv, ...state.conversations];
      dispatch({ type: "SET_CONVERSATIONS", items: updated });
      dispatch({ type: "SET_ACTIVE_CONVERSATION", id: conv.id });
      commitMessages([
        {
          id: "welcome",
          role: "assistant",
          content: "Ready. Send a prompt to call Venice /chat/completions.",
        },
      ]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create conversation";
      dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message, type: "error" } });
    }
  }

  async function handleSwitchConversation(id: string) { // eslint-disable-line @typescript-eslint/no-unused-vars
    cancel();
    if (activeConversation) {
      const messagesToPersist = messages.filter((m) => m.id !== "welcome");
      if (messagesToPersist.length > 0) {
        try {
          await persistMessages(activeConversation, messagesToPersist);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Failed to save conversation";
          dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message, type: "error" } });
        }
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
    const nextMessages = [...messagesRef.current, ...imported];
    commitMessages(nextMessages);
    try {
      await persistMessages(activeConversation, nextMessages);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to import messages";
      dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message, type: "error" } });
    } finally {
      setShowImportPicker(false);
      setImportConversationId(null);
      _setImportSelectedIds(new Set());
      setImportStage("select-conv");
    }
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

  async function persistAttachment(att: Attachment) {
    try {
      await StorageService.saveItem("files", {
        id: att.id,
        name: att.name,
        type: att.type,
        content: att.content,
        size: att.size,
        source: "chat-attachment",
      });
    } catch {
      // Silently ignore storage errors for file persistence
    }
  }

  async function addFileAttachments(files: File[]) {
    const newAttachments: Attachment[] = [];
    for (const file of files) {
      if (attachments.length + newAttachments.length >= MAX_ATTACHMENTS_PER_MESSAGE) break;
      try {
        const att = await processFileAttachment(file);
        newAttachments.push(att);
        await persistAttachment(att);
      } catch (err) {
        setAttachmentNotices((prev) => [...prev, err instanceof Error ? err.message : String(err)]);
      }
    }
    setAttachments((prev) => [...prev, ...newAttachments]);
  }

  function handleAttachUrl() {
    setUrlPopoverOpen(true);
    setUrlInputValue("");
    setTimeout(() => {
      const input = urlPopoverRef.current?.querySelector("input");
      if (input) input.focus();
    }, 50);
  }

  async function handleUrlSubmit() {
    const url = urlInputValue.trim();
    if (!url) {
      setUrlPopoverOpen(false);
      return;
    }
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("URL must use http or https protocol.");
      }
    } catch {
      dispatch({
        type: "ADD_TOAST",
        toast: {
          id: crypto.randomUUID(),
          message: "Invalid URL. Please enter a valid http or https URL.",
          type: "error",
          duration: 4000,
        },
      });
      return;
    }
    setUrlPopoverOpen(false);
    setUrlInputValue("");
    try {
      const att = await scrapeUrlAttachment(url);
      setAttachments((prev) => [...prev, att].slice(0, MAX_ATTACHMENTS_PER_MESSAGE));
      await persistAttachment(att);
      dispatch({
        type: "ADD_TOAST",
        toast: {
          id: crypto.randomUUID(),
          message: `URL attached: ${url}`,
          type: "success",
          duration: 3000,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAttachmentNotices((prev) => [...prev, msg]);
      dispatch({
        type: "ADD_TOAST",
        toast: {
          id: crypto.randomUUID(),
          message: `Failed to attach URL: ${msg}`,
          type: "error",
          duration: 5000,
        },
      });
    }
  }

  useEffect(() => {
    if (!urlPopoverOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (urlPopoverRef.current && !urlPopoverRef.current.contains(e.target as Node)) {
        setUrlPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [urlPopoverOpen]);

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

  const lastAssistant = React.useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant" && m.content),
    [messages]
  );

  const supportsVision = modelSupportsVision(state.selectedChatModel);

  return (
    <section className="flex h-full bg-bg relative">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Toolbar */}
        <div className="flex-none h-8 flex items-center gap-2 px-2 border-b border-border/50 bg-bg/50">

          <div className="flex bg-surface-elevated/50 rounded-lg p-0.5 ml-2 border border-border/40">
            <button
              className={`text-xs px-3 py-1 rounded-md transition-colors ${isAgentMode ? "bg-accent/20 text-accent font-medium border border-accent/30 shadow-sm" : "text-text-muted hover:text-text-primary border border-transparent"}`}
              onClick={() => setIsAgentMode(true)}
              title="Agentic Chat"
            >
              Agent
            </button>
            <button
              className={`text-xs px-3 py-1 rounded-md transition-colors ${!isAgentMode ? "bg-accent/20 text-accent font-medium border border-accent/30 shadow-sm" : "text-text-muted hover:text-text-primary border border-transparent"}`}
              onClick={() => setIsAgentMode(false)}
              title="Classic Chat"
            >
              Classic
            </button>
          </div>

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
          className="flex-1 overflow-y-auto flex flex-col min-h-0"
          onDrop={handleFileDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <div className="flex-1 flex flex-col w-full max-w-4xl mx-auto px-4 py-6 gap-6">
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
          <div className="flex-1 space-y-6" aria-live="polite">
            {(messages.length === 0 || (messages.length === 1 && messages[0].id === "welcome")) ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6 gap-6 pt-16">
                <div className="flex flex-col items-center gap-3">
                  <VeniceLogo size={32} className="opacity-80" />
                  <div className="text-[20px] font-semibold text-text-primary">How can I help today?</div>
                  <p className="text-[14px] text-text-muted max-w-sm">
                    Start a conversation. Streaming, web search, and citations are all built in.
                  </p>
                </div>
                <div className="w-full max-w-md flex flex-col gap-2 mt-4">
                  <div className="text-[12px] uppercase tracking-[0.08em] text-text-muted font-medium text-left">Try one of these</div>
                  <div className="flex flex-col gap-1.5">
                    {[
                      'Explain how RSA encryption works using a metaphor a 10-year-old could grasp.',
                      'Draft a polite but firm email asking my landlord to fix the heating.',
                      'Compare REST and GraphQL — when does each shine?'
                    ].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => {
                          setUserPrompt(p);
                          setTimeout(() => {
                            if (textareaRef.current) {
                              textareaRef.current.focus();
                            }
                          }, 10);
                        }}
                        className="text-left px-3 py-2.5 rounded-lg border border-border/50 bg-surface/30 hover:border-border hover:bg-surface-elevated transition-all text-[14px] text-text-secondary"
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((m, idx) => (
                <div
                  key={m.id || `${m.role}-${m.content?.slice(0, 8)}`}
                  className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"} group`}
                >
                  <div
                    className={`relative w-full ${
                      m.role === "user"
                        ? "bg-surface-elevated rounded-xl px-4 py-3"
                        : "pl-2 pr-2 py-2"
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
                      {m.reasoning_content && <ReasoningAccordion content={m.reasoning_content} />}
                      <Markdown text={m.content || ""} />
                    </div>
                  </div>
                </div>
              ))
            )}
            <div ref={endRef}></div>
          </div>
          </div>
        </div>

        {/* Input zone - Centered Hero Composer */}
        <div className="flex-none bg-gradient-to-t from-bg via-bg to-transparent pt-4 pb-6 px-4">
          <div className="w-full max-w-3xl mx-auto bg-surface-elevated border border-border rounded-2xl shadow-lg flex flex-col overflow-hidden">
          {/* Attachment tray */}
          <AttachmentTray
            attachments={attachments}
            onRemove={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
            onReorder={setAttachments}
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
            <div className="flex gap-1 relative">
              <button
                type="button"
                className="h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                title="Attach file"
                aria-label="Attach file"
              >
                <PaperclipIcon size={18} />
              </button>
              <button
                type="button"
                className="h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={() => imageInputRef.current?.click()}
                disabled={loading || !supportsVision}
                title={supportsVision ? "Attach image" : "Vision not supported by this model"}
                aria-label="Attach image"
              >
                <ImageIcon size={18} />
              </button>
              <button
                type="button"
                className="h-7 w-7 flex items-center justify-center rounded-md text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                onClick={handleAttachUrl}
                disabled={loading}
                title="Attach URL"
                aria-label="Attach URL"
              >
                <LinkIcon size={18} />
              </button>

              {/* URL attachment popover */}
              {urlPopoverOpen && (
                <div
                  ref={urlPopoverRef}
                  className="absolute bottom-full left-0 mb-2 w-72 rounded-xl border border-border/40 bg-surface p-3 shadow-xl z-20"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-text-primary">Attach URL</span>
                    <button
                      type="button"
                      className="text-text-muted hover:text-text-primary"
                      onClick={() => setUrlPopoverOpen(false)}
                      aria-label="Close"
                    >
                      <XIcon size={14} />
                    </button>
                  </div>
                  <input
                    type="url"
                    value={urlInputValue}
                    onChange={(e) => setUrlInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleUrlSubmit();
                      if (e.key === "Escape") setUrlPopoverOpen(false);
                    }}
                    placeholder="https://example.com/article"
                    className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                    autoFocus
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-lg px-3 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
                      onClick={() => setUrlPopoverOpen(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="rounded-lg px-3 py-1.5 text-xs font-medium bg-accent text-accent-foreground hover:bg-accent-hover transition-colors"
                      onClick={handleUrlSubmit}
                    >
                      Attach
                    </button>
                  </div>
                </div>
              )}
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
              className="flex-1 min-w-0 bg-surface border border-border rounded-lg px-3 py-1.5 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all resize-none overflow-y-auto"
              style={{ height: "auto", maxHeight: "30vh" }}
            />

            <div className="flex flex-col gap-1">
              <button
                className="h-7 w-7 flex items-center justify-center rounded-md bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-50 transition-colors"
                onClick={send}
                disabled={loading}
                aria-disabled={loading}
                aria-label="Send"
                title="Send"
              >
                <SendIcon size={16} />
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

      <MemoryManagerModal
        open={memoryPanelOpen}
        onClose={() => setMemoryPanelOpen(false)}
      />

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
                  {(() => {
                    const otherConversations = conversations.filter((c) => c.id !== activeId);
                    return (
                      <>
                        {otherConversations.map((c) => (
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
                        {otherConversations.length === 0 && (
                          <div className="text-[10px] text-text-muted">No other conversations.</div>
                        )}
                      </>
                    );
                  })()}
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
          onConfirm={async () => {
            try {
              await handleDeleteConversation(deleteTarget);
              setDeleteTarget(null);
            } catch (err: unknown) {
              setError(err instanceof Error ? err.message : "Delete failed");
              setDeleteTarget(null);
            }
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}
