import React from "react";
import { useSettingsStore, DEFAULT_AUDIO_PREFERENCES, type UiSoundPackId } from "../../stores/settings-store";
import { uiSoundController } from "../../services/uiSoundController";

export function AudioSpeechPanel() {
  const { audioPreferences, setAudioPreferences, setUiSoundPreferences, setChatTtsPreferences } = useSettingsStore();

  const { uiSounds, chatTts } = audioPreferences || DEFAULT_AUDIO_PREFERENCES;

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="space-y-1 mb-6">
        <h3 className="text-lg font-medium text-text-primary">Audio & Speech</h3>
        <p className="text-sm text-text-muted">
          Configure interface sounds and text-to-speech for model replies.
        </p>
      </div>

      {/* Interface Sounds */}
      <div className="space-y-4 bg-surface-elevated rounded-xl p-5 border border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-text-primary">Interface Sounds</h4>
            <p className="text-xs text-text-muted mt-1 max-w-[80%]">
              Interface sounds use bundled local audio and do not contact a network service.
            </p>
          </div>
          <div className="flex items-center">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={uiSounds.enabled}
                onChange={(e) => {
                  uiSoundController.play(e.target.checked ? 'toggleOn' : 'toggleOff', uiSounds.packId)
                  setUiSoundPreferences({ enabled: e.target.checked })
                }}
              />
              <div className="w-9 h-5 bg-surface-elevated border border-border/80 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-secondary peer-checked:after:bg-white after:border-border/10 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent peer-checked:border-accent"></div>
            </label>
          </div>
        </div>

        <div className={`space-y-4 pt-3 ${!uiSounds.enabled ? "opacity-50 pointer-events-none" : ""}`}>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Sound pack
            </label>
            <select
              className="w-full bg-surface border border-border/50 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/50"
              value={uiSounds.packId}
              onChange={(e) => setUiSoundPreferences({ packId: e.target.value as UiSoundPackId })}
            >
              <option value="soft">Soft</option>
              <option value="tactile">Tactile</option>
              <option value="glass">Glass</option>
              <option value="retro">Retro</option>
              <option value="minimal">Minimal</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Volume
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              className="w-full"
              value={uiSounds.volume}
              onChange={(e) => setUiSoundPreferences({ volume: parseFloat(e.target.value) })}
            />
          </div>

          <div className="flex justify-between items-center pt-2">
            <button 
              onClick={() => uiSoundController.preview(uiSounds.packId)}
              className="px-3 py-1.5 text-xs font-medium bg-surface-elevated hover:bg-surface-elevated/80 border border-border/50 rounded-md text-text-primary transition-colors"
            >
              Preview
            </button>
            <button
              onClick={() => setUiSoundPreferences(DEFAULT_AUDIO_PREFERENCES.uiSounds)}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              Restore defaults
            </button>
          </div>
        </div>
      </div>

      {/* Chat Text-to-Speech */}
      <div className="space-y-4 bg-surface-elevated rounded-xl p-5 border border-border/50">
        <div>
          <h4 className="text-sm font-medium text-text-primary">Chat Text-to-Speech</h4>
          <p className="text-xs text-text-muted mt-1">
            Text-to-speech sends the selected assistant reply text to your configured speech provider and may consume API usage. Automatic playback is off by default.
          </p>
        </div>

        <div className="space-y-4 pt-2">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-border/50 bg-surface text-accent focus:ring-accent/50"
              checked={chatTts.showMessageControls}
              onChange={(e) => {
                uiSoundController.play(e.target.checked ? 'toggleOn' : 'toggleOff', uiSounds.packId)
                setChatTtsPreferences({ showMessageControls: e.target.checked })
              }}
            />
            <span className="text-sm text-text-primary">Show TTS controls on assistant replies</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-border/50 bg-surface text-accent focus:ring-accent/50"
              checked={chatTts.autoReadDefault}
              onChange={(e) => {
                uiSoundController.play(e.target.checked ? 'toggleOn' : 'toggleOff', uiSounds.packId)
                setChatTtsPreferences({ autoReadDefault: e.target.checked })
              }}
            />
            <span className="text-sm text-text-primary">Automatically read completed replies</span>
          </label>

          {/* Model and Voice placeholders for now, will implement discovery later */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                TTS model
              </label>
              <select
                className="w-full bg-surface border border-border/50 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/50"
                value={chatTts.model || ""}
                onChange={(e) => setChatTtsPreferences({ model: e.target.value || undefined })}
              >
                <option value="">Default Provider Model</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                Voice
              </label>
              <select
                className="w-full bg-surface border border-border/50 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/50"
                value={chatTts.voice || ""}
                onChange={(e) => setChatTtsPreferences({ voice: e.target.value || undefined })}
              >
                <option value="">Default Voice</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Speed: {chatTts.speed.toFixed(1)}x
            </label>
            <input
              type="range"
              min="0.25"
              max="4"
              step="0.25"
              className="w-full"
              value={chatTts.speed}
              onChange={(e) => setChatTtsPreferences({ speed: parseFloat(e.target.value) })}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              Volume: {Math.round(chatTts.volume * 100)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              className="w-full"
              value={chatTts.volume}
              onChange={(e) => setChatTtsPreferences({ volume: parseFloat(e.target.value) })}
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-border/50 bg-surface text-accent focus:ring-accent/50"
              checked={chatTts.skipCodeBlocks}
              onChange={(e) => {
                uiSoundController.play(e.target.checked ? 'toggleOn' : 'toggleOff', uiSounds.packId)
                setChatTtsPreferences({ skipCodeBlocks: e.target.checked })
              }}
            />
            <span className="text-sm text-text-primary">Skip code blocks</span>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-border/50 bg-surface text-accent focus:ring-accent/50"
              checked={chatTts.stopOnNewReply}
              onChange={(e) => {
                uiSoundController.play(e.target.checked ? 'toggleOn' : 'toggleOff', uiSounds.packId)
                setChatTtsPreferences({ stopOnNewReply: e.target.checked })
              }}
            />
            <span className="text-sm text-text-primary">Stop current playback when a new reply begins</span>
          </label>

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <label className="flex items-center gap-3 cursor-pointer">
              <span className="text-sm text-text-primary">Cache generated speech</span>
              <select
                className="bg-surface border border-border/50 rounded-md px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent/50 ml-2"
                value={chatTts.cacheEnabled ? "on" : "off"}
                onChange={(e) => setChatTtsPreferences({ cacheEnabled: e.target.value === "on" })}
              >
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </label>

            <button className="px-3 py-1.5 text-xs font-medium bg-surface-elevated hover:bg-surface-elevated/80 hover:text-red-400 border border-border/50 rounded-md text-text-primary transition-colors">
              Clear TTS cache
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
