import React from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore, DEFAULT_AUDIO_PREFERENCES, type UiSoundPackId } from "../../stores/settings-store";
import { uiSoundController } from "../../services/uiSoundController";
import { desktopTts, isElectron } from "../../services/desktopBridge";
import { useModels } from "../../hooks/use-models";
import { TTS_FALLBACK_VOICES } from "../../constants/tts";
import { toast } from "../../stores/toast-store";

export function AudioSpeechPanel() {
  const { t } = useTranslation(['settings', 'common']);
  const { audioPreferences, setUiSoundPreferences, setChatTtsPreferences } = useSettingsStore();
  const { data: ttsModels = [], isLoading: ttsModelsLoading } = useModels("tts");
  const [clearingCache, setClearingCache] = React.useState(false);

  const { uiSounds, chatTts } = audioPreferences || DEFAULT_AUDIO_PREFERENCES;
  const selectedModel = ttsModels.find((model) => model.id === chatTts.model);
  const voices: readonly string[] = selectedModel?.model_spec?.voices?.length
    ? selectedModel.model_spec.voices
    : TTS_FALLBACK_VOICES;

  const handleClearTtsCache = async () => {
    setClearingCache(true);
    try {
      const result = await desktopTts.clearCache();
      if (result.ok) toast.success(t('settings:audioSpeech.cacheCleared', "TTS cache cleared"));
      else toast.error(t('settings:audioSpeech.errors.clearCache', "Unable to clear TTS cache"), result.error);
    } catch (error) {
      toast.fromError(error, t('settings:audioSpeech.errors.clearCache', "Unable to clear TTS cache"));
    } finally {
      setClearingCache(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div className="space-y-1 mb-6">
        <h3 className="text-lg font-medium text-text-primary">{t('settings:audioSpeech.title', 'Audio & Speech')}</h3>
        <p className="text-sm text-text-muted">
          {t('settings:audioSpeech.description', 'Configure interface sounds and text-to-speech for model replies.')}
        </p>
      </div>

      {/* Interface Sounds */}
      <div className="space-y-4 bg-surface-elevated rounded-xl p-5 border border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium text-text-primary">{t('settings:audioSpeech.interfaceSoundsTitle', 'Interface Sounds')}</h4>
            <p className="text-xs text-text-muted mt-1 max-w-[80%]">
              {t('settings:audioSpeech.interfaceSoundsDescription', 'Interface sounds use bundled local audio and do not contact a network service.')}
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
              <div className="w-9 h-5 bg-surface-elevated border border-border/80 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-accent/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-text-primary after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-text-secondary peer-checked:after:bg-text-primary after:border-border/10 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent peer-checked:border-accent"></div>
            </label>
          </div>
        </div>

        <div className={`space-y-4 pt-3 ${!uiSounds.enabled ? "opacity-50 pointer-events-none" : ""}`}>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              {t('settings:audioSpeech.soundPack', 'Sound pack')}
            </label>
            <select
              className="w-full bg-surface border border-border/50 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/50"
              value={uiSounds.packId}
              onChange={(e) => setUiSoundPreferences({ packId: e.target.value as UiSoundPackId })}
            >
              <option value="soft">{t('settings:audioSpeech.packs.soft', 'Soft')}</option>
              <option value="tactile">{t('settings:audioSpeech.packs.tactile', 'Tactile')}</option>
              <option value="glass">{t('settings:audioSpeech.packs.glass', 'Glass')}</option>
              <option value="retro">{t('settings:audioSpeech.packs.retro', 'Retro')}</option>
              <option value="minimal">{t('settings:audioSpeech.packs.minimal', 'Minimal')}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              {t('settings:audioSpeech.volume', 'Volume')}
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
              {t('common:actions.preview', 'Preview')}
            </button>
            <button
              onClick={() => setUiSoundPreferences(DEFAULT_AUDIO_PREFERENCES.uiSounds)}
              className="text-xs text-text-muted hover:text-text-primary transition-colors"
            >
              {t('settings:audioSpeech.restoreDefaults', 'Restore defaults')}
            </button>
          </div>
        </div>
      </div>

      {/* Chat Text-to-Speech */}
      <div className="space-y-4 bg-surface-elevated rounded-xl p-5 border border-border/50">
        <div>
          <h4 className="text-sm font-medium text-text-primary">{t('settings:audioSpeech.chatTtsTitle', 'Chat Text-to-Speech')}</h4>
          <p className="text-xs text-text-muted mt-1">
            {t('settings:audioSpeech.chatTtsDescription', 'Text-to-speech sends the selected assistant reply text to your configured speech provider and may consume API usage. Automatic playback is off by default.')}
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
            <span className="text-sm text-text-primary">{t('settings:audioSpeech.showControls', 'Show TTS controls on assistant replies')}</span>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                {t('settings:audioSpeech.ttsModel', 'TTS model')}
              </label>
              <select
                className="w-full bg-surface border border-border/50 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/50"
                value={chatTts.model || ""}
                onChange={(e) => setChatTtsPreferences({ model: e.target.value || undefined })}
              >
                <option value="">{t('settings:audioSpeech.defaultProviderModel', 'Default provider model')}</option>
                {chatTts.model && !ttsModels.some((model) => model.id === chatTts.model) && (
                  <option value={chatTts.model}>{chatTts.model} {t('settings:audioSpeech.saved', '(saved)')}</option>
                )}
                {ttsModels.map((model) => (
                  <option key={model.id} value={model.id}>{model.model_spec?.name ?? model.id}</option>
                ))}
              </select>
              {ttsModelsLoading && <p className="mt-1 text-[11px] text-text-muted">{t('settings:audioSpeech.loadingModels', 'Loading speech models…')}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1.5">
                {t('settings:audioSpeech.voice', 'Voice')}
              </label>
              <select
                className="w-full bg-surface border border-border/50 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent/50"
                value={chatTts.voice || ""}
                onChange={(e) => setChatTtsPreferences({ voice: e.target.value || undefined })}
              >
                <option value="">{t('settings:audioSpeech.defaultVoice', 'Default voice')}</option>
                {chatTts.voice && !voices.includes(chatTts.voice) && (
                  <option value={chatTts.voice}>{chatTts.voice} {t('settings:audioSpeech.saved', '(saved)')}</option>
                )}
                {voices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1.5">
              {t('settings:audioSpeech.speed', { defaultValue: 'Speed: {{speed}}x', speed: chatTts.speed.toFixed(1) })}
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
              {t('settings:audioSpeech.volumeLabel', { defaultValue: 'Volume: {{volume}}%', volume: Math.round(chatTts.volume * 100) })}
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
            <span className="text-sm text-text-primary">{t('settings:audioSpeech.skipCodeBlocks', 'Skip code blocks')}</span>
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
            <span className="text-sm text-text-primary">{t('settings:audioSpeech.stopOnNewReply', 'Stop current playback when a new reply begins')}</span>
          </label>

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <label className="flex items-center gap-3 cursor-pointer">
              <span className="text-sm text-text-primary">{t('settings:audioSpeech.cacheSpeech', 'Cache generated speech')}</span>
              <select
                className="bg-surface border border-border/50 rounded-md px-2 py-1 text-xs text-text-primary focus:outline-none focus:border-accent/50 ml-2"
                value={chatTts.cacheEnabled ? "on" : "off"}
                onChange={(e) => setChatTtsPreferences({ cacheEnabled: e.target.value === "on" })}
              >
                <option value="on">{t('common:status.on', 'On')}</option>
                <option value="off">{t('common:status.off', 'Off')}</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => { void handleClearTtsCache(); }}
              disabled={clearingCache || !isElectron()}
              className="px-3 py-1.5 text-xs font-medium bg-surface-elevated hover:bg-surface-elevated/80 hover:text-danger border border-border/50 rounded-md text-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {clearingCache ? t('settings:audioSpeech.clearing', 'Clearing…') : t('settings:audioSpeech.clearCache', 'Clear TTS cache')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
