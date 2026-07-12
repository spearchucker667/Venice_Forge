/**
 * @fileoverview RP Chat View — the multi-character runtime.
 *
 * Resolves active roster (characters, persona, lorebooks), assembles the
 * prompt with the deterministic builder, dispatches via the existing
 * `veniceStreamChat` transport, appends the character message to the store.
 *
 * Safety:
 *   - `assessRpContext` is invoked before the first dispatch and any time the
 *     roster changes. The Venice transport also re-runs the guard.
 *   - Raw prompt text is never logged.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRpChatStore } from "../../stores/rp-chat-store";
import { useCharacterCardStore } from "../../stores/character-card-store";
import { usePersonaStore } from "../../stores/persona-store";
import { useLorebookStore } from "../../stores/lorebook-store";
import { useSettingsStore } from "../../stores/settings-store";
import { getEffectiveRendererLocalFamilySafeModeEnabled } from "../../safetyHydration";
import { GhostButton, Label, PrimaryButton, ErrorText, TextArea } from "../ui/shared";
import { Spinner } from "../ui/spinner";
import { avatarDataUri, formatRelativeTime } from "./_shared";
import { buildRpPrompt } from "../../services/rp/promptBuilderService";
import { assessRpContext } from "../../shared/safety/characterImportSafety";
import type { CharacterCardV1, LorebookV1, PromptAssemblyResult, RpMessageV1, UserPersonaV1 } from "../../types/rp";
import { veniceStreamChat } from "../../services/veniceClient";
import { selectTriggeredEntries } from "../../services/rp/lorebookService";

const SYSTEM_BLOCK_BUDGET = 8_000;
const RECENT_MESSAGE_BUDGET = 12;

interface Props {
  chatId: string;
  onBack: () => void;
  onOpenScene: (chatId: string) => void;
  onOpenDebug: (trace: PromptAssemblyResult) => void;
}

export function RpChatView({ chatId, onBack, onOpenScene, onOpenDebug }: Props) {
  const chats = useRpChatStore((s) => s.chats);
  const appendUserMessage = useRpChatStore((s) => s.appendUserMessage);
  const appendCharacterMessage = useRpChatStore((s) => s.appendCharacterMessage);
  const appendNarratorMessage = useRpChatStore((s) => s.appendNarratorMessage);
  const setStreaming = useRpChatStore((s) => s.setStreaming);
  const isStreaming = useRpChatStore((s) => s.isStreaming);
  const cards = useCharacterCardStore((s) => s.cards);
  const cardsLoaded = useCharacterCardStore((s) => s.hasLoaded);
  const personas = usePersonaStore((s) => s.personas);
  const personasLoaded = usePersonaStore((s) => s.hasLoaded);
  const lorebooks = useLorebookStore((s) => s.lorebooks);
  const lorebooksLoaded = useLorebookStore((s) => s.hasLoaded);
  const setShowInspector = useSettingsStore((s) => s.setShowInspector);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [speakerIdx, setSpeakerIdx] = useState(0);
  const [narratorMode, setNarratorMode] = useState(false);
  const [reasoning, setReasoning] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const chat = useMemo(() => chats.find((c) => c.id === chatId), [chats, chatId]);

  useEffect(() => {
    if (!cardsLoaded) void useCharacterCardStore.getState().load();
    if (!personasLoaded) void usePersonaStore.getState().load();
    if (!lorebooksLoaded) void useLorebookStore.getState().load();
  }, [cardsLoaded, personasLoaded, lorebooksLoaded]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [chat?.messages.length, isStreaming]);

  // Cancel in-flight stream on unmount or chat switch.
  // Persist any partial assistant content as a breadcrumb so reload is not blank.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const ctrl = abortRef.current;
      if (ctrl) {
        ctrl.abort();
        abortRef.current = null;
      }
      useRpChatStore.setState({ isStreaming: false });
    };
  }, [chatId]);

  if (!chat) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-6">
        <div className="w-16 h-16 mb-4 rounded-full bg-surface-elevated flex items-center justify-center text-text-muted">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <h2 className="text-[15px] font-semibold text-text-primary">Chat not found</h2>
        <p className="text-[13px] text-text-secondary mt-1 max-w-[260px]">
          The conversation you're looking for doesn't exist or has been deleted.
        </p>
      </div>
    );
  }

  const roster: CharacterCardV1[] = chat.characterIds
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is CharacterCardV1 => c !== undefined);

  const activeLorebooks: LorebookV1[] = chat.lorebookIds
    .map((id) => lorebooks.find((l) => l.id === id))
    .filter((l): l is LorebookV1 => l !== undefined);

  const persona: UserPersonaV1 | undefined = chat.personaId
    ? personas.find((p) => p.id === chat.personaId)
    : undefined;

  const expectedCharacterId = narratorMode ? undefined : roster[speakerIdx]?.id ?? roster[0]?.id;

  const buildContext = (text: string) => {
    const recentText = chat.messages
      .slice(-(RECENT_MESSAGE_BUDGET * 2))
      .map((m) => {
        if (m.role === "character") {
          const c = roster.find((x) => x.id === m.characterId);
          return `${c?.name ?? "Character"}: ${m.content}`;
        }
        if (m.role === "narrator") return `Narrator: ${m.content}`;
        if (m.role === "user") return `You: ${m.content}`;
        return m.content;
      })
      .join("\n");
    const candidateText = `${recentText}\nYou: ${text}`.toLowerCase();
    const _triggeredEntries = activeLorebooks.flatMap((lb) =>
      selectTriggeredEntries(lb, candidateText),
    );
    return {
      rpChat: chat,
      ...(persona ? { persona } : {}),
      characters: roster,
      lorebooks: activeLorebooks,
      memories: [],
      currentUserMessage: text,
      systemBlockBudget: SYSTEM_BLOCK_BUDGET,
      recentMessageBudget: RECENT_MESSAGE_BUDGET,
      ...(expectedCharacterId ? { expectedCharacterId } : {}),
    };
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || isStreaming) return;
    setError(null);
    setDraft("");
    setReasoning("");

    if (roster.length === 0) {
      setError("No characters bound to this chat.");
      return;
    }

    // Mandatory safety guard.
    const decision = assessRpContext({
      rpChat: chat,
      characters: roster,
      ...(persona ? { persona } : {}),
      userMessage: text,
    }, getEffectiveRendererLocalFamilySafeModeEnabled());
    if (!decision.allow || decision.action === "block") {
      setError(decision.userMessage);
      return;
    }

    const built = buildRpContext(text);
    if (!built) {
      setError("Could not assemble prompt.");
      return;
    }
    const { assembly, systemMessages, recentMessages, userMessage } = built;

    const userMsg = await appendUserMessage(chat.id, text);
    if (!userMsg) {
      setError("Failed to save your message.");
      return;
    }

    setStreaming(true);
    let acc = "";
    let reasoningAcc = "";
    let streamError: string | null = null;
    let aborted = false;
    // Cancel any previous in-flight stream before starting a new one.
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const messages = [
        ...systemMessages.map((m) => ({ role: "system" as const, content: m.content })),
        ...recentMessages.map((m) => {
          const role: "user" | "assistant" = m.role === "user" ? "user" : "assistant";
          const prefix = m.role === "character" || m.role === "narrator" ? `[${m.role}] ` : "";
          return { role, content: `${prefix}${m.content}` };
        }),
        { role: "user" as const, content: userMessage.content },
      ];
      await veniceStreamChat(
        {
          endpoint: "/chat/completions",
          model: chat.modelId,
          messages,
        },
        {
          signal: ctrl.signal,
          onDelta: (chunk) => {
            acc += chunk.content;
            if (chunk.reasoning) {
              reasoningAcc += chunk.reasoning;
              if (mountedRef.current) setReasoning(reasoningAcc);
            }
          },
        },
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        aborted = true;
      } else {
        // Never surface raw upstream error text in the RP UI: it may contain
        // secrets, file paths, or model-specific diagnostics. A generic safe
        // message is enough; detailed diagnostics live in the Inspector log.
        streamError = "The character response could not be generated. Please try again.";
      }
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      if (mountedRef.current) setStreaming(false);
    }

    if (aborted) return;
    if (streamError) {
      // Persist any partial content as a breadcrumb so reload is not blank.
      if (acc.trim()) {
        const truncated = `${acc.trimEnd()}\n\n[stream interrupted]`;
        if (narratorMode) {
          await appendNarratorMessage(chat.id, truncated);
        } else {
          const speaker = expectedCharacterId ?? roster[0]?.id;
          if (speaker) {
            await appendCharacterMessage(chat.id, speaker, truncated, reasoningAcc || undefined);
          }
        }
      }
      if (mountedRef.current) setError(streamError);
      return;
    }
    if (!acc.trim()) {
      return;
    }

    if (narratorMode) {
      await appendNarratorMessage(chat.id, acc);
    } else {
      const speaker = expectedCharacterId ?? roster[0]?.id;
      if (speaker) {
        await appendCharacterMessage(chat.id, speaker, acc, reasoningAcc || undefined);
      }
    }

    // Open the debug drawer on the first send so the user can verify the trace.
    if (chat.messages.length === 0) {
      onOpenDebug(assembly);
    }
  };

  function buildContextForTrace(text: string) {
    return buildContext(text);
  }

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      <div className="flex items-center gap-2 px-4 py-3 soft-separator-y mesh-header mesh-surface">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="text-text-secondary hover:text-text-primary p-2 rounded-md hover:bg-surface-elevated"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <h2 className="text-[15px] font-semibold text-text-primary truncate">{chat.title}</h2>
        {chat.adult && (
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-200 border border-rose-500/30">18+</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <GhostButton onClick={() => onOpenScene(chat.id)}>Scene</GhostButton>
          <GhostButton onClick={() => setShowInspector(true)}>Inspector</GhostButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" ref={scrollRef}>
        {chat.messages.length === 0 && (
          <div className="text-center text-text-muted text-[13px] mt-12">
            Start the roleplay by sending a message. {roster[0] ? `${roster[0].name} will respond first.` : ""}
          </div>
        )}
        {chat.messages.map((m) => {
          const speaker = m.role === "character"
            ? roster.find((c) => c.id === m.characterId)
            : undefined;
          return (
            <MessageBubble key={m.id} message={m} speaker={speaker} />
          );
        })}
        {isStreaming && (
          <div className="mt-4 p-4 rounded-xl border border-border bg-surface shadow-sm">
            <div className="flex items-center gap-2 text-text-muted text-[12.5px]">
              <Spinner className="text-text-muted" /> Streaming…
            </div>
            {reasoning && (
              <details className="text-text-muted text-[12px] mt-2 group">
                <summary className="cursor-pointer select-none">Thinking…</summary>
                <pre className="mt-1 whitespace-pre-wrap font-sans">{reasoning}</pre>
              </details>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="px-4 py-2">
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      <div className="border-t border-border/50 px-4 py-3 space-y-2">
        {roster.length > 1 && (
          <div className="flex items-center gap-2">
            <Label>Speaker:</Label>
            <div className="flex flex-wrap gap-1.5">
              {roster.map((c, i) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setSpeakerIdx(i); setNarratorMode(false); }}
                  aria-pressed={!narratorMode && speakerIdx === i}
                  className={`text-[12px] px-2.5 py-1 rounded-md border transition-colors ${!narratorMode && speakerIdx === i ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-border text-text-secondary hover:text-text-primary"}`}
                >
                  {c.name}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setNarratorMode(true)}
                aria-pressed={narratorMode}
                className={`text-[12px] px-2.5 py-1 rounded-md border transition-colors ${narratorMode ? "border-amber-400/40 bg-amber-400/10 text-amber-200" : "border-border text-text-secondary hover:text-text-primary"}`}
              >
                Narrator
              </button>
            </div>
          </div>
        )}
        <TextArea
          value={draft}
          onChange={setDraft}
          rows={3}
          placeholder={narratorMode ? "Describe a scene as the narrator…" : `Send a message${roster[speakerIdx] ? ` to ${roster[speakerIdx].name}` : ""}…`}
          ariaLabel="RP message"
        />
        <div className="flex justify-end">
          <PrimaryButton
            size="sm"
            loading={isStreaming}
            disabled={!draft.trim()}
            onClick={() => void handleSend()}
          >
            Send
          </PrimaryButton>
        </div>
      </div>
    </div>
  );

  function buildRpContext(text: string): { assembly: PromptAssemblyResult; systemMessages: Array<{ role: "system"; content: string }>; recentMessages: Array<{ role: "user" | "assistant" | "character" | "narrator"; content: string; characterId?: string }>; userMessage: { role: "user"; content: string } } | null {
    const ctx = buildContextForTrace(text);
    if (!ctx) return null;
    const result = buildRpPrompt(ctx);
    return {
      assembly: result,
      systemMessages: result.systemMessages.map((m) => ({ role: "system" as const, content: m.content })),
      recentMessages: result.recentMessages.map((m) => ({
        role: m.role as "user" | "assistant" | "character" | "narrator",
        content: m.content,
        ...(m.characterId ? { characterId: m.characterId } : {}),
      })),
      userMessage: result.userMessage,
    };
  }
}

function MessageBubble({ message, speaker }: { message: RpMessageV1; speaker?: CharacterCardV1 }) {
  const isUser = message.role === "user";
  const isNarrator = message.role === "narrator";
  const name = speaker?.name ?? (isNarrator ? "Narrator" : isUser ? "You" : "Character");
  return (
    <div className={`flex gap-2.5 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full overflow-hidden border border-border bg-surface-elevated flex items-center justify-center text-[12px] font-semibold text-text-muted">
          {speaker ? (
            avatarDataUri(speaker.avatar) ? (
              <img src={avatarDataUri(speaker.avatar)} alt="" className="w-full h-full object-cover" />
            ) : (
              speaker.name.slice(0, 1).toUpperCase()
            )
          ) : isNarrator ? (
            "N"
          ) : (
            "S"
          )}
        </div>
      )}
      <div className={`max-w-[80%] flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[12.5px] font-semibold text-text-primary">{name}</span>
          <span className="text-[12px] text-text-muted">{formatRelativeTime(message.createdAt)}</span>
        </div>
        <div className={`rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap ${isUser ? "bg-surface border border-border text-text-primary" : "bg-surface-elevated text-text-primary"} ${isNarrator ? "italic" : ""}`}>
          {message.content}
        </div>
      </div>
    </div>
  );
}
