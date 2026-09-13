import { afterEach, expect, test } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { type ElectronApplication } from 'playwright';
import { findPackagedExecutable, launchPackagedApp, bootstrapFailures, closeTrackedApplication, shouldRunElectronSmoke } from './smoke-utils';

const smokeTest = shouldRunElectronSmoke() ? test : test.skip;
const temporaryDirectories: string[] = [];
const electronApplications: ElectronApplication[] = [];

const FIRST_RUN_WARNING = '18+ Age Requirement & Content Warning';
const RESTORED_PROFILE_ID = 'restored-profile';
const RESTORED_PROFILE_PROBE_ID = 'electron-bootstrap-probe';

afterEach(async () => {
  for (const app of electronApplications.splice(0)) {
    await app.close().catch(() => undefined);
  }
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

smokeTest('packaged Electron crosses first-run onboarding and restores the trusted profile bootstrap', async () => {
  const root = process.cwd();
  const exePath = findPackagedExecutable(root);

  if (!exePath || !fs.existsSync(exePath)) {
    throw new Error(`Packaged app not found for ${os.platform()}/${os.arch()}.`);
  }

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'venice-forge-electron-integration-'));
  temporaryDirectories.push(userDataDir);

  const firstRun = await launchPackagedApp(exePath, userDataDir, electronApplications);
  await firstRun.page.getByText(FIRST_RUN_WARNING, { exact: false }).waitFor({ timeout: 30_000 });
  await firstRun.page.getByRole('button', { name: 'I understand and am 18+' }).click();
  await firstRun.page.getByRole('heading', { level: 3, name: 'Welcome to Venice Forge' }).waitFor();
  await firstRun.page.getByRole('button', { name: 'Continue' }).click();
  await firstRun.page.getByRole('heading', { level: 3, name: 'Profiles' }).waitFor();
  await firstRun.page.getByRole('button', { name: 'Continue' }).click();
  await firstRun.page.getByRole('heading', { level: 3, name: 'Secure by Default' }).waitFor();
  await firstRun.page.getByRole('button', { name: 'Continue' }).click();
  await firstRun.page.getByRole('heading', { level: 3, name: 'Family Safe Mode' }).waitFor();
  await firstRun.page.getByRole('button', { name: 'Get Started' }).click();
  await firstRun.page.getByRole('heading', { level: 2, name: 'Connect to Venice' }).waitFor();

  await firstRun.page.evaluate((restoredProfileId) => {
    const raw = window.localStorage.getItem('venice-profiles');
    if (!raw) throw new Error('The onboarding flow did not persist the profile store.');
    const persisted = JSON.parse(raw) as { state?: Record<string, unknown>; version?: number };
    persisted.state = {
      ...(persisted.state ?? {}),
      profiles: [
        { id: 'default', name: 'Default Profile', onboardingCompleted: true },
        { id: restoredProfileId, name: 'Restored Profile', onboardingCompleted: true },
      ],
      activeProfileId: restoredProfileId,
      globalOnboardingCompleted: true,
    };
    window.localStorage.setItem('venice-profiles', JSON.stringify(persisted));
    window.localStorage.removeItem('venice-active-profile-id');
  }, RESTORED_PROFILE_ID);

  expect(bootstrapFailures(firstRun.rendererErrors)).toEqual([]);
  expect(
    firstRun.cspViolations.filter(message => /style-src|refused to apply inline/i.test(message)),
  ).toEqual([]);
  await closeTrackedApplication(firstRun.electronApplication, electronApplications);

  const restoredRun = await launchPackagedApp(exePath, userDataDir, electronApplications);
  await restoredRun.page.getByRole('heading', { level: 2, name: 'Connect to Venice' }).waitFor({ timeout: 30_000 });
  expect(await restoredRun.page.getByText(FIRST_RUN_WARNING, { exact: false }).count()).toBe(0);
  expect(await restoredRun.page.getByRole('heading', { level: 3, name: 'Welcome to Venice Forge' }).count()).toBe(0);

  const restoredState = await restoredRun.page.evaluate(async ({ profileId, probeId }) => {
    const activeProfileId = window.localStorage.getItem('venice-active-profile-id');
    const persisted = JSON.parse(window.localStorage.getItem('venice-profiles') ?? '{}') as {
      state?: { activeProfileId?: unknown; globalOnboardingCompleted?: unknown };
    };
    const now = Date.now();
    const saveResult = await window.veniceForge!.chat.save({
      id: probeId,
      title: 'Electron bootstrap probe',
      createdAt: now,
      updatedAt: now,
      model: 'test-model',
      messages: [],
    });
    return {
      bridgeIsDesktop: window.veniceForge?.isDesktop === true,
      activeProfileId,
      persistedActiveProfileId: persisted.state?.activeProfileId,
      onboardingCompleted: persisted.state?.globalOnboardingCompleted,
      saveOk: saveResult.ok,
      requestedProfileId: profileId,
    };
  }, { profileId: RESTORED_PROFILE_ID, probeId: RESTORED_PROFILE_PROBE_ID });

  expect(restoredState).toEqual({
    bridgeIsDesktop: true,
    activeProfileId: RESTORED_PROFILE_ID,
    persistedActiveProfileId: RESTORED_PROFILE_ID,
    onboardingCompleted: true,
    saveOk: true,
    requestedProfileId: RESTORED_PROFILE_ID,
  });
  expect(
    fs.existsSync(path.join(
      userDataDir,
      'chat-history',
      'profiles',
      RESTORED_PROFILE_ID,
      `${RESTORED_PROFILE_PROBE_ID}.json`,
    )),
  ).toBe(true);
  expect(
    fs.existsSync(path.join(userDataDir, 'chat-history', `${RESTORED_PROFILE_PROBE_ID}.json`)),
  ).toBe(false);
  expect(bootstrapFailures(restoredRun.rendererErrors)).toEqual([]);
  expect(
    restoredRun.cspViolations.filter(message => /style-src|refused to apply inline/i.test(message)),
  ).toEqual([]);
}, 90_000);
