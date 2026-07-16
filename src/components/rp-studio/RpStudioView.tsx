/**
 * @fileoverview RP Studio orchestrator — sub-tab bar + the active view.
 *
 * Sub-tabs: Library / Personas / Lorebooks / Chats / Scenes (which holds
 * the scene generator and the gallery side-by-side).
 *
 * Hydration gate: in Electron mode, RP Studio surfaces a top-of-pane banner
 * until the main-process config snapshot has hydrated into the renderer.
 * This is the visible half of the hydration contract enforced by
 * `src/safetyHydration.ts` (VERIFY-017); the runtime half is the throw on
 * `getEffectiveRenderer*()` calls. Sub-components additionally disable
 * their safety-sensitive save buttons while the banner is showing.
 */

import { lazy, Suspense, useEffect, useState } from "react";
import { CharacterLibrary } from "./CharacterLibrary";
import { PersonaManager } from "./PersonaManager";
import { LorebookManager } from "./LorebookManager";
import { RpChatList } from "./RpChatList";
import { RpChatView } from "./RpChatView";
import { SceneGenerator } from "./SceneGenerator";
import { AssetGallery } from "./AssetGallery";
import { PromptDebugDrawer } from "./PromptDebugDrawer";
import type { PromptAssemblyResult } from "../../types/rp";
import { PillGroup } from "../ui/shared";
import { useRendererConfigHydrated } from "../../safetyHydration";
import { isElectron } from "../../services/desktopBridge";
import { useCharacterCardStore } from "../../stores/character-card-store";

const CharacterEditor = lazy(async () => {
  const module = await import("./CharacterEditor");
  return { default: module.CharacterEditor };
});

const SUB_TABS = [
  { id: "library", label: "Characters" },
  { id: "personas", label: "Personas" },
  { id: "lorebooks", label: "Lorebooks" },
  { id: "chats", label: "Chats" },
  { id: "scenes", label: "Scenes" },
] as const;
type SubTab = (typeof SUB_TABS)[number]["id"];

type SceneSubView = "generate" | "gallery";

export function RpStudioView() {
  const [sub, setSub] = useState<SubTab>("library");
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const [openSceneChatId, setOpenSceneChatId] = useState<string | null>(null);
  const [debugAssembly, setDebugAssembly] = useState<PromptAssemblyResult | null>(null);
  const [sceneView, setSceneView] = useState<SceneSubView>("generate");
  const hydrated = useRendererConfigHydrated();
  const showHydrationBanner = isElectron() && !hydrated;
  const externallyEditingCardId = useCharacterCardStore((state) => state.editingId);

  useEffect(() => {
    if (externallyEditingCardId) { setSub("library"); setEditingCardId(externallyEditingCardId); }
  }, [externallyEditingCardId]);

  useEffect(() => {
    setEditingCardId(null);
    setOpenChatId(null);
    setOpenSceneChatId(null);
  }, [sub]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 soft-separator-y mesh-header mesh-surface overflow-x-auto">
        <div className="text-[12px] uppercase tracking-[0.08em] text-text-muted font-semibold mr-2 shrink-0">RP Studio</div>
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            aria-pressed={sub === t.id}
            className={`text-[12.5px] px-2.5 py-1 rounded-md border transition-colors shrink-0 ${sub === t.id ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-border text-text-secondary hover:text-text-primary"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showHydrationBanner && (
        <div
          role="status"
          aria-live="polite"
          className="px-3 py-2 border-b border-amber-500/20 bg-amber-500/10 text-amber-100 text-[12.5px] flex items-center gap-2"
        >
          <span aria-hidden="true">⏳</span>
          <span>
            Local config is still loading. RP Studio save controls are
            temporarily unavailable until the safety settings snapshot
            has hydrated.
          </span>
        </div>
      )}

      {sub === "scenes" && (
        <div className="px-3 py-1.5 soft-separator-y mesh-surface">
          <PillGroup
            options={[{ value: "generate", label: "Generate" }, { value: "gallery", label: "Gallery" }]}
            value={sceneView}
            onChange={(v) => setSceneView(v as SceneSubView)}
            ariaLabel="Scenes sub-view"
          />
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        {sub === "library" && (editingCardId ? (
          <Suspense fallback={<div className="flex h-full items-center justify-center text-[12px] text-text-muted" role="status">Loading ST Card Studio…</div>}>
            <CharacterEditor cardId={editingCardId} onClose={() => setEditingCardId(null)} disabled={showHydrationBanner} />
          </Suspense>
        ) : (
          <CharacterLibrary onEdit={(id) => setEditingCardId(id)} />
        ))}
        {sub === "personas" && <PersonaManager disabled={showHydrationBanner} />}
        {sub === "lorebooks" && <LorebookManager disabled={showHydrationBanner} />}
        {sub === "chats" && (openChatId ? (
          <RpChatView
            chatId={openChatId}
            onBack={() => setOpenChatId(null)}
            onOpenScene={(id) => { setOpenSceneChatId(id); setSceneView("generate"); setSub("scenes"); }}
            onOpenDebug={(assembly) => setDebugAssembly(assembly)}
          />
        ) : (
          <RpChatList onOpen={(id) => setOpenChatId(id)} />
        ))}
        {sub === "scenes" && sceneView === "generate" && (
          <SceneGenerator filterChatId={openSceneChatId ?? undefined} disabled={showHydrationBanner} />
        )}
        {sub === "scenes" && sceneView === "gallery" && <AssetGallery />}
      </div>

      {debugAssembly && (
        <PromptDebugDrawer assembly={debugAssembly} onClose={() => setDebugAssembly(null)} />
      )}
    </div>
  );
}
