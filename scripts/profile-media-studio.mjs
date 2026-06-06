/* global AbortSignal, console, crypto, document, fetch, indexedDB, localStorage, performance, setTimeout, TextEncoder */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const recordCount = Math.max(1, Number.parseInt(process.env.MEDIA_PROFILE_COUNT || "1000", 10));
const screenshotDir = process.env.MEDIA_PROFILE_SCREENSHOT_DIR || path.join(os.tmpdir(), "venice-forge-media-profile");
const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "venice-forge-profile-"));

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

async function isDevServerReady() {
  try {
    const response = await fetch("http://localhost:5173", { signal: AbortSignal.timeout(1_000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureDevServer() {
  if (await isDevServerReady()) return null;
  const viteEntry = path.join(root, "node_modules", "vite", "bin", "vite.js");
  const child = spawn(process.execPath, [viteEntry, "--host", "127.0.0.1"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = [];
  child.stdout.on("data", (chunk) => output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => output.push(chunk.toString()));
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite exited before startup.\n${output.join("")}`);
    if (await isDevServerReady()) return child;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill("SIGTERM");
  throw new Error(`Timed out waiting for Vite on http://localhost:5173.\n${output.join("")}`);
}

async function waitForAppWindow(app) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const page = app.windows().find((candidate) => candidate.url().startsWith("http://localhost:5173"));
    if (page) return page;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for the Venice Forge renderer window at http://localhost:5173.");
}

async function clearMedia(page) {
  await page.evaluate(async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open("venice_canvas_studio_v1", 6);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("images", "readwrite");
        tx.objectStore("images").clear();
        tx.oncomplete = () => {
          db.close();
          resolve(undefined);
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
}

async function seedMedia(page) {
  const batchDurations = await page.evaluate(async (count) => {
    const openDatabase = (name, version, onUpgrade) => new Promise((resolve, reject) => {
      const request = indexedDB.open(name, version);
      request.onupgradeneeded = () => onUpgrade?.(request.result);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const keyDb = await openDatabase("venice_forge_keys", 1, (db) => {
      if (!db.objectStoreNames.contains("keys")) db.createObjectStore("keys", { keyPath: "id" });
    });
    let key = await new Promise((resolve, reject) => {
      const request = keyDb.transaction("keys", "readonly").objectStore("keys").get("venice-forge-key");
      request.onsuccess = () => resolve(request.result?.key);
      request.onerror = () => reject(request.error);
    });
    if (!key) {
      key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
      await new Promise((resolve, reject) => {
        const tx = keyDb.transaction("keys", "readwrite");
        tx.objectStore("keys").put({ id: "venice-forge-key", key });
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => reject(tx.error);
      });
    }

    const mediaDb = await openDatabase("venice_canvas_studio_v1", 6);
    const durations = [];
    for (let offset = 0; offset < count; offset += 25) {
      const started = performance.now();
      const batch = await Promise.all(Array.from({ length: Math.min(25, count - offset) }, async (_, index) => {
        const itemNumber = offset + index;
        const item = {
          id: `profile-${String(itemNumber).padStart(4, "0")}`,
          image: "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
          prompt: `Media profile fixture ${itemNumber}`,
          model: "profile-model",
          timestamp: 1_800_000_000_000 - itemNumber,
          mediaItemVersion: 1,
          mediaType: "image",
          operation: "generate",
          parentId: null,
          childrenIds: [],
          tags: ["profile"],
          note: "Synthetic local performance fixture",
          favorite: false,
          viewCount: 0,
        };
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(JSON.stringify(item));
        const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
        return {
          id: item.id,
          timestamp: item.timestamp,
          data: { _encrypted: true, iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted)) },
          _isEncryptedWrapper: true,
        };
      }));
      await new Promise((resolve, reject) => {
        const tx = mediaDb.transaction("images", "readwrite");
        const store = tx.objectStore("images");
        for (const item of batch) store.put(item);
        tx.oncomplete = () => resolve(undefined);
        tx.onerror = () => reject(tx.error);
      });
      durations.push(performance.now() - started);
    }
    keyDb.close();
    mediaDb.close();
    return durations;
  }, recordCount);

  return {
    totalMs: batchDurations.reduce((sum, value) => sum + value, 0),
    batchP50Ms: percentile(batchDurations, 0.5),
    batchP95Ms: percentile(batchDurations, 0.95),
  };
}

async function rendererMetrics(page) {
  return page.evaluate(() => {
    const memory = performance.memory;
    return {
      cardCount: document.querySelectorAll(".media-card-virtualized").length,
      usedJsHeapBytes: memory?.usedJSHeapSize ?? null,
      totalJsHeapBytes: memory?.totalJSHeapSize ?? null,
      domNodes: document.getElementsByTagName("*").length,
    };
  });
}

await fs.mkdir(screenshotDir, { recursive: true });
const consoleIssues = [];
const ignoredConsoleIssues = [];
let app;
let devServer;

try {
  devServer = await ensureDevServer();
  app = await electron.launch({
    args: [root, `--user-data-dir=${userDataDir}`],
    cwd: root,
    env: { ...process.env, NODE_ENV: "development" },
  });
  const page = await waitForAppWindow(app);
  page.on("console", (message) => {
    if (!["warning", "error"].includes(message.type())) return;
    const issue = `${message.type()}: ${message.text()}`;
    if (/crypto\.subtle available: true|Electron Security Warning \(Insecure Content-Security-Policy\)/.test(issue)) {
      ignoredConsoleIssues.push(issue);
    } else {
      consoleIssues.push(issue);
    }
  });
  page.on("pageerror", (error) => consoleIssues.push(`pageerror: ${error.message}`));

  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => localStorage.setItem("vf.legal.firstRunAcknowledged", "1"));
  await page.reload({ waitUntil: "domcontentloaded" });
  const apiKeyDialogCancel = page.getByRole("button", { name: "Cancel" });
  if (await apiKeyDialogCancel.isVisible({ timeout: 5_000 }).catch(() => false)) await apiKeyDialogCancel.click();

  await page.getByRole("button", { name: "Media Studio" }).click();
  await page.getByRole("heading", { name: "Media Studio" }).waitFor();
  await clearMedia(page);
  await page.getByRole("button", { name: "Chat" }).click();
  const seed = await seedMedia(page);
  const reloadStarted = performance.now();
  await page.getByRole("button", { name: "Media Studio" }).click();
  await page.getByText(`60 of ${recordCount} items loaded`).waitFor({ timeout: 30_000 });
  const initialLoadMs = performance.now() - reloadStarted;
  const initial = await rendererMetrics(page);
  const initialScreenshot = path.join(screenshotDir, `media-profile-${recordCount}-initial.png`);
  await page.screenshot({ path: initialScreenshot, fullPage: false });

  const loadMoreStarted = performance.now();
  await page.getByRole("button", { name: /Load more/ }).click();
  await page.getByText(`120 of ${recordCount} items loaded`).waitFor({ timeout: 30_000 });
  const loadMoreMs = performance.now() - loadMoreStarted;
  const afterLoadMore = await rendererMetrics(page);
  const loadMoreScreenshot = path.join(screenshotDir, `media-profile-${recordCount}-load-more.png`);
  await page.screenshot({ path: loadMoreScreenshot, fullPage: false });

  const result = {
    recordCount,
    pageSize: 60,
    seed,
    initialLoadMs,
    loadMoreMs,
    initial,
    afterLoadMore,
    consoleIssues,
    ignoredConsoleIssues,
    screenshots: [initialScreenshot, loadMoreScreenshot],
  };
  console.log(JSON.stringify(result, null, 2));

  if (initial.cardCount !== Math.min(60, recordCount)) throw new Error(`Expected 60 initial cards, found ${initial.cardCount}.`);
  if (recordCount >= 120 && afterLoadMore.cardCount !== 120) throw new Error(`Expected 120 cards after load-more, found ${afterLoadMore.cardCount}.`);
  if (consoleIssues.length > 0) throw new Error(`Renderer emitted ${consoleIssues.length} warning/error message(s).`);
} finally {
  await app?.close().catch(() => undefined);
  devServer?.kill("SIGTERM");
  await fs.rm(userDataDir, { recursive: true, force: true });
}
