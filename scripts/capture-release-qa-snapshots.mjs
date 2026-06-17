#!/usr/bin/env node
/* global console, process, setTimeout, window */

import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const nodeBin = process.execPath;
const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
const host = process.env.RELEASE_QA_SNAPSHOT_HOST || "127.0.0.1";
const port = Number(process.env.RELEASE_QA_SNAPSHOT_PORT || 5187);
const baseUrl = process.env.RELEASE_QA_SNAPSHOT_URL || `http://${host}:${port}`;
const outDir = path.resolve(
  repoRoot,
  process.env.RELEASE_QA_SNAPSHOT_DIR || "docs/audits/visual-snapshots",
);

function waitForServer(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const poll = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      req.on("error", retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(poll, 250);
    };
    poll();
  });
}

async function clickIfPresent(page, name) {
  const button = page.getByRole("button", { name });
  try {
    await button.click({ timeout: 1200 });
  } catch {
    // Optional first-run/dismiss controls are not always present.
  }
}

async function openTab(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForTimeout(350);
}

async function main() {
  await mkdir(outDir, { recursive: true });

  const server = spawn(nodeBin, [viteBin, "--host", host, "--port", String(port), "--strictPort"], {
    cwd: repoRoot,
    env: { ...process.env, ELECTRON_BUILD: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverOutput = "";
  server.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
  server.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

  try {
    await waitForServer(baseUrl);

    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
    await page.route("**/api/session-key", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ configured: true }),
    }));
    await page.route("**/api/session-jina-key", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ configured: false }),
    }));
    await page.route("**/api/venice/models?**", (route) => route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }));
    await page.addInitScript(() => {
      window.localStorage.setItem("vf.legal.firstRunAcknowledged", "1");
    });
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    await clickIfPresent(page, /I understand and am 18\+/i);
    await clickIfPresent(page, /skip|close|continue|get started/i);

    await openTab(page, "Chat");
    await page.screenshot({ path: path.join(outDir, "chat.png"), fullPage: true });

    await openTab(page, "History");
    await page.screenshot({ path: path.join(outDir, "history.png"), fullPage: true });

    await openTab(page, "Image Studio");
    await page.screenshot({ path: path.join(outDir, "image-studio.png"), fullPage: true });

    await browser.close();
    console.log(`[release-qa-snapshots] Wrote snapshots to ${outDir}`);
  } catch (error) {
    console.error("[release-qa-snapshots] Failed to capture snapshots.");
    if (serverOutput.trim()) console.error(serverOutput.trim());
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    server.kill("SIGTERM");
  }
}

await main();
