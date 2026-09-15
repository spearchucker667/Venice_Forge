#!/usr/bin/env node
/* global window, console, process, setTimeout */
/**
 * Phase 9 visual QA capture for the reference-driven redesign.
 *
 * Boots Vite, drives the Venice Forge renderer through Playwright, and
 * captures a focused screenshot matrix into
 *   docs/design/reference-ui-redesign-evidence/<viewport>/<theme-locale>/<surface>.png
 *
 * The matrix is intentionally a subset of the handoff §33 table — the
 * canonical surfaces (shell, chat, settings, status) at the four
 * documented viewports, plus the Light theme and an Arabic RTL pass on
 * the shell — to keep a single headless run within a few minutes while
 * still proving the reference visual contract.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const nodeBin = process.execPath;
const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
const host = process.env.REDESIGN_CAPTURE_HOST || "127.0.0.1";
const port = Number(process.env.REDESIGN_CAPTURE_PORT || 5188);
const baseUrl = process.env.REDESIGN_CAPTURE_URL || `http://${host}:${port}`;
const outRoot = path.resolve(
  repoRoot,
  process.env.REDESIGN_CAPTURE_DIR || "docs/design/reference-ui-redesign-evidence",
);

const VIEWPORTS = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "2560x1440", width: 2560, height: 1440 },
  { name: "mobile-390x844", width: 390, height: 844 },
];

// Themes are encoded as initialTheme + activeAppearanceMode values that the
// app already persists; the page picks them up via localStorage on init.
const THEME_PRESETS = [
  { id: "venice-dark", theme: "venice", mode: "dark", dir: "ltr" },
  { id: "venice-light", theme: "venice", mode: "light", dir: "ltr" },
  { id: "venice-rtl", theme: "venice", mode: "dark", dir: "rtl" },
];

const SURFACES = [
  { id: "shell", navigateTo: "Chat", selector: "body" },
  { id: "chat", navigateTo: "Chat", selector: "body" },
  { id: "settings", navigateTo: "Settings", selector: "body" },
  { id: "status", navigateTo: "Status", selector: "body" },
];

function waitForServer(url, timeoutMs = 45_000) {
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

async function clickIfPresent(page, pattern) {
  const button = page.getByRole("button", { name: pattern });
  try {
    await button.click({ timeout: 1200 });
  } catch {
    /* optional */
  }
}

async function openTab(page, name) {
  try {
    await page.getByRole("button", { name, exact: true }).click({ timeout: 2000 });
  } catch {
    try {
      await page.getByRole("link", { name, exact: true }).click({ timeout: 2000 });
    } catch {
      /* surface may not exist in this build */
    }
  }
  await page.waitForTimeout(450);
}

async function captureSurface(browser, preset, viewport, surface, outDir) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    locale: preset.dir === "rtl" ? "ar" : "en-US",
    colorScheme: preset.mode === "light" ? "light" : "dark",
  });
  const page = await context.newPage();
  await page.addInitScript(
    ({ preset }) => {
      // Persist the theme + appearance via the zustand settings-store name
      // so the bootstrap picks them up. The persisted slice is a subset of
      // `useSettingsStore`; we write a minimal valid payload that resets
      // appearanceMode + activeMode + activeThemeId + locale.
      const settingsPayload = {
        state: {
          appearanceMode: preset.mode,
          activeMode: preset.mode,
          activeThemeId: preset.theme,
        },
        version: 0,
      };
      window.localStorage.setItem(
        "venice-settings",
        JSON.stringify(settingsPayload),
      );
      // Persisted locale lives in the i18n slice.
      window.localStorage.setItem(
        "venice.locale",
        JSON.stringify({
          locale: preset.dir === "rtl" ? "ar" : "en-US",
        }),
      );
    },
    { preset },
  );
  await page.route("**/api/session-key", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ configured: true }),
    }),
  );
  await page.route("**/api/session-jina-key", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ configured: false }),
    }),
  );
  await page.route("**/api/venice/models?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    }),
  );

  await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);

  await clickIfPresent(page, /I understand and am 18\+/i);

  // Dismiss the onboarding splash (4 steps: welcome → profiles → security → safety).
  // The first three steps render "Continue"; the final step renders "Get Started".
  for (let step = 0; step < 6; step += 1) {
    await clickIfPresent(page, /^Continue$/);
    await clickIfPresent(page, /^Get Started$/);
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(600);

  await openTab(page, surface.navigateTo);

  const filename = `${surface.id}.png`;
  const out = path.join(outDir, filename);
  await page.screenshot({ path: out, fullPage: false });
  await context.close();
  return out;
}

async function main() {
  await mkdir(outRoot, { recursive: true });

  const server = spawn(
    nodeBin,
    [viteBin, "--host", host, "--port", String(port), "--strictPort"],
    {
      cwd: repoRoot,
      env: { ...process.env, ELECTRON_BUILD: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverOutput = "";
  server.stdout.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });
  server.stderr.on("data", (chunk) => {
    serverOutput += chunk.toString();
  });

  const manifest = {
    generatedAt: new Date().toISOString(),
    viewport: VIEWPORTS,
    themePresets: THEME_PRESETS,
    surfaces: SURFACES.map((s) => s.id),
    captures: [],
    failures: [],
  };

  try {
    await waitForServer(baseUrl);
    const browser = await chromium.launch();

    // Limit the matrix to keep the run short. Default Venice at all 4 desktop
    // viewports, plus Light at 1440, plus RTL Arabic at 1440 — on shell/chat/
    // settings/status surfaces.
    const plan = [];
    for (const viewport of VIEWPORTS.filter((v) => ! v.name.startsWith("mobile"))) {
      for (const surface of SURFACES) {
        plan.push({ viewport, preset: THEME_PRESETS[0], surface });
      }
    }
    plan.push({ viewport: VIEWPORTS[1], preset: THEME_PRESETS[1], surface: SURFACES[0] });
    plan.push({ viewport: VIEWPORTS[1], preset: THEME_PRESETS[1], surface: SURFACES[1] });
    plan.push({ viewport: VIEWPORTS[1], preset: THEME_PRESETS[2], surface: SURFACES[0] });
    plan.push({ viewport: VIEWPORTS[1], preset: THEME_PRESETS[2], surface: SURFACES[1] });
    // Mobile viewport — shell only.
    plan.push({ viewport: VIEWPORTS[4], preset: THEME_PRESETS[0], surface: SURFACES[0] });

    for (const item of plan) {
      const dir = path.join(
        outRoot,
        item.viewport.name,
        `${item.preset.id}`,
      );
      await mkdir(dir, { recursive: true });
      try {
        const out = await captureSurface(
          browser,
          item.preset,
          item.viewport,
          item.surface,
          dir,
        );
        manifest.captures.push({
          viewport: item.viewport.name,
          preset: item.preset.id,
          surface: item.surface.id,
          file: path.relative(repoRoot, out),
        });
        console.log(`captured ${path.relative(repoRoot, out)}`);
      } catch (error) {
        manifest.failures.push({
          viewport: item.viewport.name,
          preset: item.preset.id,
          surface: item.surface.id,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error(
          `failed ${item.viewport.name}/${item.preset.id}/${item.surface.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    await browser.close();

    const manifestPath = path.join(outRoot, "EVIDENCE_MANIFEST.json");
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`[redesign-matrix] Wrote manifest to ${manifestPath}`);
  } catch (error) {
    console.error("[redesign-matrix] Failed to capture.");
    if (serverOutput.trim()) console.error(serverOutput.trim());
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    server.kill("SIGTERM");
  }
}

await main();