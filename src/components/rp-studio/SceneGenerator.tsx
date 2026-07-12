/**
 * @fileoverview Scene Generator — extract a scene prompt from a chat and
 * generate an image via the existing Venice transport.
 */

import { useEffect, useMemo, useState } from "react";
import { useRpChatStore } from "../../stores/rp-chat-store";
import { useCharacterCardStore } from "../../stores/character-card-store";
import { useSceneAssetStore } from "../../stores/scene-asset-store";
import { Label, PrimaryButton, ErrorText, TextArea } from "../ui/shared";
import { FALLBACK_MODELS } from "../../constants/venice";
import { extractScenePrompt, generateScene } from "../../services/rp";
import { toast } from "../../stores/toast-store";
import { formatRelativeTime, truncate } from "./_shared";

interface Props {
  filterChatId?: string;
  onViewAsset?: (assetId: string) => void;
  /** Disables generate when the main-process config has not yet hydrated
   *  (defence-in-depth mirror of the VERIFY-017 hydration gate). */
  disabled?: boolean;
}

export function SceneGenerator({ filterChatId, onViewAsset, disabled = false }: Props) {
  const chats = useRpChatStore((s) => s.chats);
  const chatsLoaded = useRpChatStore((s) => s.hasLoaded);
  const loadChats = useRpChatStore((s) => s.load);
  const _cards = useCharacterCardStore((s) => s.cards);
  const cardsLoaded = useCharacterCardStore((s) => s.hasLoaded);
  const loadCards = useCharacterCardStore((s) => s.load);
  const assets = useSceneAssetStore((s) => s.assets);
  const assetsLoaded = useSceneAssetStore((s) => s.hasLoaded);
  const loadAssets = useSceneAssetStore((s) => s.load);
  const [selectedChatId, setSelectedChatId] = useState<string>(filterChatId ?? "");
  const [model, setModel] = useState(FALLBACK_MODELS.image[0]?.id ?? "flux-dev");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [seed, setSeed] = useState<string>("");
  const [override, setOverride] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!chatsLoaded) void loadChats();
    if (!cardsLoaded) void loadCards();
    if (!assetsLoaded) void loadAssets(filterChatId ? { chatId: filterChatId } : undefined);
  }, [chatsLoaded, cardsLoaded, assetsLoaded, loadChats, loadCards, loadAssets, filterChatId]);

  const visibleChats = useMemo(() => {
    if (filterChatId) return chats.filter((c) => c.id === filterChatId);
    return chats;
  }, [chats, filterChatId]);

  useEffect(() => {
    if (!selectedChatId && visibleChats.length > 0) {
      setSelectedChatId(visibleChats[0].id);
    }
  }, [selectedChatId, visibleChats]);

  const selectedChat = useMemo(
    () => chats.find((c) => c.id === selectedChatId),
    [chats, selectedChatId],
  );

  const extractedPrompt = useMemo(() => {
    if (!selectedChat) return "";
    if (override.trim()) return override.trim();
    return extractScenePrompt(selectedChat);
  }, [selectedChat, override]);

  const handleGenerate = async () => {
    if (disabled) {
      setError("Local config is still loading. Try again in a moment.");
      return;
    }
    if (!selectedChat) {
      setError("Pick a chat first.");
      return;
    }
    setRunning(true);
    setError(null);
    const seedNum = seed.trim() ? parseInt(seed, 10) : undefined;
    const outcome = await generateScene(selectedChat, {
      rpChatId: selectedChat.id,
      ...(override.trim() ? { promptOverride: override.trim() } : {}),
      model,
      ...(negativePrompt.trim() ? { negativePrompt: negativePrompt.trim() } : {}),
      ...(seedNum !== undefined && !Number.isNaN(seedNum) ? { seed: seedNum } : {}),
    });
    setRunning(false);
    if (outcome.ok) {
      toast.success("Scene generated", "Saved to RP assets.");
      if (onViewAsset) onViewAsset(outcome.asset.id);
      await useSceneAssetStore.getState().load({ chatId: selectedChat.id });
    } else {
      setError(outcome.error);
    }
  };

  const filteredAssets = useMemo(() => {
    if (filterChatId) return assets;
    if (selectedChatId) return assets.filter((a) => a.chatId === selectedChatId);
    return assets;
  }, [assets, filterChatId, selectedChatId]);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div>
          <Label htmlFor="scene-chat">Chat</Label>
          <select
            id="scene-chat"
            value={selectedChatId}
            onChange={(e) => setSelectedChatId(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-colors"
          >
            <option value="">Select a chat…</option>
            {visibleChats.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="scene-model">Image model</Label>
          <select
            id="scene-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-colors"
          >
            {FALLBACK_MODELS.image.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="scene-prompt" hint="Leave blank to extract from chat">
            Prompt
          </Label>
          <TextArea
            value={override}
            onChange={setOverride}
            rows={4}
            placeholder={extractedPrompt || "Extracts from the most recent non-system message."}
            ariaLabel="Prompt override"
          />
          {!override.trim() && selectedChat && (
            <div className="text-[12px] text-text-muted mt-1.5">
              Extracted: <span className="italic">{truncate(extractedPrompt, 200)}</span>
            </div>
          )}
        </div>
        <div>
          <Label htmlFor="scene-negative" hint="optional">
            Negative prompt
          </Label>
          <TextArea
            value={negativePrompt}
            onChange={setNegativePrompt}
            rows={2}
            placeholder="Things to avoid…"
            ariaLabel="Negative prompt"
          />
        </div>
        <div>
          <Label htmlFor="scene-seed" hint="optional">
            Seed
          </Label>
          <input
            id="scene-seed"
            type="number"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            min={0}
            className="w-32 bg-surface border border-border rounded-lg px-3 py-1.5 text-[14px] text-text-primary outline-none focus:border-accent transition-colors"
          />
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <PrimaryButton loading={running} onClick={() => void handleGenerate()} disabled={!selectedChat || disabled}>
          Generate scene
        </PrimaryButton>
      </div>
      <div className="w-72 shrink-0 soft-separator-x mesh-surface overflow-y-auto p-3 space-y-2">
        <div className="text-[12px] uppercase tracking-[0.08em] text-text-muted font-semibold">
          Recent scenes{filterChatId ? "" : " (this chat)"}
        </div>
        {filteredAssets.length === 0 ? (
          <div className="text-[12px] text-text-muted italic">No scenes yet.</div>
        ) : (
          filteredAssets.slice(0, 24).map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onViewAsset?.(a.id)}
              className="block w-full text-left bg-surface border border-border hover:border-accent/40 rounded-lg p-2 transition-colors"
            >
              <div className="aspect-video w-full rounded overflow-hidden bg-surface-elevated border border-border mb-1.5">
                {a.url ? (
                  <img src={a.url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-text-muted text-[12px]">no image</div>
                )}
              </div>
              <div className="text-[12px] text-text-secondary truncate">{truncate(a.prompt, 100)}</div>
              <div className="text-[12px] text-text-muted mt-0.5">{a.model} · {formatRelativeTime(a.createdAt)}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
