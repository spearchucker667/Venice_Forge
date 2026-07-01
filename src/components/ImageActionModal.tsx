import React, { useEffect, useRef } from "react";
import { Chip } from "./Chip";
import { GalleryImage } from "../types/storage";
import { useFocusTrap } from "../hooks/useFocusTrap";

interface ImageActionModalProps {
  image: GalleryImage | null;
  isUpscaling?: boolean;
  onClose: () => void;
  onDownload: () => void;
  onUpscale: () => void;
  onDelete: () => void;
}

export function ImageActionModal({
  image,
  isUpscaling,
  onClose,
  onDownload,
  onUpscale,
  onDelete,
}: ImageActionModalProps) {
  const downloadRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!image) return;

    // Capture the element that triggered the modal so we can return focus on close.
    returnFocusRef.current = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimeout = setTimeout(() => downloadRef.current?.focus(), 50);

    return () => {
      clearTimeout(focusTimeout);
      document.body.style.overflow = originalOverflow;
      if (returnFocusRef.current instanceof HTMLElement) {
        returnFocusRef.current.focus();
      }
    };
  }, [image]);

  useFocusTrap(modalRef, !!image, onClose);

  if (!image) return null;

  const promptText = image.prompt?.trim() || "Generated media";
  const truncatedAlt =
    promptText.length > 120 ? promptText.slice(0, 117) + "…" : promptText;

  const isVideo = image.mediaType === "video" || image.mediaType === "audio";
  const mediaSrc = isVideo ? (image.downloadUrl || image.image) : image.image;

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-overlay/60 p-6 backdrop-blur-2xl animate-[fadeIn_0.3s_ease]"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-3xl border border-border/50 bg-surface/95 shadow-[0_24px_64px_var(--overlay),0_0_0_1px_var(--glow)] backdrop-blur-xl animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] md:flex-row focus:outline-none"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Image/Video pane */}
        <div className="flex flex-1 items-center justify-center overflow-hidden bg-surface/60 md:max-w-[55%]">
          {isVideo ? (
            <video
              src={mediaSrc}
              className="max-h-[60vh] w-full object-contain md:max-h-full"
              controls
              playsInline
            />
          ) : (
            <img src={mediaSrc} alt={truncatedAlt} className="max-h-[60vh] w-full object-contain md:max-h-full" />
          )}
        </div>

        {/* Details pane */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
          <div className="flex items-center justify-between">
            <h2 id="modal-title" className="text-lg font-display font-semibold text-text-primary">
              {isVideo ? "Video details" : "Image details"}
            </h2>
            <button className="btn" onClick={onClose} aria-label="Close modal">Close</button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-text-muted">Prompt</div>
              <div className="max-h-[120px] overflow-y-auto rounded-xl border border-border/50 bg-surface/40 p-3 text-sm text-text-secondary">
                {image.prompt}
              </div>
            </div>

            {image.negative && (
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-wider text-text-muted">Negative prompt</div>
                <div className="max-h-[80px] overflow-y-auto rounded-xl border border-border/50 bg-surface/40 p-3 text-sm text-text-secondary">
                  {image.negative}
                </div>
              </div>
            )}

            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-text-muted">Details</div>
              <div className="space-y-1 text-sm text-text-secondary">
                <div><span className="font-medium text-text-secondary">Model:</span> {image.model}</div>
                {image.width && image.height && (
                  <div><span className="font-medium text-text-secondary">Size:</span> {image.width} × {image.height}</div>
                )}
                <div>
                  <span className="font-medium text-text-secondary">Timestamp:</span>{" "}
                  {image.timestamp ? new Date(image.timestamp).toLocaleString() : "unknown"}
                </div>
                {image.batchCount && image.batchCount > 1 && (
                  <div><span className="font-medium text-text-secondary">Batch:</span> {image.batchIndex}/{image.batchCount}</div>
                )}
                {image.upscaled && (
                  <div className="mt-2">
                    <Chip tone="ok">Upscaled</Chip>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-auto grid grid-cols-2 gap-3 pt-4">
            <button ref={downloadRef} className="btn" onClick={onDownload}>
              Download
            </button>
            {!isVideo && (
              <button
                className="btn primary"
                onClick={onUpscale}
                disabled={isUpscaling || image.upscaled}
              >
                {isUpscaling ? "Upscaling..." : image.upscaled ? "Already upscaled" : "Enhance & upscale"}
              </button>
            )}
            <button
              className={`btn danger ${!isVideo ? "col-span-2" : ""}`}
              onClick={onDelete}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
