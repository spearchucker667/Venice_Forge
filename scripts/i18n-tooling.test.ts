// VF-I18N-REMEDIATION-20260725-01 regression guard
// @vitest-environment node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const extractor = require("./extract-i18n-keys.cjs") as {
  extractKeysFromAst: (filePath: string) => Array<{
    file: string;
    line: number;
    ns: string;
    key: string;
    fullKey: string;
    defaultValue: string | null;
  }>;
  VISIBLE_NAMESPACES: string[];
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const syncTool = require("./sync-catalogs.cjs") as {
  mergeTreeAdditive: (
    en: Record<string, unknown>,
    locale: Record<string, unknown>,
    prefix?: string,
  ) => [Record<string, unknown>, { added: number; skipped: number }];
  SENTINEL_PATTERENS: RegExp;
  MISSING_MARKER: RegExp;
};

// eslint-disable-next-line @typescript-eslint/no-require-imports
const verifier = require("./verify-i18n.cjs") as {
  runVerification: (opts: {
    locales?: string[];
    namespaces?: string[];
    resourcesDir?: string;
    docsDir?: string;
    docsRequired?: string[];
    skipSourceInventory?: boolean;
    writeStatus?: boolean;
    statusPath?: string;
    nativeReviewStatus?: { locales: Record<string, { status: string; reviewer: string | null; reviewedAt: string | null }> };
    identicalValueAllowlist?: Record<string, string[]>;
  }) => {
    ok: boolean;
    errors: string[];
    warnings: string[];
    coverageResults: Record<string, {
      pct: number;
      translated: number;
      total: number;
      sentinelValues: number;
      missingMarkers: number;
      identicalUnapproved: number;
    }>;
    status: { locales: Record<string, Record<string, unknown>> };
  };
  SENTINEL_PATTERN: RegExp;
  MISSING_MARKER_PATTERN: RegExp;
  EXPECTED_LOCALES: string[];
  EXPECTED_NAMESPACES: string[];
};

const tempRoots: string[] = [];

function makeProject(layout: Record<string, Record<string, string>>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "venice-i18n-"));
  tempRoots.push(root);
  const resourcesDir = path.join(root, "src", "i18n", "resources");
  const _docsDir = path.join(root, "docs", "i18n");
  for (const [locale, files] of Object.entries(layout)) {
    const localeResources = path.join(resourcesDir, locale);
    fs.mkdirSync(localeResources, { recursive: true });
    for (const [namespace, content] of Object.entries(files)) {
      const full = path.join(localeResources, `${namespace}.json`);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, "utf8");
    }
  }
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    fs.rmSync(tempRoots.pop() as string, { recursive: true, force: true });
  }
});

describe("extract-i18n-keys (TS Compiler API)", () => {
  it("captures t('ns:key', 'default') and honours useTranslation scoping", () => {
    const fixture = `
      import { useTranslation } from "react-i18next";

      export function Menu() {
        const { t } = useTranslation("navigation");
        const label = t("chat.title", "Chat");
        const tooltip = t("chat.tooltip", "Open chat");
        return { label, tooltip };
      }
    `;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "venice-extractor-"));
    tempRoots.push(tmp);
    fs.writeFileSync(path.join(tmp, "menu.tsx"), fixture, "utf8");
    const keys = extractor.extractKeysFromAst(path.join(tmp, "menu.tsx")).filter(
      (k: { ns: string }) => k.ns === "navigation",
    );
    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatchObject({
      ns: "navigation",
      key: "chat.title",
      defaultValue: "Chat",
    });
    expect(keys[1]).toMatchObject({
      ns: "navigation",
      key: "chat.tooltip",
      defaultValue: "Open chat",
    });
  });

  it("captures multi-line t(...) invocations and template-literal arguments", () => {
    const fixture = `
      import { useTranslation } from "react-i18next";
      export function Footer() {
        const { t } = useTranslation();
        return (
          t(
            "common.actions.save",
            "Save the document"
          ),
          t(\`common.status.working\`)
        );
      }
    `;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "venice-extractor-"));
    tempRoots.push(tmp);
    fs.writeFileSync(path.join(tmp, "footer.tsx"), fixture, "utf8");
    const keys = extractor.extractKeysFromAst(path.join(tmp, "footer.tsx"));
    expect(keys.map((k: { fullKey: string }) => k.fullKey).sort()).toEqual([
      "common:actions.save",
      "common:status.working",
    ]);
    const saveEntry = keys.find((k: { fullKey: string }) => k.fullKey === "common:actions.save");
    expect(saveEntry?.defaultValue).toBe("Save the document");
  });

  it("captures <Trans i18nKey='ns:key'> JSX attributes", () => {
    const fixture = `
      import { Trans } from "react-i18next";
      export function About() {
        return (
          <Trans i18nKey="common:about.intro" />
        );
      }
    `;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "venice-extractor-"));
    tempRoots.push(tmp);
    fs.writeFileSync(path.join(tmp, "about.tsx"), fixture, "utf8");
    const keys = extractor.extractKeysFromAst(path.join(tmp, "about.tsx"));
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatchObject({
      ns: "common",
      key: "about.intro",
      fullKey: "common:about.intro",
    });
  });

  it("captures i18next.t('key', 'default') and honours useTranslation({ keyPrefix })", () => {
    const fixture = `
      import i18next from "i18next";
      import { useTranslation } from "react-i18next";
      export function Settings() {
        const { t } = useTranslation("settings", { keyPrefix: "security" });
        return [
          t("password.policy", "Strong password required"),
          i18next.t("settings.security.mfa.label", "Two-factor auth"),
        ];
      }
    `;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "venice-extractor-"));
    tempRoots.push(tmp);
    fs.writeFileSync(path.join(tmp, "settings.tsx"), fixture, "utf8");
    const keys = extractor.extractKeysFromAst(path.join(tmp, "settings.tsx"));
    expect(keys.map((k: { fullKey: string }) => k.fullKey).sort()).toEqual([
      "settings:security.mfa.label",
      "settings:security.password.policy",
    ]);
  });

  it("ignores dynamic key expressions and TS-only files", () => {
    const fixture = `
      import { useTranslation } from "react-i18next";
      const dynamic = "common.subtitle";
      export function Module() {
        const { t } = useTranslation();
        return [
          t(dynamic),
          t(\`common.status.\${stage}\`),
          t(dynamicKey())
        ];
      }
    `;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "venice-extractor-"));
    tempRoots.push(tmp);
    fs.writeFileSync(path.join(tmp, "module.tsx"), fixture, "utf8");
    fs.writeFileSync(path.join(tmp, "module.d.ts"), "export declare const value: string;", "utf8");
    fs.writeFileSync(path.join(tmp, "module.test.tsx"), "t('common:demo')", "utf8");
    const keys = extractor.extractKeysFromAst(path.join(tmp, "module.tsx"));
    expect(keys).toHaveLength(0);
  });
});

describe("sync-catalogs mergeTreeAdditive", () => {
  it("adds missing keys as __MISSING__: placeholder and never overwrites existing translations", () => {
    const en = {
      a: { x: "X", y: "Y" },
      b: "B",
      c: { deep: { nested: "deep" } },
    };
    const existing = { a: { x: "EXISTING-X" } };
    const [out, stats] = syncTool.mergeTreeAdditive(en, existing);
    expect(stats.added).toBeGreaterThanOrEqual(3);
    expect((out.a as { x: string }).x).toBe("EXISTING-X");
    expect((out.b as string)).toBe("__MISSING__:b");
    expect(((out.c as { deep: { nested: string } }).deep.nested)).toBe("__MISSING__:c.deep.nested");
  });

  it("replaces `[XX]` sentinel values with __MISSING__ placeholders", () => {
    const en = { save: "Save" };
    const existing = { save: "[ES] Save (stale sentinel)" };
    const [out, stats] = syncTool.mergeTreeAdditive(en, existing);
    expect((out.save as string).startsWith("__MISSING__:")).toBe(true);
    expect(stats.added).toBe(1);
  });

  it("does not promote en-US when called for a non-allowed seed", () => {
    const en = { hi: "Hi" };
    const target = { hi: "[DE] Hi alt" };
    const [out] = syncTool.mergeTreeAdditive(en, target);
    expect((out.hi as string).startsWith("__MISSING__:")).toBe(true);
  });
});

describe("verify-i18n sentinel + missing-marker rejection", () => {
  it("rejects sentinel-prefixed locale values", () => {
    const root = makeProject({
      "en-US": { common: '{ "save": "Save", "cancel": { "x": "Cancel x" } }' },
      es: {
        common: '{ "save": "[ES] Save (sentinel)", "cancel": { "x": "Cancelar x" } }',
      },
      fr: { common: '{ "save": "Enregistrer", "cancel": { "x": "Annuler x" } }' },
    });
    const result = verifier.runVerification({
      locales: ["en-US", "es", "fr"],
      namespaces: ["common"],
      resourcesDir: path.join(root, "src", "i18n", "resources"),
      docsDir: path.join(root, "docs", "i18n"),
      docsRequired: [],
      skipSourceInventory: true,
      nativeReviewStatus: { locales: {} },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /sentinel/i.test(e) && /es/.test(e))).toBe(true);
    expect(result.coverageResults.fr.sentinelValues).toBe(0);
    expect(result.coverageResults.es.sentinelValues).toBe(1);
    expect(result.status.locales.es.catalogStatus).toBe("pending-translation");
    expect(result.status.locales.fr.catalogStatus).toBe("complete");
    expect(result.status.locales.fr.reviewStatus).toBe("first-pass-machine");
    expect(result.coverageResults.fr.translated).toBe(2);
  });

  it("rejects Tr: scaffolding as a sentinel", () => {
    const root = makeProject({
      "en-US": { common: '{ "saveAs": "Save As…" }' },
      es: { common: '{ "saveAs": "Tr: Save As…" }' },
    });
    const result = verifier.runVerification({
      locales: ["en-US", "es"],
      namespaces: ["common"],
      resourcesDir: path.join(root, "src", "i18n", "resources"),
      docsDir: path.join(root, "docs", "i18n"),
      docsRequired: [],
      skipSourceInventory: true,
      nativeReviewStatus: { locales: {} },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /sentinel/i.test(e) && /es/.test(e))).toBe(true);
    expect(result.coverageResults.es.sentinelValues).toBe(1);
  });

  it("rejects __MISSING__ markers with strict defaults", () => {
    const root = makeProject({
      "en-US": { common: '{ "save": "Save" }' },
      es: { common: '{ "save": "__MISSING__:save" }' },
    });
    const result = verifier.runVerification({
      locales: ["en-US", "es"],
      namespaces: ["common"],
      resourcesDir: path.join(root, "src", "i18n", "resources"),
      docsDir: path.join(root, "docs", "i18n"),
      docsRequired: [],
      skipSourceInventory: true,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /__MISSING__/.test(e) && /es/.test(e))).toBe(true);
    expect(result.coverageResults.es.missingMarkers).toBe(1);
  });

  it("flags interpolation variable mismatch", () => {
    const root = makeProject({
      "en-US": {
        chat: '{ "greeting": "Hi {{name}}, you have {{count}} messages" }',
      },
      es: {
        chat: '{ "greeting": "Hola {{nombre}}" }',
      },
    });
    const result = verifier.runVerification({
      locales: ["en-US", "es"],
      namespaces: ["chat"],
      resourcesDir: path.join(root, "src", "i18n", "resources"),
      docsDir: path.join(root, "docs", "i18n"),
      docsRequired: [],
      skipSourceInventory: true,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /interpolation mismatch/i.test(e))).toBe(true);
  });

  it("keeps machine-complete catalogs out of production until native review is recorded", () => {
    const root = makeProject({
      "en-US": {
        common:
          '{ "save": "Save", "Venice Forge label": "Venice Forge" }',
      },
      es: {
        common:
          '{ "save": "Guardar", "Venice Forge label": "Venice Forge" }',
      },
    });
    const result = verifier.runVerification({
      locales: ["en-US", "es"],
      namespaces: ["common"],
      resourcesDir: path.join(root, "src", "i18n", "resources"),
      docsDir: path.join(root, "docs", "i18n"),
      docsRequired: [],
      skipSourceInventory: true,
      nativeReviewStatus: { locales: {} },
    });
    expect(result.ok).toBe(true);
    expect(result.coverageResults.es.translated).toBe(2);
    expect(result.status.locales.es.catalogStatus).toBe("complete");
    expect(result.status.locales.es.reviewStatus).toBe("first-pass-machine");
  });

  it("records explicit native-review evidence separately from catalog status", () => {
    const root = makeProject({
      "en-US": { common: '{ "save": "Save" }' },
      es: { common: '{ "save": "Guardar" }' },
    });
    const result = verifier.runVerification({
      locales: ["en-US", "es"],
      namespaces: ["common"],
      resourcesDir: path.join(root, "src", "i18n", "resources"),
      docsDir: path.join(root, "docs", "i18n"),
      docsRequired: [],
      skipSourceInventory: true,
      nativeReviewStatus: {
        locales: {
          es: { status: "complete", reviewer: "Reviewer", reviewedAt: "2026-07-26" },
        },
      },
    });
    expect(result.status.locales.es.catalogStatus).toBe("complete");
    expect(result.status.locales.es.reviewStatus).toBe("complete");
    expect(result.status.locales.es.reviewer).toBe("Reviewer");
  });

  it("accepts an explicit locale-specific identical-value exception without promoting native review", () => {
    const root = makeProject({
      "en-US": { common: '{ "format": "JSON (.json)" }' },
      es: { common: '{ "format": "JSON (.json)" }' },
    });
    const result = verifier.runVerification({
      locales: ["en-US", "es"],
      namespaces: ["common"],
      resourcesDir: path.join(root, "src", "i18n", "resources"),
      docsDir: path.join(root, "docs", "i18n"),
      docsRequired: [],
      skipSourceInventory: true,
      nativeReviewStatus: { locales: {} },
      identicalValueAllowlist: { es: ["JSON (.json)"] },
    });
    expect(result.ok).toBe(true);
    expect(result.status.locales.es.catalogStatus).toBe("complete");
    expect(result.status.locales.es.reviewStatus).toBe("first-pass-machine");
  });
});
