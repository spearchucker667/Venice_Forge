// @vitest-environment node
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { build } from "esbuild";

const children = new Set<ChildProcess>();
const temporaryDirectories = new Set<string>();

async function reservePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a TCP port"));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolve(address.port);
      });
    });
  });
}

async function fetchUntilReady(url: string): Promise<Response> {
  const deadline = Date.now() + 10_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`Unexpected HTTP status ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError instanceof Error ? lastError : new Error("Production server did not start");
}

afterEach(() => {
  for (const child of children) {
    if (!child.killed) child.kill("SIGKILL");
  }
  children.clear();
  for (const directory of temporaryDirectories) {
    rmSync(directory, { recursive: true, force: true });
  }
  temporaryDirectories.clear();
});

describe("production server static root", () => {
  it("serves the built renderer beside the CommonJS bundle rather than source HTML from cwd", async () => {
    // Regression target: changing the server bundle to resolve assets from
    // process.cwd() makes this return the repository source index instead.
    const outputDirectory = mkdtempSync(join(process.cwd(), ".vf-production-server-test-"));
    temporaryDirectories.add(outputDirectory);
    const bundlePath = join(outputDirectory, "server.cjs");
    const builtMarker = "venice-forge-built-renderer-marker";
    writeFileSync(
      join(outputDirectory, "index.html"),
      `<!doctype html><html><body><main>${builtMarker}</main></body></html>`,
      "utf8",
    );

    await build({
      entryPoints: [join(process.cwd(), "server.ts")],
      bundle: true,
      platform: "node",
      format: "cjs",
      packages: "external",
      outfile: bundlePath,
      logLevel: "silent",
    });

    const port = await reservePort();
    const child = spawn(process.execPath, [bundlePath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
        HOST: "127.0.0.1",
        PORT: String(port),
      },
      stdio: "ignore",
    });
    children.add(child);

    const response = await fetchUntilReady(`http://127.0.0.1:${port}/`);
    expect(await response.text()).toContain(builtMarker);
  }, 20_000);
});
