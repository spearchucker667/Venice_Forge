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
    if (image) {
      // Capture the element that triggered the modal so we can return focus on close.
      returnFocusRef.current = document.activeElement;
      document.body.style.overflow = "hidden";
      setTimeout(() => downloadRef.current?.focus(), 50);
    } else {
      document.body.style.overflow = "";
      if (returnFocusRef.current instanceof HTMLElement) {
        returnFocusRef.current.focus();
      }
      returnFocusRef.current = null;
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [image]);

  useFocusTrap(modalRef, !!image, onClose);

  if (!image) return null;

  const truncatedAlt = image.prompt?.length > 120
    ? image.prompt.slice(0, 117) + "…"
    : image.prompt;

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-black/60 p-6 backdrop-blur-2xl animate-[fadeIn_0.3s_ease]"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="flex w-full max-w-4xl max-h-[90vh] flex-col overflow-hidden rounded-3xl border border-white/10 bg-zinc-900/95 shadow-[0_24px_64px_rgba(0,0,0,0.6),0_0_0_1px_rgba(139,92,246,0.1)] backdrop-blur-xl animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] md:flex-row"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Image pane */}
        <div className="flex flex-1 items-center justify-center overflow-hidden bg-black/50 md:max-w-[55%]">
          <img src={image.image} alt={truncatedAlt} className="max-h-[60vh] w-full object-contain md:max-h-full" />
        </div>

        {/* Details pane */}
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
          <div className="flex items-center justify-between">
            <h2 id="modal-title" className="text-lg font-display font-semibold text-white">Image details</h2>
            <button className="btn" onClick={onClose} aria-label="Close modal">Close</button>
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-zinc-500">Prompt</div>
              <div className="max-h-[120px] overflow-y-auto rounded-xl border border-white/5 bg-black/30 p-3 text-sm text-zinc-300">
                {image.prompt}
              </div>
            </div>

            {image.negative && (
              <div>
                <div className="mb-1 text-xs font-bold uppercase tracking-wider text-zinc-500">Negative prompt</div>
                <div className="max-h-[80px] overflow-y-auto rounded-xl border border-white/5 bg-black/30 p-3 text-sm text-zinc-300">
                  {image.negative}
                </div>
              </div>
            )}

            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-wider text-zinc-500">Details</div>
              <div className="space-y-1 text-sm text-zinc-300">
                <div><span className="font-medium text-zinc-400">Model:</span> {image.model}</div>
                {image.width && image.height && (
                  <div><span className="font-medium text-zinc-400">Size:</span> {image.width} × {image.height}</div>
                )}
                <div>
                  <span className="font-medium text-zinc-400">Timestamp:</span>{" "}
                  {image.timestamp ? new Date(image.timestamp).toLocaleString() : "unknown"}
                </div>
                {image.batchCount && image.batchCount > 1 && (
                  <div><span className="font-medium text-zinc-400">Batch:</span> {image.batchIndex}/{image.batchCount}</div>
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
            <button
              className="btn primary"
              onClick={onUpscale}
              disabled={isUpscaling || image.upscaled}
            >
              {isUpscaling ? "Upscaling..." : image.upscaled ? "Already upscaled" : "Enhance & upscale"}
            </button>
            <button
              className="btn danger col-span-2"
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
