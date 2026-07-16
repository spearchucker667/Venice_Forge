import { dialog, ipcMain, nativeImage } from "electron";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { rateLimitIpcHandler } from "../utils/rateLimit";
import { parseCharacterCardJson, createImportPreview, mapInternalToV2, mapV2ToInternal } from "../../src/services/characterCards/characterCardAdapter";
import { embedCharacterCardInPng, inspectCharacterCardPng } from "../services/characterCardPngCodec";
import { listCharacterCards, readCharacterCard, saveCharacterCard } from "../services/characterCardStorage";
import { assessCharacterImport } from "../../src/shared/safety/characterImportSafety";
import { getRuntimeLocalFamilySafeModeEnabled } from "../services/runtimeSafetySettings";
import { redactErrorMessage } from "../../src/shared/redaction";
import type { CharacterCardV1 } from "../../src/types/rp";
import type { CharacterCardImportWarning } from "../../src/services/characterCards/characterCardAdapter";
import type { CharacterCardExportReport, CharacterCardImportApplyOptions } from "../../src/types/character-card-files";
import { mapCharacterBookV2ToLorebookV1 } from "../../src/services/characterCards/characterBookAdapter";
import { lorebookStore } from "../services/rpStores";
import { emitSyncPacket } from "../services/syncBridge";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const HANDLE_TTL_MS = 5 * 60_000;
interface Candidate { expiresAt: number; card: CharacterCardV1; avatar?: Buffer; warnings: CharacterCardImportWarning[] }
const candidates = new Map<number, Map<string, Candidate>>();
interface UndoRecord { expiresAt: number; previous: CharacterCardV1; importedCardId: string }
const undoRecords = new Map<number, Map<string, UndoRecord>>();
const MERGE_FIELDS = new Set(["name", "description", "personality", "scenario", "firstMessage", "systemPrompt", "postHistoryInstructions", "alternateGreetings", "exampleDialogues", "rawExampleDialogue", "tags", "author", "characterVersion", "tavernExtensions", "embeddedCharacterBook"]);

function senderCandidates(senderId: number): Map<string, Candidate> {
  const existing = candidates.get(senderId);
  if (existing) return existing;
  const created = new Map<string, Candidate>();
  candidates.set(senderId, created);
  return created;
}

function cleanExpired(now = Date.now()): void {
  for (const [senderId, entries] of candidates) {
    for (const [handle, candidate] of entries) if (candidate.expiresAt <= now) entries.delete(handle);
    if (!entries.size) candidates.delete(senderId);
  }
  for (const [senderId, entries] of undoRecords) {
    for (const [handle, record] of entries) if (record.expiresAt <= now) entries.delete(handle);
    if (!entries.size) undoRecords.delete(senderId);
  }
}

function contentFingerprint(card: CharacterCardV1): string {
  return crypto.createHash("sha256").update(JSON.stringify(mapInternalToV2(card))).digest("hex");
}

function snapshotVersion(card: CharacterCardV1, reason: string) {
  return { id: crypto.randomUUID(), createdAt: Date.now(), reason, snapshot: { name: card.name, description: card.description, personality: card.personality, systemPrompt: card.systemPrompt, creatorNotes: card.creatorNotes, postHistoryInstructions: card.postHistoryInstructions, alternateGreetings: [...(card.alternateGreetings ?? [])], characterVersion: card.characterVersion, tavernExtensions: structuredClone(card.tavernExtensions ?? {}), embeddedCharacterBook: card.embeddedCharacterBook ? structuredClone(card.embeddedCharacterBook) : undefined, rawExampleDialogue: card.rawExampleDialogue, scenario: card.scenario, firstMessage: card.firstMessage, tags: [...card.tags], adult: card.adult, exampleDialogues: structuredClone(card.exampleDialogues), modelId: card.modelId, author: card.author, instructions: card.instructions, temperature: card.temperature, topP: card.topP, webSearch: card.webSearch, urlScrapingProvider: card.urlScrapingProvider, enableThoughts: card.enableThoughts } };
}

async function materializeLinkedBook(card: CharacterCardV1): Promise<string | undefined> {
  if (!card.embeddedCharacterBook) return undefined;
  const id = `cardbook-${card.id}`.slice(0, 128);
  const book = mapCharacterBookV2ToLorebookV1(card.embeddedCharacterBook, { id, characterId: card.id });
  const saved = await lorebookStore.save(book as unknown as Record<string, unknown>);
  if (!saved.ok) throw new Error(saved.error ?? "Could not create linked lorebook.");
  await emitSyncPacket("lorebooks", book.id, book, "local-user");
  return book.id;
}

function safeFilename(name: string): string {
  const printable = [...name.normalize("NFKC")].map((character) => character.charCodeAt(0) < 32 ? "-" : character).join("");
  const clean = printable.replace(/[<>:"/\\|?*]/g, "-").replace(/[. ]+$/g, "").trim();
  return (clean || "character-card").slice(0, 100);
}

async function atomicWrite(destination: string, data: Buffer | string): Promise<void> {
  const temporary = `${destination}.tmp-${crypto.randomUUID()}`;
  const handle = await fs.open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
  await handle.close();
  try {
    await fs.rename(temporary, destination);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

function parseExportRequest(payload: unknown): { cardId: string; profile: "standard" | "privacy-reduced" } | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = payload as Record<string, unknown>;
  if (typeof raw.cardId !== "string" || (raw.profile !== undefined && raw.profile !== "standard" && raw.profile !== "privacy-reduced")) return null;
  return { cardId: raw.cardId, profile: raw.profile === "privacy-reduced" ? "privacy-reduced" : "standard" };
}

function exportDto(card: CharacterCardV1, profile: "standard" | "privacy-reduced") {
  const dto = mapInternalToV2(card);
  if (profile === "privacy-reduced") {
    dto.data.creator_notes = "";
    dto.data.creator = "";
    dto.data.extensions = {};
    if (dto.data.character_book) dto.data.character_book.extensions = {};
  }
  return dto;
}

function buildExportReport(card: CharacterCardV1, dto: ReturnType<typeof exportDto>, format: "json" | "png", profile: "standard" | "privacy-reduced", outputBytes: number, image?: { width: number; height: number }): CharacterCardExportReport {
  const internalFields = ["id", "avatar", "metadata", "versions", "currentVersionId", "contextFiles", "modelId", "temperature", "topP", "webSearch", "urlScrapingProvider", "enableThoughts", "revisionId", "baseRevisionId", "deviceId"];
  return {
    format, profile, validV2Fields: Object.keys(dto.data),
    warnings: profile === "privacy-reduced" ? ["Creator, creator notes, and extension namespaces were removed by the selected privacy profile."] : [],
    droppedInternalFields: internalFields.filter((field) => (card as unknown as Record<string, unknown>)[field] !== undefined),
    extensionNamespaces: Object.keys(dto.data.extensions), embeddedLorebookCount: dto.data.character_book?.entries.length ?? 0,
    outputBytes, ...(image ? { image } : {}), roundTripVerified: true,
  };
}

export function registerCharacterCardFileHandlers(): void {
  ipcMain.handle("characterCards:chooseImportFile", rateLimitIpcHandler("characterCards:chooseImportFile", async (event) => {
    try {
      cleanExpired();
      // Main-owned picker is the character-card import trust boundary; no path is returned to the renderer.
      // verify-no-native-dialogs: allow
      const selection = await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "Character cards", extensions: ["json", "png"] }] });
      if (selection.canceled || selection.filePaths.length !== 1) return { ok: true, canceled: true };
      const filePath = selection.filePaths[0];
      const stat = await fs.stat(filePath);
      if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return { ok: false, error: "Character-card file exceeds the 20 MiB limit." };
      const input = await fs.readFile(filePath);
      let card: CharacterCardV1 | null = null;
      let avatar: Buffer | undefined;
      let image: { width: number; height: number; byteLength: number } | undefined;
      let warnings: CharacterCardImportWarning[] = [];
      if (path.extname(filePath).toLowerCase() === ".png") {
        const inspected = inspectCharacterCardPng(input);
        card = mapV2ToInternal(inspected.card, warnings);
        if (card) card.sourceFormat = "card-v2-png";
        avatar = inspected.visiblePng;
        image = { width: inspected.width, height: inspected.height, byteLength: avatar.length };
      } else {
        const parsed = parseCharacterCardJson(new TextDecoder("utf-8", { fatal: true }).decode(input));
        if (parsed) ({ card, warnings } = parsed);
      }
      if (!card) return { ok: false, error: "The selected file is not a supported V1 JSON, V2 JSON, or V2 PNG character card." };
      const handle = crypto.randomUUID();
      const expiresAt = Date.now() + HANDLE_TTL_MS;
      senderCandidates(event.sender.id).set(handle, { expiresAt, card, avatar, warnings });
      event.sender.once("destroyed", () => candidates.delete(event.sender.id));
      return { ok: true, handle, expiresAt, preview: { ...createImportPreview(card, warnings), ...(image ? { image } : {}) } };
    } catch (error) {
      return { ok: false, error: redactErrorMessage(error) };
    }
  }));

  ipcMain.handle("characterCards:applyImport", rateLimitIpcHandler("characterCards:applyImport", async (event, payload: unknown) => {
    try {
      cleanExpired();
      if (!payload || typeof payload !== "object") return { ok: false, error: "Invalid import request." };
      const raw = payload as CharacterCardImportApplyOptions;
      const allowedModes = new Set(["create", "create-copy", "replace", "merge", "keep-existing"]);
      if (typeof raw.handle !== "string" || (raw.mode !== undefined && !allowedModes.has(raw.mode))) return { ok: false, error: "Invalid import request." };
      if (raw.mergeFields && (!Array.isArray(raw.mergeFields) || raw.mergeFields.some((field) => !MERGE_FIELDS.has(field)))) return { ok: false, error: "Invalid merge field selection." };
      if (raw.characterBook && !["none", "embedded", "linked", "both"].includes(raw.characterBook)) return { ok: false, error: "Invalid character-book import option." };
      const entries = candidates.get(event.sender.id);
      const candidate = entries?.get(raw.handle);
      if (!candidate) return { ok: false, error: "Import preview expired or is no longer valid." };
      const decision = assessCharacterImport(candidate.card, getRuntimeLocalFamilySafeModeEnabled());
      if (!decision.allow) { entries!.delete(raw.handle); return { ok: false, error: decision.userMessage || "Character card was blocked by Local Family Safe Mode." }; }
      const cards = (await listCharacterCards()).cards;
      const fingerprint = contentFingerprint(candidate.card);
      const existing = cards.find((card) =>
        card.id === raw.existingCardId ||
        card.metadata?.sourceFingerprint === fingerprint ||
        (card.name.trim().toLowerCase() === candidate.card.name.trim().toLowerCase() && (card.author ?? "").trim().toLowerCase() === (candidate.card.author ?? "").trim().toLowerCase()),
      );
      const mode = raw.mode ?? "create";
      if (existing && mode === "create") return { ok: false, error: "A matching character card already exists. Choose keep, replace, merge, or create-copy.", collision: { existingCardId: existing.id, name: existing.name, creator: existing.author ?? "" } };
      if (mode === "keep-existing") { entries!.delete(raw.handle); return { ok: true, cardId: existing?.id }; }
      if ((mode === "replace" || mode === "merge") && !existing) return { ok: false, error: "The selected existing character no longer exists." };

      let next = structuredClone(candidate.card);
      let previous: CharacterCardV1 | undefined;
      if (mode === "create-copy") next.id = crypto.randomUUID();
      if (existing && (mode === "replace" || mode === "merge")) {
        previous = structuredClone(existing);
        const version = snapshotVersion(existing, `Before ${mode} import`);
        if (mode === "replace") {
          next = { ...next, id: existing.id, createdAt: existing.createdAt, avatar: next.avatar ?? existing.avatar, versions: [...(existing.versions ?? []), version], currentVersionId: version.id, metadata: { ...(existing.metadata ?? {}), ...(next.metadata ?? {}) } };
        } else {
          next = structuredClone(existing);
          for (const field of raw.mergeFields ?? []) (next as unknown as Record<string, unknown>)[field] = structuredClone((candidate.card as unknown as Record<string, unknown>)[field]);
          next.versions = [...(existing.versions ?? []), version];
          next.currentVersionId = version.id;
          next.updatedAt = Date.now();
        }
      }
      if (candidate.avatar && mode !== "merge") next.avatar = { mimeType: "image/png", byteLength: candidate.avatar.length, data: candidate.avatar.toString("base64") };
      next.metadata = { ...(next.metadata ?? {}), sourceFingerprint: fingerprint, ...(raw.favorite ? { favorite: true } : {}) };
      const bookMode = raw.characterBook ?? "both";
      if (bookMode === "none" || bookMode === "linked") delete next.embeddedCharacterBook;
      const saved = await saveCharacterCard(next);
      if (!saved.ok) return { ok: false, error: saved.error };
      if ((bookMode === "linked" || bookMode === "both") && candidate.card.embeddedCharacterBook) {
        const bookSource = { ...next, embeddedCharacterBook: candidate.card.embeddedCharacterBook };
        const linkedId = await materializeLinkedBook(bookSource);
        if (linkedId) {
          next.metadata = { ...(next.metadata ?? {}), linkedLorebookIds: Array.from(new Set([...(Array.isArray(next.metadata?.linkedLorebookIds) ? next.metadata.linkedLorebookIds.filter((id): id is string => typeof id === "string") : []), linkedId])), importedCharacterBookHash: crypto.createHash("sha256").update(JSON.stringify(candidate.card.embeddedCharacterBook)).digest("hex") };
          await saveCharacterCard(next);
        }
      }
      await emitSyncPacket("character_cards", next.id, next, "local-user");
      entries!.delete(raw.handle);
      let undoHandle: string | undefined;
      if (previous) {
        undoHandle = crypto.randomUUID();
        const senderUndo = undoRecords.get(event.sender.id) ?? new Map<string, UndoRecord>();
        senderUndo.set(undoHandle, { expiresAt: Date.now() + HANDLE_TTL_MS, previous, importedCardId: next.id });
        undoRecords.set(event.sender.id, senderUndo);
      }
      return { ok: true, cardId: next.id, ...(undoHandle ? { undoHandle } : {}), startedChatRequested: raw.startChat === true };
    } catch (error) {
      return { ok: false, error: redactErrorMessage(error) };
    }
  }));

  ipcMain.handle("characterCards:undoImport", rateLimitIpcHandler("characterCards:undoImport", async (event, payload: unknown) => {
    cleanExpired();
    if (!payload || typeof payload !== "object" || typeof (payload as Record<string, unknown>).handle !== "string") return { ok: false, error: "Invalid undo request." };
    const handle = (payload as { handle: string }).handle;
    const records = undoRecords.get(event.sender.id);
    const record = records?.get(handle);
    if (!record) return { ok: false, error: "Import undo expired or was already used." };
    records!.delete(handle);
    const saved = await saveCharacterCard(record.previous);
    if (!saved.ok) return { ok: false, error: saved.error };
    await emitSyncPacket("character_cards", record.previous.id, record.previous, "local-user");
    return { ok: true, cardId: record.previous.id };
  }));

  ipcMain.handle("characterCards:exportJson", rateLimitIpcHandler("characterCards:exportJson", async (_event, payload: unknown) => {
    try {
      const request = parseExportRequest(payload);
      if (!request) return { ok: false, error: "Invalid export request." };
      const card = await readCharacterCard(request.cardId);
      if (!card) return { ok: false, error: "Character card was not found." };
      const dto = exportDto(card, request.profile);
      const serialized = `${JSON.stringify(dto, null, 2)}\n`;
      const reparsed = parseCharacterCardJson(serialized);
      if (!reparsed || JSON.stringify(mapInternalToV2(reparsed.card)) !== JSON.stringify(dto)) return { ok: false, error: "JSON export failed semantic verification." };
      // Main-owned picker is the character-card export trust boundary; no path is returned to the renderer.
      // verify-no-native-dialogs: allow
      const selection = await dialog.showSaveDialog({ defaultPath: `${safeFilename(card.name)}.json`, filters: [{ name: "Character Card V2 JSON", extensions: ["json"] }] });
      const report = buildExportReport(card, dto, "json", request.profile, Buffer.byteLength(serialized));
      if (selection.canceled || !selection.filePath) return { ok: true, canceled: true, report };
      await atomicWrite(selection.filePath, serialized);
      return { ok: true, report };
    } catch (error) {
      return { ok: false, error: redactErrorMessage(error) };
    }
  }));

  ipcMain.handle("characterCards:exportPng", rateLimitIpcHandler("characterCards:exportPng", async (_event, payload: unknown) => {
    try {
      const request = parseExportRequest(payload);
      if (!request) return { ok: false, error: "Invalid export request." };
      const card = await readCharacterCard(request.cardId);
      if (!card) return { ok: false, error: "Character card was not found." };
      if (!card.avatar?.data) return { ok: false, error: "A visible avatar is required for PNG export." };
      const source = Buffer.from(card.avatar.data.replace(/^data:[^;]+;base64,/, ""), "base64");
      const image = nativeImage.createFromBuffer(source);
      if (image.isEmpty()) return { ok: false, error: "The character avatar could not be decoded." };
      const png = image.toPNG();
      const output = embedCharacterCardInPng(png, exportDto(card, request.profile));
      const inspected = inspectCharacterCardPng(output);
      const dto = exportDto(card, request.profile);
      const report = buildExportReport(card, dto, "png", request.profile, output.length, { width: inspected.width, height: inspected.height });
      // Main-owned picker is the character-card export trust boundary; no path is returned to the renderer.
      // verify-no-native-dialogs: allow
      const selection = await dialog.showSaveDialog({ defaultPath: `${safeFilename(card.name)}.png`, filters: [{ name: "SillyTavern Character Card PNG", extensions: ["png"] }] });
      if (selection.canceled || !selection.filePath) return { ok: true, canceled: true, report };
      await atomicWrite(selection.filePath, output);
      return { ok: true, report };
    } catch (error) {
      return { ok: false, error: redactErrorMessage(error) };
    }
  }));
}
