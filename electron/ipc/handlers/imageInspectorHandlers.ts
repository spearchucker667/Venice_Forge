/** Main-process Image Inspector input boundary. */
import { clipboard, dialog } from "electron";
import fs from "fs/promises";
import path from "path";
import { redactErrorMessage } from "../../../src/shared/redaction";
import { imageInspectorIpc } from "../../../src/types/desktop";
import {
  IMAGE_INSPECTOR_MAX_BYTES,
  persistImageInspectorInput,
  readImageInspectorDataUrl,
  resolveImageInspectorInput,
} from "../../services/imageInspectorInput";
import { registerIpcChannel } from "./common";

function objectInput(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Image Inspector input must be an object.");
  }
  return value as Record<string, unknown>;
}

function mediaIdInput(value: unknown): string {
  const mediaId = objectInput(value).mediaId;
  if (typeof mediaId !== "string" || !/^[a-f0-9]{64}$/.test(mediaId)) {
    throw new Error("Image media id is invalid.");
  }
  return mediaId;
}

function failed(error: unknown): { ok: false; error: string } {
  return { ok: false, error: redactErrorMessage(error) };
}

export function registerImageInspectorHandlers(): void {
  registerIpcChannel(imageInspectorIpc.chooseImage, async () => {
    try {
      // verify-no-native-dialogs: allow — explicit user-mediated Image Inspector file selection.
      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
      });
      if (result.canceled || result.filePaths.length === 0) return { ok: true, canceled: true };

      const filePath = result.filePaths[0];
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) throw new Error("The selected image is not a regular file.");
      if (stats.size <= 0 || stats.size > IMAGE_INSPECTOR_MAX_BYTES) {
        throw new Error(`The selected image exceeds the ${IMAGE_INSPECTOR_MAX_BYTES}-byte limit.`);
      }
      const input = await persistImageInspectorInput({
        bytes: await fs.readFile(filePath),
        source: "file",
        displayName: path.basename(filePath),
      });
      return { ok: true, result: input };
    } catch (error) {
      return failed(error);
    }
  });

  registerIpcChannel(imageInspectorIpc.ingestClipboardImage, async () => {
    try {
      const image = clipboard.readImage();
      if (image.isEmpty()) return { ok: false, error: "Clipboard does not contain an image." };
      const input = await persistImageInspectorInput({
        bytes: image.toPNG(),
        source: "clipboard",
        displayName: "Clipboard Image",
      });
      return { ok: true, result: input };
    } catch (error) {
      return failed(error);
    }
  });

  registerIpcChannel(imageInspectorIpc.resolveMediaInput, async (_event, value: unknown) => {
    try {
      const input = objectInput(value);
      const source = input.type === "attachment" ? "attachment" : "app-media";
      return { ok: true, result: await resolveImageInspectorInput(mediaIdInput(value), source) };
    } catch (error) {
      return failed(error);
    }
  });

  registerIpcChannel(imageInspectorIpc.readMediaDataUrl, async (_event, value: unknown) => {
    try {
      return { ok: true, result: await readImageInspectorDataUrl(mediaIdInput(value)) };
    } catch (error) {
      return failed(error);
    }
  });
}
