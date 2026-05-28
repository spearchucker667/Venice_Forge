#!/usr/bin/env node
const os = require("os");
const { execSync } = require("child_process");

const platform = os.platform();
try {
  if (platform === "darwin") {
    execSync("node scripts/verify-dist-mac.cjs", { stdio: "inherit" });
  } else if (platform === "win32") {
    execSync("node scripts/verify-dist-win.cjs", { stdio: "inherit" });
  } else {
    console.log(`[verify:dist] Skipping verification on unsupported platform: ${platform}`);
  }
} catch (err) {
  process.exit(1);
}
