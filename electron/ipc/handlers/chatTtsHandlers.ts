import { ipcMain } from "electron";
import { synthesizeSpeech, clearTtsCache, type SynthesizeSpeechOptions } from "../../services/chatTtsBridge";

export function registerChatTtsHandlers() {
  ipcMain.handle("tts:synthesize", async (event, opts: SynthesizeSpeechOptions, cacheEnabled: boolean) => {
    return synthesizeSpeech(opts, cacheEnabled);
  });

  ipcMain.handle("tts:clearCache", async () => {
    return clearTtsCache();
  });
}
