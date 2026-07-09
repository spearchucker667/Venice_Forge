#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const serverPath = path.join(ROOT, "electron/services/researchBrowserServer.ts");

if (!fs.existsSync(serverPath)) {
  console.error(`❌ FAIL: Missing file ${serverPath}`);
  process.exit(1);
}

const server = fs.readFileSync(serverPath, "utf8");
const rendererBrowser = fs.readFileSync(path.join(ROOT, "src/components/research/ResearchBrowserView.tsx"), "utf8");

const assertions = [
  { ok: /new\s+WebContentsView/.test(server), msg: "uses WebContentsView" },
  { ok: !/<webview\b/i.test(`${server}\n${rendererBrowser}`), msg: "does not use <webview>" },
  { ok: !/<iframe\b/i.test(`${server}\n${rendererBrowser}`), msg: "does not use an iframe browser implementation" },
  { ok: /session\.fromPartition\(["'](?:persist:)?venice-forge-research-browser["']\)/.test(server), msg: "uses isolated browser session partition" },
  { ok: /nodeIntegration:\s*false/.test(server), msg: "disables nodeIntegration" },
  { ok: /contextIsolation:\s*true/.test(server), msg: "enables contextIsolation" },
  { ok: /sandbox:\s*true/.test(server), msg: "enables sandbox" },
  { ok: /webSecurity:\s*true/.test(server), msg: "enables webSecurity" },
  { ok: /allowRunningInsecureContent:\s*false/.test(server), msg: "disables allowRunningInsecureContent" },
  { ok: /setPermissionRequestHandler[\s\S]*callback\(false\)/.test(server), msg: "blocks permission requests" },
  { ok: /setPermissionCheckHandler[\s\S]*return false/.test(server), msg: "blocks permission checks" },
  { ok: /\.on\(["']will-navigate["']/.test(server), msg: "intercepts will-navigate" },
  { ok: /\.on\(["']will-redirect["']/.test(server), msg: "intercepts will-redirect" },
  { ok: /\.on\(["']will-frame-navigate["']/.test(server), msg: "intercepts will-frame-navigate" },
  { ok: /\.setWindowOpenHandler/.test(server), msg: "intercepts setWindowOpenHandler" },
  { ok: /return \{ action: "deny" \};/.test(server), msg: "always denies Electron new-window creation" },
  { ok: /navigateCurrentViewIfSafe\(url\)/.test(server), msg: "safe popups navigate inside the current view" },
  { ok: !/setWindowOpenHandler[\s\S]*shell\.openExternal/.test(server), msg: "popup handling has no default shell.openExternal path" },
];

let failed = false;
for (const assertion of assertions) {
  if (!assertion.ok) failed = true;
  console.log(`${assertion.ok ? "✅ PASS" : "❌ FAIL"}: ${assertion.msg}`);
}

if (failed) process.exit(1);
console.log("✅ WebContentsView boundaries verified successfully.");
