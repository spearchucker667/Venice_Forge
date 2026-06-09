/**
 * @fileoverview Character Library — local card grid view.
 *
 * Lists all locally-stored `CharacterCardV1` records and lets the user open
 * one in the editor, create a new one, or delete an existing one.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useCharacterCardStore, useFilteredCharacterCards } from "../../stores/character-card-store";
import { GhostButton, PillGroup, PrimaryButton, ErrorText, EmptyState } from "../ui/shared";
import { Spinner } from "../ui/spinner";
import { avatarDataUri, formatRelativeTime, truncate } from "./_shared";
import type { CharacterCardV1 } from "../../types/rp";
import { generateId } from "../../services/rp/characterCardService";

const STANDARD_FILTER = [
  { value: "standard", label: "Standard" },
  { value: "adult", label: "Adult" },
] as const;

interface Props {
  onEdit: (id: string) => void;
}

export function CharacterLibrary({ onEdit }: Props) {
  const load = useCharacterCardStore((s) => s.load);
  const hasLoaded = useCharacterCardStore((s) => s.hasLoaded);
  const isLoading = useCharacterCardStore((s) => s.isLoading);
  const error = useCharacterCardStore((s) => s.error);
  const remove = useCharacterCardStore((s) => s.remove);
  const upsert = useCharacterCardStore((s) => s.upsert);
  const setSearchQuery = useCharacterCardStore((s) => s.setSearchQuery);
  const searchQuery = useCharacterCardStore((s) => s.searchQuery);
  const cards = useFilteredCharacterCards();

  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  // Adult filtering is a normal user preference and is no longer gated by
  // the developer "Red-Team Mode" switch.
  const [adultFilter, setAdultFilter] = useState<"standard" | "adult">("standard");
  const adultFilterOptions = useMemo(() => STANDARD_FILTER, []);

  useEffect(() => {
    if (!hasLoaded) void load();
  }, [hasLoaded, load]);

  const filtered = useMemo(() => {
    if (adultFilter === "adult") return cards.filter((c) => c.adult);
    return cards.filter((c) => !c.adult);
  }, [cards, adultFilter]);

  const handleCreate = async () => {
    const now = Date.now();
    const blank: CharacterCardV1 = {
      schema: "CharacterCardV1",
      id: generateId(),
      name: "Untitled",
      description: "",
      systemPrompt: "",
      tags: [],
      adult: false,
      exampleDialogues: [],
      createdAt: now,
      updatedAt: now,
    };
    await upsert(blank);
    onEdit(blank.id);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search characters…"
          aria-label="Search characters"
          className="flex-1 min-w-[12rem] bg-surface border border-white/[0.08] rounded-lg px-3 py-1.5 text-[13.5px] text-white/90 outline-none focus:border-white/[0.22] transition-colors placeholder:text-white/25"
        />
        <PillGroup
          options={adultFilterOptions.map((o) => ({ value: o.value, label: o.label }))}
          value={adultFilter}
          onChange={(v) => {
            const next = v as "standard" | "adult";
            setAdultFilter(next);
          }}
          ariaLabel="Adult filter"
        />
        <PrimaryButton onClick={handleCreate} size="sm">
          New character
        </PrimaryButton>
      </div>

      {error && (
        <div className="px-4 py-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading && !hasLoaded ? (
          <div className="flex items-center justify-center h-full text-white/30 gap-2 text-[13px]">
            <Spinner className="text-white/45" /> Loading characters…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <EmptyState>
              {hasLoaded ? "No characters yet" : ""}
            </EmptyState>
            {hasLoaded && (
              <GhostButton onClick={handleCreate}>Create your first character</GhostButton>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {filtered.map((card) => (
              <CardTile
                key={card.id}
                card={card}
                onEdit={() => onEdit(card.id)}
                onDelete={() => remove(card.id)}
                confirming={confirmingDelete === card.id}
                setConfirming={setConfirmingDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function CardTile({
  card,
  onEdit,
  onDelete,
  confirming,
  setConfirming,
}: {
  card: CharacterCardV1;
  onEdit: () => void;
  onDelete: () => void;
  confirming: boolean;
  setConfirming: (id: string | null) => void;
}) {
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
    };
  }, []);
  const armConfirm = () => {
    if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
    setConfirming(card.id);
    confirmTimerRef.current = setTimeout(() => {
      setConfirming(null);
      confirmTimerRef.current = null;
    }, 2500);
  };
  const cancelConfirm = () => {
    if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = null;
    setConfirming(null);
  };
  const avatarSrc = avatarDataUri(card.avatar);
  return (
    <div
      className="group relative flex flex-col gap-2 bg-surface border border-white/[0.06] hover:border-white/[0.18] rounded-xl p-3 transition-colors focus-within:border-white/[0.22]"
      role="article"
      aria-label={`Character ${card.name}`}
    >
      <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-white/[0.04] border border-white/[0.06]">
        {avatarSrc ? (
          <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-white/30 text-3xl font-semibold">
            {card.name.slice(0, 1).toUpperCase() || "?"}
          </div>
        )}
        {card.adult && (
          <span className="absolute top-1.5 right-1.5 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/30 text-rose-200 border border-rose-500/30">
            18+
          </span>
        )}
      </div>

      <div className="min-h-0">
        <div className="text-[13.5px] font-semibold text-white/90 truncate">{card.name}</div>
        <div className="text-[11.5px] text-white/40 mt-0.5">
          {formatRelativeTime(card.updatedAt)}
        </div>
        {card.description && (
          <div className="text-[12px] text-white/55 mt-1.5 line-clamp-2">
            {truncate(card.description, 120)}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-auto pt-1">
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 text-[12px] py-1.5 rounded-md border border-white/[0.1] text-white/75 hover:text-white hover:border-white/[0.2] hover:bg-white/[0.03] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
        >
          Edit
        </button>
        {confirming ? (
          <button
            type="button"
            onClick={() => {
              onDelete();
              cancelConfirm();
            }}
            className="text-[12px] py-1.5 px-2 rounded-md text-rose-300 hover:text-rose-200 border border-rose-500/30 hover:bg-rose-500/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-400 focus-visible:outline-offset-2"
          >
            Delete?
          </button>
        ) : (
          <button
            type="button"
            onClick={armConfirm}
            aria-label={`Delete ${card.name}`}
            className="text-[12px] py-1.5 px-2 rounded-md text-white/40 hover:text-rose-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
