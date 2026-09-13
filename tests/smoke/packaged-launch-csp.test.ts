import { afterEach, expect, test } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { type ElectronApplication } from 'playwright';
import { findPackagedExecutable, launchPackagedApp, bootstrapFailures, shouldRunElectronSmoke } from './smoke-utils';

const smokeTest = shouldRunElectronSmoke() ? test : test.skip;
const temporaryDirectories: string[] = [];
const electronApplications: ElectronApplication[] = [];

afterEach(async () => {
  for (const app of electronApplications.splice(0)) {
    await app.close().catch(() => undefined);
  }
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

smokeTest('packaged Electron app launches without CSP style-src violations', async () => {
  const root = process.cwd();
  const exePath = findPackagedExecutable(root);

  if (!exePath || !fs.existsSync(exePath)) {
    throw new Error(`Packaged app not found for ${os.platform()}/${os.arch()}.`);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'venice-forge-electron-integration-'));
  temporaryDirectories.push(userDataDir);

  const run = await launchPackagedApp(exePath, userDataDir, electronApplications);

  expect(bootstrapFailures(run.rendererErrors)).toEqual([]);
  expect(
    run.cspViolations.filter(message => /style-src|refused to apply inline/i.test(message)),
  ).toEqual([]);
}, 60_000);

smokeTest('negative control: deliberately violating CSP style-src fails the assertion', async () => {
  const root = process.cwd();
  const exePath = findPackagedExecutable(root);

  if (!exePath || !fs.existsSync(exePath)) {
    throw new Error(`Packaged app not found for ${os.platform()}/${os.arch()}.`);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'venice-forge-smoke-user-data-'));
  temporaryDirectories.push(userDataDir);

  const { page, cspViolations } = await launchPackagedApp(exePath, userDataDir, electronApplications);

  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent = 'body { background: red; }';
    document.head.appendChild(style);
  });

  await page.waitForTimeout(500);

  expect(cspViolations.length).toBeGreaterThan(0);
  expect(cspViolations.some(v => v.includes('style-src') || v.includes('inline') || v.includes('securitypolicyviolation'))).toBe(true);
});

smokeTest('packaged renderer CSP blocks inline scripts', async () => {
  const root = process.cwd();
  const exePath = findPackagedExecutable(root);

  if (!exePath || !fs.existsSync(exePath)) {
    throw new Error(`Packaged app not found for ${os.platform()}/${os.arch()}.`);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'venice-forge-electron-csp-script-'));
  temporaryDirectories.push(userDataDir);

  const { page, cspViolations } = await launchPackagedApp(exePath, userDataDir, electronApplications);

  const inlineScriptAllowed = await page.evaluate(() => {
    try {
      // eslint-disable-next-line no-new-func -- CSP probe
      new Function('return 1')();
      return true;
    } catch {
      return false;
    }
  });

  expect(inlineScriptAllowed).toBe(false);
  expect(
    cspViolations.some((v) => /script-src|eval|unsafe-eval|securitypolicyviolation/i.test(v)) ||
      inlineScriptAllowed === false,
  ).toBe(true);
});
