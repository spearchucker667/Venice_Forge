#!/usr/bin/env node
/* global window, document, console, process, setTimeout */
/**
 * Automated Playwright capture and limited shell-layout checker for the per-tab
 * acceptance harness (VF-20260918-P2-016 / VF-20260922-P2-011).
 *
 * Drives the Venice Forge renderer through Playwright across the 15 canonical
 * tabs, capturing:
 *   - screenshot.png (initial render)
 *   - screenshot-tab.png (keyboard focus state)
 *   - screenshot-overflow.png (stress / overflow state)
 *
 * Emits and populates evidence into:
 *   docs/design/per-tab-acceptance/evidence/<tab>/<viewport>__<theme>__<locale>/
 *
 * Usage:
 *   node scripts/capture-per-tab-acceptance.mjs
 *   node scripts/capture-per-tab-acceptance.mjs --tabs character-chats,history,privacy
 *   node scripts/capture-per-tab-acceptance.mjs --viewports 1280x720,mobile-390x844
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const nodeBin = process.execPath;
const viteBin = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");

const evidenceRoot = path.join(repoRoot, "docs/design/per-tab-acceptance/evidence");
const tabRoutesFile = path.join(repoRoot, "scripts/per-tab-acceptance/tab-routes.json");

const VIEWPORT_MAP = {
  "1280x720": { width: 1280, height: 720 },
  "1440x900": { width: 1440, height: 900 },
  "1920x1080": { width: 1920, height: 1080 },
  "2560x1440": { width: 2560, height: 1440 },
  "mobile-390x844": { width: 390, height: 844 },
};

const THEME_MAP = {
  "venice-dark": { theme: "venice", mode: "dark" },
  "venice-light": { theme: "venice", mode: "light" },
  "nord-dark": { theme: "nord", mode: "dark" },
  "venice-rtl": { theme: "venice", mode: "dark" },
};

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    tabs: "all",
    viewports: "1280x720,mobile-390x844",
    themes: "venice-dark,venice-light,venice-rtl",
    locales: "en-US,ar",
    port: Number(process.env.PER_TAB_PORT || 5192),
    host: process.env.PER_TAB_HOST || "127.0.0.1",
    devUrl: process.env.VENICE_FORGE_DEV_URL || "",
  };

  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const next = args[i + 1];
    if (flag === "--tabs" && next) {
      opts.tabs = next;
      i++;
    } else if (flag === "--viewports" && next) {
      opts.viewports = next;
      i++;
    } else if (flag === "--themes" && next) {
      opts.themes = next;
      i++;
    } else if (flag === "--locales" && next) {
      opts.locales = next;
      i++;
    } else if (flag === "--port" && next) {
      opts.port = Number(next);
      i++;
    } else if (flag === "--dev-url" && next) {
      opts.devUrl = next;
      i++;
    }
  }

  return opts;
}

function waitForServer(url, timeoutMs = 40_000) {
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
        reject(new Error(`Timed out waiting for server at ${url}`));
        return;
      }
      setTimeout(poll, 250);
    };
    poll();
  });
}

async function getChromiumExecutable() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (fs.existsSync(systemChrome)) {
    return systemChrome;
  }
  return undefined;
}

async function clickIfPresent(page, pattern) {
  try {
    const button = page.getByRole("button", { name: pattern });
    await button.click({ timeout: 1000 });
    return true;
  } catch {
    return false;
  }
}

async function dismissOnboarding(page) {
  await clickIfPresent(page, /I understand and am 18\+/i);
  await page.waitForTimeout(150);
  for (let step = 0; step < 5; step += 1) {
    const c = await clickIfPresent(page, /^Continue$/);
    const g = await clickIfPresent(page, /^Get Started$/);
    const l = await clickIfPresent(page, /I understand and am 18\+/i);
    if (!c && !g && !l) break;
    await page.waitForTimeout(200);
  }
}

async function runCaptureForTuple({
  browser,
  baseUrl,
  tabInfo,
  viewportName,
  themeName,
  localeName,
}) {
  const vp = VIEWPORT_MAP[viewportName] || { width: 1280, height: 720 };
  const themeConfig = THEME_MAP[themeName] || { theme: "venice", mode: "dark" };
  const isRtl = localeName === "ar" || themeName === "venice-rtl";
  const browserVersion = browser.version();

  const tupleDir = path.join(
    evidenceRoot,
    tabInfo.id,
    `${viewportName}__${themeName}__${localeName}`,
  );
  await mkdir(tupleDir, { recursive: true });

  const manifestPath = path.join(tupleDir, "manifest.json");
  const notesPath = path.join(tupleDir, "notes.md");

  // Skip if already signed
  try {
    const existing = JSON.parse(await readFile(manifestPath, "utf8"));
    if (existing?.reviewer?.signature?.trim()) {
      console.log(`  [skip signed] ${tabInfo.id}/${viewportName}__${themeName}__${localeName}`);
      return 0;
    }
  } catch {
    /* file does not exist or unparseable, proceed with capture */
  }

  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    locale: localeName,
    colorScheme: themeConfig.mode,
  });

  const page = await context.newPage();

  // Inject initial storage state
  await page.addInitScript(
    ({ themeConfig, localeName, tabId, isRtl }) => {
      const settings = {
        state: {
          appearanceMode: themeConfig.mode,
          activeMode: themeConfig.mode,
          activeThemeId: themeConfig.theme,
          activeTab: tabId,
        },
        version: 0,
      };
      window.localStorage.setItem("venice-settings", JSON.stringify(settings));
      window.localStorage.setItem(
        "venice.locale",
        JSON.stringify({ locale: localeName }),
      );
      window.localStorage.setItem("vf.legal.firstRunAcknowledged", "1");
      if (isRtl) {
        document.documentElement.dir = "rtl";
      }
    },
    { themeConfig, localeName, tabId: tabInfo.id, isRtl },
  );

  // Mock essential session/status routes
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

  try {
    await page.goto(`${baseUrl}${tabInfo.route || "/"}`, {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });
  } catch {
    // If navigation fails, try navigating to base URL
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
  }

  await page.waitForTimeout(600);
  await dismissOnboarding(page);

  // Evaluate page headings and landmarks
  const inspection = await page.evaluate((focusSelector) => {
    const headings = Array.from(
      document.querySelectorAll("h1, h2, h3, [data-tab-heading], [role='heading']"),
    )
      .map((el) => (el.textContent || "").trim())
      .filter(Boolean)
      .slice(0, 10);

    const landmarks = Array.from(
      document.querySelectorAll("main, nav, header, footer, aside, [role='region'], [role='main']"),
    ).map((el) => el.tagName.toLowerCase() + (el.getAttribute("aria-label") ? ` (${el.getAttribute("aria-label")})` : ""));

    const focusEl = focusSelector ? document.querySelector(focusSelector) : null;
    const hasFocusTarget = Boolean(focusEl);

    return { headings, landmarks, hasFocusTarget };
  }, tabInfo.initialFocus);

  const shell = await page.evaluate(() => {
    const sidebar = document.querySelector("aside");
    const main = document.querySelector("main");
    const historySearchWidth = main?.querySelector("input[type='text']")?.getBoundingClientRect().width ?? 0;
    const offscreenControls = main ? [...main.querySelectorAll("button, input, select")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        if (!(rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" &&
          (rect.left < -2 || rect.right > window.innerWidth + 2))) return false;
        for (let ancestor = element.parentElement; ancestor && ancestor !== main; ancestor = ancestor.parentElement) {
          const overflow = window.getComputedStyle(ancestor).overflowX;
          if ((overflow === "auto" || overflow === "scroll") && ancestor.scrollWidth > ancestor.clientWidth) {
            return false;
          }
        }
        return true;
      }).map((element) => ({
        tag: element.tagName.toLowerCase(),
        left: Math.round(element.getBoundingClientRect().left),
        right: Math.round(element.getBoundingClientRect().right),
      })) : [];
    return {
      viewportWidth: window.innerWidth,
      sidebarPosition: sidebar ? window.getComputedStyle(sidebar).position : "missing",
      mainWidth: main ? main.getBoundingClientRect().width : 0,
      mainScrollWidth: main?.scrollWidth ?? 0,
      mainClientWidth: main?.clientWidth ?? 0,
      offscreenControls,
      historySearchWidth,
    };
  });
  const defects = [];
  if (viewportName.startsWith("mobile-") &&
      (shell.sidebarPosition !== "fixed" || shell.mainWidth < shell.viewportWidth * 0.8)) {
    defects.push(`Mobile shell layout: sidebar position=${shell.sidebarPosition}, main width=${Math.round(shell.mainWidth)}px of ${shell.viewportWidth}px.`);
  }
  if (shell.mainScrollWidth > shell.mainClientWidth + 2) {
    defects.push(`Main content overflows horizontally: scroll width=${shell.mainScrollWidth}px, client width=${shell.mainClientWidth}px.`);
  }
  if (viewportName.startsWith("mobile-") && shell.offscreenControls.length > 0) {
    defects.push(`${shell.offscreenControls.length} visible interactive control(s) extend beyond the mobile viewport: ${shell.offscreenControls.map((control) => `${control.tag} ${control.left}..${control.right}px`).join(", ")}.`);
  }
  if (viewportName.startsWith("mobile-") && tabInfo.id === "history" && shell.historySearchWidth < 160) {
    defects.push(`History search field is only ${Math.round(shell.historySearchWidth)}px wide on mobile.`);
  }

  // 1. Initial screenshot
  await page.screenshot({
    path: path.join(tupleDir, "screenshot.png"),
    fullPage: false,
  });

  // 2. Keyboard focus capture
  if (tabInfo.initialFocus) {
    try {
      await page.focus(tabInfo.initialFocus, { timeout: 1000 });
    } catch {
      /* ignore focus error */
    }
  }
  await page.screenshot({
    path: path.join(tupleDir, "screenshot-tab.png"),
    fullPage: false,
  });

  // 3. Overflow capture
  await page.evaluate(() => {
    const container = document.querySelector("main") || document.body;
    const filler = document.createElement("div");
    filler.setAttribute("data-test-overflow", "true");
    filler.style.padding = "24px";
    filler.style.opacity = "0.8";
    filler.textContent = "Test content container for layout overflow verification.";
    container.appendChild(filler);
  });
  await page.screenshot({
    path: path.join(tupleDir, "screenshot-overflow.png"),
    fullPage: false,
  });

  // Update manifest
  const now = new Date().toISOString();
  const manifest = {
    schemaVersion: 1,
    tab: tabInfo.id,
    viewport: viewportName,
    theme: themeName,
    locale: localeName,
    state: "initial",
    headings: inspection.headings.length ? inspection.headings : [tabInfo.id],
    interactions: [
      `Navigated to route ${tabInfo.route}`,
      `Checked presence of initial focus target ${tabInfo.initialFocus}: ${inspection.hasFocusTarget}`,
      `Measured shell geometry under ${viewportName}`,
    ],
    reviewer: {
      signature: "",
      contact: "",
    },
    capturedAt: now,
    browser: {
      name: "Chromium (Headless)",
      version: browserVersion,
    },
    os: `${os.type()} ${os.arch()}`,
    defects,
    notes: "see notes.md in the same directory; fill before signing this stub",
  };

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  // Update notes.md
  const notesContent = `# Evidence notes — ${tabInfo.id} · ${viewportName} · ${themeName} · ${localeName} · initial

Reviewer: <name> <github-handle> <email>
Captured: ${now}
Browser/OS: Chromium ${browserVersion} on ${os.type()} (${os.arch()})

## Universal
- Visual / contrast: PENDING HUMAN REVIEW.
- Layout / overflow: PENDING HUMAN REVIEW. Automated shell measurement: sidebar position ${shell.sidebarPosition}; main width ${Math.round(shell.mainWidth)}px of ${shell.viewportWidth}px viewport; main scroll/client width ${shell.mainScrollWidth}/${shell.mainClientWidth}px; offscreen controls ${shell.offscreenControls.length}.
- Keyboard navigation: PENDING HUMAN REVIEW. Initial focus target present: ${inspection.hasFocusTarget}.
- Screen-reader semantics: PENDING HUMAN REVIEW. Landmarks found: ${inspection.landmarks.slice(0, 5).join(", ") || "none"}.
- i18n surface: PENDING HUMAN REVIEW under ${localeName} (${isRtl ? "RTL" : "LTR"}).

## Per-tab specifics
- Route: \`${tabInfo.route}\`
- Observed headings: ${inspection.headings.join(" | ") || tabInfo.id}

## Automated defects observed
${defects.length ? defects.map((defect) => `- ${defect}`).join("\n") : "- None detected by the limited automated shell check; human review is still required."}

Reviewer signature: 
`;

  await writeFile(notesPath, notesContent, "utf8");
  await context.close();

  console.log(`  [captured] ${tabInfo.id}/${viewportName}__${themeName}__${localeName}`);
  return defects.length;
}

async function main() {
  const opts = parseArgs();
  const rawRoutes = JSON.parse(await readFile(tabRoutesFile, "utf8"));
  let tabsToRun = rawRoutes.tabs;

  if (opts.tabs !== "all") {
    const requested = opts.tabs.split(",").map((t) => t.trim());
    tabsToRun = tabsToRun.filter((t) => requested.includes(t.id));
  }

  const viewports = opts.viewports.split(",").map((v) => v.trim());
  const themes = opts.themes.split(",").map((t) => t.trim());
  const locales = opts.locales.split(",").map((l) => l.trim());

  let server = null;
  let baseUrl = opts.devUrl;

  if (!baseUrl) {
    console.log(`[capture] Starting Vite on http://${opts.host}:${opts.port}...`);
    server = spawn(
      nodeBin,
      [viteBin, "--host", opts.host, "--port", String(opts.port), "--strictPort"],
      {
        cwd: repoRoot,
        env: { ...process.env, ELECTRON_BUILD: "true" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    baseUrl = `http://${opts.host}:${opts.port}`;
    try {
      await waitForServer(baseUrl);
      console.log(`[capture] Vite server active at ${baseUrl}`);
    } catch (err) {
      if (server) server.kill("SIGTERM");
      throw err;
    }
  } else {
    console.log(`[capture] Using external dev server at ${baseUrl}`);
  }

  const execPath = await getChromiumExecutable();
  console.log(`[capture] Launching Chromium (executable: ${execPath || "default Playwright"})...`);

  const browser = await chromium.launch(execPath ? { executablePath: execPath, headless: true } : { headless: true });

  const total = tabsToRun.length * viewports.length * themes.length * locales.length;
  console.log(`[capture] Executing matrix: ${tabsToRun.length} tabs × ${viewports.length} viewports × ${themes.length} themes × ${locales.length} locales = ${total} tuples`);

  try {
    let automatedDefects = 0;
    for (const tabInfo of tabsToRun) {
      for (const vp of viewports) {
        for (const th of themes) {
          for (const loc of locales) {
            automatedDefects += await runCaptureForTuple({
              browser,
              baseUrl,
              tabInfo,
              viewportName: vp,
              themeName: th,
              localeName: loc,
            });
          }
        }
      }
    }
    if (automatedDefects > 0) {
      console.error(`[capture] ${automatedDefects} automated shell-layout defect(s) detected.`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    if (server) {
      console.log("[capture] Shutting down test Vite server...");
      server.kill("SIGTERM");
    }
  }

  console.log("[capture] Per-tab acceptance capture complete!");
}

main().catch((err) => {
  console.error("[capture] Fatal error:", err);
  process.exit(1);
});
