#!/usr/bin/env node
/* global window, console, process, setTimeout, localStorage */
/**
 * Phase 9 visual QA capture for the reference-driven redesign.
 *
 * Boots Vite, drives the Venice Forge renderer through Playwright, and
 * captures the focused screenshot matrix into
 *   docs/design/reference-ui-redesign-evidence/<viewport>/<theme-locale>/<surface>.png
 *
 * The matrix is a representative subset of the handoff §33 table covering
 * the canonical surfaces (shell / chat / image-studio / media-studio /
 * workflows / documents / settings-theme-maker / status / modal-command-palette)
 * at the four documented viewports, with light + alt-dark (Nord) + RTL
 * (Arabic) representative samples on the most important surfaces.
 *
 * The capture sequence dismisses the four-step onboarding splash, then
 * for each (viewport × preset × surface) plan navigates via the sidebar
 * (or via keyboard for the command palette) and captures the viewport.
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
const port = Number(process.env.REDESIGN_CAPTURE_PORT || 5189);
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

// (id, theme, mode, locale). "alt-dark" uses Nord via persisted settings.
const THEME_PRESETS = [
  { id: "venice-dark", theme: "venice", mode: "dark", locale: "en-US" },
  { id: "venice-light", theme: "venice", mode: "light", locale: "en-US" },
  { id: "nord-dark", theme: "nord", mode: "dark", locale: "en-US" },
  { id: "venice-rtl", theme: "venice", mode: "dark", locale: "ar" },
];

// (id, navigateTo, action). navigateTo clicks a sidebar button by name.
// "command-palette" uses keyboard (Ctrl+K) instead of a sidebar button.
const SURFACES = [
  { id: "shell", navigateTo: "Chat" },
  { id: "chat", navigateTo: "Chat" },
  { id: "image-studio", navigateTo: "Image Studio" },
  { id: "media-studio", navigateTo: "Media Studio" },
  { id: "workflows", navigateTo: "Workflows" },
  { id: "documents", navigateTo: "Documents" },
  { id: "settings", navigateTo: "Settings" },
  { id: "status", navigateTo: "Status" },
  { id: "command-palette", navigateTo: null, action: "commandPalette" },
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
  try {
    const button = page.getByRole("button", { name: pattern });
    await button.click({ timeout: 1200 });
    return true;
  } catch {
    /* optional */
    return false;
  }
}

async function dismissOnboarding(page) {
  // First, dismiss the legal first-run modal if present.
  await clickIfPresent(page, /I understand and am 18\+/i);
  await page.waitForTimeout(250);
  for (let step = 0; step < 6; step += 1) {
    const c = await clickIfPresent(page, /^Continue$/);
    const g = await clickIfPresent(page, /^Get Started$/);
    const l = await clickIfPresent(page, /I understand and am 18\+/i);
    if (!c && !g && !l) break;
    await page.waitForTimeout(300);
  }
  // Some surfaces show the legal gate after the splash. Re-check once more.
  await clickIfPresent(page, /I understand and am 18\+/i);
  await page.waitForTimeout(400);
}

async function openTab(page, name) {
  if (!name) return;
  const clicked = await clickIfPresent(page, name);
  if (!clicked) {
    // Fall back to setting via store
    await page.evaluate((tabName) => {
      const raw = localStorage.getItem("venice-settings");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          parsed.state = { ...(parsed.state ?? {}), activeTab: tabName.toLowerCase().replace(/\s+/g, "-") };
          localStorage.setItem("venice-settings", JSON.stringify(parsed));
        } catch {
          /* ignore */
        }
      }
    }, name);
    await page.reload({ waitUntil: "domcontentloaded" });
    await dismissOnboarding(page);
  }
  await page.waitForTimeout(450);
}

async function openCommandPalette(page) {
  await page.keyboard.press("ControlOrMeta+k");
  await page.waitForTimeout(500);
}

async function captureSurface(browser, preset, viewport, surface, outDir) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    locale: preset.locale,
    colorScheme: preset.mode === "light" ? "light" : "dark",
  });
  const page = await context.newPage();
  await page.addInitScript(
    ({ preset }) => {
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
      window.localStorage.setItem(
        "venice.locale",
        JSON.stringify({ locale: preset.locale }),
      );
      // Pre-acknowledge the legal first-run gate so the legal modal does not
      // obscure the workspace on first paint.
      window.localStorage.setItem("vf.legal.firstRunAcknowledged", "1");
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
  await dismissOnboarding(page);

  if (surface.action === "commandPalette") {
    await openCommandPalette(page);
  } else {
    await openTab(page, surface.navigateTo);
  }

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

    // Handoff §33 matrix: shell, chat, image-studio, media-studio,
    // workflows, documents, settings, status, modal/command-palette across
    // default dark / light / alt dark / RTL at multiple viewports.
    // Keep the run focused: shell + chat + settings at all 4 desktop
    // viewports; alt-dark on the same; full surface sweep at 1440x900.
    const plan = [];
    // 1) All 9 surfaces at 1440x900 venice-dark (the canonical default).
    for (const surface of SURFACES) {
      plan.push({ viewport: VIEWPORTS[1], preset: THEME_PRESETS[0], surface });
    }
    // 2) Shell + chat + settings + status at every desktop viewport (venice-dark).
    for (const viewport of VIEWPORTS.filter((v) => !v.name.startsWith("mobile"))) {
      for (const surfaceId of ["shell", "chat", "settings", "status"]) {
        const surface = SURFACES.find((s) => s.id === surfaceId);
        plan.push({ viewport, preset: THEME_PRESETS[0], surface });
      }
    }
    // 3) venice-light on shell/chat/settings/status at 1440x900.
    for (const surfaceId of ["shell", "chat", "settings", "status"]) {
      const surface = SURFACES.find((s) => s.id === surfaceId);
      plan.push({ viewport: VIEWPORTS[1], preset: THEME_PRESETS[1], surface });
    }
    // 4) nord-dark (alt dark) on shell/chat/settings at 1440x900.
    for (const surfaceId of ["shell", "chat", "settings"]) {
      const surface = SURFACES.find((s) => s.id === surfaceId);
      plan.push({ viewport: VIEWPORTS[1], preset: THEME_PRESETS[2], surface });
    }
    // 5) venice-rtl (Arabic) on shell/chat/settings at 1440x900.
    for (const surfaceId of ["shell", "chat", "settings"]) {
      const surface = SURFACES.find((s) => s.id === surfaceId);
      plan.push({ viewport: VIEWPORTS[1], preset: THEME_PRESETS[3], surface });
    }
    // 6) mobile-390x844 on shell only.
    plan.push({ viewport: VIEWPORTS[4], preset: THEME_PRESETS[0], surface: SURFACES[0] });

    for (const item of plan) {
      const dir = path.join(
        outRoot,
        item.viewport.name,
        item.preset.id,
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