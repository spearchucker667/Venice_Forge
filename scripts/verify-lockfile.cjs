#!/usr/bin/env node

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function verifyLockfile(rootDir) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-lockfile-"));
  try {
    for (const filename of ["package.json", "package-lock.json", ".npmrc"]) {
      const source = path.join(rootDir, filename);
      if (fs.existsSync(source)) fs.copyFileSync(source, path.join(tempDir, filename));
    }
    const result = spawnSync(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"],
      { cwd: tempDir, encoding: "utf8" },
    );
    if (result.status !== 0) {
      return { passed: false, error: result.stderr || result.stdout || "npm install failed" };
    }
    const before = fs.readFileSync(path.join(rootDir, "package-lock.json"));
    const after = fs.readFileSync(path.join(tempDir, "package-lock.json"));
    return before.equals(after)
      ? { passed: true }
      : { passed: false, error: "package.json and package-lock.json are out of sync" };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

const result = verifyLockfile(path.resolve(__dirname, ".."));
if (!result.passed) {
  console.error(`[verify:lockfile] FAIL — ${result.error}`);
  process.exit(1);
}
console.log("[verify:lockfile] OK");

module.exports = { verifyLockfile };
