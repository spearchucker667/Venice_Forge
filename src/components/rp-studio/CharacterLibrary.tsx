/**
 * @fileoverview Character Library — local card grid view.
 *
 * Lists all locally-stored `CharacterCardV1` records and lets the user open
 * one in the editor, create a new one, or delete an existing one.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useCharacterCardStore } from "../../stores/character-card-store";
import { GhostButton, PillGroup, PrimaryButton, ErrorText, EmptyState } from "../ui/shared";
import { Spinner } from "../ui/spinner";
import { avatarDataUri, formatRelativeTime, truncate } from "./_shared";
import type { CharacterCardAvatar, CharacterCardV1 } from "../../types/rp";
import { CARD_FIELD_MAX } from "../../types/rp";
import { generateId } from "../../services/rp/characterCardService";
import { startNormalChatForCharacter } from "../../services/rpHelpers";
import { toast } from "../../stores/toast-store";
import { veniceFetch } from "../../services/veniceClient/fetch";
import { maybeRunLocalFamilyGuard } from "../../shared/safety/localFamilySafeGuard";
import { useSettingsStore } from "../../stores/settings-store";
import { DEFAULT_IMAGE_MODEL, FALLBACK_MODELS } from "../../constants/venice";
import { buildImagePayload } from "../../utils/payloadBuilders";
import { extractImages } from "../../utils/image";

const STANDARD_FILTER = [
  { value: "standard", label: "Standard" },
  { value: "adult", label: "Adult" },
] as const;

/**
 * Internal shape produced by the strict Create Me validator. These are
 * the only fields the validator will accept and every field is non-empty
 * (with the exception of optional firstMessage / systemPrompt / imagePrompt).
 */
interface ValidatedCreateMeResponse {
  name: string;
  description: string;
  instructions: string;
  firstMessage?: string;
  systemPrompt: string;
  imagePrompt?: string;
  tags: string[];
  adult: boolean;
}

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
  const allCards = useCharacterCardStore((s) => s.cards);

  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [createMePrompt, setCreateMePrompt] = useState("");
  const [isCreatingMe, setIsCreatingMe] = useState(false);
  // createMeAvatarError surfaces a retryable error when the avatar generator
  // refuses or fails — the user can edit the prompt and click "Create Me"
  // again. The card is NEVER persisted until `card.avatar` is set.
  const [_createMeAvatarError, setCreateMeAvatarError] = useState<string | null>(null);
  const safeMode = useSettingsStore((s) => s.localFamilySafeModeEnabled);

  /**
   * Builds a safe, deterministic avatar prompt from the validated character
   * metadata when `validated.imagePrompt` is missing. Keeps prompts short,
   * avoids any names/descriptions that should never appear in an avatar,
   * and is capped at 600 chars to match the validated schema.
   */
  function synthAvatarPrompt(v: { name: string; description: string; tags: string[] }): string {
    const safeName = v.name.replace(/[\r\n"]+/g, " ").slice(0, 40);
    const safeDesc = v.description.replace(/[\r\n"]+/g, " ").slice(0, 200);
    const tagClouds = v.tags.slice(0, 4).map((t) => t.replace(/[^\w-]/g, "")).filter(Boolean).join(" ");
    const template = `Portrait avatar of ${safeName}, ${tagClouds}. ${safeDesc}. Square icon framing, soft light, no text, no watermarks.`;
    return template.slice(0, 600);
  }

  const handleCreateMe = async () => {
    if (!createMePrompt.trim()) return;
    const promptText = createMePrompt.trim();

    setCreateMeAvatarError(null);
    setIsCreatingMe(true);
    try {
      // (1) Pre-flight guard on the user's prompt itself.
      if (safeMode) {
        const guard = await maybeRunLocalFamilyGuard({ text: promptText, source: "chat" }, true);
        if (!guard.allowed) {
          toast.error("Blocked by safety guard.");
          setIsCreatingMe(false);
          return;
        }
      }

      // (2) Pick the configured text model so users can route Venice DIY
      //     Character Studio through prompt-lab favourite, fallback list,
      //     etc. Never hardcode model ids.
      const configuredTextModel = useSettingsStore.getState().selectedModels.text;
      const textModel =
        configuredTextModel
        || FALLBACK_MODELS.text[0]?.id
        || "llama-3.3-70b";

      const res = await veniceFetch('/chat/completions', {
        method: 'POST',
        body: {
          model: textModel,
          messages: [
            {
              role: 'system',
              content:
                'You are a character creator. Return ONLY a single valid JSON object ' +
                'with no markdown wrappers, no prose, no code fences. ' +
                'The JSON keys MUST match this exact schema: ' +
                '{ "name": string (1-80 chars), "description": string (1-600 chars), ' +
                '"firstMessage": string (optional, <= 800 chars), ' +
                '"instructions": string (required, 1-2000 chars), ' +
                '"systemPrompt": string (optional, <= 8000 chars), ' +
                '"imagePrompt": string (optional, <= 600 chars; short English description ' +
                'suitable for an avatar / icon of the character), ' +
                '"tags": string[] (max 8 entries, lowercase, hyphenated), ' +
                '"adult": boolean }. ' +
                'Every string must be non-empty when required; do not include ' +
                'unknown keys; do not include trailing commas.',
            },
            {
              role: 'user',
              content: `Create a character based on this prompt: ${promptText}`,
            },
          ],
          temperature: 0.7,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = String((res.data as any).choices?.[0]?.message?.content ?? "");
      const parsed = safeParseCharacterJson(raw);
      const validated = validateCreateMeResponse(parsed);
      if (!validated) {
        toast.error("Character generator returned an invalid or unparseable response.");
        setIsCreatingMe(false);
        return;
      }

      // (3) Post-generation safety guard on the AI output (preflight +
      //     postflight). Adult flag set by the model is fused with the
      //     postflight decision — safer to fail closed than to honour a
      //     self-reported flag.
      if (safeMode) {
        const postGuard = maybeRunLocalFamilyGuard(
          { text: JSON.stringify(validated), source: "chat" },
          true,
        );
        if (!postGuard.allowed) {
          toast.error("Generated character blocked by safety guard.");
          setIsCreatingMe(false);
          return;
        }
      }
      if (safeMode && validated.adult === true) {
        toast.error("Generated character was flagged as adult; please revise your prompt or finish editing manually.");
        setIsCreatingMe(false);
        return;
      }

      const now = Date.now();
      const cap = (value: string) => value.length > CARD_FIELD_MAX ? value.slice(0, CARD_FIELD_MAX) : value;
      const card: CharacterCardV1 = {
        schema: "CharacterCardV1",
        id: generateId(),
        name: cap(validated.name) || "Untitled",
        description: cap(validated.description || ""),
        systemPrompt: cap(validated.systemPrompt || ""),
        instructions: cap(validated.instructions),
        tags: validated.tags.slice(0, 8).map((t) => t.toLowerCase().slice(0, 40)),
        adult: !!validated.adult,
        exampleDialogues: [],
        firstMessage: validated.firstMessage ? cap(validated.firstMessage) : undefined,
        modelId: textModel,
        createdAt: now,
        updatedAt: now,
      };

      // (4) MANDATORY: every character must have an avatar before we persist
      //     the card. We try the model-supplied imagePrompt first, then fall
      //     back to a synthesized avatar prompt derived from validated name
      //     / description / tags so the user does not end up with a card
      //     whose only avatar is a placeholder initials block. Failure (or
      //     Family Safe Mode refusal of the prompt) leaves the user with a
      //     retryable error and the editor-link is NOT opened — the card is
      //     also NOT saved.
      const candidateImagePrompt =
        (validated.imagePrompt && validated.imagePrompt.trim())
          ? validated.imagePrompt.trim().slice(0, 600)
          : synthAvatarPrompt(validated);

      if (safeMode) {
        const imageGuard = maybeRunLocalFamilyGuard(
          { text: candidateImagePrompt, source: "image" },
          true,
        );
        if (!imageGuard.allowed) {
          setCreateMeAvatarError(
            "Avatar image prompt was blocked by Family Safe Mode. Edit your prompt or disable the guard, then try again.",
          );
          toast.error("Avatar blocked by safety guard.");
          setIsCreatingMe(false);
          return;
        }
      }
      const avatar = await generateAvatarForCard(candidateImagePrompt);
      if (!avatar) {
        setCreateMeAvatarError(
          "Could not generate an avatar for this character. The card was NOT saved. Retry, or open the editor and upload an image manually.",
        );
        toast.error("Avatar generation failed; card not saved.");
        setIsCreatingMe(false);
        return;
      }
      card.avatar = avatar;

      const saved = await upsert(card);
      if (saved) {
        setCreateMePrompt("");
        setCreateMeAvatarError(null);
        onEdit(saved.id);
      }
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toast.error(String((err as any).message || err));
    } finally {
      setIsCreatingMe(false);
    }
  };

  async function generateAvatarForCard(imagePrompt: string): Promise<CharacterCardAvatar | undefined> {
    try {
      const configuredImageModel = useSettingsStore.getState().selectedModels.image;
      const fallback = FALLBACK_MODELS.image[0]?.id;
      const imageModel = configuredImageModel || fallback || DEFAULT_IMAGE_MODEL;
      const payload = buildImagePayload(
        imageModel,
        {
          prompt: imagePrompt,
          width: 512,
          height: 512,
          aspectRatio: "1:1",
          safeMode: useSettingsStore.getState().veniceApiSafeMode,
          disableWatermark: true,
          imageCount: 1,
          supportsReturnBinary: false,
        },
        imagePrompt,
        undefined,
      );
      const res = await veniceFetch('/image/generate', {
        method: 'POST',
        body: payload,
      });
      const urls = extractImages(res.data);
      const first = urls[0];
      if (!first) return undefined;
      return dataUrlToAvatar(first);
    } catch {
      // Avatar gen is best-effort; failing here just leaves the editor
      // to use the placeholder initials avatar (the user can re-roll).
      return undefined;
    }
  }

  // Strict runtime validation of the model output. Every field is
  // type-checked — partial / structurally-invalid responses fail closed
  // rather than degrading silently. The validator follows the schema
  // declared in the chat/completions system prompt.
  function validateCreateMeResponse(value: unknown): ValidatedCreateMeResponse | null {
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;

    const askString = (key: string, minLen: number, maxLen: number): string | null => {
      const v = record[key];
      if (typeof v !== "string") return null;
      const trimmed = v.trim();
      if (!trimmed) return null;
      if (trimmed.length < minLen || trimmed.length > maxLen) return null;
      return trimmed.slice(0, maxLen);
    };

    const name = askString("name", 1, 80);
    const description = askString("description", 1, 600);
    const instructions = askString("instructions", 1, 2000);
    if (!name || !description || !instructions) return null;

    const firstMessage = askString("firstMessage", 1, 800) ?? undefined;
    const systemPrompt = askString("systemPrompt", 1, 8000) ?? "";
    const imagePrompt = askString("imagePrompt", 1, 600) ?? undefined;

    const tags: string[] = [];
    if (record.tags !== undefined) {
      if (!Array.isArray(record.tags)) return null;
      for (const t of record.tags) {
        if (typeof t !== "string") return null;
        const trimmed = t.trim().slice(0, 40);
        if (!trimmed) return null;
        tags.push(trimmed);
        if (tags.length > 8) break;
      }
    }

    let adult = false;
    if (record.adult !== undefined) {
      if (typeof record.adult !== "boolean") return null;
      adult = record.adult;
    }

    for (const key of Object.keys(record)) {
      if (
        key !== "name" &&
        key !== "description" &&
        key !== "firstMessage" &&
        key !== "instructions" &&
        key !== "systemPrompt" &&
        key !== "imagePrompt" &&
        key !== "tags" &&
        key !== "adult"
      ) {
        return null;
      }
    }

    return { name, description, instructions, firstMessage, systemPrompt, imagePrompt, tags, adult };
  }

  function dataUrlToAvatar(dataUrl: string): CharacterCardAvatar | undefined {
    if (!/^data:image\//i.test(dataUrl)) return undefined;
    const match = /^data:(image\/(?:png|jpeg|webp));base64,(.*)$/i.exec(dataUrl);
    if (!match) return undefined;
    const mimeType = match[1].toLowerCase() as "image/png" | "image/jpeg" | "image/webp";
    const base64 = match[2].replace(/\s+/g, "");
    // Approximate byte length: 3 bytes / 4 base64 chars.
    const byteLength = Math.floor((base64.length * 3) / 4);
    if (!byteLength) return undefined;
    if (base64.length > 6 * 1024 * 1024) return undefined;
    return { data: dataUrl, mimeType, byteLength };
  }

  // Bracket-balanced JSON extractor for code fences (handles ```json ... ``` and bare objects).
  function safeParseCharacterJson(raw: string): Record<string, unknown> | null {
    const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
    if (!cleaned) return null;
    try {
      return JSON.parse(cleaned);
    } catch {
      // Fallback: scan for the first balanced {…} substring and try that.
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = 0; i < cleaned.length; i++) {
        const ch = cleaned[i];
        if (escape) { escape = false; continue; }
        if (inString) {
          if (ch === "\\") { escape = true; continue; }
          if (ch === '"') { inString = false; }
          continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === "{") { depth += 1; continue; }
        if (ch === "}") {
          depth -= 1;
          if (depth === 0) {
            const candidate = cleaned.slice(cleaned.indexOf("{", 0), i + 1);
            try {
              return JSON.parse(candidate);
            } catch {
              return null;
            }
          }
        }
      }
      return null;
    }
  }
  // Adult filtering is a normal user preference and is no longer gated by
  // the Traffic Inspector switch.
  const [adultFilter, setAdultFilter] = useState<"standard" | "adult">("standard");
  const adultFilterOptions = useMemo(() => STANDARD_FILTER, []);

  useEffect(() => {
    if (!hasLoaded) void load();
  }, [hasLoaded, load]);

  const filtered = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    return allCards.filter((card) => {
      if (adultFilter === "adult" && !card.adult) return false;
      if (adultFilter === "standard" && card.adult) return false;
      if (!needle) return true;
      const haystack = `${card.name}\n${card.description}\n${card.tags.join(" ")}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [allCards, searchQuery, adultFilter]);

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
    const saved = await upsert(blank);
    if (!saved) return;
    onEdit(saved.id);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 soft-separator-y mesh-header mesh-surface">
        <div className="flex-1 min-w-[12rem]">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search characters…"
            aria-label="Search characters"
            className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-[13.5px] text-text-primary outline-none focus:border-accent transition-colors placeholder:text-text-muted"
          />
          <p className="mt-1 text-[12px] text-text-muted">
            Local characters are stored in Venice Forge only. They are not hosted on Venice.ai.
          </p>
        </div>
        <PillGroup
          options={adultFilterOptions.map((o) => ({ value: o.value, label: o.label }))}
          value={adultFilter}
          onChange={(v) => {
            const next = v as "standard" | "adult";
            setAdultFilter(next);
          }}
          ariaLabel="Adult filter"
        />
                <div className="flex items-center gap-2">
          <input 
            type="text" 
            placeholder="Auto-create prompt..." 
            value={createMePrompt} 
            onChange={e => setCreateMePrompt(e.target.value)} 
            onKeyDown={e => { if (e.key === 'Enter') handleCreateMe(); }}
            className="text-[13px] bg-surface-elevated border border-border rounded px-3 py-1.5 focus:outline-none focus:border-accent"
          />
          <PrimaryButton onClick={handleCreateMe} size="sm" disabled={isCreatingMe || !createMePrompt.trim()}>
            {isCreatingMe ? "Creating..." : "Create Me"}
          </PrimaryButton>
          <PrimaryButton onClick={handleCreate} size="sm">
            New character
          </PrimaryButton>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3">
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading && !hasLoaded ? (
          <div className="flex items-center justify-center h-full text-text-muted gap-2 text-[13px]">
            <Spinner className="text-text-muted" /> Loading characters…
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
      className="group relative flex flex-col gap-2 bg-surface border border-border hover:border-accent/40 rounded-xl p-3 transition-colors focus-within:border-accent"
      role="article"
      aria-label={`Character ${card.name}`}
    >
      <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-surface-elevated border border-border">
        {avatarSrc ? (
          <img src={avatarSrc} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-text-muted text-3xl font-semibold">
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
        <div className="text-[13.5px] font-semibold text-text-primary truncate">{card.name}</div>
        <div className="text-[12px] text-text-muted mt-0.5">
          {formatRelativeTime(card.updatedAt)}
        </div>
        {card.description && (
          <div className="text-[12px] text-text-secondary mt-1.5 line-clamp-2">
            {truncate(card.description, 120)}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-auto pt-1">
        <button
          type="button"
          onClick={async () => {
            const convId = await startNormalChatForCharacter(card.id);
            if (convId) {
              toast.success("Chat started", `Opening "${card.name}" in Chat.`);
            } else {
              toast.error("Could not start chat", "Please try again.");
            }
          }}
          className="flex-1 text-[12px] py-1.5 rounded-md border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
        >
          Chat
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="flex-1 text-[12px] py-1.5 rounded-md border border-border text-text-secondary hover:text-text-primary hover:border-accent/40 hover:bg-surface-elevated transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
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
            className="text-[12px] py-1.5 px-2 rounded-md text-text-muted hover:text-rose-300 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] focus-visible:outline-offset-2"
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
