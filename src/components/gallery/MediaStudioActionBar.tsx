/** @fileoverview Media Studio selection action bar for direct derived-image
 * operations (Upscale 2x/4x, Background Removal, Inpaint). Shown whenever at
 * least one compatible image asset is selected. Unsupported states render
 * DISABLED with a specific reason, never hidden. Multi-select fans out
 * upscale/background-removal sequentially; inpainting is single-select only
 * and opens the mask editor. Failures surface an ErrorText with Retry.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { toast } from "../../stores/toast-store";
import {
  mediaCapabilities,
  mediaItemSource,
} from "../../utils/mediaItem";
import {
  runImageDerivedOperation,
  type ImageDerivedOperation,
} from "../../services/imageDerivedOperations";
import type { MediaItem } from "../../types/media";
import { InpaintMaskEditor } from "./InpaintMaskEditor";
import { ErrorText } from "../ui/shared";
import { cn } from "../../lib/utils";

interface MediaStudioActionBarProps {
  items: MediaItem[];
}

interface ItemJob {
  item: MediaItem;
  operation: ImageDerivedOperation;
  status: "running" | "failed";
  error?: string;
  retryable?: boolean;
}

type ActionGate = { ok: true } | { ok: false; reason: string };

const BUTTON_CLASS =
  "rounded-md border border-vf-panel-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed";

export function MediaStudioActionBar({ items }: MediaStudioActionBarProps) {
  const { t } = useTranslation("media");
  const [upscaleMenuOpen, setUpscaleMenuOpen] = useState(false);
  const [inpaintItem, setInpaintItem] = useState<MediaItem | null>(null);
  const [jobs, setJobs] = useState<ItemJob[]>([]);
  const abortControllersRef = useRef(new Map<string, AbortController>());

  const compatibleItems = useMemo(
    () => items.filter((item) => item.mediaType === "image" && mediaItemSource(item)),
    [items],
  );

  // A changed selection invalidates per-item job state.
  useEffect(() => {
    setJobs((prev) => prev.filter((job) => items.some((item) => item.id === job.item.id)));
  }, [items]);

  useEffect(
    () => () => {
      for (const controller of abortControllersRef.current.values()) controller.abort();
    },
    [],
  );

  const imageSourceGate = useCallback(
    (targets: MediaItem[]): ActionGate => {
      if (targets.some((item) => item.mediaType !== "image")) {
        return { ok: false, reason: t("mediaStudioActions.reason.requiresImage") };
      }
      if (targets.some((item) => !mediaItemSource(item))) {
        return { ok: false, reason: t("mediaStudioActions.reason.sourceUnavailable") };
      }
      return { ok: true };
    },
    [t],
  );

  // Gates run against the FULL selection so unsupported states render
  // disabled with a reason instead of silently operating on a subset.
  const upscaleGate = imageSourceGate;
  const removeBackgroundGate = imageSourceGate;

  const inpaintGate = useCallback((): ActionGate => {
    if (items.length !== 1) {
      return { ok: false, reason: t("mediaStudioActions.reason.singleSelection") };
    }
    const gate = imageSourceGate(items);
    if (!gate.ok) return gate;
    const item = items[0];
    if (!mediaCapabilities({ model: item.model }).edit) {
      return { ok: false, reason: t("mediaStudioActions.reason.modelUnavailable") };
    }
    return { ok: true };
  }, [items, imageSourceGate, t]);

  const jobKey = (itemId: string, operation: ImageDerivedOperation) =>
    `${itemId}:${operation.kind}`;

  const upsertJob = useCallback((job: ItemJob) => {
    setJobs((prev) => {
      const key = jobKey(job.item.id, job.operation);
      const rest = prev.filter((existing) => jobKey(existing.item.id, existing.operation) !== key);
      return [...rest, job];
    });
  }, []);

  const removeJob = useCallback((itemId: string, operation: ImageDerivedOperation) => {
    setJobs((prev) =>
      prev.filter((existing) => jobKey(existing.item.id, existing.operation) !== jobKey(itemId, operation)),
    );
  }, []);

  const runForItem = useCallback(
    async (item: MediaItem, operation: ImageDerivedOperation) => {
      const key = jobKey(item.id, operation);
      const controller = new AbortController();
      abortControllersRef.current.set(key, controller);
      upsertJob({ item, operation, status: "running" });
      const outcome = await runImageDerivedOperation({
        sourceAsset: item,
        operation,
        modelId: operation.kind === "inpaint" ? item.model : undefined,
        signal: controller.signal,
      });
      abortControllersRef.current.delete(key);
      if (outcome.status === "completed") {
        removeJob(item.id, operation);
        return true;
      }
      if (outcome.status === "failed") {
        upsertJob({
          item,
          operation,
          status: "failed",
          error: outcome.error,
          retryable: outcome.retryable,
        });
        return false;
      }
      // cancelled: the job was either replaced by a retry or dropped.
      removeJob(item.id, operation);
      return false;
    },
    [removeJob, upsertJob],
  );

  const runFanOut = useCallback(
    async (operation: ImageDerivedOperation) => {
      const targets =
        operation.kind === "inpaint" ? [items[0]] : compatibleItems;
      let succeeded = 0;
      for (const item of targets) {
        if (await runForItem(item, operation)) succeeded += 1;
      }
      if (succeeded === targets.length && targets.length > 0) {
        toast.success(
          t("mediaStudioActions.done", {
            operation: t(`mediaStudioActions.operationLabels.${operation.kind}`),
            count: succeeded,
          }),
        );
      }
    },
    [compatibleItems, items, runForItem, t],
  );

  const handleCancelAll = () => {
    for (const controller of abortControllersRef.current.values()) controller.abort();
  };

  const anyRunning = jobs.some((job) => job.status === "running");

  if (compatibleItems.length === 0) return null;

  const upscaleState = upscaleGate(items);
  const removeBackgroundState = removeBackgroundGate(items);
  const inpaintState = inpaintGate();
  const inpaintTarget = inpaintState.ok ? items[0] : null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-vf-panel-border bg-vf-panel-bg px-5 py-2 text-[12px]"
      data-testid="media-studio-action-bar"
    >
      <span className="text-text-muted">{t("mediaStudioActions.heading")}</span>

      <div className="relative">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={upscaleMenuOpen}
          disabled={!upscaleState.ok}
          title={upscaleState.ok ? undefined : upscaleState.reason}
          onClick={() => setUpscaleMenuOpen((open) => !open)}
          className={cn(BUTTON_CLASS, "flex items-center gap-1")}
        >
          {t("mediaStudioActions.upscale")}
          <ChevronDown size={12} aria-hidden="true" />
        </button>
        {upscaleMenuOpen && upscaleState.ok && (
          <div
            role="menu"
            aria-label={t("mediaStudioActions.upscale")}
            className="absolute left-0 top-full z-50 mt-1 flex flex-col rounded-md border border-vf-panel-border bg-vf-panel-bg-raised py-1 shadow-lg"
          >
            {([2, 4] as const).map((scale) => (
              <button
                key={scale}
                type="button"
                role="menuitem"
                onClick={() => {
                  setUpscaleMenuOpen(false);
                  void runFanOut({ kind: "upscale", scale });
                }}
                className="px-3 py-1.5 text-left text-[12px] text-text-secondary hover:bg-vf-control-hover hover:text-accent"
              >
                {t(`mediaStudioActions.upscale${scale}x`)}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={!removeBackgroundState.ok}
        title={removeBackgroundState.ok ? undefined : removeBackgroundState.reason}
        onClick={() => void runFanOut({ kind: "remove-background" })}
        className={BUTTON_CLASS}
      >
        {t("mediaStudioActions.removeBackground")}
      </button>

      <button
        type="button"
        disabled={!inpaintState.ok}
        title={inpaintState.ok ? undefined : inpaintState.reason}
        onClick={() => inpaintTarget && setInpaintItem(inpaintTarget)}
        className={BUTTON_CLASS}
      >
        {t("mediaStudioActions.inpaint")}
      </button>

      {anyRunning && (
        <button
          type="button"
          onClick={handleCancelAll}
          className="rounded-md border border-danger/30 px-2 py-1 text-[12px] text-danger hover:bg-danger/10"
        >
          {t("mediaStudioActions.cancel")}
        </button>
      )}

      {jobs.length > 0 && (
        <ul className="flex w-full flex-col gap-1">
          {jobs.map((job) => (
            <li
              key={jobKey(job.item.id, job.operation)}
              className="flex flex-wrap items-center gap-2"
            >
              {job.status === "running" ? (
                <span className="text-text-muted">
                  {t("mediaStudioActions.running", {
                    operation: t(`mediaStudioActions.operationLabels.${job.operation.kind}`),
                    name: jobName(job.item),
                  })}
                </span>
              ) : (
                <>
                  <ErrorText>
                    {t("mediaStudioActions.failed", {
                      operation: t(`mediaStudioActions.operationLabels.${job.operation.kind}`),
                      name: jobName(job.item),
                    })}
                    {": "}
                    {job.error}
                  </ErrorText>
                  <button
                    type="button"
                    onClick={() => void runForItem(job.item, job.operation)}
                    className="rounded-md border border-vf-panel-border px-2 py-1 text-[12px] text-text-secondary hover:border-accent hover:text-accent"
                  >
                    {t("mediaStudioActions.retry")}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {inpaintItem && (
        <InpaintMaskEditor
          item={inpaintItem}
          modelId={inpaintItem.model}
          onClose={() => setInpaintItem(null)}
        />
      )}
    </div>
  );
}

function jobName(item: MediaItem): string {
  const prompt = item.prompt?.trim();
  if (!prompt) return item.id.slice(0, 8);
  return prompt.length > 32 ? `${prompt.slice(0, 32)}…` : prompt;
}
