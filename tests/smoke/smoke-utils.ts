import { createRequire } from 'node:module';
import fs from 'node:fs';
import { _electron as electron, type ElectronApplication, type Page } from 'playwright';

const require = createRequire(import.meta.url);
const packagedExecutable = require('../../scripts/packaged-executable.cjs') as {
  findPackagedExecutable: (
    root: string,
    platform?: NodeJS.Platform,
    architecture?: string,
  ) => string | undefined;
};

export const findPackagedExecutable = packagedExecutable.findPackagedExecutable;

/** Run packaged Electron smokes when CI sets the env, or when a local package exists. */
export function shouldRunElectronSmoke(root = process.cwd()): boolean {
  if (process.env.RUN_ELECTRON_SMOKE === 'true') return true;
  const exePath = findPackagedExecutable(root);
  return Boolean(exePath && fs.existsSync(exePath));
}

export async function launchPackagedApp(executablePath: string, userDataDir: string, electronApplications: ElectronApplication[]): Promise<{
  electronApplication: ElectronApplication;
  page: Page;
  rendererErrors: string[];
  cspViolations: string[];
}> {
  const rendererErrors: string[] = [];
  const cspViolations: string[] = [];
  const electronApplication = await electron.launch({
    executablePath,
    args: [`--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
    timeout: 30_000,
  });
  electronApplications.push(electronApplication);
  const page = await electronApplication.firstWindow({ timeout: 30_000 });

  await page.exposeFunction('__reportCspViolation', (message: string) => {
    cspViolations.push(message);
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const detail = `${event.violatedDirective}; blockedURI=${event.blockedURI}; originalPolicy=${event.originalPolicy}`;
      (window as unknown as Record<string, (msg: string) => void>).__reportCspViolation(
        `securitypolicyviolation: ${detail}`,
      );
    });
  });

  page.on('pageerror', error => rendererErrors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    const text = message.text();
    if (message.type() === 'error') rendererErrors.push(`console: ${text}`);
    if (/content.security.policy|csp|violated.directive|refused to apply inline/i.test(text)) {
      cspViolations.push(`console: ${text}`);
    }
  });

  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(() => window.veniceForge?.isDesktop === true);
  return { electronApplication, page, rendererErrors, cspViolations };
}

export function bootstrapFailures(rendererErrors: string[]): string[] {
  return rendererErrors.filter(error =>
    /pageerror:|uncaught|unhandled|fatal application error|failed to mount react root|cannot find module|syntaxerror|referenceerror/i.test(error),
  );
}

export async function closeTrackedApplication(electronApplication: ElectronApplication, electronApplications: ElectronApplication[]): Promise<void> {
  const index = electronApplications.indexOf(electronApplication);
  if (index >= 0) electronApplications.splice(index, 1);
  await electronApplication.close();
}
