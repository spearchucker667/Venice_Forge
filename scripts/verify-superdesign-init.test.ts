// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error CJS verifier
import { verifySuperdesignInit, REQUIRED_FILES, REQUIRED_SOURCE_PATHS } from "./verify-superdesign-init.cjs";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function writeFixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vf-superdesign-init-"));
  roots.push(root);
  fs.mkdirSync(path.join(root, ".superdesign/init"), { recursive: true });
  for (const sourcePath of REQUIRED_SOURCE_PATHS) {
    const file = path.join(root, sourcePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `source ${sourcePath}`);
  }
  const common = "Source fingerprint: PLACEHOLDER";
  fs.writeFileSync(path.join(root, ".superdesign/init/components.md"), "# Components\nsrc/App.tsx\n```tsx\nexport function App() {}\n```\n");
  fs.writeFileSync(path.join(root, ".superdesign/init/layouts.md"), "# Layouts\nsrc/App.tsx\nsrc/components/layout/sidebar.tsx\nsrc/components/layout/header.tsx\n```tsx\nexport function Layout() {}\n```\n");
  fs.writeFileSync(path.join(root, ".superdesign/init/routes.md"), `# Routes\nsrc/config/tabs.ts\nCANONICAL_TAB_ORDER\nsrc/theme/themeTypes.ts\n${common}\n`);
  fs.writeFileSync(path.join(root, ".superdesign/init/theme.md"), "# Theme\nsrc/theme/builtins/venice.ts\n#050505 #ef555f\n```css\n--color-accent: var(--accent);\n```\n");
  fs.writeFileSync(path.join(root, ".superdesign/init/pages.md"), "# Pages\n**Chat** **Image Studio** **Media Studio** **Workflows** **Documents** **Settings** **Theme Maker** **Status** **RP Studio** **Playground**\n");
  fs.writeFileSync(path.join(root, ".superdesign/init/extractable-components.md"), "# Extractable\nname source path category description state/navigation props hardcoded elements\n");
  return root;
}

describe("verify-superdesign-init", () => {
  it("requires the six source-grounded init files", () => {
    const root = writeFixture();
    const result = verifySuperdesignInit(root);
    expect(result.passed).toBe(false);
    expect(result.errors.some((error: string) => error.includes("routes.md source fingerprint is stale or missing"))).toBe(true);
  });

  it("reports missing files", () => {
    const root = writeFixture();
    fs.rmSync(path.join(root, ".superdesign/init/theme.md"));
    const result = verifySuperdesignInit(root);
    expect(result.passed).toBe(false);
    expect(result.errors.some((error: string) => error.includes("theme.md is missing"))).toBe(true);
    expect(REQUIRED_FILES).toHaveLength(6);
  });
});
