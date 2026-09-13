import { afterEach, expect, test } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { type ElectronApplication } from 'playwright';
import { findPackagedExecutable, launchPackagedApp, bootstrapFailures, shouldRunElectronSmoke } from './smoke-utils';

// CSP PROBE GUIDANCE (VF-AUD-20260912-C6-P1-001 / IMP-2):
// Never probe script-src/eval enforcement with `new Function()` (or `eval()`) inside
// `page.evaluate`. Playwright executes `page.evaluate` through CDP `Runtime.evaluate`,
// which Chromium exempts from the page's CSP, so eval-based probes always succeed and
// assert an impossible outcome. Probes must exercise real page-context vectors that the
// policy governs — inline event-handler attributes (`script-src-attr`), DOM-injected
// inline `<script>` elements, or `securitypolicyviolation` events observed in the page.

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

  const { page } = await launchPackagedApp(exePath, userDataDir, electronApplications);

  // Page-context probe (see the file-header CSP PROBE GUIDANCE): an inline
  // event-handler attribute is governed by script-src-attr and is blocked by the
  // production `script-src 'self'` policy. The handler, if allowed, runs
  // synchronously during the programmatic click; a block fires an async
  // `securitypolicyviolation`. The promise settles on whichever signal arrives
  // first, with a bounded timeout so the evaluate cannot hang.
  const probe = await page.evaluate(() => {
    const win = window as { __vfCspProbeExecuted?: boolean };
    return new Promise<{ executed: boolean; violation: boolean }>((resolve) => {
      const button = document.createElement('button');
      button.setAttribute('onclick', 'window.__vfCspProbeExecuted = true');
      document.body.appendChild(button);

      let settled = false;
      const settle = (violation: boolean): void => {
        if (settled) return;
        settled = true;
        document.removeEventListener('securitypolicyviolation', onViolation);
        button.remove();
        resolve({ executed: win.__vfCspProbeExecuted === true, violation });
      };
      const onViolation = (event: SecurityPolicyViolationEvent): void => {
        if (event.violatedDirective === 'script-src' || event.violatedDirective === 'script-src-attr') {
          settle(true);
        }
      };
      document.addEventListener('securitypolicyviolation', onViolation);

      button.click();
      if (win.__vfCspProbeExecuted === true) settle(false);
      else setTimeout(() => settle(false), 300);
    });
  });

  expect(probe.executed).toBe(false);
  expect(probe.violation).toBe(true);
}, 60_000);
