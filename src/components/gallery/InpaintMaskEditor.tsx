/** @fileoverview Modal mask editor for Media Studio inpainting.
 *
 * Loads the selected asset, lets the user paint a mask over it with pointer
 * input (brush size control, clear, per-stroke undo), attaches an optional
 * edit prompt, and submits the mask as a PNG blob to the canonical derived
 * operations service. Escape closes via AccessibleDialog; Cancel aborts an
 * in-flight request.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibleDialog } from "../ui/AccessibleDialog";
import { ErrorText, Label, PrimaryButton, TextArea } from "../ui/shared";
import { useTranslation } from "react-i18next";
import { toast } from "../../stores/toast-store";
import {
  resolveMediaItemImageInput,
  runImageDerivedOperation,
} from "../../services/imageDerivedOperations";
import type { MediaItem } from "../../types/media";

const MAX_DISPLAY_DIMENSION = 520;

interface InpaintMaskEditorProps {
  item: MediaItem;
  /** Edit-capable model id used for the inpaint request. */
  modelId: string;
  onClose: () => void;
}

interface StrokeSnapshot {
  imageData: ImageData;
}

export function InpaintMaskEditor({ item, modelId, onClose }: InpaintMaskEditorProps) {
  const { t } = useTranslation("media");
  const panelRef = useRef<HTMLDivElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const undoStackRef = useRef<StrokeSnapshot[]>([]);
  const paintingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [brushSize, setBrushSize] = useState(40);
  const [hasMask, setHasMask] = useState(false);
  const [canUndo, setCanUndo] = useState(false);

  const renderComposite = useCallback(() => {
    const display = displayCanvasRef.current;
    const mask = maskCanvasRef.current;
    if (!display || !mask) return;
    const ctx = display.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, display.width, display.height);
    if (baseCanvasRef.current) {
      ctx.drawImage(baseCanvasRef.current, 0, 0, display.width, display.height);
    }
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.drawImage(mask, 0, 0, display.width, display.height);
    ctx.restore();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const input = await resolveMediaItemImageInput(item);
        const image = new Image();
        image.onload = () => {
          if (cancelled) return;
          const scale = Math.min(
            1,
            MAX_DISPLAY_DIMENSION / image.naturalWidth,
            MAX_DISPLAY_DIMENSION / image.naturalHeight,
          );
          const width = Math.max(1, Math.round(image.naturalWidth * scale));
          const height = Math.max(1, Math.round(image.naturalHeight * scale));
          const display = displayCanvasRef.current;
          if (!display) return;
          display.width = width;
          display.height = height;
          const displayCtx = display.getContext("2d");
          if (!displayCtx) return;
          const base = document.createElement("canvas");
          base.width = width;
          base.height = height;
          const baseCtx = base.getContext("2d");
          if (!baseCtx) return;
          baseCtx.drawImage(image, 0, 0, width, height);
          baseCanvasRef.current = base;
          const mask = document.createElement("canvas");
          mask.width = width;
          mask.height = height;
          maskCanvasRef.current = mask;
          undoStackRef.current = [];
          renderComposite();
        };
        image.onerror = () => {
          if (!cancelled) setLoadError(t("mediaStudioActions.editor.loadFailed"));
        };
        image.src = input;
      } catch {
        if (!cancelled) setLoadError(t("mediaStudioActions.editor.loadFailed"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [item, renderComposite, t]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const canvasPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const display = displayCanvasRef.current;
    if (!display) return null;
    const rect = display.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * display.width,
      y: ((event.clientY - rect.top) / rect.height) * display.height,
    };
  };

  const paintLine = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const mask = maskCanvasRef.current;
    const ctx = mask?.getContext("2d");
    if (!mask || !ctx) return;
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const mask = maskCanvasRef.current;
    const ctx = mask?.getContext("2d");
    const point = canvasPoint(event);
    if (!mask || !ctx || !point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    undoStackRef.current.push({ imageData: ctx.getImageData(0, 0, mask.width, mask.height) });
    setCanUndo(true);
    paintingRef.current = true;
    lastPointRef.current = point;
    paintLine(point, point);
    setHasMask(true);
    renderComposite();
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!paintingRef.current) return;
    const point = canvasPoint(event);
    const last = lastPointRef.current;
    if (!point || !last) return;
    paintLine(last, point);
    lastPointRef.current = point;
    renderComposite();
  };

  const handlePointerUp = () => {
    paintingRef.current = false;
    lastPointRef.current = null;
  };

  const handleUndo = () => {
    const mask = maskCanvasRef.current;
    const ctx = mask?.getContext("2d");
    const snapshot = undoStackRef.current.pop();
    if (!mask || !ctx || !snapshot) return;
    ctx.putImageData(snapshot.imageData, 0, 0);
    setCanUndo(undoStackRef.current.length > 0);
    if (undoStackRef.current.length === 0) {
      setHasMask(isMaskNonEmpty(ctx, mask));
    }
    renderComposite();
  };

  const handleClear = () => {
    const mask = maskCanvasRef.current;
    const ctx = mask?.getContext("2d");
    if (!mask || !ctx) return;
    ctx.clearRect(0, 0, mask.width, mask.height);
    undoStackRef.current = [];
    setCanUndo(false);
    setHasMask(false);
    renderComposite();
  };

  const handleSubmit = async () => {
    const mask = maskCanvasRef.current;
    if (!mask || submitting) return;
    const maskBlob = await new Promise<Blob | null>((resolve) =>
      mask.toBlob((value) => resolve(value), "image/png"),
    );
    if (!maskBlob || maskBlob.size === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setSubmitting(true);
    setSubmitError(null);
    const outcome = await runImageDerivedOperation({
      sourceAsset: item,
      operation: { kind: "inpaint", mask: maskBlob, prompt: prompt.trim() || undefined },
      modelId,
      signal: controller.signal,
    });
    setSubmitting(false);
    if (outcome.status === "completed") {
      toast.success(t("mediaStudioActions.editor.success"));
      onClose();
    } else if (outcome.status === "cancelled") {
      onClose();
    } else {
      setSubmitError(outcome.error);
      setRetryable(outcome.retryable);
    }
  };

  const handleCancel = () => {
    if (submitting) {
      abortRef.current?.abort();
      return;
    }
    onClose();
  };

  return (
    <AccessibleDialog
      panelRef={panelRef}
      onClose={handleCancel}
      title={t("mediaStudioActions.editor.title")}
      description={t("mediaStudioActions.editor.description")}
      panelClassName="max-w-2xl"
    >
      <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
        {loadError ? (
          <ErrorText>{loadError}</ErrorText>
        ) : (
          <div className="flex justify-center">
            <canvas
              ref={displayCanvasRef}
              data-testid="inpaint-mask-canvas"
              aria-label={t("mediaStudioActions.editor.canvasLabel")}
              className="max-h-[420px] w-auto max-w-full touch-none rounded-md border border-vf-panel-border bg-vf-panel-bg-raised"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            />
          </div>
        )}

        <p className="truncate text-[12px] text-text-muted" title={item.prompt}>
          {item.prompt}
        </p>

        <div className="flex flex-wrap items-center gap-3 text-[12px] text-text-muted">
          <Label>{t("mediaStudioActions.editor.brushSize")}</Label>
          <input
            type="range"
            min={8}
            max={120}
            step={4}
            value={brushSize}
            aria-label={t("mediaStudioActions.editor.brushSize")}
            onChange={(event) => setBrushSize(Number(event.target.value))}
            className="w-40"
          />
          <span className="font-mono">{brushSize}px</span>
          <button
            type="button"
            onClick={handleUndo}
            disabled={!canUndo}
            className="rounded-md border border-vf-panel-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30"
          >
            {t("mediaStudioActions.editor.undo")}
          </button>
          <button
            type="button"
            onClick={handleClear}
            disabled={!hasMask}
            className="rounded-md border border-vf-panel-border px-2 py-1 text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30"
          >
            {t("mediaStudioActions.editor.clear")}
          </button>
        </div>

        <div>
          <Label>{t("mediaStudioActions.editor.promptLabel")}</Label>
          <TextArea
            value={prompt}
            onChange={setPrompt}
            rows={2}
            placeholder={t("mediaStudioActions.editor.promptPlaceholder")}
          />
        </div>

        {submitError && (
          <div className="flex flex-wrap items-center gap-2">
            <ErrorText>{submitError}</ErrorText>
            {retryable && (
              <button
                type="button"
                onClick={() => void handleSubmit()}
                data-testid="inpaint-retry"
                className="rounded-md border border-vf-panel-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
              >
                {t("mediaStudioActions.retry")}
              </button>
            )}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-vf-panel-border px-5 py-3">
        <button
          type="button"
          onClick={handleCancel}
          data-testid="inpaint-cancel"
          className="rounded-md border border-vf-panel-border px-3 py-1.5 text-[13px] text-text-secondary hover:border-accent hover:text-accent"
        >
          {submitting ? t("mediaStudioActions.cancel") : t("mediaStudioActions.editor.cancel")}
        </button>
        <PrimaryButton
          onClick={() => void handleSubmit()}
          disabled={!hasMask || !prompt.trim() || !!loadError || submitting}
          loading={submitting}
          fullWidth={false}
        >
          {t("mediaStudioActions.editor.submit")}
        </PrimaryButton>
      </footer>
    </AccessibleDialog>
  );
}

function isMaskNonEmpty(ctx: CanvasRenderingContext2D, mask: HTMLCanvasElement): boolean {
  const pixels = ctx.getImageData(0, 0, mask.width, mask.height).data;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] !== 0) return true;
  }
  return false;
}
