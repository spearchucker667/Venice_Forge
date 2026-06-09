#!/usr/bin/env node
/**
 * verify-network-boundaries.cjs
 *
 * Static network boundary verifier.
 * Enforces:
 *   1. Venice API `fetch` only in src/services/veniceClient.ts,
 *      electron/services/veniceClient.ts, and server.ts.
 *   2. Jina fetch only in research providers/proxies and server.ts.
 *   3. `window.veniceForge` only in src/services/desktopBridge.ts
 *      and preload/Electron typing files.
 *   4. Raw `fetch('/api/venice/...')` disallowed outside canonical
 *      client/server tests.
 *
 * Exit 0 on success; non-zero on any violation.
 */
"use strict";

const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");

const violations = [];

function grepFor(pattern, includeGlobs, excludeGlobs = []) {
  const args = [
    "rg",
    "--json",
    "-n",
    pattern,
    ...includeGlobs.flatMap((g) => ["--glob", g]),
    ...excludeGlobs.flatMap((g) => ["--glob", "!" + g]),
  ];
  try {
    const out = execSync(args.join(" "), { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === "match") {
            const m = parsed.data;
            const filePath = m.path?.text || "";
            const lineNum = m.line_number || 0;
            const text = (m.lines?.text || "").replace(/\r?\n/g, " ");
            return { file: filePath, line: lineNum, text };
          }
          return null;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function checkAllowed(pattern, allowedGlobs, includeGlobs, excludeGlobs = [], label) {
  const matches = grepFor(pattern, includeGlobs, excludeGlobs);
  for (const m of matches) {
    const isAllowed = allowedGlobs.some((g) => {
      if (g.includes("*")) {
        const regex = new RegExp("^" + g.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$");
        return regex.test(m.file);
      }
      return m.file === g;
    });
    if (!isAllowed) {
      violations.push(`${label}: ${m.file}:${m.line}: ${m.text.trim()}`);
    }
  }
}

function main() {
  // 1. Venice API fetch must be in canonical files only.
  //    Use a pattern that catches global fetch or node fetch with a Venice host.
  checkAllowed(
    'fetch\\([^)]*(?:api\\.venice\\.ai|/api/venice)',
    [
      "src/services/veniceClient.ts",
      "electron/services/veniceClient.ts",
      "server.ts",
      "src/services/veniceClient.test.ts",
      "electron/services/veniceClient.test.ts",
      "server.test.ts",
    ],
    ["src/**/*.ts", "src/**/*.tsx", "electron/**/*.ts", "electron/**/*.tsx"],
    ["src/services/veniceClient.ts", "src/services/veniceClient.test.ts", "electron/services/veniceClient.ts", "electron/services/veniceClient.test.ts"],
    "Venice API fetch outside canonical files"
  );

  // 2. Jina fetch only in research providers/proxies and server.ts.
  checkAllowed(
    'fetch\\([^)]*(?:jina\\.ai|proxy-jina)',
    [
      "src/research/**/*.ts",
      "src/services/desktopBridge.ts",
      "server.ts",
      "src/research/**/*.test.ts",
      "src/services/desktopBridge.test.ts",
      "server.test.ts",
    ],
    ["src/**/*.ts", "src/**/*.tsx", "electron/**/*.ts", "electron/**/*.tsx"],
    ["src/research/**/*.ts", "src/services/desktopBridge.ts", "src/services/desktopBridge.test.ts"],
    "Jina fetch outside canonical files"
  );

  // 3. window.veniceForge only in desktopBridge.ts, preload files, typing files, and tests.
  checkAllowed(
    "window\\.veniceForge",
    [
      "src/services/desktopBridge.ts",
      "electron/preload.ts",
      "electron/**/*.test.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/types/desktop.ts",
      "tests/**/*.ts",
      "tests/**/*.tsx",
    ],
    ["src/**/*.ts", "src/**/*.tsx", "electron/**/*.ts", "electron/**/*.tsx", "tests/**/*.ts", "tests/**/*.tsx"],
    ["src/services/desktopBridge.ts", "electron/preload.ts", "src/types/desktop.ts"],
    "Direct window.veniceForge access"
  );

  // 4. Raw fetch('/api/venice/...') outside canonical client/server tests.
  checkAllowed(
    "fetch\\(['\"]`?/api/venice",
    [
      "src/services/veniceClient.ts",
      "src/services/veniceClient.test.ts",
      "server.ts",
      "server.test.ts",
    ],
    ["src/**/*.ts", "src/**/*.tsx", "electron/**/*.ts", "electron/**/*.tsx"],
    ["src/services/veniceClient.ts", "src/services/veniceClient.test.ts"],
    "Raw fetch('/api/venice/...') outside canonical files"
  );

  // 5. Jina proxy header allowlist must exist in server.ts
  const serverSource = require("fs").readFileSync(require("path").join(ROOT, "server.ts"), "utf8");
  if (!serverSource.includes("JINA_ALLOWED_FORWARD_HEADERS")) {
    violations.push("Jina header allowlist missing: JINA_ALLOWED_FORWARD_HEADERS not found in server.ts");
  }
  if (!serverSource.includes("isAllowedJinaForwardHeader")) {
    violations.push("Jina header allowlist helper missing: isAllowedJinaForwardHeader not found in server.ts");
  }
  // Verify no arbitrary pass-through inside /api/proxy-jina block
  const jinaBlockMatch = serverSource.match(/app\.post\("\/api\/proxy-jina"[\s\S]*?\n\}\);/);
  if (jinaBlockMatch) {
    const jinaBlock = jinaBlockMatch[0];
    // Check for the old pattern of unconditional header forwarding
    if (/headers\[key\] = value/.test(jinaBlock) && !/isAllowedJinaForwardHeader/.test(jinaBlock)) {
      violations.push("Jina proxy block contains arbitrary header pass-through without allowlist guard");
    }
  }

  if (violations.length > 0) {
    console.error("[verify:network-boundaries] FAIL — network boundary violations detected:");
    for (const v of violations) {
      console.error("  " + v);
    }
    process.exit(1);
  }

  console.log("[verify:network-boundaries] OK — network boundaries are intact.");
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = { main };
