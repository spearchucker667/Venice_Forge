#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const args = process.argv.slice(2);
const RELEASE_FLAGS = ["--win", "--mac", "--linux", "--all", "--portable", "--release"];
const verifyRelease = args.some((arg) => RELEASE_FLAGS.includes(arg));

/** Logic extracted for unit testing */
function getTargets(platform, args) {
  const explicitWin = args.includes("--win");
  const explicitMac = args.includes("--mac");
  const explicitLinux = args.includes("--linux");
  const explicitAll = args.includes("--all") || args.includes("--release");
  const hasExplicitPlatform = explicitWin || explicitMac || explicitLinux || explicitAll;

  const checkWin = explicitWin || explicitAll || (!hasExplicitPlatform && platform === "win32");
  const checkMac = explicitMac || explicitAll || (!hasExplicitPlatform && platform === "darwin");
  const checkLinux = explicitLinux || explicitAll || (!hasExplicitPlatform && platform === "linux" && verifyRelease);

  let targetArches = ["x64", "arm64"];
  // Linux builds are x64-only in CI until a native arm64 runner or
  // cross-compilation toolchain is added.
  let linuxArches = ["x64"];
  const archIdx = args.indexOf("--arch");
  if (archIdx !== -1 && archIdx + 1 < args.length) {
    targetArches = [args[archIdx + 1]];
    linuxArches = [args[archIdx + 1]];
  } else if (explicitAll) {
    targetArches = ["x64", "arm64"];
    linuxArches = ["x64"];
  } else if (!hasExplicitPlatform && platform === "win32") {
    targetArches = ["x64"];
  }
  return { checkWin, checkMac, checkLinux, targetArches, linuxArches };
}

// Forbidden patterns inside the build outputs. Phase 2J hygiene guard.
const FORBIDDEN_DIST_PATTERNS = [
  // Source maps must never be shipped
  /\.map$/i,
  // Test files / fixtures must never end up in dist (vitest should not include them, but assert)
  /\.(test|spec)\.(ts|tsx|js|cjs|mjs)$/i,
  // Local config / secrets
  /(?:^|\/)\.env(?!\.example$).*$/i, // .env, .env.local, .env.development, etc. (allow .env.example)
  /(^|\/)\.config\/[^/]*\.(local|secret|prod)\.(yaml|yml)$/i, // config.local.yaml, themes.prod.yml, sub/dir/secret.prod.yaml
  // Local DBs / caches / logs
  /\.(db|sqlite|sqlite3)$/i,
  // Dev-tool scratch
  /(^|\/)\.design-captures\//,
  /(^|\/)chat-history\//,
  // Renderer source must never be shipped inside the Electron main bundle.
  // Main/preload are bundled so shared code is inlined; src/ should not exist.
  /^src\//,
  // Test fixture-only paths (Vitest excludes, but assert defensively)
  /(?:^|\/)\.integration-src\//,
];

// Secret-leak heuristic: scan text files in dist for Venice key patterns.
// Catches accidental copies of .env / API keys into the bundle.
//
// The patterns are intentionally tight: real Venice API keys are 40+
// base64url/hex chars after the `venice_` prefix (no mid-token underscores in
// production). App-internal identifiers (e.g. `venice_forge_traffic_logs_v1`)
// have lowercase snake_case mid-tokens and do NOT match.
const SECRET_PATTERNS = [
  /venice_[A-Za-z0-9-]{40,}/g, // venice_ + 40+ alnum/dash chars (no underscores)
  /\bvn-[A-Za-z0-9._~+/=-]{8,}/g, // Venice inference key
  /\bsk-[A-Za-z0-9._~+/=-]{8,}/g, // OpenAI-compatible vendor key
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/g, // Bearer tokens
  /\b[A-Z][A-Z0-9_]*(?:API_KEY|TOKEN|SECRET|PASSWORD)\s*=\s*["']?[^"'\s,;}]{8,}/g,
];

const FORBIDDEN_ELECTRON_TEXT_PATTERNS = [
  {
    re: /(?:require\(["']|from\s+["'])(?:\.\.\/)+src\//,
    label: "generated Electron output imports renderer/source modules via ../src",
  },
];

if (require.main !== module) {
  module.exports = { getTargets, FORBIDDEN_DIST_PATTERNS, SECRET_PATTERNS, FORBIDDEN_ELECTRON_TEXT_PATTERNS };
} else {

const { checkWin, checkMac, checkLinux, targetArches } = getTargets(process.platform, args);

const root = path.join(__dirname, "..");
const pkg = require(path.join(root, "package.json"));
const version = pkg.version;

function fail(msg) {
  console.error(`[verify:dist] FAIL: ${msg}`);
  process.exit(1);
}

function verifyFileExists(filePath, minSize = 0) {
  if (!fs.existsSync(filePath)) {
    fail(`Missing required file: ${path.relative(root, filePath)}`);
  }
  const stat = fs.statSync(filePath);
  if (stat.size < minSize) {
    fail(`File too small: ${path.relative(root, filePath)} (Size: ${stat.size} bytes, Expected at least: ${minSize} bytes)`);
  }
  return true;
}

function verifyChecksum(filePath) {
  const sidecar = `${filePath}.sha256`;
  if (!fs.existsSync(sidecar)) {
    fail(`Missing checksum sidecar for ${path.basename(filePath)}`);
  }
  const expectedHash = fs.readFileSync(sidecar, "ascii").split(" ")[0].trim();
  const fileBuffer = fs.readFileSync(filePath);
  const hashSum = crypto.createHash("sha256");
  hashSum.update(fileBuffer);
  const actualHash = hashSum.digest("hex");
  if (expectedHash !== actualHash) {
    fail(`Checksum mismatch for ${path.basename(filePath)}. Expected: ${expectedHash}, Actual: ${actualHash}`);
  }
}

// Helpers (Phase 2J) — `FORBIDDEN_DIST_PATTERNS` and `SECRET_PATTERNS` are
// declared at module scope above so unit tests can import them.
function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out);
    } else if (e.isFile()) {
      out.push(full);
    }
  }
}

function assertNoForbiddenInDist(distDir) {
  if (!fs.existsSync(distDir)) {
    fail(
      `Build directory missing: ${path.relative(root, distDir)}. ` +
        "Run `npm run build` first; source archives intentionally exclude dist."
    );
  }
  const files = [];
  walk(distDir, files);
  const bad = files.filter((f) => {
    const rel = path.relative(distDir, f).split(path.sep).join("/");
    return FORBIDDEN_DIST_PATTERNS.some((re) => re.test(rel) || re.test("/" + rel));
  });
  if (bad.length > 0) {
    const display = bad.map((f) => path.relative(root, f)).slice(0, 20);
    fail(
      `Forbidden files present in ${path.relative(root, distDir)}:\n  ${display.join("\n  ")}\n` +
        `(These are dev/test/local artifacts that must never ship in the packaged app.)\n` +
        `Forbidden patterns: source maps, test files, .env, .config/*.local.yaml, *.db, chat-history/, .design-captures/`
    );
  }
}

const TEXT_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".html", ".css", ".json", ".svg", ".txt", ".md", ".ts", ".tsx"]);

function assertNoSecretsInDist(distDir) {
  const files = [];
  walk(distDir, files);
  const hits = [];
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    const rel = path.relative(distDir, f).split(path.sep).join("/");
    // Skip the dist branding NOTICE.md (legal text only) and LICENSE.
    if (rel.includes("branding/") || rel === "LICENSE" || rel === "LICENSE.md") continue;
    let content;
    try {
      content = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const re of SECRET_PATTERNS) {
      re.lastIndex = 0;
      const m = content.match(re);
      if (m) {
        hits.push({ rel, sample: m[0].slice(0, 12) + "…" });
        break;
      }
    }
  }
  if (hits.length > 0) {
    const display = hits.slice(0, 10).map((h) => `  ${h.rel}  (matched: ${h.sample})`);
    fail(
      `Possible secrets / API keys detected in ${path.relative(root, distDir)}:\n${display.join("\n")}\n` +
        `Refusing to ship a build with embedded credentials.`
    );
  }
}

function assertNoForbiddenElectronText(distDir) {
  const files = [];
  walk(distDir, files);
  const hits = [];
  for (const f of files) {
    if (path.extname(f).toLowerCase() !== ".js") continue;
    const rel = path.relative(distDir, f).split(path.sep).join("/");
    let content;
    try {
      content = fs.readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const { re, label } of FORBIDDEN_ELECTRON_TEXT_PATTERNS) {
      re.lastIndex = 0;
      if (re.test(content)) {
        hits.push({ rel, label });
        break;
      }
    }
  }
  if (hits.length > 0) {
    const display = hits.slice(0, 20).map((h) => `  ${h.rel} (${h.label})`);
    fail(
      `Forbidden Electron runtime imports found in ${path.relative(root, distDir)}:\n${display.join("\n")}\n` +
        "Electron main/preload must be bundled; generated runtime files must not import ../../src/*."
    );
  }
}

console.log(`[verify:dist] Starting verification for version ${version}`);

function verifyLinuxArtifacts(releaseDir, verified) {
  console.log("[verify:dist] Verifying Linux artifacts...");
  verifyFileExists(path.join(root, "build", "icon.png"), 1024);

  const files = fs.readdirSync(releaseDir);
  const expectedExtensions = [".AppImage", ".deb", ".rpm"];

  for (const ext of expectedExtensions) {
    const matches = files.filter((file) => file.endsWith(ext));
    if (matches.length === 0) {
      fail(`Missing Linux ${ext} artifact in release/.`);
    }
    for (const file of matches) {
      const fullPath = path.join(releaseDir, file);
      verifyFileExists(fullPath, 1024 * 1024 * 10);
      verifyChecksum(fullPath);
      verified.push(file);
    }
  }

  const linuxMetadata = files.filter((file) => /latest.*linux.*\.ya?ml$/i.test(file));
  for (const file of linuxMetadata) {
    verifyFileExists(path.join(releaseDir, file), 50);
    verified.push(file);
  }
}

if (!fs.existsSync(path.join(root, "dist")) || !fs.existsSync(path.join(root, "dist-electron"))) {
  console.error(
    "[verify:dist] Build outputs are missing. Run `npm run build` first; source archives intentionally exclude dist."
  );
  process.exit(1);
}

// Base build validation
verifyFileExists(path.join(root, "dist", "index.html"), 100);
verifyFileExists(path.join(root, "dist", "server.cjs"), 1000);
verifyFileExists(path.join(root, "dist-electron", "electron", "main.js"), 1000);
verifyFileExists(path.join(root, "dist-electron", "package.json"), 20);

function assertBrandingNoticesInSync() {
  const source = fs.readFileSync(path.join(root, "assets/branding/NOTICE.md"), "utf8");
  const runtime = fs.readFileSync(path.join(root, "public/assets/branding/NOTICE.md"), "utf8");
  if (source !== runtime) {
    fail(
      "Branding NOTICE files are out of sync. " +
        "assets/branding/NOTICE.md and public/assets/branding/NOTICE.md must remain identical."
    );
  }
}

// Hygiene guards (Phase 2J) — run in BOTH local and release modes so a dirty
// build never passes verify-dist regardless of packaging intent.
assertNoForbiddenInDist(path.join(root, "dist"));
assertNoForbiddenInDist(path.join(root, "dist-electron"));
assertNoSecretsInDist(path.join(root, "dist"));
assertNoSecretsInDist(path.join(root, "dist-electron"));
assertNoForbiddenElectronText(path.join(root, "dist-electron"));
assertBrandingNoticesInSync();

if (!verifyRelease) {
  // Build-output-only mode: `npm run verify:dist` / `verify:build-output` checks
  // dist/ + dist-electron/ + hygiene guards. It does NOT inspect packaged
  // release artifacts in release/. For packaged-artifact verification, use one
  // of the explicit flags below (or `verify:dist:release` to check all three
  // platforms in a single run).
  console.log("[verify:dist] Successfully verified build outputs.");
  process.exit(0);
}

const releaseDir = path.join(root, "release");
if (!fs.existsSync(releaseDir)) fail("Missing release directory.");

const verified = [];

if (checkWin) {
  console.log("[verify:dist] Verifying Windows artifacts...");
  verifyFileExists(path.join(root, "build", "icon.ico"), 1024);
  const isPortableOnly = args.includes("--portable") && !args.includes("--all");

  const winArches = targetArches.includes("x64") ? ["x64"] : []; // Windows is only x64 for now
  for (const arch of winArches) {
    if (!isPortableOnly) {
      const setupExe = path.join(releaseDir, `Venice-Forge-${version}-${arch}-Setup.exe`);
      verifyFileExists(setupExe, 1024 * 1024 * 10); // 10MB min
      verifyChecksum(setupExe);
      verified.push(`Venice-Forge-${version}-${arch}-Setup.exe`);
    }

    const portableExe = path.join(releaseDir, `Venice-Forge-${version}-${arch}-Portable.exe`);
    verifyFileExists(portableExe, 1024 * 1024 * 10);
    verifyChecksum(portableExe);
    verified.push(`Venice-Forge-${version}-${arch}-Portable.exe`);
  }

  const latestYml = path.join(releaseDir, "latest.yml");
  verifyFileExists(latestYml, 50);
  verifyChecksum(latestYml);
  verified.push("latest.yml");

  const blockmapFiles = fs.readdirSync(releaseDir).filter((f) => f.endsWith(".blockmap"));
  if (blockmapFiles.length === 0) {
    fail("Missing .blockmap file(s) for Windows updater metadata.");
  }
  blockmapFiles.forEach((f) => {
    verifyFileExists(path.join(releaseDir, f), 50);
    verifyChecksum(path.join(releaseDir, f));
    verified.push(f);
  });
}

if (checkMac) {
  console.log("[verify:dist] Verifying macOS artifacts...");
  verifyFileExists(path.join(root, "build", "icon.icns"), 1024);

  for (const arch of targetArches) {
    const dmg = path.join(releaseDir, `Venice-Forge-${version}-${arch}.dmg`);
    verifyFileExists(dmg, 1024 * 1024 * 10); // 10MB min
    verifyChecksum(dmg);
    verified.push(`Venice-Forge-${version}-${arch}.dmg`);

    const zip = path.join(releaseDir, `Venice-Forge-${version}-${arch}.zip`);
    verifyFileExists(zip, 1024 * 1024 * 10);
    verifyChecksum(zip);
    verified.push(`Venice-Forge-${version}-${arch}.zip`);
  }

  const latestMacYml = path.join(releaseDir, "latest-mac.yml");
  verifyFileExists(latestMacYml, 50);
  verifyChecksum(latestMacYml);
  verified.push("latest-mac.yml");

  const macBlockmapFiles = fs.readdirSync(releaseDir).filter((f) => f.endsWith(".blockmap"));
  if (macBlockmapFiles.length === 0) {
    fail("Missing .blockmap file(s) for macOS updater metadata.");
  }
  macBlockmapFiles.forEach((f) => {
    verifyFileExists(path.join(releaseDir, f), 50);
    verifyChecksum(path.join(releaseDir, f));
    verified.push(f);
  });
}

if (checkLinux) {
  verifyLinuxArtifacts(releaseDir, verified);
}

console.log("[verify:dist] Successfully verified artifacts:");
verified.forEach((v) => console.log(`  - ${v}`));
}
