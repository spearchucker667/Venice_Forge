import { ipcMain, dialog, clipboard } from "electron";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { app } from "electron";
import { imageInspectorIpc } from "../../../src/types/desktop";
import type { 
  ImageInspectorInput, 
  ImageInspectorSession,
  ImageInspectorAnalysis,
  ImageSearchProviderResult,
  ImageInspectorSettings,
  ImageSearchMode,
  SanitizedInspectorError 
} from "../../../src/types/imageInspector";
import { persistGeneratedMedia, resolveGeneratedMedia } from "../../services/generatedMediaStore";

export function registerImageInspectorHandlers(): void {
  ipcMain.handle(imageInspectorIpc.chooseImage, async (event) => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [
          { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] }
        ]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { ok: true, canceled: true };
      }

      const filePath = result.filePaths[0];
      const stats = await fs.stat(filePath);
      const buffer = await fs.readFile(filePath);
      
      // Basic magic byte check for mime type
      let mimeType = "application/octet-stream";
      if (buffer.length > 4) {
        if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) mimeType = "image/png";
        else if (buffer[0] === 0xff && buffer[1] === 0xd8) mimeType = "image/jpeg";
        else if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) mimeType = "image/webp";
        else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) mimeType = "image/gif";
      }

      const durableMedia = await persistGeneratedMedia(buffer, mimeType);
      
      const input: ImageInspectorInput = {
        id: crypto.randomUUID(),
        source: "file",
        displayName: path.basename(filePath),
        mimeType,
        byteLength: stats.size,
        sha256: durableMedia.sha256,
        mediaId: durableMedia.id,
        uri: durableMedia.url,
      };
      
      return { ok: true, result: input };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle(imageInspectorIpc.ingestClipboardImage, async (event) => {
    try {
      const image = clipboard.readImage();
      if (image.isEmpty()) {
        return { ok: false, error: "Clipboard does not contain an image." };
      }
      const buffer = image.toPNG();
      const durableMedia = await persistGeneratedMedia(buffer, "image/png");
      const input: ImageInspectorInput = {
        id: crypto.randomUUID(),
        source: "clipboard",
        displayName: "Clipboard Image",
        mimeType: "image/png",
        byteLength: buffer.length,
        sha256: durableMedia.sha256,
        mediaId: durableMedia.id,
        uri: durableMedia.url,
      };
      return { ok: true, result: input };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle(imageInspectorIpc.ingestRemoteImage, async (event, { url }) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        return { ok: false, error: `Failed to fetch remote image: ${response.statusText}` };
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      let mimeType = response.headers.get("content-type") || "application/octet-stream";
      
      const durableMedia = await persistGeneratedMedia(buffer, mimeType);
      
      const input: ImageInspectorInput = {
        id: crypto.randomUUID(),
        source: "url",
        displayName: url.split("/").pop() || "Remote Image",
        mimeType,
        byteLength: buffer.length,
        sha256: durableMedia.sha256,
        mediaId: durableMedia.id,
        uri: durableMedia.url,
        sanitizedRemoteUrl: url,
      };
      return { ok: true, result: input };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle(imageInspectorIpc.resolveMediaInput, async (event, { mediaId, type }) => {
    try {
      const resolved = await resolveGeneratedMedia(mediaId);
      if (!resolved) {
        return { ok: false, error: "Media not found." };
      }
      
      const stats = await fs.stat(resolved.path);
      
      const input: ImageInspectorInput = {
        id: crypto.randomUUID(),
        source: type === "attachment" ? "attachment" : "app-media",
        displayName: `Media ${mediaId.substring(0, 8)}`,
        mimeType: resolved.mimeType,
        byteLength: stats.size,
        sha256: mediaId, // In generatedMediaStore, id is usually the sha256
        mediaId: mediaId,
        uri: `venice-media://${mediaId}`,
      };
      
      return { ok: true, result: input };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle(imageInspectorIpc.getInputMetadata, async (event, { id }) => {
    return { ok: false, error: "Not implemented" };
  });

  // I will add the rest of the handlers as we build the service layer.
}
