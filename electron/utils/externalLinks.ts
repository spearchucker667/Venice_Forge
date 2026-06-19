import { BrowserWindow, dialog, shell } from "electron";
import { logError } from "../services/logger";

const MAX_DISPLAY_URL_LENGTH = 60;

function buildDisplayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const protocolAndHost = `${parsed.protocol}//${parsed.host}`;
    const fullPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    const availableLength = Math.max(0, MAX_DISPLAY_URL_LENGTH - protocolAndHost.length);
    const truncatedPath =
      fullPath.length > availableLength
        ? `${fullPath.slice(0, Math.max(0, availableLength - 3))}...`
        : fullPath;
    return `${protocolAndHost}${truncatedPath}`;
  } catch {
    return url.slice(0, 120);
  }
}

export async function promptExternalLink(win: BrowserWindow, url: string): Promise<{ opened: boolean; canceled: boolean; error?: string }> {
  try {
    const { response } = await dialog.showMessageBox(win, {
      type: "question",
      buttons: ["Open in browser", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      title: "Open External Link",
      message: "Open this link in your system browser?",
      detail: buildDisplayUrl(url),
    });

    if (response !== 0) return { opened: false, canceled: true };
    await shell.openExternal(url);
    return { opened: true, canceled: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to open URL";
    logError("promptExternalLink failed", message);
    return { opened: false, canceled: false, error: message };
  }
}
