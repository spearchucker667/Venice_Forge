/**
 * @fileoverview Asset Gallery — grid of all routed RP scene assets.
 */

import { useEffect, useMemo, useState } from "react";
import { useSceneAssetStore } from "../../stores/scene-asset-store";
import { useRpChatStore } from "../../stores/rp-chat-store";
import { GhostButton, ErrorText, EmptyState, PillGroup } from "../ui/shared";
import { Spinner } from "../ui/spinner";
import { formatRelativeTime, truncate } from "./_shared";

export function AssetGallery() {
  const load = useSceneAssetStore((s) => s.load);
  const hasLoaded = useSceneAssetStore((s) => s.hasLoaded);
  const isLoading = useSceneAssetStore((s) => s.isLoading);
  const error = useSceneAssetStore((s) => s.error);
  const assets = useSceneAssetStore((s) => s.assets);
  const remove = useSceneAssetStore((s) => s.remove);
  const chats = useRpChatStore((s) => s.chats);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chatFilter, setChatFilter] = useState<string>("");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!hasLoaded) void load();
  }, [hasLoaded, load]);

  const filtered = useMemo(() => {
    if (!chatFilter) return assets;
    return assets.filter((a) => a.chatId === chatFilter);
  }, [assets, chatFilter]);

  const selected = useMemo(() => assets.find((a) => a.id === selectedId), [assets, selectedId]);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
          <PillGroup
            options={[{ value: "", label: "All chats" }, ...chats.map((c) => ({ value: c.id, label: c.title }))]}
            value={chatFilter}
            onChange={setChatFilter}
            ariaLabel="Filter by chat"
          />
        </div>
        {error && <div className="px-4 py-3"><ErrorText>{error}</ErrorText></div>}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && !hasLoaded ? (
            <div className="flex items-center justify-center h-full text-white/30 gap-2 text-[13px]">
              <Spinner className="text-white/45" /> Loading assets…
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState>{hasLoaded ? "No assets yet" : ""}</EmptyState>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map((a) => (
                <div
                  key={a.id}
                  className={`group bg-surface border rounded-xl overflow-hidden transition-colors ${a.id === selectedId ? "border-[var(--color-accent)]/50" : "border-white/[0.06] hover:border-white/[0.18]"}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className="block w-full text-left"
                  >
                    <div className="aspect-video w-full bg-white/[0.04] border-b border-white/[0.06]">
                      {a.url ? (
                        <img src={a.url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/30 text-[11px]">no image</div>
                      )}
                    </div>
                    <div className="p-2">
                      <div className="text-[11px] text-white/55 line-clamp-2">{truncate(a.prompt, 120)}</div>
                      <div className="text-[10px] text-white/30 mt-0.5">{a.model} · {formatRelativeTime(a.createdAt)}</div>
                    </div>
                  </button>
                  <div className="px-2 pb-2">
                    {confirmingDelete === a.id ? (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => { void remove(a.id); setConfirmingDelete(null); setSelectedId(null); }}
                          className="flex-1 text-[11px] py-1 rounded border border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                        >
                          Delete?
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingDelete(null)}
                          className="text-[11px] py-1 px-2 rounded text-white/40 hover:text-white/70"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setConfirmingDelete(a.id); setTimeout(() => setConfirmingDelete(null), 2500); }}
                        aria-label="Delete asset"
                        className="w-full text-[11px] py-1 rounded text-white/35 hover:text-rose-300 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="w-80 shrink-0 border-l border-white/[0.06] overflow-y-auto p-3 space-y-2">
        {selected ? (
          <>
            <div className="aspect-video w-full rounded-lg overflow-hidden border border-white/[0.08] bg-white/[0.04]">
              {selected.url ? (
                <img src={selected.url} alt="" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/30 text-[11px]">no image</div>
              )}
            </div>
            <div className="text-[12px] text-white/55 whitespace-pre-wrap">{selected.prompt}</div>
            <div className="text-[11px] text-white/40 space-y-0.5">
              <div>Model: {selected.model}</div>
              {selected.seed !== undefined && <div>Seed: {selected.seed}</div>}
              {selected.negativePrompt && <div>Negative: {selected.negativePrompt}</div>}
              <div>Created: {formatRelativeTime(selected.createdAt)}</div>
            </div>
            <div className="pt-2">
              <GhostButton onClick={() => setSelectedId(null)}>Close preview</GhostButton>
            </div>
          </>
        ) : (
          <div className="text-[12px] text-white/30 italic">Click an asset to preview.</div>
        )}
      </div>
    </div>
  );
}
