/**
 * @fileoverview Asset Gallery — grid of all routed RP scene assets.
 */

import { useEffect, useMemo, useRef, useState } from "react";
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
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chatFilter, setChatFilter] = useState<string>("");
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  useEffect(() => {
    if (!hasLoaded) void load();
  }, [hasLoaded, load]);

  // Clear the delete-confirmation timer on unmount to avoid setState after
  // unmount if the user navigates away within 2.5 s of clicking Delete.
  useEffect(() => {
    return () => {
      if (confirmTimerRef.current !== null) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    };
  }, []);

  const armConfirmDelete = (id: string) => {
    if (confirmTimerRef.current !== null) clearTimeout(confirmTimerRef.current);
    setConfirmingDelete(id);
    confirmTimerRef.current = setTimeout(() => {
      setConfirmingDelete(null);
      confirmTimerRef.current = null;
    }, 2500);
  };

  const cancelConfirmDelete = () => {
    if (confirmTimerRef.current !== null) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    setConfirmingDelete(null);
  };

  const filtered = useMemo(() => {
    if (!chatFilter) return assets;
    return assets.filter((a) => a.chatId === chatFilter);
  }, [assets, chatFilter]);

  const selected = useMemo(() => assets.find((a) => a.id === selectedId), [assets, selectedId]);

  return (
    <div className="flex h-full min-h-0">
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 soft-separator-y mesh-header mesh-surface">
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
            <div className="flex items-center justify-center h-full text-text-muted gap-2 text-[13px]">
              <Spinner className="text-text-muted" /> Loading assets…
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState>{hasLoaded ? "No assets yet" : ""}</EmptyState>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map((a) => (
                <div
                  key={a.id}
                  className={`group bg-surface border rounded-xl overflow-hidden transition-colors ${a.id === selectedId ? "border-[var(--color-accent)]/50" : "border-border hover:border-accent/40"}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className="block w-full text-left"
                  >
                    <div className="aspect-video w-full bg-surface-elevated border-b border-border/40">
                      {a.url ? (
                        <img src={a.url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-text-muted text-[11px]">no image</div>
                      )}
                    </div>
                    <div className="p-2">
                      <div className="text-[11px] text-text-secondary line-clamp-2">{truncate(a.prompt, 120)}</div>
                      <div className="text-[10px] text-text-muted mt-0.5">{a.model} · {formatRelativeTime(a.createdAt)}</div>
                    </div>
                  </button>
                  <div className="px-2 pb-2">
                    {confirmingDelete === a.id ? (
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void remove(a.id);
                            cancelConfirmDelete();
                            setSelectedId(null);
                          }}
                          className="flex-1 text-[11px] py-1 rounded border border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
                        >
                          Delete?
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); cancelConfirmDelete(); }}
                          className="text-[11px] py-1 px-2 rounded text-text-muted hover:text-text-primary"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); armConfirmDelete(a.id); }}
                        aria-label="Delete asset"
                        className="w-full text-[11px] py-1 rounded text-text-muted hover:text-rose-300 transition-colors"
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
      <div className="w-80 shrink-0 soft-separator-x mesh-surface overflow-y-auto p-3 space-y-2">
        {selected ? (
          <>
            <div className="aspect-video w-full rounded-lg overflow-hidden border border-border bg-surface-elevated">
              {selected.url ? (
                <img src={selected.url} alt="" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-text-muted text-[11px]">no image</div>
              )}
            </div>
            <div className="text-[12px] text-text-secondary whitespace-pre-wrap">{selected.prompt}</div>
            <div className="text-[11px] text-text-muted space-y-0.5">
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
          <div className="text-[12px] text-text-muted italic">Click an asset to preview.</div>
        )}
      </div>
    </div>
  );
}
