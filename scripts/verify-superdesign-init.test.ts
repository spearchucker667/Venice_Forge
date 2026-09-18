// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import cjsVerifier from "./verify-superdesign-init.cjs";

const {
  verifySuperdesignInit,
  REQUIRED_FILES,
  REQUIRED_SOURCE_PATHS,
  REQUIRED_COMPONENT_SOURCES,
} = cjsVerifier as unknown as {
  verifySuperdesignInit: (root: string) => {
    passed: boolean;
    errors: string[];
    fingerprint: string;
  };
  REQUIRED_FILES: readonly string[];
  REQUIRED_SOURCE_PATHS: readonly string[];
  REQUIRED_COMPONENT_SOURCES: readonly string[];
};

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
  // VF-AUD-20260916-P2-001: write valid component source files so the prop
  // signature check has interfaces to compare against.
  for (const sourcePath of REQUIRED_COMPONENT_SOURCES) {
    const file = path.join(root, sourcePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (sourcePath.endsWith("primitives.tsx")) {
      fs.writeFileSync(
        file,
        `export interface IconButtonProps { icon: string; ariaLabel: string; }\n` +
          `export interface PillProps { tone?: string; solid?: boolean; }\n` +
          `export interface ToolbarProps { size?: string; bare?: boolean; }\n` +
          `export interface CardProps { elevation?: string; tone?: string; }\n` +
          `export interface EmptyStateProps { headline: string; helper?: string; }\n` +
          `export interface InputProps { tone?: string; }\n` +
          `export interface ShellPanelProps { inset?: boolean; }\n` +
          `export interface PanelHeaderProps { title: string; actions?: string; }\n` +
          `export interface UtilityRailSectionProps { title?: string; }\n` +
          `export interface DenseListRowProps { selected?: boolean; label: string; }\n` +
          `export interface AccentProgressProps { value: number; label: string; }\n`,
      );
    } else if (sourcePath.endsWith("AccessibleDialog.tsx")) {
      fs.writeFileSync(
        file,
        `interface AccessibleDialogProps { title: string; onClose?: () => void; }\n`,
      );
    } else if (sourcePath.endsWith("select.tsx")) {
      fs.writeFileSync(
        file,
        `interface SelectProps { value: string; onChange: (value: string) => void; options: unknown[]; }\n`,
      );
    } else if (sourcePath.endsWith("Meteocon.tsx")) {
      fs.writeFileSync(
        file,
        `export interface MeteoconProps { name: string; size?: number; }\n`,
      );
    } else {
      fs.writeFileSync(file, `source ${sourcePath}`);
    }
  }
  const common = "Source fingerprint: PLACEHOLDER";
  // All represented components in components.md must match source prop sets.
  fs.writeFileSync(
    path.join(root, ".superdesign/init/components.md"),
    "# Components\nsrc/App.tsx\n```tsx\nexport function App() {}\n```\n" +
      "| `IconButton` | `src/components/ui/primitives.tsx` | Icon action | `icon`, `ariaLabel` |\n" +
      "| `Pill` | `src/components/ui/primitives.tsx` | Status badge | `tone`, `solid` |\n" +
      "| `Toolbar` | `src/components/ui/primitives.tsx` | Action group | `size`, `bare` |\n" +
      "| `Card` | `src/components/ui/primitives.tsx` | Surface | `elevation`, `tone` |\n" +
      "| `EmptyState` | `src/components/ui/primitives.tsx` | Empty state | `headline`, `helper` |\n" +
      "| `Input` | `src/components/ui/primitives.tsx` | Input | `tone` |\n" +
      "| `AccessibleDialog` | `src/components/ui/AccessibleDialog.tsx` | Modal | `title`, `onClose` |\n" +
      "| `Select` | `src/components/ui/select.tsx` | Portal select | `value`, `onChange`, `options` |\n" +
      "| `Meteocon` | `src/components/ui/Meteocon.tsx` | Icon | `name`, `size` |\n",
  );
  fs.writeFileSync(
    path.join(root, ".superdesign/init/layouts.md"),
    "# Layouts\nsrc/App.tsx\nsrc/components/layout/sidebar.tsx\nsrc/components/layout/header.tsx\n```tsx\nexport function Layout() {}\n```\n",
  );
  fs.writeFileSync(path.join(root, ".superdesign/init/routes.md"), `# Routes\nsrc/config/tabs.ts\nCANONICAL_TAB_ORDER\nsrc/theme/themeTypes.ts\n${common}\n`);
  fs.writeFileSync(path.join(root, ".superdesign/init/theme.md"), "# Theme\nsrc/theme/builtins/venice.ts\n#050505 #ef555f\n```css\n--color-accent: var(--accent);\n```\n");
  fs.writeFileSync(path.join(root, ".superdesign/init/pages.md"), "# Pages\n**Chat** **Image Studio** **Media Studio** **Workflows** **Documents** **Settings** **Theme Maker** **Status** **RP Studio** **Playground**\n");
  fs.writeFileSync(
    path.join(root, ".superdesign/init/extractable-components.md"),
    "# Extractable\nname source path category description state/navigation props hardcoded elements\n" +
      "| `ShellPanel` | `src/components/ui/primitives.tsx` | shell | panel | `inset` | none |\n" +
      "| `PanelHeader` | `src/components/ui/primitives.tsx` | panel | header | `title`, `actions` | none |\n" +
      "| `AccentProgress` | `src/components/ui/primitives.tsx` | status | progress | `value`, `label` | none |\n",
  );
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

  // VF-AUD-20260916-P2-001 — represented-component signature drift must fail
  // the verifier until the init bundle is regenerated.
  describe("represented-component signature drift (VF-AUD-20260916-P2-001)", () => {
    it("rejects a documented prop that does not exist in source (e.g. AccessibleDialog.open)", () => {
      const root = writeFixture();
      const componentsPath = path.join(root, ".superdesign/init/components.md");
      const original = fs.readFileSync(componentsPath, "utf8");
      const mutated = original.replace(
        "| `AccessibleDialog` | `src/components/ui/AccessibleDialog.tsx` | Modal | `title`, `onClose` |",
        "| `AccessibleDialog` | `src/components/ui/AccessibleDialog.tsx` | Modal | `title`, `onClose`, `open` |",
      );
      fs.writeFileSync(componentsPath, mutated);

      const result = verifySuperdesignInit(root);
      expect(result.passed).toBe(false);
      const driftError = result.errors.find(
        (error: string) => error.includes("AccessibleDialog") && error.includes("open") && error.includes("do not exist"),
      );
      expect(driftError, `Expected a prop-drift error mentioning AccessibleDialog.open, got: ${JSON.stringify(result.errors, null, 2)}`).toBeDefined();
    });

    it("rejects a missing doc prop that exists in source", () => {
      const root = writeFixture();
      const componentsPath = path.join(root, ".superdesign/init/components.md");
      const original = fs.readFileSync(componentsPath, "utf8");
      // Drop the `solid` prop from the documented Pill row even though the
      // fixture source has `solid?: boolean`. The verifier should flag the
      // mismatch on the missing-in-doc side.
      const mutated = original.replace(
        "| `Pill` | `src/components/ui/primitives.tsx` | Status badge | `tone`, `solid` |",
        "| `Pill` | `src/components/ui/primitives.tsx` | Status badge | `tone` |",
      );
      fs.writeFileSync(componentsPath, mutated);

      const result = verifySuperdesignInit(root);
      expect(result.passed).toBe(false);
      const missingError = result.errors.find(
        (error: string) => error.includes("Pill") && error.includes("solid") && error.includes("missing"),
      );
      expect(missingError, `Expected a missing-in-doc error mentioning Pill.solid, got: ${JSON.stringify(result.errors, null, 2)}`).toBeDefined();
    });

    it("regenerating the bundle to match source restores the verifier", () => {
      const root = writeFixture();
      const componentsPath = path.join(root, ".superdesign/init/components.md");
      const mutated = "| `AccessibleDialog` | `src/components/ui/AccessibleDialog.tsx` | Modal | `title`, `onClose`, `open` |\n";
      fs.writeFileSync(
        componentsPath,
        fs.readFileSync(componentsPath, "utf8").replace(
          "| `AccessibleDialog` | `src/components/ui/AccessibleDialog.tsx` | Modal | `title`, `onClose` |",
          mutated,
        ),
      );
      expect(verifySuperdesignInit(root).passed).toBe(false);

      // Restore the correct row and confirm the verifier passes again.
      fs.writeFileSync(
        componentsPath,
        fs.readFileSync(componentsPath, "utf8").replace(
          mutated,
          "| `AccessibleDialog` | `src/components/ui/AccessibleDialog.tsx` | Modal | `title`, `onClose` |",
        ),
      );
      // Also rewrite routes.md source fingerprint to match the regenerated
      // state (the routes fingerprint changes when init content changes, but
      // here we're only changing the components.md content, so the existing
      // PLACEHOLDER already mismatches; regenerate by recomputing).
      // For test purposes we only assert the AccessibleDialog prop error is
      // gone after restoration. The full fingerprint is exercised in the
      // repository test (which uses the real routes.md).
      const result = verifySuperdesignInit(root);
      const dialogError = result.errors.find((error: string) => error.includes("AccessibleDialog"));
      expect(dialogError).toBeUndefined();
    });

    it("flags a source component listed in REQUIRED_COMPONENT_SOURCES but missing from the init bundle", () => {
      const root = writeFixture();
      // Wipe the AccessibleDialog row so it has no documented representation.
      const componentsPath = path.join(root, ".superdesign/init/components.md");
      const mutated = fs
        .readFileSync(componentsPath, "utf8")
        .replace(/\n\| `AccessibleDialog` \| `src\/components\/ui\/AccessibleDialog\.tsx`.*$/m, "");
      fs.writeFileSync(componentsPath, mutated);

      const result = verifySuperdesignInit(root);
      expect(result.passed).toBe(false);
      const missingDocError = result.errors.find((error: string) =>
        error.includes("AccessibleDialog.tsx") && error.includes("not represented"),
      );
      expect(
        missingDocError,
        `Expected a missing-representation error mentioning AccessibleDialog.tsx, got: ${JSON.stringify(result.errors, null, 2)}`,
      ).toBeDefined();
    });

    it("parses multi-component source files (primitives.tsx) by matching <Name>Props interface per row", () => {
      const root = writeFixture();
      // Pill is documented with `tone, solid`. The fixture has both as
      // optional in PillProps, so no drift. Add a fake prop to the SOURCE
      // and assert the verifier flags it.
      const primitivesPath = path.join(root, "src/components/ui/primitives.tsx");
      const original = fs.readFileSync(primitivesPath, "utf8");
      const mutated = original.replace(
        "export interface PillProps { tone?: string; solid?: boolean; }",
        "export interface PillProps { tone?: string; solid?: boolean; newProp?: boolean; }",
      );
      fs.writeFileSync(primitivesPath, mutated);

      const result = verifySuperdesignInit(root);
      expect(result.passed).toBe(false);
      const missingError = result.errors.find(
        (error: string) => error.includes("Pill") && error.includes("newProp"),
      );
      expect(
        missingError,
        `Expected a Pill.newProp missing-in-doc error, got: ${JSON.stringify(result.errors, null, 2)}`,
      ).toBeDefined();
    });
  });
});
