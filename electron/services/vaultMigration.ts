/**
 * @fileoverview Service to manage safe migration of legacy flat JSON chat history files
 * to the new encrypted Conversation Vault.
 */

import { app } from "electron";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import {
  saveConversation,
  CONVERSATIONS_DIR,
} from "./conversationVault";
import type {
  ConversationRecordV1,
  ConversationMessage,
} from "../../src/types/conversationVault";

const LEGACY_DIR = path.join(app.getPath("userData"), "chat-history");
const VALID_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;

interface LegacyMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string | unknown[];
  reasoning_content?: string;
  timestamp: number;
}

interface LegacyConversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  model: string;
  systemPrompt?: string;
  messages: LegacyMessage[];
}

/**
 * Checks if there are legacy conversations to migrate.
 */
export async function detectLegacyHistory(): Promise<boolean> {
  try {
    const entries = await fs.readdir(LEGACY_DIR, { withFileTypes: true });
    return entries.some((entry) => entry.isFile() && entry.name.endsWith(".json"));
  } catch {
    return false;
  }
}

/**
 * Validates the legacy message structure.
 */
function isValidLegacyMessage(m: unknown): m is LegacyMessage {
  if (!m || typeof m !== "object") return false;
  const msg = m as Record<string, unknown>;
  if (typeof msg.id !== "string" || !msg.id) return false;
  if (typeof msg.role !== "string" || !["system", "user", "assistant", "tool"].includes(msg.role)) return false;
  if (typeof msg.content !== "string" && !Array.isArray(msg.content)) return false;
  if (typeof msg.timestamp !== "number") return false;
  return true;
}

/**
 * Validates the legacy conversation structure.
 */
function isValidLegacyConversation(c: unknown): c is LegacyConversation {
  if (!c || typeof c !== "object") return false;
  const conv = c as Record<string, unknown>;
  if (typeof conv.id !== "string" || !conv.id) return false;
  if (typeof conv.title !== "string") return false;
  if (typeof conv.createdAt !== "number") return false;
  if (typeof conv.updatedAt !== "number") return false;
  if (typeof conv.model !== "string") return false;
  if (!Array.isArray(conv.messages)) return false;
  return conv.messages.every(isValidLegacyMessage);
}

/**
 * Runs the migration process.
 */
export async function migrateLegacyHistory(): Promise<{
  ok: boolean;
  migrated: number;
  failed: number;
  skipped: number;
  error?: string;
}> {
  let migrated = 0;
  let failed = 0;
  const skipped = 0;

  try {
    const exists = await detectLegacyHistory();
    if (!exists) {
      return { ok: true, migrated: 0, failed: 0, skipped: 0 };
    }

    const entries = await fs.readdir(LEGACY_DIR, { withFileTypes: true });
    const jsonFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith(".json"));

    const migratedDir = path.join(LEGACY_DIR, "migrated");
    await fs.mkdir(migratedDir, { recursive: true });

    const corruptDir = path.join(CONVERSATIONS_DIR, "corrupt");
    await fs.mkdir(corruptDir, { recursive: true });

    const logPath = path.join(CONVERSATIONS_DIR, "migration.log");

    for (const file of jsonFiles) {
      const filePath = path.join(LEGACY_DIR, file.name);
      let raw = "";
      try {
        raw = await fs.readFile(filePath, "utf-8");
      } catch (readErr) {
        failed++;
        const logMsg = `[${new Date().toISOString()}] Failed to read legacy file ${file.name}: ${readErr}\n`;
        await fs.appendFile(logPath, logMsg).catch(() => {});
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch (parseErr) {
        failed++;
        // Move to corrupt directory
        const dest = path.join(corruptDir, `conv_corrupted_${Date.now()}_${file.name}`);
        await fs.rename(filePath, dest).catch(() => {});
        const logMsg = `[${new Date().toISOString()}] Corrupted JSON in legacy file ${file.name}: ${parseErr}\n`;
        await fs.appendFile(logPath, logMsg).catch(() => {});
        continue;
      }

      if (!parsed || typeof parsed !== "object") {
        failed++;
        continue;
      }
      const parsedObj = parsed as Record<string, unknown>;
      const conv = parsedObj.conversation ? parsedObj.conversation : parsedObj;

      if (!isValidLegacyConversation(conv)) {
        failed++;
        const dest = path.join(corruptDir, `conv_corrupted_${Date.now()}_${file.name}`);
        await fs.rename(filePath, dest).catch(() => {});
        const logMsg = `[${new Date().toISOString()}] Invalid conversation schema in legacy file ${file.name}\n`;
        await fs.appendFile(logPath, logMsg).catch(() => {});
        continue;
      }

      // Handle ID validation and path traversal sanitization
      const originalId = conv.id;
      let finalId = originalId;
      let aliasMapping: { oldId: string; newId: string; migratedAt: number } | null = null;

      if (!VALID_ID_RE.test(originalId)) {
        finalId = "conv_" + crypto.randomUUID().replace(/-/g, "");
        aliasMapping = {
          oldId: originalId,
          newId: finalId,
          migratedAt: Date.now(),
        };
      }

      // Map roles and properties to ConversationRecordV1
      const recordMessages: ConversationMessage[] = conv.messages.map((m) => {
        let contentStr = "";
        if (typeof m.content === "string") {
          contentStr = m.content;
        } else if (Array.isArray(m.content)) {
          // Multimodal text extraction
          contentStr = m.content
            .filter((part): part is { type: string; text?: string } => 
              typeof part === "object" && part !== null && "type" in part
            )
            .filter((part) => part.type === "text")
            .map((part) => part.text || "")
            .join(" ");
        }
        return {
          id: m.id || crypto.randomUUID(),
          role: m.role,
          content: contentStr,
          reasoning_content: m.reasoning_content,
          timestamp: m.timestamp,
        };
      });

      const record: ConversationRecordV1 = {
        version: 1,
        id: finalId,
        title: conv.title,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
        model: conv.model,
        systemPrompt: conv.systemPrompt,
        messages: recordMessages,
        metadata: {
          tags: [],
          pinned: false,
          archived: false,
          source: "migration",
          messageCount: recordMessages.length,
          migratedFrom: {
            oldPath: filePath,
            oldId: originalId,
            migratedAt: Date.now(),
          },
        },
        memory: {
          summary: conv.title || "",
          topics: [],
          entities: [],
          userFacts: [],
          projectRefs: [],
        },
      };

      const saveRes = await saveConversation(record);
      if (saveRes.ok) {
        migrated++;
        const dest = path.join(migratedDir, file.name);
        await fs.rename(filePath, dest);
        if (aliasMapping) {
          const logMsg = `[${new Date().toISOString()}] Migrated ${file.name} with alias conversion: ${originalId} -> ${finalId}\n`;
          await fs.appendFile(logPath, logMsg).catch(() => {});
        }
      } else {
        failed++;
        const dest = path.join(corruptDir, `conv_corrupted_${Date.now()}_${file.name}`);
        await fs.rename(filePath, dest).catch(() => {});
        const logMsg = `[${new Date().toISOString()}] Failed to encrypt/save ${file.name} into vault: ${saveRes.error}\n`;
        await fs.appendFile(logPath, logMsg).catch(() => {});
      }
    }

    return { ok: true, migrated, failed, skipped };
  } catch (err) {
    return {
      ok: false,
      migrated,
      failed,
      skipped,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
