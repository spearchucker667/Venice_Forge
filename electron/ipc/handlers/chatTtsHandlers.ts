import { ipcMain } from "electron";
import { synthesizeSpeech, clearTtsCache } from "../../services/chatTtsBridge";
import { getProfileSessionId } from "../../services/profileSession";

export function registerChatTtsHandlers() {
  ipcMain.handle("tts:synthesize", async (event, opts: unknown, cacheEnabled: unknown) => {
    return synthesizeSpeech(opts, cacheEnabled, getProfileSessionId(event.sender));
  });

  ipcMain.handle("tts:clearCache", async () => {
    return clearTtsCache();
  });
}
