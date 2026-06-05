// Code Owner: fayeblade (@spearchucker667)
/** @fileoverview CLI: initialize a local dev config from the example templates.
 *  Runs outside Electron — does not import any Electron-only modules. */
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXAMPLES_DIR = path.join(REPO_DIR, ".config");
const LOCAL_FILES = ["config.local.yaml", "themes.local.yaml"];

async function main(): Promise<void> {
  const targetDir = path.join(REPO_DIR, ".config");
  await fs.mkdir(targetDir, { recursive: true });

  let created = 0;
  let skipped = 0;
  for (const filename of LOCAL_FILES) {
    const examplePath = path.join(EXAMPLES_DIR, filename.replace(".local.", ".example."));
    const targetPath = path.join(targetDir, filename);
    try {
      const stat = await fs.stat(targetPath);
      if (stat.isFile()) {
        // eslint-disable-next-line no-console
        console.log(`[config:init] Skipping ${filename} (already exists at ${targetPath})`);
        skipped++;
        continue;
      }
    } catch {
      // File doesn't exist — copy example.
    }
    if (!await pathExists(examplePath)) {
      // eslint-disable-next-line no-console
      console.log(`[config:init] Example template not found for ${filename}; skipping.`);
      continue;
    }
    await fs.copyFile(examplePath, targetPath);
    // eslint-disable-next-line no-console
    console.log(`[config:init] Created ${targetPath}`);
    created++;
  }

  // eslint-disable-next-line no-console
  console.log(`[config:init] Done. ${created} created, ${skipped} already present.`);
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error(`[config:init] Failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
