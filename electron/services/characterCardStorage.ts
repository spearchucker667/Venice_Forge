/**
 * @fileoverview Electron main-process storage for the local-first Character Roleplay Studio.
 *
 * Persists `CharacterCardV1` to `<userData>/characters/<id>/character.json` plus
 * an optional `avatar.png`. Writes are atomic (temp + rename). All ids MUST
 * pass `VALID_ID_RE = /^[a-zA-Z0-9_.-]{1,128}$/` — same invariant as the
 * existing `chatStorage.ts`.
 *
 * The renderer never touches the filesystem directly; it goes through
 * `desktopBridge.characterCards` and the `characterCard:*` IPC channels.
 */

import { app } from "electron";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import type {
  CharacterCardAvatar,
  CharacterCardV1,
} from "../../src/types/rp";
import {
  CARD_FIELD_MAX,
  MAX_AVATAR_BYTES,
  MAX_TAGS,
  RP_SCHEMA_VERSION,
} from "../../src/types/rp";
import { logError, logInfo } from "./logger";

/** Sub-directory under userData where character cards live. */
const CHARACTERS_DIR = "characters";

/** Atomic write: temp file then rename. */
const TMP_SUFFIX = ".tmp";

/** Must start with an alphanumeric character (rejects "." and "..") — matches
 *  the existing `chatStorage.ts` invariant. */
const VALID_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

/** Max files scanned on a single `listCharacterCards` call. */
const MAX_LIST_CARDS = 2000;
const MAX_SCAN_FILES = MAX_LIST_CARDS * 2;

/** Returns the absolute path to the characters directory. */
export function getCharactersDir(): string {
  return path.join(app.getPath("userData"), CHARACTERS_DIR);
}

/** Returns the absolute path to a card's directory. */
export function characterDir(id: string): string {
  return path.join(getCharactersDir(), id);
}

/** Returns the absolute path to a card's JSON file. */
export function characterJsonPath(id: string): string {
  return path.join(characterDir(id), "character.json");
}

/** Returns the absolute path to a card's avatar file. */
export function characterAvatarPath(id: string): string {
  return path.join(characterDir(id), "avatar.png");
}

/** Validates that an id is safe to use as a directory name. */
export function isValidId(id: unknown): id is string {
  return typeof id === "string" && VALID_ID_RE.test(id);
}

function isValidCard(obj: unknown): obj is CharacterCardV1 {
  if (!obj || typeof obj !== "object") return false;
  const c = obj as Record<string, unknown>;
  if (c.schema !== "CharacterCardV1") return false;
  if (typeof c.id !== "string" || !isValidId(c.id)) return false;
  if (typeof c.name !== "string") return false;
  if (typeof c.description !== "string") return false;
  if (typeof c.systemPrompt !== "string") return false;
  if (!Array.isArray(c.tags)) return false;
  if (typeof c.adult !== "boolean") return false;
  if (!Array.isArray(c.exampleDialogues)) return false;
  if (typeof c.createdAt !== "number" || typeof c.updatedAt !== "number") return false;
  if (c.scenario !== undefined && typeof c.scenario !== "string") return false;
  if (c.author !== undefined && typeof c.author !== "string") return false;
  if (c.modelId !== undefined && typeof c.modelId !== "string") return false;
  return true;
}

async function ensureCardDir(id: string): Promise<void> {
  await fs.mkdir(characterDir(id), { recursive: true });
}

/**
 * Lists all character card ids, sorted by `updatedAt` descending.
 * Soft caps at `MAX_LIST_CARDS` records.
 */
export async function listCharacterCards(): Promise<{ cards: CharacterCardV1[]; truncated: boolean; totalScanned: number }> {
  const dir = getCharactersDir();
  const cardDirs: string[] = [];
  let handle: Awaited<ReturnType<typeof fs.opendir>>;
  try {
    handle = await fs.opendir(dir);
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") {
      return { cards: [], truncated: false, totalScanned: 0 };
    }
    throw err;
  }
  try {
    for await (const entry of handle) {
      if (entry.isDirectory() && isValidId(entry.name)) {
        cardDirs.push(entry.name);
        if (cardDirs.length >= MAX_SCAN_FILES) {
          logInfo(`character-cards directory scan reached ${MAX_SCAN_FILES}; further entries skipped`);
          break;
        }
      }
    }
  } finally {
    // handle auto-closes in newer node; the for-await does not require manual close.
  }

  const cards: CharacterCardV1[] = [];
  for (const id of cardDirs) {
    const card = await readCharacterCard(id);
    if (card) cards.push(card);
  }
  cards.sort((a, b) => b.updatedAt - a.updatedAt);
  const truncated = cards.length > MAX_LIST_CARDS;
  return { cards: cards.slice(0, MAX_LIST_CARDS), truncated, totalScanned: cardDirs.length };
}

/** Reads and validates a single character card. Corrupt files are backed up and skipped. */
export async function readCharacterCard(id: string): Promise<CharacterCardV1 | null> {
  if (!isValidId(id)) return null;
  const file = characterJsonPath(id);
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf-8");
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidCard(parsed)) throw new Error("schema validation failed");
    // Always try to hydrate the avatar from the sidecar `avatar.png` file,
    // regardless of whether the JSON carries a stub avatar field. The card is
    // saved with `avatar: undefined` in the JSON, so we don't rely on it as a
    // presence signal.
    try {
      const buf = await fs.readFile(characterAvatarPath(id));
      const mimeType = (parsed.avatar?.mimeType ?? "image/png") as CharacterCardAvatar["mimeType"];
      parsed.avatar = {
        mimeType,
        byteLength: buf.length,
        data: buf.toString("base64"),
      } satisfies CharacterCardAvatar;
    } catch {
      // No avatar file: drop the avatar field.
      delete (parsed as { avatar?: CharacterCardAvatar }).avatar;
    }
    return parsed;
  } catch (err) {
    logError("Character card file corrupt or unreadable", { path: file, error: String(err) });
    try {
      const backupPath = `${file}.backup.${Date.now()}.${crypto.randomUUID()}`;
      await fs.rename(file, backupPath);
      logInfo("Corrupt character card backed up", backupPath);
    } catch {
      // best effort
    }
    return null;
  }
}

function clampString(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.length > max ? value.slice(0, max) : value;
}

function sanitizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    if (typeof tag !== "string") continue;
    const trimmed = tag.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    out.push(trimmed);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** Strips the embedded avatar bytes from a card before writing to disk.
 *  The avatar bytes are persisted as a separate `avatar.png` file. */
function stripAvatar(card: CharacterCardV1): CharacterCardV1 {
  if (!card.avatar) return card;
  const { avatar: _ignored, ...rest } = card;
  return { ...rest, avatar: undefined } as CharacterCardV1;
}

export type SaveCardOutcome = { ok: true } | { ok: false; error: string };

/** Persists a character card (with avatar) atomically. */
export async function saveCharacterCard(input: unknown): Promise<SaveCardOutcome> {
  if (!input || typeof input !== "object") return { ok: false, error: "card must be an object" };
  const c = input as Record<string, unknown>;
  const id = c.id;
  if (!isValidId(id)) return { ok: false, error: "invalid card id" };
  const name = clampString(c.name, CARD_FIELD_MAX);
  if (!name) return { ok: false, error: "card name is required" };
  const description = clampString(c.description, CARD_FIELD_MAX);
  const systemPrompt = clampString(c.systemPrompt, CARD_FIELD_MAX);
  const scenario = c.scenario === undefined ? undefined : clampString(c.scenario, CARD_FIELD_MAX);
  const author = c.author === undefined ? undefined : clampString(c.author, 256);
  const modelId = c.modelId === undefined ? undefined : clampString(c.modelId, 256);
  const tags = sanitizeTags(c.tags);
  const adult = c.adult === true;
  const exampleDialogues = Array.isArray(c.exampleDialogues)
    ? c.exampleDialogues
        .map((d: unknown) => {
          if (!d || typeof d !== "object") return null;
          const dd = d as Record<string, unknown>;
          return {
            speaker: clampString(dd.speaker, 128),
            text: clampString(dd.text, CARD_FIELD_MAX),
          };
        })
        .filter((d): d is { speaker: string; text: string } => Boolean(d && d.speaker && d.text))
    : [];
  const avatarRaw = c.avatar as CharacterCardAvatar | undefined;
  let avatar: CharacterCardAvatar | undefined;
  if (avatarRaw && typeof avatarRaw === "object" && typeof avatarRaw.data === "string") {
    if (avatarRaw.byteLength > MAX_AVATAR_BYTES) {
      return { ok: false, error: `avatar exceeds ${MAX_AVATAR_BYTES} bytes` };
    }
    avatar = {
      data: avatarRaw.data,
      mimeType: avatarRaw.mimeType || "image/png",
      byteLength: avatarRaw.byteLength,
    };
  }

  const now = Date.now();
  const createdAt = typeof c.createdAt === "number" ? c.createdAt : now;
  const updatedAt = typeof c.updatedAt === "number" ? c.updatedAt : now;
  const card: CharacterCardV1 = {
    schema: "CharacterCardV1",
    id,
    name,
    description,
    systemPrompt,
    scenario,
    author,
    modelId,
    tags,
    adult,
    exampleDialogues,
    avatar,
    createdAt,
    updatedAt,
  };

  await ensureCardDir(id);

  // Persist avatar separately.
  if (avatar) {
    const cleanData = avatar.data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanData, "base64");
    if (buffer.length > MAX_AVATAR_BYTES) {
      return { ok: false, error: `avatar exceeds ${MAX_AVATAR_BYTES} bytes` };
    }
    await atomicWrite(characterAvatarPath(id), buffer);
  } else {
    // No avatar provided: leave any prior file in place? No — drop it for hygiene.
    try {
      await fs.unlink(characterAvatarPath(id));
    } catch {
      // ignore
    }
  }

  const withoutAvatar = stripAvatar(card);
  await atomicWrite(characterJsonPath(id), Buffer.from(JSON.stringify(withoutAvatar, null, 2), "utf-8"));
  return { ok: true };
}

/** Deletes a character card and its avatar. */
export async function deleteCharacterCard(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!isValidId(id)) return { ok: false, error: "invalid id" };
  try {
    await fs.rm(characterDir(id), { recursive: true, force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Atomic write: temp + rename. */
async function atomicWrite(target: string, data: Buffer): Promise<void> {
  const tmp = `${target}${TMP_SUFFIX}`;
  await fs.writeFile(tmp, data, { mode: 0o600 });
  await fs.rename(tmp, target);
}

export const _testing = {
  VALID_ID_RE,
  RP_SCHEMA_VERSION,
};
