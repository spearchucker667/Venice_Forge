import React, { useState, useRef, useCallback } from "react";
import StorageService from "../services/storageService";
import { galleryFilename } from "../utils/image";
import { downloadImage } from "../utils/download";
import { upscaleGalleryImage, downloadAllGallery } from "../services/imageWorkflowService";
import { Chip } from "../components/Chip";
import { StatusBlock } from "../components/StatusBlock";
import { ImageActionModal } from "../components/ImageActionModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { ModuleProps } from "../types/app";
import { GalleryImage, FileRecord } from "../types/storage";

type GalleryTab = "images" | "files" | "chats";

type PendingConfirm = { message: string; detail?: string; onConfirm: () => Promise<void> | void };

export function GalleryModule({ state, dispatch }: ModuleProps) {
  const [activeTab, setActiveTab] = useState<GalleryTab>("images");
  const [expanded, setExpanded] = useState<GalleryImage | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [upscalingId, setUpscalingId] = useState("");
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const cancelDownloadRef = useRef(false);

  function confirm(message: string, detail: string, action: () => Promise<void> | void) {
    setPendingConfirm({ message, detail, onConfirm: action });
  }

  function removeImage(id: string) {
    confirm(
      "Delete this image?",
      "This image will be permanently removed from the gallery. This cannot be undone.",
      async () => {
        await StorageService.deleteItem("images", id);
        const items = await StorageService.getItems<GalleryImage>("images");
        dispatch({ type: "SET_GALLERY", items });
        if (expanded?.id === id) setExpanded(null);
      }
    );
  }

  function clearImages() {
    confirm(
      "Delete ALL gallery images?",
      "Every saved image will be permanently deleted from IndexedDB. This cannot be undone.",
      async () => {
        await StorageService.clearStore("images");
        dispatch({ type: "SET_GALLERY", items: [] });
        setExpanded(null);
      }
    );
  }

  function removeFile(id: string) {
    confirm(
      "Delete this file?",
      "This file will be permanently removed from the library. This cannot be undone.",
      async () => {
        await StorageService.deleteItem("files", id);
        const items = await StorageService.getItems<FileRecord>("files");
        dispatch({ type: "SET_FILES", items });
      }
    );
  }

  function clearFiles() {
    confirm(
      "Delete ALL files?",
      "Every saved file will be permanently deleted from IndexedDB. This cannot be undone.",
      async () => {
        await StorageService.clearStore("files");
        dispatch({ type: "SET_FILES", items: [] });
      }
    );
  }

  async function upscale(item: GalleryImage) {
    setError("");
    setStatus("");
    setUpscalingId(item.id);
    try {
      const saved = await upscaleGalleryImage(item, dispatch, { model: state.selectedImageModel });
      setExpanded(saved);
      setStatus(`Enhanced/upscaled copy saved: ${saved.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upscale failed";
      setError(message);
      dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: message, type: "error" } });
    } finally {
      setUpscalingId("");
    }
  }

  async function startDownloadAll() {
    cancelDownloadRef.current = false;
    setDownloadProgress({ current: 0, total: Math.min(state.gallery.length, 50) });
    try {
      await downloadAllGallery(
        state.gallery,
        (msg, type) => dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: msg, type } }),
        {
          onProgress: (current, total) => setDownloadProgress({ current, total }),
          cancelSignal: cancelDownloadRef,
        }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Download failed";
      dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message, type: "error" } });
    } finally {
      setDownloadProgress(null);
      cancelDownloadRef.current = false;
    }
  }

  function cancelDownloadAll() {
    cancelDownloadRef.current = true;
  }

  const tabBtn = useCallback(
    (id: GalleryTab, label: string, count: number) => (
      <button
        key={id}
        onClick={() => setActiveTab(id)}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
          activeTab === id
            ? "bg-accent/20 text-accent border border-accent/30"
            : "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
        }`}
      >
        {label} <span className="ml-1 text-xs opacity-70">{count}</span>
      </button>
    ),
    [activeTab]
  );

  return (
    <section className="flex flex-col h-full bg-bg">
      <div className="flex-none p-6 border-b border-border/40 bg-bg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-semibold tracking-tight text-text-primary">Library</h2>
            <div className="text-sm text-text-secondary mt-1">
              Generated images and uploaded files are stored locally. Desktop chat records use the app chat-history folder; web-mode legacy chats use IndexedDB.
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          {tabBtn("images", "Media", state.gallery.length)}
          {tabBtn("files", "Files", state.files.length)}
          {tabBtn("chats", "Chats", state.chats?.length || 0)}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <StatusBlock error={error} success={status} />

        {activeTab === "images" && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Chip>{state.gallery.length} items</Chip>
              {downloadProgress ? (
                <div className="flex items-center gap-2">
                  <Chip>Saving {downloadProgress.current}/{downloadProgress.total}…</Chip>
                  <button className="btn danger sm" onClick={cancelDownloadAll}>Cancel</button>
                </div>
              ) : (
                <button className="btn" onClick={startDownloadAll} disabled={!state.gallery.length}>
                  Save all media
                </button>
              )}
              <button className="btn danger" onClick={clearImages} disabled={!state.gallery.length}>
                Clear media gallery
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
              {state.gallery.map((item: GalleryImage) => (
                <div className="group relative flex flex-col rounded-2xl border border-border/50 bg-surface-elevated/40 overflow-hidden transition-all duration-300 hover:border-accent/50 hover:shadow-[0_8px_32px_var(--glow)]" key={item.id}>
                  <button
                    type="button"
                    onClick={() => setExpanded(item)}
                    aria-label={`View details: ${item.prompt || "Generated media"}`}
                    aria-haspopup="dialog"
                    aria-expanded={expanded?.id === item.id}
                    className="w-full relative aspect-square overflow-hidden bg-surface/60 outline-none"
                  >
                    {item.mediaType === "video" ? (
                      <video
                        src={item.image}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        muted
                        loop
                        playsInline
                        onMouseEnter={(e) => e.currentTarget.play().catch(() => {})}
                        onMouseLeave={(e) => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }}
                      />
                    ) : (
                      <img
                        src={item.image}
                        alt={item.prompt || "Generated image"}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  </button>
                  <div className="flex flex-col p-4 gap-3 bg-bg">
                    <div className="flex items-center flex-wrap gap-2 text-sm text-text-primary">
                      <strong className="font-semibold">{item.model}</strong>
                      {item.upscaled && <Chip className="scale-90 origin-left">upscaled</Chip>}
                      {item.mediaType === "video" && <Chip className="scale-90 origin-left">video</Chip>}
                      {item.batchCount && item.batchCount > 1 && <Chip className="scale-90 origin-left">Batch {item.batchIndex}/{item.batchCount}</Chip>}
                    </div>
                    <div className="text-[11px] font-medium tracking-wide text-text-muted uppercase">
                      {new Date(item.timestamp).toLocaleString()}
                    </div>
                    <div className="text-sm text-text-secondary line-clamp-2" title={item.prompt}>{item.prompt}</div>
                    <div className="flex flex-wrap gap-2 pt-2 mt-auto">
                      <button className="btn sm" onClick={async () => {
                        await downloadImage(item.image, galleryFilename(item));
                        dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Downloaded image", type: "info" } });
                      }}>Download</button>
                      <button className="btn sm" onClick={() => upscale(item)} disabled={upscalingId === item.id || item.image?.startsWith("http") || item.upscaled}>
                        {upscalingId === item.id ? "Enhancing…" : "Enhance"}
                      </button>
                      <button className="btn danger sm ml-auto" onClick={() => removeImage(item.id)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {!state.gallery.length && (
              <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-accent/20 bg-accent/5 p-12 text-center shadow-[inset_0_0_40px_var(--glow)]">
                <img src="./assets/branding/venice-keys-red.svg" alt="" className="h-12 w-12 opacity-20" aria-hidden="true" />
                <div className="text-sm text-accent/80">No saved images yet. Generate an image and it will auto-save here.</div>
              </div>
            )}
          </>
        )}

        {activeTab === "files" && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Chip>{state.files.length} files</Chip>
              <button className="btn danger" onClick={clearFiles} disabled={!state.files.length}>Clear all files</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {state.files.map((file: FileRecord) => (
                <div className="rounded-xl bg-surface/50 border border-border/50 p-4 transition-all hover:border-border" key={file.id}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-text-primary truncate max-w-[200px]" title={file.name}>{file.name}</span>
                      <Chip className="scale-90 origin-left">{file.type}</Chip>
                    </div>
                    <button className="btn danger sm" onClick={() => removeFile(file.id)}>Delete</button>
                  </div>
                  <div className="text-xs text-text-muted mb-2">{new Date(file.timestamp).toLocaleString()} · {(file.size / 1024).toFixed(1)} KiB</div>
                  <div className="text-xs text-text-secondary line-clamp-3 font-mono">{file.content.slice(0, 200)}{file.content.length > 200 ? "…" : ""}</div>
                </div>
              ))}
              {!state.files.length && (
                <div className="col-span-full flex flex-col items-center justify-center gap-4 rounded-2xl border border-accent/20 bg-accent/5 p-12 text-center shadow-[inset_0_0_40px_var(--glow)]">
                  <img src="./assets/branding/venice-keys-red.svg" alt="" className="h-12 w-12 opacity-20" aria-hidden="true" />
                  <div className="text-sm text-accent/80">No saved files yet. Attach a file in chat and it will appear here.</div>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === "chats" && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Chip>{state.chats?.length || 0} chats</Chip>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(state.chats || []).slice(0, 24).map((c) => (
                <div className="rounded-xl bg-surface/50 border border-border/50 p-4 transition-all hover:border-border" key={c.id}>
                  <div className="text-sm text-text-secondary mb-2">
                    <strong className="text-text-primary">{c.model}</strong>
                    <span className="text-text-muted mx-2">·</span>
                    <span className="text-text-muted text-xs">{new Date(c.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="text-sm text-text-secondary line-clamp-2">{c.prompt}</div>
                </div>
              ))}
              {!(state.chats?.length) && (
                <div className="col-span-full flex flex-col items-center justify-center gap-4 rounded-2xl border border-accent/20 bg-accent/5 p-12 text-center shadow-[inset_0_0_40px_var(--glow)]">
                  <img src="./assets/branding/venice-keys-red.svg" alt="" className="h-12 w-12 opacity-20" aria-hidden="true" />
                  <div className="text-sm text-accent/80">No saved chat completions yet.</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <ImageActionModal
        image={expanded}
        isUpscaling={expanded ? upscalingId === expanded.id : false}
        onClose={() => setExpanded(null)}
        onDownload={async () => {
          if (!expanded) return;
          await downloadImage(expanded.image, galleryFilename(expanded));
          dispatch({ type: "ADD_TOAST", toast: { id: crypto.randomUUID(), message: "Downloaded image", type: "info" } });
        }}
        onUpscale={() => expanded && upscale(expanded)}
        onDelete={() => expanded && removeImage(expanded.id)}
      />

      <ConfirmModal
        open={!!pendingConfirm}
        message={pendingConfirm?.message || ""}
        detail={pendingConfirm?.detail}
        confirmLabel="Delete"
        onConfirm={async () => {
          try {
            await pendingConfirm?.onConfirm();
            setPendingConfirm(null);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Operation failed");
            setPendingConfirm(null);
          }
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </section>
  );
}
