/**
 * @fileoverview RP chat list — pick or create a new RP chat session.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRpChatStore } from "../../stores/rp-chat-store";
import { useCharacterCardStore } from "../../stores/character-card-store";
import { usePersonaStore } from "../../stores/persona-store";
import { useLorebookStore } from "../../stores/lorebook-store";
import { GhostButton, Label, PrimaryButton, ErrorText, EmptyState, PillGroup } from "../ui/shared";
import { Spinner } from "../ui/spinner";
import { formatRelativeTime, truncate, avatarDataUri } from "./_shared";
import { FALLBACK_MODELS } from "../../constants/venice";
import { MAX_ACTIVE_CHARACTERS, type CharacterCardV1, type LorebookV1, type UserPersonaV1 } from "../../types/rp";
import { assessCharacterBatchImport } from "../../shared/safety/characterImportSafety";
import { useSettingsStore } from "../../stores/settings-store";

interface Props {
  onOpen: (chatId: string) => void;
}

export function RpChatList({ onOpen }: Props) {
  const loadChats = useRpChatStore((s) => s.load);
  const hasLoaded = useRpChatStore((s) => s.hasLoaded);
  const isLoading = useRpChatStore((s) => s.isLoading);
  const error = useRpChatStore((s) => s.error);
  const chats = useRpChatStore((s) => s.chats);
  const remove = useRpChatStore((s) => s.remove);
  const setActive = useRpChatStore((s) => s.setActive);
  const loadCards = useCharacterCardStore((s) => s.load);
  const cards = useCharacterCardStore((s) => s.cards);
  const cardsLoaded = useCharacterCardStore((s) => s.hasLoaded);
  const loadPersonas = usePersonaStore((s) => s.load);
  const personas = usePersonaStore((s) => s.personas);
  const personasLoaded = usePersonaStore((s) => s.hasLoaded);
  const loadLorebooks = useLorebookStore((s) => s.load);
  const lorebooks = useLorebookStore((s) => s.lorebooks);
  const lorebooksLoaded = useLorebookStore((s) => s.hasLoaded);
  const defaultModel = useSettingsStore((s) => s.selectedModels["rp-studio"]) || FALLBACK_MODELS.text[0]?.id || "venice-uncensored";
  const [creating, setCreating] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [adultFilter, setAdultFilter] = useState<"all" | "standard">("all");

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const armConfirm = (id: string) => {
    if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
    setConfirmingDelete(id);
    confirmTimerRef.current = setTimeout(() => {
      setConfirmingDelete(null);
      confirmTimerRef.current = null;
    }, 2500);
  };
  const cancelConfirm = () => {
    if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = null;
    setConfirmingDelete(null);
  };

  useEffect(() => {
    if (!hasLoaded) void loadChats();
    if (!cardsLoaded) void loadCards();
    if (!personasLoaded) void loadPersonas();
    if (!lorebooksLoaded) void loadLorebooks();
  }, [hasLoaded, cardsLoaded, personasLoaded, lorebooksLoaded, loadChats, loadCards, loadPersonas, loadLorebooks]);

  const filteredChats = useMemo(() => {
    if (adultFilter === "all") return chats;
    return chats.filter((c) => !c.adult);
  }, [chats, adultFilter]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <PillGroup
          options={[{ value: "all", label: "All" }, { value: "standard", label: "Standard" }]}
          value={adultFilter}
          onChange={(v) => setAdultFilter(v as "all" | "standard")}
          ariaLabel="Adult filter"
        />
        <div className="flex-1" />
        <PrimaryButton size="sm" onClick={() => setCreating(true)}>New RP chat</PrimaryButton>
      </div>

      {error && <div className="px-4 py-3"><ErrorText>{error}</ErrorText></div>}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading && !hasLoaded ? (
          <div className="flex items-center justify-center h-full text-white/30 gap-2 text-[13px]">
            <Spinner className="text-white/45" /> Loading chats…
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <EmptyState>{hasLoaded ? "No RP chats yet" : ""}</EmptyState>
            {hasLoaded && <GhostButton onClick={() => setCreating(true)}>Start your first RP</GhostButton>}
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredChats.map((chat) => {
              const roster = chat.characterIds
                .map((id) => cards.find((c) => c.id === id))
                .filter((c): c is NonNullable<typeof c> => c !== undefined);
              return (
                <li
                  key={chat.id}
                  className="flex flex-col gap-2 bg-surface border border-white/[0.06] hover:border-white/[0.18] rounded-xl p-3 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[14px] font-semibold text-white/90 truncate">{chat.title}</div>
                      <div className="text-[11.5px] text-white/40 mt-0.5">
                        {roster.length} {roster.length === 1 ? "character" : "characters"} · {formatRelativeTime(chat.updatedAt)}
                      </div>
                    </div>
                    {chat.adult && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-200 border border-rose-500/30">
                        18+
                      </span>
                    )}
                  </div>
                  {roster.length > 0 && (
                    <div className="flex items-center gap-1.5 -space-x-1.5">
                      {roster.slice(0, 5).map((c) => {
                        const src = avatarDataUri(c.avatar);
                        return (
                          <div
                            key={c.id}
                            title={c.name}
                            className="w-7 h-7 rounded-full overflow-hidden border border-white/[0.1] bg-white/[0.04] flex items-center justify-center text-[10px] font-semibold text-white/60"
                          >
                            {src ? (
                              <img src={src} alt="" className="w-full h-full object-cover" />
                            ) : (
                              c.name.slice(0, 1).toUpperCase()
                            )}
                          </div>
                        );
                      })}
                      {roster.length > 5 && (
                        <div className="w-7 h-7 rounded-full border border-white/[0.1] bg-white/[0.04] flex items-center justify-center text-[10px] text-white/60">
                          +{roster.length - 5}
                        </div>
                      )}
                    </div>
                  )}
                  {chat.scenario && (
                    <p className="text-[12.5px] text-white/55 line-clamp-2">{truncate(chat.scenario, 180)}</p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1">
                    <button
                      type="button"
                      onClick={() => { setActive(chat.id); onOpen(chat.id); }}
                      className="flex-1 text-[12px] py-1.5 rounded-md border border-white/[0.1] text-white/75 hover:text-white hover:bg-white/[0.03] transition-colors"
                    >
                      Open
                    </button>
                    {confirmingDelete === chat.id ? (
                      <button
                        type="button"
                        onClick={() => { void remove(chat.id); cancelConfirm(); }}
                        className="text-[12px] py-1.5 px-2 rounded-md text-rose-300 border border-rose-500/30 hover:bg-rose-500/10"
                      >
                        Delete?
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => armConfirm(chat.id)}
                        aria-label={`Delete ${chat.title}`}
                        className="text-white/40 hover:text-rose-300 p-1.5"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {creating && (
        <NewChatDialog
          onClose={() => setCreating(false)}
          onCreate={(init) => {
            const id = useRpChatStore.getState().createChat({
              title: init.title,
              characterIds: init.characterIds,
              personaId: init.personaId,
              lorebookIds: init.lorebookIds,
              modelId: init.modelId,
              scenario: init.scenario,
              adult: init.adult,
            });
            setCreating(false);
            onOpen(id);
          }}
          cards={cards}
          personas={personas}
          lorebooks={lorebooks}
          defaultModel={defaultModel}
        />
      )}
    </div>
  );
}

function NewChatDialog({
  onClose,
  onCreate,
  cards,
  personas,
  lorebooks,
  defaultModel,
}: {
  onClose: () => void;
  onCreate: (init: { title: string; characterIds: string[]; personaId: string | null; lorebookIds: string[]; modelId: string; scenario: string | undefined; adult: boolean }) => void;
  cards: CharacterCardV1[];
  personas: UserPersonaV1[];
  lorebooks: LorebookV1[];
  defaultModel: string;
}) {
  const [title, setTitle] = useState("New RP");
  const [selectedCards, setSelectedCards] = useState<string[]>([]);
  const [personaId, setPersonaId] = useState<string>("");
  const [selectedLorebooks, setSelectedLorebooks] = useState<string[]>([]);
  const [modelId, setModelId] = useState(defaultModel);
  const [scenario, setScenario] = useState("");
  const [error, setError] = useState<string | null>(null);
  const includeAdult = useSettingsStore((s) => s.redTeamMode);

  const visibleCards = useMemo(() => {
    return includeAdult ? cards : cards.filter((c) => !c.adult);
  }, [cards, includeAdult]);

  const toggleCard = (id: string) => {
    setSelectedCards((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_ACTIVE_CHARACTERS) return prev;
      return [...prev, id];
    });
  };

  const toggleLorebook = (id: string) => {
    setSelectedLorebooks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreate = () => {
    if (selectedCards.length === 0) {
      setError("Pick at least one character.");
      return;
    }
    const resolvedCards = selectedCards
      .map((id) => cards.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => c !== undefined);
    if (resolvedCards.length === 0) {
      setError("Picked characters could not be resolved.");
      return;
    }
    const adult = resolvedCards.some((c) => c.adult);
    // Mandatory safety guard for batch character import.
    const decision = assessCharacterBatchImport(resolvedCards, useSettingsStore.getState().localFamilySafeModeEnabled);
    if (!decision.allow || decision.action === "block") {
      setError(decision.userMessage);
      return;
    }
    onCreate({
      title,
      characterIds: selectedCards,
      personaId: personaId || null,
      lorebookIds: selectedLorebooks,
      modelId,
      scenario: scenario.trim() || undefined,
      adult,
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="New RP chat" className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-2xl max-h-[85%] flex flex-col bg-surface border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.06]">
          <h2 className="text-[15px] font-semibold text-white/90">New RP chat</h2>
          <div className="ml-auto flex items-center gap-2">
            <GhostButton onClick={onClose}>Cancel</GhostButton>
            <PrimaryButton size="sm" onClick={handleCreate}>Create</PrimaryButton>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && <ErrorText>{error}</ErrorText>}
          <div>
            <Label htmlFor="rp-title">Title</Label>
            <input
              id="rp-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="w-full bg-surface-elevated border border-white/[0.08] rounded-lg px-3 py-2 text-[14px] text-white/90 outline-none focus:border-white/[0.22] transition-colors"
            />
          </div>
          <div>
            <Label htmlFor="rp-model">Model</Label>
            <select
              id="rp-model"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="w-full bg-surface-elevated border border-white/[0.08] rounded-lg px-3 py-2 text-[14px] text-white/90 outline-none focus:border-white/[0.22] transition-colors"
            >
              {FALLBACK_MODELS.text.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label hint={`${selectedCards.length}/${MAX_ACTIVE_CHARACTERS}`}>Characters</Label>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-1">
              {visibleCards.length === 0 ? (
                <div className="text-[12px] text-white/30 italic">No characters yet — create one in the Characters tab.</div>
              ) : (
                visibleCards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCard(c.id)}
                    aria-pressed={selectedCards.includes(c.id)}
                    className={`text-[12px] px-2.5 py-1 rounded-md border transition-colors ${selectedCards.includes(c.id) ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-white/[0.1] text-white/65 hover:text-white hover:border-white/[0.2]"}`}
                  >
                    {c.name}
                    {c.adult && <span className="ml-1 text-rose-300">18+</span>}
                  </button>
                ))
              )}
            </div>
          </div>
          <div>
            <Label htmlFor="rp-persona">Persona (optional)</Label>
            <select
              id="rp-persona"
              value={personaId}
              onChange={(e) => setPersonaId(e.target.value)}
              className="w-full bg-surface-elevated border border-white/[0.08] rounded-lg px-3 py-2 text-[14px] text-white/90 outline-none focus:border-white/[0.22] transition-colors"
            >
              <option value="">No persona</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {lorebooks.length > 0 && (
            <div>
              <Label>Lorebooks</Label>
              <div className="flex flex-wrap gap-1.5">
                {lorebooks.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggleLorebook(l.id)}
                    aria-pressed={selectedLorebooks.includes(l.id)}
                    className={`text-[12px] px-2.5 py-1 rounded-md border transition-colors ${selectedLorebooks.includes(l.id) ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-white/[0.1] text-white/65 hover:text-white hover:border-white/[0.2]"}`}
                  >
                    {l.name} ({l.entries.length})
                  </button>
                ))}
              </div>
            </div>
          )}
          <div>
            <Label htmlFor="rp-scenario" hint="optional">
              Scenario override
            </Label>
            <textarea
              id="rp-scenario"
              value={scenario}
              onChange={(e) => setScenario(e.target.value)}
              rows={3}
              placeholder="Leave blank to use the first character's scenario."
              className="w-full bg-surface-elevated border border-white/[0.08] rounded-lg px-3 py-2 text-[14px] text-white/90 outline-none focus:border-white/[0.22] transition-colors placeholder:text-white/25 resize-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
