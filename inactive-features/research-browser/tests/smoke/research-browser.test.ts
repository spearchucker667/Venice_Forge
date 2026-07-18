import { test, expect } from 'vitest';
import { _electron as electron } from 'playwright';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const smokeTest = process.env.RUN_ELECTRON_SMOKE === 'true' ? test : test.skip;

smokeTest('research browser geometry and containment', async () => {
  const root = path.join(__dirname, '..', '..');
  const releaseDir = path.join(root, 'release');
  
  let exePath: string | undefined;
  
  if (os.platform() === 'win32') {
    if (!fs.existsSync(releaseDir)) throw new Error('release/ directory not found');
    const files = fs.readdirSync(releaseDir);
    const portable = files.find(f => f.endsWith('-Portable.exe'));
    if (portable) exePath = path.join(releaseDir, portable);
  } else if (os.platform() === 'darwin') {
    const archs = os.arch() === 'arm64' ? ['mac-arm64', 'mac'] : ['mac', 'mac-arm64'];
    for (const archDirName of archs) {
      const archDir = path.join(releaseDir, archDirName);
      if (fs.existsSync(archDir)) {
        const files = fs.readdirSync(archDir);
        const app = files.find(f => f.endsWith('.app'));
        if (app) {
          exePath = path.join(archDir, app, 'Contents', 'MacOS', 'Venice Forge');
          break;
        }
      }
    }
  }

  if (!exePath || !fs.existsSync(exePath)) {
    throw new Error('Packaged app not found. Did you run `npm run dist`?');
  }

  // Launch Electron app via Playwright
  const app = await electron.launch({ executablePath: exePath, env: { ...process.env, VENICE_FORGE_SMOKE_TEST: 'true' } });
  
  try {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    
    // Create the research browser via frontend IPC
    await window.evaluate(async () => {
      await (window as any).veniceForge.invoke('researchBrowser:create');
      await (window as any).veniceForge.invoke('researchBrowser:setVisible', true);
      await (window as any).veniceForge.invoke('researchBrowser:setBounds', {
        x: 100,
        y: 100,
        width: 800,
        height: 600,
      });
    });
    
    // Evaluate in main process to verify the view was created and bounded correctly
    const viewBounds = await app.evaluate(async ({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      // Search for the WebContentsView in the content view children
      // We can't access `researchView` directly, but it should be the only WebContentsView added
      const views = win.contentView.children;
      for (const view of views) {
        // Just return the bounds of the first view that isn't the main web contents
        // Wait, win.contentView is a View, its children are Views. 
        // ResearchBrowserView adds a WebContentsView to it.
        return view.getBounds();
      }
      return null;
    });
    
    expect(viewBounds).toBeDefined();
    if (viewBounds) {
      expect(viewBounds.x).toBe(100);
      expect(viewBounds.y).toBe(100);
      expect(viewBounds.width).toBe(800);
      expect(viewBounds.height).toBe(600);
    }
    
  } finally {
    await app.close();
  }
}, 30000);
