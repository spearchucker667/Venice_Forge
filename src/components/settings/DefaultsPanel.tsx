import React from "react";
import { ModelSelect } from "../ModelSelect";
import { PillGroup } from "../ui/shared";
import type { VeniceParameters } from "../../types/venice";

export interface DefaultsPanelProps {
  currentChatModel: string;
  currentImageModel: string;
  textModels: Array<{ id: string; name?: string }> | undefined;
  imageModels: Array<{ id: string; name?: string }> | undefined;
  systemPrompt: string;
  setSystemPrompt: (value: string) => void;
  veniceParams: VeniceParameters;
  setVeniceParams: (value: Partial<VeniceParameters>) => void;
  setSelectedModel: (kind: "chat" | "image", id: string) => void;
  characterSceneGenerationEnabled: boolean;
  setCharacterSceneGenerationEnabled: (value: boolean) => void;
  characterSceneGenerationMode: "manual" | "auto";
  setCharacterSceneGenerationMode: (value: "manual" | "auto") => void;
}

export function DefaultsPanel({
  currentChatModel,
  currentImageModel,
  textModels,
  imageModels,
  systemPrompt,
  setSystemPrompt,
  veniceParams,
  setVeniceParams,
  setSelectedModel,
  characterSceneGenerationEnabled,
  setCharacterSceneGenerationEnabled,
  characterSceneGenerationMode,
  setCharacterSceneGenerationMode,
}: DefaultsPanelProps): React.ReactElement {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-[12.5px] text-text-secondary block mb-1.5 font-medium">Default Chat Model</label>
          <ModelSelect
            value={currentChatModel}
            models={textModels || []}
            onChange={(val) => setSelectedModel("chat", val)}
          />
        </div>
        <div>
          <label className="text-[12.5px] text-text-secondary block mb-1.5 font-medium">Default Image Model</label>
          <ModelSelect
            value={currentImageModel}
            models={imageModels || []}
            onChange={(val) => setSelectedModel("image", val)}
          />
        </div>
      </div>

      <div className="border-t border-border/50 pt-5 space-y-4">
        <div>
          <label className="text-[12.5px] text-text-secondary block mb-1.5 font-medium">Default Web Search</label>
          <select
            value={veniceParams.enable_web_search || "off"}
            onChange={(e) =>
              setVeniceParams({ enable_web_search: e.target.value as "off" | "on" | "auto" })
            }
            className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all cursor-pointer"
          >
            <option value="off">Off</option>
            <option value="on">On</option>
            <option value="auto">Auto</option>
          </select>
        </div>

        <div>
          <label className="text-[12.5px] text-text-secondary block mb-1.5 font-medium">Default System Prompt</label>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="Optional. Leave empty to avoid adding an app-authored system message."
            rows={4}
            className="w-full bg-surface border border-border rounded-lg px-3.5 py-2 text-[14px] text-text-primary outline-none focus:border-accent transition-all placeholder:text-text-muted/50 resize-none"
          />
        </div>

        <div className="flex flex-col gap-3.5 p-4 rounded-xl border border-border bg-surface-elevated">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={veniceParams.include_venice_system_prompt !== false}
              onChange={(e) => setVeniceParams({ include_venice_system_prompt: e.target.checked })}
              className="rounded border-border bg-surface text-accent focus:ring-offset-0 focus:ring-0 w-4 h-4 cursor-pointer"
            />
            <span className="text-[13.5px] text-text-primary">Venice System Prompt Toggle</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={veniceParams.enable_web_citations === true}
              onChange={(e) => setVeniceParams({ enable_web_citations: e.target.checked })}
              className="rounded border-border bg-surface text-accent focus:ring-offset-0 focus:ring-0 w-4 h-4 cursor-pointer"
            />
            <span className="text-[13.5px] text-text-primary">Enable Citations by Default</span>
          </label>
        </div>

        <div className="flex flex-col gap-3.5 p-4 rounded-xl border border-border bg-surface-elevated">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-[14.5px] font-medium text-text-primary">Character Scene Generation</h3>
              <p className="mt-1 text-[12.5px] text-text-secondary leading-relaxed">
                Allow character chats to create inline scene images from the current conversation only. Protected by local rate limits.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={characterSceneGenerationEnabled}
                onChange={(e) => setCharacterSceneGenerationEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-border bg-surface text-accent cursor-pointer"
              />
              <span className="text-[12.5px] font-medium text-text-primary">
                {characterSceneGenerationEnabled ? "On" : "Off"}
              </span>
            </label>
          </div>
          {characterSceneGenerationEnabled && (
            <div className="pt-2 border-t border-border/50">
              <label className="text-[12.5px] text-text-secondary block mb-2 font-medium">Mode</label>
              <PillGroup
                ariaLabel="Character scene generation mode"
                options={[
                  { value: "manual", label: "Manual only" },
                  { value: "auto", label: "Automatic + manual" },
                ]}
                value={characterSceneGenerationMode}
                onChange={(v) => setCharacterSceneGenerationMode(v as "manual" | "auto")}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
