/**
 * @fileoverview RP Studio orchestrator — sub-tab bar + the active view.
 *
 * Sub-tabs: Library / Personas / Lorebooks / Chats / Scenes (which holds
 * the scene generator and the gallery side-by-side).
 */

import { useEffect, useState } from "react";
import { CharacterLibrary } from "./CharacterLibrary";
import { CharacterEditor } from "./CharacterEditor";
import { PersonaManager } from "./PersonaManager";
import { LorebookManager } from "./LorebookManager";
import { RpChatList } from "./RpChatList";
import { RpChatView } from "./RpChatView";
import { SceneGenerator } from "./SceneGenerator";
import { AssetGallery } from "./AssetGallery";
import { PromptDebugDrawer } from "./PromptDebugDrawer";
import type { PromptAssemblyResult } from "../../types/rp";
import { PillGroup } from "../ui/shared";

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

  useEffect(() => {
    setEditingCardId(null);
    setOpenChatId(null);
    setOpenSceneChatId(null);
  }, [sub]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/[0.06] bg-surface/40 overflow-x-auto">
        <div className="text-[11px] uppercase tracking-[0.08em] text-white/40 font-semibold mr-2 shrink-0">RP Studio</div>
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSub(t.id)}
            aria-pressed={sub === t.id}
            className={`text-[12.5px] px-2.5 py-1 rounded-md border transition-colors shrink-0 ${sub === t.id ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-white/[0.1] text-white/60 hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sub === "scenes" && (
        <div className="px-3 py-1.5 border-b border-white/[0.06]">
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
          <CharacterEditor cardId={editingCardId} onClose={() => setEditingCardId(null)} />
        ) : (
          <CharacterLibrary onEdit={(id) => setEditingCardId(id)} />
        ))}
        {sub === "personas" && <PersonaManager />}
        {sub === "lorebooks" && <LorebookManager />}
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
          <SceneGenerator filterChatId={openSceneChatId ?? undefined} />
        )}
        {sub === "scenes" && sceneView === "gallery" && <AssetGallery />}
      </div>

      {debugAssembly && (
        <PromptDebugDrawer assembly={debugAssembly} onClose={() => setDebugAssembly(null)} />
      )}
    </div>
  );
}
