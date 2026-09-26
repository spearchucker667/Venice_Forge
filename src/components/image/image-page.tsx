import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { ImageView } from "./image-view";
import { ImageTools } from "./image-tools";
import { cn } from "../../lib/utils";
import { useImageWorkspaceStore } from "../../stores/image-workspace-store";

type ImageTab = "generate" | "tools";

export function ImagePage() {
  const { t: tRuntime } = useTranslation("common");
  const [tab, setTab] = useState<ImageTab>("generate");
  const pendingTarget = useImageWorkspaceStore(
    (state) => state.pending?.target,
  );

  useEffect(() => {
    if (pendingTarget === "tools") setTab("tools");
    if (pendingTarget === "generate") setTab("generate");
  }, [pendingTarget]);

  return (
    <div className="flex flex-col h-full bg-bg">
      <div className="flex items-center gap-1 px-4 py-2.5 border-b border-border bg-surface/50">
        {(["generate", "tools"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "text-[14px] font-medium px-2.5 py-[3px] rounded-full transition-all duration-150",
              tab === t
                ? "bg-accent text-accent-fg shadow-[0_0_8px_var(--color-vf-accent-glow)]"
                : "bg-surface-elevated text-text-muted hover:text-text-primary hover:bg-surface-muted",
            )}
          >
            {t === "generate"
              ? tRuntime(
                  "runtimeGenerated.components.image.imagePage.text.generate",
                )
              : tRuntime("imageCapabilities.toolsTab")}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {tab === "generate" ? <ImageView /> : <ImageTools />}
      </div>
    </div>
  );
}
